import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {selectDesertLod,createDesertLod} from '../src/desert-lod.js';

test('LOD boundaries have hysteresis and jump directly after teleport',()=>{
  expect(selectDesertLod(35,-1,[35,100],360)).toBe(1);
  expect(selectDesertLod(37,0,[35,100],360)).toBe(0);
  expect(selectDesertLod(40,0,[35,100],360)).toBe(1);
  expect(selectDesertLod(33,1,[35,100],360)).toBe(1);
  expect(selectDesertLod(30,1,[35,100],360)).toBe(0);
  expect(selectDesertLod(1000,0,[35,100],360)).toBe(3);
  expect(selectDesertLod(1,3,[35,100],360)).toBe(0);
  expect(selectDesertLod(10000,2,[100,260],null)).toBe(2);
});

test('LOD batches preserve transforms, survive empty levels and split at 128',()=>{
  const root=new THREE.Group(),asset=new THREE.Group(),geometry=new THREE.BoxGeometry(),material=new THREE.MeshStandardMaterial();
  for(let level=0;level<3;level++){const m=new THREE.Mesh(geometry,material);m.name='level'+level;asset.add(m);}
  const matrix=new THREE.Matrix4(),placements=Array.from({length:260},(_,i)=>({matrix:matrix.makeTranslation(i*.01,0,0).toArray()}));
  const family={id:'test',role:'vegetation',nodes:['level0','level1','level2'],triangles:[12,8,4],distances:[35,100],cullDistance:360,placements};
  const lod=createDesertLod(root,asset,{families:[family],replacements:[],instanceCount:260,vegetationCount:260,hysteresis:.12});
  lod.update({x:0,y:0,z:0},0,true);expect(lod.stats.levels).toEqual([260,0,0]);
  root.traverse(o=>{if(o.isInstancedMesh)expect(o.instanceMatrix.count).toBeLessThanOrEqual(128);});
  lod.update({x:1000,y:0,z:0},0,true);expect(lod.stats.culled).toBe(260);
  lod.update({x:0,y:0,z:0},0,true);expect(lod.stats.levels).toEqual([260,0,0]);
  const restored=[];root.traverse(o=>{if(o.isInstancedMesh&&o.visible){expect(o.boundingSphere.radius).toBeGreaterThan(0);for(let i=0;i<o.count;i++){o.getMatrixAt(i,matrix);restored.push(matrix.elements[12]);}}});
  expect(restored).toHaveLength(260);restored.forEach((x,i)=>expect(x).toBeCloseTo(i*.01,5));
  lod.setMode('full');lod.update({x:1000,y:0,z:0},0,true);expect(lod.stats.levels).toEqual([260,0,0]);
  lod.dispose();expect(root.children).toHaveLength(0);geometry.dispose();material.dispose();
});

test('compressed detail package loads all LODs with shared textures and exact population',async({page})=>{
  test.setTimeout(120000);await page.goto('/?selection=map&map=desert-valley');
  const result=await page.evaluate(async()=>{
    const {createDesertWorld}=await import('/src/desert-world.js');const world=await createDesertWorld();
    const spawn={...world.landscape.spawn};world.lod.setMode('full');world.lod.update(spawn,0,true);
    const full=structuredClone(world.lod.stats);world.lod.setMode('adaptive');world.lod.update(spawn,0,true);const adaptive=structuredClone(world.lod.stats);
    let largest=0,oldVegetation=0;world.root.traverse(o=>{if(o.isInstancedMesh)largest=Math.max(largest,o.instanceMatrix.count);if(o.userData.role==='vegetation')oldVegetation++;});
    const result={full,adaptive,largest,oldVegetation,instances:world.instanceCount,floor:world.surfaceHeight(spawn.x,spawn.z),waterTriangles:world.root.getObjectByName('SM_Water').geometry.index.count/3};world.dispose();return result;
  });
  expect(result.full.levels).toEqual([333,0,0]);expect(result.full.vegetation).toBe(277);expect(result.instances).toBe(859);
  expect(result.adaptive.triangles).toBeLessThan(result.full.triangles*.5);expect(result.largest).toBeLessThanOrEqual(128);expect(result.oldVegetation).toBe(0);
  expect(result.waterTriangles).toBe(2);expect(Number.isFinite(result.floor)).toBe(true);
});
