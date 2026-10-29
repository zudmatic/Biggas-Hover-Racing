import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {raiseBiggasSkyline} from '../src/biggas-city-skyline.js';
import {createBiggasSignage,citySignPanels} from '../src/biggas-city-signage.js';
import {createBiggasAds,biggasAds} from '../src/biggas-city-ads.js';

test('approved ad artwork keeps its crop, orientation and original aspect',()=>{
  const ads=createBiggasAds();expect(biggasAds).toHaveLength(20);
  expect(ads.material.toneMapped).toBe(false);expect(ads.material.userData.circuitUntextured).toBe(true);
  for(const ad of biggasAds){
    const g=ads.panel(ad.id,10),uv=g.attributes.uv;g.computeBoundingBox();const size=g.boundingBox.getSize(new T.Vector3());
    expect(size.x/size.y).toBeCloseTo(ad.aspect,5);
    const [x0,y0,x1,y1]=ad.rect;
    expect(uv.getX(0)).toBeCloseTo(x0/1536,6);expect(uv.getY(0)).toBeCloseTo(1-y0/1024,6);
    expect(uv.getX(3)).toBeCloseTo(x1/1536,6);expect(uv.getY(3)).toBeCloseTo(1-y1/1024,6);
    expect(uv.getX(1)).toBeGreaterThan(uv.getX(0));g.dispose();
  }ads.dispose();
});

test('five taller towers retain their footprints, entrances and window proportions',async()=>{
  const bytes=fs.readFileSync('public/models/biggas-city/Biggas_City_039_v02_City.glb'),asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');
  const sources=new Map();asset.scene.traverse(m=>{if(m.isMesh)sources.set(m,{geometry:m.geometry,position:m.geometry.attributes.position.array.slice()});});
  const raised=raiseBiggasSkyline([asset]);expect(raised).toHaveLength(5);expect(Math.max(...raised.map(r=>r.height))).toBeGreaterThan(200);
  let added=0;
  for(const tower of raised){
    expect(tower.height).toBeGreaterThan(125);for(const axis of ['x','z']){expect(tower.after.min[axis]).toBe(tower.before.min[axis]);expect(tower.after.max[axis]).toBe(tower.before.max[axis]);}expect(tower.after.min.y).toBe(tower.before.min.y);
    asset.scene.getObjectByName(tower.name).traverse(m=>{
      if(!m.isMesh)return;const source=sources.get(m).geometry,expanded=source.index?source.toNonIndexed():source,before=expanded.attributes.position.array,after=m.geometry.attributes.position;added+=(after.count-before.length/3)/3;
      let footprintError=0,entranceError=0,windowError=0;
      for(let i=0;i<before.length/3;i++){footprintError=Math.max(footprintError,Math.abs(after.getX(i)-before[i*3]),Math.abs(after.getZ(i)-before[i*3+2]));if(before[i*3+1]<3.5)entranceError=Math.max(entranceError,Math.abs(after.getY(i)-before[i*3+1]));}
      if(/Glass|WindowWarm/.test(m.material.name))for(let i=0;i<before.length/3;i+=3){const oldHeight=Math.max(...[0,1,2].map(k=>before[(i+k)*3+1]))-Math.min(...[0,1,2].map(k=>before[(i+k)*3+1])),newHeight=Math.max(...[0,1,2].map(k=>after.getY(i+k)))-Math.min(...[0,1,2].map(k=>after.getY(i+k)));windowError=Math.max(windowError,Math.abs(newHeight-oldHeight));}
      expect(footprintError).toBe(0);expect(entranceError).toBe(0);expect(windowError).toBeLessThan(.00005);
      if(expanded!==source)expanded.dispose();
    });
  }
  expect(added).toBeLessThan(100000);expect(raiseBiggasSkyline([asset])).toEqual([]);
  for(const [mesh,before] of sources)if(!mesh.parent.userData.biggasRaised){expect(mesh.geometry).toBe(before.geometry);expect(mesh.geometry.attributes.position.array.every((value,index)=>value===before.position[index])).toBe(true);}
  const geometries=new Set([...sources.values()].map(s=>s.geometry)),materials=new Set();asset.scene.traverse(m=>{if(m.isMesh){geometries.add(m.geometry);materials.add(m.material);}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
});

test('city and train signage share one atlas with readable front and back faces',()=>{
  const signage=createBiggasSignage();expect(signage.material.userData.circuitUntextured).toBe(true);expect(citySignPanels).toHaveLength(6);expect(citySignPanels.every(p=>!/atajo|salto/i.test(p.title+p.subtitle))).toBe(true);
  for(let row=0;row<citySignPanels.length;row++){
    const g=signage.panel(row,10,2.5,{twoSided:true}),uv=g.attributes.uv,p=g.attributes.position,n=g.attributes.normal;
    for(let i=0;i<uv.count;i++){expect(uv.getY(i)).toBeGreaterThan((7-row)/8);expect(uv.getY(i)).toBeLessThan((8-row)/8);expect(uv.getX(i)).toBeGreaterThan(0);expect(uv.getX(i)).toBeLessThan(1);}
    // Viewed from either face, increasing text U points right, not mirrored.
    for(const start of [0,4]){expect((p.getX(start+1)-p.getX(start))*n.getZ(start)).toBeGreaterThan(0);expect(uv.getX(start+1)).toBeGreaterThan(uv.getX(start));}
    g.dispose();
  }signage.dispose();
});
