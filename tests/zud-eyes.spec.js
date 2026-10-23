import {expandCharacterSections} from './helpers/character-editor.js';
import {test,expect} from '@playwright/test';
import {Raycaster,Vector3} from 'three';
import {createZudModel} from '../src/zud-model.js';
import {createZudAnimator} from '../src/zud-animation.js';
import {CHARACTER_STORAGE,normalizeCharacterSettings} from '../src/character-settings.js';
import {EYE_DEFAULTS} from '../src/eye-settings.js';

const field=(page,key)=>page.locator(`[data-setting="${key}"]`);

test('legacy characters receive the new eye defaults and imported eye controls stay bounded',()=>{
  expect(normalizeCharacterSettings({})).toMatchObject(EYE_DEFAULTS);
  expect(normalizeCharacterSettings({eyeOpening:2,eyeTilt:-90,pupilSize:9,gazeX:-4,gazeY:8,eyeDepth:.8,eyeBlink:'yes'}))
    .toMatchObject({eyeOpening:1,eyeTilt:-15,pupilSize:1.5,gazeX:-1,gazeY:1,eyeDepth:.05,eyeBlink:true});
});

test('circular pupils stay inside the aperture at extreme sizes, angles and gaze directions',()=>{
  const model=createZudModel({curve:1}),ray=new Raycaster();model.root.updateMatrixWorld(true);
  for(const opening of [.2,.6,1])for(const tilt of [-15,40])for(const gaze of [-1,1]) {
    const settings={eyeOpening:opening,eyeTilt:tilt,pupilSize:1.5,gazeX:gaze,gazeY:-gaze};
    model.eyeController.configure(settings);
    for(const eye of model.eyes.children) {
      const pupil=eye.getObjectByName('Pupila'),white=eye.getObjectByName('Blanco del ojo'),p=pupil.geometry.attributes.position;
      let maxRadiusSquared=0;
      for(let i=0;i<p.count;i++) {
        const side=Math.sign(eye.position.x);
        const dx=p.getX(i)-(-side*.025+gaze*.12),dy=p.getY(i)-(.005-gaze*.115);
        maxRadiusSquared=Math.max(maxRadiusSquared,dx*dx+dy*dy);
      }
      expect(maxRadiusSquared).toBeLessThanOrEqual(.18*.18+1e-6);
      for(let i=0;i<p.count;i+=39) {
        const center=new Vector3();for(let k=0;k<3;k++)center.add(new Vector3().fromBufferAttribute(p,i+k));
        center.divideScalar(3).applyMatrix4(pupil.matrixWorld);ray.set(new Vector3(center.x,center.y,4),new Vector3(0,0,-1));
        const hit=ray.intersectObject(white)[0];
        expect(hit,`pupil escaped aperture: ${opening}, ${tilt}, ${gaze}`).toBeTruthy();
        expect(center.z-hit.point.z,'white surface occludes pupil').toBeGreaterThan(0);
      }
    }
  }
  model.dispose();
});

test('lids close and reopen without scaling the eyes or reallocating their GPU buffers',()=>{
  const model=createZudModel(),animator=createZudAnimator(model),buffers=model.eyes.children.flatMap(eye=>eye.children.map(mesh=>mesh.geometry.attributes.position.array));
  for(let i=0;i<40;i++)animator.update({blink:true,dt:1/60});
  for(const eye of model.eyes.children) {
    expect(eye.scale.toArray()).toEqual([1,1,1]);expect(eye.position.z).toBe(0);
    expect(eye.getObjectByName('Blanco del ojo').visible).toBe(false);expect(eye.getObjectByName('Pupila').visible).toBe(false);
    expect(eye.getObjectByName('Párpado cerrado').visible).toBe(true);
  }
  for(let i=0;i<40;i++)animator.update({dt:1/60});
  for(const eye of model.eyes.children){expect(eye.getObjectByName('Blanco del ojo').visible).toBe(true);expect(eye.getObjectByName('Pupila').visible).toBe(true);}
  let index=0;for(const eye of model.eyes.children)for(const mesh of eye.children)expect(mesh.geometry.attributes.position.array).toBe(buffers[index++]);
  model.dispose();
});

test('eye controls survive export, reload and import; comic and mobile preview stay usable',async({page})=>{
  test.setTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/?debug=character');await expect(page.locator('.lab-viewport')).toHaveAttribute('data-ready','true',{timeout:20000});await expandCharacterSections(page);
  await field(page,'eyeBlink').uncheck();
  for(const [key,value] of Object.entries({eyeOpening:.8,eyeTilt:18,pupilSize:1.2,gazeX:.7,gazeY:.2,eyeDepth:.025}))await field(page,key).fill(String(value));
  await field(page,'meshQuality').fill('100');await field(page,'comicShader').check();
  await expect.poll(()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).settings.gazeX,CHARACTER_STORAGE)).toBe(.7);
  await page.reload();await expandCharacterSections(page);await expect(field(page,'gazeX')).toHaveValue('0.7');await expect(field(page,'eyeDepth')).toHaveValue('0.025');await expect(field(page,'comicShader')).toBeChecked();
  const downloading=page.waitForEvent('download');await page.locator('#lab-export').click();let json='';for await(const chunk of await (await downloading).createReadStream())json+=chunk;
  expect(JSON.parse(json).settings).toMatchObject({eyeOpening:.8,eyeTilt:18,pupilSize:1.2,gazeX:.7,gazeY:.2,eyeDepth:.025,eyeBlink:false});
  await page.locator('#lab-eye-reset').click();await expect(field(page,'gazeX')).toHaveValue('0');await expect(field(page,'eyeOpening')).toHaveValue(String(EYE_DEFAULTS.eyeOpening));await expect(field(page,'meshQuality')).toHaveValue('100');
  await page.locator('#lab-import-file').setInputFiles({name:'eyes.json',mimeType:'application/json',buffer:Buffer.from(json)});
  await expect(field(page,'gazeX')).toHaveValue('0.7');await expect(field(page,'eyeBlink')).not.toBeChecked();
  await field(page,'eyeOpening').fill('0');await expect(page.locator('.lab-viewport')).toHaveAttribute('data-eye-aperture','0.000');
  await field(page,'eyeOpening').fill('0.8');await page.getByRole('button',{name:'Probar parpadeo'}).click();
  await expect.poll(async()=>Number(await page.locator('.lab-viewport').getAttribute('data-eye-aperture'))).toBeLessThan(.75);
  await expect.poll(async()=>Number(await page.locator('.lab-viewport').getAttribute('data-eye-aperture'))).toBeGreaterThan(.79);
  await page.locator('.lab-panel').evaluate(el=>el.scrollTop=0);await page.screenshot({path:'.context/eyes/lab-eyes-desktop.png'});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'.context/eyes/lab-eyes-mobile.png',fullPage:true});
  expect(errors).toEqual([]);
});

test('the eye whites stay bright and neutral in darkness and under red or blue scene lights',async({page})=>{
  test.setTimeout(60000);
  await page.goto('/?debug=character');await expect(page.locator('.lab-viewport')).toHaveAttribute('data-ready','true',{timeout:30000});await expandCharacterSections(page);
  const result=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {createZudModel}=await import('/src/zud-model.js');
    const {createCharacterComic}=await import('/src/character-comic.js');
    const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(320,320);
    const scene=new THREE.Scene(),model=createZudModel();model.root.position.y=0;scene.add(model.root);
    const camera=new THREE.PerspectiveCamera(30,1,.01,20);camera.position.set(0,.42,5.5);camera.lookAt(0,.4,0);
    const light=new THREE.DirectionalLight(0xffffff,0);light.position.set(2,4,3);scene.add(light);
    const comic=createCharacterComic(renderer),gl=renderer.getContext();
    const render=(color,intensity)=>{
      light.color.set(color);light.intensity=intensity;comic.render(scene,camera,'#26232d');
      const pixels=new Uint8Array(320*320*4);gl.readPixels(0,0,320,320,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;
    };
    const dark=render(0xffffff,0),samples=[];
    // With no lights, the only bright surface is the sclera. Exclude the
    // antialiased edges before checking the same pixels under colored light.
    for(let y=1;y<319;y++)for(let x=1;x<319;x++) {
      const i=(y*320+x)*4;
      if([i,i-4,i+4,i-1280,i+1280].every(k=>Math.min(...dark.slice(k,k+3))>215))samples.push(i);
    }
    const colors=[dark,render(0xff2020,4),render(0x2030ff,4)].map(pixels=>{
      const mean=[0,0,0];for(const i of samples)for(let c=0;c<3;c++)mean[c]+=pixels[i+c]/samples.length;return mean;
    });
    comic.dispose();model.dispose();renderer.dispose();return {count:samples.length,colors};
  });
  expect(result.count).toBeGreaterThan(100);
  for(const channels of result.colors) {
    expect(Math.min(...channels)).toBeGreaterThan(215);
    expect(Math.max(...channels)-Math.min(...channels)).toBeLessThan(18);
    channels.forEach((value,i)=>expect(Math.abs(value-result.colors[0][i])).toBeLessThan(5));
  }
});
