import {chromium} from '@playwright/test';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const output=resolve(process.env.TOKYO_OUTPUT ?? 'output/tokyo-playtest');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:false,args:['--enable-unsafe-webgpu']});
const reports=[];
try {
  for (const backend of ['webgl2','webgpu']) {
    const page=await browser.newPage({viewport:{width:1280,height:800}}), errors=[];
    page.on('pageerror', e=>{errors.push(e.message);console.log('PAGE ERROR',e.message);});
    page.on('console', m=>{if(m.type()==='error'){errors.push(m.text());console.log('CONSOLE ERROR',m.text());}});
    await page.addInitScript(()=>localStorage.setItem('biggas-hover-racing-quality','high'));
    await page.goto(`http://127.0.0.1:5174/?selection=map&map=tokyo-highway&pilot=zudmatic&renderer=${backend}`);
    await page.getByRole('button',{name:'Volar',exact:true}).waitFor();
    await page.waitForFunction(()=>!document.querySelector('.race-lobby')?.hasAttribute('data-landing-transition'));
    await page.getByRole('button',{name:'Volar',exact:true}).click();
    try {await page.waitForSelector('.flight-app[data-ready="true"]',{timeout:45000});} catch(e) {await page.screenshot({path:resolve(output,'load-failure.png')}); console.log(await page.locator('body').innerText()); throw e;}
    await page.waitForTimeout(5000);
    const before=await page.evaluate(()=>window.__game.snapshot());
    await page.locator('.flight-canvas').focus();
    await page.keyboard.down('KeyW');await page.waitForTimeout(3500);await page.keyboard.up('KeyW');
    const driving=await page.evaluate(()=>({snapshot:window.__game.snapshot(),y:window.__game.state.y,airborne:window.__game.state.airborne,recoverNeeded:window.__game.state.recoverNeeded}));
    if (Math.hypot(driving.snapshot.position[0]-before.position[0],driving.snapshot.position[2]-before.position[2])<10) throw new Error(`${backend}: vehicle did not move`);
    if (driving.y<25 || driving.recoverNeeded) throw new Error(`${backend}: vehicle lost the elevated road`);
    await page.keyboard.press('Escape');
    await page.addStyleTag({content:'.flight-menu,.flight-key-hint,.flight-telemetry,.flight-minimap,.flight-status,.flight-scale,.oil-panel,.flight-oil,.dialkit-root,.dk-root,[class*=nameplate]{visibility:hidden!important}'});
    await page.screenshot({path:resolve(output,`${backend}-driving.png`)});
    await page.evaluate(()=>window.__game.overview());await page.waitForTimeout(1500);
    await page.screenshot({path:resolve(output,`${backend}-overview.png`)});
    reports.push({backend,before,driving,errors});
    console.log(JSON.stringify({backend,position:driving.snapshot.position,errors}));
    if(errors.length)throw new Error(errors.join('\n'));
    await page.close();
  }
} finally {
  await writeFile(resolve(output,'browser-validation.json'),JSON.stringify(reports,null,2));
  await browser.close();
}
