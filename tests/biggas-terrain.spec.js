import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {refineBiggasTerrain} from '../src/biggas-city-terrain.js';
import {createSurfaceIndex} from '../src/circuit-collision.js';
import * as THREE from 'three';

test('refined hills preserve scenery anchors and keep a bounded, continuous surface',async()=>{
  const b=fs.readFileSync('public/models/biggas-city/Biggas_City_039_v02_Core.glb'),asset=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),''),source=asset.scene.getObjectByName('Continuous_sculpted_landscape_1').geometry,snapshot=source.attributes.position.array.slice(),g=refineBiggasTerrain(source),height=createSurfaceIndex(new THREE.Mesh(g)),p=source.attributes.position;
  expect(source.attributes.position.array).toEqual(snapshot);expect(g.index.count/3).toBeLessThan(65000);
  // Existing trees and rocks retain their original ground contact points.
  for(let i=0;i<p.count;i+=13)expect(Math.abs(height(p.getX(i),p.getZ(i))-p.getY(i))).toBeLessThan(.002);
  const edges=new Map();for(let i=0;i<g.index.count;i+=3)for(let j=0;j<3;j++){const a=g.index.getX(i+j),b=g.index.getX(i+(j+1)%3),key=a<b?`${a}:${b}`:`${b}:${a}`;edges.set(key,(edges.get(key)??0)+1);}
  expect([...edges.values()].every(n=>n===1||n===2)).toBe(true);
  const positions=g.attributes.position,normals=g.attributes.normal;
  for(let i=0;i<positions.count;i+=31){expect(Number.isFinite(positions.getY(i))).toBe(true);expect(Math.hypot(normals.getX(i),normals.getY(i),normals.getZ(i))).toBeCloseTo(1,4);}
  g.dispose();asset.scene.traverse(m=>{m.geometry?.dispose();m.material?.dispose();});
});
