import {test,expect} from '@playwright/test';
import {createPaperTheme} from '../src/paper-theme.js';
import {retroStyle,RETRO_DEFAULTS} from '../src/retro-style.js';
import {target} from './helpers.js';

// Fake page root: records the CSS variables the theme writes.
const fakeRoot=()=>{const vars={};return {vars,style:{setProperty:(name,value)=>{vars[name]=value;}}};};
const theme=(root=fakeRoot())=>({root,theme:createPaperTheme({post:retroStyle.post,params:()=>retroStyle.params,root})});
const frames=(t,count,input)=>{let state;for(let i=0;i<count;i++)state=t.update({dt:1/60,...input});return state;};

test.beforeEach(()=>{retroStyle.setPreset('day');retroStyle.setLook('comic');});

test('Darkness is what the scene knows: night from the clock, plus the blind over the daylight that is left',()=>{
  const {theme:t}=theme();
  // Day with the blind up: nothing is dark and the shader is told to use the plain paper.
  let state=t.update({daylight:1,blind:0,reducedMotion:true});
  expect(state.dark).toBe(0);expect(retroStyle.post.uThemeB.value.w).toBe(0);
  // Blind half down in daylight: half dark, with the curtain edge 60% of the way (x1.2).
  state=t.update({daylight:1,blind:.5,reducedMotion:true});
  expect(state.dark).toBeCloseTo(.5,6);expect(retroStyle.post.uThemeA.value.y).toBeCloseTo(.6,6);expect(retroStyle.post.uThemeB.value.w).toBe(1);
  // Blind closed in daylight is as dark as night; at night the blind adds nothing.
  expect(t.update({daylight:1,blind:1,reducedMotion:true}).dark).toBe(1);
  expect(t.update({daylight:0,blind:0,reducedMotion:true}).dark).toBe(1);
  expect(t.update({daylight:0,blind:1,reducedMotion:true}).dark).toBe(1);
  // Dusk (daylight .5) with the blind half down: 1 - daylight_eff = night + (1-night)*blind.
  expect(t.update({daylight:.5,blind:.5,reducedMotion:true}).dark).toBeCloseTo(.75,6);
  // The switch turns all of it off.
  retroStyle.params.themeOn=false;
  expect(t.update({daylight:0,blind:1,reducedMotion:true}).dark).toBe(0);
});

test('Nightfall is a transition (the clock jumps, the page does not); reduced motion snaps; the blind is not smoothed',()=>{
  const {theme:t}=theme();
  t.update({daylight:1,blind:0,reducedMotion:true});
  // The clock jumps to midnight: after one frame the page has barely moved, after a few seconds it has arrived.
  const first=t.update({dt:1/60,daylight:0,blind:0});
  expect(first.dark).toBeGreaterThan(0);expect(first.dark).toBeLessThan(.1);
  const half=frames(t,30,{daylight:0,blind:0});
  expect(half.dark).toBeGreaterThan(first.dark);expect(half.dark).toBeLessThan(.95);
  expect(frames(t,60*5,{daylight:0,blind:0}).dark).toBeGreaterThan(.99);
  // Going back is a transition too, and monotonic.
  let previous=1;for(let i=0;i<120;i++){const {dark}=t.update({dt:1/60,daylight:1,blind:0});expect(dark).toBeLessThanOrEqual(previous);previous=dark;}
  expect(previous).toBeLessThan(.9);
  // Reduced motion: no transition.
  expect(t.update({daylight:0,blind:0,reducedMotion:true}).dark).toBe(1);
  // The curtain follows the blind's own progress at once (the room already animates it).
  t.update({daylight:1,blind:0,reducedMotion:true});
  t.update({dt:1/60,daylight:1,blind:.3});expect(retroStyle.post.uThemeA.value.y).toBeCloseTo(.36,6);
  // A slower speed makes the same jump slower.
  retroStyle.params.themeSpeed=5;t.update({daylight:1,blind:0,reducedMotion:true});
  // (half a second at 5 s smoothing is a quarter of the way; at the default it is three quarters)
  expect(frames(t,30,{daylight:0,blind:0}).dark).toBeLessThan(.4);
});

test('The page variables follow the paper: exact light paper by day, dark paper and light UI ink at night, neutral in black & white',()=>{
  const {theme:t,root}=theme();
  let state=t.update({daylight:1,blind:0,reducedMotion:true});
  expect(root.vars['--paper']).toBe('rgb(255 255 255)');expect(root.vars['--ink']).toBe('rgb(38 38 38)');expect(state.theme).toBe('light');
  state=t.update({daylight:0,blind:0,reducedMotion:true});
  expect(root.vars['--paper']).toBe('rgb(21 18 31)');                      // paperDark #15121f
  expect(root.vars['--ink']).toBe('rgb(236 232 245)');expect(state.theme).toBe('dark');
  // Hysteresis: it does not flap around the middle.
  t.update({daylight:.5,blind:0,reducedMotion:true});expect(t.update({daylight:.5,blind:0,reducedMotion:true}).theme).toBe('dark');
  t.update({daylight:.6,blind:0,reducedMotion:true});expect(t.update({daylight:.6,blind:0,reducedMotion:true}).theme).toBe('light');
  // Black & white keeps the page neutral.
  t.update({daylight:0,blind:0,look:'mono',reducedMotion:true});
  const [r,g,b]=root.vars['--paper'].match(/\d+/g).map(Number);
  expect(Math.max(r,g,b)-Math.min(r,g,b)).toBeLessThanOrEqual(1);
  const dark=retroStyle.post.uPaperDark.value;expect(dark.x).toBeCloseTo(dark.y,6);expect(dark.y).toBeCloseTo(dark.z,6);
  // The halo ink flips to its night color with the darkness.
  t.update({daylight:1,blind:0,look:'comic',reducedMotion:true});const day=retroStyle.post.uBgInk.value.toArray();
  t.update({daylight:0,blind:0,look:'comic',reducedMotion:true});const night=retroStyle.post.uBgInk.value.toArray();
  expect(night[0]).toBeGreaterThan(day[0]+.3);
  expect(RETRO_DEFAULTS.paper).toBe('#ffffff');
});

// The shader: exact paper by day, the dark paper at night in every look, a curtain
// that darkens the top first, and a halftone (two colors only) at the wipe's edge.
test('Paper in the frame pass: exact by day, dark at night in every look, a descending curtain with a halftone edge',async({page})=>{
  test.setTimeout(90000);
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {retro}=await import('/src/retro-material.js');
    const {retroStyle}=await import('/src/retro-style.js');
    const {createPrintPass}=await import('/src/retro-print.js');
    const {createPaperTheme}=await import('/src/paper-theme.js');
    const W=240,H=240;
    const renderer=new THREE.WebGLRenderer({preserveDrawingBuffer:true,alpha:true,antialias:false});
    renderer.setPixelRatio(1);renderer.setSize(W,H,false);renderer.toneMapping=THREE.ACESFilmicToneMapping;
    const scene=new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff,1.2));
    const small=new THREE.Mesh(new THREE.BoxGeometry(.5,.5,.5),retro(0xd06040));small.position.y=-1.4;scene.add(small);   // keeps the middle of the frame empty
    const camera=new THREE.OrthographicCamera(-2,2,2,-2,.1,20);camera.position.set(4,4,4);camera.lookAt(0,0,0);
    const pass=createPrintPass(renderer);
    const theme=createPaperTheme({post:retroStyle.post,params:()=>retroStyle.params,root:null});
    const pixels=new Uint8Array(W*H*4);
    const draw=(look,input,params={})=>{
      retroStyle.setPreset('day');retroStyle.setLook(look);
      Object.assign(retroStyle.params,{bgOn:false,outlineOn:false,paperGrain:0,inkGrain:0},params);retroStyle.sync();
      theme.update({dt:10,lampUv:[.5,.5],look,reducedMotion:true,...input});
      pass.render(scene,camera,{samples:0});
      const gl=renderer.getContext();gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      return pixels.slice();
    };
    const at=(image,x,y)=>Array.from(image.slice((y*W+x)*4,(y*W+x)*4+4));
    const out={};
    for(const look of ['normal','comic','mono']) {
      out[`${look}Day`]=at(draw(look,{daylight:1,blind:0}),0,H-1);
      // Night, no lamp glow (the glow is off in this probe) so the corner is the pure dark paper.
      out[`${look}Night`]=at(draw(look,{daylight:0,blind:0},{themeGlowStrength:0}),0,H-1);
    }
    // A curtain halfway down in daylight, smooth wipe: top (GL row H-1) dark, bottom (row 0) light.
    const smooth=draw('comic',{daylight:1,blind:.6},{themeDots:false,themeGlowStrength:0});
    out.curtainTop=at(smooth,10,H-4);out.curtainBottom=at(smooth,10,3);
    // The wipe's edge is a halftone: in a row where the smooth wipe is one flat mid-tone, the dotted
    // wipe has both the paper and the dark paper side by side.
    const dotted=draw('comic',{daylight:1,blind:.6},{themeDots:true,themeDotPitch:6,themeGlowStrength:0});
    let row=null;
    for(let y=0;y<H&&row===null;y++){
      const values=[];for(let x=0;x<W;x++)values.push(at(smooth,x,y)[0]);
      const spread=Math.max(...values)-Math.min(...values);
      if(spread<=3&&values[0]>70&&values[0]<190)row=y;
    }
    out.row=row;
    if(row!==null){
      const values=[];for(let x=0;x<W;x++)values.push(at(dotted,x,row)[0]);
      out.dottedSpread=Math.max(...values)-Math.min(...values);
      out.dottedHasBoth=values.some(v=>v>=250)&&values.some(v=>v<=120);
    }
    pass.dispose();renderer.dispose();return out;
  });
  for(const look of ['normal','comic','mono'])expect(result[`${look}Day`]).toEqual([255,255,255,255]);
  for(const look of ['normal','comic'])for(const [i,wanted] of [21,18,31,255].entries())expect(Math.abs(result[`${look}Night`][i]-wanted)).toBeLessThanOrEqual(1);
  // Black & white: the same dark, without hue.
  const [r,g,b]=result.monoNight;expect(Math.max(r,g,b)-Math.min(r,g,b)).toBeLessThanOrEqual(1);expect(r).toBeLessThan(40);
  expect(result.curtainTop[0]).toBeLessThan(40);expect(result.curtainBottom).toEqual([255,255,255,255]);
  expect(result.row).not.toBeNull();expect(result.dottedHasBoth).toBe(true);expect(result.dottedSpread).toBeGreaterThan(100);
  expect(errors).toEqual([]);
});

// In the real page: the blind drives it, the clock drives it, and ?time= starts at that hour.
test('The page goes dark when the blind closes or the night comes, in any look, and back',async({page})=>{
  test.setTimeout(120000);
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto('/?resolution=fixed&look=comic');
  await page.locator('body[data-house-ready]').waitFor({state:'attached'});
  const stage=page.locator('#stage');
  const body=()=>page.evaluate(()=>getComputedStyle(document.body).backgroundColor);
  await expect(stage).toHaveAttribute('data-theme','light');await expect(stage).toHaveAttribute('data-darkness','0.00');
  expect(await body()).toBe('rgb(255, 255, 255)');
  // Closing the blind in daylight darkens the page (and the lamp comes on in the room).
  const click=async()=>{const spot=await target(page,'blinds');await page.mouse.click(spot.x,spot.y);};
  await click();
  await expect(stage).toHaveAttribute('data-blinds','closed');
  await expect(stage).toHaveAttribute('data-theme','dark',{timeout:15000});
  await expect(stage).toHaveAttribute('data-darkness','1.00',{timeout:15000});
  // The blind settles into its last thousandth, and the page into exactly the dark paper.
  await expect.poll(body,{timeout:15000}).toBe('rgb(21, 18, 31)');
  await expect(stage).toHaveAttribute('data-lamp','on');
  // Opening it brings the day back.
  await click();
  await expect(stage).toHaveAttribute('data-theme','light',{timeout:15000});
  await expect(stage).toHaveAttribute('data-darkness','0.00',{timeout:15000});
  await expect.poll(body,{timeout:15000}).toBe('rgb(255, 255, 255)');
  // A page opened at night is dark from the first frame, in every look.
  for(const look of ['normal','comic','mono']) {
    await page.goto(`/?resolution=fixed&look=${look}&time=23:30`);
    await page.locator('body[data-house-ready]').waitFor({state:'attached'});
    await expect(stage).toHaveAttribute('data-theme','dark');await expect(stage).toHaveAttribute('data-darkness','1.00');
    await expect(stage).toHaveAttribute('data-time','23:30');
  }
  await page.goto('/?resolution=fixed&time=12:00');
  await page.locator('body[data-house-ready]').waitFor({state:'attached'});
  await expect(stage).toHaveAttribute('data-theme','light');
  expect(errors).toEqual([]);
});
