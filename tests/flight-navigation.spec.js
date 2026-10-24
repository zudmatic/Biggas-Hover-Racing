import {test,expect} from '@playwright/test';
import {launchFromLobby} from './helpers/flight.js';

test('character preview stays on Zud while the preview and vehicle load',async({page})=>{
  test.setTimeout(90000);
  await page.emulateMedia({reducedMotion:'reduce'});
  let releasePreview,releaseShip;
  const previewGate=new Promise(resolve=>releasePreview=resolve),shipGate=new Promise(resolve=>releaseShip=resolve);
  await page.route('**/src/flight-preview.js',async route=>{await previewGate;await route.continue();});
  await page.route('**/models/spaceship/zud-033.glb',async route=>{await shipGate;await route.continue();});
  await page.goto('/');
  const lobby=page.locator('.race-lobby'),canvas=page.locator('.lobby-preview-canvas'),fallback=page.locator('.lobby-preview-fallback');
  // The placeholder must already be Zud before the first selection is opened.
  await expect(fallback).toHaveAttribute('src',/\/zud-paper.png$/);
  try{
    await page.getByRole('button',{name:'Jugar',exact:true}).click();
    await expect(fallback).toBeHidden();await expect(canvas).toHaveCSS('opacity','0');
    await expect(page.getByRole('status')).toHaveText('Cargando vista…');
    releasePreview();
    await expect(lobby).toHaveAttribute('data-preview','ready',{timeout:45000});
    await expect(canvas).toHaveAttribute('data-kind','pilot');
    await expect(page.locator('.lobby-preview-loading')).toBeHidden();
    const firstFrame=await canvas.screenshot();
    await page.screenshot({path:'.context/character-preview-stable.png'});
    await page.getByRole('button',{name:'Confirmar Zud',exact:true}).click();
    await expect(lobby).toHaveAttribute('data-preview','loading');
    await expect(canvas).toHaveCSS('opacity','0');
    await page.keyboard.press('Escape');
    await expect(lobby).toHaveAttribute('data-preview','ready');
    await expect(canvas).toHaveAttribute('data-kind','pilot');
    const pilot=await canvas.screenshot();expect(pilot.equals(firstFrame)).toBe(true);
    const loaded=page.waitForResponse('**/models/spaceship/zud-033.glb');releaseShip();await loaded;
    // Visit the loaded vehicle, then return to the character to check the rendered result.
    await page.getByRole('button',{name:'Confirmar Zud',exact:true}).click();
    await expect(lobby).toHaveAttribute('data-preview','ready',{timeout:30000});
    await expect(canvas).toHaveAttribute('data-kind','vehicle');
    await page.keyboard.press('Escape');
    await expect(canvas).toHaveAttribute('data-kind','pilot');
    expect((await canvas.screenshot()).equals(pilot)).toBe(true);
  }finally{releasePreview();releaseShip();}
});

test('a failed 3D preview shows the static character without a loading indicator',async({page})=>{
  await page.route('**/src/flight-preview.js',route=>route.abort());
  await page.goto('/');await page.getByRole('button',{name:'Jugar',exact:true}).click();
  await expect(page.locator('.race-lobby')).toHaveAttribute('data-preview','fallback');
  await expect(page.locator('.lobby-preview-fallback')).toBeVisible();
  await expect(page.locator('.lobby-preview-fallback')).toHaveAttribute('alt','Zud');
  await expect(page.locator('.lobby-preview-loading')).toBeHidden();
  await expect(page.locator('.lobby-preview-canvas')).toHaveCSS('opacity','0');
});

for(const mode of ['free','race'])test(`pause navigation works with legacy mode=${mode} links`,async({page})=>{
  test.setTimeout(120000);
  await page.setViewportSize(mode==='race'?{width:390,height:844}:{width:1200,height:800});
  await page.emulateMedia({reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`/simulator.html?vehicle=037&comic=0&mode=${mode}`);
  await launchFromLobby(page);
  const app=page.locator('.flight-app');
  await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});
  await page.keyboard.press('Escape');await expect(app).toHaveAttribute('data-phase','paused');
  const maps=page.getByRole('link',{name:'Selección de mapa',exact:true}),home=page.getByRole('link',{name:'Volver al menú principal',exact:true});
  await expect(maps).toBeVisible();await expect(home).toBeVisible();
  if(mode==='free')await page.screenshot({path:'.context/pause-navigation.png'});
  await maps.click();
  const lobby=page.locator('.race-lobby');
  await expect(lobby).toHaveAttribute('data-stage','3');await expect(lobby).toHaveAttribute('data-vehicle','037');
  await expect(page.locator('input[name=map][value=ruins]')).toBeChecked();
  await expect(page.locator('input[name=mode]')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Papel',exact:true})).toHaveAttribute('aria-pressed','false');
  await page.locator('.lobby-map-card:has(input[value=nexus])').click();
  await page.getByRole('button',{name:'Volar',exact:true}).click();
  await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});
  await expect(app).toHaveAttribute('data-map','nexus');await expect(app).toHaveAttribute('data-vehicle','037');
  expect(new URL(page.url()).searchParams.has('selection')).toBe(false);
  await page.keyboard.press('Escape');await expect(app).toHaveAttribute('data-phase','paused');
  await home.click();await expect(lobby).toHaveAttribute('data-stage','0');
  await expect(page.getByRole('button',{name:'Jugar',exact:true})).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/');await expect(app).toHaveCount(0);
  expect(errors).toEqual([]);
});
