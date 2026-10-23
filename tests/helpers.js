// The app opens straight into Zud's room; actions run from the keys 1–9.
import {ZUD} from '../src/zud-profile.js';

export async function enter(page) {
  await page.goto('/');
  await page.locator('#stage[data-ready="true"]').waitFor({state:'attached'});
  await page.locator('body[data-house-ready]').waitFor({state:'attached'});
}

export async function act(page,action) {
  const key=ZUD.controls.find(([name])=>name===action)?.[2];
  if(!key)throw new Error(`No keyboard shortcut for ${action}`);
  await page.locator('#zud-canvas').focus();
  await page.keyboard.press(key);
}

// Zud's lines are announced in an sr-only status next to the state label.
export const line=page=>page.locator('#stage > [role="status"]:not(#state-label)');

// Screen position of a clickable room object, from the stage's data-targets.
export async function target(page,action) {
  const entry=(await page.locator('#stage').getAttribute('data-targets')).split(' ').find(t=>t.startsWith(`${action}:`));
  if(!entry)throw new Error(`No ${action} target`);
  const [,x,y]=entry.split(':').map(Number);
  const box=await page.locator('#zud-canvas').boundingBox();
  return {x:box.x+box.width*x/100,y:box.y+box.height*y/100};
}
