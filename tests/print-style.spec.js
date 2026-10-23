import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {retro} from '../src/retro-material.js';
import {createRetroLighting} from '../src/retro-lighting.js';
import {retroStyle,RETRO_DEFAULTS,RETRO_PRESETS} from '../src/retro-style.js';

// A flat plane in the highlight band under ambient light, rendered in the browser: screen-space
// ink must stay on the screen grid when the surface moves under it.
test('Screen-space ink is zero-mean, stays on the screen grid and is dropped in the mirror pass',async({page})=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {retro}=await import('/src/retro-material.js');
    const {retroStyle}=await import('/src/retro-style.js');
    // The flat plane sits in the highlight band: pin the values this test was written for.
    retroStyle.setLook('comic');retroStyle.setSpace('screen');
    retroStyle.setParams({grain:0,bandShadow:.3,bandLight:.35,bandSoft:.05,posterAmount:.85,posterSteps:6,posterSoft:.12,hiPitch:7,hiOpacity:.3,hiCoverage:.45});
    retroStyle.setPixelRatio(1);
    const renderer=new THREE.WebGLRenderer();renderer.setSize(512,512);
    const target=new THREE.WebGLRenderTarget(512,512);
    renderer.setRenderTarget(target);
    const scene=new THREE.Scene();scene.add(new THREE.AmbientLight(0xffffff,2));
    // Light enough that the highlight dots never clip a channel at zero.
    const material=retro(0xd0b090,{mottle:0});
    const surface=new THREE.Mesh(new THREE.PlaneGeometry(1.5,1.5),material);scene.add(surface);
    const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=3;
    const render=()=>{
      renderer.render(scene,camera);
      const pixels=new Uint8Array(512*512*4);
      renderer.readRenderTargetPixels(target,0,0,512,512,pixels);
      return pixels;
    };
    const strength=material.uniforms.retroHalftoneStrength.value;
    const printed=render();
    material.uniforms.retroHalftoneStrength.value=0;const plain=render();
    material.uniforms.retroHalftoneStrength.value=strength;
    retroStyle.uniforms.retroMirror.value=1;const mirrored=render();retroStyle.uniforms.retroMirror.value=0;
    // A quarter world unit is 64 pixels here; the surface moves, the ink must not.
    surface.position.x=.25;const moved=render();
    let changed=0,mirrorDifference=0,sameGrid=0,shifted=0,samples=0;const drift=[0,0,0];
    for(let y=120;y<392;y++)for(let x=140;x<430;x++)for(let c=0;c<3;c++){
      const i=(y*512+x)*4+c,difference=printed[i]-plain[i];
      if(Math.abs(difference)>1)changed++;
      drift[c]+=difference;mirrorDifference+=Math.abs(mirrored[i]-plain[i]);
      sameGrid+=Math.abs(printed[i]-moved[i]);shifted+=Math.abs(printed[i]-moved[i+64*4]);samples++;
    }
    target.dispose();surface.geometry.dispose();material.dispose();renderer.dispose();
    return {changed,drift:drift.map(value=>value/(samples/3)),mirrorDifference:mirrorDifference/samples,sameGrid:sameGrid/samples,shifted:shifted/samples};
  });
  expect(result.changed).toBeGreaterThan(1000);
  for(const drift of result.drift)expect(Math.abs(drift)).toBeLessThan(1);
  expect(result.mirrorDifference).toBeLessThan(.01);
  expect(result.sameGrid).toBeLessThan(.1);
  expect(result.shifted).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

test('Lite path (a uniform) and pattern space (a define) are logged and exposed as data-* attributes',async({page})=>{
  const errors=[],logs=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());if(message.text().startsWith('[retro]'))logs.push(message.text());});
  // Fixed resolution: the adaptive logic would switch to the lite path on its own on a slow machine.
  await page.goto('/?resolution=fixed');
  await page.locator('#stage[data-ready="true"]').waitFor({state:'attached'});
  await page.locator('body[data-house-ready]').waitFor({state:'attached'});
  const stage=page.locator('#stage');
  await expect(stage).toHaveAttribute('data-print-space','object');
  await expect(stage).toHaveAttribute('data-print-lite','off');
  const defines=await page.evaluate(async()=>{
    const {retroStyle}=await import('/src/retro-style.js');
    retroStyle.setLite(true);retroStyle.setLite(true);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    return {lite:retroStyle.lite};
  });
  expect(defines.lite).toBe(true);
  await expect(stage).toHaveAttribute('data-print-lite','on');
  await page.evaluate(async()=>{
    const {retroStyle}=await import('/src/retro-style.js');
    retroStyle.setSpace('screen');
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  });
  await expect(stage).toHaveAttribute('data-print-space','screen');
  await page.evaluate(async()=>{
    const {retroStyle}=await import('/src/retro-style.js');
    retroStyle.setSpace('object');retroStyle.setLite(false);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  });
  await expect(stage).toHaveAttribute('data-print-lite','off');
  await expect(stage).toHaveAttribute('data-print-space','object');
  // Setting the same value twice logs once.
  expect(logs).toEqual(['[retro] lite print path on','[retro] lite print path off']);
  expect(errors).toEqual([]);
});

test('Paper white follows the day cycle, and nightKeep decides how much of the night is kept',()=>{
  const white=({daylight,nightKeep})=>{
    const scene=new THREE.Scene(),lighting=createRetroLighting(scene);
    retroStyle.setParams({nightKeep});
    const cycle={hour:daylight?12:0,daylight,twilight:0,night:1-daylight};
    lighting.update(0,{room:true,daylight,cycle,reducedMotion:true});
    const value=lighting.uniforms.retroWhite.value;lighting.dispose();return value;
  };
  try{
    const day=white({daylight:1,nightKeep:0}),normalized=white({daylight:0,nightKeep:0}),kept=white({daylight:0,nightKeep:1});
    // Fully normalized, the night's reference is far dimmer than the day's; fully kept, it is the day's.
    expect(normalized).toBeLessThan(day/3);
    expect(kept).toBeCloseTo(day,1);
    const half=white({daylight:0,nightKeep:.5});
    expect(half).toBeGreaterThan(normalized);expect(half).toBeLessThan(kept);
  }finally{retroStyle.setPreset('day');}
});

test('Day restores every parameter and materials keep their own pinned space',()=>{
  const pinned=retro(0xff0000,{space:'screen'}),shared=retro(0xff0000);
  try{
    // The default space is object: a material pinned to screen keeps its own define set.
    expect(retroStyle.space).toBe('object');
    expect(shared.defines.RETRO_OBJECT_SPACE).toBe(1);expect(pinned.defines.RETRO_OBJECT_SPACE).toBeUndefined();
    expect(Object.keys(RETRO_PRESETS)).toEqual(['day']);
    retroStyle.setLook('mono');retroStyle.params.hatchSecond=1.5;retroStyle.sync();
    retroStyle.setPreset('day');
    expect(retroStyle.params.hatchSecond).toBe(RETRO_DEFAULTS.hatchSecond);
    // The look is an explicit choice too: Day never changes it.
    expect(retroStyle.look).toBe('mono');
    // Resetting never changes the pattern space (it recompiles shaders): that stays an explicit choice.
    expect(retroStyle.space).toBe('object');
    retroStyle.setSpace('screen');expect(shared.defines.RETRO_OBJECT_SPACE).toBeUndefined();
    retroStyle.setPreset('day');expect(retroStyle.space).toBe('screen');
    expect(pinned.defines.RETRO_OBJECT_SPACE).toBeUndefined();
    expect(shared.customProgramCacheKey()).not.toContain('RETRO_OBJECT_SPACE');
    retroStyle.setSpace('object');expect(shared.customProgramCacheKey()).toContain('RETRO_OBJECT_SPACE');
    expect(pinned.customProgramCacheKey()).not.toContain('RETRO_OBJECT_SPACE');
  }finally{retroStyle.setSpace(RETRO_DEFAULTS.space);retroStyle.setLook(RETRO_DEFAULTS.look);retroStyle.setPreset('day');pinned.dispose();shared.dispose();}
});

// A GPU-bound page: each frame costs time in proportion to the pixels drawn. Once the
// adaptive resolution is at its floor and the median frame is still over 22 ms, the
// print switches to its lite path, once, and says so in the log and in a data attribute.
test('At the resolution floor and still slow, the lite print path engages once',async({page})=>{
  test.setTimeout(120000);
  const errors=[],logs=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());if(message.text().startsWith('[retro]'))logs.push(message.text());});
  await page.addInitScript(()=>{
    const raf=window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame=callback=>raf(time=>{
      callback(time);
      const ratio=parseFloat(document.querySelector('#stage')?.dataset.pixelRatio??'1');
      const end=performance.now()+70*ratio*ratio;while(performance.now()<end);
    });
  });
  await page.goto('/?look=comic');
  const stage=page.locator('#stage');
  await expect(stage).toHaveAttribute('data-print-lite','off');
  await expect(stage).toHaveAttribute('data-print-lite','on',{timeout:60000});
  expect(await stage.getAttribute('data-pixel-ratio')).toBe('0.75');
  expect(logs.filter(line=>line.includes('lite print path on'))).toHaveLength(1);
  expect(logs.some(line=>line.includes('adaptive resolution is at its floor'))).toBe(true);
  // It does not flap back: the lite level is kept for the session.
  await page.waitForTimeout(5000);
  await expect(stage).toHaveAttribute('data-print-lite','on');
  expect(logs.filter(line=>/lite print path (on|off)/.test(line))).toHaveLength(1);
  expect(errors).toEqual([]);
});

// The nav keeps the room in a comic look while legacy direct links remain usable.
test('Navigation defaults to color comic and toggles B/N with pointer and keyboard',async({page})=>{
  test.setTimeout(120000);
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto('/?resolution=fixed');
  await page.locator('body[data-house-ready]').waitFor({state:'attached'});
  const stage=page.locator('#stage'),toggle=page.locator('#look-toggle');
  const uniforms=()=>page.evaluate(async()=>{
    const {retroStyle}=await import('/src/retro-style.js');
    return {classic:retroStyle.uniforms.retroClassic.value,mono:retroStyle.uniforms.retroMono.value.x,postMono:retroStyle.post.uMono.value};
  });
  await expect(page.locator('.nav-links a')).toHaveText(['Home','Work','About','Photos','Blog','Contact']);
  await expect(page.locator('.nav-links [aria-disabled="true"]')).toHaveCount(4);
  await expect(page.getByRole('link', { name: 'About', exact: true })).not.toHaveAttribute('href');
  await expect(page.locator('.look-switch')).toHaveCount(0);
  await expect(stage).toHaveAttribute('data-look','comic');
  await expect(toggle).toHaveAttribute('aria-pressed','false');
  await expect(stage).toHaveAttribute('data-twos','on');
  expect(await uniforms()).toEqual({classic:0,mono:0,postMono:0});

  await toggle.click();
  await expect(stage).toHaveAttribute('data-look','mono');
  await expect(toggle).toHaveAttribute('aria-pressed','true');
  expect(await uniforms()).toEqual({classic:0,mono:1,postMono:1});
  expect(new URL(page.url()).searchParams.get('look')).toBe('mono');
  expect(new URL(page.url()).searchParams.get('resolution')).toBe('fixed');
  await expect(toggle).not.toBeFocused();

  await toggle.focus();
  await toggle.press('Space');
  await expect(stage).toHaveAttribute('data-look','comic');
  await expect(toggle).toHaveAttribute('aria-pressed','false');
  await expect(toggle).toBeFocused();
  await expect(stage).toHaveAttribute('data-activity','idle');
  expect(await uniforms()).toEqual({classic:0,mono:0,postMono:0});
  await toggle.press('Enter');
  await expect(stage).toHaveAttribute('data-look','mono');
  await page.reload();
  await page.locator('body[data-house-ready]').waitFor({state:'attached'});
  await expect(toggle).toHaveAttribute('aria-pressed','true');

  // Legacy Normal links still work, and the toggle returns them to comic mode.
  await page.goto('/?resolution=fixed&look=normal');
  await page.locator('body[data-house-ready]').waitFor({state:'attached'});
  await expect(stage).toHaveAttribute('data-look','normal');
  await expect(toggle).toHaveAttribute('aria-pressed','false');
  await page.setViewportSize({width:375,height:812});
  const bounds=await page.locator('.site-nav').boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x+bounds.width).toBeLessThanOrEqual(375);
  for(const link of await page.locator('.nav-links a').all())await expect(link).toBeVisible();
  await toggle.click();
  await expect(stage).toHaveAttribute('data-look','mono');
  expect(errors).toEqual([]);
});
