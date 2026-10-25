import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {advanceHover,createHoverState,recoverHover,CIRCUIT_BOOST} from '../src/circuit-physics.js';
import {createCityCollision} from '../src/circuit-collision.js';

// A wide track isolates handling from wall impulses and circuit geometry.
const track={spawn:{x:0,y:.65,z:0},yaw:0,height:()=>0,
  roadAt:(x,z)=>({x:0,y:0,z,nx:0,nz:1,width:10000,offset:-x,distanceToRoad:Math.abs(x),grade:0})};
const moving=()=>Object.assign(createHoverState(track),{speed:30,throttle:30,vz:30});
function drive(state,seconds,input={},surface=track.height,hz=60){
  for(let i=0;i<Math.round(seconds*hz);i++)advanceHover(state,{reducedMotion:true,...input},1/hz,track,surface);
  return state;
}

test('ordinary steering carries momentum after release, then settles without a permanent slide',()=>{
  const state=drive(moving(),2/3,{turn:.5});
  expect(Math.abs(state.slip)).toBeGreaterThan(.17);
  expect(Math.abs(state.slip)).toBeLessThan(.28);
  expect(state.speed).toBeGreaterThan(28);
  const yaw=state.yaw,bank=state.roll;
  drive(state,.25);
  expect(Math.abs(state.slip)).toBeGreaterThan(.08);
  expect(yaw-state.yaw).toBeGreaterThan(.08);
  expect(state.roll).toBeGreaterThan(bank*.4);
  drive(state,2);
  expect(Math.abs(state.slip)).toBeLessThan(.002);
  expect(Math.abs(state.yawRate)).toBeLessThan(.002);
  expect(Math.abs(state.roll)).toBeLessThan(.002);
});

test('countersteering catches the turn promptly and braking still overrides drift and boost',()=>{
  const state=drive(moving(),.5,{turn:1});
  expect(state.yawRate).toBeLessThan(-1);
  drive(state,.1,{turn:-1});expect(state.yawRate).toBeGreaterThan(.5);
  drive(state,1,{brake:true,drift:true,boost:true});
  expect(state.speed).toBeLessThan(.01);
  expect(state.drifting).toBe(false);expect(state.boosting).toBe(false);
});

test('banking follows accumulated turn and slip rather than flipping with the key',()=>{
  const state=drive(moving(),.6,{turn:.7}),bank=state.roll;
  expect(bank).toBeGreaterThan(.12);
  drive(state,1/60,{turn:-.7});expect(state.roll).toBeGreaterThan(bank*.9);
  drive(state,.6,{turn:-.7});expect(state.roll).toBeLessThan(-.12);
  drive(state,2);expect(Math.abs(state.roll)).toBeLessThan(.003);
});

test('turning and drifting cannot create speed beyond the propulsion limit',()=>{
  const state=moving();
  for(let i=0;i<1200;i++){
    advanceHover(state,{throttle:1,boost:i<300,drift:true,turn:Math.sin(i/40),reducedMotion:true},1/60,track);
    expect(state.speed).toBeLessThanOrEqual(CIRCUIT_BOOST+.01);
    expect(Number.isFinite(state.y)).toBe(true);
  }
  drive(state,3);expect(state.speed).toBeLessThanOrEqual(52.01);
});

test('a dropping surface leaves the hull aloft before the cushion compresses and settles',()=>{
  const state=moving(),oldY=state.y;
  drive(state,1/60,{},()=>-.3);
  expect(oldY-state.y).toBeLessThan(.08);
  expect(state.hover).toBeGreaterThan(.85);
  drive(state,.3,{},()=>-.3);
  expect(state.hover).toBeGreaterThan(.5);expect(state.hover).toBeLessThan(.65);
  drive(state,2,{},()=>-.3);
  expect(state.hover).toBeCloseTo(.65,3);expect(Math.abs(state.hoverVelocity)).toBeLessThan(.01);
});

test('uphill support keeps clearance and a crest retains vertical momentum',()=>{
  const state=moving(),surface=(_x,z)=>Math.min(z*.12,3.6);
  let min=Infinity,max=0;
  for(let i=0;i<120;i++){
    advanceHover(state,{reducedMotion:true},1/60,track,surface);
    min=Math.min(min,state.hover);max=Math.max(max,state.hover);
  }
  expect(min).toBeGreaterThan(.43);expect(max).toBeGreaterThan(.7);expect(max).toBeLessThan(1.1);
  drive(state,2,{},surface);expect(state.hover).toBeCloseTo(.65,3);
});

test('large surface changes remain bounded and do not store an outward velocity at a limit',()=>{
  const state=moving();
  drive(state,1/60,{},()=>2);
  expect(state.hover).toBeGreaterThanOrEqual(.43);
  drive(state,2,{},()=>2);expect(state.hover).toBeCloseTo(.65,3);
  drive(state,1/60,{},()=>-2);
  expect(state.hover).toBeLessThanOrEqual(1.25);
  drive(state,3,{},()=>-2);
  expect(state.hover).toBeCloseTo(.65,3);expect(Math.abs(state.hoverVelocity)).toBeLessThan(.01);
});

test('collision floor queries preserve height and vertical momentum above a lower surface',()=>{
  const root=new THREE.Group(),floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial());
  floor.name='COL_TRACK_TEST';floor.position.y=-.3;root.add(floor);
  // Simulate a collision correction taking us off the old road onto lower ground.
  const world=createCityCollision(root),state=Object.assign(moving(),{hoverVelocity:-.2});
  const {y,hoverVelocity}=state;
  world.step(state,1/60,track);
  expect(state.y).toBeCloseTo(y,8);expect(state.hoverVelocity).toBe(hoverVelocity);
  expect(state.hover).toBeCloseTo(.95);
  drive(state,2,{},world.surfaceHeight);expect(state.hover).toBeCloseTo(.65,3);
  world.dispose();floor.geometry.dispose();floor.material.dispose();
});

test('recovery samples the real floor and clears suspension and angular momentum',()=>{
  const map={...track,gates:[{distance:0}],atDistance:()=>({x:2,y:0,z:5,nx:0,nz:1,grade:.1})};
  for(const gate of [0,1]){
    const state=Object.assign(drive(moving(),.5,{turn:1}),recoverHover(map,gate,()=>.2));
    expect(state.y).toBeCloseTo(.85);expect(state.hover).toBe(.65);
    for(const field of ['vx','vz','yawRate','pitchRate','rollRate','hoverVelocity'])expect(state[field]).toBe(0);
  }
});

test('reduced motion removes idle bob without changing steering or propulsion',()=>{
  const normal=moving(),reduced=moving();
  for(let i=0;i<120;i++){
    advanceHover(normal,{turn:.4},1/60,track);
    advanceHover(reduced,{turn:.4,reducedMotion:true},1/60,track);
  }
  for(const field of ['x','z','yaw','vx','vz','speed'])expect(normal[field]).toBe(reduced[field]);
  expect(reduced.hover).toBeCloseTo(.65,8);
  expect(Math.abs(normal.hover-reduced.hover)).toBeGreaterThan(.01);
});

test('handling and suspension remain stable at 30, 60 and 120 Hz',()=>{
  const outcomes=[30,60,120].map(hz=>{
    const state=drive(moving(),.5,{turn:.5},track.height,hz);
    drive(state,.5,{},()=>-.2,hz);
    return state;
  });
  for(const state of outcomes){
    expect(Math.abs(state.x-outcomes[1].x)).toBeLessThan(.6);
    expect(Math.abs(state.y-outcomes[1].y)).toBeLessThan(.03);
    expect(Math.abs(state.yaw-outcomes[1].yaw)).toBeLessThan(.04);
    expect(Math.abs(state.roll-outcomes[1].roll)).toBeLessThan(.02);
  }
});
