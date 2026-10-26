import {test,expect} from '@playwright/test';
import {EYE_CLOSED,GAZE_LIMIT,blinkWeights,gazeTarget} from '../src/ship-eyes.js';
import {shipConfig} from '../src/ship-catalog.js';

test('lid weights follow the four-pose trajectory from the rig contract, and gaze follows the turn',()=>{
  // README_controles: t -> [Blink_025, Blink_050, Blink_075, Blink_100].
  for(const [t,weights] of [[0,[0,0,0,0]],[.125,[.5,0,0,0]],[.25,[1,0,0,0]],[.375,[.5,.5,0,0]],[.5,[0,1,0,0]],[.625,[0,.5,.5,0]],[.75,[0,0,1,0]],[.875,[0,0,.5,.5]],[1,[0,0,0,1]],[1.4,[0,0,0,1]],[-1,[0,0,0,0]]])
    blinkWeights(t).forEach((weight,i)=>expect(weight,`t=${t}`).toBeCloseTo(weights[i]));
  // A right turn (positive input) has a negative yaw rate: look right (+1).
  expect(gazeTarget({yawRate:-2})).toBe(1);expect(gazeTarget({yawRate:.7})).toBeCloseTo(-.5);expect(gazeTarget(undefined)+0).toBe(0);
  expect(GAZE_LIMIT).toBeCloseTo(3*Math.PI/180);expect(EYE_CLOSED).toBe(0);
  expect(shipConfig('039').eyes).toBeDefined();for(const id of ['033','037','038'])expect(shipConfig(id).eyes).toBeUndefined();
});

test('the Bulldog flight model drives its rig: gaze, idle blinks and the authored collision reaction',async({page})=>{
  test.setTimeout(60000);await page.goto('/');
  const r=await page.evaluate(async()=>{
    const {createFlightShip}=await import('/src/flight-ship.js');const ship=await createFlightShip('039',{exhaust:false});
    const eyes=ship.eyes,pivot=ship.root.getObjectByName('CTRL_Eye_L'),samples={live:['CTRL_Eye_L','CTRL_Eye_R','Lid_L','Lid_R','Candidate_thin_curved_tongue','Soft_tapered_tongue_groove_tone'].map(name=>ship.root.getObjectByName(name)?.parent===ship.root)};
    const state={yawRate:0,impact:0,impactSerial:0};let t=0;const closures=[];
    const run=(seconds,patch={})=>{Object.assign(state,patch);for(const end=t+seconds;t<end;t+=1/24){ship.update(t,30,false,false,state);closures.push(eyes.closure);}};
    run(.5);samples.straight=pivot.rotation.y;samples.open=eyes.closure;
    run(1,{yawRate:-2});samples.right=pivot.rotation.y;
    run(1,{yawRate:2});samples.left=pivot.rotation.y;
    closures.length=0;run(8,{yawRate:0});samples.idleBlink=Math.max(...closures);samples.idleTongue=eyes.tongue;
    run(.3,{impact:9,impactSerial:1});samples.crash=[eyes.closure,eyes.tongue,pivot.rotation.y];
    for(let i=2;i<6;i++){state.impactSerial=i;ship.update(t,30,false,false,state);t+=1/24;}samples.grinding=eyes.closure;state.impactSerial=1;
    samples.weightsValid=eyes.lidWeights.every(w=>w.filter(v=>v>0).length<=2&&w.every(v=>v>=0&&v<=1));
    run(2.2);samples.after=[eyes.closure,eyes.tongue];
    run(.1,{impact:1.6,impactSerial:2});samples.scrape=eyes.tongue;
    eyes.hold(0);samples.held=eyes.closure;eyes.hold(null);
    const others=[];for(const id of ['033','038']){const other=await createFlightShip(id,{exhaust:false});others.push(other.eyes);other.dispose();}
    ship.dispose();return {...samples,others};
  });
  expect(r.live).toEqual([true,true,true,true,true,true]);
  expect(Math.abs(r.straight)).toBeLessThan(1e-6);expect(r.open).toBe(0);
  expect(r.right).toBeCloseTo(-.0523,3);expect(r.left).toBeCloseTo(.0523,3);
  expect(r.idleBlink).toBe(1);expect(r.idleTongue).toBe(0);
  expect(r.crash[0]).toBeGreaterThan(.9);expect(r.crash[1]).toBeGreaterThan(.9);expect(Math.abs(r.crash[2])).toBeLessThan(.01);expect(r.weightsValid).toBe(true);expect(r.grinding).toBeGreaterThan(.9);
  expect(r.after).toEqual([0,0]);expect(r.scrape).toBe(0);expect(r.held).toBe(1);
  expect(r.others).toEqual([null,null]);
});
