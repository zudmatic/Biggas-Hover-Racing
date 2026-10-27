import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {createCircuitLandscape,createHoverState,advanceHover} from '../src/circuit-physics.js';
import {BULLDOG_INTRO,BULLDOG_INTRO_DURATION,INTRO_IGNITION,introShot,introEyes,introLift,introInput} from '../src/bulldog-intro.js';

test('the cameo timeline cuts four shots, blinks the eyes awake and lifts the parked ship',()=>{
  expect(BULLDOG_INTRO.map(shot=>shot.id)).toEqual(['ignition','launch','turbine','flyby']);
  for(let i=1;i<BULLDOG_INTRO.length;i++)expect(BULLDOG_INTRO[i].start).toBe(BULLDOG_INTRO[i-1].end);
  expect(introShot(0).id).toBe('ignition');expect(introShot(5).id).toBe('turbine');expect(introShot(BULLDOG_INTRO_DURATION+1).id).toBe('flyby');
  expect([0,.4,.55,.7,.8,1.5].map(introEyes)).toEqual([false,true,false,true,false,true]);
  expect(introLift(0)).toBeCloseTo(-.45);expect(introLift(INTRO_IGNITION)).toBeCloseTo(-.45);expect(introLift(BULLDOG_INTRO[1].start)).toBeCloseTo(0);
  // Overshoot reads as the hover cushion catching the ship.
  expect(Math.max(...Array.from({length:40},(_,i)=>introLift(INTRO_IGNITION+i*.03)))).toBeGreaterThan(0);
});

for(const [map,dir] of [['mario-raceway','mario-raceway'],['ruins','circuit034'],['nexus','circuit035']])test(`the autopilot keeps the Bulldog on the ${map} road and fires the turbo`,()=>{
  const read=file=>JSON.parse(readFileSync(new URL(`../public/models/${dir}/${file}`,import.meta.url)));
  const landscape=createCircuitLandscape(read('route_gltf.json'),read('gameplay.json')),state=createHoverState(landscape),spawn={x:state.x,z:state.z};
  let edge=0,boosted=false,moved=false;
  for(let time=0;time<BULLDOG_INTRO_DURATION;time+=1/60){
    const input=introInput(time,state,landscape);if(time<BULLDOG_INTRO[1].start-.3)expect(input.throttle).toBe(0);
    boosted||=input.boost;advanceHover(state,input,1/60,landscape);
    if(time<1)moved||=Math.hypot(state.x-spawn.x,state.z-spawn.z)>.01;
    const road=landscape.roadAt(state.x,state.z);if(time>3)edge=Math.max(edge,road.distanceToRoad/(road.width/2));
  }
  expect(moved).toBe(false);expect(boosted).toBe(true);expect(edge).toBeLessThan(.6);
  const travelled=landscape.roadAt(state.x,state.z).distance-landscape.roadAt(spawn.x,spawn.z).distance;
  expect((travelled%landscape.length+landscape.length)%landscape.length).toBeGreaterThan(120);
});

test('Bulldog plays its cameo on the track, then hands over at the grid',async({page})=>{
  test.setTimeout(180000);await page.setViewportSize({width:1100,height:700});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?selection=map&map=mario-raceway&vehicle=039&pilot=zudmatic&renderer=webgl2');await page.getByRole('button',{name:'Volar',exact:true}).click();
  const app=page.locator('.flight-app'),overlay=page.locator('.bulldog-intro');
  await expect(app).toHaveAttribute('data-ready','true',{timeout:90000});await expect(app).toHaveAttribute('data-phase','intro');
  await expect(overlay).toBeVisible();await expect(page.locator('.flight-telemetry')).toBeHidden();await expect(page.getByRole('button',{name:/Saltar/})).toBeVisible();
  for(const shot of ['launch','turbine','flyby'])await expect(app).toHaveAttribute('data-intro-shot',shot,{timeout:60000});
  await expect(page.locator('.bulldog-intro-title')).toHaveCSS('opacity','1');await page.screenshot({path:'.context/bulldog-intro-flyby.png'});
  await expect(app).toHaveAttribute('data-phase','flying',{timeout:60000});await expect(overlay).toHaveCount(0);
  await expect(app).toHaveAttribute('data-speed','0.00');await expect(app).toHaveAttribute('data-headlights','false');expect(errors).toEqual([]);
});

test('the cameo is skippable, and other ships, ?intro=0 and reduced motion start driving directly',async({page})=>{
  test.setTimeout(180000);await page.setViewportSize({width:1100,height:700});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const app=page.locator('.flight-app');
  await page.goto('/?selection=map&map=ruins&vehicle=039&pilot=zud&renderer=webgl2');await page.getByRole('button',{name:'Volar',exact:true}).click();
  await expect(app).toHaveAttribute('data-phase','intro',{timeout:90000});await page.keyboard.press('Enter');
  await expect(app).toHaveAttribute('data-phase','flying');await expect(page.locator('.bulldog-intro')).toHaveCount(0);await expect(app).toHaveAttribute('data-speed','0.00');
  for(const [url,reduce] of [['/?selection=map&map=ruins&vehicle=038&pilot=zud&renderer=webgl2',false],['/?selection=map&map=ruins&vehicle=039&pilot=zud&renderer=webgl2&intro=0',false],['/?selection=map&map=ruins&vehicle=039&pilot=zud&renderer=webgl2',true]]){
    await page.emulateMedia({reducedMotion:reduce?'reduce':'no-preference'});await page.goto(url);await page.getByRole('button',{name:'Volar',exact:true}).click();
    await expect(app).toHaveAttribute('data-ready','true',{timeout:90000});await expect(app).toHaveAttribute('data-phase','flying');await expect(page.locator('.bulldog-intro')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
