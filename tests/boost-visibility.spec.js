import {test,expect} from '@playwright/test';

for(const backend of ['webgpu','webgl2'])test(`boost accents survive multiple frames at racing speed: ${backend}`,async({page})=>{
  test.setTimeout(180000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`/simulator.html?selection=map&map=nexus&vehicle=038&renderer=${backend}&camera=klipp`);
  await page.getByRole('button',{name:'Volar',exact:true}).click();const app=page.locator('.flight-app');
  await expect(app).toHaveAttribute('data-ready','true',{timeout:90000});
  await page.locator('.flight-canvas').focus();await page.keyboard.down('KeyW');
  await expect.poll(async()=>Number(await app.getAttribute('data-speed')),{timeout:30000}).toBeGreaterThan(40);
  const read=async()=>JSON.parse(await app.getAttribute('data-boost-particles'));
  const normal=await read();normal.lifetimes.forEach(life=>expect(life*.85).toBeGreaterThan(4/60));
  normal.emitted.forEach(count=>expect(count).toBeGreaterThan(5));
  await page.screenshot({path:`.context/boost-accents-normal-${backend}.png`});
  await page.keyboard.down('ShiftLeft');await expect(app).toHaveAttribute('data-boost-palette','Azul');
  await expect.poll(async()=>Number(await app.getAttribute('data-speed')),{timeout:30000}).toBeGreaterThan(60);
  const turbo=await read();turbo.lifetimes.forEach(life=>expect(life*.85).toBeGreaterThan(4/60));
  turbo.emitted.forEach((count,i)=>expect(count).toBeGreaterThan(normal.emitted[i]));
  await page.screenshot({path:`.context/boost-accents-turbo-${backend}.png`});
  await page.keyboard.up('ShiftLeft');await page.keyboard.up('KeyW');expect(errors).toEqual([]);
});
