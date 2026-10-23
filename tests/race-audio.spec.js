import {test,expect} from '@playwright/test';
import {launchFromLobby} from './helpers/flight.js';

// Observe real Web Audio output, including the master mute, without exposing
// production debug controls or relying on a speaker attached to the test runner.
async function observeAudio(page){
  await page.addInitScript(()=>{
    const NativeAudioContext=window.AudioContext;
    window.__audioContexts=[];
    window.AudioContext=class extends NativeAudioContext{
      constructor(options){super(options);window.__audioContexts.push(this);this.oscillators=[];this.output=this.createAnalyser();this.output.fftSize=2048;}
      createOscillator(){const node=super.createOscillator();this.oscillators.push(node);return node;}
      createDynamicsCompressor(){const node=super.createDynamicsCompressor();node.connect(this.output);return node;}
    };
    window.__audioRms=()=>{const context=window.__audioContexts[0];if(!context)return 0;const samples=new Float32Array(context.output.fftSize);context.output.getFloatTimeDomainData(samples);return Math.sqrt(samples.reduce((sum,s)=>sum+s*s,0)/samples.length);};
  });
}

const status=page=>page.evaluate(async()=> {const url=performance.getEntriesByType('resource').find(entry=>/\/src\/race-audio.js(?:\?|$)/.test(entry.name)).name;return (await import(url)).raceAudio.status;});
const rms=page=>page.evaluate(()=>window.__audioRms());

test('race audio unlocks on launch, follows speed, pauses, mutes and remembers the setting',async({page})=>{
  test.setTimeout(120000);await page.setViewportSize({width:960,height:640});await observeAudio(page);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/simulator.html');
  await expect(page).toHaveTitle('Biggas Hover Racing');expect((await status(page)).context).toBe('uninitialized');
  await launchFromLobby(page,{mode:'race'});const app=page.locator('.flight-app');
  await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});
  await expect.poll(async()=>(await status(page)).context).toBe('running');
  await expect(app).toHaveAttribute('data-phase','flying',{timeout:15000});
  await expect.poll(()=>rms(page)).toBeGreaterThan(.005);
  const idle=await page.evaluate(()=>window.__audioContexts[0].oscillators[0].frequency.value);
  await page.keyboard.down('ShiftLeft');
  await expect.poll(()=>page.evaluate(()=>window.__audioContexts[0].oscillators[0].frequency.value)).toBeGreaterThan(idle+30);
  await page.keyboard.up('ShiftLeft');await page.keyboard.press('Escape');
  await expect(app).toHaveAttribute('data-phase','paused');await expect.poll(()=>rms(page)).toBeLessThan(.0001);
  await page.getByRole('button',{name:'Continuar',exact:true}).click();await expect.poll(()=>rms(page)).toBeGreaterThan(.005);
  await page.keyboard.press('KeyM');await expect(page.getByRole('button',{name:'Sonido',exact:true})).toHaveAttribute('data-muted','true');await expect.poll(()=>rms(page)).toBeLessThan(.0001);
  await page.getByRole('button',{name:'Sonido',exact:true}).click();await page.getByRole('button',{name:'Activar sonido',exact:true}).click();await page.keyboard.press('Escape');await expect.poll(()=>rms(page)).toBeGreaterThan(.005);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await expect(app).toHaveAttribute('data-phase','paused');await expect.poll(()=>rms(page)).toBeLessThan(.0001);
  await page.setViewportSize({width:320,height:640});
  const controls=await page.locator('.flight-header button:visible,.flight-header a:visible').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom};}));
  for(const rect of controls){expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.right).toBeLessThanOrEqual(320);expect(rect.bottom).toBeLessThanOrEqual(640);}
  await page.getByRole('button',{name:'Sonido',exact:true}).click();await page.getByRole('button',{name:'Silenciar todo',exact:true}).click();await page.reload();
  expect((await status(page)).enabled).toBe(false);expect((await status(page)).context).toBe('uninitialized');
  await launchFromLobby(page);await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});
  await expect(page.getByRole('button',{name:'Sonido',exact:true})).toHaveAttribute('data-muted','true');expect((await status(page)).context).toBe('uninitialized');
  await page.getByRole('button',{name:'Sonido',exact:true}).click();await page.getByRole('button',{name:'Activar sonido',exact:true}).click();await page.keyboard.press('Escape');await expect.poll(()=>rms(page)).toBeGreaterThan(.005);
  expect(errors).toEqual([]);
});

test('cues generate output, repeated impacts stay bounded and disposing closes audio',async({page})=>{
  await observeAudio(page);await page.goto('/simulator.html');
  // Keep the lightweight title screen; exercise cues independently of 3D loading.
  await page.evaluate(async()=>{const url=performance.getEntriesByType('resource').find(entry=>/\/src\/race-audio.js(?:\?|$)/.test(entry.name)).name;window.audio=(await import(url)).raceAudio;const button=document.createElement('button');button.textContent='Audio test';button.style='position:fixed;inset:0 auto auto 0;z-index:100';button.onclick=()=>{window.audio.unlock();window.audio.setPhase('finished');};document.body.append(button);});
  await page.getByRole('button',{name:'Audio test',exact:true}).click();
  await expect.poll(async()=>(await status(page)).context).toBe('running');
  await page.evaluate(()=>window.audio.cue('finish'));await expect.poll(()=>rms(page)).toBeGreaterThan(.001);
  await page.waitForTimeout(1300);expect(await rms(page)).toBeLessThan(.0001);expect((await status(page)).voices).toBe(0);
  const result=await page.evaluate(()=>{window.audio.setPhase('flying');for(let i=0;i<100;i++)window.audio.cue('impact',14);return window.audio.status;});
  expect(result.voices).toBe(2);expect(result.lastCue).toBe('impact');
  await page.evaluate(()=>window.audio.setPhase('paused'));expect((await status(page)).voices).toBe(0);await expect.poll(()=>rms(page)).toBeLessThan(.0001);
  await page.evaluate(()=>{window.audio.cue('checkpoint');window.audio.dispose();window.audio.dispose();});
  await expect.poll(async()=>(await status(page)).context).toBe('closed');expect((await status(page)).voices).toBe(0);
});
