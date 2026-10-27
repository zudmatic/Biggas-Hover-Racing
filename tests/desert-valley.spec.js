import {test,expect} from '@playwright/test';
import {advanceHover,createHoverState} from '../src/circuit-physics.js';

test.use({launchOptions:{args:['--enable-unsafe-webgpu']}});

test('desert bridge takeoff carries momentum and lands on the river',()=>{
  const track={spawn:{x:0,y:12.65,z:-1},yaw:0,physicalBoundaries:true,allowJumps:true,
    roadAt:(x,z)=>({x,y:0,z,nx:0,nz:1,width:80,offset:0,distanceToRoad:0,grade:0})};
  const state=Object.assign(createHoverState(track),{speed:30,throttle:30,vz:30,hoverVelocity:2});
  const floor=(_x,z)=>z<0?12:0;
  let airFrames=0,landed=false;
  for(let i=0;i<240;i++){
    advanceHover(state,{reducedMotion:true},1/60,track,floor);
    if(state.airborne){airFrames++;expect(state.y).toBeGreaterThan(.65);}
    else if(airFrames>0)landed=true;
    expect(Number.isFinite(state.y)).toBe(true);
  }
  expect(airFrames).toBeGreaterThan(60);expect(landed).toBe(true);
  expect(state.y).toBeCloseTo(.65,2);
});

test('optimized desert retains instances, separate water and drivable surfaces',async({page})=>{
  test.setTimeout(120000);
  await page.goto('/?selection=map&map=desert-valley');
  await expect(page.getByRole('button',{name:'Volar',exact:true})).toBeVisible();
  const report=await page.evaluate(async()=>{
    const {createDesertWorld}=await import('/src/desert-world.js');
    const world=await createDesertWorld();
    const route=await (await fetch('/models/desert-valley/route_gltf.json')).json();
    const s=world.landscape.spawn;
    const water=world.root.getObjectByName('SM_Water');
    const river=route.samples.find(p=>p.section===7).position;
    const shortcut=route.shortcut[Math.floor(route.shortcut.length/2)];
    let largestBatch=0;world.root.traverse(o=>{if(o.isInstancedMesh)largestBatch=Math.max(largestBatch,o.count);});
    const report={instances:world.instanceCount,waterTriangles:water.geometry.index.count/3,
      floor:world.surfaceHeight(s.x,s.z),spawn:s,river:world.surfaceHeight(river[0],river[2]),
      shortcut:world.surfaceHeight(shortcut[0],shortcut[2]),largestBatch};
    world.dispose();return report;
  });
  expect(report.instances).toBe(8580);expect(report.waterTriangles).toBe(2);
  expect(report.largestBatch).toBeLessThanOrEqual(128);
  expect(report.floor).toBeGreaterThan(35);expect(report.floor).toBeLessThan(42);
  expect(report.river).toBeCloseTo(0,1);expect(report.shortcut).toBeGreaterThan(35);
});

for(const backend of ['webgpu','webgl2'])test(`desert driving, music and water on ${backend}`,async({page})=>{
  test.setTimeout(180000);const errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.setViewportSize({width:1100,height:760});
  await page.addInitScript(()=>{
    const NativeAudio=window.Audio;window.testMusic=[];
    window.Audio=function(...args){const audio=new NativeAudio(...args);window.testMusic.push(audio);return audio;};
  });
  await page.goto(`/?selection=map&map=desert-valley&renderer=${backend}&comic=0${backend==='webgpu'?'&testSpawn=river':''}`);
  await page.getByRole('button',{name:'Volar',exact:true}).click();
  const app=page.locator('.flight-app');
  await expect(app).toHaveAttribute('data-ready','true',{timeout:120000});
  await expect(app).toHaveAttribute('data-backend',backend==='webgpu'?'WebGPU':'WebGL2');
  await expect(app).toHaveAttribute('data-water','animated');
  await expect(app).toHaveAttribute('data-vegetation-instances','8580');
  await expect.poll(()=>page.evaluate(()=>window.testMusic.find(p=>p.src.endsWith('midnight-noir.mp3'))?.currentTime??0)).toBeGreaterThan(.1);
  await expect.poll(async()=>Number(await app.getAttribute('data-water-phase'))).toBeGreaterThan(.1);
  await page.locator('.flight-canvas').focus();await page.keyboard.down('KeyW');
  await expect.poll(async()=>Number(await app.getAttribute('data-speed'))).toBeGreaterThan(8);
  await page.keyboard.up('KeyW');await page.keyboard.press('KeyR');
  await expect.poll(async()=>Number(await app.getAttribute('data-speed'))).toBeLessThan(1);
  await page.keyboard.press('Escape');await expect(app).toHaveAttribute('data-phase','paused');
  await page.waitForTimeout(150);const phase=await app.getAttribute('data-water-phase');
  await page.waitForTimeout(250);expect(await app.getAttribute('data-water-phase')).toBe(phase);
  await page.getByRole('button',{name:'Continuar',exact:true}).click();
  await expect.poll(async()=>Number(await app.getAttribute('data-water-phase'))).toBeGreaterThan(Number(phase));
  await page.screenshot({path:`output/desert-${backend}.png`});
  if(backend==='webgpu'){
    await page.keyboard.press('Escape');await page.locator('.flight-options summary').click();
    await page.getByRole('button',{name:'Cómic',exact:true}).click();
    await page.getByRole('button',{name:'Continuar',exact:true}).click();
    await expect(app).toHaveAttribute('data-comic','true');
    const frame=Number(await app.getAttribute('data-frame'));
    await expect.poll(async()=>Number(await app.getAttribute('data-frame'))).toBeGreaterThan(frame+2);
    await page.screenshot({path:'output/desert-comic.png'});
  }
  expect(errors).toEqual([]);
});
