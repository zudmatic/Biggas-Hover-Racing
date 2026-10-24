import {launchFromLobby,withFlightOptions} from './helpers/flight.js';
import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createRoadSurface} from '../src/circuit-world.js';
import {createCircuitLandscape,createHoverState,advanceHover,crossesCircuitGate,recoverHover,HOVER_HEIGHT,CIRCUIT_BOOST} from '../src/circuit-physics.js';
const route=JSON.parse(fs.readFileSync('public/models/circuit034/route_gltf.json'));
const gameplay=JSON.parse(fs.readFileSync('public/models/circuit034/gameplay.json'));
const circuit=()=>createCircuitLandscape(route,gameplay);
const wrap=n=>Math.atan2(Math.sin(n),Math.cos(n));
async function collider(){const bytes=fs.readFileSync('public/models/circuit034/034_ruins_circuit_COLLIDERS.glb');const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');return createRoadSurface(gltf.scene.getObjectByName('COL_TRACK_RACE_SURFACE_12m'));}

test('the original track closes and every driving lane is supported by its collider',async()=>{
  const track=circuit(),surface=await collider();expect(track.length).toBeCloseTo(795.43,2);expect(track.gates).toHaveLength(17);expect(track.gates[16]).toEqual(track.gates[0]);
  for(const sample of track.samples){
    const [x,y,z]=sample.position,[nx,,nz]=sample.forward,l=Math.hypot(nx,nz);
    for(const offset of [-4.3,-2,0,2,4.3]){
      const h=surface(x-nz/l*offset,z+nx/l*offset);expect(h).not.toBeNull();expect(Math.abs(h-y)).toBeLessThan(.12);
    }
  }
  expect(track.atDistance(track.length).x).toBeCloseTo(track.atDistance(0).x,6);
});

test('a complete driven lap follows the real ramps without grounding or touching parapets',async()=>{
  const track=circuit(),surface=await collider(),state=createHoverState(track);let gate=0,wallHits=0,min=Infinity,max=-Infinity;
  for(let i=0;i<120*60;i++){
    const road=track.roadAt(state.x,state.z),ahead=track.atDistance(road.distance+Math.max(4,state.speed*.3)),a=track.atDistance(road.distance+3),b=track.atDistance(road.distance+13);
    const curvature=Math.abs(wrap(Math.atan2(b.nx,b.nz)-Math.atan2(a.nx,a.nz)))/10,target=Math.min(45,Math.sqrt(16/Math.max(curvature,.002)));
    const error=wrap(Math.atan2(ahead.x-state.x,ahead.z-state.z)-state.yaw);
    const previous=advanceHover(state,{turn:Math.max(-1,Math.min(1,-error*3.5/(2.65-.9*state.speed/72))),throttle:state.throttle<target-.5?1:state.throttle>target+.5?-1:0,brake:state.speed>target+7},1/60,track,surface);
    wallHits+=Number(state.wallHit);const h=surface(state.x,state.z);expect(h).not.toBeNull();min=Math.min(min,state.y-h);max=Math.max(max,state.y-h);
    if(crossesCircuitGate(previous,state,track.gates[gate])){gate++;if(gate===17)break;}
  }
  expect(gate).toBe(17);expect(wallHits).toBe(0);expect(min).toBeGreaterThan(.6);expect(max).toBeLessThan(.7);
});

test('hover ignores climb input, keeps the hull inside the road and recovers behind the next checkpoint',()=>{
  const track=circuit(),state=createHoverState(track);
  for(let i=0;i<300;i++)advanceHover(state,{throttle:1,climb:1,boost:true,turn:1},1/60,track);
  const road=track.roadAt(state.x,state.z);expect(Math.abs(road.offset)).toBeLessThan(4.4);expect(state.y-road.y).toBeCloseTo(HOVER_HEIGHT,1);expect(state.speed).toBeLessThan(CIRCUIT_BOOST);
  const reset=recoverHover(track,4),resetRoad=track.roadAt(reset.x,reset.z);expect(resetRoad.distance).toBeCloseTo(track.gates[3].distance+5,1);expect(resetRoad.distance).toBeLessThan(track.gates[4].distance);
  const gate=track.gates[0],before={x:gate.x-gate.nx*20,y:gate.y,z:gate.z-gate.nz*20},after={x:gate.x+gate.nx*20,y:gate.y,z:gate.z+gate.nz*20};
  expect(crossesCircuitGate(before,after,gate)).toBe(true);expect(crossesCircuitGate(after,before,gate)).toBe(false);expect(crossesCircuitGate({...before,y:gate.y+9},{...after,y:gate.y+9},gate)).toBe(false);
});

test('Ruinas remains available, low hover responds to steering and preserves pause and comic controls',async({page})=>{
  test.setTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/simulator.html');await launchFromLobby(page);await expect(page.locator('.flight-app')).toHaveAttribute('data-ready','true',{timeout:60000});
  await expect(page.getByText(/cuenca/i)).toHaveCount(0);const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});await expect(app).toHaveAttribute('data-map','ruins');await expect(app).toHaveAttribute('data-comic','true');await expect(page.getByRole('button',{name:'Nuevo mapa'})).toBeHidden();
  await page.keyboard.down('KeyW');await page.keyboard.down('ArrowUp');
  await expect.poll(async()=>Number(await app.getAttribute('data-speed')),{timeout:15000}).toBeGreaterThan(12);await page.keyboard.up('KeyW');await page.keyboard.up('ArrowUp');
  await expect.poll(async()=>Number(await app.getAttribute('data-gate')),{timeout:15000}).toBe(1);expect(Number(await app.getAttribute('data-hover'))).toBeGreaterThan(.6);expect(Number(await app.getAttribute('data-hover'))).toBeLessThan(.7);
  const yaw=Number(await app.getAttribute('data-yaw'));await page.keyboard.down('KeyA');await expect.poll(async()=>Number(await app.getAttribute('data-yaw'))).toBeGreaterThan(yaw+.1);await page.keyboard.up('KeyA');
  await page.keyboard.press('Escape');await expect(app).toHaveAttribute('data-phase','paused');await page.waitForTimeout(150);const time=await app.getAttribute('data-time');await page.waitForTimeout(250);expect(await app.getAttribute('data-time')).toBe(time);
  await withFlightOptions(page,()=>page.getByRole('button',{name:'Cómic',exact:true}).click());await expect(app).toHaveAttribute('data-comic','false');await expect(page.getByRole('link',{name:'Cuenca 033',exact:true})).toHaveCount(0);expect(errors).toEqual([]);
});

test('mobile circuit shows touch controls without overflow',async({browser})=>{
  test.setTimeout(90000);const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();
  await page.goto(`http://127.0.0.1:${process.env.TEST_PORT??5173}/simulator.html?map=ruins`);await launchFromLobby(page);const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});
  await expect(page.getByRole('link',{name:'Cuenca 033',exact:true})).toHaveCount(0);await expect(app).toHaveAttribute('data-phase','flying');expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await expect(page.getByRole('group',{name:'Joystick: girar',exact:true})).toBeVisible();const button=page.getByRole('button',{name:'Acelerar',exact:true}),box=await button.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await expect.poll(async()=>Number(await app.getAttribute('data-speed'))).toBeGreaterThan(4);await page.mouse.up();await expect(button).toHaveAttribute('aria-pressed','false');await context.close();
});

test('a missing circuit collider shows retry instead of starting unsupported hover',async({page})=>{
  test.setTimeout(60000);await page.route('**/034_ruins_circuit_COLLIDERS.glb',route=>route.abort());await page.goto('/simulator.html?map=ruins');await launchFromLobby(page);await expect(page.locator('.flight-loader')).toContainText('No se pudo cargar el simulador',{timeout:45000});await expect(page.getByRole('button',{name:'Reintentar'})).toBeVisible();
});
