import {test,expect} from '@playwright/test';

test('Klipp preserves framing after collision and resets after recovery',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {PerspectiveCamera,Vector3}=await import('/node_modules/three/build/three.module.js');
    const {createFlightCameraKlipp}=await import('/src/flight-camera-klipp.js');
    const camera=new PerspectiveCamera(62,1.6,.15,7000),rig=createFlightCameraKlipp(camera);
    const state={x:0,y:1,z:0,yaw:0};
    let collide=true;
    const world={surfaceHeight:()=>0,clipCamera:(anchor,point)=>{if(collide){point.z=state.z-3;point.y=state.y+6;}}};
    const samples=[];
    for(let i=0;i<120;i++){
      state.x=i*.1;state.yaw=i*.045;
      rig.update(state,1/60,{world,profile:{fov:62},snap:i===0});
      const aim=new Vector3(0,2,0).applyAxisAngle(new Vector3(0,1,0),state.yaw).add(new Vector3(state.x,state.y,state.z));
      samples.push(aim.project(camera).toArray());
    }
    collide=false;state.x=100;state.z=200;state.yaw=0;
    rig.update(state,1/60,{world,profile:{fov:62},snap:true});
    const reset=camera.position.toArray();
    rig.update(state,1/60,{world,profile:{fov:78}});const boostFov=camera.fov;
    const enabled=rig.enabled;rig.dispose();return {samples,reset,boostFov,enabled};
  });
  expect(result.enabled).toBe(true);
  for(const p of result.samples){expect(p[0]).toBeCloseTo(0,5);expect(p[1]).toBeCloseTo(-.15,5);}
  expect(result.reset[0]).toBeCloseTo(100,5);expect(result.reset[1]).toBeCloseTo(5,5);expect(result.reset[2]).toBeCloseTo(191.5,5);
  expect(result.boostFov).toBeGreaterThan(62);expect(result.boostFov).toBeLessThan(64);
});

test('chase camera stays behind through repeated turns without throttle input',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {PerspectiveCamera,Vector3}=await import('/node_modules/three/build/three.module.js');
  const {createFlightCameraKlipp}=await import('/src/flight-camera-klipp.js');
  const camera=new PerspectiveCamera(62,1.6,.15,7000),rig=createFlightCameraKlipp(camera);
  const world={surfaceHeight:()=>0};let worst=1,maxReleaseStep=0;
  const state={x:0,y:1,z:0,yaw:0};let last;
  for(let i=0;i<900;i++){
   state.yaw=i*.035;state.x=Math.cos(state.yaw)*12;state.z=Math.sin(state.yaw)*12;
   rig.update(state,1/60,{world,profile:{fov:62},snap:i===0});
   const offset=new Vector3(camera.position.x-state.x,0,camera.position.z-state.z).normalize();
   const rear=new Vector3(-Math.sin(state.yaw),0,-Math.cos(state.yaw));
   if(i>60&&i<780)worst=Math.min(worst,offset.dot(rear));
   if(i>=780&&last)maxReleaseStep=Math.max(maxReleaseStep,camera.position.distanceTo(last));
   last=camera.position.clone();
  }
  rig.dispose();return {worst,maxReleaseStep};
 });
 expect(result.worst).toBeGreaterThan(.98);
 expect(result.maxReleaseStep).toBeLessThan(2);
});

test('mouse orbit holds while stopped and returns behind while driving',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {PerspectiveCamera}=await import('/node_modules/three/build/three.module.js');
  const {createFlightCameraKlipp}=await import('/src/flight-camera-klipp.js');
  const element=document.createElement('canvas');element.setPointerCapture=()=>{};
  const camera=new PerspectiveCamera(62,1.6,.15,7000),rig=createFlightCameraKlipp(camera,{element});
  const state={x:0,y:1,z:0,yaw:0,speed:0},options={world:{surfaceHeight:()=>0},profile:{fov:62}};
  rig.update(state,1/60,{...options,snap:true});
  for(const [type,x] of [['pointerdown',0],['pointermove',250],['pointerup',250]])element.dispatchEvent(new PointerEvent(type,{pointerId:1,pointerType:'mouse',clientX:x,clientY:0}));
  for(let i=0;i<120;i++)rig.update(state,1/60,options);
  const stopped=camera.position.x;
  state.speed=20;for(let i=0;i<180;i++)rig.update(state,1/60,options);
  const moving=camera.position.toArray();rig.dispose();return {stopped,moving};
 });
 expect(Math.abs(result.stopped)).toBeGreaterThan(5);
 expect(Math.abs(result.moving[0])).toBeLessThan(.01);
 expect(result.moving[2]).toBeCloseTo(-8.5,2);
});
