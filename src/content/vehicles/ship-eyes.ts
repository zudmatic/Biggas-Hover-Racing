import {MathUtils} from 'three';

// Bulldog 039's face rig (Bulldog_Racer_Animated_Prototype, README_controles):
// - CTRL_Eye_L/R pivots yaw the lenses, limited to ±3°; rose and highlight move with them.
// - Lid_L/R morph along four trajectory targets (25/50/75/100 %). Never drive
//   only the 100 % target: the straight path would cut through the lens.
// - Tongue_Recoil, on both tongue meshes, pulls the free tip back.
// Steering drives the gaze; the authored Blink clip plays at idle and the
// Collision clip (lids shut, tongue recoils, recovery) after a hard impact.
export const EYE_CLOSED=0,GAZE_LIMIT=.0523599;
const LOOK_RESPONSE=9,BLINK_GAP=[3.2,6.4],REARM=.8;
const closureOf=lidWeights=>lidWeights.reduce((sum,weight,i)=>sum+weight*(i+1)/4,0);

// Contract: q=4t, weights shared between the two poses around q (pose 0 is Basis).
export function blinkWeights(t,out=[0,0,0,0]){
  const q=MathUtils.clamp(t,0,1)*4,lower=Math.floor(q),frac=q-lower;out.fill(0);
  if(lower>0)out[lower-1]=1-frac;
  if(lower<4)out[lower]=(out[lower]??0)+frac;
  return out;
}
// Positive turn input lowers yaw, so a right turn has a negative yaw rate.
export const gazeTarget=state=>MathUtils.clamp(-(state?.yawRate??0)/1.4,-1,1);

// An authored clip as scalar curves: lid closure t and tongue recoil. Lids
// are re-posed through blinkWeights, so blending between keys follows the
// trajectory instead of fading straight across the lens. The demo's still
// lead-in is trimmed so the reaction starts on the triggering frame.
function clipCurves(clip){
  const track=name=>clip?.tracks.find(track=>track.name===name);
  const lid=track('LidCaps_L.morphTargetInfluences'),tongue=track('Candidate_thin_curved_tongue_editable_surface.morphTargetInfluences');
  if(!lid)return null;
  const keys=(source,scalar)=>source?Array.from(source.times,(time,i)=>[time,scalar(source.values.subarray(i*source.getValueSize(),(i+1)*source.getValueSize()))]):[[0,0]];
  const lids=keys(lid,closureOf),recoil=keys(tongue,values=>values[0]);
  const moving=[...lids,...recoil].filter(([,value])=>value>1e-4).map(([time])=>time);
  const step=lids[1]?.[0]-lids[0][0]||0,start=Math.max(0,Math.min(...moving)-step),end=Math.max(...moving)+step;
  const sample=(curve,time)=>{
    time+=start;if(time<=curve[0][0])return curve[0][1];
    for(let i=1;i<curve.length;i++)if(time<=curve[i][0]){const [t0,v0]=curve[i-1],[t1,v1]=curve[i];return v0+(v1-v0)*(time-t0)/(t1-t0);}
    return curve.at(-1)[1];
  };
  return {duration:end-start,closure:time=>sample(lids,time),recoil:time=>sample(recoil,time)};
}

export function createShipEyes(root,{impact,clips=[]}){
  const morphs=name=>{const meshes=[];root.getObjectByName(name)?.traverse(o=>{if(o.morphTargetInfluences)meshes.push(o);});return meshes;};
  const pivots=['CTRL_Eye_L','CTRL_Eye_R'].map(name=>root.getObjectByName(name)).filter(Boolean);
  const lids=[...morphs('Lid_L'),...morphs('Lid_R')];
  const tongue=[];root.traverse(o=>{if(o.morphTargetDictionary?.Tongue_Recoil!==undefined)tongue.push(o);});
  if(pivots.length!==2||lids.length===0)return null;
  const clip=name=>clips.find(c=>c.name===name);
  const reaction=clipCurves(clip('Collision')),blink=clipCurves(clip('Blink'));
  const weights=[0,0,0,0];
  let look=0,lastTime=null,serial=null,hitAt=-Infinity,blinkAt=BLINK_GAP[0],blinks=0,held=null,closure=0;
  function pose(lidWeights,recoil,amount){
    // Looking right (the ship's -X) yaws the lenses negatively about +Y.
    for(const pivot of pivots)pivot.rotation.set(0,-amount*GAZE_LIMIT,0);
    for(const lid of lids)for(let i=0;i<4;i++)lid.morphTargetInfluences[i]=lidWeights[i];
    for(const mesh of tongue)mesh.morphTargetInfluences[mesh.morphTargetDictionary.Tongue_Recoil]=recoil;
    closure=closureOf(lidWeights);
  }
  return {
    get look(){return look;},
    // 0 open, 1 shut: the lid trajectory position.
    get closure(){return closure;},
    get tongue(){return tongue[0]?.morphTargetInfluences[tongue[0].morphTargetDictionary.Tongue_Recoil]??0;},
    // Applied lid target weights, per lid mesh, for inspection.
    get lidWeights(){return lids.map(lid=>Array.from(lid.morphTargetInfluences));},
    // A cinematic can keep the eyes shut (EYE_CLOSED) or open (1); null returns control.
    hold(openness){held=openness;if(held!==null)pose(blinkWeights(1-held,weights),0,look);},
    update(time,state,reduced=false){
      const dt=lastTime===null?0:MathUtils.clamp(time-lastTime,0,.1);lastTime=time;
      const hit=state?.impactSerial;
      // Grinding along a wall reports many impacts; restart only once the lids reopen.
      if(serial!==null&&hit!==undefined&&hit!==serial&&(state.impact??0)>=impact&&!reduced&&!(time-hitAt<REARM))hitAt=time;
      if(hit!==undefined)serial=hit;
      // A restarted race rewinds the clock; forget the old run's reaction and blink.
      if(hitAt>time)hitAt=-Infinity;
      if(blinkAt>time+BLINK_GAP[1])blinkAt=time+BLINK_GAP[0];
      let lidWeights=blinkWeights(0,weights),recoil=0;
      const reacting=reaction&&time-hitAt<reaction.duration;
      if(held!==null)lidWeights=blinkWeights(1-held,weights);
      else if(reduced){/* Still and open. */}
      else if(reacting){lidWeights=blinkWeights(reaction.closure(time-hitAt),weights);recoil=reaction.recoil(time-hitAt);}
      else if(blink&&time>=blinkAt){
        if(time-blinkAt<blink.duration)lidWeights=blinkWeights(blink.closure(time-blinkAt),weights);
        // Irregular idle rhythm, deterministic per ship.
        else{blinks++;blinkAt=time+MathUtils.lerp(BLINK_GAP[0],BLINK_GAP[1],(blinks*.618034)%1);}
      }
      const target=reduced||closureOf(lidWeights)>.5?0:gazeTarget(state);
      look+=(target-look)*(dt?1-Math.exp(-dt*LOOK_RESPONSE):1);
      pose(lidWeights,recoil,look);
    },
    dispose(){pose(blinkWeights(0,weights),0,0);},
  };
}
