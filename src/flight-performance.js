const preferenceKey='biggas-hover-racing-quality';
const scales=[1,.85,.7,.6,.5];
const modes=['auto','high','performance'];

// Keep HUD/text at native resolution; only resize the 3D drawing buffer.
// Long windows and a slower recovery prevent flicker and resolution oscillation.
export function createFlightPerformance({width,height,pixelRatio=1,mobile=false,onChange=()=>{},storage}={}){
  let mode='high',level=0,elapsed=0,total=0,frames=0,slow=0,fastWindows=0,cooldown=2000,fps=0;
  try{storage??=globalThis.localStorage;const saved=storage?.getItem(preferenceKey);if(modes.includes(saved))mode=saved;}catch{}
  function settings(){
    const base=Math.min(pixelRatio,mobile?1.25:1.5,Math.sqrt((mobile?900000:1600000)/Math.max(1,width*height)));
    const scale=mode==='high'?1:mode==='performance'?.7:scales[level];
    return {mode,scale,pixelRatio:mode==='high'?Math.min(pixelRatio,1.5):base*scale,samples:mode==='high'?4:0,glowSamples:mode==='high'?12:4,lite:mode==='performance'||mode==='auto'&&level>=3,shadowInterval:mode==='high'?0:1/30};
  }
  function reset(wait=1200){elapsed=total=frames=slow=fastWindows=0;cooldown=wait;}
  function publish(){onChange(settings());}
  return {
    get mode(){return mode;},get fps(){return fps;},get settings(){return settings();},
    setMode(next){if(!modes.includes(next))return;mode=next;level=0;reset(2000);try{storage?.setItem(preferenceKey,mode);}catch{}publish();},
    resize(w,h,dpr=pixelRatio){width=w;height=h;pixelRatio=dpr;reset();publish();},
    reset,
    sample(milliseconds){
      // Loading, a background tab, and a lone long task are not a GPU benchmark.
      if(!Number.isFinite(milliseconds)||milliseconds<=0)return;
      if(milliseconds>250){reset();return;}
      if(cooldown>0){cooldown-=milliseconds;return;}
      elapsed+=milliseconds;total+=milliseconds;frames++;if(milliseconds>22)slow++;
      if(elapsed<1000||frames<8)return;
      const average=total/frames;fps=Math.round(1000/average);
      if(mode==='auto'){
        if((average>20||slow/frames>.25)&&level<scales.length-1){level++;reset(1500);publish();return;}
        fastWindows=average<15.5&&slow===0?fastWindows+1:0;
        if(fastWindows>=12&&level>0){level--;reset(5000);publish();return;}
      }
      elapsed=total=frames=slow=0;
    },
  };
}
