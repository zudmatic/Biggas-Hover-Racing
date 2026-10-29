import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {prepareBiggasCity} from '../src/biggas-city-scene.js';
import {createCircuitTextures} from '../src/circuit-textures.js';
import {createBiggasCityLook} from '../src/biggas-city-look.js';

function file(part){
  const bytes=fs.readFileSync(`public/models/biggas-city/Biggas_City_039_v02_${part}.glb`);
  return {bytes,json:JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString())};
}

test('Blender landmark retains the scene and lights within the reduced geometry budget',()=>{
  const {bytes,json}=file('Landmark');
  let triangles=0;
  for(const node of json.nodes)if(node.mesh!==undefined)for(const primitive of json.meshes[node.mesh].primitives)triangles+=json.accessors[primitive.indices].count/3;
  expect(triangles).toBeLessThan(170000);expect(triangles).toBeGreaterThan(150000);
  expect(bytes.length).toBeLessThan(3700000);expect(json.nodes).toHaveLength(118);
  expect(json.extensions.KHR_lights_punctual.lights).toHaveLength(4);
  expect(json.images??[]).toHaveLength(0);
  for(const name of ['CAT_Head and ears sculpt','CAT_Seated body sculpt'])expect(json.nodes.some(n=>n.name===name)).toBe(true);
});

test('baked canopy depth survives shared instancing and the PSX material conversion',async()=>{
  const {bytes,json}=file('Forest_LOD1');
  expect(json.meshes).toHaveLength(13);expect(json.nodes).toHaveLength(5260);
  expect(json.meshes.filter(m=>m.primitives.some(p=>p.attributes.COLOR_0!==undefined))).toHaveLength(8);
  expect(json.images??[]).toHaveLength(0);
  const asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const root=new T.Group(),textures=createCircuitTextures({size:16}),prepared=prepareBiggasCity([asset],root,textures);
  let triangles=0,colored=0;const geometries=new Set(),materials=new Set();
  for(const mesh of prepared.instances){
    triangles+=mesh.count*mesh.geometry.index.count/3;
    const seen=geometries.has(mesh.geometry);
    geometries.add(mesh.geometry);materials.add(mesh.material);
    const color=mesh.geometry.attributes.color;if(!color)continue;
    colored++;expect(mesh.material.vertexColors).toBe(true);
    if(seen)continue;
    let min=1,max=0,channelError=0;
    for(let i=0;i<color.count;i++){const v=color.getX(i);min=Math.min(min,v);max=Math.max(max,v);channelError=Math.max(channelError,Math.abs(color.getY(i)-v),Math.abs(color.getZ(i)-v));}
    expect(Number.isFinite(min)&&Number.isFinite(max)).toBe(true);expect(channelError).toBeLessThan(1e-5);
    expect(min).toBeGreaterThanOrEqual(.73);expect(max).toBeLessThanOrEqual(1);expect(max-min).toBeGreaterThan(.01);
  }
  expect(triangles).toBe(3517995);expect(colored).toBeGreaterThan(8);
  const look=createBiggasCityLook(root,{getDrawingBufferSize:v=>v.set(960,600)});look.update();
  for(const mesh of prepared.instances)if(mesh.geometry.attributes.color)expect(mesh.material.vertexColors).toBe(true);
  look.dispose();prepared.instances.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.dispose();
});
