import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createZudModel} from '../src/zud-model.js';
import {createCharacterHats} from '../src/character-hats.js';
import {CHARACTER_DEFAULTS,readCharacterDocument} from '../src/character-settings.js';
import {HAT_CATALOG,hatDefaults} from '../src/hat-catalog.js';

const load=async url=>{
  const buffer=readFileSync(new URL(`../public${url}`,import.meta.url));
  return new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'');
};
// Exact distance to triangle faces, not just their corners: an enclosing
// ellipsoid contains every head vertex and therefore the whole head surface.
function clearance(model,hats) {
  const head=model.root.getObjectByName('Cabeza de Zud'),mount=hats.anchor.children[0];
  model.root.updateMatrixWorld(true);
  head.geometry.computeBoundingBox();
  const center=head.geometry.boundingBox.getCenter(new THREE.Vector3());
  const radii=head.geometry.boundingBox.getSize(new THREE.Vector3()).multiplyScalar(.5);
  const p=head.geometry.attributes.position,v=new THREE.Vector3();let envelope=1;
  for(let i=0;i<p.count;i++)envelope=Math.max(envelope,v.fromBufferAttribute(p,i).sub(center).divide(radii).length());
  radii.multiplyScalar(envelope);
  const toHead=head.matrixWorld.clone().invert().multiply(mount.matrixWorld);
  const triangle=new THREE.Triangle(),origin=new THREE.Vector3();let min=Infinity;
  mount.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const positions=mesh.geometry.attributes.position;
    for(let i=0;i<positions.count;i+=3){
      for(const [j,target] of [triangle.a,triangle.b,triangle.c].entries())target.fromBufferAttribute(positions,i+j).applyMatrix4(toHead).sub(center).divide(radii);
      triangle.closestPointToPoint(origin,v);
      if(Number.isFinite(v.length()))min=Math.min(min,v.length());
      else {
        // A collapsed embroidery face has the distance of its three segments.
        for(const [a,b] of [[triangle.a,triangle.b],[triangle.b,triangle.c],[triangle.c,triangle.a]]){
          const edge=b.clone().sub(a),t=edge.lengthSq()?THREE.MathUtils.clamp(-a.dot(edge)/edge.lengthSq(),0,1):0;
          min=Math.min(min,a.clone().addScaledVector(edge,t).length());
        }
      }
    }
  });
  return min;
}

for(const entry of HAT_CATALOG)test(`${entry.name}: fitted faces clear the head at rest and at extreme adjustments`,async()=>{
  const model=createZudModel({appearance:false}),hats=createCharacterHats(model,{load});
  const settings={...CHARACTER_DEFAULTS,...hatDefaults(entry.id)};
  await hats.update(settings);expect(clearance(model,hats)).toBeGreaterThan(1);
  const root=hats.anchor.children[0].children[0];
  const rest=root.children.map(mesh=>mesh.geometry.attributes.position.array.slice());
  await hats.update({...settings,hatSize:.75,hatTilt:25,hatYaw:135,hatOffsetY:-.35,hatOffsetX:.3,hatOffsetZ:.3,hatCrownHeight:.8});
  expect(clearance(model,hats)).toBeGreaterThan(1);
  // Starting from immutable rest positions avoids drift after repeated edits.
  await hats.update(settings);
  root.children.forEach((mesh,i)=>expect(mesh.geometry.attributes.position.array).toEqual(rest[i]));
  const surfaces=new Set(root.children.map(mesh=>mesh.material.userData.hatSurface));
  expect(surfaces.size).toBeGreaterThan(1);
  let materials=0,disposed=0;const owned=new Set(root.children.map(mesh=>mesh.material));
  for(const material of owned){materials++;material.addEventListener('dispose',()=>disposed++);}
  hats.dispose();expect(disposed).toBe(materials);model.dispose();
});

test('fitting follows an enlarged head and can be disabled without destroying the model',async()=>{
  const model=createZudModel({appearance:false}),hats=createCharacterHats(model,{load});
  const settings={...CHARACTER_DEFAULTS,hatModel:'crescent_wizard',hatSize:.85};
  await hats.update({...settings,hatAutoFit:false});expect(clearance(model,hats)).toBeLessThan(1);
  await hats.update(settings);expect(clearance(model,hats)).toBeGreaterThan(1);
  model.root.getObjectByName('Cabeza de Zud').scale.multiplyScalar(1.2);
  await hats.update(settings);expect(clearance(model,hats)).toBeGreaterThan(1);
  hats.dispose();model.dispose();
  expect(readCharacterDocument({version:1,settings:{}}).settings).toMatchObject({hatAutoFit:true,hatCrownHeight:1});
});

test('Kasa crown stays a single continuous surface after fitting, visible from either side',async()=>{
  const model=createZudModel({appearance:false}),hats=createCharacterHats(model,{load});
  await hats.update({...CHARACTER_DEFAULTS,...hatDefaults('samurai_kasa')});
  const root=hats.anchor.children[0].children[0],shells=root.children.filter(mesh=>mesh.userData.hatRole==='shell');
  expect(shells.length).toBeGreaterThan(0);
  const surfaces=shells.map(mesh=>new THREE.Mesh(mesh.geometry,mesh.material));
  for(const mesh of surfaces)expect(mesh.material.side).toBe(THREE.DoubleSide);
  // Cast only to the cone axis: crossing a second sheet on the same side is
  // the lining poking through the crown, which made the triangular rear band.
  const ray=new THREE.Raycaster(),direction=new THREE.Vector3();ray.far=4;
  for(const height of [.95,1.15,1.3,1.45,1.6,1.75])for(let i=0;i<64;i++){
    const angle=(i+.27)/64*Math.PI*2;direction.set(Math.sin(angle),0,Math.cos(angle));
    ray.set(direction.clone().multiplyScalar(4).setY(height),direction.clone().negate());
    const hits=ray.intersectObjects(surfaces,false),distances=[];
    for(const hit of hits)if(!distances.some(distance=>Math.abs(distance-hit.distance)<1e-4))distances.push(hit.distance);
    expect(distances.length,`crown crossings at height ${height}, angle ${angle}`).toBe(1);
  }
  hats.dispose();model.dispose();
});
