import {test,expect} from '@playwright/test';
import {enter} from './helpers.js';
import {dayCycle,wrapMinutes,handDelta} from '../src/day-cycle.js';

test('Dial unwraps across twelve in both directions and daylight covers the full day',()=>{
  expect(wrapMinutes(-1)).toBe(1439);expect(wrapMinutes(1440)).toBe(0);
  expect(handDelta(Math.PI-.1,-Math.PI+.1,'minute')).toBeCloseTo(.2/(2*Math.PI)*60);
  expect(handDelta(-.1,.1,'hour')).toBeCloseTo(.2/(2*Math.PI)*720);
  expect(dayCycle(720).daylight).toBe(1);expect(dayCycle(0).daylight).toBe(0);
  expect(dayCycle(360).daylight).toBeGreaterThan(0);expect(dayCycle(1110).daylight).toBeLessThan(1);
});

async function openClock(page) {
  await enter(page);
  await page.waitForTimeout(900);
  const stage=page.locator('#stage'),bounds=await page.locator('#zud-canvas').boundingBox();
  const target=(await stage.getAttribute('data-targets')).split(' ').find(t=>t.startsWith('clock:'));
  const [,x,y]=target.split(':').map(Number);await page.mouse.click(bounds.x+bounds.width*x/100,bounds.y+bounds.height*y/100);
  await expect(page.locator('#clock-dialog')).toBeVisible();
}
async function dialPoint(page,hand,angle) {
  const [x,y,rx,ry]=(await page.locator('#clock-dialog').getAttribute('data-dial')).split(',').map(Number);
  const r=hand==='hour'?.36:.58;
  return {x:x+Math.sin(angle)*rx*r,y:y-Math.cos(angle)*ry*r};
}
async function dragHand(page,hand,from,to) {
  await expect(page.locator('#clock-dialog')).toHaveAttribute('data-settled','true');
  const p=await dialPoint(page,hand,from);await page.mouse.move(p.x,p.y);await page.mouse.down();
  for(let i=1;i<=12;i++){const p=await dialPoint(page,hand,from+(to-from)*i/12);await page.mouse.move(p.x,p.y);}
  await page.mouse.up();
}

test('The desk model lifts into the lightbox; its real hands control the day and return to the desk',async({page})=>{
  test.setTimeout(90000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await openClock(page);
  const stage=page.locator('#stage'),dialog=page.locator('#clock-dialog');
  const state=await stage.getAttribute('data-state');
  await expect(dialog.locator('svg,canvas,.clock-presets,.clock-dial')).toHaveCount(0);
  await expect(stage).toHaveAttribute('data-clock','open');
  await expect(dialog).toHaveAttribute('data-settled','true');
  const [clockX,,radius]=(await dialog.getAttribute('data-dial')).split(',').map(Number);
  expect(clockX).toBeGreaterThan(1000);
  const roomBounds=await page.locator('#zud-canvas').boundingBox();
  const windowX=Number((await stage.getAttribute('data-targets')).split(' ').find(t=>t.startsWith('blinds:')).split(':')[1]);
  expect(roomBounds.x+roomBounds.width*windowX/100+70).toBeLessThan(clockX-radius);
  // A complete turn of the actual hour hand advances twelve hours.
  const start=610/720*Math.PI*2;
  await dragHand(page,'hour',start,start+Math.PI*2);
  await expect(stage).toHaveAttribute('data-time','22:10');
  await dragHand(page,'minute',Math.PI/3,0);
  await expect(stage).toHaveAttribute('data-time','22:00');await expect(stage).toHaveAttribute('data-lamp','on');
  await page.screenshot({path:'.context/clock-lightbox-night.png'});
  await dragHand(page,'hour',Math.PI*5/3,Math.PI*7/3);
  await expect(stage).toHaveAttribute('data-time','02:00');
  await page.keyboard.press('Shift+ArrowUp');await page.keyboard.press('Shift+ArrowUp');
  await expect(stage).toHaveAttribute('data-time','12:00');await expect(stage).toHaveAttribute('data-lamp','off');
  // The inner hand remains grabbable when both hands overlap at noon.
  await dragHand(page,'hour',0,Math.PI/6);await expect(stage).toHaveAttribute('data-time','13:00');
  await page.keyboard.press('ArrowLeft');
  await dragHand(page,'minute',0,Math.PI/2);await expect(stage).toHaveAttribute('data-time','12:15');
  await page.screenshot({path:'.context/clock-lightbox-day.png'});
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
  await expect(stage).toHaveAttribute('data-clock','desk');
  await expect(stage).toHaveAttribute('data-time','12:15');await expect(stage).toHaveAttribute('data-state',state);
  // Opening the physical prop again also verifies its restored location/hit area.
  const bounds=await page.locator('#zud-canvas').boundingBox();
  const target=(await stage.getAttribute('data-targets')).split(' ').find(t=>t.startsWith('clock:'));
  const [,x,y]=target.split(':').map(Number);await page.mouse.click(bounds.x+bounds.width*x/100,bounds.y+bounds.height*y/100);
  await expect(dialog).toBeVisible();await expect(dialog).toHaveAttribute('data-settled','true');
  await page.mouse.click(30,150);await expect(dialog).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('The docked 3D clock leaves the window visible on touch screens',async({page,context})=>{
  test.setTimeout(60000);
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
  await openClock(page);
  await expect(page.locator('#clock-dialog')).toHaveAttribute('data-settled','true');
  const dial=(await page.locator('#clock-dialog').getAttribute('data-dial')).split(',').map(Number);
  expect(dial[0]).toBeGreaterThan(195);expect(dial[0]+dial[2]*1.2).toBeLessThan(375);
  const bounds=await page.locator('#zud-canvas').boundingBox();
  const windowTarget=(await page.locator('#stage').getAttribute('data-targets')).split(' ').find(t=>t.startsWith('blinds:')).split(':').map(Number);
  expect(bounds.y+bounds.height*windowTarget[2]/100).toBeLessThan(dial[1]-dial[3]*1.6);
  const client=await context.newCDPSession(page),start=await dialPoint(page,'minute',Math.PI/3);
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});
  for(let i=1;i<=6;i++){
    const point=await dialPoint(page,'minute',Math.PI/3+i*Math.PI/12);
    await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point]});
  }
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(page.locator('#stage')).toHaveAttribute('data-time','10:25');
  await page.screenshot({path:'.context/clock-lightbox-mobile.png'});
  await page.getByRole('button',{name:'Volver al escritorio'}).click();
  await expect(page.locator('#stage')).toHaveAttribute('data-clock','desk');
});

test('Time drives real scene lights and the view while respecting closed blinds',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {createRetroRoom}=await import('/src/retro-room.js');
    const {createRetroLighting}=await import('/src/retro-lighting.js');
    const room=createRetroRoom(),scene=new THREE.Scene();scene.add(room.room);
    const lighting=createRetroLighting(scene);
    lighting.setEnvironment({patches:room.bouncePatches,blockers:room.bounceBlockers,lights:room.lights});
    const snapshot=minutes=>{
      room.setTime(minutes);room.update(false,0,0,{reducedMotion:true});
      lighting.update(0,{room:true,daylight:room.daylight,cycle:room.cycle,reducedMotion:true});
      return {lamp:room.lights[0].intensity,sun:lighting.key.intensity,position:lighting.key.position.toArray(),color:lighting.key.color.getHex(),revision:lighting.revision,view:room.outside.scene.background.getHex()};
    };
    const day=snapshot(720),sunset=snapshot(1110),night=snapshot(1320);
    room.interactables.find(i=>i.action==='blinds').activate();const closed=snapshot(720);
    room.interactables.find(i=>i.action==='blinds').activate();const openNight=snapshot(1320);
    const viewChanged=day.view!==sunset.view&&sunset.view!==night.view;
    const clockMaterials=[];room.clock.object.traverse(object=>{if(object.isMesh)clockMaterials.push({retro:object.material.userData.retro,ink:object.material.uniforms?.retroHalftoneStrength.value,emission:object.material.emissive.getHex()});});
    const bells=['Campana izquierda','Campana derecha','Asa superior'].every(name=>room.clock.object.getObjectByName(name));
    for(const item of [day,sunset,night,closed,openNight])delete item.view;
    lighting.dispose();return {day,sunset,night,closed,openNight,viewChanged,clockMaterials,bells};
  });
  expect(result.day.lamp).toBe(0);expect(result.night.lamp).toBeGreaterThan(2);
  expect(result.night.sun).toBeLessThan(result.day.sun/5);
  expect(result.sunset.color).not.toBe(result.day.color);expect(result.sunset.position).not.toEqual(result.day.position);
  expect(result.sunset.revision).toBeGreaterThan(result.day.revision);
  expect(result.closed.lamp).toBeGreaterThan(2);expect(result.openNight.lamp).toBeGreaterThan(2);
  expect(result.viewChanged).toBe(true);expect(result.bells).toBe(true);
  expect(result.clockMaterials.every(m=>m.retro&&m.ink===.42&&m.emission===0)).toBe(true);
});
