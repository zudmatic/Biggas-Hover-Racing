import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {createFlightFx} from '../src/flight-fx.js';
import {launchFromLobby} from './helpers/flight.js';

const state=()=>({x:0,y:.65,z:0,hover:.65,yaw:0,speed:20,vx:0,vz:20,slip:.3,drifting:true,braking:false});
function setup(options={}){const root=new THREE.Group(),fx=createFlightFx(root,{texture:new THREE.Texture(),surfaceHeight:()=>0,random:()=>.5,...options});return {root,fx,s:state()};}

test('FX emission stays stable across frame rates and respects bounded pools',()=>{
  const totals=[];
  for(const hz of [30,60,120]){const {fx,s}=setup();for(let i=0;i<hz*5;i++){s.z+=20/hz;fx.update(1/hz,{state:s});}totals.push(fx.stats.emitted);expect(fx.stats.air).toBeLessThanOrEqual(96);expect(fx.stats.marks).toBeLessThanOrEqual(160);fx.dispose();}
  expect(Math.max(...totals)-Math.min(...totals)).toBeLessThanOrEqual(2);
});

test('straight drift emits nothing and switching styles clears the comparison',()=>{
  const {fx,s}=setup();fx.setStyle('procedural');s.slip=0;for(let i=0;i<60;i++)fx.update(1/60,{state:s});expect(fx.stats.emitted).toBe(0);
  s.slip=.3;for(let i=0;i<30;i++)fx.update(1/60,{state:s});expect(fx.stats.air).toBeGreaterThan(0);
  fx.setStyle('hybrid');expect(fx.style).toBe('hybrid');expect(fx.stats.air).toBe(0);
  for(let i=0;i<30;i++)fx.update(1/60,{state:s});expect(fx.stats.air).toBeGreaterThan(0);
  fx.setStyle('invalid');expect(fx.style).toBe('hybrid');fx.setStyle('procedural');expect(fx.stats.air).toBe(0);fx.dispose();
});

test('pause freezes FX; stopping emission lets them expire; reset and reduced motion clear them',()=>{
  const {fx,s,root}=setup();for(let i=0;i<30;i++){s.z+=.3;fx.update(1/60,{state:s});}
  expect(fx.stats.air).toBeGreaterThan(0);expect(fx.stats.marks).toBeGreaterThan(0);
  const frozen={...fx.stats};for(let i=0;i<60;i++)fx.update(1/60,{state:s,phase:'paused'});expect(fx.stats).toEqual(frozen);
  s.drifting=false;for(let i=0;i<150;i++)fx.update(1/60,{state:s});expect(fx.stats.air+fx.stats.marks).toBe(0);
  s.braking=true;for(let i=0;i<20;i++)fx.update(1/60,{state:s});expect(fx.stats.air).toBeGreaterThan(0);
  fx.update(1/60,{state:s,reduced:true});expect(fx.stats.air+fx.stats.marks).toBe(0);
  fx.reset();expect(fx.stats.time).toBe(0);fx.dispose();fx.dispose();expect(root.children).toHaveLength(0);
});

test('marks follow ramps, skip holes and never bridge a teleport',()=>{
  const {fx,s}=setup({surfaceHeight:(x,z)=>z*.1});for(let i=0;i<20;i++){s.z+=.4;s.y=.65+s.z*.1;fx.update(1/60,{state:s});}
  const mesh=fx.group.children.find(c=>c.name.includes('roces')),p=mesh.geometry.attributes.position;
  expect(fx.stats.marks).toBeGreaterThan(0);for(let i=0;i<mesh.geometry.drawRange.count;i++)expect(p.getY(i)).toBeCloseTo(p.getZ(i)*.1+.028,4);
  const count=fx.stats.markEmitted;s.z+=100;s.y+=10;fx.update(1/60,{state:s});expect(fx.stats.markEmitted).toBe(count);fx.dispose();
  const hole=setup({surfaceHeight:()=>null});for(let i=0;i<40;i++){hole.s.z+=.4;hole.fx.update(1/60,{state:hole.s});}expect(hole.fx.stats.marks).toBe(0);hole.fx.dispose();
});

for(const [map,vehicle] of [['ruins','037'],['nexus','037']])test(`drift and braking render on ${map} with ${vehicle} and reset on recovery`,async({page})=>{
  test.setTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`/simulator.html?vehicle=${vehicle}&map=${map}`);await launchFromLobby(page,{map});const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});
  await page.keyboard.down('KeyW');await expect.poll(async()=>Number(await app.getAttribute('data-speed')),{timeout:15000}).toBeGreaterThan(18);await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyE');await page.waitForTimeout(200);await expect(app).toHaveAttribute('data-fx-air','0');await page.keyboard.down('KeyD');await expect.poll(async()=>Number(await app.getAttribute('data-fx-air'))).toBeGreaterThan(0);await expect.poll(async()=>Number(await app.getAttribute('data-fx-marks'))).toBeGreaterThan(0);
  await page.waitForTimeout(300);await page.keyboard.up('KeyD');await page.screenshot({path:`.context/fx-procedural-${map}.png`});await page.keyboard.up('KeyE');
  await page.keyboard.press('Escape');await expect(app).toHaveAttribute('data-phase','paused');await page.waitForTimeout(150);const frozen=await app.getAttribute('data-fx-time');await page.waitForTimeout(250);expect(await app.getAttribute('data-fx-time')).toBe(frozen);
  await page.getByRole('button',{name:'Continuar',exact:false}).first().click();await page.keyboard.press('KeyR');await expect(app).toHaveAttribute('data-fx-air','0');await expect(app).toHaveAttribute('data-fx-marks','0');
  await page.getByRole('button',{name:'DialKit',exact:true}).click();
  await page.getByRole('button',{name:'B · Humo híbrido',exact:true}).click();await expect(app).toHaveAttribute('data-fx-style','hybrid');await page.locator('.flight-canvas').focus();
  await page.keyboard.down('KeyW');await expect.poll(async()=>Number(await app.getAttribute('data-speed'))).toBeGreaterThan(15);await page.keyboard.up('KeyW');await page.keyboard.down('KeyE');await page.keyboard.down('KeyA');await expect.poll(async()=>Number(await app.getAttribute('data-fx-air'))).toBeGreaterThan(0);await page.waitForTimeout(200);await page.screenshot({path:`.context/fx-hybrid-${map}.png`});await page.keyboard.up('KeyA');await page.keyboard.up('KeyE');
  await page.getByRole('button',{name:'C · Mixto',exact:true}).click();await expect(app).toHaveAttribute('data-fx-style','mixed');
  await page.locator('.flight-canvas').focus();await page.keyboard.press('KeyR');await page.keyboard.down('KeyW');await expect.poll(async()=>Number(await app.getAttribute('data-speed'))).toBeGreaterThan(18);await page.keyboard.up('KeyW');
  await page.keyboard.down('Space');await expect.poll(async()=>Number(await app.getAttribute('data-fx-air'))).toBeGreaterThan(0);await page.keyboard.up('Space');expect(errors).toEqual([]);
});
