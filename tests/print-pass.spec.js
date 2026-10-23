import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {PAPER_COLOR} from '../src/paper.js';
import {RETRO_DEFAULTS,RETRO_PRESETS} from '../src/retro-style.js';
import {createTwosClock} from '../src/twos.js';

// The canvas is opaque, so the paper must be the page's own background.
test('PAPER_COLOR matches the light --paper in style.css and is the default paper',()=>{
  const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
  // The light theme's paper variable is what the body (and so the page) shows in daylight.
  const background=/:root\s*\{[^}]*?--paper:\s*(#[0-9a-fA-F]{3,6})/.exec(css)?.[1];
  expect(/body\s*\{[^}]*?background:\s*var\(--paper\)/.test(css),'body uses --paper').toBe(true);
  const full=hex=>hex.length===4?'#'+[...hex.slice(1)].map(c=>c+c).join(''):hex;
  expect(background,'--paper in style.css').toBeTruthy();
  expect(full(background).toLowerCase()).toBe(PAPER_COLOR.toLowerCase());
  expect(RETRO_DEFAULTS.paper).toBe(PAPER_COLOR);
  // Day is the only preset and never overrides the paper.
  expect(Object.keys(RETRO_PRESETS)).toEqual(['day']);expect(RETRO_PRESETS.day.paper).toBeUndefined();
});

test('Animation on twos ticks at the chosen rate, keeps the elapsed time and never stalls the pose',()=>{
  const ticks=(fps,seconds,frame,on=true)=>{
    const clock=createTwosClock(),result=[];
    for(let t=0;t<seconds*60;t++){const step=clock.step(frame,{on,fps});if(step.tick)result.push(step.dt);}
    return result;
  };
  const twos=ticks(12,1,1/60);
  expect(twos.length).toBe(12);
  // The first tick poses Zud at once; each later one reports about a twelfth of a second.
  for(const dt of twos.slice(1))expect(dt).toBeCloseTo(1/12,3);
  expect(ticks(24,1,1/60).length).toBe(24);
  // Off: every frame ticks with its own dt, exactly as before.
  const off=ticks(12,1,1/60,false);expect(off.length).toBe(60);for(const dt of off)expect(dt).toBeCloseTo(1/60,6);
  // A long stall yields one tick carrying the whole delay, not a burst.
  const clock=createTwosClock();clock.step(1/60,{on:true});
  const stall=clock.step(.5,{on:true});expect(stall.tick).toBe(true);expect(stall.dt).toBeCloseTo(.5,6);
  expect(clock.step(1/60,{on:true}).tick).toBe(false);
});

// A lit cube on paper, printed through the real pass and read back from the canvas.
test('Print pass: opaque exact paper, outline, misregistration and background dots; plain transparent pass for the bubble',async({page})=>{
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
    const SIZE=256;
    const renderer=new THREE.WebGLRenderer({preserveDrawingBuffer:true,alpha:true,antialias:false});
    renderer.setPixelRatio(1);renderer.setSize(SIZE,SIZE,false);
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    const scene=new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff,1.2));const sun=new THREE.DirectionalLight(0xffffff,3);sun.position.set(3,6,2);scene.add(sun);
    const cube=new THREE.Mesh(new THREE.BoxGeometry(1.2,1.2,1.2),retro(0xd0b090));scene.add(cube);
    const camera=new THREE.OrthographicCamera(-2,2,2,-2,.1,20);camera.position.set(4,4,4);camera.lookAt(0,0,0);
    // The comic stages only run in the comic looks (the page starts in Normal).
    const base={look:'comic',outlineOn:false,misreg:0,misregEdge:0,bgOn:false,paperGrain:0,inkGrain:0,gradeSaturation:1,gradeContrast:1,splitAmount:0};
    const pass=createPrintPass(renderer);
    const pixels=new Uint8Array(SIZE*SIZE*4);
    const draw=(params={},{lite=false}={})=>{
      retroStyle.setPreset('day');Object.assign(retroStyle.params,base,params);retroStyle.sync();retroStyle.setLite(lite);
      pass.render(scene,camera,{samples:0});
      const gl=renderer.getContext();gl.readPixels(0,0,SIZE,SIZE,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      return pixels.slice();
    };
    const at=(image,x,y)=>Array.from(image.slice((y*SIZE+x)*4,(y*SIZE+x)*4+4));
    const differing=(a,b)=>{let count=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>6)count++;return count;};
    const plain=draw();
    const cream=draw({paper:'#f3e9c0'});
    const outline=draw({outlineOn:true});
    const split=draw({misreg:3,misregEdge:3});
    const dots=draw({bgOn:true,bgReach:60,bgCoverage:.6,bgOpacity:1});
    const programsBefore=renderer.info.programs.length;
    const lite=draw({outlineOn:true},{lite:true});
    const programsAfter=renderer.info.programs.length;
    const liteUniform=pass.material.uniforms.uLite.value,liteDefines={...pass.material.defines};
    const out={
      cornerPlain:at(plain,0,0),cornerFar:at(plain,SIZE-1,SIZE-1),centerPlain:at(plain,128,159),
      cornerCream:at(cream,0,0),
      outlineChanged:differing(plain,outline),outlineCenter:at(outline,128,159),
      misregChanged:differing(plain,split),misregCorner:at(split,SIZE-1,SIZE-1),
      dotsChanged:differing(plain,dots),dotsCorner:at(dots,0,0),dotsCornerFar:at(dots,SIZE-1,SIZE-1),
      liteChanged:differing(plain,lite),liteUniform,liteDefines,programsBefore,programsAfter,
    };
    // The transparent use (dream bubble) leaves the paper transparent.
    const bubble=createPrintPass(renderer,{transparent:true});
    retroStyle.setLite(false);retroStyle.setPreset('day');
    bubble.render(scene,camera,{samples:0});
    const gl=renderer.getContext();gl.readPixels(0,0,SIZE,SIZE,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    out.bubbleCorner=at(pixels,0,0);out.bubbleDefines={...bubble.material.defines};
    out.alphaOpaque=true;
    pass.dispose();bubble.dispose();renderer.dispose();
    return out;
  });
  // Blank paper is exactly the page color (and exactly the chosen color in a preset).
  expect(result.cornerPlain).toEqual([255,255,255,255]);expect(result.cornerFar).toEqual([255,255,255,255]);
  for(const [value,wanted] of result.cornerCream.map((v,i)=>[v,[243,233,192,255][i]]))expect(Math.abs(value-wanted)).toBeLessThanOrEqual(1);
  // Each stage draws something near the cube; the outline leaves the middle of a flat face alone.
  expect(result.outlineChanged).toBeGreaterThan(40);expect(result.outlineCenter).toEqual(result.centerPlain);
  // Misregistration shifts the ink of a face too, so only the far paper is guaranteed untouched.
  expect(result.misregChanged).toBeGreaterThan(40);expect(result.misregCorner).toEqual([255,255,255,255]);
  expect(result.dotsChanged).toBeGreaterThan(40);expect(result.dotsCorner).toEqual([255,255,255,255]);expect(result.dotsCornerFar).toEqual([255,255,255,255]);
  // Lite keeps silhouettes only through a uniform (no new define, so no recompile); the plain pass has no comic stages at all.
  expect(result.programsAfter).toBe(result.programsBefore);expect(result.liteUniform).toBe(1);expect(result.liteDefines).toEqual({COMIC:1});expect(result.liteChanged).toBeGreaterThan(20);
  expect(result.bubbleCorner[3]).toBe(0);expect(result.bubbleDefines.COMIC).toBeUndefined();
  expect(errors).toEqual([]);
});

// In the real page: with twos on, Zud's shown position steps at the twos rate while his
// journey (and so everything else) keeps updating every frame.
test('On twos, the shown position updates at the twos rate while the journey runs at full rate',async({page})=>{
  test.setTimeout(90000);
  // A tiny canvas keeps the software renderer well above 12 fps.
  await page.setViewportSize({width:200,height:140});
  await page.goto('/?resolution=fixed');
  await page.locator('#stage[data-ready="true"]').waitFor({state:'attached'});
  await page.locator('body[data-house-ready]').waitFor({state:'attached'});
  // Walks one second in a direction; the next sample walks back, so he never stands against a wall.
  const sample=async(on,key)=>page.evaluate(async({on,key})=>{
    const {retroStyle}=await import('/src/retro-style.js');
    // Twos is a comic-look feature; 6 fps leaves a wide margin below the software renderer's own frame rate.
    retroStyle.setLook('comic');retroStyle.params.twosOn=on;retroStyle.params.twosFps=6;retroStyle.sync();
    const stage=document.querySelector('#stage');
    const journey=new Set(),shown=new Set();let frames=0;
    document.querySelector('#zud-canvas').focus();
    document.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}));
    const start=performance.now();
    await new Promise(resolve=>{const tick=()=>{
      frames++;journey.add(stage.dataset.positionX+','+stage.dataset.positionZ);shown.add(stage.dataset.shownX);
      performance.now()-start<1000?requestAnimationFrame(tick):resolve();};requestAnimationFrame(tick);});
    document.dispatchEvent(new KeyboardEvent('keyup',{key,bubbles:true}));
    return {frames,journey:journey.size,shown:shown.size,state:stage.dataset.twos};
  },{on,key});
  const off=await sample(false,'ArrowRight');
  expect(off.state).toBe('off');
  const on=await sample(true,'ArrowLeft');
  expect(on.state).toBe('on');
  test.skip(off.frames<12,`needs >= 12 fps to tell 6 fps from full rate (got ${off.frames} frames in 1 s)`);
  // Off: every frame shows a new position. On at 6 fps: about 6 steps a second (plus
  // one for the tick that was due), while the journey keeps changing on nearly every frame.
  expect(off.shown).toBeGreaterThan(off.frames*.8);
  expect(on.journey).toBeGreaterThan(on.frames*.8);
  expect(on.shown).toBeLessThanOrEqual(8);
  expect(on.journey).toBeGreaterThan(on.shown*1.5);
});

// Black & white: every printed pixel is a gray, the paper stays exactly the page color,
// with monoDetail 0 the drawing is two-tone (like the highlight band view), and with 1 it keeps its grays.
test('Black & white mode prints grays only, leaves the paper exact and is two-tone at monoDetail 0',async({page})=>{
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
    const SIZE=256;
    const renderer=new THREE.WebGLRenderer({preserveDrawingBuffer:true,alpha:true,antialias:false});
    renderer.setPixelRatio(1);renderer.setSize(SIZE,SIZE,false);renderer.toneMapping=THREE.ACESFilmicToneMapping;
    const scene=new THREE.Scene();
    const ambient=new THREE.AmbientLight(0xffffff,1.2),sun=new THREE.DirectionalLight(0xffe0b0,3);sun.position.set(3,6,2);scene.add(ambient,sun);
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1.2,1.2,1.2),retro(0xd06040)));
    const camera=new THREE.OrthographicCamera(-2,2,2,-2,.1,20);camera.position.set(4,4,4);camera.lookAt(0,0,0);
    const pass=createPrintPass(renderer);
    const pixels=new Uint8Array(SIZE*SIZE*4);
    const draw=params=>{
      retroStyle.setPreset('day');Object.assign(retroStyle.params,{look:'comic'},params);retroStyle.sync();
      pass.render(scene,camera,{samples:0});
      const gl=renderer.getContext();gl.readPixels(0,0,SIZE,SIZE,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      return pixels.slice();
    };
    const stats=image=>{
      let spread=0,printed=0,mid=0;
      for(let i=0;i<image.length;i+=4){
        const [r,g,b]=[image[i],image[i+1],image[i+2]];
        spread=Math.max(spread,Math.abs(r-g),Math.abs(g-b));
        if(r===255&&g===255&&b===255)continue;
        printed++;const gray=(r+g+b)/3;if(gray>45&&gray<210)mid++;
      }
      return {spread,printed,mid:mid/Math.max(printed,1)};
    };
    // Everything on that could add color: outline, misregistration, halo, grade, split tone.
    const loud={outlineOn:true,outlineOpacity:1,outlineTint:1,misreg:3,misregEdge:3,bgOn:true,bgOpacity:1,bgCoverage:.6,bgReach:60,gradeSaturation:1.6,splitAmount:1};
    const color=draw({...loud,look:'comic'});
    const mono=draw({...loud,look:'mono'});
    // Dim light spreads the faces over the lightness range, so the grayscale has something to show.
    ambient.intensity=.35;sun.intensity=.9;
    const twoTone=draw({outlineOn:false,misreg:0,misregEdge:0,bgOn:false,look:'mono',monoDetail:0,monoPattern:0});
    const ramp=draw({outlineOn:false,misreg:0,misregEdge:0,bgOn:false,look:'mono',monoDetail:1,monoPattern:0});
    const corner=image=>Array.from(image.slice(0,4));
    const out={color:stats(color),mono:stats(mono),twoTone:stats(twoTone),ramp:stats(ramp),cornerMono:corner(mono),cornerTwoTone:corner(twoTone)};
    pass.dispose();renderer.dispose();return out;
  });
  expect(result.color.spread).toBeGreaterThan(40);
  expect(result.mono.spread).toBeLessThanOrEqual(6);
  expect(result.cornerMono).toEqual([255,255,255,255]);expect(result.cornerTwoTone).toEqual([255,255,255,255]);
  expect(result.twoTone.printed).toBeGreaterThan(500);
  expect(result.twoTone.mid).toBeLessThan(.15);
  expect(result.ramp.mid).toBeGreaterThan(result.twoTone.mid);
  expect(errors).toEqual([]);
});

// The Normal look is the print as it was before the comic shader: the plain developed
// frame, with none of the comic stages, whatever their parameters say.
test('Normal look: plain developed frame on exact paper, no comic stage, and unlike the comic look',async({page})=>{
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
    const SIZE=256;
    const renderer=new THREE.WebGLRenderer({preserveDrawingBuffer:true,alpha:true,antialias:false});
    renderer.setPixelRatio(1);renderer.setSize(SIZE,SIZE,false);renderer.toneMapping=THREE.ACESFilmicToneMapping;
    const scene=new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff,1.2));const sun=new THREE.DirectionalLight(0xffe0b0,3);sun.position.set(3,6,2);scene.add(sun);
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1.2,1.2,1.2),retro(0xd06040)));
    const camera=new THREE.OrthographicCamera(-2,2,2,-2,.1,20);camera.position.set(4,4,4);camera.lookAt(0,0,0);
    const pass=createPrintPass(renderer);
    const pixels=new Uint8Array(SIZE*SIZE*4);
    const draw=params=>{
      retroStyle.setPreset('day');Object.assign(retroStyle.params,params);retroStyle.sync();
      pass.render(scene,camera,{samples:0});
      const gl=renderer.getContext();gl.readPixels(0,0,SIZE,SIZE,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      return pixels.slice();
    };
    const differing=(a,b)=>{let count=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>6)count++;return count;};
    // Every comic stage at full strength: in Normal none of it may show.
    const loud={outlineOn:true,outlineOpacity:1,misreg:4,misregEdge:4,bgOn:true,bgOpacity:1,bgCoverage:.6,bgReach:60,gradeSaturation:1.8,splitAmount:1,inkGrain:.1,paperGrain:.1};
    const quiet={outlineOn:false,misreg:0,misregEdge:0,bgOn:false,gradeSaturation:1,gradeContrast:1,splitAmount:0,inkGrain:0,paperGrain:0};
    const normalLoud=draw({...loud,look:'normal'});
    const normalQuiet=draw({...quiet,look:'normal'});
    const classic=retroStyle.uniforms.retroClassic.value;
    const comic=draw({...loud,look:'comic'});
    const out={sameInNormal:differing(normalLoud,normalQuiet),comicDiffers:differing(normalLoud,comic),
      corner:Array.from(normalLoud.slice(0,4)),classic,programs:renderer.info.programs.length};
    draw({...quiet,look:'comic'});out.comicClassic=retroStyle.uniforms.retroClassic.value;out.programsAfter=renderer.info.programs.length;
    pass.dispose();renderer.dispose();return out;
  });
  expect(result.classic).toBe(1);expect(result.comicClassic).toBe(0);
  expect(result.sameInNormal).toBe(0);
  expect(result.comicDiffers).toBeGreaterThan(500);
  expect(result.corner).toEqual([255,255,255,255]);
  // Switching looks never compiles anything new.
  expect(result.programsAfter).toBe(result.programs);
  expect(errors).toEqual([]);
});
