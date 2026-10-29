import {test,expect} from '@playwright/test';import fs from 'node:fs';import * as T from 'three';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createCircuitLandscape,createHoverState,advanceHover} from '../src/circuit-physics.js';
import {createBiggasRoutes,openBiggasRoutes} from '../src/biggas-city-routes.js';
import {prepareBiggasForest,populateBiggasForest} from '../src/biggas-forest.js';
import {createBiggasForestAdventure} from '../src/biggas-forest-adventure.js';
import {prepareBiggasCity} from '../src/biggas-city-scene.js';
import {createCircuitTextures} from '../src/circuit-textures.js';
import {createCityCollision} from '../src/circuit-collision.js';
const load=async part=>{const b=fs.readFileSync(`public/models/biggas-city/Biggas_City_039_v02_${part}.glb`);return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'');};
let assets,colliders,landscape,routes,materials,forest,root,textures,authored,adventure,collision;
test.beforeAll(async()=>{
assets=await Promise.all(['Core','Forest_LOD1','Cascade'].map(load));colliders=await load('Collision');
landscape=createCircuitLandscape(JSON.parse(fs.readFileSync('public/models/biggas-city/route_gltf.json')),JSON.parse(fs.readFileSync('public/models/biggas-city/gameplay.json')));
const terrain=[];assets[0].scene.traverse(m=>{if(m.isMesh&&/Continuous_sculpted_landscape/.test(m.name))terrain.push(m);});
routes=createBiggasRoutes(landscape,{terrain});materials=prepareBiggasForest(assets,colliders.scene,landscape,routes);openBiggasRoutes(assets,colliders.scene,routes);forest=populateBiggasForest(assets,landscape,routes);
root=new T.Group();textures=createCircuitTextures({size:16,style:'biggas-city'});authored=prepareBiggasCity(assets,root,textures);adventure=createBiggasForestAdventure(root,colliders.scene,landscape,routes,textures,forest,materials);collision=createCityCollision(colliders.scene,{surfaceName:'COL_ROAD'});
});

test('forest conversion removes urban loading and fills the map with shared grounded trees',async()=>{
  const {circuitMap}=await import('../src/circuit-maps.js');const config=circuitMap('biggas-city');
  expect(config.name).toBe('Biggas Forest');expect(config.models).toHaveLength(3);expect(config.models.some(f=>/Landmark|_City\.glb/.test(f))).toBe(false);
  expect(authored.fixtures).toHaveLength(0);expect(forest.added).toBeGreaterThan(1000);expect(forest.added).toBeLessThan(1900);
  expect(forest.obstacles).toHaveLength(8);expect(adventure.train).toBeUndefined();
  expect(forest.trees.filter(t=>t.z>40&&t.y<30).length).toBeGreaterThan(300);
  let urban=0;root.traverse(o=>{if(/CAT_|Urban_plaza|Asset_(hotel|building|office)|Ferrocarril|Encuentros|Gallery|Market/i.test(o.name))urban++;});expect(urban).toBe(0);
  for(const tree of forest.trees.filter(t=>!t.collision)){expect(Math.abs(tree.y-forest.height(tree.x,tree.z))).toBeLessThan(.001);}
});

test('all original checkpoints and every forest trail have a supported driving surface',()=>{
  let holes=0,maxError=0;
  for(const sample of landscape.samples){const [x,y,z]=sample.position,h=collision.surfaceHeight(x,z);if(h===null)holes++;else maxError=Math.max(maxError,Math.abs(h-y));}
  expect(holes).toBe(0);expect(maxError).toBeLessThan(3); // the optional jump remains above the road
  for(const branch of routes.branches)for(const p of branch.samples){const h=collision.surfaceHeight(p.x,p.z);expect(h).not.toBeNull();expect(Math.abs(h-p.y)).toBeLessThan(.1);}
});

test('dirt slalom has a continuous safe line and trunk impacts rebound without recovery',()=>{
  const state=createHoverState(landscape);let hits=0;
  for(let d=1640;d<=1890;d+=1){
    const p=landscape.atDistance(d),offset=4.8*Math.cos((d-1660)/29*Math.PI),previous={x:state.x,y:state.y,z:state.z};
    Object.assign(state,{x:p.x-p.nz*offset,z:p.z+p.nx*offset,y:p.y+.65,yaw:Math.atan2(p.nx,p.nz),vx:p.nx*24,vz:p.nz*24,speed:24});
    collision.step(state,1/60,landscape,previous);hits+=Number(state.wallHit);expect(state.recoverNeeded).toBe(false);
  }
  expect(hits).toBe(0);
  const tree=forest.obstacles[0],p=landscape.atDistance(tree.distance),previous={x:tree.x-p.nx*3,z:tree.z-p.nz*3,y:p.y+.65};
  Object.assign(state,{x:tree.x-p.nx*1.9,z:tree.z-p.nz*1.9,y:p.y+.65,yaw:Math.atan2(p.nx,p.nz),vx:p.nx*25,vz:p.nz*25,speed:25});
  collision.step(state,1/60,landscape,previous);expect(state.wallHit).toBe(true);expect(state.impact).toBeGreaterThan(1);expect(state.recoverNeeded).toBe(false);
});

test('natural cave has open entrances, headroom and physical walls throughout the passage',()=>{
  expect(adventure.cave.geometry.index.count/3).toBeLessThan(4000);const state=createHoverState(landscape);
  for(const p of adventure.cave.samples){
    for(const offset of [-3,0,3]){Object.assign(state,{x:p.x-p.nz*offset,z:p.z+p.nx*offset,y:p.y+.65,yaw:Math.atan2(p.nx,p.nz),vx:p.nx*20,vz:p.nz*20,speed:20});collision.step(state,1/60,landscape);expect(state.wallHit).toBe(false);expect(state.recoverNeeded).toBe(false);}
  }
  const p=adventure.cave.samples[Math.floor(adventure.cave.samples.length/2)],from=new T.Vector3(p.x,p.y+3,p.z),to=new T.Vector3(p.x,p.y+18,p.z);collision.clipCamera(from,to);expect(to.y).toBeLessThan(p.y+12);expect(to.y).toBeGreaterThan(p.y+6);
});

test('dirt dust follows driving and respects pause, reduced motion and reset',()=>{
  const state={...createHoverState(landscape),...landscape.atDistance(1690),speed:30,onDirt:true};
  adventure.update(1,false,{state,phase:'flying',dt:1/24});const before=Array.from(adventure.dust.geometry.attributes.position.array);expect(before.some(v=>v!==-999)).toBe(true);
  adventure.update(2,false,{state,phase:'paused',dt:1/24});expect(Array.from(adventure.dust.geometry.attributes.position.array)).toEqual(before);
  adventure.update(3,true,{state,phase:'flying',dt:1/24});expect(adventure.dust.visible).toBe(false);adventure.reset();expect([...adventure.dust.geometry.attributes.position.array].every(v=>v===-999)).toBe(true);
});

test('a steering-controlled vehicle can drive the dirt slalom without a reset',()=>{
  const state=createHoverState(landscape),offsetAt=d=>4.8*Math.cos((d-1660)/29*Math.PI),start=landscape.atDistance(1640),offset=offsetAt(1640);
  Object.assign(state,{x:start.x-start.nz*offset,y:start.y+.65,z:start.z+start.nx*offset,yaw:Math.atan2(start.nx,start.nz),vx:start.nx*20,vz:start.nz*20,speed:20,throttle:20});
  let completed=false,hits=0;
  for(let i=0;i<60*25;i++){
    const road=landscape.roadAt(state.x,state.z),target=landscape.atDistance(road.distance+6),lateral=offsetAt(target.distance),yaw=Math.atan2(target.x-target.nz*lateral-state.x,target.z+target.nx*lateral-state.z),error=Math.atan2(Math.sin(yaw-state.yaw),Math.cos(yaw-state.yaw));
    const previous=advanceHover(state,{turn:T.MathUtils.clamp(-error*4/(2.65-.9*state.speed/72),-1,1),throttle:state.throttle<23?1:state.throttle>24?-1:0},1/60,landscape,collision.surfaceHeight);
    collision.step(state,1/60,landscape,previous);adventure.step(state,1/60);hits+=Number(state.wallHit);expect(state.recoverNeeded).toBe(false);
    if(road.distance>1890){completed=true;break;}
  }
  expect(completed).toBe(true);expect(hits).toBe(0);
});
