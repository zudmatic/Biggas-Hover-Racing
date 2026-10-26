import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {createFlameTrail} from '../src/vfx/flame-trail.js';

for(const speed of [0,52,100])for(const power of [.45,1])test(`flame stays compact at ${speed} m/s, power ${power}`,()=>{
  const scene=new THREE.Scene(),ship=new THREE.Group(),material=new THREE.MeshBasicMaterial(),nozzle=[0,0,-2,.24];ship.scale.setScalar(.6);
  const trail=createFlameTrail(scene,material,[nozzle]);
  for(let i=0;i<=144;i++){ship.position.z=speed*i/144;trail.record(i/144,ship);}
  trail.update(1,{Activa:true,Longitud:2.7,Ancho:.7,Pulsación:0},power,7.5,.8);
  const origin=new THREE.Vector3(...nozzle.slice(0,3)).applyMatrix4(ship.matrixWorld),a=new THREE.Vector3(),b=new THREE.Vector3();let longest=0;
  for(const mesh of scene.children){const attr=mesh.geometry.attributes.position;for(let i=0;i<attr.count;i+=2){a.fromBufferAttribute(attr,i);b.fromBufferAttribute(attr,i+1);longest=Math.max(longest,a.add(b).multiplyScalar(.5).distanceTo(origin));}}
  expect(longest).toBeLessThanOrEqual(2.7*power*.6+.00001);expect(longest).toBeGreaterThan(2.7*power*.6*.9);
  trail.clear();expect(scene.children.every(m=>!m.visible)).toBe(true);trail.dispose();material.dispose();expect(scene.children).toHaveLength(0);
});

test('flame history bends through turns and never stretches across recovery',()=>{
  const scene=new THREE.Scene(),ship=new THREE.Group(),material=new THREE.MeshBasicMaterial(),trail=createFlameTrail(scene,material,[[0,0,0,.24]]);
  for(let i=0;i<60;i++){ship.position.set(Math.sin(i/60)*20,0,Math.cos(i/60)*20);ship.rotation.y=i/60;trail.record(i/60,ship);}
  trail.update(59/60,{Activa:true,Longitud:2.7,Ancho:.7,Pulsación:0},1,7.5,0);
  const attr=scene.children[0].geometry.attributes.position;
  expect(Array.from(attr.array).every(Number.isFinite)).toBe(true);
  ship.position.set(200,0,200);trail.record(1,ship);trail.update(1,{Activa:true,Longitud:2.7,Ancho:.7,Pulsación:0},1,7.5,0);
  const point=new THREE.Vector3();for(let i=0;i<attr.count;i++){point.fromBufferAttribute(attr,i);expect(point.distanceTo(ship.position)).toBeLessThan(3.1);}
  trail.dispose();material.dispose();
});

// Stationary ship at scale .6 with one nozzle; returns per-row {t,mid,half} in world units.
function rows(settings,power,{Longitud=2.7,Ancho=.7}={}){
  const scene=new THREE.Scene(),ship=new THREE.Group(),material=new THREE.MeshBasicMaterial(),nozzle=[0,0,-2,.24];ship.scale.setScalar(.6);
  const trail=createFlameTrail(scene,material,[nozzle]);
  for(let i=0;i<=60;i++)trail.record(i/60,ship);
  trail.update(1,{Activa:true,Longitud,Ancho,Pulsación:0,...settings},power,7.5,0);
  const origin=new THREE.Vector3(...nozzle.slice(0,3)).applyMatrix4(ship.matrixWorld),{position,uv}=scene.children[0].geometry.attributes,out=[];
  for(let i=0;i<position.count;i+=2){
    const a=new THREE.Vector3().fromBufferAttribute(position,i),b=new THREE.Vector3().fromBufferAttribute(position,i+1),mid=a.clone().add(b).multiplyScalar(.5);
    out.push({t:uv.getY(i),distance:mid.distanceTo(origin),half:a.distanceTo(mid)});
  }
  trail.dispose();material.dispose();return out;
}

for(const power of [.13,.45,1])test(`root sits on the exit plane at power ${power}`,()=>{
  const nearest=Math.min(...rows({Bocas:[{start:.5,radius:.3}]},power).map(r=>r.distance));
  expect(nearest).toBeCloseTo(.5*.6,2);
});

test('root fits inside the mouth',()=>{
  for(const row of rows({Bocas:[{start:.5,radius:.3}]},1,{Ancho:2}))if(row.t<.05)expect(row.half*.68).toBeLessThanOrEqual(.9*.3*.6+1e-4);
});

test('pilot flame keeps a minimum length when stopped',()=>{
  const longest=Math.max(...rows({Mínima:.7},.13,{Longitud:4.6}).map(r=>r.distance));
  expect(longest).toBeGreaterThanOrEqual(.7*.6*.95);
});

test('idle flame is narrower than an accelerating one',()=>{
  const half=power=>rows({},power).find(r=>Math.abs(r.t-.5)<1e-6).half;
  expect(half(.13)/half(.45)).toBeCloseTo(.6,2);
});

test('length is continuous across the pilot floor',()=>{
  const lengths=[];for(let i=0;i<50;i++)lengths.push(Math.max(...rows({Mínima:.7},1-.87*i/49).map(r=>r.distance)));
  const max=Math.max(...lengths);
  for(let i=1;i<lengths.length;i++)expect(Math.abs(lengths[i]-lengths[i-1])).toBeLessThan(.05*max);
});

test('pilot flame fades out as power drops to zero',()=>{
  const lengths=[];for(let i=0;i<40;i++)lengths.push(Math.max(...rows({Mínima:.7},.13-.124*i/39).map(r=>r.distance)));
  for(let i=1;i<lengths.length;i++)expect(Math.abs(lengths[i]-lengths[i-1])).toBeLessThan(.05*lengths[0]);
  expect(lengths.at(-1)).toBeLessThan(.1*lengths[0]);
});
