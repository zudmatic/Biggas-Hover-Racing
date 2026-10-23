import {test,expect} from '@playwright/test';
import {createZudModel} from '../src/zud-model.js';
import {createZudAnimator} from '../src/zud-animation.js';
import {createActionForgePlayer} from '../src/actionforge-animation.js';

const pose=()=>({armX:[0,0],armY:[0,0],armZ:[-.1,.1],legX:[0,0],legZ:[0,0],elbow:[.08,.08],knee:[0,0],rx:0,rz:0,turn:0});
const flatten=p=>Object.values(p).flat();

test('captured loops interpolate continuously across the seam and landing holds its final pose',()=>{
  const player=createActionForgePlayer();
  for(const name of ['idle','walk','air','dance']){
    const before=pose(),after=pose(),middle=pose();
    player.apply(before,name,1-1e-5);player.apply(after,name,1e-5);player.apply(middle,name,.3);
    expect(Math.max(...flatten(before).map((v,i)=>Math.abs(v-flatten(after)[i]))),name).toBeLessThan(.002);
    expect(Math.max(...flatten(middle).map((v,i)=>Math.abs(v-flatten(after)[i]))),name).toBeGreaterThan(.01);
  }
  const end=pose(),later=pose();player.apply(end,'land',1);player.apply(later,'land',2);
  expect(later).toEqual(end);
});

test('interrupting a captured jump with walking and idle restores grounded neutral legs',()=>{
  const model=createZudModel({appearance:false}),animator=createZudAnimator(model);
  for(let f=0;f<45;f++)animator.update({jumping:true,time:f/60,dt:1/60});
  expect(Math.max(...model.rig.knees.map(j=>j.rotation.x))).toBeGreaterThan(.4);
  for(let f=0;f<60;f++)animator.update({gait:{weight:1,phase:f/60*Math.PI*2},time:f/60});
  expect(model.rig.floorHeight(model.root)).toBeCloseTo(0,5);
  for(let f=0;f<120;f++)animator.update({time:2});
  for(const joint of model.rig.knees)expect(joint.rotation.x).toBeLessThan(.001);
  expect(model.root.position.x).toBe(0);expect(model.root.position.z).toBe(0);
  model.dispose();
});

test('reduced motion freezes captured clips even as their clocks advance',()=>{
  const model=createZudModel({appearance:false}),animator=createZudAnimator(model);
  for(const state of ['idle','walk','dance','jump','disco']){
    animator.reset();
    const sample=time=>{
      for(let f=0;f<120;f++)animator.update({state,time,elapsed:time,musicTime:time,musicPlaying:true,motion:0,gait:{weight:1,phase:time}});
      return [model.root.position.y,...[...model.arms,...model.feet,...model.rig.elbows,...model.rig.knees].flatMap(j=>j.rotation.toArray().slice(0,3))];
    };
    const a=sample(.2),b=sample(.7);
    a.forEach((v,i)=>expect(v,`${state} axis ${i}`).toBeCloseTo(b[i],7));
  }
  model.dispose();
});

test('dance preserves Dance Loop shoulder and torso tracks from the original GLB',async()=>{
  const {readFile}=await import('node:fs/promises');
  const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
  const {Euler,Quaternion}=await import('three');
  const bytes=await readFile(new URL('../public/animations/actionforge/zud-clips.glb',import.meta.url));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const clip=gltf.animations.find(clip=>clip.name==='dance_loop_fit');
  expect(clip).toBeTruthy();
  const player=createActionForgePlayer();
  for(const time of [0,.2,.5,.8]){
    const p=pose();player.apply(p,'dance',time/clip.duration);
    for(const [bone,axes] of [['RightArm',[p.armX[0],p.armY[0],p.armZ[0]]],['LeftArm',[p.armX[1],p.armY[1],p.armZ[1]]],['Hips',[p.rx,p.turn,p.rz]]]){
      const track=clip.tracks.find(t=>t.name===`${bone}.quaternion`);
      const rotation=new Euler().setFromQuaternion(new Quaternion().fromArray(track.createInterpolant().evaluate(time)));
      axes.forEach((angle,i)=>expect(angle,`${bone} at ${time}`).toBeCloseTo(rotation.toArray()[i],4));
    }
  }
});

test('dance and disco share the original loop speed and keep a sole supported',()=>{
  const models=[createZudModel({appearance:false}),createZudModel({appearance:false})];
  const animators=models.map(createZudAnimator);
  const snapshot=model=>[model.root.position.y,...model.root.rotation.toArray().slice(0,3),...[...model.arms,...model.feet,...model.rig.elbows,...model.rig.knees].flatMap(j=>j.rotation.toArray().slice(0,3))];
  for(const elapsed of [.2,.5,.8]){
    models.forEach((model,i)=>{
      animators[i].reset();
      for(let f=0;f<90;f++)animators[i].update({state:i?'disco':'dance',elapsed,musicTime:elapsed,musicPlaying:true,time:elapsed+4*i});
      expect(model.rig.floorHeight(model.root)).toBeCloseTo(0,5);
    });
    snapshot(models[0]).forEach((v,i)=>expect(v).toBeCloseTo(snapshot(models[1])[i],6));
  }
  models.forEach(model=>model.dispose());
});
