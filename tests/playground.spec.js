import {test,expect} from '@playwright/test';

test('playground: views, states, time controls and HUD',async({page})=>{
  test.setTimeout(180000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1280,height:800});
  await page.goto('/playground?vehicle=039&backend=webgl2');
  const body=page.locator('body');
  await expect(body).toHaveAttribute('data-ready','true',{timeout:120000});
  await expect(page.locator('#hud')).toContainText('FPS');

  // Camera views follow the ship: "carrera" sits behind it, "frontal" in front (ship forward is local +z).
  await page.evaluate(()=>window.playground.setView('carrera'));
  await expect(body).toHaveAttribute('data-view','carrera');
  await expect.poll(()=>page.evaluate(()=>window.playground.info().cameraLocal.z)).toBeLessThan(0);
  await page.evaluate(()=>window.playground.setView('frontal'));
  await expect.poll(()=>page.evaluate(()=>window.playground.info().cameraLocal.z)).toBeGreaterThan(0);

  // States drive the propulsor mode and simulated speed.
  await page.evaluate(()=>window.playground.setState('turbo'));
  await expect.poll(()=>page.evaluate(()=>window.playground.info().mode)).toBe('Turbo');
  await page.evaluate(()=>window.playground.setState('contra-muro'));
  await expect.poll(()=>page.evaluate(()=>window.playground.info())).toMatchObject({mode:'Reposo',speed:0});

  // Pause freezes simulation time; step advances exactly n frames of 1/60 s.
  await page.evaluate(()=>window.playground.pause(true));
  const frozen=await page.evaluate(()=>window.playground.info().time);
  await page.waitForTimeout(500);
  expect(await page.evaluate(()=>window.playground.info().time)).toBe(frozen);
  await page.evaluate(()=>window.playground.step(3));
  await expect.poll(()=>page.evaluate(()=>window.playground.info().time)).toBeCloseTo(frozen+3/60,5);
  expect(errors).toEqual([]);
});

test('playground: follow cameras stay smooth and views glide instead of cutting',async({page})=>{
  test.setTimeout(180000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/playground?vehicle=039&backend=webgl2&view=carrera');
  await expect(page.locator('body')).toHaveAttribute('data-ready','true',{timeout:120000});
  await page.waitForTimeout(1500);
  // Track yaw arrives in per-segment steps; a camera bolted to the ship copies every step. The follow camera
  // must be smoothed, so its heading change differs from the ship's yaw change on most frames.
  const samples=await page.evaluate(()=>new Promise(done=>{const out=[];let frame=-1;const tick=()=>{const i=playground.info();
    if(i.frame!==frame){frame=i.frame;out.push([Math.atan2(i.camera[0]-i.ship.position[0],i.camera[2]-i.ship.position[2]),i.ship.yaw]);}
    if(out.length<90)requestAnimationFrame(tick);else done(out);};tick();}));
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  const rigid=samples.slice(1).filter(([h,y],i)=>Math.abs(wrap(h-samples[i][0])-wrap(y-samples[i][1]))<1e-6).length;
  expect(rigid/(samples.length-1)).toBeLessThan(.3);

  // Switching view glides: some frame lands between the old and new spot (a cut would jump straight there).
  await page.evaluate(()=>window.playground.pause(true));await page.waitForTimeout(1200);
  const path=await page.evaluate(()=>new Promise(done=>{playground.setView('frontal');const out=[];let frame=playground.info().frame;const end=performance.now()+4000;
    const tick=()=>{const i=playground.info();if(i.frame!==frame){frame=i.frame;out.push(i.cameraLocal.z);}if(performance.now()<end)requestAnimationFrame(tick);else done(out);};tick();}));
  const final=7.5/.75;
  expect(path.some(z=>z>-8.5/.75*.95&&z<final*.99)).toBe(true);
  expect(path.at(-1)).toBeGreaterThan(final*.98);
  expect(errors).toEqual([]);
});
