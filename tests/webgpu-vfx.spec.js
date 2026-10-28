import {test,expect} from '@playwright/test';
const toggle=(page,name,on)=>page.locator('.dialkit-labeled-control').filter({has:page.locator('.dialkit-labeled-control-label',{hasText:new RegExp(`^${name}$`,'i')})}).getByRole('radio',{name:on?'On':'Off',exact:true}).click();
const select=async(page,name,value)=>{await page.locator('.dialkit-select-trigger').filter({has:page.locator('.dialkit-select-label',{hasText:new RegExp(`^${name}$`,'i')})}).click();await page.getByRole('option',{name:new RegExp(`^${value}$`,'i')}).click();};
const stats=page=>page.locator('body').getAttribute('data-vfx').then(JSON.parse);
for(const backend of ['webgpu','webgl2'])for(const [map,vehicle] of [['ruins','037'],['nexus','037']]){
  test(`VFX ${backend} ${map} ${vehicle}`,async({page})=>{
    test.setTimeout(240000);page.setDefaultTimeout(20000);const errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(`/webgpu-preview.html?backend=${backend}&map=${map}&vehicle=${vehicle}`);
    await expect.poll(async()=>(await stats(page))?.emitted??0,{timeout:120000}).toBeGreaterThan(10);
    expect((await stats(page)).palette).toBe('Rojo');
    await select(page,'Modo','Turbo');await expect.poll(async()=>(await stats(page)).palette).toBe('Azul');
    await toggle(page,'Recorrer',true);await toggle(page,'Derrape',true);
    await expect.poll(async()=>(await stats(page)).smoke,{timeout:60000}).toBeGreaterThan(0);
    await expect.poll(async()=>(await stats(page)).marks,{timeout:60000}).toBeGreaterThan(0);
    await page.getByRole('button',{name:'Soltar aceite',exact:true}).click();await expect.poll(async()=>(await stats(page)).oil,{timeout:60000}).toBeGreaterThan(0);
    await page.screenshot({path:`.context/vfx-${backend}-${map}.png`});
    await toggle(page,'Pausa',true);await page.waitForTimeout(300);const time=(await stats(page)).time;
    await page.waitForTimeout(400);expect((await stats(page)).time).toBe(time);await toggle(page,'Pausa',false);
    await page.getByText('Humo · comparación',{exact:true}).click();
    for(const style of ['Procedural','Mixto','Híbrido']){await select(page,'Estilo',style);await expect.poll(async()=>(await stats(page)).smoke,{timeout:30000}).toBeGreaterThan(0);}
    await toggle(page,'Cuatro ruedas',true);await toggle(page,'Derrape',false);await toggle(page,'Frenado',true);
    await page.getByText('Propulsor · WebGPU',{exact:true}).click();
    await toggle(page,'Fragmentos',false);await toggle(page,'Chispas lineales',false);await toggle(page,'Calor',false);
    await toggle(page,'Cómic',false);await page.setViewportSize({width:1000,height:740});
    const before=(await stats(page)).time;await expect.poll(async()=>(await stats(page)).time,{timeout:60000}).toBeGreaterThan(before+.15);
    await toggle(page,'Calor',true);await toggle(page,'Cómic',true);await select(page,'Modo','Soltar');
    await expect.poll(async()=>(await stats(page)).power,{timeout:60000}).toBeLessThan(.01);
    await toggle(page,'Activos',false);await expect.poll(async()=>(await stats(page)).enabled).toBe(false);
    expect((await stats(page)).smoke).toBe(0);expect((await stats(page)).oil).toBe(0);
    expect(errors).toEqual([]);
  });
}
