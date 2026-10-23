import data from './animation-data/actionforge.json' with {type:'json'};

export const ACTIONFORGE_CLIPS=Object.freeze(Object.keys(data.clips));
export const DANCE_LOOP_DURATION=data.clips.dance.duration;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const mix=(a,b,t)=>a+(b-a)*t;

// The export is retargeted onto Zud's humanoid skeleton. His live shell rig
// has hinge elbows/knees and a single torso, so project those tracks onto its
// available axes and soften their range for his short, wide limbs.
export function createActionForgePlayer() {
  const values=new Float64Array(data.bones.length*3);
  const idle=data.clips.idle.frames[0];
  return {apply(pose,name,phase,weight=1) {
    const clip=data.clips[name];
    if(!clip)throw new Error(`Unknown ActionForge clip: ${name}`);
    const loop=['idle','walk','air','dance'].includes(name);
    const t=loop?((phase%1)+1)%1:clamp(phase,0,1);
    const position=t*(clip.frames.length-1),a=Math.floor(position),b=Math.min(a+1,clip.frames.length-1);
    for(let i=0;i<values.length;i++)values[i]=mix(clip.frames[a][i],clip.frames[b][i],position-a);
    weight=clamp(weight,0,1);
    const resting=name==='idle',walking=name==='walk',dancing=name==='dance';
    for(let i=0;i<2;i++) {
      const sign=i?1:-1,arm=3+i*3,leg=9+i*3,forearm=15+i*3,shin=21+i*3;
      let ax,ay,az,lx,lz,elbow,knee;
      if(resting){
        ax=(values[arm]-idle[arm])*.8;ay=(values[arm+1]-idle[arm+1])*.5;
        az=sign*.1+(values[arm+2]-idle[arm+2])*.6;
        lx=(values[leg]-idle[leg])*.2;lz=0;
        elbow=.08+(idle[forearm]-values[forearm])*.5;knee=0;
      }else if(dancing){
        // Dance Loop keeps the captured amplitude. Only the shell rig's
        // physical hinge limits apply; no extra stance offset or attenuation.
        ax=values[arm];ay=values[arm+1];az=values[arm+2];
        lx=values[leg];lz=values[leg+2];
        elbow=-values[forearm];knee=values[shin];
      }else{
        ax=walking?(values[arm]-.22)*2.2:values[arm]*.7;
        ay=values[arm+1]*(walking?.3:.5);
        az=sign*(walking?.16:.15)+values[arm+2]*(walking?.3:.65);
        lx=walking?values[leg]*.95+.015:values[leg]*.65;
        lz=walking?(values[leg+2]+sign*.3)*.25:values[leg+2]*.3;
        elbow=-values[forearm]*(walking?.5:.75);
        knee=Math.max(0,values[shin]-(walking?.35:0))*(walking?.55:.5);
      }
      pose.armX[i]=mix(pose.armX[i],clamp(ax,-1.5,1.3),weight);
      pose.armY[i]=mix(pose.armY[i],clamp(ay,-.6,.6),weight);
      pose.armZ[i]=mix(pose.armZ[i],clamp(az,-1.2,1.2),weight);
      pose.legX[i]=mix(pose.legX[i],clamp(lx,-1,.8),weight);
      pose.legZ[i]=mix(pose.legZ[i],clamp(lz,dancing?-.6:-.22,dancing?.6:.22),weight);
      pose.elbow[i]=mix(pose.elbow[i],clamp(elbow,0,dancing?1.45:1.35),weight);
      pose.knee[i]=mix(pose.knee[i],clamp(knee,0,dancing?1.25:1.2),weight);
    }
    // Root position is deliberately absent: navigation, jump physics and sole
    // contact own translation. Only the captured torso sway is transferred.
    const baseline=resting?idle:[0,0,0];
    pose.rx=mix(pose.rx,(values[0]-baseline[0])*(dancing?1:.25),weight);
    pose.turn=mix(pose.turn,(values[1]-baseline[1])*(dancing?1:.4),weight);
    pose.rz=mix(pose.rz,(values[2]-baseline[2])*(dancing?1:.5),weight);
  }};
}
