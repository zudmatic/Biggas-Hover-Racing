import {expect} from '@playwright/test';

// Shared helpers for /playground specs: drive dials through window.playground, never through collapsed folders.
export async function openPlayground(page,query){
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`/playground?${query}`);
  await expect(page.locator('body')).toHaveAttribute('data-ready','true',{timeout:120000});
  return errors;
}
export const set=(page,panel,path,value)=>page.evaluate(([p,k,v])=>window.playground.set(p,k,v),[panel,path,value]);
export const setState=(page,id)=>page.evaluate(s=>window.playground.setState(s),id);
export const vfx=page=>page.locator('body').getAttribute('data-vfx').then(v=>v?JSON.parse(v):null);
export async function frames(page,count=3,timeout=90000){
  const before=Number(await page.locator('body').getAttribute('data-frame'));
  await expect.poll(async()=>Number(await page.locator('body').getAttribute('data-frame')),{timeout}).toBeGreaterThan(before+count);
}
