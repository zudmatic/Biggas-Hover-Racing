import {test,expect} from '@playwright/test';

test('selection falls back automatically when WebGPU is unavailable',async({page})=>{
  test.setTimeout(120000);
  await page.addInitScript(()=>Object.defineProperty(navigator,'gpu',{value:undefined,configurable:true}));
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await page.getByRole('button',{name:'Jugar',exact:true}).click();
  const preview=page.locator('.lobby-preview-canvas');
  await expect(preview).toHaveAttribute('data-ready','true',{timeout:90000});
  await expect(preview).toHaveAttribute('data-backend','WebGL2');
  expect(errors).toEqual([]);
});

for(const backend of ['webgpu','webgl2'])test(`selection and hangar use the shared node renderer: ${backend}`,async({page})=>{
  test.setTimeout(240000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(backend==='webgpu'?'/':`/?renderer=${backend}`);await page.getByRole('button',{name:'Jugar',exact:true}).click();
  const preview=page.locator('.lobby-preview-canvas');
  await expect(preview).toHaveAttribute('data-ready','true',{timeout:90000});
  await expect(preview).toHaveAttribute('data-backend',backend==='webgpu'?'WebGPU':'WebGL2');
  await expect.poll(async()=>Number(await preview.getAttribute('data-frame')),{timeout:90000}).toBeGreaterThan(1);
  await page.getByRole('button',{name:'Confirmar Zud',exact:true}).click();
  await page.locator('[data-vehicle-choice="038"]').click();await expect(preview).toHaveAttribute('data-vehicle','038');
  await expect(preview).toHaveAttribute('data-ready','true',{timeout:60000});
  await page.getByRole('button',{name:'Papel',exact:true}).click();await expect(preview).toHaveAttribute('data-paper','false');
  await page.getByRole('button',{name:'Papel',exact:true}).click();await expect(preview).toHaveAttribute('data-paper','true');
  await page.screenshot({path:`.context/selection-${backend}.png`});
  await page.goto(`/spaceship.html?vehicle=038&pilot=zudmatic${backend==='webgl2'?'&renderer=webgl2':''}`);
  const hangar=page.locator('.ship-viewport');await expect(hangar).toHaveAttribute('data-ready','true',{timeout:90000});
  await expect(hangar).toHaveAttribute('data-backend',backend==='webgpu'?'WebGPU':'WebGL2');
  await expect.poll(async()=>Number(await hangar.getAttribute('data-frame')),{timeout:90000}).toBeGreaterThan(1);
  await page.getByLabel('Zudmatic al mando',{exact:true}).check();await page.getByLabel('Desarmar',{exact:true}).check();
  await page.getByLabel('Tiempo de la animación').fill('8');await expect(hangar).toHaveAttribute('data-altitude','1.150');
  await page.locator('#ship-comic').click();await expect(hangar).toHaveAttribute('data-comic','false');
  await page.locator('#ship-comic').click();await page.screenshot({path:`.context/hangar-${backend}.png`});
  expect(errors).toEqual([]);
});
