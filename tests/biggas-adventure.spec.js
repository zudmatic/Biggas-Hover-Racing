import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createCircuitLandscape,createHoverState,advanceHover,crossesCircuitGate,recoverHover} from '../src/circuit-physics.js';
import {createCityCollision,createSurfaceIndex} from '../src/circuit-collision.js';
import {createBiggasRoutes,openBiggasRoutes,routeRibbon} from '../src/biggas-city-routes.js';
import {prepareBiggasCity} from '../src/biggas-city-scene.js';
import {createBiggasAdventure} from '../src/biggas-city-adventure.js';
import {createBiggasCityDetails} from '../src/biggas-city-details.js';
import {createCircuitTextures} from '../src/circuit-textures.js';
import {addBiggasGrass} from '../src/biggas-city-terrain.js';
import {createRailwaySection} from '../src/biggas-city-train.js';
const base='public/models/biggas-city/',route=JSON.parse(fs.readFileSync(base+'route_gltf.json')),gameplay=JSON.parse(fs.readFileSync(base+'gameplay.json')),wrap=n=>Math.atan2(Math.sin(n),Math.cos(n));
let world;
test.beforeAll(async()=>{
  async function load(part){const b=fs.readFileSync(base+`Biggas_City_039_v02_${part}.glb`);return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'');}
  const assets=await Promise.all(['Core','City','Forest_LOD1','Cascade','Landmark'].map(load)),colliders=(await load('Collision')).scene,root=new T.Group(),textures=createCircuitTextures({size:32}),map=createCircuitLandscape(route,gameplay);map.physicalBoundaries=true;
  const terrain=[];assets[0].scene.traverse(m=>{if(m.isMesh&&/Continuous_sculpted_landscape/.test(m.name))terrain.push(m);});
  const routes=createBiggasRoutes(map,{terrain});openBiggasRoutes(assets,colliders,routes);assets.at(-1).scene.userData.landmark=true;
  const cascadeSign=['Sector_sign_post008','Sector_direction_panel008','09____CASCADE'].map(name=>new T.Box3().setFromObject(assets[0].scene.getObjectByName(name)));


  const trees=[];for(const asset of assets){asset.scene.updateMatrixWorld(true);asset.scene.traverse(m=>{if(m.isMesh&&/leaf|pine|tree/i.test(m.name)){m.geometry.computeBoundingBox();trees.push(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld));}});}
  const authored=prepareBiggasCity(assets,root,textures),adventure=createBiggasAdventure(root,colliders,map,routes,textures,{adFacades:authored.adFacades}),collision=createCityCollision(colliders,{surfaceName:'COL_ROAD'}),details=createBiggasCityDetails(root,map,authored,{windAt:adventure.windAt});
  const buildings=[];assets[1].scene.updateMatrixWorld(true);assets[1].scene.traverse(m=>{if(m.isMesh&&/Asset_(hotel|apartment|office|building)/i.test(m.name)){m.geometry.computeBoundingBox();buildings.push(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld));}});
  const grass=addBiggasGrass(root,map);world={root,textures,map,routes,authored,adventure,collision,details,colliders,grass,buildings,trees,cascadeSign};
});
test.afterAll(()=>{if(!world)return;world.adventure.dispose();world.details.dispose();world.collision.dispose();world.textures.dispose();const gs=new Set(),ms=new Set();for(const root of [world.root,world.colliders])root.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.geometry)gs.add(o.geometry);if(o.material)ms.add(o.material);});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());});

test('all 20 ads are installed, share one texture, clear the railway and follow the train',()=>{
  const {adventure,root,map}=world,{ads,train}=adventure;
  expect(ads.placements.map(p=>p.id).sort((a,b)=>a-b)).toEqual(Array.from({length:20},(_,i)=>i+1));
  const meshes=[];root.traverse(m=>{if(m.material===ads.material)meshes.push(m);});
  expect(meshes.length).toBeLessThanOrEqual(16);
  expect(meshes.every(m=>!m.castShadow&&m.material.map===ads.texture)).toBe(true);
  expect(meshes.reduce((sum,m)=>sum+(m.geometry.index?.count??m.geometry.attributes.position.count)/3*(m.count??1),0)).toBeLessThan(100);
  for(const foot of ads.supports){const road=map.roadAt(foot.x,foot.z);expect(road.distanceToRoad,`ad support ${foot.toArray()}`).toBeGreaterThan(road.width/2+1.5);}
  // Check the entire moving train envelope against each static sign rectangle.
  for(const ad of ads.placements.filter(p=>p.position)){
    const right=new T.Vector3(ad.normal.z,0,-ad.normal.x);
    for(const point of train.route.points){const delta=point.clone().add(new T.Vector3(0,2.7,0)).sub(ad.position);
      const overlap=Math.abs(delta.dot(ad.normal))<2.8&&Math.abs(delta.dot(right))<ad.width/2+2.8&&Math.abs(delta.y)<ad.height/2+2.5;
      expect(overlap,`ad ${ad.id} intersects train`).toBe(false);
    }
  }
  const livery=ads.placements.find(p=>p.id===10).mesh;train.update(21,false,{phase:'flying'});
  expect(livery.instanceMatrix.array).toEqual(train.meshes[0].instanceMatrix.array);
  const matrix=livery.instanceMatrix.array.slice();train.update(45,false,{phase:'paused'});expect(livery.instanceMatrix.array).toEqual(matrix);train.reset();
});

for(const id of ['market','roots','falls'])test(`${id}: a complete drivable shortcut crosses every required checkpoint`,()=>{
  const {map,routes,collision,adventure}=world,branch=routes.branches.find(b=>b.id===id);adventure.reset();
  expect(branch.length).toBeLessThan(branch.end-branch.start);
  for(const p of branch.samples){
    const height=collision.surfaceHeight(p.x,p.z);expect(height).not.toBeNull();expect(Math.abs(height-p.y)).toBeLessThan(.05);
    const state={...createHoverState(map),x:p.x,y:p.y+.65,z:p.z,yaw:Math.atan2(p.nx,p.nz)};collision.step(state,1/60,map);expect(state.wallHit,`${id} blocked at ${p.station}`).toBe(false);expect(state.recoverNeeded).toBe(false);
  }
  const first=map.atDistance(branch.start-8),state={...createHoverState(map),x:first.x,y:first.y+.65,z:first.z,yaw:Math.atan2(first.nx,first.nz),throttle:25};
  let gate=map.gates.findIndex(g=>g.distance>branch.start),expected=map.gates.findIndex(g=>g.distance>branch.end),maximum=0;
  for(let i=0;i<90*60;i++){
    const r=routes.nearest(state.x,state.z),fraction=T.MathUtils.clamp((r.distance-branch.start)/(branch.end-branch.start),0,1),ahead=routes.onBranch(branch,fraction+Math.max(5,state.speed*.28)/branch.length),error=wrap(Math.atan2(ahead.x-state.x,ahead.z-state.z)-state.yaw),target=Math.abs(error)>.3?17:30;
    const previous=advanceHover(state,{turn:T.MathUtils.clamp(-error*3/(2.65-.9*state.speed/72),-1,1),throttle:state.throttle<target?1:-1,brake:state.speed>target+6},1/60,map,collision.surfaceHeight);collision.step(state,1/60,map,previous);adventure.step(state,1/60);
    expect(state.recoverNeeded).toBe(false);expect(state.wallHit).toBe(false);maximum=Math.max(maximum,fraction);
    if(gate<expected&&crossesCircuitGate(previous,state,map.gates[gate]))gate++;
    if(fraction>.995)break;
  }
  expect(maximum).toBeGreaterThan(.995);expect(gate).toBe(expected);
  const recovered=recoverHover(map,gate);collision.step(recovered,1/60,map);expect(recovered.recoverNeeded).toBe(false);expect(recovered.wallHit).toBe(false);
});

test('the main road and its recovery gates remain unobstructed; all 43 lights survive',()=>{
  const {map,collision,authored}=world;expect(authored.fixtures).toHaveLength(43);
  for(let d=0;d<map.length;d+=2){const p=map.atDistance(d),state={...createHoverState(map),x:p.x,y:p.y+.65,z:p.z,yaw:Math.atan2(p.nx,p.nz)};collision.step(state,1/60,map);expect(state.wallHit,`main road ${d}`).toBe(false);expect(state.recoverNeeded).toBe(false);}
  for(let i=0;i<map.gates.length;i++){const state=recoverHover(map,i);collision.step(state,1/60,map);expect(state.wallHit).toBe(false);expect(state.recoverNeeded).toBe(false);}
});

test('visible paving and gallery foundations do not cover the physical shortcut floors',()=>{
  const {root,routes}=world,ray=new T.Raycaster(),down=new T.Vector3(0,-1,0);root.updateMatrixWorld(true);ray.near=0;ray.far=3.1;
  for(const branch of routes.branches)for(let fraction=.05;fraction<=.95;fraction+=.025){
    const p=routes.onBranch(branch,fraction);ray.set(new T.Vector3(p.x,p.y+3,p.z),down);
    const hit=ray.intersectObject(root,true).find(h=>h.object.visible);
    expect(hit,`${branch.id}: missing visible floor at ${fraction}`).toBeDefined();
    expect(hit.point.y-p.y,`${branch.id}: ${hit.object.name} covers the floor at ${fraction}`).toBeLessThan(.15);
  }
});

test('grass has a separate material and grounded opaque clumps outside every racing lane',()=>{
  const {root,map,grass}=world,terrain=root.children.filter(m=>m.material?.name==='Vegetacion terreno'),height=createSurfaceIndex(terrain),blades=root.children.filter(m=>m.name==='Pasto · borde natural');
  expect(terrain.length).toBeGreaterThan(0);expect(grass.clumps).toBeGreaterThan(500);expect(grass.triangles).toBeLessThan(40000);expect(grass.batches).toBeLessThan(16);
  expect(terrain[0].material.userData.circuitSurface).toBe('grass');expect(terrain[0].material.vertexColors).toBe(true);
  expect(terrain.reduce((n,m)=>n+m.geometry.index.count/3,0)).toBeLessThan(65000);
  for(const b of map.branches)for(let i=0;i<b.samples.length;i+=4){const p=b.samples[i];for(const offset of [-p.width/2+.8,0,p.width/2-.8]){const h=height(p.x-p.nz*offset,p.z+p.nx*offset);if(h!==null)expect(h,`${b.id} hillside covers the road at ${p.station}`).toBeLessThan(p.y+p.bank*offset+.04);}}
  for(const mesh of blades){
    expect(mesh.material.transparent).toBe(false);expect(mesh.castShadow).toBe(false);const p=mesh.geometry.attributes.position;
    // Every blade starts on the rendered terrain, including sloped shoulders.
    for(let i=0;i<p.count;i+=9){const x=(p.getX(i)+p.getX(i+1))/2,z=(p.getZ(i)+p.getZ(i+1))/2,y=p.getY(i),road=map.roadAt(x,z);expect(road.distanceToRoad).toBeGreaterThan(road.width/2+1.5);expect(Math.abs(y-height(x,z))).toBeLessThan(.04);}
  }
});

test('shortcuts are dry and contain no puddle surfaces or wake effects',()=>{
  const {adventure,map,routes}=world;adventure.reset();
  for(const branch of routes.branches){const p=routes.onBranch(branch,.5),state={...createHoverState(map),x:p.x,y:p.y+.65,z:p.z,vx:p.nx*35,vz:p.nz*35,speed:35};adventure.step(state,1/60);expect(state.wetSurface).toBe(false);}
  const puddles=[];adventure.group.traverse(m=>{if(/charcos|puddle|estelas/i.test(m.name+' '+m.material?.name))puddles.push(m);});expect(puddles).toHaveLength(0);expect(adventure.wakes).toBeUndefined();expect(adventure.puddles).toBeUndefined();
});

test('wind has a gentle continuous falloff; pause/reduced motion preserve gameplay and freeze decoration',()=>{
  const {adventure,map,routes,details}=world;adventure.reset();const p=routes.onBranch(routes.branches[1],.5),state={...createHoverState(map),x:p.x,y:p.y+.65,z:p.z,speed:30,vx:p.nx*30,vz:p.nz*30};
  const wind=adventure.windAt(p.x,p.z,0);expect(wind.strength).toBeGreaterThan(1);expect(wind.strength).toBeLessThan(3);expect(adventure.windAt(10000,10000).strength).toBe(0);
  const before=[state.vx,state.vz];adventure.step(state,1/60);expect([state.vx,state.vz]).not.toEqual(before);expect(Math.hypot(state.vx-before[0],state.vz-before[1])).toBeLessThan(.05);expect(state.energy).toBe(1);
  adventure.update(2,false,{state,phase:'flying'});const ribbon=adventure.ribbons[0].mesh.geometry.attributes.position,vertices=ribbon.array.slice(),train=adventure.train.meshes[0].instanceMatrix.array.slice();
  adventure.update(8,false,{state,phase:'paused'});expect(ribbon.array).toEqual(vertices);expect(adventure.train.meshes[0].instanceMatrix.array).toEqual(train);
  adventure.update(9,true,{state,phase:'flying'});expect(adventure.splash.visible).toBe(false);expect(adventure.mist.visible).toBe(false);expect(adventure.train.meshes[0].instanceMatrix.array).toEqual(train);expect(adventure.train.moving.visible).toBe(true);
  for(let i=0;i<ribbon.count;i++)expect(ribbon.getZ(i)).toBe(0);
  details.update(3,false,{state,phase:'flying'});const leaves=details.leaves.instanceMatrix.array.slice();details.update(4,false,{state,phase:'flying'});expect(details.leaves.instanceMatrix.array).not.toEqual(leaves);
});

test('boosted impacts against shortcut edges rebound without false off-track recovery',()=>{
  const {map,routes,collision}=world;let impacts=0;
  for(const branch of routes.branches)for(let distance=35;distance<branch.length-30;distance+=35)for(const side of [-1,1])for(const tangent of [0,.65]){
    const p=routes.onBranch(branch,distance/branch.length),nx=-p.nz*side,nz=p.nx*side,yaw=Math.atan2(nx+p.nx*tangent,nz+p.nz*tangent),state={...createHoverState(map),x:p.x+nx*(branch.width/2-3),y:p.y+.65,z:p.z+nz*(branch.width/2-3),yaw,vx:Math.sin(yaw)*72,vz:Math.cos(yaw)*72,speed:72,throttle:52};
    for(let i=0;i<40;i++){
      const previous=advanceHover(state,{boost:true,throttle:1},1/60,map,collision.surfaceHeight);collision.step(state,1/60,map,previous);
      expect(state.recoverNeeded,`${branch.id}, ${distance}m, side ${side}, tangent ${tangent}, frame ${i}`).toBe(false);
    }impacts+=state.impactSerial;
  }
  expect(impacts).toBeGreaterThan(20);
});

test('banked curves share their visible and physical height, ease at forks and tilt the ship',()=>{
  const {routes,map,collision}=world;
  for(const b of routes.branches){
    expect(Math.abs(b.samples[0].bank)).toBe(0);expect(Math.abs(b.samples.at(-1).bank)).toBe(0);
    for(const p of b.samples){expect(Math.abs(p.bank)).toBeLessThanOrEqual(.12);for(const offset of [-3,0,3]){const x=p.x-p.nz*offset,z=p.z+p.nx*offset,h=collision.surfaceHeight(x,z),main=routes.mainRoadAt(x,z),expected=main.distanceToRoad<main.width/2?main.y:p.y+p.bank*offset;if(main.distanceToRoad<main.width/2||main.distanceToRoad>main.width/2+8)expect(Math.abs(h-expected)).toBeLessThan(.06);}}
  }
  const p=routes.branches.flatMap(b=>b.samples).reduce((a,b)=>Math.abs(a.bank)>Math.abs(b.bank)?a:b);expect(Math.abs(p.bank)).toBeGreaterThan(.07);
  const state={...createHoverState(map),x:p.x,y:p.y+.65,z:p.z,yaw:Math.atan2(p.nx,p.nz)};
  for(let i=0;i<60;i++)advanceHover(state,{},1/60,map,collision.surfaceHeight);
  expect(state.roll).toBeCloseTo(-Math.atan(p.bank),2);
});

test('waterfall spray stays local, pauses, respects reduced motion and resets',()=>{
  const {adventure,map}=world;adventure.reset();const state={...createHoverState(map),x:-445,y:42,z:-233,speed:30,vx:30,vz:0};
  adventure.step(state,1/60);expect(adventure.stats.spray).toBeGreaterThan(0);adventure.update(20,false,{state,phase:'flying'});
  const geometry=adventure.splash.geometry,positions=geometry.attributes.position.array.slice();adventure.update(21,false,{state,phase:'paused'});expect(geometry.attributes.position.array).toEqual(positions);
  adventure.update(22,true,{state,phase:'flying'});expect(adventure.splash.visible).toBe(false);
  const spray=adventure.stats.spray;Object.assign(state,{x:10000,z:10000});for(let i=0;i<90;i++)adventure.step(state,1/60);adventure.update(23,false,{state,phase:'flying'});
  expect(adventure.stats.spray).toBe(spray);expect([...geometry.attributes.position.array].every(n=>n===-999)).toBe(true);adventure.reset();expect(adventure.stats.spray).toBe(0);
});

test('shortcut prompts are removed; environmental audio follows zones and the visible train',()=>{
  const {adventure,map,routes}=world;
  for(const b of routes.branches){const before=map.atDistance(b.start-70);expect(adventure.navigationAt(before)).toBe('');expect(adventure.navigationAt(routes.onBranch(b,.5))).toBe('');}
  expect(adventure.wayfinding.boards).toBe(1);
  const falls=routes.onBranch(routes.branches[2],.45),forest=map.atDistance(1750),station=routes.onBranch(routes.branches[0],.5),remote={x:10000,y:0,z:10000};
  expect(adventure.ambienceAt(falls,6).gallery).toBe(1);expect(adventure.ambienceAt(falls,6).falls).toBeGreaterThan(.6);
  expect(adventure.ambienceAt(forest,6).wind).toBeGreaterThan(.4);expect(adventure.ambienceAt(station,1).train).toBeGreaterThan(.7);
  expect(adventure.ambienceAt(station,20).train).toBe(0);expect(adventure.ambienceAt(station,6,true).train).toBe(0);
  const far=adventure.ambienceAt(remote,6);expect(far.falls+far.wind+far.train+far.gallery).toBe(0);
});

test('forest ramp has a ground bypass and a supported low-speed roll-off',()=>{
  const {map,collision,adventure}=world,{jump}=adventure;
  for(let d=jump.start;d<jump.landingEnd;d+=1){
    const p=jump.sample(d,0),state={...createHoverState(map),...p,y:p.y+.65,yaw:Math.atan2(p.nx,p.nz)};
    expect(Math.abs(collision.surfaceHeight(p.x,p.z)-p.y)).toBeLessThan(.05);collision.step(state,1/60,map);expect(state.wallHit).toBe(false);
  }
  const p=jump.sample(jump.start-5),state={...createHoverState(map),...p,y:p.y+.65,yaw:Math.atan2(p.nx,p.nz),vx:p.nx*8,vz:p.nz*8,speed:8,throttle:8};
  for(let i=0;i<360;i++){
    const road=map.mainRoadAt(state.x,state.z),target=jump.sample(road.distance+7),error=wrap(Math.atan2(target.x-state.x,target.z-state.z)-state.yaw);
    const previous=advanceHover(state,{turn:-error*2},1/60,map,collision.surfaceHeight);collision.step(state,1/60,map,previous);
    expect(state.airborne).toBe(false);expect(state.recoverNeeded).toBe(false);expect(state.wallHit).toBe(false);
  }
  expect(map.mainRoadAt(state.x,state.z).distance).toBeGreaterThan(jump.end);expect(state.landingSerial).toBe(0);
});

for(const speed of [16,24,42,52,72])test(`forest jump: takeoff and controlled landing at ${speed} m/s without a reset`,()=>{
  const {map,collision,adventure}=world,{jump}=adventure,p=jump.sample(jump.start-7),state={...createHoverState(map),...p,y:p.y+.65,yaw:Math.atan2(p.nx,p.nz),vx:p.nx*speed,vz:p.nz*speed,speed,throttle:Math.min(52,speed)};
  let maximum=0,airFrames=0,landingDistance=0;const gate=map.gates.find(g=>g.distance>jump.lip);let crossed=false;
  for(let i=0;i<600;i++){
    const road=map.mainRoadAt(state.x,state.z),target=jump.sample(road.distance+Math.max(8,state.speed*.3)),error=wrap(Math.atan2(target.x-state.x,target.z-state.z)-state.yaw);
    const previous=advanceHover(state,{turn:T.MathUtils.clamp(-error*2,-1,1),boost:speed===72},1/60,map,collision.surfaceHeight);collision.step(state,1/60,map,previous);adventure.step(state,1/60);
    expect(state.recoverNeeded).toBe(false);expect(state.wallHit,`impact at ${road.distance}, airborne=${state.airborne}`).toBe(false);
    maximum=Math.max(maximum,state.y-(collision.surfaceHeight(state.x,state.z)??state.y)-state.hover);
    if(state.airborne)airFrames++;if(state.landingSerial&&!landingDistance)landingDistance=road.distance;
    if(crossesCircuitGate(previous,state,gate))crossed=true;
    if(crossed)break;
  }
  expect(airFrames).toBeGreaterThan(15);expect(maximum).toBeGreaterThan(3);expect(state.landingSerial).toBe(1);expect(state.airborne).toBe(false);expect(crossed).toBe(true);
  expect(landingDistance).toBeGreaterThan(jump.lip+10);expect(landingDistance).toBeLessThan(jump.landingEnd+15);expect(state.landingSeverity).toBeLessThan(.25);
});

test('hard and sideways landings shed speed, resume driving, and recovery clears flight state',()=>{
  const {map,collision,adventure}=world,p=adventure.jump.sample(1580,0),state={...createHoverState(map),...p,y:p.y+3,yaw:Math.atan2(p.nx,p.nz)+.8,vx:p.nx*40,vz:p.nz*40,speed:40,throttle:40,airborne:true,airTime:.4,verticalVelocity:-18};
  for(let i=0;i<30&&state.airborne;i++){const previous=advanceHover(state,{},1/60,map,collision.surfaceHeight);collision.step(state,1/60,map,previous);expect(state.recoverNeeded).toBe(false);}
  expect(state.airborne).toBe(false);expect(state.landingSeverity).toBeGreaterThan(.5);expect(state.speed).toBeLessThan(32);expect(state.impactSerial).toBeGreaterThan(0);expect(state.hover).toBeLessThan(.65);
  const speed=state.speed;state.yaw=Math.atan2(p.nx,p.nz);for(let i=0;i<30;i++){const previous=advanceHover(state,{throttle:1},1/60,map,collision.surfaceHeight);collision.step(state,1/60,map,previous);expect(state.recoverNeeded).toBe(false);}expect(state.speed).toBeGreaterThan(speed);
  const fresh=recoverHover(map,0);expect(fresh.airborne).toBe(false);expect(fresh.verticalVelocity).toBe(0);expect(fresh.airTime).toBe(0);expect(fresh.landingSerial).toBe(0);
});

test('turning the nose backwards in midair does not erase the flight momentum',()=>{
  const {map,collision,adventure}=world,p=adventure.jump.sample(1555,0),state={...createHoverState(map),...p,y:p.y+4,yaw:Math.atan2(p.nx,p.nz)+Math.PI,vx:p.nx*40,vz:p.nz*40,speed:40,throttle:40,airborne:true,airTime:.2,verticalVelocity:0};
  advanceHover(state,{},1/60,map,collision.surfaceHeight);
  expect(state.airborne).toBe(true);expect(state.vx*p.nx+state.vz*p.nz).toBeGreaterThan(39.9);expect(state.verticalVelocity).toBeLessThan(0);
});

test('pennants and distant traffic remain animated without spectators or stands',()=>{
  const {adventure}=world,life=adventure.cityLife;life.reset();expect(life.spectatorCount).toBeUndefined();expect(life.cars.count).toBe(6);
  for(const zone of life.zones){expect(zone.people).toBeUndefined();expect(zone.bodies).toBeUndefined();expect(zone.arms).toBeUndefined();}
  const zone=life.zones[0],near={x:zone.center.x,y:zone.center.y,z:zone.center.z},far={x:10000,y:0,z:10000};
  life.update(0,false,{state:near,phase:'flying'});const before=zone.flags.geometry.attributes.position.array.slice();life.update(.1,false,{state:near,phase:'flying'});expect(zone.flags.geometry.attributes.position.array).not.toEqual(before);expect(zone.group.visible).toBe(true);
  const flags=zone.flags.geometry.attributes.position.array.slice(),uploads=zone.uploads;
  life.update(1,false,{state:near,phase:'paused'});expect(zone.flags.geometry.attributes.position.array).toEqual(flags);
  life.update(2,false,{state:far,phase:'flying'});expect(zone.group.visible).toBe(false);expect(zone.uploads).toBe(uploads);expect(life.trafficRoot.visible).toBe(false);
  life.update(3,true,{state:near,phase:'flying'});const still=zone.flags.geometry.attributes.position.array.slice();life.update(4,true,{state:near,phase:'flying'});expect(zone.flags.geometry.attributes.position.array).toEqual(still);
  life.update(5,false,{state:life.trafficCenter,phase:'flying'});const cars=life.cars.instanceMatrix.array.slice();life.update(5.1,false,{state:life.trafficCenter,phase:'flying'});expect(life.cars.instanceMatrix.array).not.toEqual(cars);
  const traffic=life.cars.instanceMatrix.array.slice();life.update(6,true,{state:life.trafficCenter,phase:'flying'});expect(life.cars.instanceMatrix.array).toEqual(traffic);
  life.reset();expect(zone.time).toBe(0);expect(life.trafficUploads).toBe(0);expect(zone.uploads).toBe(0);
});

test('the railway circles the whole city and clears buildings, treetops and racing lanes',()=>{
  const {adventure,map,buildings,trees,root}=world,{route,supports}=adventure.train;
  expect(route.length).toBeGreaterThan(2400);expect(route.length).toBeLessThan(2800);
  expect(route.bounds.min.x).toBeLessThan(-540);expect(route.bounds.max.x).toBeGreaterThan(510);expect(route.bounds.min.z).toBeLessThan(0);expect(route.bounds.max.z).toBeGreaterThan(330);
  const envelope=new T.Box3();expect(buildings.length).toBeGreaterThan(500);
  for(const p of route.points){envelope.set(p.clone().add(new T.Vector3(-2.6,-1.2,-2.6)),p.clone().add(new T.Vector3(2.6,5.5,2.6)));expect(buildings.some(box=>box.intersectsBox(envelope)),`railway through building at ${p.toArray()}`).toBe(false);expect(trees.some(box=>box.intersectsBox(envelope)),`railway through treetop at ${p.toArray()}`).toBe(false);}
  const ground=[];root.traverse(m=>{if(m.isMesh&&['Vegetacion terreno','Urban plaza paving','Hormigon claro','Asfalto grafito'].includes(m.material?.name))ground.push(m);});const heightAt=createSurfaceIndex(ground);
  for(const {position} of supports){const road=map.roadAt(position.x,position.z);expect(road.distanceToRoad).toBeGreaterThan(road.width/2+2.4);const ground=heightAt(position.x,position.z);if(ground!==null)expect(Math.abs(position.y-ground),`floating pier at ${position.toArray()}`).toBeLessThan(.05);}
});

test('all four carriages follow a continuous loop at uniform speed, including the wrap',()=>{
  const train=world.adventure.train,{route,speed,spacing}=train;train.reset();const step=1/60;
  expect(train.meshes).toHaveLength(5);for(const mesh of train.meshes)expect(mesh.count).toBe(4);
  const triangles=train.meshes.reduce((n,m)=>n+4*(m.geometry.index?.count??m.geometry.attributes.position.count)/3,0);expect(triangles).toBeLessThan(20000);expect(train.root.children.length).toBeLessThan(40);
  for(let d=0;d<route.length;d+=17){
    train.update(d/speed,false,{phase:'flying'});
    for(let i=0;i<4;i++){expect(train.carPoses[i].position.distanceTo(route.at(d-i*spacing).position)).toBeLessThan(1e-6);expect(train.carPoses[i].direction.length()).toBeCloseTo(1,5);}
    const before=train.carPoses[0].position.clone();train.update(d/speed+step,false,{phase:'flying'});expect(train.carPoses[0].position.distanceTo(before)).toBeCloseTo(speed*step,2);
  }
  train.update((route.length-.1)/speed,false);const p=train.carPoses[0].position.clone(),direction=train.carPoses[0].direction.clone();train.update((route.length+.1)/speed,false);expect(train.carPoses[0].position.distanceTo(p)).toBeCloseTo(.2,3);expect(train.carPoses[0].direction.dot(direction)).toBeGreaterThan(.999);
  const snapshot=train.meshes[0].instanceMatrix.array.slice(),uploads=train.uploads;train.update(500,false,{phase:'paused'});train.update(600,true,{phase:'flying'});expect(train.meshes[0].instanceMatrix.array).toEqual(snapshot);expect(train.uploads).toBe(uploads);expect(train.moving.visible).toBe(true);
  train.reset();expect(train.carPoses[0].position.distanceTo(route.at(0).position)).toBeLessThan(1e-6);expect(train.uploads).toBe(0);
});

test('railway surfaces join without gaps, folded curves or duplicate faces',()=>{
  const {route}=world.adventure.train,frames=route.points.map((position,i)=>({position,direction:route.tangents[i%route.tangents.length]}));
  const deck=[[-2.3,-.9],[2.3,-.9],[2.3,-.25],[-2.3,-.25]],parts=[];
  for(let i=0;i<frames.length-1;i+=80)parts.push(createRailwaySection(frames.slice(i,Math.min(i+81,frames.length)),deck));
  const station=Array.from({length:35},(_,i)=>route.at(-53+i*2));
  const platform=createRailwaySection(station,[[2.4,1.075],[5.8,1.075],[5.8,1.425],[2.4,1.425]],{caps:true});
  const canopy=createRailwaySection(station,[[1.95,6.38],[6.25,6.38],[6.25,6.62],[1.95,6.62]],{caps:true});
  for(const surfaces of [parts,[platform],[canopy]]){
    const edges=new Map(),faces=new Set();let duplicates=0,folded=0;
    for(const geometry of surfaces){
      const p=geometry.attributes.position,idx=geometry.index,key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(v=>v.toFixed(4)).join(','),v=i=>new T.Vector3().fromBufferAttribute(p,i);
      for(let i=0;i<idx.count;i+=3){
        const ids=[idx.getX(i),idx.getX(i+1),idx.getX(i+2)],keys=ids.map(key),face=keys.slice().sort().join('|');
        if(faces.has(face))duplicates++;faces.add(face);
        for(let j=0;j<3;j++){const edge=[keys[j],keys[(j+1)%3]].sort().join('|');edges.set(edge,(edges.get(edge)??0)+1);}
        // The top face of every ring must face upwards, even on tight bends.
        if(ids.every(id=>id%4>=2)&&v(ids[1]).sub(v(ids[0])).cross(v(ids[2]).sub(v(ids[0]))).y<=0)folded++;
      }
    }
    expect(duplicates).toBe(0);expect(folded).toBe(0);expect([...edges.values()].every(count=>count===2)).toBe(true);
  }
  [...parts,platform,canopy].forEach(g=>g.dispose());
  let overlaps=0;const count=route.points.length-1;
  for(let i=0;i<count;i++)for(let j=i+8;j<count;j++)if(count-j+i>=8&&route.points[i].distanceToSquared(route.points[j])<4.6**2)overlaps++;
  expect(overlaps).toBe(0);
});

test('train audio travels with the visible carriages around the entire city',()=>{
  const train=world.adventure.train;
  for(let t=0;t<train.route.length/train.speed;t+=10){
    train.update(t,false,{phase:'flying'});const p=train.route.at(t*train.speed-train.spacing*1.5).position,listener={x:p.x,y:p.y-24,z:p.z};
    expect(train.ambienceAt(listener,t).train).toBeGreaterThan(.7);expect(train.ambienceAt(listener,t,true).train).toBe(0);expect(train.ambienceAt({x:p.x+1000,y:p.y,z:p.z},t).train).toBe(0);
  }
});


test('shortcut paving is clipped at the main street instead of layered over it',()=>{
  const {routes}=world;
  for(const branch of routes.branches){
    const g=routeRibbon(branch,{mainRoadAt:routes.mainRoadAt}),p=g.attributes.position;
    for(let i=0;i<p.count;i+=3){
      const x=(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,z=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3,road=routes.mainRoadAt(x,z);
      expect(road.distanceToRoad-road.width/2,branch.id).toBeGreaterThan(-.025);
    }g.dispose();
  }
});


test('cascade entrance sign is grounded outside the main road and the gallery shortcut',()=>{
  const {root,routes,cascadeSign}=world,ground=createSurfaceIndex(root.children.filter(m=>m.material?.name==='Vegetacion terreno')),[post,panel,letters]=cascadeSign,foot=post.getCenter(new T.Vector3());
  expect(post.min.y).toBeCloseTo(ground(foot.x,foot.z)-.04,3);
  expect(post.max.y).toBeGreaterThan(panel.min.y);expect(post.max.y).toBeLessThan(panel.max.y);
  expect(panel.getCenter(new T.Vector3()).distanceTo(letters.getCenter(new T.Vector3()))).toBeLessThan(.5);
  for(const bounds of cascadeSign)for(const x of [bounds.min.x,bounds.max.x])for(const z of [bounds.min.z,bounds.max.z]){
    const main=routes.mainRoadAt(x,z),branch=routes.nearest(x,z);
    expect(main.distanceToRoad).toBeGreaterThan(main.width/2+1.5);expect(branch.distanceToRoad).toBeGreaterThan(branch.width/2+1.5);
  }
});
