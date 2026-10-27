import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {measureNozzleMouths,combineMouths} from '../src/vfx/nozzle-mouth.js';

// Open tube along z: z ∈ [center-depth/2, center+depth/2].
function housing(x,center,depth,radius=.3){
  const geometry=new THREE.CylinderGeometry(radius,radius,depth,16,1,true);geometry.rotateX(Math.PI/2);
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());mesh.position.set(x,0,center);return mesh;
}

test('finds the exit plane of a housing',()=>{
  const root=new THREE.Group();root.add(housing(0,-2.25,.5));
  const [mouth]=measureNozzleMouths(root,[[0,0,-2,.24]]);
  expect(mouth.start).toBeCloseTo(.5,2);expect(mouth.radius).toBeCloseTo(.3,2);
});

test('measures each nozzle independently',()=>{
  const root=new THREE.Group();root.add(housing(-1,-2.1,.2),housing(1,-2.3,.6));
  const mouths=measureNozzleMouths(root,[[-1,0,-2,.24],[1,0,-2,.24]]);
  expect(mouths[0].start).toBeCloseTo(.2,2);expect(mouths[1].start).toBeCloseTo(.6,2);
});

test('ignores geometry outside the axial window',()=>{
  const root=new THREE.Group(),box=new THREE.Mesh(new THREE.BoxGeometry(.6,.6,.5),new THREE.MeshBasicMaterial());
  box.position.z=-7.75;root.add(housing(0,-2.25,.5),box);
  expect(measureNozzleMouths(root,[[0,0,-2,.24]])[0].start).toBeCloseTo(.5,2);
});

test('respects child transforms',()=>{
  const root=new THREE.Group(),child=new THREE.Group();child.rotation.y=Math.PI;child.add(housing(0,2.25,.5));root.add(child);
  const [mouth]=measureNozzleMouths(root,[[0,0,-2,.24]]);
  expect(mouth.start).toBeCloseTo(.5,2);expect(mouth.radius).toBeCloseTo(.3,2);
});

test('falls back when nothing surrounds the nozzle',()=>{
  const mouths=measureNozzleMouths(new THREE.Group(),[[0,0,-2,.24]]);
  expect(mouths).toEqual([{start:0,radius:1.1*.24}]);
  expect(mouths.every(m=>Number.isFinite(m.start)&&Number.isFinite(m.radius))).toBe(true);
});

test('assigns shared geometry to the nearest nozzle',()=>{
  // Bulldog-like layout: a wide centre housing reaches into the small side nozzles' windows.
  const root=new THREE.Group();root.add(housing(0,-2.4,.8,.7),housing(-1.048,-2.095,.19,.17),housing(1.048,-2.095,.19,.17));
  const mouths=measureNozzleMouths(root,[[-1.048,0,-2,.15],[0,0,-2,.44],[1.048,0,-2,.15]]);
  expect(mouths[0].start).toBeCloseTo(.19,2);expect(mouths[2].start).toBeCloseTo(.19,2);expect(mouths[1].start).toBeCloseTo(.8,2);
});

test('skips nozzle inserts flagged by the engine core',()=>{
  const root=new THREE.Group(),insert=housing(0,-2.25,.5);insert.userData.nozzleInsert=true;root.add(insert);
  expect(measureNozzleMouths(root,[[0,0,-2,.24]])).toEqual([{start:0,radius:1.1*.24}]);
});

test('combines model and engine mouths',()=>{
  const model=[{start:.01,radius:.5},{start:.6,radius:.4}],engine=[{start:.3,radius:.3},{start:.3,radius:.3}];
  expect(combineMouths(model,engine)).toEqual([{start:.3,radius:.3},{start:.6,radius:.3}]);
  expect(combineMouths(model,null)).toEqual(model);
});
