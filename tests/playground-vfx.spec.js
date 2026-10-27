import {test,expect} from '@playwright/test';
import {openPlayground,set,setState,vfx} from './helpers/playground.js';

for(const backend of ['webgpu','webgl2'])for(const [map,vehicle] of [['ruins','037'],['nexus','033']]){
  test(`VFX ${backend} ${map} ${vehicle}`,async({page})=>{
    test.setTimeout(300000);
    const errors=await openPlayground(page,`backend=${backend}&map=${map}&vehicle=${vehicle}`);
    await expect.poll(async()=>(await vfx(page))?.emitted??0,{timeout:120000}).toBeGreaterThan(10);
    expect((await vfx(page)).palette).toBe('Rojo');
    await setState(page,'turbo');await expect.poll(async()=>(await vfx(page)).palette).toBe('Azul');
    await setState(page,'derrape');
    await expect.poll(async()=>(await vfx(page)).smoke,{timeout:60000}).toBeGreaterThan(0);
    await expect.poll(async()=>(await vfx(page)).marks,{timeout:60000}).toBeGreaterThan(0);
    await page.evaluate(()=>window.playground.dropOil());await expect.poll(async()=>(await vfx(page)).oil,{timeout:60000}).toBeGreaterThan(0);
    await page.screenshot({path:`test-results/playground-vfx-${backend}-${map}.png`});
    await set(page,'Tiempo','Pausa',true);await page.waitForTimeout(300);const time=(await vfx(page)).time;
    await page.waitForTimeout(400);expect((await vfx(page)).time).toBe(time);await set(page,'Tiempo','Pausa',false);
    for(const style of ['Procedural','Mixto','Híbrido']){await set(page,'Humo','Estilo',style);await expect.poll(async()=>(await vfx(page)).smoke,{timeout:30000}).toBeGreaterThan(0);}
    await set(page,'Humo','Cuatro ruedas',true);await setState(page,'frenando');
    for(const name of ['Fragmentos','Chispas lineales','Calor'])await set(page,'Propulsor · WebGPU',name,false);
    await set(page,'Escena','Cómic',false);await page.setViewportSize({width:1000,height:740});
    const before=(await vfx(page)).time;await expect.poll(async()=>(await vfx(page)).time,{timeout:60000}).toBeGreaterThan(before+.15);
    await set(page,'Propulsor · WebGPU','Calor',true);await set(page,'Escena','Cómic',true);await setState(page,'soltar');
    await expect.poll(async()=>(await vfx(page)).power,{timeout:60000}).toBeLessThan(.01);
    await set(page,'Estado nave','VFX activos',false);await expect.poll(async()=>(await vfx(page)).enabled).toBe(false);
    expect((await vfx(page)).smoke).toBe(0);expect((await vfx(page)).oil).toBe(0);
    expect(errors).toEqual([]);
  });
}
