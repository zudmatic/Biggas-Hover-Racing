import {launchFromLobby,withFlightOptions} from './helpers/flight.js';
import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {createHoverState,advanceHover} from '../src/circuit-physics.js';
import {createCircuitLighting} from '../src/circuit-lighting.js';

// Wide, level test surface isolates grip from parapet collision impulses.
const surface={spawn:{x:0,y:.65,z:0},yaw:0,height:()=>0,roadAt:(x,z)=>({x:0,y:0,z,nx:0,nz:1,width:1000,offset:-x,grade:0})};
const moving=()=>Object.assign(createHoverState(surface),{speed:30,throttle:30,vz:30});
test('held drift increases sideslip, releasing restores grip, brake overrides it',()=>{
  const normal=moving(),drift=moving();
  for(let i=0;i<40;i++){advanceHover(normal,{turn:.5},1/60,surface);advanceHover(drift,{turn:.5,drift:true},1/60,surface);}
  expect(drift.drifting).toBe(true);expect(Math.abs(drift.slip)).toBeGreaterThan(Math.abs(normal.slip)*1.7);expect(drift.speed).toBeLessThanOrEqual(30.1);
  const sliding=Math.abs(drift.slip);for(let i=0;i<90;i++)advanceHover(drift,{},1/60,surface);
  expect(drift.drifting).toBe(false);expect(Math.abs(drift.slip)).toBeLessThan(sliding*.05);expect(drift.driftBlend).toBeLessThan(.001);
  for(let i=0;i<120;i++)advanceHover(drift,{drift:true,brake:true},1/60,surface);expect(drift.speed).toBeLessThan(.01);expect(drift.drifting).toBe(false);
  const stopped=createHoverState(surface);advanceHover(stopped,{drift:true},1/60,surface);expect(stopped.drifting).toBe(false);
});

test('lighting provides global fill, follows the ship, changes at night and responds to turbo',()=>{
  const scene=new THREE.Scene();scene.background=new THREE.Color();scene.fog=new THREE.Fog(0,1,100);
  const lights=createCircuitLighting(scene,{mobile:true}),state=moving();lights.setTrack({length:280,atDistance:d=>({x:0,y:0,z:d,nx:0,nz:1})});
  lights.update(state,0,{dt:1,reducedMotion:true});const day=scene.background.clone(),sun=lights.sun.intensity,engine=lights.engine.intensity;
  expect(lights.sky.intensity).toBeGreaterThan(0);expect(lights.lamps).toHaveLength(3);expect(lights.lamps[0].intensity).toBeGreaterThan(0);
  lights.setNight(true);Object.assign(state,{x:12,z:35,yaw:Math.PI/2,boosting:true});lights.update(state,1,{dt:1,reducedMotion:true});
  expect(scene.background.equals(day)).toBe(false);expect(lights.sun.intensity).toBeLessThan(sun);expect(lights.engine.intensity).toBeGreaterThan(engine);
  expect(lights.headlights[0].position.x).toBeCloseTo(13.7);expect(lights.headlights[0].target.position.x).toBeCloseTo(35);expect(lights.sun.target.position.x).toBe(12);
  const position=lights.sun.position.clone();lights.update(state,100,{reducedMotion:true});expect(lights.sun.position.equals(position)).toBe(true);lights.dispose();expect(scene.children).toHaveLength(0);
});

test('keyboard drift releases correctly, night lighting works with comic and normal rendering',async({page})=>{
  test.setTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:960,height:640});await page.goto('/simulator.html');await launchFromLobby(page);const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});
  await withFlightOptions(page,()=>page.getByRole('button',{name:'Iluminación nocturna'}).click());await expect(app).toHaveAttribute('data-lighting','night');await expect(page.locator('#flight-comic')).toHaveAttribute('aria-pressed','true');
  await page.keyboard.down('KeyW');await expect.poll(async()=>Number(await app.getAttribute('data-speed')),{timeout:15000}).toBeGreaterThan(12);await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyE');await expect(app).toHaveAttribute('data-drifting','true');await expect(page.locator('.flight-drift')).toBeVisible();await page.keyboard.up('KeyE');await expect(app).toHaveAttribute('data-drifting','false');
  await page.keyboard.down('KeyE');await expect(app).toHaveAttribute('data-drifting','true');await page.keyboard.press('Escape');await page.keyboard.up('KeyE');await page.getByRole('button',{name:'Continuar',exact:false}).first().click();await expect(app).toHaveAttribute('data-drifting','false');
  await withFlightOptions(page,()=>page.getByRole('button',{name:'Cómic',exact:true}).click());await expect(app).toHaveAttribute('data-comic','false');await withFlightOptions(page,()=>page.getByRole('button',{name:'Iluminación nocturna'}).click());await expect(app).toHaveAttribute('data-lighting','day');expect(errors).toEqual([]);
});

test('touch drift releases on pointer cancellation with no HUD header',async({browser})=>{
  test.setTimeout(90000);const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const page=await context.newPage();await page.goto(`http://127.0.0.1:${process.env.TEST_PORT??5173}/simulator.html`);await launchFromLobby(page);const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});
  const accel=page.getByRole('button',{name:'Acelerar',exact:true}),drift=page.getByRole('button',{name:'Derrapar',exact:true});
  // Synthetic pointer events exercise the same multi-touch hold/cancel handlers.
  await accel.evaluate(b=>{b.setPointerCapture=()=>{};b.dispatchEvent(new PointerEvent('pointerdown',{pointerId:11,bubbles:true}));});
  await expect.poll(async()=>Number(await app.getAttribute('data-speed')),{timeout:15000}).toBeGreaterThan(10);
  await drift.evaluate(b=>{b.setPointerCapture=()=>{};b.dispatchEvent(new PointerEvent('pointerdown',{pointerId:12,bubbles:true}));});await expect(app).toHaveAttribute('data-drifting','true');
  await drift.dispatchEvent('pointercancel',{pointerId:12});await expect(app).toHaveAttribute('data-drifting','false');await expect(drift).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('.flight-header')).toHaveCount(0);await context.close();
});
