import {test,expect} from '@playwright/test';
import {launchFromLobby} from './helpers/flight.js';

test('floating tuning panel changes the nitro lens live and remains usable during pause',async({page})=>{
  test.setTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1440,height:900});await page.goto('/');await launchFromLobby(page);
  const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});
  const panel=page.locator('.flight-dials .dialkit-panel-inner');await expect(panel).toBeVisible();
  const bounds=await panel.boundingBox();expect(bounds.width).toBeGreaterThan(350);expect(bounds.height).toBeGreaterThan(450);
  expect(bounds.x).toBeGreaterThan(900);expect(bounds.y+bounds.height).toBeLessThanOrEqual(900);
  const speed=page.getByRole('slider',{name:'F O V por velocidad',exact:true});await speed.focus();await page.keyboard.press('Home');
  const nitro=page.getByRole('slider',{name:'F O V extra nitro',exact:true});await nitro.focus();await page.keyboard.press('End');
  await page.locator('.flight-canvas').focus();await page.keyboard.down('ShiftLeft');
  await expect.poll(async()=>Number(await app.getAttribute('data-fov')),{timeout:15000}).toBeGreaterThan(88);
  await page.keyboard.up('ShiftLeft');await expect.poll(async()=>Number(await app.getAttribute('data-fov'))).toBeLessThan(66);
  await page.keyboard.press('Escape');await expect(app).toHaveAttribute('data-phase','paused');await expect(panel).toBeVisible();
  await page.getByRole('button',{name:'Restablecer lente',exact:true}).click();
  await expect(nitro).toHaveAttribute('aria-valuenow','16');
  await page.screenshot({path:'.context/nitro-dialkit-desktop.png'});
  await page.setViewportSize({width:390,height:700});
  const mobile=await panel.boundingBox();expect(mobile.width).toBeLessThanOrEqual(390);expect(mobile.y+mobile.height).toBeLessThanOrEqual(700);
  expect(errors).toEqual([]);
});
