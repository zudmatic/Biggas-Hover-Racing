import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {createCircuitSky,createSpeedAtmosphere,speedCameraProfile} from '../src/flight-atmosphere.js';
import {launchFromLobby,withFlightOptions} from './helpers/flight.js';

test('speed camera makes boost distinct while preserving accessible and alternate cameras',()=>{
  const stopped=speedCameraProfile({speed:0}),fast=speedCameraProfile({speed:72,boosting:true,yawRate:3});
  expect(stopped.fov).toBe(62);expect(fast.fov).toBe(88);expect(fast.height).toBeLessThan(stopped.height);expect(fast.distance).toBeLessThan(stopped.distance);expect(fast.anticipation).toBeLessThanOrEqual(.22);
  expect(speedCameraProfile({speed:1000,boosting:true}).fov).toBe(88);
  expect(speedCameraProfile({speed:72,boosting:true,yawRate:3},{reducedMotion:true})).toEqual({...stopped});
  expect(speedCameraProfile({speed:72},{cameraMode:1}).distance).toBe(24);expect(speedCameraProfile({speed:72},{cameraMode:2}).distance).toBe(-1.7);
});

test('both skies animate bounded cloud batches, adapt to night, freeze reduced motion, and dispose',()=>{
  for(const map of ['ruins','nexus']){
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),sky=createCircuitSky(scene,{map,mobile:true});
    sky.update(camera,0);expect(sky.cloudCount).toBe(18);expect(sky.clouds.count).toBe(126);
    const initial=Array.from(sky.clouds.instanceMatrix.array),day=Array.from(sky.dome.geometry.attributes.color.array);
    sky.update(camera,30,{dt:1});expect(Array.from(sky.clouds.instanceMatrix.array)).not.toEqual(initial);
    sky.update(camera,300,{reducedMotion:true,night:true});expect(Array.from(sky.clouds.instanceMatrix.array)).toEqual(initial);expect(sky.stars.material.opacity).toBe(.85);expect(Array.from(sky.dome.geometry.attributes.color.array)).not.toEqual(day);
    camera.position.set(10,20,30);sky.update(camera,400,{reducedMotion:true,night:true});expect(sky.dome.position.equals(camera.position)).toBe(true);expect(Array.from(sky.clouds.instanceMatrix.array)).toEqual(initial);
    sky.dispose();expect(scene.children).toHaveLength(0);
  }
});

test('speed streaks keep the center clear and disappear on pause or reduced motion',()=>{
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(78,1.5),speed=createSpeedAtmosphere(scene),state={speed:72,boosting:true};
  speed.update(camera,{speed:0},0,{dt:1});expect(speed.lines.visible).toBe(false);
  speed.update(camera,state,1,{dt:1});expect(speed.lines.visible).toBe(true);expect(speed.intensity).toBeGreaterThan(.99);
  const vertices=speed.lines.geometry.attributes.position,h=Math.tan(78/2*Math.PI/180)*8;
  for(let i=0;i<vertices.count;i++)expect(Math.hypot(vertices.getX(i)/(h*1.5),vertices.getY(i)/h)).toBeGreaterThanOrEqual(.639);
  speed.update(camera,state,2,{phase:'paused',dt:1});expect(speed.lines.visible).toBe(false);expect(speed.intensity).toBe(0);
  speed.update(camera,state,3,{reducedMotion:true,dt:1});expect(speed.lines.visible).toBe(false);speed.dispose();expect(scene.children).toHaveLength(0);
});

for(const map of ['ruins','nexus'])test(`${map}: clouds and speed effects work through the real menu and track`,async({page})=>{
  test.setTimeout(120000);await page.setViewportSize({width:960,height:640});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/simulator.html');await launchFromLobby(page,{map});const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});await expect(app).toHaveAttribute('data-cloud-count','30');
  await page.screenshot({path:`.context/speed-sky-${map}.png`});
  await page.keyboard.down('KeyW');await page.keyboard.down('ShiftLeft');
  await expect.poll(async()=>Number(await app.getAttribute('data-fov')),{timeout:20000}).toBeGreaterThan(76);
  await expect.poll(async()=>Number(await app.getAttribute('data-speed-effect')),{timeout:15000}).toBeGreaterThan(.1);
  await page.screenshot({path:`.context/speed-rush-${map}.png`});await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');
  await page.keyboard.press('Escape');await expect(app).toHaveAttribute('data-speed-effect','0.000');
  await withFlightOptions(page,()=>page.getByRole('button',{name:'Iluminación nocturna'}).click());await expect(app).toHaveAttribute('data-lighting','night');
  await page.emulateMedia({reducedMotion:'reduce'});await expect.poll(async()=>Number(await app.getAttribute('data-fov'))).toBe(65);await expect(app).toHaveAttribute('data-speed-effect','0.000');
  await page.getByRole('button',{name:'Continuar',exact:false}).first().click();await page.screenshot({path:`.context/speed-night-${map}.png`});
  await withFlightOptions(page,()=>page.getByRole('button',{name:'Cómic',exact:true}).click());await expect(app).toHaveAttribute('data-comic','false');await page.screenshot({path:`.context/speed-normal-${map}.png`});expect(errors).toEqual([]);
});
