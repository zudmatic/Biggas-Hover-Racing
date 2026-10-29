// Full-game cold-start/first-drive profile at high quality, including shadows,
// effects and the ship. Usage: node scripts/profile-biggas-driving.mjs [URL] [label]
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const url=process.argv[2]??'http://127.0.0.1:5391',label=(process.argv[3]??'current').replace(/[^a-z0-9_-]/gi,'');
const directory=`.context/driving-${label}`;await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,args:process.platform==='darwin'?['--use-angle=metal','--disable-features=WebGPUService']:['--disable-features=WebGPUService']});
try{
  const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:2}),errors=[];
  page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  page.on('console',m=>{if(m.type()==='error')console.error(m.text());});
  await page.addInitScript(()=>localStorage.setItem('biggas-hover-racing-quality','high'));
  await page.goto(url+'/?selection=map&map=biggas-city');
  const start=Date.now();await page.getByRole('button',{name:/^Volar/}).click();
  await page.locator('.flight-app[data-ready="true"]').waitFor({timeout:300000});
  const loadMs=Date.now()-start;console.log('Loaded in '+loadMs+' ms');await page.waitForTimeout(5000);
  const cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
  await page.waitForFunction(()=>Boolean(window.__game));
  await page.evaluate(()=>window.__game.resetSamples());
  await page.keyboard.down('KeyW');await page.waitForTimeout(20000);await page.keyboard.up('KeyW');
  const {profile}=await cdp.send('Profiler.stop');await writeFile(`${directory}/cpu.cpuprofile`,JSON.stringify(profile));
  const data=await page.evaluate(()=>({benchmark:window.__game.snapshot(),attributes:{...document.querySelector('.flight-app').dataset}}));
  await writeFile(`${directory}/results.json`,JSON.stringify({url,loadMs,...data,errors},null,2));
  await page.screenshot({path:`${directory}/driving.png`});console.log({loadMs,...data.benchmark,errors});if(errors.length)process.exitCode=1;
}finally{await browser.close();}
