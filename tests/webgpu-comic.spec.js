import {test,expect} from '@playwright/test';

const toggle=(page,name,on)=>page.locator('.dialkit-labeled-control')
  .filter({has:page.locator('.dialkit-labeled-control-label',{hasText:new RegExp(`^${name}$`)})})
  .getByRole('radio',{name:on?'On':'Off',exact:true}).click();
async function frames(page){
  const before=Number(await page.locator('body').getAttribute('data-frame'));
  await expect.poll(async()=>Number(await page.locator('body').getAttribute('data-frame')),{timeout:90000}).toBeGreaterThan(before+3);
}
for(const backend of ['webgpu','webgl2'])for(const [map,vehicle] of [['ruins','037'],['nexus','033']]){
  test(`comic ${backend} ${map} ${vehicle}`,async({page})=>{
    test.setTimeout(240000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(`/webgpu-preview.html?vfx=off&backend=${backend}&map=${map}&vehicle=${vehicle}`);
    await expect(page.locator('body')).toHaveAttribute('data-ready','true',{timeout:90000});await frames(page);
    await expect(page.locator('body')).toHaveAttribute('data-comic','true');
    await page.screenshot({path:`.context/comic-day-${backend}-${map}.png`});
    await toggle(page,'Cómic',false);await frames(page);await expect(page.locator('body')).toHaveAttribute('data-comic','false');
    await toggle(page,'Cómic',true);await toggle(page,'Puntos',false);await toggle(page,'Rayado',false);await toggle(page,'Contornos',false);await toggle(page,'Color cómic',false);await frames(page);
    for(const label of ['Puntos','Rayado','Contornos','Color cómic'])await toggle(page,label,true);
    await page.locator('.dialkit-select-trigger').filter({has:page.locator('.dialkit-select-label',{hasText:/^Espacio trama$/i})}).click();
    await page.getByRole('option',{name:'Pantalla',exact:true}).click();
    await toggle(page,'Noche',true);await toggle(page,'Faros',true);await toggle(page,'Recorrer',true);await frames(page);
    await page.setViewportSize({width:1000,height:720});await frames(page);
    await page.screenshot({path:`.context/comic-night-${backend}-${map}.png`});
    expect(errors).toEqual([]);
  });
}

test('comic preserves original GLSL brightness and palette',async({page})=>{
  test.setTimeout(180000);const samples=[];
  await page.setViewportSize({width:1440,height:900});
  for(const backend of ['webgl','webgpu']){
    await page.goto(`/webgpu-preview.html?vfx=off&backend=${backend}`);
    await expect(page.locator('body')).toHaveAttribute('data-ready','true',{timeout:90000});await frames(page);
    // Sample road and buildings away from the HUD. This catches color-space
    // regressions without requiring identical GPU rasterization or ink pixels.
    const png=await page.screenshot({clip:{x:420,y:270,width:650,height:560}});
    samples.push(await page.evaluate(async bytes=>{
      const image=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/png'}));
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
      const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const {data}=ctx.getImageData(0,0,canvas.width,canvas.height);
      const rgb=[0,0,0];for(let i=0;i<data.length;i+=4)for(let c=0;c<3;c++)rgb[c]+=data[i+c];
      image.close();return rgb.map(v=>v/(data.length/4)/255);
    },Array.from(png)));
  }
  for(let c=0;c<3;c++)expect(Math.abs(samples[0][c]-samples[1][c])).toBeLessThan(.06);
});
