import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
  await page.route('**/ambient-test',r=>r.fulfill({contentType:'text/html',body:'<button id="start">Iniciar audio</button>'}));await page.goto('/ambient-test');
});

test('water, forest and train produce distinct bounded sound; the gallery returns a short echo',async({page})=>{
  const result=await page.evaluate(async()=>{
    const {createBiggasAmbience}=await import('/src/biggas-city-audio.js');
    async function render(environment,active=true,engineSound=false){
      const context=new OfflineAudioContext(1,24000,48000),master=context.createGain(),engine=context.createGain(),noise=context.createBuffer(1,48000,48000);master.connect(context.destination);
      const samples=noise.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=Math.sin(i*79.73)*Math.cos(i*13.45);
      const ambient=createBiggasAmbience(context,master,engine,noise);ambient.update(environment);ambient.setActive(active);
      if(engineSound){const source=context.createOscillator();source.frequency.value=220;source.connect(engine);source.start();source.stop(.04);}
      const output=(await context.startRendering()).getChannelData(0),rms=Math.sqrt(output.slice(9600).reduce((n,v)=>n+v*v,0)/(output.length-9600));ambient.dispose();return rms;
    }
    return {water:await render({falls:1}),forest:await render({wind:1}),train:await render({train:1}),remote:await render({}),paused:await render({falls:1,wind:1,train:1},false),echo:await render({gallery:1},true,true)};
  });
  for(const zone of ['water','forest','train','echo']){expect(result[zone]).toBeGreaterThan(.0005);expect(result[zone]).toBeLessThan(.15);}
  expect(result.remote).toBe(0);expect(result.paused).toBe(0);expect(result.water).not.toBeCloseTo(result.forest,3);
});

test('ambient sound uses gesture unlock, master mute, pause and audio cleanup',async({page})=>{
  await page.evaluate(async()=>{
    const Native=window.AudioContext;window.AudioContext=class extends Native{constructor(...args){super(...args);window.ctx=this;this.analyser=this.createAnalyser();}createDynamicsCompressor(){const n=super.createDynamicsCompressor();n.connect(this.analyser);return n;}};
    const {createRaceAudio}=await import('/src/race-audio.js');window.audio=createRaceAudio();
    window.rms=()=>{const a=new Float32Array(ctx.analyser.fftSize);ctx.analyser.getFloatTimeDomainData(a);return Math.sqrt(a.reduce((n,v)=>n+v*v,0)/a.length);};
    document.querySelector('#start').onclick=()=>{audio.unlock();audio.setPhase('flying');audio.update({speed:20,throttle:20},{falls:.8,wind:.2,gallery:1,train:0});};
  });
  expect(await page.evaluate(()=>audio.status.context)).toBe('uninitialized');await page.click('#start');await expect.poll(()=>page.evaluate(()=>audio.status.context)).toBe('running');
  expect(await page.evaluate(()=>audio.status.ambience.falls)).toBe(.8);await expect.poll(()=>page.evaluate(()=>rms())).toBeGreaterThan(.002);
  await page.evaluate(()=>audio.setPhase('paused'));await expect.poll(()=>page.evaluate(()=>rms())).toBeLessThan(.0001);
  await page.evaluate(()=>{audio.setPhase('flying');audio.setEnabled(false);});await expect.poll(()=>page.evaluate(()=>rms())).toBeLessThan(.0001);
  await page.evaluate(()=>{audio.setEnabled(true);audio.update({speed:20,throttle:20},{wind:1});});await expect.poll(()=>page.evaluate(()=>rms())).toBeGreaterThan(.002);
  await page.evaluate(()=>audio.dispose());await expect.poll(()=>page.evaluate(()=>audio.status.context)).toBe('closed');expect(await page.evaluate(()=>audio.status.ambience)).toBeNull();
});
