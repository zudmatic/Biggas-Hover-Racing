import {test,expect} from '@playwright/test';
import {openPlayground,set,setState,frames} from './helpers/playground.js';

for(const backend of ['webgpu','webgl2'])for(const [map,vehicle] of [['ruins','037'],['nexus','033']]){
  test(`base render ${backend} ${map} ${vehicle}`,async({page})=>{
    test.setTimeout(180000);await page.setViewportSize({width:1200,height:800});
    const errors=await openPlayground(page,`vfx=off&look=base&backend=${backend}&map=${map}&vehicle=${vehicle}`);
    await frames(page,1);
    await expect(page.locator('body')).toHaveAttribute('data-backend',backend==='webgpu'?'WebGPU':'WebGL2 · fallback');
    const stats=JSON.parse(await page.locator('body').getAttribute('data-material-stats'));expect(stats.textured).toBeGreaterThan(0);expect(stats.meshes).toBeGreaterThan(30);
    for(const [path,value] of [['Noche',true],['Faros',true],['Sombras',false],['Sombras',true]])await set(page,'Escena',path,value);
    await setState(page,'acelerando');await frames(page,10);
    await page.screenshot({path:`test-results/playground-base-${backend}-${map}.png`});expect(errors).toEqual([]);
  });
}
