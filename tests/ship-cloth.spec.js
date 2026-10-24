import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {createShipCloth} from '../src/ship-cloth.js';

test('cloth pins the mast edge, flutters more in wind, and resets without accumulating deformation',()=>{
  const geometry=new THREE.PlaneGeometry(.6,1,12,18);geometry.translate(-.3,2.3,-2);
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial()),cloth=createShipCloth(mesh),rest=geometry.attributes.position.array.slice();
  const rms=(values)=>Math.sqrt(values.reduce((sum,n,i)=>sum+(n-rest[i])**2,0)/values.length);
  let idle=0,turbo=0;
  for(let t=0;t<4;t+=.1){cloth.update(t,0,false,false);idle+=rms(geometry.attributes.position.array);cloth.update(t,52,true,false);turbo+=rms(geometry.attributes.position.array);}
  expect(turbo).toBeGreaterThan(idle*1.8);
  const p=geometry.attributes.position;for(let i=0;i<p.count;i++)if(Math.abs(rest[i*3])<.025)expect(Array.from(p.array.slice(i*3,i*3+3))).toEqual(Array.from(rest.slice(i*3,i*3+3)));
  cloth.update(1,20);const first=p.array.slice();cloth.update(10,52,true);cloth.update(1,20);expect(p.array).toEqual(first);cloth.update(1,20);expect(p.array).toEqual(first);
  cloth.update(2,52,true,true);expect(p.array).toEqual(rest);expect(Array.from(geometry.attributes.normal.array).every(Number.isFinite)).toBe(true);
  geometry.dispose();mesh.material.dispose();
});

test('cloth movement agrees between rotated hangar pieces and baked flight geometry',()=>{
  const original=new THREE.PlaneGeometry(.6,1,8,10);original.translate(-.3,2.3,-2);
  const transform=new THREE.Matrix4().makeRotationY(-Math.PI/2),inverse=transform.clone().invert();
  const local=original.clone().applyMatrix4(inverse),material=new THREE.MeshStandardMaterial();
  const flight=createShipCloth(new THREE.Mesh(original,material)),hangar=createShipCloth(new THREE.Mesh(local,material),transform);
  flight.update(2.5,30,true);hangar.update(2.5,30,true);
  const point=new THREE.Vector3();for(let i=0;i<local.attributes.position.count;i++){point.fromBufferAttribute(local.attributes.position,i).applyMatrix4(transform);expect(point.distanceTo(new THREE.Vector3().fromBufferAttribute(original.attributes.position,i))).toBeLessThan(.000001);}
  original.dispose();local.dispose();material.dispose();
});

test('the real Nómada animates its cloth independently, and pause/reduced motion retain stable geometry',async({page})=>{
  test.setTimeout(60000);await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {createFlightShip}=await import('/src/flight-ship.js');const ship=await createFlightShip('038');const flag=ship.root.children.find(m=>m.userData.cloth),hull=ship.root.children.find(m=>m.isMesh&&!m.userData.cloth&&!m.material.userData.headlight);
    const rest=flag.geometry.attributes.position.array.slice(),body=hull.geometry.attributes.position.array.slice();
    ship.update(1,30,false,false);const a=flag.geometry.attributes.position.array.slice();ship.update(2,52,true,false);const b=flag.geometry.attributes.position.array.slice();ship.update(2,52,true,false);const paused=flag.geometry.attributes.position.array.slice();ship.update(3,52,true,true);
    const result={vertices:rest.length/3,animated:a.some((v,i)=>Math.abs(v-b[i])>.01),paused:b.every((v,i)=>v===paused[i]),restored:rest.every((v,i)=>v===flag.geometry.attributes.position.array[i]),hullStable:body.every((v,i)=>v===hull.geometry.attributes.position.array[i])};ship.dispose();return result;
  });
  expect(result.vertices).toBeGreaterThan(2500);expect(result.animated).toBe(true);expect(result.paused).toBe(true);expect(result.restored).toBe(true);expect(result.hullStable).toBe(true);
});
