import {test,expect} from '@playwright/test';
import {Box3,DoubleSide,Raycaster,Vector3} from 'three';
import {createZudModel} from '../src/zud-model.js';
import {createZudAnimator} from '../src/zud-animation.js';

test('curves 100 has a continuous beanie hem without periodic pointed scallops',()=>{
  const model=createZudModel({detail:'high',curve:1,appearance:false});model.root.position.set(0,0,0);model.root.updateMatrixWorld(true);
  const band=model.root.getObjectByName('Doblez'),box=new Box3().setFromObject(band),center=box.getCenter(new Vector3());
  const ray=new Raycaster(),heights=[];ray.far=4;
  // Sample only the near wall: the lower far wall must not mask a notch.
  for(let i=0;i<120;i++) {
    const angle=i/120*Math.PI*2,direction=new Vector3(-Math.sin(angle),0,-Math.cos(angle));let lo=box.min.y-.1,hi=center.y;
    for(let step=0;step<15;step++) {
      const mid=(lo+hi)/2;ray.set(new Vector3(center.x+4*Math.sin(angle),mid,center.z+4*Math.cos(angle)),direction);
      if(ray.intersectObject(band)[0])hi=mid;else lo=mid;
    }
    heights.push((lo+hi)/2);
  }
  const maxKink=Math.max(...heights.map((h,i)=>Math.abs(heights[(i+1)%120]+heights[(i+119)%120]-2*h)));
  // The old alternating triangulation measured 0.0152; the corrected hem is 0.0013.
  expect(maxKink).toBeLessThan(.003);model.dispose();
});

test('thigh roots remain tucked behind the torso across the smoothing range',()=>{
  for(const curve of [0,.5,1]) {
    const model=createZudModel({detail:'high',curve,appearance:false});model.root.position.set(0,0,0);model.root.updateMatrixWorld(true);
    const torso=model.root.getObjectByName('Torso'),ray=new Raycaster();let clearance=Infinity;
    for(const pivot of model.feet)for(const y of [-.86,-.82,-.78])for(const offset of [-.04,.04]) {
      ray.set(new Vector3(pivot.position.x+offset,y,4),new Vector3(0,0,-1));
      const body=ray.intersectObject(torso)[0],leg=ray.intersectObject(pivot.getObjectByName('Pierna'))[0];
      expect(body).toBeTruthy();expect(leg).toBeTruthy();clearance=Math.min(clearance,body.point.z-leg.point.z);
    }
    expect(clearance).toBeGreaterThan(.02);model.dispose();
  }
});

test('shoulders, hips and neck retain actual mesh overlap during animated poses',()=>{
  const model=createZudModel({detail:'high',curve:1,appearance:false}),animator=createZudAnimator(model);
  const torso=model.root.getObjectByName('Torso'),head=model.root.getObjectByName('Cabeza de Zud');
  torso.material.side=head.material.side=DoubleSide;
  const ray=new Raycaster(),direction=new Vector3(.137,.231,1).normalize();
  function overlaps(mesh,other) {
    const p=mesh.geometry.attributes.position;let inside=0;
    for(let i=0;i<p.count;i+=15) {
      ray.set(new Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld),direction);
      const hits=ray.intersectObject(other).map(hit=>hit.distance).filter((distance,j,all)=>j===0||distance-all[j-1]>1e-5);
      if(hits.length%2===1&&++inside===3)return true;
    }
    return false;
  }
  for(const state of ['idle','wave','dance','jump','smoke','work']) {
    for(let frame=0;frame<45;frame++)animator.update({state,dt:1/30,time:.6,elapsed:.6,workPose:state==='work',typingAtDesk:state==='work'});
    model.root.updateMatrixWorld(true);
    for(const joint of [...model.arms,...model.feet]) {
      expect(joint.position.distanceTo(joint.userData.restPosition)).toBeLessThan(1e-9);
      expect(overlaps(joint.children[0],torso),`${state}: ${joint.children[0].name} detached`).toBe(true);
    }
    expect(overlaps(torso,head),`${state}: open neck`).toBe(true);
  }
  model.dispose();
});

test('smooth hips share a continuous normal and comic print frame on the front and back',()=>{
  const model=createZudModel();model.root.position.y=0;model.root.updateMatrixWorld(true);
  const torso=model.root.getObjectByName('Torso');
  for(const side of [-1,1])for(const direction of [-1,1])for(const x of [.23,.30,.40]) {
    const leg=model.feet[side===-1?0:1].getObjectByName('Pierna');let closest=null;
    // Find the actual visible intersection, not a fixed authoring vertex.
    for(let y=-1.04;y<-.81;y+=.001) {
      const ray=new Raycaster(new Vector3(side*x,y,4*direction),new Vector3(0,0,-direction));
      const bodyHit=ray.intersectObject(torso)[0],legHit=ray.intersectObject(leg)[0];
      if(!bodyHit||!legHit)continue;
      const gap=Math.abs(bodyHit.point.z-legHit.point.z);
      if(!closest||gap<closest.gap)closest={gap,bodyHit,legHit};
    }
    expect(closest).toBeTruthy();expect(closest.gap).toBeLessThan(.002);
    expect(closest.bodyHit.normal.angleTo(closest.legHit.normal)).toBeLessThan(12*Math.PI/180);
    const printPoint=(mesh,hit)=>{
      const point=mesh.worldToLocal(hit.point.clone());
      // Each rigid part's attribute is a constant rest-frame translation.
      return point.add(new Vector3().fromBufferAttribute(mesh.geometry.attributes.retroPrintOffset,hit.face.a));
    };
    expect(printPoint(torso,closest.bodyHit).distanceTo(printPoint(leg,closest.legHit))).toBeLessThan(.002);
  }
  model.dispose();
});
