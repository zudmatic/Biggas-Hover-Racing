// Local foley and ElevenLabs assets; provenance lives beside the files.
import {SCENE_AUDIO_CHANNELS} from './audio-channels.js';
const CLIPS=SCENE_AUDIO_CHANNELS.flatMap(channel=>channel.variants??[channel.id]);
const CONFIG=Object.fromEntries(SCENE_AUDIO_CHANNELS.map(channel=>[channel.id,channel]));
const EVENTS={jump:['jump-whoosh'],blinds:['blinds-cord','blinds-slats'],interaction:['interaction-pop','interaction-chime']};

export function createSceneAudio({onStatus=()=>{}}={}) {
  let context,master,loading,enabled=false,distance=0,wasAirborne=false,previewing=false,previewSource,previewGain,previewTimer;
  let mix={master:1,channels:{}};
  const channels=new Map();
  const buffers=new Map(),loops=new Map(),shots=new Set(),lastPlayed=new Map();
  const sampleBags=new Map(),lastSample=new Map();
  const audible=()=>enabled&&!document.hidden&&context?.state==='running';

  function stop() {
    clearTimeout(previewTimer);
    if(previewSource){previewSource.onended=null;previewSource.stop();previewSource.disconnect();previewGain.disconnect();previewSource=null;previewGain=null;}
    for(const {source,gain} of loops.values()){source.stop();source.disconnect();gain.disconnect();}
    loops.clear();
    for(const source of shots)source.stop();
    shots.clear();lastPlayed.clear();distance=0;
  }
  function setEnabled(value) {
    enabled=value;
    if(master)master.gain.value=value?mix.master:0;
    if(!value){stop();previewing=false;}
  }
  function connect(audioContext) {
    if(loading)return loading;
    if(context)return buffers.size===CLIPS.length?Promise.resolve():load();
    context=audioContext;master=context.createGain();master.gain.value=enabled?mix.master:0;master.connect(context.destination);
    onStatus('loading');
    // Load when sound is enabled. Failed files can be retried on the next
    // activation without delaying any scene interaction.
    return load();
  }
  function load() {
    if(loading)return loading;
    loading=Promise.allSettled(CLIPS.filter(name=>!buffers.has(name)).map(async name=>{
      const response=await fetch(`${import.meta.env.BASE_URL}audio/scene/${CONFIG[name]?.file??`${name}.mp3`}`);
      if(!response.ok)throw new Error(`Audio ${response.status}: ${name}`);
      const buffer=await context.decodeAudioData(await response.arrayBuffer());
      buffers.set(name,buffer);
    })).then(()=>{
      onStatus(buffers.size===CLIPS.length?'ready':'partial');
    }).finally(()=>{loading=null;});
    return loading;
  }
  function play(name,{volume=.25,rate=1,cooldown=.12}={}) {
    if(EVENTS[name]){
      for(const id of EVENTS[name])play(id,{volume:CONFIG[id].volume*volume/({jump:.24,blinds:.3,interaction:.25}[name]),rate,cooldown});
      return;
    }
    if(previewing||!audible()||shots.size>=8)return;
    const now=context.currentTime;
    if(now-(lastPlayed.get(name)??-Infinity)<cooldown)return;
    const sample=chooseSample(name);
    if(!sample)return;
    lastPlayed.set(name,now);
    const source=context.createBufferSource(),gain=context.createGain();
    source.buffer=buffers.get(sample);source.playbackRate.value=rate;
    gain.gain.value=volume;source.connect(gain);gain.connect(channel(name));
    source.onended=()=>{shots.delete(source);source.disconnect();gain.disconnect();};
    shots.add(source);source.start();
  }
  function chooseSample(name) {
    const variants=CONFIG[name]?.variants;
    if(!variants)return buffers.has(name)?name:null;
    let bag=sampleBags.get(name);
    if(!bag?.length){
      bag=variants.filter(id=>buffers.has(id));
      for(let i=bag.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}
      // Every take plays once per round, with no repeat at the round boundary.
      if(bag.length>1&&bag[0]===lastSample.get(name))[bag[0],bag[1]]=[bag[1],bag[0]];
      sampleBags.set(name,bag);
    }
    const sample=bag.shift();if(sample)lastSample.set(name,sample);
    return sample;
  }
  function loop(name,volume,fade=.12) {
    if(!buffers.has(name))return;
    let track=loops.get(name);
    if(!track&&volume>.001){
      const source=context.createBufferSource(),gain=context.createGain();
      source.buffer=buffers.get(name);source.loop=true;gain.gain.value=0;
      source.connect(gain);gain.connect(channel(name));source.start();
      track={source,gain,target:0};loops.set(name,track);
    }
    if(track&&Math.abs(track.target-volume)>.001){
      track.gain.gain.setTargetAtTime(volume,context.currentTime,fade);track.target=volume;
    }
  }
  function update({daylight=null,blinds=0,disco=false,typing=false,watering=false,stepDistance=0,airborne=false,surface='wood'}={}) {
    // Track the physical state even while muted, so enabling sound mid-jump
    // does not replay a takeoff that happened in silence.
    const takeoff=airborne&&!wasAirborne,landing=!airborne&&wasAirborne;
    wasAirborne=airborne;
    if(!audible()||previewing)return;
    const outside=(1-Math.max(0,Math.min(1,blinds))*.72)*(disco?.25:1);
    const day=Number.isFinite(daylight)?Math.max(0,Math.min(1,daylight)):0;
    const night=Number.isFinite(daylight)?1-day:0;
    loop('day-forest',CONFIG['day-forest'].volume*day*outside,.4);
    loop('night-forest',CONFIG['night-forest'].volume*night*outside,.4);
    loop('typing',typing?CONFIG.typing.volume:0);loop('watering',watering?CONFIG.watering.volume:0);
    if(takeoff)play('jump',{volume:.24,cooldown:.2});
    if(landing)play('jump-land',{volume:CONFIG['jump-land'].volume*(surface==='carpet'?.68:1)});
    if(!airborne&&stepDistance>0){
      distance+=stepDistance;
      if(distance>=.28){
        distance%=.28;
        const name=surface==='carpet'?'footstep-carpet':'footstep';
        play(name,{volume:CONFIG[name].volume*(.94+Math.random()*.12),rate:.97+Math.random()*.06});
      }
    }else distance=0;
  }
  function channel(name) {
    if(!channels.has(name)){
      const gain=context.createGain();gain.gain.value=mix.channels[name]??1;
      gain.connect(master);channels.set(name,gain);
    }
    return channels.get(name);
  }
  function setMix(next) {
    mix=next;
    if(master)master.gain.value=enabled?mix.master:0;
    for(const [name,gain] of channels)gain.gain.setTargetAtTime(mix.channels[name]??1,context.currentTime,.02);
  }
  function stopPreview(){stop();previewing=false;}
  function preview(name,onEnd=()=>{}) {
    stop();previewing=true;
    // Music previews use the same isolation, with a separate player.
    if(!CONFIG[name])return true;
    const samples=(CONFIG[name].variants??[name]).filter(id=>buffers.has(id));
    if(!audible()||!samples.length)return false;
    function next(index){
      const source=context.createBufferSource(),gain=context.createGain();
      source.buffer=buffers.get(samples[index]);source.loop=Boolean(CONFIG[name].loop);
      gain.gain.value=CONFIG[name].volume;
      source.connect(gain);gain.connect(channel(name));previewSource=source;previewGain=gain;
      source.onended=()=>{
        source.disconnect();gain.disconnect();
        if(previewSource!==source)return;
        previewSource=null;previewGain=null;
        if(index+1<samples.length)previewTimer=setTimeout(()=>next(index+1),120);
        else onEnd();
      };
      source.start();if(source.loop)source.stop(context.currentTime+8);
    }
    next(0);
    return true;
  }
  const visibility=()=>{if(document.hidden)stop();};
  document.addEventListener('visibilitychange',visibility);
  window.addEventListener('pagehide',stop);
  return {connect,play,update,setEnabled,setMix,preview,stopPreview,
    dispose(){stop();master?.disconnect();for(const gain of channels.values())gain.disconnect();channels.clear();buffers.clear();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',stop);},
  };
}
