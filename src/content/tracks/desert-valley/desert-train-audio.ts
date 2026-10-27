import * as THREE from 'three';
import {raceAudio} from '../../../audio/race-audio';

export const TRAIN_AUDIO_SETTINGS=Object.freeze({
  rollingVolume:.9,rollingRefDistance:18,rollingMaxDistance:150,
  hornVolume:1.1,hornRefDistance:28,hornMaxDistance:210,
});

// Two sources for the whole formation. The rolling emitter slides along the
// closest visible wagon; the horn stays on the locomotive in world space.
export function createDesertTrainAudio(train){
  const abort=new AbortController(),base=`${import.meta.env.BASE_URL}audio/train/`;
  const position=new THREE.Vector3(),forward=new THREE.Vector3(),up=new THREE.Vector3(),rotation=new THREE.Quaternion();
  let disposed=false,context=null,destination=null,buffers=null,decoding=null;
  let rolling=null,horn=null,lastHornPass=-1;
  const bytes=Promise.all(['rolling.mp3','horn.mp3'].map(async name=>{
    const response=await fetch(base+name,{signal:abort.signal});
    if(!response.ok)throw new Error(`Audio del tren: ${response.status} ${name}`);
    return response.arrayBuffer();
  })).catch(error=>{if(error.name!=='AbortError')console.warn('No se pudieron cargar los sonidos del tren.',error);return null;});

  function stop(voice){
    if(!voice)return;
    try{voice.source.stop();}catch{}
    voice.source.disconnect();voice.panner.disconnect();voice.gain.disconnect();
  }
  function silence(){stop(rolling);stop(horn);rolling=horn=null;}
  function locate(node,p){
    if(node.positionX){
      node.positionX.setTargetAtTime(p.x,context.currentTime,.025);
      node.positionY.setTargetAtTime(p.y,context.currentTime,.025);
      node.positionZ.setTargetAtTime(p.z,context.currentTime,.025);
    }else node.setPosition(p.x,p.y,p.z);
  }
  function voice(buffer,loop,p,refDistance,maxDistance){
    const source=context.createBufferSource(),panner=context.createPanner(),gain=context.createGain();
    source.buffer=buffer;source.loop=loop;panner.panningModel='HRTF';panner.distanceModel='inverse';
    panner.refDistance=refDistance;panner.maxDistance=maxDistance;panner.rolloffFactor=1.5;
    gain.gain.value=0;source.connect(panner);panner.connect(gain);gain.connect(destination);
    // Set the initial point immediately so a new voice never sweeps from origin.
    if(panner.positionX){panner.positionX.value=p.x;panner.positionY.value=p.y;panner.positionZ.value=p.z;}
    else panner.setPosition(p.x,p.y,p.z);
    const result={source,panner,gain};
    source.onended=()=>{source.disconnect();panner.disconnect();gain.disconnect();if(horn===result)horn=null;if(rolling===result)rolling=null;};
    source.start();return result;
  }
  function level(voice,p,volume,maxDistance){
    locate(voice.panner,p);
    // Inverse attenuation alone never becomes silent. Fade the outer third
    // explicitly so neither sound is audible from the other side of the map.
    const distance=position.distanceTo(p),fade=THREE.MathUtils.clamp((maxDistance-distance)/(maxDistance*.35),0,1);
    voice.gain.gain.setTargetAtTime(volume*fade*fade,context.currentTime,.055);
  }
  const hidden=()=>{if(document.hidden)silence();};
  document.addEventListener('visibilitychange',hidden);
  return {
    update(camera,phase){
      if(disposed)return;
      const output=raceAudio.spatialOutput;
      if(!output?.active||phase!=='flying'){silence();return;}
      context=output.context;destination=output.destination;
      if(!decoding){
        decoding=bytes.then(data=>data?Promise.all(data.map(value=>context.decodeAudioData(value))):null)
          .then(decoded=>{if(!disposed)buffers=decoded;})
          .catch(error=>{if(!disposed)console.warn('No se pudo decodificar el audio del tren.',error);});
      }
      camera.getWorldPosition(position);camera.getWorldQuaternion(rotation);
      forward.set(0,0,-1).applyQuaternion(rotation);up.set(0,1,0).applyQuaternion(rotation);
      const listener=context.listener,now=context.currentTime;
      if(listener.positionX){
        for(const [name,value] of [['positionX',position.x],['positionY',position.y],['positionZ',position.z],['forwardX',forward.x],['forwardY',forward.y],['forwardZ',forward.z],['upX',up.x],['upY',up.y],['upZ',up.z]])listener[name].setValueAtTime(value,now);
      }else{listener.setPosition(position.x,position.y,position.z);listener.setOrientation(forward.x,forward.y,forward.z,up.x,up.y,up.z);}
      const state=train.audioState(position),config=TRAIN_AUDIO_SETTINGS;
      if(!state.active||!buffers){silence();return;}
      const rollingNear=position.distanceTo(state.rolling)<config.rollingMaxDistance;
      if(rollingNear){
        if(!rolling)rolling=voice(buffers[0],true,state.rolling,config.rollingRefDistance,config.rollingMaxDistance);
        level(rolling,state.rolling,config.rollingVolume,config.rollingMaxDistance);
      }else{stop(rolling);rolling=null;}
      if(state.locomotiveVisible&&lastHornPass!==state.passId&&position.distanceTo(state.locomotive)<config.hornMaxDistance*.8){
        stop(horn);horn=voice(buffers[1],false,state.locomotive,config.hornRefDistance,config.hornMaxDistance);lastHornPass=state.passId;
      }
      if(horn)level(horn,state.locomotive,config.hornVolume,config.hornMaxDistance);
    },
    reset(){silence();lastHornPass=-1;},
    dispose(){disposed=true;abort.abort();silence();buffers=null;document.removeEventListener('visibilitychange',hidden);},
  };
}
