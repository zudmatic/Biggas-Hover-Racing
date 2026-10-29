import {test,expect} from '@playwright/test';
import * as T from 'three';
import fs from 'node:fs';
import {createBiggasHorizon} from '../src/biggas-city-horizon.js';
import {createCircuitLighting} from '../src/circuit-lighting.js';
import {createCircuitLandscape} from '../src/circuit-physics.js';

for(const mobile of [false,true])test(`distant mountains close the horizon with bounded geometry (mobile=${mobile})`,()=>{
  const root=new T.Group(),horizon=createBiggasHorizon(root,{mobile}),p=horizon.mesh.geometry.attributes.position,segments=mobile?128:256;
  expect(root.children).toHaveLength(1);expect(horizon.triangles).toBeLessThanOrEqual(4096);expect(horizon.mesh.castShadow).toBe(false);expect(horizon.mesh.material.map).toBeNull();
  for(let row=0;row<10;row++){
    const first=new T.Vector3().fromBufferAttribute(p,row*(segments+1)),last=new T.Vector3().fromBufferAttribute(p,row*(segments+1)+segments);
    expect(first.distanceTo(last)).toBeLessThan(.001);
  }
  for(let i=0;i<p.count;i++)expect(Math.hypot(p.getX(i),p.getZ(i))).toBeGreaterThan(950);
  const positions=p.array.slice();horizon.update(1);expect(horizon.mesh.material.color.getHex()).toBe(0x344f70);expect(p.array).toEqual(positions);horizon.update(0);expect(horizon.mesh.material.color.getHex()).toBe(0xffffff);horizon.dispose();expect(root.children).toHaveLength(0);
});

for(const mobile of [false,true])test(`sun covers the route two seconds before boosted arrival (mobile=${mobile})`,()=>{
  const scene=new T.Scene();scene.background=new T.Color();scene.fog=new T.Fog(0,1,1000);
  const lighting=createCircuitLighting(scene,{mobile}),map=createCircuitLandscape(JSON.parse(fs.readFileSync('public/models/biggas-city/route_gltf.json')),JSON.parse(fs.readFileSync('public/models/biggas-city/gameplay.json')));
  lighting.setTrack({map:'biggas-city',authoredLighting:true});
  for(let d=0;d<map.length;d+=80){
    const p=map.atDistance(d),state={...p,vx:p.nx*72,vz:p.nz*72,yaw:Math.atan2(p.nx,p.nz),pitch:0};lighting.update(state,d,{reducedMotion:true});scene.updateMatrixWorld(true);lighting.sun.shadow.updateMatrices(lighting.sun);
    const camera=lighting.sun.shadow.camera;
    for(const ahead of [0,36,72,108,144]){const future=map.atDistance((d+ahead)%map.length),clip=new T.Vector3(future.x,future.y,future.z).project(camera);expect(Math.abs(clip.x),`route ${d}+${ahead}`).toBeLessThan(1);expect(Math.abs(clip.y)).toBeLessThan(1);expect(Math.abs(clip.z)).toBeLessThan(1);}
    expect(lighting.sun.position.clone().sub(lighting.sun.target.position).distanceTo(new T.Vector3(-220,360,140))).toBeLessThan(1e-9);
  }
  lighting.dispose();
});
