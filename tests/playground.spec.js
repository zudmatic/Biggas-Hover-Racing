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
