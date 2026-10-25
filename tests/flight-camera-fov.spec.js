import {test,expect} from '@playwright/test';
import {smoothCameraFov} from '../src/flight-camera-fov.js';
import {speedCameraProfile} from '../src/flight-atmosphere.js';

test('boost adds a visible lens kick at the same speed without changing the cruise lens',()=>{
  for(const speed of [0,30,72,100]){
    const cruise=speedCameraProfile({speed}),boost=speedCameraProfile({speed,boosting:true});
    expect(boost.fov-cruise.fov).toBeCloseTo(14);
    expect(cruise.fov).toBeLessThanOrEqual(74);expect(boost.fov).toBeLessThanOrEqual(88);
  }
});

test('lens opens quickly, releases gently and behaves the same at 30/60/120 fps',()=>{
  const sample=(fps,from,to,seconds)=>{let fov=from;for(let i=0;i<fps*seconds;i++)fov=smoothCameraFov(fov,to,1/fps);return fov;};
  for(const fps of [30,60,120]){
    expect(sample(fps,74,88,.2)).toBeGreaterThan(85);
    expect(sample(fps,88,74,.2)).toBeGreaterThan(80);
    expect(sample(fps,74,88,1)).toBeCloseTo(sample(60,74,88,1),8);
    expect(sample(fps,88,74,2)).toBeCloseTo(74,1);
  }
  expect(smoothCameraFov(88,62,1/60,true)).toBe(62);
  expect(smoothCameraFov(74,88,0)).toBe(74);
});
