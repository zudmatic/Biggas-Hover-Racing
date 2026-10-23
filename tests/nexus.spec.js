import {launchFromLobby} from './helpers/flight.js';
import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {collisionMaterials,createCityCollision} from '../src/circuit-collision.js';
import {createCircuitLandscape,createHoverState,advanceHover,crossesCircuitGate} from '../src/circuit-physics.js';
import {createCircuitTextures} from '../src/circuit-textures.js';
import {createNexusDetails} from '../src/nexus-details.js';
const route=JSON.parse(fs.readFileSync('public/models/circuit035/route_gltf.json')),gameplay=JSON.parse(fs.readFileSync('public/models/circuit035/gameplay.json'));
const track=()=>Object.assign(createCircuitLandscape(route,gameplay),{physicalBoundaries:true,map:'nexus'});
const wrap=n=>Math.atan2(Math.sin(n),Math.cos(n));
let cached;
async function city(){if(cached)return cached;const b=fs.readFileSync('public/models/circuit035/035_nexus_circuit_COLLIDERS.glb'),asset=await new GLTFLoader().register(collisionMaterials).parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');return cached={root:asset.scene,...createCityCollision(asset.scene)};}

test('Nexus original colliders support the full 18 m route and allow an entire ordered lap',async()=>{
  const world=await city(),map=track(),state=createHoverState(map);expect(map.length).toBeCloseTo(1211.984,2);
  for(const sample of map.samples)for(const offset of [-7,0,7]){const [x,y,z]=sample.position,[nx,,nz]=sample.forward,l=Math.hypot(nx,nz),h=world.surfaceHeight(x-nz/l*offset,z+nx/l*offset);expect(h).not.toBeNull();expect(Math.abs(h-y)).toBeLessThan(.05);}
  let gate=0,hits=0;
  for(let i=0;i<180*60;i++){
    const road=map.roadAt(state.x,state.z),ahead=map.atDistance(road.distance+Math.max(4,state.speed*.3)),a=map.atDistance(road.distance+3),b=map.atDistance(road.distance+13),curvature=Math.abs(wrap(Math.atan2(b.nx,b.nz)-Math.atan2(a.nx,a.nz)))/10,target=Math.min(45,Math.sqrt(16/Math.max(curvature,.002))),error=wrap(Math.atan2(ahead.x-state.x,ahead.z-state.z)-state.yaw);
    const previous=advanceHover(state,{turn:Math.max(-1,Math.min(1,-error*3.5/(2.65-.9*state.speed/72))),throttle:state.throttle<target-.5?1:state.throttle>target+.5?-1:0,brake:state.speed>target+7},1/60,map,world.surfaceHeight);world.step(state,1/60,map);hits+=Number(state.wallHit);expect(state.recoverNeeded).toBe(false);expect(state.hover).toBeGreaterThan(.6);expect(state.hover).toBeLessThan(.7);
    if(crossesCircuitGate(previous,state,map.gates[gate])){gate++;if(gate===17)break;}
  }
  expect(gate).toBe(17);expect(hits).toBe(0);
});

test('the supplied architectural passage stays open and visible race barriers cause impacts',async()=>{
  const world=await city(),map=track();
  for(let i=80;i<=88;i++){const s=map.samples[i],state=createHoverState(map);Object.assign(state,{x:s.position[0],z:s.position[2],y:s.position[1]+.65,yaw:Math.atan2(s.forward[0],s.forward[2])});world.step(state,1/60,map);expect(state.wallHit).toBe(false);expect(state.y).toBeCloseTo(s.position[1]+.65,2);}
  const barrier=world.root.getObjectByName('COL_RACE_impact_barrier'),box=new THREE.Box3().setFromObject(barrier),center=box.getCenter(new THREE.Vector3()),state=createHoverState(map);Object.assign(state,{x:box.min.x-4,z:center.z,y:box.min.y+.65,yaw:Math.PI/2,speed:50,throttle:50,vx:50,vz:0});let impact=false;
  for(let i=0;i<90;i++){advanceHover(state,{},1/60,map,world.surfaceHeight);world.step(state,1/60,map);if(state.wallHit){impact=true;break;}}expect(impact).toBe(true);expect(state.impactSerial).toBeGreaterThan(0);
});

test('open verges allow departure; thin physical walls stop boosted hulls and off-road time requests recovery',()=>{
  const root=new THREE.Group(),material=new THREE.MeshBasicMaterial(),floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200).rotateX(-Math.PI/2),material);floor.name='COL_TRACK_RACE_SURFACE_18m';root.add(floor);const wall=new THREE.Mesh(new THREE.BoxGeometry(.15,8,30),material);wall.name='COL_CITY_wall';wall.position.set(20,4,0);root.add(wall);
  const world=createCityCollision(root),map={spawn:{x:12,y:.65,z:0},yaw:Math.PI/2,physicalBoundaries:true,height:()=>0,roadAt:(x,z)=>({x:0,y:0,z,nx:0,nz:1,width:18,offset:-x,distanceToRoad:Math.abs(x),grade:0})},state=createHoverState(map);Object.assign(state,{speed:72,throttle:52,vx:72,vz:0});
  let hit=false;for(let i=0;i<15;i++){advanceHover(state,{boost:true},1/60,map,world.surfaceHeight);world.step(state,1/60,map);if(i===0){expect(state.x).toBeGreaterThan(12);expect(state.wallHit).toBe(false);}hit ||= state.wallHit;expect(state.x).toBeLessThan(19);}
  expect(hit).toBe(true);expect(state.impactSerial).toBeGreaterThan(0);Object.assign(state,{x:12,z:0,vx:0,vz:0,offTrackTime:0});world.step(state,10.1,map);expect(state.recoverNeeded).toBe(true);world.dispose();
});

test('authored UVs and textures survive, rooftop animation and nighttime windows respect reduced motion',()=>{
  const root=new THREE.Group(),texture=new THREE.DataTexture(new Uint8Array(16),2,2),material=new THREE.MeshStandardMaterial({name:'Terrain | baked civic landscape',map:texture}),mesh=new THREE.Mesh(new THREE.BoxGeometry(),material);root.add(mesh);const uv=mesh.geometry.attributes.uv.array.slice(),textures=createCircuitTextures();textures.applyRoot(root);expect(material.map).toBe(texture);expect(mesh.geometry.attributes.uv.array).toEqual(uv);
  const windows=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({name:'CITY_glass',color:0x36596a}));root.add(windows);const details=createNexusDetails(root,[{name:'CITY_Power_Factory__cement',box:new THREE.Box3(new THREE.Vector3(0,0,0),new THREE.Vector3(20,20,20)),position:new THREE.Vector3(5,20,5)}]);const rotor=root.getObjectByName('Ventilación urbana').children.find(c=>c.isGroup);
  details.update(1,false,{night:false});const angle=rotor.rotation.y,day=windows.material.emissiveIntensity;details.update(2,false,{night:true});expect(rotor.rotation.y).not.toBe(angle);expect(windows.material.emissiveIntensity).toBeGreaterThan(day);details.update(3,true);const still=rotor.rotation.y;details.update(4,true);expect(rotor.rotation.y).toBe(still);expect(root.getObjectByName('Vapor industrial').visible).toBe(false);textures.dispose();texture.dispose();
});

test('map selection opens Nexus, both light controls work, recovery and pause preserve the session',async({page})=>{
  test.setTimeout(150000);await page.setViewportSize({width:960,height:640});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.goto('/simulator.html');await launchFromLobby(page,{map:'nexus'});const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:90000});await expect(app).toHaveAttribute('data-map','nexus');await expect(page.locator('#flight-seed')).toHaveText('1212 M · HOVER');await expect(app).toHaveAttribute('data-comic','true');await expect(app).toHaveAttribute('data-headlights','false');
  await page.keyboard.down('KeyW');await expect.poll(async()=>Number(await app.getAttribute('data-speed')),{timeout:20000}).toBeGreaterThan(15);await page.keyboard.up('KeyW');await page.keyboard.down('KeyE');await expect(app).toHaveAttribute('data-drifting','true');await page.keyboard.up('KeyE');await page.keyboard.press('KeyF');await expect(app).toHaveAttribute('data-headlights','true');await page.getByRole('button',{name:'Iluminación nocturna'}).click();await expect(app).toHaveAttribute('data-lighting','night');
  await page.keyboard.press('Escape');await expect(app).toHaveAttribute('data-phase','paused');const before=await app.evaluate(e=>[e.dataset.time,e.dataset.effectsTime]);await page.waitForTimeout(300);expect(await app.evaluate(e=>[e.dataset.time,e.dataset.effectsTime])).toEqual(before);await page.getByRole('button',{name:'Continuar',exact:false}).first().click();await page.keyboard.press('KeyR');await expect.poll(async()=>Number(await app.getAttribute('data-speed'))).toBeLessThan(1);await page.getByRole('button',{name:'Cómic',exact:true}).click();await expect(app).toHaveAttribute('data-comic','false');expect(errors).toEqual([]);
  await page.keyboard.press('Escape');await page.getByRole('link',{name:'Ruinas 034'}).click();await launchFromLobby(page);await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});await expect(app).toHaveAttribute('data-map','ruins');await expect(app).toHaveAttribute('data-comic','false');await expect(app).toHaveAttribute('data-headlights','false');
});

test('Nexus mobile selector, touch driving and independent records',async({browser})=>{
  test.setTimeout(120000);const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();await page.addInitScript(()=>{localStorage.setItem('zud.hover.v2.ruins034','33');localStorage.setItem('zud.hover.v1.nexus035','48');});await page.goto(`http://127.0.0.1:${process.env.TEST_PORT??5173}/simulator.html?map=nexus`);await launchFromLobby(page);const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:90000});await expect(page.locator('#flight-best')).toHaveText('00:48.00');await expect(page.locator('[data-map-link=ruins]')).toBeAttached();const accel=page.getByRole('button',{name:'Acelerar',exact:true}),b=await accel.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await expect.poll(async()=>Number(await app.getAttribute('data-speed')),{timeout:15000}).toBeGreaterThan(6);await page.mouse.up();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);await context.close();
});
