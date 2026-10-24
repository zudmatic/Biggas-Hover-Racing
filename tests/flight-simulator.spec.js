import {launchFromLobby} from './helpers/flight.js';
import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import * as THREE from 'three';
import {createCircuitLandscape,createHoverState,advanceHover} from '../src/circuit-physics.js';
import {createCircuitDetails} from '../src/circuit-details.js';
const track=()=>createCircuitLandscape(JSON.parse(fs.readFileSync('public/models/circuit034/route_gltf.json')),JSON.parse(fs.readFileSync('public/models/circuit034/gameplay.json')));

test('inertia preserves lateral motion, braking loses speed and suspension settles after a contact',()=>{
  const map=track(),state=createHoverState(map),road=map.atDistance(50);Object.assign(state,{x:road.x,z:road.z,y:road.y+.65,yaw:Math.atan2(road.nx,road.nz),speed:30,throttle:30,vx:road.nx*30,vz:road.nz*30});
  for(let i=0;i<10;i++)advanceHover(state,{turn:1},1/60,map);
  expect(state.slip).toBeLessThan(-.04);expect(state.yawRate).toBeLessThan(-1);const movingSpeed=state.speed;
  for(let i=0;i<35;i++)advanceHover(state,{brake:true},1/60,map);expect(state.speed).toBeLessThan(movingSpeed*.2);
  state.hover=.85;state.hoverVelocity=-.2;for(let i=0;i<180;i++)advanceHover(state,{brake:true},1/60,map);
  expect(state.hover).toBeGreaterThan(.62);expect(state.hover).toBeLessThan(.68);expect(Math.abs(state.hoverVelocity)).toBeLessThan(.1);
});

test('parapets reflect the outward velocity and dissipate energy without crossing the track',()=>{
  const map=track(),state=createHoverState(map),road=map.atDistance(50),nx=-road.nz,nz=road.nx;
  Object.assign(state,{x:road.x+nx*4.35,z:road.z+nz*4.35,y:road.y+.65,yaw:Math.atan2(road.nx,road.nz),speed:28,throttle:20,vx:road.nx*20+nx*20,vz:road.nz*20+nz*20});
  advanceHover(state,{},1/60,map);expect(state.wallHit).toBe(true);expect(state.impactSerial).toBeGreaterThan(0);expect(state.vx*nx+state.vz*nz).toBeLessThan(0);expect(state.speed).toBeLessThan(28);expect(Math.abs(map.roadAt(state.x,state.z).offset)).toBeLessThan(4.4);
});

test('environment animates water and flags, cones react to the ship, reduced motion is stable',()=>{
  const map=track(),root=new THREE.Group(),world=createCircuitDetails(root,map,{mobile:true}),state=createHoverState(map);
  const ocean=root.getObjectByName('Océano'),flag=root.getObjectByName('Bandera'),cone=root.getObjectByName('Cono dinámico');
  world.update(0,false,{state,phase:'menu'});const before=Array.from(flag.geometry.attributes.position.array),water=Array.from(ocean.geometry.attributes.position.array);
  world.update(1,false,{state,phase:'menu'});expect(Array.from(flag.geometry.attributes.position.array)).not.toEqual(before);expect(Array.from(ocean.geometry.attributes.position.array)).not.toEqual(water);
  world.update(2,true,{state,phase:'menu'});const still=Array.from(flag.geometry.attributes.position.array);world.update(3,true,{state,phase:'menu'});expect(Array.from(flag.geometry.attributes.position.array)).toEqual(still);
  const origin=cone.position.clone();Object.assign(state,{x:origin.x,y:origin.y+.65,z:origin.z,speed:20,vx:20,vz:0});world.step(state,1/60);for(let i=0;i<30;i++)world.step(state,1/60);expect(cone.position.distanceTo(origin)).toBeGreaterThan(1);world.reset();expect(cone.position.distanceTo(origin)).toBe(0);
  expect(world.detailCount).toBeGreaterThan(300);
});

test('hangar and legacy links default to Ruinas with comic on, Nexus is selectable',async({page})=>{
  test.setTimeout(90000);await page.goto('/spaceship.html');await page.locator('[data-ready=true]').waitFor();await page.getByRole('link',{name:'Simulador de vuelo'}).click();await launchFromLobby(page);const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});await expect(app).toHaveAttribute('data-map','ruins');await expect(app).toHaveAttribute('data-comic','true');await expect(page.getByText(/cuenca/i)).toHaveCount(0);await expect(page.locator('#flight-new-map')).toHaveCount(0);await expect(page.locator('[data-map-link]')).toHaveCount(0);await expect(page.locator('#flight-map-selection')).toBeAttached();
  await page.goto('/simulator.html?map=basin&seed=2048');await launchFromLobby(page);await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});await expect(app).toHaveAttribute('data-map','ruins');expect(new URL(page.url()).searchParams.has('seed')).toBe(false);expect(new URL(page.url()).searchParams.get('map')).toBe('ruins');
});

test('free driving, turbo, recovery and pause control physics and environment together',async({page})=>{
  test.setTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/simulator.html');await launchFromLobby(page);const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});expect(Number(await app.getAttribute('data-detail-count'))).toBeGreaterThan(300);
  await page.keyboard.press('Escape');expect(await page.locator('#flight-restart').evaluate(button=>{button.click();return document.querySelector('.flight-app').dataset.phase;})).toBe('flying');await expect(app).toHaveAttribute('data-phase','flying',{timeout:15000});await page.keyboard.down('ShiftLeft');await expect.poll(async()=>Number(await app.getAttribute('data-energy')),{timeout:10000}).toBeLessThan(.94);await page.keyboard.up('ShiftLeft');await page.keyboard.press('Escape');await expect(app).toHaveAttribute('data-phase','paused');
  await page.waitForTimeout(200);const before=await app.evaluate(e=>[e.dataset.time,e.dataset.effectsTime,e.dataset.x,e.dataset.y]);await page.waitForTimeout(400);expect(await app.evaluate(e=>[e.dataset.time,e.dataset.effectsTime,e.dataset.x,e.dataset.y])).toEqual(before);
  await page.getByRole('button',{name:'Continuar',exact:false}).first().click();await page.keyboard.press('KeyR');expect(await app.getAttribute('data-penalty')).toBeNull();await expect.poll(async()=>Number(await app.getAttribute('data-speed'))).toBeLessThan(1);await page.keyboard.press('KeyC');await expect(app).toHaveAttribute('data-camera','1');expect(errors).toEqual([]);
});

test('reduced motion freezes the paused scene while keeping controls available',async({page})=>{
  test.setTimeout(90000);await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/simulator.html');await launchFromLobby(page);const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});await page.keyboard.press('Escape');await page.waitForTimeout(500);const canvas=page.locator('.flight-canvas'),first=await canvas.screenshot();await page.waitForTimeout(500);expect((await canvas.screenshot()).equals(first)).toBe(true);await page.locator('#flight-resume').click();await expect(app).toHaveAttribute('data-phase','flying');
});
