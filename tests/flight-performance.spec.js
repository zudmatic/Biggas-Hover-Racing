import {test,expect} from '@playwright/test';
import {createFlightPerformance} from '../src/flight-performance.js';
import {launchFromLobby} from './helpers/flight.js';

const options={width:1920,height:1080,pixelRatio:2,storage:{getItem:()=>null,setItem:()=>{}}};
const run=(control,ms,seconds)=>{for(let elapsed=0;elapsed<seconds*1000;elapsed+=ms)control.sample(ms);};

test('automatic quality bounds the GPU pixel budget and reacts to sustained slow frames',()=>{
  const changes=[],control=createFlightPerformance({...options,onChange:settings=>changes.push(settings)});
  control.setMode('auto');changes.length=0;
  expect(control.settings.pixelRatio**2*1920*1080).toBeCloseTo(1600000,0);
  run(control,1000/60,6);expect(changes).toHaveLength(0);
  control.sample(500);run(control,1000/60,4);expect(changes).toHaveLength(0);
  run(control,1000/30,4);expect(changes.length).toBeGreaterThan(0);
  expect(control.settings.scale).toBeLessThan(1);expect(control.settings.samples).toBe(0);
  run(control,1000/20,30);expect(control.settings.scale).toBe(.5);expect(control.settings.lite).toBe(true);
  const scale=control.settings.scale;run(control,1000/75,5);expect(control.settings.scale).toBe(scale);
  run(control,1000/75,16);expect(control.settings.scale).toBeGreaterThan(scale);
});

test('manual graphics modes stay fixed, persist, and recompute for a resized viewport',()=>{
  const saved=new Map(),storage={getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)};
  const control=createFlightPerformance({...options,storage});control.setMode('high');
  expect(control.settings.samples).toBe(4);expect(control.settings.pixelRatio).toBe(1.5);
  run(control,40,20);expect(control.settings.pixelRatio).toBe(1.5);
  const restored=createFlightPerformance({...options,storage});expect(restored.mode).toBe('high');
  restored.setMode('performance');expect(restored.settings.lite).toBe(true);
  restored.resize(3840,2160,2);
  expect(restored.settings.pixelRatio**2*3840*2160).toBeCloseTo(1600000*.7**2,0);
  restored.setMode('auto');expect(restored.settings.scale).toBe(1);
});

test('first visit preserves original graphical quality, while saved preferences win',()=>{
  const control=createFlightPerformance(options);
  expect(control.mode).toBe('high');expect(control.settings.samples).toBe(4);
  expect(control.settings.glowSamples).toBe(12);expect(control.settings.lite).toBe(false);
  run(control,40,20);expect(control.settings.pixelRatio).toBe(1.5);
  const saved=createFlightPerformance({...options,storage:{getItem:()=> 'auto'}});
  expect(saved.mode).toBe('auto');
});

test('unavailable storage and focus resets do not interrupt play or lower quality',()=>{
  const storage={getItem(){throw new Error('Unavailable');},setItem(){throw new Error('Unavailable');}};
  const control=createFlightPerformance({...options,storage});control.setMode('auto');
  run(control,1000/30,2.5);control.reset();run(control,1000/60,3);
  expect(control.settings.scale).toBe(1);
  control.sample(NaN);control.sample(-10);expect(control.settings.scale).toBe(1);
});

test('graphics modes change only the 3D resolution and preserve driving, pause and reload',async({page})=>{
  test.setTimeout(120000);await page.setViewportSize({width:960,height:640});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/simulator.html?map=nexus');await launchFromLobby(page);
  const app=page.locator('.flight-app'),canvas=page.locator('.flight-canvas');
  await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});
  await page.keyboard.press('Escape');const quality=page.getByLabel('Gráficos');
  await quality.selectOption('high');await expect(app).toHaveAttribute('data-quality','high');
  await expect(canvas).toHaveAttribute('width','960');
  await quality.selectOption('performance');await expect(canvas).toHaveAttribute('width','672');
  expect(await canvas.evaluate(node=>node.getBoundingClientRect().width)).toBe(960);
  await expect(app).toHaveAttribute('data-phase','paused');
  await page.getByRole('button',{name:'Continuar',exact:true}).click();
  await page.keyboard.down('KeyW');await expect.poll(async()=>Number(await app.getAttribute('data-speed'))).toBeGreaterThan(10);await page.keyboard.up('KeyW');
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'Sonido',exact:true}).click();
  await page.screenshot({path:'.context/controls-desktop.png'});
  await page.getByRole('slider',{name:'Volumen de música'}).press('Escape');
  await page.setViewportSize({width:390,height:844});
  await expect(quality).toBeVisible();expect(await quality.evaluate(node=>node.getBoundingClientRect().right)).toBeLessThanOrEqual(390);
  await page.screenshot({path:'.context/controls-mobile.png'});
  await page.reload();await launchFromLobby(page);await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});
  await expect(app).toHaveAttribute('data-quality','performance');expect(errors).toEqual([]);
});
