import {test,expect} from '@playwright/test';
for(const backend of ['webgpu','webgl','webgl2'])for(const [map,vehicle] of [['ruins','037'],['nexus','033']]){
 test(`base render ${backend} ${map} ${vehicle}`,async({page})=>{
  test.setTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.setViewportSize({width:1200,height:800});
  await page.goto(`/webgpu-preview.html?vfx=off&look=base&backend=${backend}&map=${map}&vehicle=${vehicle}`);
  await expect(page.locator('body')).toHaveAttribute('data-ready','true',{timeout:60000});
  await expect.poll(()=>page.locator('body').getAttribute('data-frame')).not.toBeNull();
  await expect(page.locator('body')).toHaveAttribute('data-backend',backend==='webgpu'?'WebGPU':backend==='webgl'?'WebGL original':'WebGL2 · fallback');
  const stats=JSON.parse(await page.locator('body').getAttribute('data-material-stats'));expect(stats.textured).toBeGreaterThan(0);expect(stats.meshes).toBeGreaterThan(30);
  const toggle=async(name,on)=>page.locator('.dialkit-labeled-control').filter({has:page.locator('.dialkit-labeled-control-label',{hasText:new RegExp('^'+name+'$')})}).getByRole('radio',{name:on?'On':'Off',exact:true}).click();
  await toggle('Noche',true);await toggle('Faros',true);await toggle('Sombras',false);await toggle('Sombras',true);await toggle('Recorrer',true);
  const before=Number(await page.locator('body').getAttribute('data-frame'));await expect.poll(async()=>Number(await page.locator('body').getAttribute('data-frame'))).toBeGreaterThan(before+10);
  await page.screenshot({path:`.context/base-${backend}-${map}.png`});expect(errors).toEqual([]);
 });
}
