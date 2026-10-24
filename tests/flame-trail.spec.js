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
