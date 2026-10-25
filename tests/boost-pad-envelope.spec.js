import {test,expect} from '@playwright/test';
import {createPadEnvelope,PAD_TRANSITION,GOLDEN_RATIO} from '../src/boost-pad-envelope.js';
import {createBoostPadSimulation} from '../src/boost-pad-simulation.js';

test('pad transitions smoothly, stops exactly and keeps blue during cooldown',()=>{
 const e=createPadEnvelope(),p={remaining:0,flash:0},settings={field:true,distortion:true,distortionStrength:.6};
 let v=e.update(p,PAD_TRANSITION/2,settings);expect(v.level).toBeCloseTo(.5);
 v=e.update(p,PAD_TRANSITION/2,settings);expect(v.level).toBe(1);
 p.remaining=1;p.flash=.65;v=e.update(p,.01,settings);expect(v.blue).toBeGreaterThan(0);expect(v.blue).toBeLessThan(1);
 v=e.update(p,PAD_TRANSITION,settings);expect(v.blue).toBe(1);
 p.flash=0;v=e.update(p,.01,settings);expect(v.level).toBeGreaterThan(.9);
 v=e.update(p,PAD_TRANSITION*GOLDEN_RATIO,settings);expect(v.level).toBe(0);expect(v.blue).toBe(1);
 p.remaining=0;v=e.update(p,.01,settings);expect(v.level).toBeGreaterThan(0);expect(v.level).toBeLessThan(.1);
});

test('envelope is stable across frame rates and pause freezes it',()=>{
 const run=fps=>{const e=createPadEnvelope();let v;for(let i=0;i<fps;i++)v=e.update({remaining:0,flash:0},.2/fps,{field:true});return v;};
 expect(run(30).level).toBeCloseTo(run(144).level,10);
 const e=createPadEnvelope(),p={remaining:0,flash:0};const v=e.update(p,.1,{field:true});
 expect(e.update(p,0,{field:true})).toEqual(v);
});

test('consumed pad is visually off within a quarter second while cooldown stays locked',()=>{
 const sim=createBoostPadSimulation([{x:0,y:0,z:0,nx:0,nz:1,halfWidth:2,halfLength:3}]);
 const p=sim.entries[0],e=createPadEnvelope(),state={x:50,y:0,z:50,speed:0};
 e.update(p,1,{field:true});sim.activate(p,state);
 let visual;
 for(let i=0;i<15;i++){sim.step(1/60,state,state);visual=e.update(p,1/60,{field:true});}
 expect(visual.level).toBe(0);expect(p.remaining).toBeGreaterThan(6.7);
});
