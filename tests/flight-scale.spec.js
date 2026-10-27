import {test,expect} from '@playwright/test';
import {launchFromLobby} from './helpers/flight.js';

test('scale changes live, restores the original and persists across flights',async({page})=>{
  test.setTimeout(120000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/simulator.html');await launchFromLobby(page);
  const app=page.locator('.flight-app');
  await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});
  await expect(app).toHaveAttribute('data-model-scale','0.75');
  await expect(page.getByRole('button',{name:'DialKit',exact:true})).toHaveAttribute('aria-expanded','true');
  await page.getByText('Tamaño · nave y piloto',{exact:true}).click();
  const slider=page.getByRole('slider',{name:'Escala',exact:true});
  await slider.focus();await page.keyboard.press('ArrowLeft');
  await expect(app).toHaveAttribute('data-model-scale','0.74');
  await page.screenshot({path:'test-results/flight-scale.png'});
  await page.getByRole('button',{name:'Tamaño original · 1,00'}).click();
  await expect(app).toHaveAttribute('data-model-scale','1.00');
  await page.reload();await launchFromLobby(page);
  await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});
  await expect(app).toHaveAttribute('data-model-scale','1.00');
  expect(errors).toEqual([]);
});
