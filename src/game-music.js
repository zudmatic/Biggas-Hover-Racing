export const SOUNDTRACKS={
  desert:{title:'MIDNIGHT NOIR',src:`${import.meta.env.BASE_URL}audio/midnight-noir.mp3`},
  menu:{title:'RALLY HOUSE',youtubeId:'CbtVUfRPE-Q',url:'https://www.youtube.com/watch?v=CbtVUfRPE-Q',src:`${import.meta.env.BASE_URL}audio/biggas-menu.mp3`},
  race:{title:'MARLBORO CLUB',youtubeId:'__btnUgnhGw',url:'https://www.youtube.com/watch?v=__btnUgnhGw',src:`${import.meta.env.BASE_URL}audio/biggas-race.mp3`},
};

// The transport is separate from race audio so music can keep its position
// across selection steps and coexist with synthesized engine / race effects.
export function createGameMusic({tracks=SOUNDTRACKS,createAudio=()=>new Audio()}={}){
  const players=new Map(),listeners=new Set();
  const volumeKey='biggas-hover-racing-music-volume';
  let volume=.32;
  try{const saved=localStorage.getItem(volumeKey);if(saved!==null&&saved.trim()!==''&&Number.isFinite(Number(saved)))volume=Math.min(1,Math.max(0,Number(saved)));}catch{}
  let phase='loading',track=null,raceTrack='race',enabled=true,unlocked=false,disposed=false,generation=0,status='idle',currentPlayer=null;
  const events=new AbortController();
  const publish=value=>{status=value;listeners.forEach(listener=>listener({track,status,enabled,volume}));};
  function pauseAll(){currentPlayer=null;for(const player of players.values())player.pause();}
  function synchronize(){
    if(disposed||!enabled||!unlocked||document.hidden||!track){++generation;pauseAll();publish('idle');return;}
    const source=tracks[track]?.src;
    if(!source){++generation;pauseAll();publish('unavailable');return;}
    let player=players.get(track);
    if(!player){
      player=createAudio();player.preload='none';player.loop=true;player.volume=volume;player.src=source;
      player.addEventListener('error',()=>{if(currentPlayer===player)publish('unavailable');},{signal:events.signal});
      players.set(track,player);
    }
    if(currentPlayer===player&&['playing','loading'].includes(status))return;
    const token=++generation;currentPlayer=player;
    for(const other of players.values())if(other!==player)other.pause();
    publish('loading');
    Promise.resolve(player.play()).then(()=>{
      if(disposed||token!==generation){if(disposed||!enabled||document.hidden||currentPlayer!==player)player.pause();return;}
      publish('playing');
    }).catch(error=>{if(token===generation&&!disposed)publish(error.name==='NotAllowedError'?'blocked':'unavailable');});
  }
  document.addEventListener('visibilitychange',synchronize,{signal:events.signal});
  window.addEventListener('blur',()=>{++generation;pauseAll();publish('idle');},{signal:events.signal});
  window.addEventListener('focus',()=>{if(phase==='lobby')synchronize();},{signal:events.signal});
  return {
    get state(){return {track,status,enabled,volume};},
    subscribe(listener){listeners.add(listener);listener(this.state);return ()=>listeners.delete(listener);},
    unlock(){if(disposed)return;unlocked=true;synchronize();},
    setEnabled(value){enabled=!!value;synchronize();},
    setRaceTrack(value){raceTrack=tracks[value]?value:'race';this.setPhase(phase);},
    setVolume(value){
      if(disposed||!Number.isFinite(value))return;
      volume=Math.min(1,Math.max(0,value));
      for(const player of players.values())player.volume=volume;
      try{localStorage.setItem(volumeKey,String(volume));}catch{}
      publish(status);
    },
    setPhase(value){
      phase=value;
      const next=value==='lobby'?'menu':['flying','countdown','finished'].includes(value)?raceTrack:null;
      if(next===track)return;track=next;synchronize();
    },
    dispose(){if(disposed)return;disposed=true;++generation;events.abort();pauseAll();for(const player of players.values()){player.removeAttribute('src');player.load();}players.clear();listeners.clear();},
  };
}

export const gameMusic=createGameMusic();
