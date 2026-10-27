import {gameMusic} from './music-player';
// Procedural hovercraft sound: no downloads, and no audio context before a gesture.
const preferenceKey='biggas-hover-racing-sound';
const volumeKey='biggas-hover-racing-effects-volume';
const clamp=(value,min=0,max=1)=>Math.min(max,Math.max(min,value));
export const soundIcon='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4Z"/><path class="sound-waves" d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/><path class="sound-muted" d="m16 9 6 6m0-6-6 6"/></svg>';

export function createRaceAudio({music=null}={}){
  let context=null,master,engineBus,spatialBus,compressor,noise,hum,turbine,harmonic,air,boost,drift;
  let phase='loading',enabled=true,volume=1,disposed=false,lastImpact=-Infinity,lastCue='',lastCountdown=0;
  const loops=[],voices=new Set();
  const supported=typeof window!=='undefined'&&!!(window.AudioContext||window.webkitAudioContext);
  try{enabled=localStorage.getItem(preferenceKey)!=='off';}catch{}
  try{const saved=localStorage.getItem(volumeKey);if(saved!==null&&saved.trim()!==''&&Number.isFinite(Number(saved)))volume=clamp(Number(saved));}catch{}
  music?.setEnabled(enabled);
  const smooth=(param,value,time=.08)=>param.setTargetAtTime(value,context.currentTime,time);
  function gain(value,destination){const node=context.createGain();node.gain.value=value;node.connect(destination);return node;}
  function oscillator(type,frequency,volume,destination){
    const source=context.createOscillator(),level=gain(volume,destination);source.type=type;source.frequency.value=frequency;source.connect(level);source.start();loops.push(source);return {source,level};
  }
  function noiseLayer(type,frequency,q,volume){
    const source=context.createBufferSource(),filter=context.createBiquadFilter(),level=gain(volume,engineBus);
    source.buffer=noise;source.loop=true;filter.type=type;filter.frequency.value=frequency;filter.Q.value=q;
    source.connect(filter);filter.connect(level);source.start();loops.push(source);return {source,filter,level};
  }
  function initialize(){
    const AudioContext=window.AudioContext||window.webkitAudioContext;
    context=new AudioContext({latencyHint:'interactive'});
    compressor=context.createDynamicsCompressor();compressor.threshold.value=-16;compressor.knee.value=18;compressor.ratio.value=4;compressor.attack.value=.005;compressor.release.value=.15;
    compressor.connect(context.destination);master=gain(0,compressor);engineBus=gain(0,master);spatialBus=gain(0,master);
    noise=context.createBuffer(1,context.sampleRate*2,context.sampleRate);
    const samples=noise.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;
    hum=oscillator('triangle',48,.16,engineBus);
    const filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=380;filter.Q.value=.6;filter.connect(engineBus);
    turbine=oscillator('sawtooth',96,.035,filter);turbine.filter=filter;
    harmonic=oscillator('sine',144,.025,engineBus);
    air=noiseLayer('lowpass',600,.4,0);boost=noiseLayer('bandpass',1700,.7,0);drift=noiseLayer('bandpass',850,2,0);
    applyLevels();
  }
  function applyLevels(){
    if(!context||disposed)return;
    smooth(master.gain,enabled?.55*volume:0,.035);
    smooth(engineBus.gain,document.hidden?0:phase==='flying'||phase==='intro'?.85:phase==='countdown'?.35:0,.045);
    smooth(spatialBus.gain,!document.hidden&&phase==='flying'?1:0,.035);
  }
  function stopVoices(){
    for(const voice of voices){try{voice.source.stop();}catch{}voice.source.disconnect();voice.level.disconnect();}
    voices.clear();
  }
  function tone(frequency,duration,volume,{delay=0,end=frequency,type='sine',buffer=false}={}){
    if(voices.size>=20)return;
    const start=context.currentTime+delay,source=buffer?context.createBufferSource():context.createOscillator(),level=gain(0,master);
    if(buffer)source.buffer=noise;else{source.type=type;source.frequency.setValueAtTime(frequency,start);source.frequency.exponentialRampToValueAtTime(Math.max(20,end),start+duration);}
    level.gain.setValueAtTime(0,start);level.gain.linearRampToValueAtTime(volume,start+.008);level.gain.exponentialRampToValueAtTime(.0001,start+duration);
    source.connect(level);const voice={source,level};voices.add(voice);
    source.onended=()=>{source.disconnect();level.disconnect();voices.delete(voice);};source.start(start);source.stop(start+duration+.02);
  }
  return {
    get enabled(){return enabled;},
    get volume(){return volume;},
    // Spatial effects share this gesture-unlocked context and the master mute.
    get spatialOutput(){return context&&!disposed?{context,destination:spatialBus,active:enabled&&volume>0&&phase==='flying'&&!document.hidden&&context.state==='running'}:null;},
    setVolume(value){if(!Number.isFinite(value))return;volume=clamp(value);try{localStorage.setItem(volumeKey,String(volume));}catch{}applyLevels();},
    get supported(){return supported&&!disposed;},
    get status(){return {enabled,supported,phase,context:context?.state??'uninitialized',voices:voices.size,lastCue};},
    // Call synchronously from click / keydown, before loading the circuit.
    unlock(){
      if(disposed||!enabled)return;
      music?.unlock();if(!supported)return;
      try{if(!context)initialize();if(context.state==='suspended')context.resume().catch(()=>{});applyLevels();}catch{this.dispose();}
    },
    setEnabled(value){
      enabled=!!value;music?.setEnabled(enabled);try{localStorage.setItem(preferenceKey,enabled?'on':'off');}catch{}
      if(!enabled)stopVoices();else this.unlock();applyLevels();
    },
    setPhase(value){
      phase=value;music?.setPhase(value);
      if(!['flying','countdown','intro'].includes(phase))stopVoices();
      if(phase!=='countdown')lastCountdown=0;
      applyLevels();
    },
    update(state){
      if(!context||disposed||!['flying','countdown','intro'].includes(phase))return;
      const speed=clamp(state.speed/72),throttle=clamp(state.throttle/52),boosting=state.boosting?1:0;
      const pitch=48+speed*116+throttle*13+boosting*22;
      smooth(hum.source.frequency,pitch);smooth(turbine.source.frequency,pitch*2.01);smooth(harmonic.source.frequency,pitch*3);
      smooth(turbine.filter.frequency,350+speed*1250+boosting*650);
      smooth(hum.level.gain,.13+throttle*.035);smooth(turbine.level.gain,.025+speed*.035);
      smooth(air.level.gain,speed*speed*.28);smooth(air.filter.frequency,450+speed*2400);
      smooth(boost.level.gain,boosting*.19,.12);smooth(boost.filter.frequency,1200+speed*1900);
      const slide=state.drifting?clamp(Math.abs(state.slip)*2.2)*clamp(state.speed/18):0;
      smooth(drift.level.gain,slide*.22+(state.braking?speed*.09:0),.06);
      smooth(drift.filter.frequency,600+slide*1300+speed*350);
    },
    cue(name,intensity=1){
      if(!context||disposed||!enabled||context.state!=='running'||document.hidden)return;
      if(!['flying','countdown','intro'].includes(phase)&&!(name==='finish'&&phase==='finished'))return;
      if(name==='impact'){
        if(context.currentTime-lastImpact<.18)return;lastImpact=context.currentTime;
        const strength=clamp(intensity/14,.15,1);tone(100,.22,.23*strength,{end:32,type:'triangle'});tone(0,.09,.11*strength,{buffer:true});
      }else if(name==='countdown'){
        if(lastCountdown===intensity)return;lastCountdown=intensity;tone(520,.13,.12,{type:'triangle'});
      }else if(name==='ignition'){
        tone(42,.9,.2,{end:120,type:'sawtooth'});tone(0,.35,.12,{buffer:true});tone(880,.12,.06,{delay:.55,type:'triangle'});
      }else if(name==='go'){
        tone(784,.15,.13,{type:'triangle'});tone(1568,.32,.1,{delay:.08});
      }else if(name==='checkpoint'){
        tone(660,.12,.1);tone(990,.2,.1,{delay:.085});
      }else if(name==='recover'){
        tone(330,.16,.1,{end:165,type:'triangle'});tone(440,.24,.08,{delay:.14,end:660});
      }else if(name==='finish'){
        [523.25,659.25,783.99,1046.5].forEach((note,i)=>tone(note,i===3?.65:.22,.12,{delay:i*.13,type:'triangle'}));
      }else return;
      lastCue=name;
    },
    dispose(){
      if(disposed)return;disposed=true;music?.dispose();stopVoices();
      loops.forEach(source=>{try{source.stop();}catch{}source.disconnect();});
      if(context){spatialBus?.disconnect();master?.disconnect();compressor?.disconnect();context.close().catch(()=>{});}
    },
  };
}

export const raceAudio=createRaceAudio({music:gameMusic});

if(typeof window!=='undefined')window.addEventListener('pagehide',()=>raceAudio.dispose(),{once:true});
