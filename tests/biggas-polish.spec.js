import {test,expect} from '@playwright/test';
import * as T from 'three';
import fs from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {smoothOrganicNormals} from '../src/biggas-city-polish.js';
import {prepareBiggasCity} from '../src/biggas-city-scene.js';
import {createCircuitTextures} from '../src/circuit-textures.js';
import {createBiggasCityLife} from '../src/biggas-city-life.js';

test('organic normal smoothing joins material seams without moving vertices or UVs',()=>{
  const source=new T.IcosahedronGeometry(3,0),parts=[];
  for(let half=0;half<2;half++){
    const g=new T.BufferGeometry();for(const [name,a] of Object.entries(source.attributes))g.setAttribute(name,new T.BufferAttribute(a.array.slice(half*a.array.length/2,(half+1)*a.array.length/2),a.itemSize));parts.push(g);
  }
  const before=parts.map(g=>({position:g.attributes.position.array.slice(),uv:g.attributes.uv.array.slice()}));smoothOrganicNormals(parts);
  const normals=new Map();for(const [index,g] of parts.entries()){
    expect(g.attributes.position.array).toEqual(before[index].position);expect(g.attributes.uv.array).toEqual(before[index].uv);
    const p=g.attributes.position,n=g.attributes.normal;for(let i=0;i<p.count;i++){
      const position=new T.Vector3().fromBufferAttribute(p,i),normal=new T.Vector3().fromBufferAttribute(n,i),key=position.toArray().join(',');expect(normal.length()).toBeCloseTo(1,5);expect(normal.dot(position.normalize())).toBeGreaterThan(.99);
      if(normals.has(key))expect(normal.distanceTo(normals.get(key))).toBeLessThan(1e-5);else normals.set(key,normal);
    }
    g.dispose();
  }source.dispose();
});

test('the actual forest keeps the same triangles and instanced templates after smoothing',async()=>{
  const bytes=fs.readFileSync('public/models/biggas-city/Biggas_City_039_v02_Forest_LOD1.glb'),asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');
  const root=new T.Group(),textures=createCircuitTextures({size:16}),before=new Map();let triangles=0;
  asset.scene.traverse(m=>{if(!m.isMesh)return;triangles+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3;if(!before.has(m.geometry.uuid))before.set(m.geometry.uuid,m.geometry.attributes.position.array.slice());});
  const prepared=prepareBiggasCity([asset],root,textures);expect(prepared.smoothTemplates).toBeGreaterThan(15);expect(prepared.instances.length).toBeGreaterThan(1);
  let after=0;const geometries=new Set(),materials=new Set();root.traverse(m=>{if(!m.isMesh)return;expect(m.isInstancedMesh).toBe(true);after+=m.count*(m.geometry.index?.count??m.geometry.attributes.position.count)/3;geometries.add(m.geometry);materials.add(m.material);});
  expect(after).toBe(triangles);expect(geometries.size).toBe(before.size);
  for(const g of geometries)if(g.userData.biggasSmooth){const n=g.attributes.normal;for(let i=0;i<n.count;i++)expect(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))).toBeCloseTo(1,4);expect(g.userData.circuitUV).toBe(true);}
  asset.scene.traverse(m=>{if(m.isMesh)expect(m.geometry.attributes.position.array).toEqual(before.get(m.geometry.uuid));});
  root.traverse(m=>m.dispose?.());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.dispose();
});

test('rounded distant cars stay instanced with fixed geometry and mobile population budgets',()=>{
  for(const mobile of [false,true]){
    const group=new T.Group(),routes={branches:[{}],onBranch:(_,f)=>({x:f*200,y:0,z:0,nx:1,nz:0,bank:0})},palette={};
    const life=createBiggasCityLife({group,routes,palette,box(){},beam(){},mobile}),textures=createCircuitTextures({size:8});textures.applyRoot(group);
    expect(life.spectatorCount).toBeUndefined();expect(life.cars.count).toBe(mobile?3:6);
    expect(life.cars.material.map).toBeNull();expect(life.zones.every(z=>!z.bodies&&!z.arms&&!z.people)).toBe(true);
    const triangles=g=>(g.index?.count??g.attributes.position.count)/3;expect(triangles(life.cars.geometry)).toBeLessThan(600);
    const geometries=new Set(),materials=new Set();group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);if(o.isInstancedMesh)o.dispose();});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.dispose();
  }
});
