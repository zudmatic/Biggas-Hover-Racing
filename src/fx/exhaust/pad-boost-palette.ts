import {Color} from 'three';
import {GOLDEN_RATIO,PAD_TRANSITION} from '../../sim/boost-pad-envelope';

export function smoothBoostPower(current,target,dt){
  const duration=PAD_TRANSITION*(target>current?1:GOLDEN_RATIO);
  const value=current+(target-current)*(1-Math.exp(-3*Math.max(0,dt)/duration));
  return Math.abs(value-target)<.0001?target:value;
}

// Smooth every palette change, including manual nitro and custom studio presets.
export function createPadBoostPalette(){
  let padActive=false,blend=0;
  const green=new Color('#34ff76'),lime=new Color('#90e000');
  const channels=new WeakMap(),targetColor=new Color();
  return {
    update(dt,active){
      padActive=active;
      blend=1-Math.exp(-3*Math.max(0,dt)/(PAD_TRANSITION*(active?1:GOLDEN_RATIO)));
    },
    apply(out,base,core=false){
      let current=channels.get(out);
      if(!current){current=new Color(base);channels.set(out,current);}
      targetColor.set(padActive?(core?lime:green):base);
      current.lerp(targetColor,blend);
      if(Math.max(Math.abs(current.r-targetColor.r),Math.abs(current.g-targetColor.g),Math.abs(current.b-targetColor.b))<.0001)current.copy(targetColor);
      return out.copy(current);
    },
  };
}
