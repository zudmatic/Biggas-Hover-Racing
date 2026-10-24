import {test,expect} from '@playwright/test';

for(const backend of ['webgpu','webgl2'])test(`production drives without DialKit: ${backend}`,async({page},info)=>{
  test.skip(!info.config.metadata.production,'Run against npm run build with playwright.production.config.js');
  test.setTimeout(180000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`/?selection=map&vehicle=037&renderer=${backend}`);
  await page.getByRole('button',{name:'Volar',exact:true}).click();
  const app=page.locator('.flight-app');
  await expect(app).toHaveAttribute('data-ready','true',{timeout:90000});
  await expect(app).toHaveAttribute('data-model-scale','0.75');
  await expect(page.locator('[class*="dialkit"]')).toHaveCount(0);
  await page.locator('.flight-canvas').focus();await page.keyboard.down('KeyW');await page.keyboard.down('ShiftLeft');
  await expect(app).toHaveAttribute('data-boost-palette','Azul',{timeout:15000});
  await expect.poll(async()=>Number(await app.getAttribute('data-speed')),{timeout:20000}).toBeGreaterThan(10);
  await page.keyboard.up('ShiftLeft');await page.keyboard.up('KeyW');
  await page.keyboard.press('Escape');await expect(app).toHaveAttribute('data-phase','paused');
  await expect(page.locator('[class*="dialkit"]')).toHaveCount(0);
  await page.goto(`/webgpu-preview.html?backend=${backend}`);
  await expect(page.locator('body')).toHaveAttribute('data-ready','true',{timeout:90000});
  await expect(page.locator('[class*="dialkit"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
