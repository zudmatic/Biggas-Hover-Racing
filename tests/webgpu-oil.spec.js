import {test,expect} from '@playwright/test';
import {launchFromLobby} from './helpers/flight.js';
test('WebGPU bot lays oil ahead of the player; player slows and recovers',async({page})=>{
  test.setTimeout(180000);await page.goto('/simulator.html?renderer=webgpu');await launchFromLobby(page);
  const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:120000});
  // Use a continuous trail and a fixed speed so this checks contact/recovery,
  // independently of the currently selected art-direction defaults.
  await page.getByText('Aceite · prueba',{exact:true}).click();
  await page.getByRole('button',{name:'Volver al clásico',exact:true}).click();
  const botSpeed=page.getByRole('slider',{name:'Velocidad Bot',exact:true});
  await botSpeed.focus();await page.keyboard.press('Home');
  for(let i=0;i<14;i++)await page.keyboard.press('ArrowRight');
  await expect(botSpeed).toHaveAttribute('aria-valuenow','22');
  await page.getByRole('button',{name:'Bot tira aceite',exact:true}).click();
  await expect(app).toHaveAttribute('data-oil-source','bot');
  await expect(app).toHaveAttribute('data-oil-contact','true',{timeout:15000});
  await expect.poll(async()=>Number(await app.getAttribute('data-speed')),{timeout:10000}).toBeLessThan(25);
  await expect(page.locator('.oil-player-status')).toContainText('EN ACEITE');
  await page.keyboard.down('Space');
  await page.screenshot({path:'test-results/oil-player-slow.png'});
  await expect(app).toHaveAttribute('data-oil-contact','false',{timeout:20000});
  await expect.poll(async()=>Number(await app.getAttribute('data-oil-factor')),{timeout:10000}).toBeGreaterThan(.98);await page.keyboard.up('Space');
});

test('WebGL2 mobile Oliva can deploy oil and disable the bot without overlapping driving controls',async({page})=>{
  test.setTimeout(180000);await page.setViewportSize({width:390,height:844});await page.goto('/simulator.html?vehicle=037&renderer=webgl2');await launchFromLobby(page);
  const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:120000});await expect(app).toHaveAttribute('data-vehicle','037');
  await page.getByRole('button',{name:'Preparar prueba',exact:true}).click();await page.getByRole('button',{name:'Soltar aceite'}).click();
  await expect.poll(async()=>Number(await app.getAttribute('data-bot-oil-hits')),{timeout:20000}).toBeGreaterThan(0);
  await page.getByLabel('Bot de prueba',{exact:true}).uncheck();await expect(page.locator('.oil-bot-status')).toHaveText('Bot desactivado');
  const button=await page.locator('.oil-use').boundingBox(),drive=await page.locator('.flight-touch').boundingBox();expect(button.y+button.height).toBeLessThan(drive.y);
  const point={x:button.x+button.width/2,y:button.y+button.height/2};expect(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.closest('.oil-use')!==null,point)).toBe(true);
  await page.screenshot({path:'test-results/oil-mobile.png'});
});
