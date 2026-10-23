import {test,expect} from '@playwright/test';
import {enter,act,target} from './helpers.js';
import * as THREE from 'three';
import {createFootstepSurface} from '../src/footstep-surface.js';
test('footstep surface follows the circular rug, its transform and visibility',()=>{
  const room=new THREE.Group(),rug=new THREE.Mesh(new THREE.CylinderGeometry(1.3,1.3,.035,40),new THREE.MeshBasicMaterial());
  room.add(rug);rug.position.set(.25,.108,.5);
  const surface=createFootstepSurface(new Map([['rug',{id:'rug',object:rug}]]));
  const point=(x,z)=>new THREE.Vector3(x,.12,z);
  expect(surface(point(.25,.5))).toBe('carpet');
  expect(surface(point(1.4,1.65))).toBe('wood'); // Outside circle, inside bounding square.
  rug.position.x=2;rug.scale.set(.5,1,1);rug.rotation.y=Math.PI/2;
  expect(surface(point(.25,.5))).toBe('wood');
  expect(surface(point(2,.5))).toBe('carpet');
  expect(surface(point(2,1.3))).toBe('wood');
  rug.visible=false;expect(surface(point(2,.5))).toBe('wood');
  rug.visible=true;room.visible=false;expect(surface(point(2,.5))).toBe('wood');
});

// Observe real decoded assets and Web Audio sources, including their gains.
async function observeAudio(page) {
  await page.addInitScript(()=>{
    const names=new WeakMap(),fetchOriginal=window.fetch;
    window.audioSources=[];window.audioRequests=[];
    window.fetch=async (...args)=>{
      const response=await fetchOriginal(...args);
      if(String(args[0]).includes('/audio/scene/')){
        const name=String(args[0]).split('/').pop().replace(/\.(mp3|wav)$/,'');
        window.audioRequests.push(name);
        const read=response.arrayBuffer.bind(response);
        response.arrayBuffer=async ()=>{const bytes=await read();names.set(bytes,name);return bytes;};
      }
      return response;
    };
    const decode=AudioContext.prototype.decodeAudioData;
    AudioContext.prototype.decodeAudioData=async function(bytes){
      const buffer=await decode.call(this,bytes);buffer.clip=names.get(bytes);return buffer;
    };
    const create=AudioContext.prototype.createBufferSource;
    const createGain=AudioContext.prototype.createGain;
    AudioContext.prototype.createGain=function(){
      const gain=createGain.call(this),connect=gain.connect.bind(gain);
      gain.connect=node=>{gain.destinationGain=node;return connect(node);};return gain;
    };
    AudioContext.prototype.createBufferSource=function(){
      const source=create.call(this),start=source.start.bind(source),stop=source.stop.bind(source),connect=source.connect.bind(source);
      source.addEventListener('ended',()=>{source.finished=true;});
      source.connect=(gain)=>{source.observedGain=gain;return connect(gain);};
      source.start=(...args)=>{window.audioSources.push(source);return start(...args);};
      source.stop=(...args)=>{if(!args[0]||args[0]<=this.currentTime)source.stopped=true;return stop(...args);};
      return source;
    };
  });
}

async function harness(page,{waitForLoad=true}={}) {
  await observeAudio(page);
  await page.route('**/audio-harness',route=>route.fulfill({contentType:'text/html',body:'<button>Start</button>'}));
  await page.goto('/audio-harness');
  await page.evaluate(async ()=>{
    const {createSceneAudio}=await import('/src/scene-audio.js');
    window.engine=createSceneAudio();
    document.querySelector('button').onclick=()=>{
      window.ctx=new AudioContext();window.ctx.resume();window.engine.setEnabled(true);
      // Browser audio rendering can lag wall timers under software WebGL load.
      window.waitAudio=async seconds=>{const end=window.ctx.currentTime+seconds;while(window.ctx.currentTime<end)await new Promise(resolve=>setTimeout(resolve,10));};
      window.loaded=window.engine.connect(window.ctx);
    };
  });
  await page.getByRole('button').click();
  if(waitForLoad)await page.evaluate(()=>window.loaded);
}

test('retired ambience stays removed; footsteps follow the surface; mute stops sources',async ({page})=>{
  await harness(page);
  const mix=async options=>page.evaluate(options=>window.engine.update(options),options);
  await mix({blinds:1});
  expect(await page.evaluate(()=>window.audioSources)).toEqual([]);
  expect(await page.evaluate(()=>window.audioRequests.some(id=>['breeze','leaves','birds','crickets'].includes(id)))).toBe(false);
  await mix({stepDistance:.3,surface:'wood'});await mix({stepDistance:.3,surface:'carpet'});
  const steps=await page.evaluate(()=>window.audioSources.map(s=>({clip:s.buffer.clip,volume:s.observedGain.gain.value})));
  expect(steps[0].clip).toMatch(/^footstep-[1-4]$/);
  expect(steps[1].clip).toMatch(/^footstep-carpet-[1-4]$/);
  expect(steps[1].volume).toBeLessThan(steps[0].volume);
  await mix({airborne:true,stepDistance:.4});
  expect(await page.evaluate(()=>window.audioSources.map(s=>s.buffer.clip))).toEqual([steps[0].clip,steps[1].clip,'jump-whoosh']);
  await mix({typing:true,watering:true});
  await page.evaluate(()=>{window.engine.setEnabled(false);window.engine.play('interaction');});
  expect(await page.evaluate(()=>window.audioSources.every(s=>s.stopped))).toBe(true);
  await page.evaluate(()=>{window.engine.setEnabled(true);window.engine.update({typing:true});Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  expect(await page.evaluate(()=>window.audioSources.every(s=>s.stopped))).toBe(true);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));window.engine.update({});});
  expect(await page.evaluate(()=>window.audioSources.filter(s=>!s.stopped).map(s=>s.buffer.clip))).toEqual([]);
});

test('forest ambience follows daylight, blinds and music; preview is isolated',async ({page})=>{
  await harness(page);
  await page.evaluate(()=>window.engine.update({}));
  expect(await page.evaluate(()=>window.audioSources.length)).toBe(0);
  await page.evaluate(async ()=>{window.engine.update({daylight:1});await window.waitAudio(2);});
  expect(await page.evaluate(()=>window.audioSources.map(s=>s.buffer.clip))).toEqual(['day-forest']);
  expect(await page.evaluate(()=>window.audioSources[0].loop)).toBe(true);
  const full=await page.evaluate(()=>window.audioSources[0].observedGain.gain.value);
  expect(full).toBeCloseTo(.22,2);
  await page.evaluate(async ()=>{window.engine.update({daylight:1,blinds:1});await window.waitAudio(2);});
  expect(await page.evaluate(()=>window.audioSources[0].observedGain.gain.value)).toBeCloseTo(.22*.28,2);
  await page.evaluate(async ()=>{window.engine.update({daylight:1,disco:true});await window.waitAudio(2);});
  expect(await page.evaluate(()=>window.audioSources[0].observedGain.gain.value)).toBeCloseTo(.22*.25,2);
  await page.evaluate(async ()=>{window.engine.update({daylight:0});await window.waitAudio(3);});
  expect(await page.evaluate(()=>window.audioSources[0].observedGain.gain.value)).toBeLessThan(.001);
  await page.evaluate(()=>{window.engine.preview('day-forest');window.engine.update({typing:true,daylight:1});});
  expect(await page.evaluate(()=>window.audioSources.filter(s=>!s.stopped&&!s.finished).map(s=>s.buffer.clip))).toEqual(['day-forest']);
  await page.evaluate(()=>window.engine.setMix({master:1,channels:{'day-forest':0}}));
  await page.evaluate(()=>window.waitAudio(.2));
  expect(await page.evaluate(()=>window.audioSources.at(-1).observedGain.destinationGain.gain.value)).toBeLessThan(.001);
  await page.evaluate(()=>{window.engine.setEnabled(false);window.engine.update({daylight:1});});
  expect(await page.evaluate(()=>window.audioSources.every(s=>s.stopped))).toBe(true);
});

test('night forest fades into day, responds to blinds/music and has independent controls',async ({page})=>{
  await harness(page);
  const levels=()=>page.evaluate(()=>Object.fromEntries(window.audioSources.filter(s=>s.loop&&!s.stopped).map(s=>[s.buffer.clip,s.observedGain.gain.value])));
  await page.evaluate(async ()=>{window.engine.update({daylight:0});await window.waitAudio(2);});
  expect(await page.evaluate(()=>window.audioSources.map(s=>s.buffer.clip))).toEqual(['night-forest']);
  expect((await levels())['night-forest']).toBeCloseTo(.22,2);
  await page.evaluate(async ()=>{window.engine.update({daylight:0,blinds:1,disco:true});await window.waitAudio(2);});
  expect((await levels())['night-forest']).toBeCloseTo(.22*.28*.25,2);
  await page.evaluate(async ()=>{window.engine.update({daylight:.5});await window.waitAudio(2);});
  expect((await levels())['night-forest']).toBeCloseTo(.11,2);
  expect((await levels())['day-forest']).toBeCloseTo(.11,2);
  await page.evaluate(async ()=>{window.engine.update({daylight:1});await window.waitAudio(3);});
  expect((await levels())['night-forest']).toBeLessThan(.001);
  expect((await levels())['day-forest']).toBeCloseTo(.22,2);
  await page.evaluate(()=>{window.engine.preview('night-forest');window.engine.update({typing:true,daylight:1});});
  expect(await page.evaluate(()=>window.audioSources.filter(s=>!s.stopped&&!s.finished).map(s=>s.buffer.clip))).toEqual(['night-forest']);
  await page.evaluate(async ()=>{window.engine.setMix({master:1,channels:{'night-forest':0}});await window.waitAudio(.2);});
  expect(await page.evaluate(()=>window.audioSources.at(-1).observedGain.destinationGain.gain.value)).toBeLessThan(.001);
  await page.evaluate(()=>{window.engine.setEnabled(false);window.engine.update({daylight:0});});
  expect(await page.evaluate(()=>window.audioSources.every(s=>s.stopped))).toBe(true);
});

test('walking uses all four takes per surface without repeats across rounds',async ({page})=>{
  await harness(page);
  await page.evaluate(async ()=>{
    window.engine.setMix({master:.5,channels:{footstep:.4,'footstep-carpet':.2}});
    for(const surface of ['wood','carpet'])for(let i=0;i<12;i++){
      window.engine.update({stepDistance:.3,surface});
      await window.waitAudio(.18);
    }
  });
  const samples=await page.evaluate(()=>window.audioSources.map(s=>({clip:s.buffer.clip,loop:s.loop,channel:s.observedGain.destinationGain.gain.value})));
  expect(samples).toHaveLength(24);
  for(const [offset,prefix,level] of [[0,'footstep',.4],[12,'footstep-carpet',.2]]){
    const takes=samples.slice(offset,offset+12);
    for(let round=0;round<3;round++)expect(takes.slice(round*4,round*4+4).map(s=>s.clip).sort()).toEqual([1,2,3,4].map(n=>`${prefix}-${n}`));
    for(let i=1;i<takes.length;i++)expect(takes[i].clip).not.toBe(takes[i-1].clip);
    expect(takes.every(s=>!s.loop&&Math.abs(s.channel-level)<.001)).toBe(true);
  }
});

test('footstep preview plays four separate takes and closing cancels the sequence',async ({page})=>{
  await harness(page);
  await page.evaluate(()=>{window.previewDone=0;window.engine.preview('footstep',()=>window.previewDone++);});
  await expect.poll(()=>page.evaluate(()=>window.previewDone)).toBe(1);
  expect(await page.evaluate(()=>window.audioSources.map(s=>s.buffer.clip))).toEqual([1,2,3,4].map(n=>`footstep-${n}`));
  await page.evaluate(()=>{window.engine.stopPreview();window.audioSources=[];window.engine.preview('footstep-carpet',()=>window.previewDone++);window.engine.stopPreview();});
  await page.waitForTimeout(700);
  expect(await page.evaluate(()=>window.audioSources.map(s=>s.buffer.clip))).toEqual(['footstep-carpet-1']);
  expect(await page.evaluate(()=>window.previewDone)).toBe(1);
});

test('missing footstep take falls back to the available variants',async ({page})=>{
  await page.route('**/audio/scene/footstep-2.mp3',route=>route.fulfill({status:404}));
  await harness(page);
  await page.evaluate(async ()=>{
    for(let i=0;i<6;i++){window.engine.update({stepDistance:.3});await window.waitAudio(.18);}
  });
  const samples=await page.evaluate(()=>window.audioSources.map(s=>s.buffer.clip));
  expect(samples.slice(0,3).sort()).toEqual(['footstep-1','footstep-3','footstep-4']);
  expect(samples.slice(3).sort()).toEqual(['footstep-1','footstep-3','footstep-4']);
});

test('landing on the carpet is softer than landing on wood',async ({page})=>{
  await harness(page);
  await page.evaluate(async ()=>{
    for(const surface of ['wood','carpet']){
      window.engine.update({airborne:true,surface});
      window.engine.update({airborne:false,surface});
      await window.waitAudio(.18);
    }
  });
  const impacts=await page.evaluate(()=>window.audioSources.filter(s=>s.buffer.clip==='jump-land').map(s=>s.observedGain.gain.value));
  expect(impacts).toHaveLength(2);
  expect(impacts[1]/impacts[0]).toBeCloseTo(.68,2);
});

test('mixer changes active channel gains and preview isolation cancels cleanly',async ({page})=>{
  await harness(page);
  await page.evaluate(()=>{window.engine.update({typing:true,watering:true});window.engine.setMix({master:.5,channels:{typing:0,watering:.4}});});
  await page.evaluate(()=>window.waitAudio(.18));
  const values=await page.evaluate(()=>window.audioSources.map(s=>({clip:s.buffer.clip,channel:s.observedGain.destinationGain.gain.value,master:s.observedGain.destinationGain.destinationGain.gain.value})));
  expect(values.find(v=>v.clip==='typing').channel).toBeLessThan(.001);
  expect(values.find(v=>v.clip==='watering').channel).toBeCloseTo(.4,2);
  expect(values.every(v=>v.master===.5)).toBe(true);
  await page.evaluate(()=>{window.engine.preview('watering');window.engine.update({typing:true});window.engine.play('jump');});
  expect(await page.evaluate(()=>window.audioSources.filter(s=>!s.stopped&&!s.finished).map(s=>s.buffer.clip))).toEqual(['watering']);
  await page.evaluate(()=>{window.engine.stopPreview();window.engine.update({});});
  expect(await page.evaluate(()=>window.audioSources.filter(s=>!s.stopped&&!s.finished).map(s=>s.buffer.clip))).toEqual([]);
});

test('muting during loading never plays a stale action; missing clips do not break playback',async ({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  await page.route('**/audio/scene/jump-whoosh.mp3',async route=>{await gate;await route.continue();});
  await page.route('**/audio/scene/watering.mp3',route=>route.fulfill({status:404}));
  await harness(page,{waitForLoad:false});
  await page.evaluate(()=>{
    window.engine.setEnabled(false);window.engine.play('jump');window.engine.update({watering:true});
  });
  release();await page.evaluate(()=>window.loaded);
  expect(await page.evaluate(()=>window.audioSources.length)).toBe(0);
  await page.evaluate(()=>{window.engine.setEnabled(true);window.engine.update({watering:true});});
  expect(await page.evaluate(()=>window.audioSources.map(s=>s.buffer.clip))).toEqual([]);
  expect(errors).toEqual([]);
});

test('room audio starts enabled, objects play their effects, and explicit mute survives the disco',async ({page})=>{
  test.setTimeout(90000);
  // Headless Chromium may allow autoplay regardless of its policy flag.
  // Simulate the browser's suspended context until a real user gesture.
  await page.addInitScript(()=>{
    const NativeAudioContext=window.AudioContext;
    let interacted=false;
    for(const event of ['pointerdown','pointerup','keydown'])document.addEventListener(event,event=>{if(event.isTrusted)interacted=true;},{capture:true});
    window.AudioContext=class extends NativeAudioContext {
      constructor(...args){super(...args);this.suspend();}
      resume(){return interacted?super.resume():new Promise(()=>{});}
    };
  });
  await page.addInitScript(()=>localStorage.setItem('zud-audio-mix-v2',JSON.stringify({master:0,channels:{'day-forest':{volume:0,muted:true}}})));
  await observeAudio(page);
  await page.emulateMedia({reducedMotion:'reduce'});
  await enter(page);
  await expect(page.locator('#audio-mixer-toggle, #audio-mixer')).toHaveCount(0);
  const toggle=page.locator('#sound-toggle');
  await expect(toggle).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#stage')).toHaveAttribute('data-audio-status','ready');
  expect(await page.evaluate(()=>window.audioSources.length)).toBe(0);
  await page.locator('#zud-canvas').focus();await page.keyboard.press('Shift');
  await expect.poll(()=>page.evaluate(()=>window.audioSources.some(s=>s.buffer.clip==='day-forest'))).toBe(true);
  await expect(page.locator('#stage')).toHaveAttribute('data-audio-status','ready');
  await expect(page.locator('#stage')).toHaveAttribute('data-activity','idle');
  expect(await page.evaluate(()=>new Set(window.audioRequests).size)).toBe(18);
  const dayMix=await page.evaluate(()=>{const gain=window.audioSources.find(s=>s.buffer.clip==='day-forest').observedGain.destinationGain;return {channel:gain.gain.value,master:gain.destinationGain.gain.value};});
  expect(dayMix.channel).toBeCloseTo(.32,3);expect(dayMix.master).toBe(1);
  const point=await target(page,'blinds');await page.mouse.click(point.x,point.y);
  await expect.poll(()=>page.evaluate(()=>window.audioSources.some(s=>s.buffer.clip==='blinds-cord'))).toBe(true);
  const plant=await target(page,'water');await page.mouse.click(plant.x,plant.y);
  await expect.poll(()=>page.evaluate(()=>window.audioSources.some(s=>s.buffer.clip==='watering'))).toBe(true);
  await act(page,'work');
  await expect.poll(()=>page.evaluate(()=>window.audioSources.some(s=>s.buffer.clip==='typing'))).toBe(true);
  await page.keyboard.press('Escape');
  await toggle.click();await act(page,'disco');
  await expect(toggle).toHaveAttribute('aria-pressed','false');
  expect(await page.locator('#dance-audio').evaluate(audio=>audio.muted)).toBe(true);
  expect(await page.evaluate(()=>window.audioSources.every(s=>s.stopped||s.finished))).toBe(true);
  await page.setViewportSize({width:390,height:844});
  await expect(toggle).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({path:'.context/scene-audio-mobile.png'});
  await page.setViewportSize({width:1440,height:1050});
  await page.keyboard.press('Escape');
  await toggle.click();
  await page.screenshot({path:'.context/scene-audio.png'});
});
