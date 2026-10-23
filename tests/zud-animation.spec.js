import {test,expect} from '@playwright/test';
import {Vector3} from 'three';
import {createZudModel} from '../src/zud-model.js';
import {createZudAnimator} from '../src/zud-animation.js';
import {EYE_DEFAULTS} from '../src/eye-settings.js';
import {createAccessories} from '../src/accessories.js';

test('Lying down closes both eyes, including during a blink, and waking restores the gaze',()=>{
  for(const motion of [0,1]){
    const model=createZudModel(),animator=createZudAnimator(model);
    // The climb still uses the idle action, before arrival starts sleep.
    for(let i=0;i<45;i++)animator.update({state:'idle',lying:1,traveling:true,blink:true,motion});
    for(const eye of model.eyes.children){
      expect(eye.scale.y).toBe(1);
      expect(eye.userData.aperture).toBeLessThan(.01);
      expect(eye.getObjectByName('Blanco del ojo').visible).toBe(false);
      expect(eye.getObjectByName('Pupila').visible).toBe(false);
      expect(eye.getObjectByName('Párpado cerrado').visible).toBe(true);
    }
    for(let i=0;i<45;i++)animator.update({state:'idle',motion});
    for(const eye of model.eyes.children){
      expect(eye.scale.y).toBe(1);
      expect(eye.userData.aperture).toBeCloseTo(EYE_DEFAULTS.eyeOpening,2);
      expect(eye.getObjectByName('Blanco del ojo').visible).toBe(true);
      expect(eye.getObjectByName('Pupila').visible).toBe(true);
      expect(eye.getObjectByName('Párpado cerrado').visible).toBe(false);
    }
  }
});

test('Zud keeps shoulders and hips attached through every action and interrupted transitions',()=> {
  const model=createZudModel(),animate=createZudAnimator(model);
  const joints=[...model.arms,...model.feet];
  const anchors=joints.map(joint=>joint.position.clone());
  const states=['idle','wave','jump','dance','sleep','work','smoke','disco','halloween'];
  for(const motion of [1,0])for(const state of states)for(const typingAtDesk of [false,true]) {
    for(let frame=0;frame<90;frame++) {
      animate.update({state,time:frame/60,elapsed:frame/60,halloweenElapsed:frame/60,motion,
        workPose:state==='work',typingAtDesk:state==='work'&&typingAtDesk,
        wearing:['disco','halloween'].includes(state)&&frame<51&&Boolean(motion),musicPlaying:true,musicTime:frame/60});
      for(let i=0;i<joints.length;i++)expect(joints[i].position.distanceTo(anchors[i])).toBeLessThan(1e-9);
      expect(model.root.scale.toArray()).toEqual([1,1,1]);
    }
  }
  animate.update({state:'idle',traveling:true});
  animate.reset();
  expect(model.root.position.x).toBe(0);expect(model.root.position.z).toBe(0);
  joints.forEach((joint,i)=>expect(joint.position.distanceTo(anchors[i])).toBeLessThan(1e-9));
});

test('Zud steps from the hips, approaches the desk facing forward and keeps smoking attached to his hand',()=> {
  const model=createZudModel(),animate=createZudAnimator(model);
  const accessories=createAccessories(model.accessoryMount);
  for(let i=0;i<60;i++)animate.update({gait:{phase:0,weight:1}});
  expect(model.feet[0].rotation.x).toBeGreaterThan(.4);expect(model.feet[1].rotation.x).toBeLessThan(-.4);
  for(let i=0;i<60;i++)animate.update({state:'work',typingAtDesk:true,workPose:true,yaw:Math.PI/2});
  expect(model.root.position.x).toBeGreaterThan(1.4);expect(Math.abs(model.root.position.z)).toBeLessThan(.001);
  for(let i=0;i<60;i++) {
    accessories.update({state:'smoke',time:i/60,elapsed:i/60,motion:1,traveling:false});
    animate.update({state:'smoke',time:i/60,accessories});
    model.root.updateMatrixWorld(true);
    const hand=model.rig.hands[0].getWorldPosition(new Vector3());
    const cigarette=accessories.smoking.localToWorld(new Vector3(-.19,-.42,.80));
    expect(hand.distanceTo(cigarette)).toBeLessThan(1e-7);
  }
  animate.update({state:'idle',accessories});
  expect(accessories.smoking.position.length()).toBe(0);
});

test('Zud smokes with eyes closed: raise, drag (ember flares), lower, exhale; and waters from his left hand',async()=> {
  const {smokeCycle}=await import('../src/accessories.js');
  const model=createZudModel(),animate=createZudAnimator(model);
  const accessories=createAccessories(model.accessoryMount);
  const pose=time=>{for(let i=0;i<90;i++){accessories.update({state:'smoke',time,elapsed:time,motion:1,traveling:false,cycle:smokeCycle(time)});animate.update({state:'smoke',time,elapsed:time,accessories});}
    model.root.updateMatrixWorld(true);return model.rig.hands[0].getWorldPosition(new Vector3());};
  const low=pose(0),high=pose(.3*5.2);
  expect(high.y-low.y).toBeGreaterThan(.4);
  expect(smokeCycle(.32*5.2).drag).toBeGreaterThan(.9);expect(smokeCycle(.7*5.2).exhale).toBeGreaterThan(.9);
  expect(model.eyes.children.every(eye=>eye.userData.aperture<.12)).toBe(true);
  for(let i=0;i<90;i++){accessories.update({state:'water',time:i/60,elapsed:1,motion:1,traveling:false});animate.update({state:'water',time:i/60,accessories});}
  model.root.updateMatrixWorld(true);
  const hand=model.rig.hands[0].getWorldPosition(new Vector3()),can=accessories.can.getWorldPosition(new Vector3());
  expect(hand.distanceTo(can)).toBeLessThan(1e-6);
  expect(accessories.watering.visible).toBe(true);
});
