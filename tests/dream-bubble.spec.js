import {test,expect} from '@playwright/test';
import {createDreamScene} from '../src/dream-bubble.js';
import {enter} from './helpers.js';

test('The 3D dream animates its entrance and rotation, and stays still with reduced motion',()=>{
  const dream=createDreamScene();
  expect(dream.cloud.scale.x).toBe(0);
  dream.update(.3);
  expect(dream.dots[0].scale.x).toBeGreaterThan(0);
  expect(dream.cloud.scale.x).toBe(0);
  dream.update(2);
  expect(dream.cake.scale.x).toBe(.7);
  const before=dream.turntable.rotation.y;
  dream.update(3);
  expect(dream.turntable.rotation.y).not.toBe(before);
  dream.update(2,true);
  expect(dream.cake.scale.x).toBe(.7);
  const still=dream.scene.toJSON();
  dream.update(9,true);
  expect(dream.scene.toJSON()).toEqual(still);
});

test('The mobile dream stays inside the stage and reuses its canvas after waking',async({page})=>{
  test.setTimeout(60000);
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await enter(page);
  const stage=page.locator('#stage'),thought=page.locator('#thought');
  await page.evaluate(()=>{
    const stage=document.querySelector('#stage');window.sleepEvents=[];
    new MutationObserver(records=>{
      for(const record of records){
        if(record.attributeName==='data-activity'&&stage.dataset.activity==='resting')window.sleepEvents.push({kind:'rest',time:performance.now()});
        if(record.attributeName==='data-dream'&&stage.dataset.dream==='cheesecake'&&window.sleepEvents.at(-1)?.kind!=='dream')window.sleepEvents.push({kind:'dream',time:performance.now()});
      }
    }).observe(stage,{attributes:true,attributeFilter:['data-activity','data-dream']});
  });
  const sleep=async()=>{
    await expect(stage).toHaveAttribute('data-targets',/sleep:/);
    const box=await page.locator('#zud-canvas').boundingBox();
    const target=(await stage.getAttribute('data-targets')).split(' ').find(s=>s.startsWith('sleep:')).split(':').slice(1).map(Number);
    await page.mouse.click(box.x+box.width*target[0]/100,box.y+box.height*target[1]/100);
    await expect(stage).toHaveAttribute('data-activity','resting');
    await expect(thought).toBeHidden();
    await page.waitForTimeout(1800);
    await expect(stage).toHaveAttribute('data-dream','none');
    await expect(thought).toBeHidden();
    await expect(stage).toHaveAttribute('data-dream','cheesecake',{timeout:6000});
    await expect(thought.locator('canvas')).toBeVisible();
    const delay=await page.evaluate(()=>{const events=window.sleepEvents;return events.at(-1).time-events.at(-2).time;});
    expect(delay).toBeGreaterThanOrEqual(2990);
    expect(delay).toBeLessThan(4500);
  };
  await sleep();
  const bounds=await stage.boundingBox(),bubble=await thought.boundingBox();
  expect(bubble.x).toBeGreaterThanOrEqual(bounds.x);
  expect(bubble.y).toBeGreaterThanOrEqual(bounds.y);
  expect(bubble.x+bubble.width).toBeLessThanOrEqual(bounds.x+bounds.width);
  const still=await thought.screenshot();
  await page.waitForTimeout(200);
  expect(await thought.screenshot()).toEqual(still);
  await page.keyboard.press('Escape');await expect(thought).toBeHidden();
  await sleep();await expect(thought.locator('canvas')).toHaveCount(1);
  expect(errors).toEqual([]);
});
