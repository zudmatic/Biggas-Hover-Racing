import {test,expect} from '@playwright/test';
import {createFlightRenderPose} from '../src/flight-render-pose.js';

test('render pose removes repeated physics poses at 144 Hz without changing physics',()=>{
 const pose=createFlightRenderPose(),state={x:0,y:1,z:0,yaw:0,pitch:0,roll:0,speed:60};
 pose.reset(state);let accumulator=0,lastRaw=-1,lastSmooth=-1,rawStops=0,smoothStops=0;
 for(let frame=0;frame<288;frame++){
  accumulator+=1/144;
  while(accumulator>=1/60){pose.capture(state);state.x+=1;accumulator-=1/60;}
  const snapshot={...state},rendered=pose.sample(state,accumulator*60);
  expect(state).toEqual(snapshot);
  if(frame>3){if(state.x===lastRaw)rawStops++;if(Math.abs(rendered.x-lastSmooth)<1e-8)smoothStops++;}
  lastRaw=state.x;lastSmooth=rendered.x;
 }
 expect(rawStops).toBeGreaterThan(150);expect(smoothStops).toBe(0);
});

test('render pose takes shortest turn and resets on recovery',()=>{
 const pose=createFlightRenderPose(),state={x:0,y:1,z:0,yaw:Math.PI-.01,pitch:0,roll:0};pose.reset(state);
 state.yaw=-Math.PI+.01;expect(Math.abs(pose.sample(state,.5).yaw)).toBeCloseTo(Math.PI);
 state.x=500;pose.reset(state);expect(pose.sample(state,.2).x).toBe(500);
});
