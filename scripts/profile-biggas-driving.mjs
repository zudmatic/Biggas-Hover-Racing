// Full-game cold-start/first-drive profile at high quality, including shadows,
// effects and the ship. Usage: node scripts/profile-biggas-driving.mjs [URL] [label]
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const url=process.argv[2]??'http://127.0.0.1:5391',label=(process.argv[3]??'current').replace(/[^a-z0-9_-]/gi,'');
const directory=`.context/driving-${label}`;await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,args:process.platform==='darwin'?['--use-angle=metal','--disable-features=WebGPUService']:['--disable-features=WebGPUService']});
try{
  const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:2}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('biggas-hover-racing-quality','high'));
  await page.goto(url+'/?selection=map&map=biggas-city');
  const start=Date.now();await page.getByRole('button',{name:'Volar',exact:true}).click();
  await page.locator('.flight-app[data-ready="true"]').waitFor({timeout:300000});
  const loadMs=Date.now()-start;await page.waitForTimeout(5000);
  const cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
  await page.evaluate(()=>{
    window.driveFrames=[];let previous=0,last=-1;
    window.driveObserver=new MutationObserver(()=>{
      const frame=Number(document.querySelector('.flight-app').dataset.frame);if(frame===last)return;last=frame;
      const now=performance.now();if(previous)window.driveFrames.push(now-previous);previous=now;
    });
    window.driveObserver.observe(document.querySelector('.flight-app'),{attributes:true,attributeFilter:['data-frame']});
  });
  await page.keyboard.down('KeyW');await page.waitForTimeout(20000);await page.keyboard.up('KeyW');
  const {profile}=await cdp.send('Profiler.stop');await writeFile(`${directory}/cpu.cpuprofile`,JSON.stringify(profile));
  const data=await page.evaluate(()=>{window.driveObserver.disconnect();return {frames:window.driveFrames,attributes:{...document.querySelector('.flight-app').dataset}};});
  const sorted=[...data.frames].sort((a,b)=>a-b),timing={medianMs:sorted[sorted.length>>1],p95Ms:sorted[Math.floor(sorted.length*.95)],maxMs:sorted.at(-1),over50ms:sorted.filter(t=>t>50).length};
  await writeFile(`${directory}/results.json`,JSON.stringify({url,loadMs,...timing,...data,errors},null,2));
  await page.screenshot({path:`${directory}/driving.png`});console.log({loadMs,...timing,frames:sorted.length,errors});if(errors.length)process.exitCode=1;
}finally{await browser.close();}
