export const GOLDEN_RATIO=(1+Math.sqrt(5))/2;
export const PAD_TRANSITION=1/GOLDEN_RATIO**3;

// Finite smoothstep envelopes: continuous values, exact rest, independent of FPS.
export function createPadEnvelope(){
  const lanes=new Map();
  function tween(name,target,dt,duration){
    let lane=lanes.get(name);
    if(!lane){lane={value:0,from:0,target:0,elapsed:0};lanes.set(name,lane);}
    if(target!==lane.target){lane.from=lane.value;lane.target=target;lane.elapsed=0;}
    lane.elapsed+=Math.max(0,dt);
    const t=Math.min(1,lane.elapsed/Math.max(.001,duration)),ease=t*t*t*(t*(t*6-15)+10);
    lane.value=lane.from+(lane.target-lane.from)*ease;
    return lane.value;
  }
  return {update(p,dt,settings={}){
    const attack=settings.transition??PAD_TRANSITION,release=attack*GOLDEN_RATIO;
    // Consumption has its own short exit; recharging keeps the softer entrance.
    const pickupExit=Math.min(release,PAD_TRANSITION/GOLDEN_RATIO);
    const pickupEntry=Math.min(attack,PAD_TRANSITION/GOLDEN_RATIO**3);
    const active=p.remaining===0||p.flash>0;
    return {
      level:tween('level',Number(active),dt,active?attack:pickupExit),
      // Keep the blue hue while extinguishing; return to green on rearm.
      blue:tween('blue',Number(p.remaining>0||p.flash>0),dt,p.remaining>0?pickupEntry:attack),
      pulse:tween('pulse',Number(p.flash>0),dt,p.flash>0?pickupEntry:pickupExit),
      field:tween('field',Number(settings.field),dt,settings.field?attack:release),
      heat:tween('heat',settings.distortion?(settings.distortionStrength??0):0,dt,release),
    };
  }};
}
