import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

// Headful Chromium uses the native GPU. Headless-shell on this machine loses
// its WebGPU device and uses a software WebGL path, so it is not a fair FPS run.
const base=process.env.BENCH_URL??'http://127.0.0.1:5173';
const output=resolve(process.env.BENCH_OUTPUT??'output/desert-benchmark');await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:false,args:['--enable-unsafe-webgpu']});
const reports=[];
try{
  for(const backend of (process.argv[2]?[process.argv[2]]:['webgpu','webgl2'])){
    const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.addInitScript(()=>localStorage.setItem('biggas-hover-racing-quality','high'));
    await page.goto(`${base}/?selection=map&map=desert-valley&renderer=${backend}`);
    await page.getByRole('button',{name:'Volar',exact:true}).click();
    await page.waitForSelector('.flight-app[data-ready="true"]',{timeout:120000});
    await page.waitForTimeout(5000);await page.keyboard.press('Escape');
    await page.addStyleTag({content:'.flight-menu,.flight-key-hint,.flight-telemetry,.flight-minimap,.flight-status,.flight-scale,.oil-panel,.flight-oil,.dk-root{visibility:hidden!important}'});
    const hardware=await page.evaluate(async()=>{
      const a=await navigator.gpu?.requestAdapter();const info=a?.info;
      return {userAgent:navigator.userAgent,adapter:info?{vendor:info.vendor,architecture:info.architecture,device:info.device,description:info.description}:null};
    });
    const samples=[];
    for(const [name,position] of [['station',null],['cacti',[-220,-150,Math.PI/2]],['river',[255,-170,Math.PI/2]],['mesa',[-48,148,-Math.PI/2]]]){
      if(position)await page.evaluate(p=>window.__desertBenchmark.teleport(...p),position);
      for(const mode of ['full','adaptive']){
        await page.evaluate(m=>window.__desertBenchmark.setLodMode(m),mode);
        await page.waitForTimeout(2000);await page.evaluate(()=>window.__desertBenchmark.resetSamples());
        await page.waitForTimeout(4000);
        const sample={name,mode,...await page.evaluate(()=>window.__desertBenchmark.snapshot())};samples.push(sample);
        if(sample.frames<100)throw new Error(`Too few frames: ${name}/${mode}: ${sample.frames}`);
        console.log(JSON.stringify({backend,name,mode,fps:sample.fps,p95:sample.p95Ms,triangles:sample.render.triangles,detailTriangles:sample.lod.triangles,drawCalls:sample.render.drawCalls}));
        if(mode==='adaptive')await page.screenshot({path:resolve(output,`${backend}-${name}.png`)});
      }
    }
    await page.evaluate(()=>window.__desertBenchmark.overview());await page.waitForTimeout(2000);
    await page.screenshot({path:resolve(output,`${backend}-overview.png`)});
    await page.keyboard.press('KeyC');await page.keyboard.press('Escape');await page.locator('.flight-canvas').focus();
    await page.keyboard.down('KeyW');await page.waitForTimeout(2000);await page.evaluate(()=>window.__desertBenchmark.resetSamples());
    await page.waitForTimeout(5000);await page.keyboard.up('KeyW');
    const driving=await page.evaluate(()=>window.__desertBenchmark.snapshot());
    const report={backend,hardware,viewport:[1280,800],quality:'high, DPR 1, 4x MSAA',method:'Stationary paused A/B at identical poses; 2 s warmup plus 4 s samples. Separate 5 s W-held driving sample. Frame times include the game render loop; triangles include scene, shadows and post passes.',samples,driving,errors};
    reports.push(report);await writeFile(resolve(output,`${backend}.json`),JSON.stringify(report,null,2));
    if(errors.length)throw new Error(errors.join('\n'));
    await page.close();
  }
}finally{await writeFile(resolve(output,'results.json'),JSON.stringify(reports,null,2));await browser.close();}
