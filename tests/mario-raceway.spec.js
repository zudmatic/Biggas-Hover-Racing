import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {collisionMaterials,createCityCollision} from '../src/circuit-collision.js';
import {createCircuitLandscape,createHoverState,advanceHover,crossesCircuitGate,recoverHover} from '../src/circuit-physics.js';
const base='public/models/mario-raceway/';
const route=JSON.parse(fs.readFileSync(base+'route_gltf.json')),gameplay=JSON.parse(fs.readFileSync(base+'gameplay.json'));
const track=()=>Object.assign(createCircuitLandscape(route,gameplay),{physicalBoundaries:true,map:'mario-raceway'});
let cached;
async function collision(){if(cached)return cached;const bytes=fs.readFileSync(base+'mario-raceway-colliders.glb');const asset=await new GLTFLoader().register(collisionMaterials).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');return cached={root:asset.scene,...createCityCollision(asset.scene)};}
const wrap=n=>Math.atan2(Math.sin(n),Math.cos(n));

test('Mario Raceway route, starting grid and recovery follow the imported asphalt',async()=>{
 const world=await collision(),map=track();expect(map.length).toBeCloseTo(1498.32,1);expect(map.gates).toHaveLength(17);
 for(const sample of map.samples){const [x,y,z]=sample.position;expect(world.surfaceHeight(x,z)).not.toBeNull();expect(Math.abs(world.surfaceHeight(x,z)-y)).toBeLessThan(.08);}
 for(let gate=0;gate<17;gate++){const state=recoverHover(map,gate);world.step(state,1/60,map);expect(state.wallHit).toBe(false);expect(state.recoverNeeded).toBe(false);expect(state.y-world.surfaceHeight(state.x,state.z)).toBeCloseTo(.65,3);}
});

test('a driven lap crosses every checkpoint and the pipe without a collision or recovery',async()=>{
 const world=await collision(),map=track(),state=createHoverState(map);let gate=0,hits=0;
 for(let i=0;i<180*60;i++){
  const road=map.roadAt(state.x,state.z),ahead=map.atDistance(road.distance+Math.max(4,state.speed*.3)),a=map.atDistance(road.distance+3),b=map.atDistance(road.distance+13),curvature=Math.abs(wrap(Math.atan2(b.nx,b.nz)-Math.atan2(a.nx,a.nz)))/10,target=Math.min(45,Math.sqrt(16/Math.max(curvature,.002))),error=wrap(Math.atan2(ahead.x-state.x,ahead.z-state.z)-state.yaw);
  const previous=advanceHover(state,{turn:THREE.MathUtils.clamp(-error*3.5/(2.65-.9*state.speed/72),-1,1),throttle:state.throttle<target-.5?1:state.throttle>target+.5?-1:0,brake:state.speed>target+7},1/60,map,world.surfaceHeight);world.step(state,1/60,map,previous);hits+=Number(state.wallHit);expect(state.recoverNeeded).toBe(false);
  if(crossesCircuitGate(previous,state,map.gates[gate])){gate++;if(gate===17)break;}
 }
 expect(gate).toBe(17);expect(hits).toBe(0);
});

test('Mario Raceway loads from the selector with comic, day/night, headlights and no race records',async({page})=>{
 test.setTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{localStorage.setItem('zud.hover.v2.ruins034','33');localStorage.setItem('zud.hover.v1.mario-raceway','75');});
 await page.goto('/?selection=map&map=mario-raceway');await expect(page.locator('.lobby-map-card')).toHaveCount(3);await expect(page.locator('input[value="mario-raceway"]')).toBeChecked();
 await expect.poll(()=>page.locator('.lobby-map-art img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0))).toBe(true);
 await page.getByRole('button',{name:'Volar',exact:true}).click();const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:90000});await expect(app).toHaveAttribute('data-map','mario-raceway');await expect(app).toHaveAttribute('data-comic','true');await expect(page.locator('#flight-best')).toHaveCount(0);
 await page.keyboard.down('KeyW');await expect.poll(async()=>Number(await app.getAttribute('data-speed'))).toBeGreaterThan(12);await page.keyboard.up('KeyW');await page.keyboard.press('KeyF');await expect(app).toHaveAttribute('data-headlights','true');await withFlightOptions(page,()=>page.getByRole('button',{name:'Iluminación nocturna'}).click());await expect(app).toHaveAttribute('data-lighting','night');await page.keyboard.press('KeyR');await expect.poll(async()=>Number(await app.getAttribute('data-speed'))).toBeLessThan(1);
 await page.keyboard.press('Escape');await expect(app).toHaveAttribute('data-phase','paused');await withFlightOptions(page,()=>page.getByRole('button',{name:'Cómic',exact:true}).click());await expect(app).toHaveAttribute('data-comic','false');expect(errors).toEqual([]);
 await page.getByRole('link',{name:'Selección de mapa',exact:true}).click();await expect(page.locator('input[value="mario-raceway"]')).toBeChecked();await expect(page.locator('.race-lobby')).toHaveAttribute('data-paper','false');
});

test('mobile map cards stay readable and launch Mario Raceway in free driving from a legacy race link',async({browser})=>{
 test.setTimeout(120000);const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();await page.goto(`http://127.0.0.1:${process.env.TEST_PORT??5173}/?selection=map&map=mario-raceway&mode=race&comic=0`);
 await expect(page.locator('.lobby-map-card')).toHaveCount(3);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);await expect(page.getByText('Mario Raceway',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Volar',exact:true}).click();await expect(page.locator('.flight-app')).toHaveAttribute('data-ready','true',{timeout:90000});await expect(page.locator('.flight-app')).toHaveAttribute('data-comic','false');await expect(page.locator('.flight-status')).toBeVisible();await expect(page.locator('.flight-app')).toHaveAttribute('data-phase','flying');await context.close();
});
