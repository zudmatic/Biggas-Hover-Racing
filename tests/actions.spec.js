import { test, expect } from '@playwright/test';
import { enter, act, line } from './helpers.js';
import * as THREE from 'three';
import {RETRO_SPOTS,ROOM_SCALE} from '../src/retro-room.js';

test('Zud renders in his room and the actions, keyboard controls and click respond', async ({ page }) => {
  test.setTimeout(90000); // Includes scene loading and the complete desk journey.
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await enter(page);
  const stage = page.locator('#stage');
  await expect(stage).toHaveAttribute('data-ready', 'true');
  await expect(stage).toHaveAttribute('data-room', 'retro');
  await expect(page.locator('.fallback')).toHaveCount(0);
  await expect(page.locator('.house-loader')).toHaveCount(0);
  await expect(page.locator('button[data-action], .actions, #character-select')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
  await page.screenshot({ path: '.context/zud-desktop.png', fullPage: true });
  for (const action of ['wave', 'jump', 'dance', 'sleep', 'work']) {
    await act(page,action);
    await expect(stage).toHaveAttribute('data-state', action);
  }
  await expect(page.locator('#state-label')).toHaveText('Zud está concentrado');
  await expect(stage).toHaveAttribute('data-activity','typing',{timeout:25000});
  await expect(line(page)).toHaveText('Modo concentración. Una cosa a la vez.',{timeout:10000});
  await page.waitForTimeout(300);
  await page.screenshot({ path: '.context/zud-working.png', fullPage: true });
  await page.keyboard.press('Escape');
  await expect(stage).toHaveAttribute('data-state', 'idle');
  await page.keyboard.press('4');
  await expect(stage).toHaveAttribute('data-state', 'sleep');
  const canvas = page.locator('#zud-canvas');
  await canvas.focus();
  await page.keyboard.press('Enter');
  await expect(stage).toHaveAttribute('data-state', 'sleep');
  await page.keyboard.press('ArrowRight');
  await expect(stage).toHaveAttribute('data-state', 'idle');
  await expect(page.locator('#state-label')).toHaveText('Zud está explorando la casa');
  await page.keyboard.press('Escape');
  await expect(stage).toHaveAttribute('data-state', 'idle');
  expect(errors).toEqual([]);
});

test('Zud stays voiceless with sound enabled and ignores clicks, Enter and the old talk key', async ({ page }) => {
  test.setTimeout(60000);
  await page.addInitScript(() => {
    window.beepCount = 0;
    const original = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function (...args) { window.beepCount++; return original.apply(this, args); };
  });
  await enter(page);
  const stage=page.locator('#stage');
  await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed','true');
  await page.locator('#zud-canvas').focus();
  await page.keyboard.press('Shift');
  await expect(stage).toHaveAttribute('data-audio-status','ready');
  await act(page,'wave');
  await expect(line(page)).toHaveText('Hey. Te guardé un lugar.');
  await page.waitForTimeout(1200);
  await act(page,'sleep');
  await expect(stage).toHaveAttribute('data-state','sleep');
  await page.keyboard.press('5');
  await page.keyboard.press('Enter');
  await expect(stage).toHaveAttribute('data-state','sleep');

  // Project the body's center using the initial room camera, avoiding a
  // hard-coded pixel that could accidentally hit the floor or furniture.
  const box=await page.locator('#zud-canvas').boundingBox();
  const aspect=box.width/box.height,frustum=Math.max(9.5,12.4/aspect);
  const camera=new THREE.OrthographicCamera(-frustum*aspect/2,frustum*aspect/2,frustum/2,-frustum/2,.1,100);
  camera.position.set(Math.sin(Math.PI/4)*12,1.35+Math.tan(.57)*12,Math.cos(Math.PI/4)*12);
  camera.lookAt(0,1.35,0);camera.updateMatrixWorld();
  const center=RETRO_SPOTS.home.clone().add(new THREE.Vector3(0,1.34*ROOM_SCALE,0)).project(camera);
  const position=await stage.getAttribute('data-position-x')+':'+await stage.getAttribute('data-position-z');
  await page.mouse.click(box.x+(center.x*.5+.5)*box.width,box.y+(-center.y*.5+.5)*box.height);
  await page.waitForTimeout(700);
  await expect(stage).toHaveAttribute('data-state','sleep');
  expect(await stage.getAttribute('data-position-x')+':'+await stage.getAttribute('data-position-z')).toBe(position);
  expect(await page.evaluate(() => window.beepCount)).toBe(0);
  await expect(page.locator('#audio-mixer-toggle, #audio-mixer')).toHaveCount(0);
});

test('Mobile layout stays within viewport and actions work', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: '.context/zud-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await act(page,'dance');
  await expect(page.locator('#stage')).toHaveAttribute('data-state', 'dance');
});

test('Reduced motion keeps action status accessible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enter(page);
  await act(page,'wave');
  await expect(page.locator('#stage')).toHaveAttribute('data-state', 'wave');
  await expect(line(page)).toHaveText('Hey. Te guardé un lugar.');
});

test('Zud walks to the chair, types at the desk, and returns on another action', async ({ page }) => {
  test.setTimeout(90000); // Software WebGL renders the complete lift, sit and dismount.
  const errors=[];
  page.on('pageerror', error => errors.push(error.message));
  await enter(page);
  const stage=page.locator('#stage');
  await page.mouse.move(0,0);
  await page.waitForTimeout(500);
  await page.screenshot({path:'.context/zud-home.png',fullPage:true});
  await act(page,'work');
  await expect(stage).toHaveAttribute('data-activity','walking');
  await expect(line(page)).toHaveText('Voy al escritorio. Ya vuelvo.');
  await expect(stage).toHaveAttribute('data-activity','typing',{timeout:25000});
  await expect(line(page)).toHaveText('Modo concentración. Una cosa a la vez.',{timeout:10000});
  await page.mouse.move(0,0);
  await page.screenshot({path:'.context/zud-home-working.png',fullPage:true});
  await act(page,'work');
  await expect(stage).toHaveAttribute('data-activity','typing');
  await expect(line(page)).toHaveText('Modo concentración. Una cosa a la vez.',{timeout:10000});
  await page.keyboard.press('Escape');
  await expect(stage).toHaveAttribute('data-activity','standing');
  await expect(stage).toHaveAttribute('data-activity','idle',{timeout:25000});
  await act(page,'work');
  await expect(stage).toHaveAttribute('data-activity','walking');
  expect(errors).toEqual([]);
});

test('The room fits mobile and reduced motion skips the walk', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:'reduce'});
  await enter(page);
  await act(page,'work');
  await expect(page.locator('#stage')).toHaveAttribute('data-activity','typing');
  await expect(line(page)).toHaveText('Modo concentración. Una cosa a la vez.',{timeout:10000});
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.waitForTimeout(500);
  await page.screenshot({path:'.context/zud-home-mobile.png',fullPage:true});
});
