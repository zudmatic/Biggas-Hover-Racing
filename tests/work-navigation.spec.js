import {test,expect} from '@playwright/test';
import {enter,target} from './helpers.js';

test.setTimeout(120000);
for(const trigger of ['laptop','navigation','keyboard'])test(`Work from ${trigger} keeps the room interactive without a gallery`,async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await enter(page);
  if(trigger==='laptop'){const p=await target(page,'work');await page.mouse.click(p.x,p.y);}
  else if(trigger==='navigation')await page.getByRole('link',{name:'Work',exact:true}).click();
  else await page.keyboard.press('6');
  const stage=page.locator('#stage');
  await expect(stage).toHaveAttribute('data-activity','typing');
  await expect(stage).toHaveAttribute('data-state','work');
  await expect(page).toHaveURL(/#work$/);
  await expect(page.locator('.work-gallery,.work-scroll-cue,.work-viewer')).toHaveCount(0);
  await expect(page.locator('#zud-canvas')).not.toHaveAttribute('inert','');
  const clock=await target(page,'clock');await page.mouse.click(clock.x,clock.y);
  await expect(page.locator('#clock-dialog')).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.locator('#clock-dialog')).not.toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(stage).toHaveAttribute('data-state','idle');
  await expect(stage).toHaveAttribute('data-section','home');
  await expect(page).not.toHaveURL(/#work$/);
  expect(errors).toEqual([]);
});

test('Work deep link and browser history preserve navigation without blocking other actions',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/#work');
  const stage=page.locator('#stage');
  await expect(stage).toHaveAttribute('data-activity','typing',{timeout:60000});
  await page.getByRole('link',{name:'Home',exact:true}).click();
  await expect(stage).toHaveAttribute('data-activity','idle');
  await page.goBack();await expect(stage).toHaveAttribute('data-activity','typing');
  await page.goForward();await expect(stage).toHaveAttribute('data-activity','idle');
  await page.keyboard.press('6');await expect(stage).toHaveAttribute('data-activity','typing');
  await page.keyboard.press('3');await expect(stage).toHaveAttribute('data-state','dance');
  await expect(page.locator('.work-gallery,.work-frame')).toHaveCount(0);
});
