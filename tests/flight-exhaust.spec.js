import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {createFlightExhaust} from '../src/flight-exhaust.js';
import {launchFromLobby} from './helpers/flight.js';

test('fire stays anchored, grows with boost, freezes with time and disposes',()=>{
  const root=new THREE.Group(),fx=createFlightExhaust(root,[[1,.6,-2,.3]]);
  fx.update(0,20,false,false,{});const normal=fx.jets[0].group.scale.z;
  for(let i=1;i<=60;i++)fx.update(i/60,20,true,false,{});
  expect(fx.jets[0].group.scale.z).toBeGreaterThan(normal*2);
  expect(fx.jets[0].group.position.toArray()).toEqual([1,.6,-2]);
  const length=fx.jets[0].group.scale.z;fx.update(1,20,true,false,{});expect(fx.jets[0].group.scale.z).toBe(length);
  fx.configure({fire:'#ab1234'});expect(fx.material.uniforms.fire.value.getHexString()).toBe('ab1234');
  fx.update(2,20,false,true,{});expect(fx.material.uniforms.time.value).toBe(0);expect(fx.material.uniforms.variation.value).toBe(0);
  fx.dispose();expect(root.children).toHaveLength(0);
});

test('fire renders with comic, turbo and live controls',async({page})=>{
  test.setTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/simulator.html');await launchFromLobby(page);const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});
  await page.getByText('Propulsor · A · Chorro',{exact:true}).click();
  const slider=page.getByRole('slider',{name:'Longitud',exact:true});await slider.focus();await page.keyboard.press('ArrowRight');await expect(slider).toHaveAttribute('aria-valuenow','1.05');
  await page.locator('.flight-canvas').focus();await page.keyboard.down('w');await page.keyboard.down('Shift');await page.waitForTimeout(1600);await page.keyboard.up('w');
  await page.screenshot({path:'.context/propulsor-fire-live.png'});await page.keyboard.up('Shift');
  await page.getByRole('button',{name:'Cómic',exact:true}).click();await expect(app).toHaveAttribute('data-comic','false');await page.waitForTimeout(200);
  await page.screenshot({path:'.context/propulsor-heat-normal.png'});
  const heat=page.getByRole('slider',{name:'Distorsión calor',exact:true});await heat.focus();await page.keyboard.press('Home');await expect(heat).toHaveAttribute('aria-valuenow','0');
  expect(errors).toEqual([]);
});
