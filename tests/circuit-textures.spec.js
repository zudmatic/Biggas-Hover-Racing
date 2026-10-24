import {launchFromLobby,withFlightOptions} from './helpers/flight.js';
import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createCircuitTextures,circuitSurface} from '../src/circuit-textures.js';
import {createCircuitDetails} from '../src/circuit-details.js';
import {createCircuitLandscape,createHoverState} from '../src/circuit-physics.js';
import {createCircuitLighting} from '../src/circuit-lighting.js';

test('every original scenery mesh has a matching texture and finite UVs; animated additions keep their topology',async()=>{
  const bytes=fs.readFileSync('public/models/circuit034/034_ruins_circuit_v01.glb'),asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const textures=createCircuitTextures(),root=asset.scene;let count=0;
  textures.applyRoot(root);root.traverse(mesh=>{if(!mesh.isMesh)return;count++;expect(mesh.material.map).toBeTruthy();expect(mesh.material.userData.circuitSurface).toBe(circuitSurface(mesh.material.name));expect(mesh.geometry.attributes.uv.count).toBe(mesh.geometry.attributes.position.count);expect(mesh.geometry.attributes.uv.array.every(Number.isFinite)).toBe(true);});expect(count).toBeGreaterThan(500);
  const map=createCircuitLandscape(JSON.parse(fs.readFileSync('public/models/circuit034/route_gltf.json')),JSON.parse(fs.readFileSync('public/models/circuit034/gameplay.json'))),details=createCircuitDetails(root,map,{mobile:true});
  const ocean=root.getObjectByName('Océano'),flag=root.getObjectByName('Bandera'),positions=ocean.geometry.attributes.position,countBefore=positions.count;
  textures.applyRoot(root);expect(ocean.geometry.attributes.position).toBe(positions);expect(positions.count).toBe(countBefore);expect(ocean.material.userData.circuitSurface).toBe('water');expect(flag.material.userData.circuitSurface).toBe('fabric');
  details.update(1,false,{state:createHoverState(map),phase:'menu'});expect(positions.array.every(Number.isFinite)).toBe(true);expect(textures.count).toBe(12);
  const asphalt=Array.from(root.children).find(m=>m.material?.name?.startsWith('Road'))?.material;
  if(asphalt)expect(asphalt.bumpMap).toBeTruthy();
  const maps=new Set();root.traverse(m=>{if(m.material?.map)maps.add(m.material.map);});let disposed=0;maps.forEach(t=>t.addEventListener('dispose',()=>disposed++));textures.dispose();expect(disposed).toBe(maps.size);
});

test('headlights are off on creation and at night until explicitly switched on',()=>{
  const scene=new THREE.Scene();scene.background=new THREE.Color();scene.fog=new THREE.Fog(0,1,100);const lights=createCircuitLighting(scene),state={x:0,y:1,z:0,yaw:0,pitch:0};
  expect(lights.headlightsEnabled).toBe(false);expect(lights.headlights.every(l=>l.intensity===0)).toBe(true);
  lights.setNight(true);lights.update(state,0,{reducedMotion:true});expect(lights.headlights.every(l=>l.intensity===0)).toBe(true);
  lights.setHeadlights(true);lights.update(state,0,{reducedMotion:true});expect(lights.headlights.every(l=>l.intensity>0)).toBe(true);
  lights.setHeadlights(false);expect(lights.headlights.every(l=>l.intensity===0)).toBe(true);lights.dispose();
});

test('F toggles actual beams without key-repeat, both shaders show textured scenery',async({page})=>{
  test.setTimeout(120000);await page.setViewportSize({width:960,height:640});await page.emulateMedia({reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/simulator.html');await launchFromLobby(page);const app=page.locator('.flight-app'),button=page.getByRole('button',{name:'Faros',exact:true});await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});await expect(app).toHaveAttribute('data-headlights','false');await expect(button).toHaveCount(0);await expect(app).toHaveAttribute('data-texture-families','12');
  await withFlightOptions(page,()=>page.getByRole('button',{name:'Iluminación nocturna'}).click());await expect(app).toHaveAttribute('data-headlights','false');const dark=await page.locator('.flight-canvas').screenshot();
  await page.keyboard.press('KeyF');await expect(app).toHaveAttribute('data-headlights','true');await expect(app).toHaveAttribute('data-headlights','true');expect((await page.locator('.flight-canvas').screenshot()).equals(dark)).toBe(false);
  await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyF',repeat:true,bubbles:true})));await expect(app).toHaveAttribute('data-headlights','true');
  await page.keyboard.press('KeyF');await expect(app).toHaveAttribute('data-headlights','false');await withFlightOptions(page,()=>page.getByRole('button',{name:'Cómic',exact:true}).click());await expect(app).toHaveAttribute('data-comic','false');await page.keyboard.press('KeyF');await expect(app).toHaveAttribute('data-headlights','true');expect(errors).toEqual([]);
});

test('pause options remain reachable on a narrow mobile screen',async({browser})=>{
  test.setTimeout(90000);const context=await browser.newContext({viewport:{width:320,height:740},isMobile:true,hasTouch:true}),page=await context.newPage();await page.goto(`http://127.0.0.1:${process.env.TEST_PORT??5173}/simulator.html`);await launchFromLobby(page);const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});await expect(page.getByRole('button',{name:'Faros',exact:true})).toHaveCount(0);await withFlightOptions(page,async()=>{await expect(page.getByRole('link',{name:'Ir al hangar'})).toBeVisible();await expect(page.getByRole('button',{name:'Cambiar cámara'})).toBeVisible();});
  await expect(page.locator('.flight-header')).toHaveCount(0);await context.close();
});
