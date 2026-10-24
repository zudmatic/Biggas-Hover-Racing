import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {createDetailInstances} from '../src/detail-instances.js';
import {createCircuitDetails} from '../src/circuit-details.js';

test('instances preserve nested transforms and update bounds after movement without redundant uploads',()=>{
  const root=new THREE.Group();root.position.set(120,8,-35);root.rotation.y=.6;
  const parent=new THREE.Group();parent.position.set(4.123456,2,9);root.add(parent);
  const batch=createDetailInstances(root,new THREE.BoxGeometry(),new THREE.MeshStandardMaterial(),2,{dynamic:true});
  const a=batch.add(parent),b=batch.add(parent);a.position.x=2;b.position.z=4;parent.rotation.y=.3;
  batch.update();const actual=new THREE.Matrix4(),expected=new THREE.Matrix4();
  const verify=(object,index)=>{object.updateWorldMatrix(true,false);expected.copy(root.matrixWorld).invert().multiply(object.matrixWorld);batch.mesh.getMatrixAt(index,actual);actual.elements.forEach((v,i)=>expect(v).toBeCloseTo(expected.elements[i],5));};
  verify(a,0);verify(b,1);const version=batch.mesh.instanceMatrix.version;batch.update();expect(batch.mesh.instanceMatrix.version).toBe(version);
  a.position.x=250;batch.update();verify(a,0);expect(batch.mesh.boundingBox.max.x).toBeGreaterThan(200);
  a.position.x=2;batch.update();verify(a,0);expect(batch.mesh.boundingBox.max.x).toBeLessThan(20);
});

test('static batches share geometry, keep shadows and reject overflow',()=>{
  const root=new THREE.Group(),geometry=new THREE.BoxGeometry(),material=new THREE.MeshStandardMaterial();
  const batch=createDetailInstances(root,geometry,material,1);batch.add().position.x=5;batch.update();
  expect(batch.mesh.geometry).toBe(geometry);expect(batch.mesh.material).toBe(material);
  expect(batch.mesh.castShadow&&batch.mesh.receiveShadow).toBe(true);expect(batch.mesh.count).toBe(1);
  expect(()=>batch.add()).toThrow('Too many instances');const version=batch.mesh.instanceMatrix.version;batch.update();expect(batch.mesh.instanceMatrix.version).toBe(version);
});

test('instanced cones still collide independently and reset their rendered positions',()=>{
  const root=new THREE.Group(),landscape={length:1000,atDistance:d=>({x:d,y:0,z:0,nx:1,nz:0,width:12}),roadAt:x=>({x,y:0,z:0,offset:0,width:12})};
  const details=createCircuitDetails(root,landscape,{city:true});
  const cones=[];root.traverse(o=>{if(o.name==='Cono dinámico')cones.push(o);});expect(cones).toHaveLength(16);
  const body=root.getObjectByName('Conos');expect(body.isInstancedMesh).toBe(true);expect(body.count).toBe(16);
  const original=Array.from(body.instanceMatrix.array),other=cones[1].position.clone(),origin=cones[0].position.clone();
  const state={x:origin.x,y:.65,z:origin.z,vx:20,vz:0,speed:20,hover:.65,impactSerial:0};
  details.step(state,1/60);details.update(0,true,{state,phase:'flying',dt:1/60});
  expect(cones[0].position.x).toBeGreaterThan(origin.x);expect(cones[1].position.equals(other)).toBe(true);expect(state.speed).toBeLessThan(20);
  expect(Array.from(body.instanceMatrix.array).slice(0,16)).not.toEqual(original.slice(0,16));
  details.reset();expect(Array.from(body.instanceMatrix.array)).toEqual(original);
});
