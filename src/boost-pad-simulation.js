export const PAD_COOLDOWN=7;
export const PAD_BOOST_DURATION=2;
export const PAD_PICKUP_FLASH=.09;

// Swept local box: fast crossings cannot skip a narrow pad between fixed ticks.
export function crossesBoostPad(pad,previous,state){
  if(Math.hypot(state.x-previous.x,state.z-previous.z)>30)return false;
  const local=p=>{const x=p.x-pad.x,z=p.z-pad.z;return [x*pad.nz-z*pad.nx,p.y-pad.y,x*pad.nx+z*pad.nz];};
  const a=local(previous),b=local(state),bounds=[[-pad.halfWidth,pad.halfWidth],[.15,2.1],[-pad.halfLength,pad.halfLength]];
  let enter=0,exit=1;
  for(let i=0;i<3;i++){
    const d=b[i]-a[i],[lo,hi]=bounds[i];
    if(Math.abs(d)<1e-9){if(a[i]<lo||a[i]>hi)return false;continue;}
    const t0=(lo-a[i])/d,t1=(hi-a[i])/d;enter=Math.max(enter,Math.min(t0,t1));exit=Math.min(exit,Math.max(t0,t1));
    if(enter>exit)return false;
  }
  return true;
}

export function createBoostPadSimulation(pads,settings={}){
  let time=0;
  const entries=pads.map(p=>({...p,remaining:0,flash:0,occupied:false,activations:0}));
  function activate(p,state,onActivate=()=>{}){
    if(p.remaining>0)return false;
    // Claim synchronously, before particles/callbacks: another car cannot claim
    // the same charge, even while the visual pickup animation is still running.
    p.remaining=settings.cooldown??PAD_COOLDOWN;p.flash=PAD_PICKUP_FLASH;p.activations++;
    state.padBoostRemaining=Math.max(state.padBoostRemaining??0,settings.duration??PAD_BOOST_DURATION);onActivate(p);return true;
  }
  return {entries,activate,get time(){return time;},reset(){time=0;for(const p of entries)Object.assign(p,{remaining:0,flash:0,occupied:false,activations:0});},
    step(dt,state,previous,onActivate=()=>{}){
      time+=dt;
      for(const p of entries){
        p.remaining=Math.max(0,p.remaining-dt);p.flash=Math.max(0,p.flash-dt);
        const inside=crossesBoostPad(p,state,state),crossed=crossesBoostPad(p,previous,state);
        if(!p.occupied&&crossed&&p.remaining===0&&state.speed>1){
          activate(p,state,onActivate);
        }
        p.occupied=inside;
      }
    },
  };
}
