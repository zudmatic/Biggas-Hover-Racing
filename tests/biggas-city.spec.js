import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {collisionMaterials,createCityCollision} from '../src/circuit-collision.js';
import {createCircuitLandscape,createHoverState,advanceHover,crossesCircuitGate,recoverHover} from '../src/circuit-physics.js';
import {prepareBiggasCity} from '../src/biggas-city-scene.js';
import {createBiggasCityDetails} from '../src/biggas-city-details.js';
import {createCircuitTextures} from '../src/circuit-textures.js';
import {withFlightOptions} from './helpers/flight.js';
const base='public/models/biggas-city/',route=JSON.parse(fs.readFileSync(base+'route_gltf.json')),gameplay=JSON.parse(fs.readFileSync(base+'gameplay.json'));
const track=()=>Object.assign(createCircuitLandscape(route,gameplay),{physicalBoundaries:true,map:'biggas-city'});
async function load(part){const bytes=fs.readFileSync(base+`Biggas_City_039_v02_${part}.glb`);const loader=new GLTFLoader();if(part==='Collision')loader.register(collisionMaterials);return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');}
const wrap=n=>Math.atan2(Math.sin(n),Math.cos(n));

test('Biggas City road, grid and recovery align with all 1818 authored route samples',async()=>{
  const asset=await load('Collision'),world=createCityCollision(asset.scene,{surfaceName:'COL_ROAD'}),map=track();
  expect(map.length).toBe(3635.94);expect(map.gates).toHaveLength(33);expect(gameplay.spawn_positions).toHaveLength(12);
  for(const sample of map.samples)for(const offset of [-9,0,9]){const [x,y,z]=sample.position,[nx,,nz]=sample.forward,h=world.surfaceHeight(x-nz*offset,z+nx*offset);expect(h).not.toBeNull();expect(Math.abs(h-y)).toBeLessThan(.06);}
  for(let gate=0;gate<33;gate++){const state=recoverHover(map,gate);world.step(state,1/60,map);expect(state.wallHit).toBe(false);expect(state.recoverNeeded).toBe(false);}
  const impactState=createHoverState(map),road=map.atDistance(300);Object.assign(impactState,{x:road.x,y:road.y+.65,z:road.z,yaw:Math.atan2(-road.nz,road.nx),speed:45,throttle:45,vx:-road.nz*45,vz:road.nx*45});
  let impact=false;for(let i=0;i<90;i++){const previous=advanceHover(impactState,{},1/60,map,world.surfaceHeight);world.step(impactState,1/60,map,previous);impact ||= impactState.wallHit;}expect(impact).toBe(true);
  const state=createHoverState(map);let gate=0,hits=0;
  for(let i=0;i<240*60;i++){
    const road=map.roadAt(state.x,state.z),ahead=map.atDistance(road.distance+Math.max(4,state.speed*.3)),a=map.atDistance(road.distance+3),b=map.atDistance(road.distance+13),curvature=Math.abs(wrap(Math.atan2(b.nx,b.nz)-Math.atan2(a.nx,a.nz)))/10,target=Math.min(45,Math.sqrt(16/Math.max(curvature,.002))),error=wrap(Math.atan2(ahead.x-state.x,ahead.z-state.z)-state.yaw);
    const previous=advanceHover(state,{turn:THREE.MathUtils.clamp(-error*3.5/(2.65-.9*state.speed/72),-1,1),throttle:state.throttle<target-.5?1:state.throttle>target+.5?-1:0,brake:state.speed>target+7},1/60,map,world.surfaceHeight);world.step(state,1/60,map,previous);hits+=Number(state.wallHit);expect(state.recoverNeeded).toBe(false);
    if(crossesCircuitGate(previous,state,map.gates[gate])){gate++;if(gate===33)break;}
  }
  expect(gate).toBe(33);expect(hits).toBe(0);world.dispose();
});

test('authored cascade flows, river ripples and forest leaves move, pause and respect reduced motion',async()=>{
  const assets=await Promise.all(['Cascade','Forest_LOD1'].map(load)),root=new THREE.Group(),textures=createCircuitTextures(),authored=prepareBiggasCity(assets,root,textures),details=createBiggasCityDetails(root,track(),authored);
  expect(root.children.some(m=>m.isInstancedMesh&&m.count>10)).toBe(true);
  const basalt=root.children.find(m=>m.material?.name==='Basalto estratificado');expect(basalt.material.color.r).toBeCloseTo(.165,4);
  expect(root.children.filter(m=>m.isInstancedMesh).every(m=>m.instanceMatrix.count===256)).toBe(true);
  expect(details.leaves.count).toBe(240);expect(details.spray.geometry.attributes.position.count).toBeGreaterThan(0);
  const fall=authored.waters.find(w=>w.mesh.name==='Main_waterfall_veil'),river=authored.waters.find(w=>w.mesh.name==='Continuous_meandering_river');
  const impact=root.getObjectByName('Espuma turbulenta al pie de cascada');expect(impact.isInstancedMesh).toBe(true);expect(impact.count).toBe(48);
  const snapshot=()=>[Array.from(impact.instanceMatrix.array),Array.from(fall.mesh.geometry.attributes.position.array),Array.from(river.mesh.geometry.attributes.position.array),Array.from(details.leaves.instanceMatrix.array),Array.from(fall.mesh.geometry.attributes.uv.array),Array.from(river.mesh.geometry.attributes.uv.array)];
  details.update(1,false,{phase:'flying'});const before=snapshot();details.update(2,false,{phase:'flying'});const moving=snapshot();moving.forEach((v,i)=>expect(v).not.toEqual(before[i]));
  details.update(4,false,{phase:'paused'});expect(snapshot()).toEqual(moving);
  details.update(5,true,{phase:'flying'});const still=snapshot();details.update(9,true,{phase:'flying'});expect(snapshot()).toEqual(still);expect(details.leaves.visible).toBe(false);expect(details.spray.visible).toBe(false);expect(impact.visible).toBe(false);
  details.dispose();textures.dispose();
});

test('Biggas City launches from the selector with clouds, driving, headlights and day/night',async({page})=>{
  test.setTimeout(360000);await page.setViewportSize({width:960,height:640});await page.addInitScript(()=>localStorage.setItem('biggas-hover-racing-quality','performance'));const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/?selection=map&map=biggas-city');await expect(page.locator('.lobby-map-card')).toHaveCount(4);await expect(page.locator('input[value="biggas-city"]')).toBeChecked();
  await expect.poll(()=>page.locator('.lobby-map-art img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0))).toBe(true);
  await page.getByRole('button',{name:'Volar',exact:true}).click();const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:240000});await expect(app).toHaveAttribute('data-map','biggas-city');await expect(app).toHaveAttribute('data-comic','false');await expect(app).toHaveAttribute('data-look','psx');expect(Number(await app.getAttribute('data-cloud-count'))).toBeGreaterThan(0);
  await page.keyboard.down('KeyW');await expect.poll(async()=>Number(await app.getAttribute('data-speed')),{timeout:20000}).toBeGreaterThan(12);await page.keyboard.up('KeyW');await page.screenshot({path:'.context/biggas-driving.png'});await page.keyboard.press('KeyF');await expect(app).toHaveAttribute('data-headlights','true');
  await withFlightOptions(page,()=>page.getByRole('button',{name:'Iluminación nocturna'}).click());await expect(app).toHaveAttribute('data-lighting','night');
  await page.keyboard.press('Escape');const before=await app.getAttribute('data-effects-time');await page.waitForTimeout(250);expect(await app.getAttribute('data-effects-time')).toBe(before);
  await withFlightOptions(page,()=>page.getByRole('button',{name:'Cómic',exact:true}).click());await expect(app).toHaveAttribute('data-comic','true',{timeout:60000});await expect(app).toHaveAttribute('data-look','comic');await withFlightOptions(page,()=>page.getByRole('button',{name:'Cómic',exact:true}).click());await expect(app).toHaveAttribute('data-look','psx');expect(errors.length,errors.slice(0,3).join('\n')).toBe(0);
});

test('four map cards fit a phone and preserve Biggas City selection',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/?selection=map&map=biggas-city&comic=0');
  await expect(page.getByText('Biggas Forest',{exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await expect(page.locator('input[value="biggas-city"]')).toBeChecked();await expect(page.getByRole('button',{name:'Volar',exact:true})).toBeVisible();
});


test('all authored street and monument lights stay on regardless of ship distance or daylight',async()=>{
  const assets=await Promise.all(['City','Landmark'].map(load));assets.at(-1).scene.userData.landmark=true;
  const root=new THREE.Group(),textures=createCircuitTextures(),authored=prepareBiggasCity(assets,root,textures);
  expect(authored.fixtures).toHaveLength(43);expect(authored.fixtures.filter(f=>f.spot)).toHaveLength(4);
  const details=createBiggasCityDetails(root,track(),authored,{mobile:true});
  const windows=[];root.traverse(m=>{if(m.material?.name==='039_WindowWarm')windows.push(m.material);});expect(windows.length).toBeGreaterThan(0);
  expect(details.pointPool).toHaveLength(39);expect(details.spotPool).toHaveLength(4);
  const lights=[...details.pointPool,...details.spotPool],snapshot=()=>lights.map(light=>({position:light.position.toArray(),intensity:light.intensity}));
  details.update(1,false,{state:{x:0,y:0,z:0},night:false});const day=snapshot();expect(lights.every(light=>light.intensity>0)).toBe(true);
  expect(windows.every(m=>m.emissiveIntensity===0)).toBe(true);
  details.update(2,false,{state:{x:10000,y:1000,z:10000},night:true});expect(snapshot()).toEqual(day);
  expect(windows.every(m=>m.emissiveIntensity>0)).toBe(true);
  details.update(2,false,{phase:'paused',night:false});expect(windows.every(m=>m.emissiveIntensity===0)).toBe(true);
  details.update(3,true,{state:{x:-10000,y:1000,z:-10000},night:false});expect(snapshot()).toEqual(day);
  authored.fixtures.filter(f=>f.spot).forEach((f,i)=>expect(details.spotPool[i].target.position.distanceTo(f.target)).toBeLessThan(.001));
  details.dispose();textures.dispose();
});

test('corner seams bounce on supported road, retain recoil and allow driving away',()=>{
  const root=new THREE.Group(),floor=new THREE.Mesh(new THREE.PlaneGeometry(20,100).rotateX(-Math.PI/2));floor.name='COL_ROAD';root.add(floor);
  const world=createCityCollision(root,{surfaceName:'COL_ROAD'}),map={spawn:{x:9.8,y:.65,z:0},yaw:Math.PI/2,physicalBoundaries:true,roadAt:(x,z)=>({x:0,y:0,z,nx:0,nz:1,offset:-x,width:20,distanceToRoad:Math.abs(x),grade:0})};
  const state=createHoverState(map);Object.assign(state,{vx:40,vz:8,speed:Math.hypot(40,8),throttle:40});
  const previous=advanceHover(state,{},1/60,map,world.surfaceHeight);expect(world.surfaceHeight(state.x,state.z)).toBeNull();world.step(state,1/60,map,previous);
  expect(state.wallHit).toBe(true);expect(state.impactSerial).toBe(1);expect(state.recoverNeeded).toBe(false);expect(state.x).toBeLessThan(10);expect(state.vx).toBeLessThan(-5);expect(state.vz).toBeGreaterThan(5);
  const afterImpact=state.x,prev=advanceHover(state,{throttle:1},1/60,map,world.surfaceHeight);world.step(state,1/60,map,prev);expect(state.x).toBeLessThan(afterImpact);expect(state.recoverNeeded).toBe(false);
  state.yaw=0;state.throttle=20;
  for(let i=0;i<120;i++){const p=advanceHover(state,{throttle:1},1/60,map,world.surfaceHeight);world.step(state,1/60,map,p);expect(state.recoverNeeded).toBe(false);}
  expect(state.z).toBeGreaterThan(30);expect(state.speed).toBeGreaterThan(20);
  Object.assign(state,{x:30,z:0,vx:0,vz:0});world.step(state,.1,map);expect(state.recoverNeeded).toBe(false);world.step(state,.3,map);expect(state.recoverNeeded).toBe(true);
  Object.assign(state,{x:100,unsupportedTime:0});world.step(state,1/60,map);expect(state.recoverNeeded).toBe(true);world.dispose();
});

test('Biggas City barriers and corners absorb boosted impacts without checkpoint resets',async()=>{
  const asset=await load('Collision'),world=createCityCollision(asset.scene,{surfaceName:'COL_ROAD'}),map=track();let impacts=0;
  // Both sides, head-on and glancing impacts, throughout all authored sectors.
  for(let distance=0;distance<map.length;distance+=100)for(const side of [-1,1])for(const tangent of [0,.7]){
    const road=map.atDistance(distance),state=createHoverState(map),nx=-road.nz*side,nz=road.nx*side,yaw=Math.atan2(nx+road.nx*tangent,nz+road.nz*tangent);
    Object.assign(state,{x:road.x+nx*7,z:road.z+nz*7,y:road.y+.65,yaw,vx:Math.sin(yaw)*72,vz:Math.cos(yaw)*72,speed:72,throttle:52});
    for(let i=0;i<40;i++){
      const p=advanceHover(state,{boost:true,throttle:1},1/60,map,world.surfaceHeight);world.step(state,1/60,map,p);
      expect(state.recoverNeeded,`Unexpected recovery at ${distance}m, side ${side}, tangent ${tangent}, frame ${i}`).toBe(false);
    }
    expect(state.impactSerial).toBeGreaterThan(0);impacts+=state.impactSerial;
  }
  expect(impacts).toBeGreaterThan(100);world.dispose();
});
