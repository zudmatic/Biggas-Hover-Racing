import {test,expect} from '@playwright/test';
test('studio loads both ships, pauses, cycles and exposes shared controls',async({page})=>{
  test.setTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/propulsor-studio.html');await expect(page.locator('body')).toHaveAttribute('data-ready','true',{timeout:60000});
  await page.getByRole('button',{name:'Pausar',exact:true}).click();const t=await page.locator('body').getAttribute('data-time');await page.waitForTimeout(200);await expect(page.locator('body')).toHaveAttribute('data-time',t);
  await page.getByRole('button',{name:'Continuar',exact:true}).click();await page.locator('#mode').selectOption('cycle');await page.locator('#ship').selectOption('037');await expect(page.locator('body')).toHaveAttribute('data-ship','037');
  await expect(page.getByRole('slider',{name:'Turbulencia',exact:true})).toBeVisible();
  await page.screenshot({path:'.context/propulsor-studio.png'});await page.locator('#comic').uncheck();await page.waitForTimeout(150);expect(errors).toEqual([]);
});
