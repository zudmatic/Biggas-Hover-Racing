export const CLIP_START=80;
export const CLIP_END=92;
const CLIP_DURATION=CLIP_END-CLIP_START;

// The bundled file contains only the requested twelve-second passage.
export function createMusicPlayer({panel,status,onEnd}) {
  const audio=document.querySelector('#dance-audio');
  const retry=document.querySelector('#music-retry');
  let active=false,generation=0,watchdog;
  function message(state,text='',visible=false) {
    panel.dataset.playback=state;status.textContent=text;panel.hidden=!visible;
  }
  function finish() {if(active){stop();onEnd();}}
  function checkEnd() {if(active&&audio.currentTime>=CLIP_DURATION)finish();}
  async function play() {
    const request=generation;
    try {
      await audio.play();
      if(active&&request===generation){message('playing');clearInterval(watchdog);watchdog=setInterval(checkEnd,50);}
    } catch(error) {
      if(!active||request!==generation)return;
      message(error.name==='NotAllowedError'?'blocked':'error',error.name==='NotAllowedError'?'Pulsa reproducir para escuchar el tema.':'No se pudo reproducir el audio. Puedes reintentarlo.',true);
    }
  }
  function start() {
    stop();active=true;generation++;audio.currentTime=0;message('loading');void play();
  }
  function stop() {
    active=false;generation++;clearInterval(watchdog);audio.pause();audio.currentTime=0;message('idle');
  }
  audio.addEventListener('ended',finish);
  audio.addEventListener('timeupdate',checkEnd);
  audio.addEventListener('playing',()=>{if(active)message('playing');else audio.pause();});
  audio.addEventListener('waiting',()=>{if(active)message('buffering');});
  audio.addEventListener('pause',()=>{if(active&&!audio.ended)message('paused','Audio en pausa.',true);});
  audio.addEventListener('error',()=>{if(active)message('error','No se pudo cargar el audio. Puedes reintentarlo.',true);});
  retry.addEventListener('click',()=>{if(active){if(audio.error)audio.load();void play();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&active)audio.pause();});
  return {start,stop,setMuted(value){audio.muted=value;},get time(){return audio.currentTime;},get playing(){return active&&!audio.paused&&!audio.ended&&panel.dataset.playback==='playing';}};
}
