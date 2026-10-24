import {openFlightOptions} from './helpers/flight.js';
import {test,expect} from '@playwright/test';

function tone(){
  const rate=8000,length=rate*3,data=Buffer.alloc(44+length*2);
  data.write('RIFF',0);data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*2,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(length*2,40);
  for(let i=0;i<length;i++)data.writeInt16LE(Math.round(Math.sin(i/rate*2*Math.PI*220)*1200),44+i*2);
  return data;
}

async function fixture(page){
  await page.route('**/__music-test/*.wav',route=>route.fulfill({contentType:'audio/wav',body:tone()}));
  await page.goto('/simulator.html');
  await page.evaluate(async()=>{
    const {createGameMusic}=await import('/src/game-music.js');window.players=[];
    window.music=createGameMusic({tracks:{menu:{src:'/__music-test/menu.wav'},race:{src:'/__music-test/race.wav'}},createAudio:()=>{const audio=new Audio();window.players.push(audio);return audio;}});
    window.music.setPhase('lobby');
    const button=document.createElement('button');button.textContent='Play music test';button.style='position:fixed;inset:0 auto auto 0;z-index:100';button.onclick=()=>window.music.unlock();document.body.append(button);
  });
}

test('local soundtrack loops, switches with the game, preserves position and obeys mute/pause',async({page})=>{
  await fixture(page);expect(await page.evaluate(()=>window.players.length)).toBe(0);
  await page.getByRole('button',{name:'Play music test'}).click();
  await expect.poll(()=>page.evaluate(()=>window.music.state.status)).toBe('playing');
  await expect.poll(()=>page.evaluate(()=>window.players[0].currentTime)).toBeGreaterThan(.1);
  expect(await page.evaluate(()=>window.players[0].loop)).toBe(true);
  await page.evaluate(()=>window.music.setPhase('lobby'));expect(await page.evaluate(()=>window.players.length)).toBe(1);
  await page.evaluate(()=>window.music.setPhase('loading'));expect(await page.evaluate(()=>window.players[0].paused)).toBe(true);
  await page.evaluate(()=>window.music.setPhase('countdown'));await expect.poll(()=>page.evaluate(()=>window.music.state.status)).toBe('playing');
  expect(await page.evaluate(()=>window.players.map(audio=>audio.paused))).toEqual([true,false]);
  await expect.poll(()=>page.evaluate(()=>window.players[1].currentTime)).toBeGreaterThan(.15);
  await page.evaluate(()=>window.music.setPhase('paused'));const time=await page.evaluate(()=>window.players[1].currentTime);expect(time).toBeGreaterThan(0);
  await page.evaluate(()=>window.music.setPhase('flying'));await expect.poll(()=>page.evaluate(()=>window.players[1].currentTime)).toBeGreaterThan(time);
  await page.evaluate(()=>window.music.setEnabled(false));expect(await page.evaluate(()=>window.players.every(audio=>audio.paused))).toBe(true);
  await page.evaluate(()=>window.music.setEnabled(true));await expect.poll(()=>page.evaluate(()=>window.music.state.status)).toBe('playing');
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));expect(await page.evaluate(()=>window.players.every(audio=>audio.paused))).toBe(true);
  await page.evaluate(()=>{window.music.dispose();window.music.dispose();});expect(await page.evaluate(()=>window.players.every(audio=>audio.paused&&!audio.getAttribute('src')))).toBe(true);
});

test('blocked playback can retry and unavailable sources do not break the game',async({page})=>{
  await page.goto('/simulator.html');
  await page.evaluate(async()=>{
    const {createGameMusic}=await import('/src/game-music.js');let blocked=true;
    window.music=createGameMusic({tracks:{menu:{src:'/example.ogg'}},createAudio:()=>({preload:'',loop:false,volume:0,src:'',pause(){},addEventListener(){},removeAttribute(){},load(){},play(){if(blocked){blocked=false;return Promise.reject(new DOMException('Gesture required','NotAllowedError'));}return Promise.resolve();}})});
    window.music.setPhase('lobby');window.music.unlock();
  });
  await expect.poll(()=>page.evaluate(()=>window.music.state.status)).toBe('blocked');
  await page.evaluate(()=>window.music.unlock());await expect.poll(()=>page.evaluate(()=>window.music.state.status)).toBe('playing');
  await page.evaluate(()=>window.music.setPhase('flying'));expect(await page.evaluate(()=>window.music.state.status)).toBe('unavailable');
  await expect(page.getByRole('button',{name:'Jugar',exact:true})).toBeVisible();
  await page.evaluate(()=>window.music.dispose());
});

test('the downloaded soundtrack plays locally, loops and switches from selection to Nexus',async({page})=>{
  test.setTimeout(120000);await page.setViewportSize({width:960,height:640});
  const remote=[],errors=[];page.on('request',r=>{if(/youtube|googlevideo/.test(r.url()))remote.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{const NativeAudio=window.Audio;window.soundtrackPlayers=[];window.Audio=function(...args){const player=new NativeAudio(...args);window.soundtrackPlayers.push(player);return player;};});
  await page.goto('/simulator.html?map=nexus');expect(await page.evaluate(()=>window.soundtrackPlayers.length)).toBe(0);
  await page.getByRole('button',{name:'Jugar',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.soundtrackPlayers[0]?.currentTime??0)).toBeGreaterThan(.1);
  expect(await page.evaluate(()=>window.soundtrackPlayers[0].src)).toMatch(/audio\/biggas-menu\.mp3$/);
  expect(await page.evaluate(()=>window.soundtrackPlayers[0].duration)).toBeGreaterThan(90);
  await openFlightOptions(page);await page.getByRole('button',{name:'Sonido',exact:true}).click();
  const volume=page.getByRole('slider',{name:'Volumen de música'});
  await expect(volume).toHaveValue('32');
  await volume.fill('18');
  expect(await page.evaluate(()=>window.soundtrackPlayers[0].volume)).toBeCloseTo(.18);
  await volume.press('ArrowRight');await expect(volume).toHaveValue('19');
  await volume.press('Escape');
  await expect(page.locator('.race-lobby')).toHaveAttribute('data-stage','1');
  await page.evaluate(()=>{const player=window.soundtrackPlayers[0];player.currentTime=player.duration-.2;});
  await expect.poll(()=>page.evaluate(()=>window.soundtrackPlayers[0].currentTime)).toBeLessThan(2);
  await page.keyboard.press('KeyM');expect(await page.evaluate(()=>window.soundtrackPlayers[0].paused)).toBe(true);
  await expect(page.getByRole('button',{name:'Sonido',exact:true,includeHidden:true})).toHaveAttribute('data-muted','true');
  await page.keyboard.press('KeyM');await expect.poll(()=>page.evaluate(()=>window.soundtrackPlayers[0].paused)).toBe(false);
  await page.getByRole('button',{name:'Confirmar Zud',exact:true}).click();await page.getByRole('button',{name:'Confirmar nave',exact:true}).click();
  expect(await page.evaluate(()=>window.soundtrackPlayers.length)).toBe(1);
  await page.getByRole('button',{name:'Volar',exact:true}).click();await expect(page.locator('.flight-app')).toHaveAttribute('data-ready','true',{timeout:60000});
  await expect.poll(()=>page.evaluate(()=>window.soundtrackPlayers[1]?.currentTime??0)).toBeGreaterThan(.1);
  expect(await page.evaluate(()=>window.soundtrackPlayers[1].src)).toMatch(/audio\/biggas-race\.mp3$/);
  expect(await page.evaluate(()=>window.soundtrackPlayers[1].duration)).toBeGreaterThan(100);
  expect(await page.evaluate(()=>window.soundtrackPlayers[1].volume)).toBeCloseTo(.19);
  await openFlightOptions(page);await page.getByRole('button',{name:'Sonido',exact:true}).click();
  await expect(volume).toHaveValue('19');
  await volume.fill('0');
  expect(await page.evaluate(()=>window.soundtrackPlayers.every(p=>p.volume===0))).toBe(true);
  await volume.fill('65');await volume.press('Escape');await page.getByRole('button',{name:'Continuar',exact:true}).click();
  await expect(page.locator('.flight-app')).toHaveAttribute('data-phase','flying');
  expect(await page.evaluate(()=>window.soundtrackPlayers[0].paused)).toBe(true);
  await page.keyboard.press('Escape');expect(await page.evaluate(()=>window.soundtrackPlayers.every(p=>p.paused))).toBe(true);
  await page.getByRole('button',{name:'Continuar',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.soundtrackPlayers[1].paused)).toBe(false);
  await page.keyboard.press('KeyM');expect(await page.evaluate(()=>window.soundtrackPlayers.every(p=>p.paused))).toBe(true);
  await page.reload();await openFlightOptions(page);await page.getByRole('button',{name:'Sonido',exact:true}).click();
  await expect(volume).toHaveValue('65');
  await page.setViewportSize({width:320,height:640});
  const bounds=await page.locator('.sound-panel').boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(320);
  expect(bounds.y+bounds.height).toBeLessThanOrEqual(640);
  expect(remote).toEqual([]);expect(errors).toEqual([]);
});
