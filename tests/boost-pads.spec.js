import {test,expect} from '@playwright/test';
import {createBoostPadSimulation,crossesBoostPad} from '../src/boost-pad-simulation.js';
import {advanceHover,createHoverState} from '../src/circuit-physics.js';
const pad={x:0,y:0,z:0,nx:0,nz:1,halfWidth:2,halfLength:3};
const pos=(z,x=0,y=.65)=>({x,y,z,speed:50});
test('pad catches swept crossings, rejects altitude, lateral misses and teleports',()=>{
 expect(crossesBoostPad(pad,pos(-8),pos(8))).toBe(true);
 expect(crossesBoostPad(pad,pos(-8,5),pos(8,5))).toBe(false);
 expect(crossesBoostPad(pad,pos(-8,0,5),pos(8,0,5))).toBe(false);
 expect(crossesBoostPad(pad,pos(-80),pos(8))).toBe(false);
});
test('pad turns off for seven seconds and requires a new crossing, not camping',()=>{
 const sim=createBoostPadSimulation([pad]),state=pos(0);sim.step(1/60,state,pos(-5));expect(state.padBoostRemaining).toBe(2);expect(sim.entries[0].activations).toBe(1);
 for(let i=0;i<450;i++)sim.step(1/60,state,state);
 expect(sim.entries[0].remaining).toBe(0);expect(sim.entries[0].activations).toBe(1);
 sim.step(1/60,pos(5),state);sim.step(1/60,state,pos(5));expect(sim.entries[0].activations).toBe(2);
 sim.reset();expect(sim.entries[0].activations).toBe(0);expect(sim.entries[0].remaining).toBe(0);
});
test('pad boost works with an empty tank, does not stack speed, and brake wins',()=>{
 const landscape={spawn:{x:0,y:.65,z:0},yaw:0,height:()=>0,physicalBoundaries:true,roadAt:()=>({y:0,nx:0,nz:1,grade:0,offset:0,width:15})};
 const s=createHoverState(landscape);Object.assign(s,{energy:0,padBoostRemaining:2,throttle:52,speed:52,vz:52});
 advanceHover(s,{},1/60,landscape);expect(s.boosting).toBe(true);expect(s.speed).toBeGreaterThan(52);expect(s.energy).toBeGreaterThan(0);
 advanceHover(s,{brake:true,boost:true},1/60,landscape);expect(s.boosting).toBe(false);
 for(let i=0;i<150;i++)advanceHover(s,{},1/60,landscape);
 expect(s.padBoostRemaining).toBe(0);expect(s.boosting).toBe(false);expect(s.speed).toBeLessThanOrEqual(72);
});

test('one charge can only be claimed by one car, including during its flash',()=>{
 const sim=createBoostPadSimulation([pad]),first=pos(0),second=pos(0);let callbacks=0;
 expect(sim.activate(sim.entries[0],first,()=>{
   callbacks++;
   expect(sim.activate(sim.entries[0],second)).toBe(false);
 })).toBe(true);
 expect(sim.entries[0].flash).toBeGreaterThan(0);
 expect(sim.activate(sim.entries[0],second)).toBe(false);
 expect(first.padBoostRemaining).toBe(2);expect(second.padBoostRemaining).toBeUndefined();
 expect(sim.entries[0].remaining).toBe(7);expect(sim.entries[0].activations).toBe(1);expect(callbacks).toBe(1);
});
test('Mario pads load and activate while driving',async({page})=>{
 test.setTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?selection=map&map=mario-raceway&vehicle=037&renderer=webgl2');
 await page.getByRole('button',{name:'Volar',exact:true}).click();
 const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:90000});
 await expect.poll(async()=>JSON.parse(await app.getAttribute('data-boost-pads')||'[]').length).toBe(3);
 await page.locator('canvas.flight-canvas').focus();await page.keyboard.down('KeyW');
 await expect.poll(async()=>JSON.parse(await app.getAttribute('data-boost-pads'))[0].activations,{timeout:15000}).toBe(1);
 await page.keyboard.up('KeyW');await expect.poll(async()=>Number(await app.getAttribute('data-pad-boost'))).toBeGreaterThan(0);
 await expect(app).toHaveAttribute('data-boost-palette','Verde · placa');
 await page.screenshot({path:'test-results/boost-pad-game.png'});
 expect(errors).toEqual([]);
});

test('lab pad can activate, respects cooldown and can be rearmed',async({page})=>{
 test.setTimeout(180000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/playground?map=mario-raceway&effect=pad&backend=webgl2');
 await expect(page.locator('body')).toHaveAttribute('data-ready','true',{timeout:120000});
 const read=async()=>JSON.parse(await page.locator('body').getAttribute('data-boost-pad'));
 await page.evaluate(()=>window.playground.activatePad());
 await expect.poll(async()=>(await read()).activations).toBe(1);
 expect((await read()).remaining).toBeGreaterThan(0);
 await page.evaluate(()=>window.playground.activatePad());
 expect((await read()).activations).toBe(1);
 await page.evaluate(()=>window.playground.rearmPad());
 await expect.poll(async()=>(await read()).remaining).toBe(0);
 await page.screenshot({path:'test-results/boost-pad-lab.png'});
 expect(errors).toEqual([]);
});

test('standalone VFX laboratory exposes pad controls',async({page})=>{
 test.skip(!process.env.TEST_VFX_LAB,'Requires the standalone lab on port 43181');
 test.setTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:43181/?webgl');
 await page.getByRole('button',{name:'Ver placa de cerca',exact:true}).click({timeout:60000});
 await page.getByRole('button',{name:'Probar activación',exact:true}).click();
 await expect.poll(async()=>JSON.parse(await page.locator('body').getAttribute('data-boost-pad')||'{}').activations).toBe(1);
 await page.screenshot({path:'test-results/boost-pad-studio.png'});
 await expect(page.locator('#status')).not.toContainText('Error');expect(errors).toEqual([]);
});
