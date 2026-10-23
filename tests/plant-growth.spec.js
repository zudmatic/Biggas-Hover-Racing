import {test,expect} from '@playwright/test';
import {enter} from './helpers.js';

test('Water grows only the foliage to its original size and preserves the soil target',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {createRetroRoom}=await import('/src/retro-room.js');
    const room=createRetroRoom();await room.ready;
    const foliage=room.room.getObjectByName('Follaje de la planta');
    const start=foliage.scale.x,target=room.soilPoint.toArray();
    const leaf=foliage.getObjectByName('Brotes de la planta'),youngLeaf=leaf.scale.toArray(),youngPose=leaf.quaternion.clone();
    const model=foliage.getObjectByName('Bush_Common');
    const textured=!!model?.material.map&&model.material.alphaTest>0;
    for(let i=0;i<180;i++)room.update(false,i/60,0,{dt:1/60});
    const dry=foliage.scale.x;
    room.update(false,3,0,{watering:true,dt:1/60});
    for(let i=0;i<60;i++)room.update(false,3+i/60,0,{dt:1/60});
    const growing=foliage.scale.x;
    for(let i=0;i<600;i++)room.update(false,4+i/60,0,{dt:1/60,watering:i<180});
    const grown=foliage.scale.x;
    const stillRooted=foliage.position.y===.6&&JSON.stringify(target)===JSON.stringify(room.soilPoint.toArray());
    const reduced=createRetroRoom();reduced.update(false,0,0,{watering:true,reducedMotion:true});
    return {start,dry,growing,grown,stillRooted,textured,youngLeaf,matureLeaf:leaf.scale.toArray(),unfolded:youngPose.angleTo(leaf.quaternion)>.1,reduced:reduced.room.getObjectByName('Follaje de la planta').scale.x};
  });
  expect(result.start).toBe(.58);expect(result.dry).toBe(result.start);
  expect(result.growing).toBeGreaterThan(result.start);expect(result.growing).toBeLessThan(1);
  expect(result.grown).toBe(1);expect(result.stillRooted).toBe(true);expect(result.reduced).toBe(1);
  expect(result.textured).toBe(true);
  expect(result.youngLeaf[0]).toBeLessThan(1);expect(result.matureLeaf).toEqual([1,1,1]);expect(result.unfolded).toBe(true);
});

test('Clicking the plant starts growth after the character arrives to water it',async({page})=>{
  test.setTimeout(60000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await enter(page);
  const stage=page.locator('#stage');await expect(stage).toHaveAttribute('data-plant-growth','0.000');
  await page.waitForTimeout(800);
  await page.screenshot({path:'.context/plant-before-watering.png'});
  const bounds=await page.locator('#zud-canvas').boundingBox();
  const [,x,y]=(await stage.getAttribute('data-targets')).split(' ').find(t=>t.startsWith('water:')).split(':').map(Number);
  await page.mouse.click(bounds.x+bounds.width*x/100,bounds.y+bounds.height*y/100);
  await expect(stage).toHaveAttribute('data-state','water',{timeout:10000});
  await expect(stage).toHaveAttribute('data-plant-growth','1.000',{timeout:15000});
  await page.keyboard.press('Escape');await page.waitForTimeout(800);
  await expect(stage).toHaveAttribute('data-plant-growth','1.000');
  await page.screenshot({path:'.context/plant-after-watering.png'});
  expect(errors).toEqual([]);
});
