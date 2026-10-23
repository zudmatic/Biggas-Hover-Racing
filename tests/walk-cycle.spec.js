import {test,expect} from '@playwright/test';
import {WalkCycle} from '../src/walk-cycle.js';

test('Steps alternate and stay tied to distance at different frame rates',()=> {
  const first=new WalkCycle(),second=new WalkCycle();
  for(let i=0;i<60;i++)first.update(.37/60,1/60);
  for(let i=0;i<30;i++)second.update(.37/30,1/30);
  expect(first.sample().phase).toBeCloseTo(second.sample().phase,8);
  const cycle=new WalkCycle();let leftLifted=false,rightLifted=false;
  for(let i=0;i<120;i++) {
    const gait=cycle.update(.74/120,1/60);
    expect(gait.feet[0].lift*gait.feet[1].lift).toBeCloseTo(0,8);
    expect(gait.feet[0].stride).toBeCloseTo(-gait.feet[1].stride,8);
    leftLifted ||=gait.feet[0].lift>.2;rightLifted ||=gait.feet[1].lift>.2;
  }
  expect(leftLifted&&rightLifted).toBe(true);
});

test('Blocked walking settles; jumping and reduced motion suspend the walk cycle',()=> {
  const cycle=new WalkCycle();for(let i=0;i<30;i++)cycle.update(.02,1/60);
  expect(cycle.sample().weight).toBeGreaterThan(.9);
  const phase=cycle.sample().phase;
  for(let i=0;i<60;i++)cycle.update(0,1/60);
  expect(cycle.sample().phase).toBe(phase);expect(cycle.sample().weight).toBe(0);
  cycle.update(.1,.05);expect(cycle.update(.1,.05,false).weight).toBe(0);
});
