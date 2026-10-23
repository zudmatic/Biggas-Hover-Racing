import {test,expect} from '@playwright/test';
import {target,line} from './helpers.js';
import {CHARACTER_STORAGE} from '../src/character-settings.js';

async function enterRoom(page){
  await page.goto('/?look=normal');
  await expect(page.locator('body')).toHaveAttribute('data-house-ready','true',{timeout:45000});
}
async function clickProp(page,action){const point=await target(page,action);await page.mouse.click(point.x,point.y);}

test('mirror opens four hats, equips and saves each choice; the camera placeholder stays in the room',async({page})=>{
  test.setTimeout(120000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:960,height:720});
  await page.emulateMedia({reducedMotion:'reduce'});
  await enterRoom(page);
  await expect(page.locator('#stage')).not.toHaveAttribute('data-targets',/blog:/);
  const url=page.url();await clickProp(page,'photos');
  await expect(line(page)).toHaveText('Photos · Próximamente');
  expect(page.url()).toBe(url);
  const dialog=page.getByRole('dialog',{name:'Look',exact:true});
  for(const id of ['samurai_kasa','cloud_chef','crescent_wizard','beanie']){
    await clickProp(page,'look');await expect(dialog).toBeVisible();
    await expect(dialog.locator('.look-option')).toHaveCount(4);
    await dialog.locator(`[data-hat="${id}"]`).click();
    await expect(dialog).not.toBeVisible({timeout:20000});
    await expect(page.locator('#stage')).toHaveAttribute('data-hat',id);
    expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).settings.hatModel,CHARACTER_STORAGE)).toBe(id);
  }
  await clickProp(page,'look');await expect(dialog).toBeVisible();
  await expect(dialog.locator('.look-preview[data-ready="true"]')).toHaveCount(4);
  await expect(dialog.locator('canvas')).toHaveCount(1);
  await expect(dialog.locator('img, svg')).toHaveCount(0);
  await page.screenshot({path:'.context/look-picker-desktop.png'});
  const before=await page.locator('#stage').getAttribute('data-position-x');
  await page.keyboard.press('ArrowRight');await page.keyboard.press('3');
  expect(await page.locator('#stage').getAttribute('data-position-x')).toBe(before);
  await expect(page.locator('#stage')).toHaveAttribute('data-state','idle');
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
  await expect(page.locator('#zud-canvas')).toBeFocused();
  expect(errors).toEqual([]);
});

test('Look waits for the walk and an interrupted visit never opens the dialog',async({page})=>{
  test.setTimeout(90000);
  await page.setViewportSize({width:960,height:720});await enterRoom(page);
  await clickProp(page,'look');
  await expect(page.locator('#stage')).toHaveAttribute('data-activity','walking');
  await expect(page.locator('#look-dialog')).not.toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#stage')).toHaveAttribute('data-activity','idle',{timeout:25000});
  await expect(page.locator('#look-dialog')).not.toBeVisible();
  await clickProp(page,'look');
  await expect(page.locator('#look-dialog')).toBeVisible({timeout:30000});
  await expect(page.locator('#stage')).toHaveAttribute('data-activity','idle');
  const preview=page.locator('.look-preview').first();
  await expect(page.locator('.look-preview[data-ready="true"]')).toHaveCount(4);
  const rotation=await preview.getAttribute('data-rotation');
  await expect(preview).not.toHaveAttribute('data-rotation',rotation);
  await page.keyboard.press('Escape');
  const stopped=await preview.getAttribute('data-rotation');
  await page.waitForTimeout(100);
  await expect(preview).toHaveAttribute('data-rotation',stopped);
});

test('mobile selector fits, recovers from a failed load, and persists after reload',async({page})=>{
  test.setTimeout(90000);
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await enterRoom(page);
  await clickProp(page,'look');const dialog=page.locator('#look-dialog');await expect(dialog).toBeVisible();
  await expect(dialog.locator('.look-preview[data-ready="true"]')).toHaveCount(4);
  await page.screenshot({path:'.context/look-picker-mobile.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.route('**/models/hats/*.glb',route=>route.abort());
  await dialog.locator('[data-hat="samurai_kasa"]').click();
  await expect(dialog.getByRole('status')).toContainText('No se pudo cargar');
  await page.unroute('**/models/hats/*.glb');
  await dialog.locator('[data-hat="samurai_kasa"]').click();await expect(dialog).not.toBeVisible({timeout:20000});
  await page.reload();await expect(page.locator('#stage')).toHaveAttribute('data-hat','samurai_kasa',{timeout:30000});
});

test('floating hats share the scene print shader and keep transparent backgrounds',async({page})=>{
  test.setTimeout(90000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.setViewportSize({width:960,height:720});
  await page.emulateMedia({reducedMotion:'reduce'});await enterRoom(page);
  await clickProp(page,'look');
  await expect(page.locator('.look-preview[data-ready="true"]')).toHaveCount(4);
  const result=await page.evaluate(async()=>{
    const {retroStyle}=await import('/src/retro-style.js');
    const canvas=document.querySelector('.look-preview-canvas'),gl=canvas.getContext('webgl2');
    const sample=look=>{
      retroStyle.setLook(look);
      return new Promise(resolve=>requestAnimationFrame(()=>{
        const width=gl.drawingBufferWidth,height=gl.drawingBufferHeight,pixels=new Uint8Array(width*height*4);
        gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        const hats=Array.from({length:4},()=>({solid:0,color:0}));let transparent=0;
        for(let i=0;i<pixels.length;i+=4){
          if(!pixels[i+3])transparent++;
          if(pixels[i+3]<250)continue;
          const hat=hats[Math.min(3,Math.floor(((i/4)%width)/width*4))];hat.solid++;
          if(Math.max(pixels[i],pixels[i+1],pixels[i+2])-Math.min(pixels[i],pixels[i+1],pixels[i+2])>8)hat.color++;
        }
        resolve({hats,transparent,pixels});
      }));
    };
    const normal=await sample('normal'),comic=await sample('comic'),mono=await sample('mono');
    // Isolate the surface ink: changing looks alone also changes the fullscreen
    // grade, which previously concealed unconverted imported hat materials.
    retroStyle.setLook('comic');
    const strength=retroStyle.uniforms.retroStrength.value;
    retroStyle.uniforms.retroStrength.value=0;const noInk=await sample('comic');
    retroStyle.uniforms.retroStrength.value=strength;const ink=await sample('comic');
    const inkChanged=[0,0,0,0],width=gl.drawingBufferWidth;
    for(let i=0;i<ink.pixels.length;i+=4)if(ink.pixels[i+3]>250&&noInk.pixels[i+3]>250&&Math.abs(ink.pixels[i]-noInk.pixels[i])+Math.abs(ink.pixels[i+1]-noInk.pixels[i+1])+Math.abs(ink.pixels[i+2]-noInk.pixels[i+2])>6)
      inkChanged[Math.min(3,Math.floor(((i/4)%width)/width*4))]++;
    let changed=0;
    for(let i=0;i<normal.pixels.length;i+=4)if(normal.pixels[i+3]>250&&comic.pixels[i+3]>250&&Math.abs(normal.pixels[i]-comic.pixels[i])+Math.abs(normal.pixels[i+1]-comic.pixels[i+1])+Math.abs(normal.pixels[i+2]-comic.pixels[i+2])>8)changed++;
    return {normal:{hats:normal.hats,transparent:normal.transparent},comic:{hats:comic.hats,transparent:comic.transparent},mono:{hats:mono.hats,transparent:mono.transparent},changed,inkChanged};
  });
  expect(result.changed).toBeGreaterThan(100);
  for(const changed of result.inkChanged)expect(changed).toBeGreaterThan(20);
  for(const look of ['normal','comic','mono']){
    expect(result[look].transparent).toBeGreaterThan(1000);
    for(const hat of result[look].hats){expect(hat.solid).toBeGreaterThan(100);if(look==='mono')expect(hat.color).toBe(0);}
  }
  expect(result.normal.hats[0].color).toBeGreaterThan(100);
  expect(result.normal.hats[3].color).toBeGreaterThan(100);
  await page.evaluate(async()=>{const {retroStyle}=await import('/src/retro-style.js');retroStyle.setLook('mono');});
  await page.screenshot({path:'.context/look-picker-shader-mono.png'});
  await page.evaluate(async()=>{const {retroStyle}=await import('/src/retro-style.js');retroStyle.setLook('comic');});
  await page.screenshot({path:'.context/look-picker-shader-comic.png'});
  expect(errors).toEqual([]);
});
