import {test,expect} from '@playwright/test';
import {openPlayground,set,setState,frames} from './helpers/playground.js';

for(const backend of ['webgpu','webgl2'])for(const [map,vehicle] of [['ruins','037'],['nexus','033']]){
  test(`comic ${backend} ${map} ${vehicle}`,async({page})=>{
    test.setTimeout(420000);
    const errors=await openPlayground(page,`vfx=off&backend=${backend}&map=${map}&vehicle=${vehicle}`);await frames(page);
    await expect(page.locator('body')).toHaveAttribute('data-comic','true');
    await page.screenshot({path:`test-results/playground-comic-day-${backend}-${map}.png`});
    await set(page,'Escena','Cómic',false);await frames(page);await expect(page.locator('body')).toHaveAttribute('data-comic','false');
    await set(page,'Escena','Cómic',true);
    for(const label of ['Puntos','Rayado','Contornos','Color cómic'])await set(page,'Escena',label,false);
    await frames(page);
    for(const label of ['Puntos','Rayado','Contornos','Color cómic'])await set(page,'Escena',label,true);
    await set(page,'Escena','Espacio trama','Pantalla');
    await set(page,'Escena','Noche',true);await set(page,'Escena','Faros',true);await setState(page,'acelerando');await frames(page);
    await page.setViewportSize({width:1000,height:720});await frames(page);
    await page.screenshot({path:`test-results/playground-comic-night-${backend}-${map}.png`});
    expect(errors).toEqual([]);
  });
}
