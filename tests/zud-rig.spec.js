import {test,expect} from '@playwright/test';
import {Vector3} from 'three';
import {createZudModel} from '../src/zud-model.js';
import {createZudAnimator} from '../src/zud-animation.js';
import {createCharacterArms} from '../src/character-arms.js';
import {createAccessories} from '../src/accessories.js';
import {ARM_CATALOG} from '../src/arm-catalog.js';

test('bending changes the shells, preserves proximal anchors and never accumulates deformation',()=>{
  for(const detail of ['low','original','medium','high']) {
    const model=createZudModel({detail,appearance:false}),other=createZudModel({detail,appearance:false});
    const meshes=[...model.arms.map(arm=>arm.getObjectByName('Brazo')),...model.feet.map(hip=>hip.getObjectByName('Pierna'))];
    const original=meshes.map(mesh=>mesh.geometry.attributes.position.array.slice());
    const otherArm=other.arms[0].getObjectByName('Brazo'),shared=otherArm.geometry.attributes.position.array.slice();
    for(let cycle=0;cycle<20;cycle++) {
      model.rig.elbows.forEach(joint=>joint.rotation.x=-.9);model.rig.knees.forEach(joint=>joint.rotation.x=.7);model.rig.update();
      for(const [index,mesh] of meshes.entries()) {
        const p=mesh.geometry.attributes.position.array,rest=original[index];let moved=0,anchored=0,anchorError=0;
        for(let i=0;i<p.length;i+=3) {
          if(Math.abs(p[i+2]-rest[i+2])>.02)moved++;
          // Upper shoulder and thigh roots are deliberately rigid.
          if(rest[i+1]+mesh.position.y>.1){anchorError=Math.max(anchorError,Math.abs(p[i+1]-rest[i+1]),Math.abs(p[i+2]-rest[i+2]));anchored++;}
        }
        expect(moved).toBeGreaterThan(8);expect(anchored).toBeGreaterThan(8);expect(anchorError).toBeLessThan(1e-7);
      }
      model.rig.reset();
    }
    meshes.forEach((mesh,index)=>{
      const error=mesh.geometry.attributes.position.array.reduce((max,value,i)=>Math.max(max,Math.abs(value-original[index][i])),0);
      expect(error).toBeLessThan(1e-7);
    });
    expect(Array.from(otherArm.geometry.attributes.position.array)).toEqual(Array.from(shared));
    model.dispose();other.dispose();
  }
});

test('walking alternates knee flexion with supported soles across the entire stride',()=>{
  const model=createZudModel(),animator=createZudAnimator(model),point=new Vector3();
  const lifted=[false,false];
  for(let frame=0;frame<120;frame++) {
    animator.update({gait:{weight:1,phase:frame/120*Math.PI*2},time:frame/60});
    model.root.updateMatrixWorld(true);
    const soles=model.feet.map(hip=>{
      const mesh=hip.getObjectByName('Pierna'),p=mesh.geometry.attributes.position;let y=Infinity;
      for(let i=0;i<p.count;i++)y=Math.min(y,point.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld).y);
      return y;
    });
    expect(Math.min(...soles)).toBeCloseTo(0,5);
    model.rig.knees.forEach((joint,i)=>{lifted[i] ||=joint.rotation.x>.4;expect(joint.rotation.x).toBeGreaterThanOrEqual(0);});
  }
  expect(lifted).toEqual([true,true]);model.dispose();
});

test('turns take the short route across ±π and reset restores a complete neutral rig',()=>{
  const model=createZudModel(),animator=createZudAnimator(model);
  for(let i=0;i<90;i++)animator.update({yaw:Math.PI-.02,state:'wave',time:.4,elapsed:.4});
  const before=model.root.rotation.y;
  animator.update({yaw:-Math.PI+.02});
  expect(Math.abs(model.root.rotation.y-before)).toBeLessThan(.025);
  animator.update({state:'jump',elapsed:.3});animator.reset();
  expect(model.root.position.toArray()).toEqual([0,1.34,0]);
  expect(model.root.rotation.toArray().slice(0,3)).toEqual([0,0,0]);
  for(const joint of [...model.arms,...model.feet,...model.rig.elbows,...model.rig.knees])expect(joint.rotation.toArray().slice(0,3)).toEqual([0,0,0]);
  model.dispose();
});

test('constant poses settle identically at 30 and 60 fps, including elbows and knees',()=>{
  const models=[createZudModel(),createZudModel()];
  models.forEach((model,index)=>{
    const animator=createZudAnimator(model),fps=index?60:30;
    for(let i=0;i<fps;i++)animator.update({state:'dance',time:.4,elapsed:.4,dt:1/fps,yaw:.8});
  });
  for(const key of ['elbows','knees'])models[0].rig[key].forEach((joint,i)=>expect(joint.rotation.x).toBeCloseTo(models[1].rig[key][i].rotation.x,8));
  expect(models[0].root.rotation.y).toBeCloseTo(models[1].root.rotation.y,8);
  models.forEach(model=>model.dispose());
});

test('all alternate forearms articulate, hold props at their hand socket and release deformed buffers',()=>{
  const model=createZudModel(),animator=createZudAnimator(model),arms=createCharacterArms(model),accessories=createAccessories(model.accessoryMount);
  for(const {id} of ARM_CATALOG) {
    arms.update({armRight:id,armLeft:id});
    const asset=model.arms[0].children.find(child=>child.userData.armModel);
    const mesh=asset.children.find(mesh=>mesh.userData.parts.some(part=>part.name==='Carcasa del puño'));
    const part=mesh.userData.parts.find(part=>part.name==='Carcasa del puño'),rest=new Vector3().fromBufferAttribute(mesh.geometry.attributes.position,part.start);
    for(let i=0;i<60;i++)animator.update({state:'water',time:.4,accessories});
    const bent=new Vector3().fromBufferAttribute(mesh.geometry.attributes.position,part.start);
    expect(bent.distanceTo(rest),id).toBeGreaterThan(.05);
    model.root.updateMatrixWorld(true);
    expect(model.rig.hands[0].getWorldPosition(new Vector3()).distanceTo(accessories.can.getWorldPosition(new Vector3()))).toBeLessThan(1e-7);
    // Distances between armored palm vertices stay rigid under elbow flexion.
    const p=mesh.geometry.attributes.position;
    const a=new Vector3().fromBufferAttribute(p,part.start),b=new Vector3().fromBufferAttribute(p,part.start+1),distance=a.distanceTo(b);
    model.rig.elbows[0].rotation.x=-1;model.rig.update();
    expect(a.fromBufferAttribute(p,part.start).distanceTo(b.fromBufferAttribute(p,part.start+1))).toBeCloseTo(distance,6);
    let released=0;mesh.geometry.addEventListener('dispose',()=>released++);
    arms.update({armLeft:'none',armRight:'none'});expect(released).toBe(1);
    expect(model.rig.hands[0].position.toArray()).toEqual(model.rig.hands[0].userData.restPosition.toArray());
  }
  arms.dispose();model.dispose();
});

test('jump has anticipation, airborne extension and a settling landing; reduced motion stays still',()=>{
  const model=createZudModel(),animator=createZudAnimator(model);
  const sample=elapsed=>{
    for(let frame=0;frame<60;frame++)animator.update({state:'jump',elapsed,time:elapsed});
    return {height:model.root.position.y,knee:model.rig.knees[0].rotation.x};
  };
  const crouch=sample(.064),air=sample(.376),land=sample(.704);
  expect(crouch.knee).toBeGreaterThan(.6);expect(air.height-crouch.height).toBeGreaterThan(.6);expect(land.knee).toBeGreaterThan(.4);
  for(let frame=0;frame<90;frame++)animator.update({state:'idle'});
  expect(model.rig.knees[0].rotation.x).toBeLessThan(.001);
  for(let frame=0;frame<90;frame++)animator.update({state:'jump',elapsed:frame/60,motion:0});
  expect(model.rig.knees[0].rotation.x).toBeLessThan(.001);expect(model.root.position.y).toBeCloseTo(1.34,2);
  model.dispose();
});
