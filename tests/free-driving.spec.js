import {test,expect} from '@playwright/test';
import {launchFromLobby,openFlightOptions} from './helpers/flight.js';

for(const width of [1200,390])test(`only free driving remains at ${width}px, including old race links`,async({page})=>{
 test.setTimeout(90000);await page.setViewportSize({width,height:width===1200?800:844});await page.emulateMedia({reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/simulator.html?mode=race');
 await expect(page.getByText('Contrarreloj',{exact:true})).toHaveCount(0);
 await expect(page.locator('input[name=mode]')).toHaveCount(0);
 await launchFromLobby(page);const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});await expect(app).toHaveAttribute('data-phase','flying');
 expect(new URL(page.url()).searchParams.has('mode')).toBe(false);
 await expect(page.locator('.flight-header,.flight-race,.flight-countdown,.flight-target,#flight-pause,#flight-time,#flight-gates,#flight-best')).toHaveCount(0);
 await expect(page.locator('.flight-status')).toBeVisible();await expect(page.locator('#flight-pilot')).toHaveText('ZUD');await expect(page.locator('#flight-driving-state')).toHaveText('DETENIDO');
 await expect(page.locator('.flight-telemetry')).toBeVisible();await expect(page.locator('.flight-minimap')).toBeVisible();
 await page.keyboard.down('w');await expect.poll(async()=>Number(await app.getAttribute('data-gate')),{timeout:15000}).toBeGreaterThan(0);await page.keyboard.up('w');
 await expect(page.locator('#flight-driving-state')).toHaveText('EN MARCHA');await expect(page.locator('.flight-notice')).toBeHidden();await expect(app).toHaveAttribute('data-phase','flying');
 const statusBox=await page.locator('.flight-status').boundingBox(),oilBox=await page.locator('.flight-oil').boundingBox();expect(oilBox.y).toBeLessThan(width===1200?40:110);expect(oilBox.y>=statusBox.y+statusBox.height||oilBox.x>=statusBox.x+statusBox.width).toBe(true);
 await page.screenshot({path:`.context/free-driving-${width}.png`});
 await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Continuar',exact:true})).toBeFocused();
 await page.locator('.flight-controls summary').click();await expect(page.locator('.flight-controls-list')).toContainText('ESC');
 await page.locator('.flight-controls summary').click();await openFlightOptions(page);await expect(page.getByRole('link',{name:'Ir al hangar'})).toBeVisible();
 await page.getByRole('button',{name:'Reiniciar',exact:false}).click();await expect(app).toHaveAttribute('data-phase','flying');
 await expect(page.locator('.flight-countdown')).toHaveCount(0);await expect(page.locator('.flight-notice')).toBeHidden();expect(errors).toEqual([]);
});
