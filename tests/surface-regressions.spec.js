import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {createZudModel} from '../src/zud-model.js';
import {createZudAnimator} from '../src/zud-animation.js';

test('Zud has a complete head shell without collapsed forehead vertices',()=>{
  const model=createZudModel(),head=model.root.getObjectByName('Cabeza de Zud'),p=head.geometry.attributes.position;
  // The source head is a unit icosphere; remeshing may inset it slightly,
  // but must never send a missed edge sample to the centre of the face.
  for(let i=0;i<p.count;i++){
    const radius=new THREE.Vector3().fromBufferAttribute(p,i).length();
    expect(radius).toBeGreaterThan(.94);expect(radius).toBeLessThan(1.001);
  }
});

test('Both leg caps remain buried in the torso while idle, jumping, walking, sitting and lying down',()=>{
  const model=createZudModel(),animator=createZudAnimator(model),torso=model.root.getObjectByName('Torso');
  const originalSide=torso.material.side;torso.material.side=THREE.DoubleSide;
  const ray=new THREE.Raycaster(),direction=new THREE.Vector3(.131,.271,1).normalize();
  const poses=[{state:'idle'},{state:'jump'},... [0,Math.PI].map(phase=>({traveling:true,gait:{weight:1,phase}})),{typingAtDesk:true,workPose:true},{lying:1,state:'sleep'}];
  try{for(const pose of poses){
    for(let i=0;i<80;i++)animator.update({...pose,dt:1/60,time:1,elapsed:1,motion:1});
    model.root.updateMatrixWorld(true);
    for(const hip of model.feet){
      const leg=hip.children[0],p=leg.geometry.attributes.position;
      let top=-Infinity;for(let i=0;i<p.count;i++)top=Math.max(top,p.getY(i));
      const visited=new Set();
      for(let i=0;i<p.count;i++){
        if(Math.abs(p.getY(i)-top)>1e-4)continue;
        const point=new THREE.Vector3().fromBufferAttribute(p,i),id=point.toArray().join(',');
        if(visited.has(id))continue;visited.add(id);point.applyMatrix4(leg.matrixWorld);
        ray.set(point,direction);
        // Odd crossings means the physical cap is inside the torso, not just
        // that its animation pivot happens to remain in the right place.
        const distances=new Set(ray.intersectObject(torso,false).map(hit=>hit.distance.toFixed(5)));
        expect(distances.size%2,JSON.stringify(pose)).toBe(1);
      }
    }
  }}finally{torso.material.side=originalSide;}
});
