import {test,expect} from '@playwright/test';

for(const [backend,map,vehicle] of [['webgpu','ruins','037'],['webgl2','nexus','033'],['webgpu','mario-raceway','038'],['webgl2','mario-raceway','038']]){
 test(`driving ${backend} ${map}`,async({page})=>{
  test.setTimeout(240000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`/simulator.html?selection=map&renderer=${backend}&map=${map}&vehicle=${vehicle}&camera=klipp&pilot=${backend==='webgl2'&&vehicle==='038'?'zudmatic':'zud'}`);
  await page.getByRole('button',{name:'Volar',exact:true}).click();const app=page.locator('.flight-app');
  await expect(app).toHaveAttribute('data-ready','true',{timeout:120000});
  await expect(app).toHaveAttribute('data-backend',backend==='webgpu'?'WebGPU':'WebGL2');
  await expect(app).toHaveAttribute('data-phase','flying');await expect(app).toHaveAttribute('data-camera-system','Klipp');
  await page.locator('.flight-canvas').focus();await page.keyboard.down('KeyW');
  await expect.poll(async()=>Number(await app.getAttribute('data-speed')),{timeout:45000}).toBeGreaterThan(15);
  await page.keyboard.down('ShiftLeft');await expect(app).toHaveAttribute('data-boost-palette','Azul',{timeout:15000});await page.keyboard.up('ShiftLeft');
  await page.keyboard.down('KeyD');await page.keyboard.down('KeyE');
  await expect.poll(async()=>Number(await app.getAttribute('data-fx-air')),{timeout:20000}).toBeGreaterThan(0);
  for(const key of ['KeyW','KeyD','KeyE'])await page.keyboard.up(key);
  await page.keyboard.press('KeyR');await expect.poll(async()=>Number(await app.getAttribute('data-speed')),{timeout:10000}).toBeLessThan(1);
  await page.getByRole('button',{name:'Preparar prueba',exact:true}).click();await page.locator('.flight-canvas').focus();await page.keyboard.press('KeyQ');
  await expect.poll(async()=>Number(await app.getAttribute('data-oil-patches')),{timeout:15000}).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Iluminación nocturna',exact:true}).click();await page.getByRole('button',{name:'Faros',exact:true}).click();
  await page.getByRole('button',{name:'Cómic',exact:true}).click();await expect(app).toHaveAttribute('data-comic','false');
  await page.getByRole('button',{name:'Pausar vuelo',exact:true}).click();await expect(app).toHaveAttribute('data-phase','paused');
  await page.waitForTimeout(200);const time=await app.getAttribute('data-time');await page.waitForTimeout(350);expect(await app.getAttribute('data-time')).toBe(time);
  await page.selectOption('#flight-quality','performance');await expect(app).toHaveAttribute('data-quality','performance');
  await expect(app).toHaveAttribute('data-glow-samples','4',{timeout:20000});await expect(app).toHaveAttribute('data-post-samples','0');
  await page.getByRole('button',{name:'Continuar',exact:true}).click();await expect(app).toHaveAttribute('data-phase','flying');
  await page.getByRole('button',{name:'Cómic',exact:true}).click();await page.setViewportSize({width:1000,height:740});
  const before=Number(await app.getAttribute('data-frame'));await expect.poll(async()=>Number(await app.getAttribute('data-frame')),{timeout:15000}).toBeGreaterThan(before+5);
  await page.screenshot({path:`.context/driving-${backend}-${map}.png`});expect(errors).toEqual([]);
 });
}

test('WebGPU race countdown, pause and restart',async({page})=>{
 test.setTimeout(180000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/simulator.html?selection=map&renderer=webgpu&map=nexus&vehicle=033&mode=race');
 await page.getByRole('button',{name:'Correr',exact:true}).click();const app=page.locator('.flight-app');
 await expect(app).toHaveAttribute('data-ready','true',{timeout:120000});await expect(app).toHaveAttribute('data-phase','countdown');
 await page.getByRole('button',{name:'Pausar vuelo',exact:true}).click();await expect(app).toHaveAttribute('data-phase','paused');
 await page.getByRole('button',{name:'Continuar',exact:true}).click();await expect(app).toHaveAttribute('data-phase','flying',{timeout:15000});
 await page.locator('.flight-canvas').focus();await page.keyboard.down('KeyW');await expect.poll(async()=>Number(await app.getAttribute('data-time')),{timeout:15000}).toBeGreaterThan(.2);await page.keyboard.up('KeyW');
 await page.getByRole('button',{name:'Pausar vuelo',exact:true}).click();await page.locator('#flight-restart').click();await expect(app).toHaveAttribute('data-phase','countdown');
 expect(Number(await app.getAttribute('data-time'))).toBeLessThan(.2);expect(errors).toEqual([]);
});
