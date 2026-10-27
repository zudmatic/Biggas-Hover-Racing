import * as THREE from 'three';
import {Fn,If,float,vec2,vec4,uniform,texture,mix,smoothstep,sin,log,pow,min,max,clamp,length,dot,atan,distance,select} from 'three/tsl';
import {tiled} from './lomi-energy.js';
import {SINGULARITY} from './lomi-constants.js';

const TAU=6.2831853,CORES=2;
// Linear filtering keeps the sampler in the compiled pass until the real textures arrive.
const placeholder=()=>{const map=new THREE.DataTexture(new Uint8Array([128,128,128,255]),1,1);map.minFilter=map.magFilter=THREE.LinearFilter;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.needsUpdate=true;return map;};

// Shared by every cached comic pass; zero until a singularity engine projects into it.
export function createLensUniforms(){
  return {
    active:uniform(0),time:uniform(0),
    glow:uniform(new THREE.Vector4()),infall:uniform(new THREE.Vector4()),hot:uniform(SINGULARITY.glow.colors.hot.clone()),
    waves:uniform(new THREE.Vector4()),wavesAux:uniform(new THREE.Vector4()),wavesSpeed:uniform(0),
    horizon:uniform(new THREE.Vector3()),depth:uniform(new THREE.Vector2()),cap:uniform(0),
    core:Array.from({length:CORES},()=>uniform(new THREE.Vector4())),coreAux:Array.from({length:CORES},()=>uniform(new THREE.Vector4())),
    noise:texture(placeholder()),flow:texture(placeholder()),
    setTextures(textures){this.noise.value=textures.noise;this.flow.value=textures.flow;},
  };
}

// uv is the comic pass's sampling coordinate (top-left origin); q is y-up.
export function createLensWarp(lens,{uv,aspect,viewDepth,far}){
  const window=(r,reach)=>float(1).sub(smoothstep(reach.mul(.35),reach.add(1e-6),r));
  const nearestOnSegment=(p,segment)=>{const span=segment.zw.sub(segment.xy),t=clamp(dot(p.sub(segment.xy),span).div(max(dot(span,span),1e-8)),0,1);return segment.xy.add(span.mul(t));};
  const rim=Fn(([rho,angle,seed])=>{
    const warp=tiled(lens.flow,vec2(angle.mul(2).add(seed),rho.mul(.55).add(lens.time.mul(.22))),2).rg.sub(.5).toVar();
    const shape=tiled(lens.noise,vec2(angle.mul(3).add(seed),lens.time.mul(.04)),3).r.sub(.5).toVar();
    const fine=tiled(lens.noise,vec2(angle.mul(4).add(rho.mul(lens.infall.w).mul(.25)),rho.mul(1.1).add(lens.time.mul(.55))).add(warp.mul(.4)),4).g.toVar();
    const r=rho.add(shape.mul(2).add(warp.x).mul(lens.glow.y).mul(.3));
    const band=smoothstep(.8,1,r).mul(float(1).sub(smoothstep(1,float(1).add(lens.glow.x.mul(fine.mul(.9).add(.35))),r))).toVar();
    const hot=pow(clamp(fine.mul(shape.add(.5)).mul(1.6),0,1),4).mul(band).mul(lens.glow.z);
    return band.mul(pow(fine,1.8).mul(1.5).add(.25)).add(hot);
  });
  const infall=Fn(([rho,angle,seed])=>{
    const halo=float(1).sub(smoothstep(1,lens.infall.x,rho)).toVar();
    const streak=tiled(lens.noise,vec2(angle.mul(5).add(rho.mul(lens.infall.w)).add(seed),log(max(rho,1e-3)).mul(1.5).add(lens.time.mul(.8))),5).r;
    return halo.mul(halo).mul(lens.infall.y.add(lens.infall.z.mul(smoothstep(.45,.8,streak))));
  });
  const ripple=Fn(([q,depth,softness])=>{
    const span=lens.waves.zw.sub(lens.waves.xy),L=max(length(span),1e-5),e=span.div(L),n=vec2(e.y.negate(),e.x),d=q.sub(lens.waves.xy);
    const s=dot(d,e).div(L).toVar(),v=dot(d,n).div(max(lens.wavesAux.y,1e-6)).toVar();
    const envelope=smoothstep(-.05,.15,s).mul(float(1).sub(smoothstep(.6,1,s))).mul(float(1).sub(smoothstep(.5,1,v.abs())));
    const phase=s.mul(lens.wavesAux.w).mul(TAU).sub(lens.time.mul(lens.wavesSpeed)).toVar();
    const wave=sin(phase.add(v.mul(1.7))).add(sin(phase.mul(2.3).sub(v.mul(2.9)).add(1.3)).mul(.5));
    const behind=smoothstep(0,softness,depth.sub(lens.wavesAux.x));
    return n.mul(wave).mul(lens.wavesAux.z).mul(s.add(.3)).mul(envelope).mul(behind);
  });
  const warped=Fn(()=>{
    const q=vec2(uv.x.sub(.5),float(.5).sub(uv.y)).mul(vec2(aspect,1)).toVar();
    const source=uv.toVar(),dark=float(0).toVar(),glow=float(0).toVar();
    let covered=lens.wavesAux.z.greaterThan(0).and(distance(q,nearestOnSegment(q,lens.waves)).lessThan(lens.wavesAux.y));
    for(let i=0;i<CORES;i++)covered=covered.or(distance(q,lens.core[i].xy).lessThan(lens.coreAux[i].y));
    If(lens.active.greaterThan(0).and(covered),()=>{
      const depth=viewDepth(uv).toVar(),softness=lens.depth.x,alpha=vec2(0).toVar(),nearest=far.toVar();
      for(let i=0;i<CORES;i++){
        const core=lens.core[i],aux=lens.coreAux[i],delta=q.sub(core.xy).toVar(),r=length(delta).toVar();
        const behind=smoothstep(aux.w.negate(),softness.sub(aux.w),depth.sub(aux.x)).toVar(),weight=window(r,aux.y).mul(behind).toVar();
        alpha.addAssign(core.z.mul(delta.add(aux.z.mul(vec2(delta.y.negate(),delta.x)))).div(r.mul(r).add(1e-7)).mul(weight));
        const h=core.w;
        dark.assign(max(dark,float(1).sub(smoothstep(h.mul(float(1).sub(lens.horizon.x.mul(.5))),h.mul(lens.horizon.x.add(1)).add(1e-6),r)).mul(behind).mul(lens.horizon.y)));
        const rho=r.div(max(h,1e-6)).toVar(),angle=atan(delta.y,delta.x.add(1e-9)).div(TAU).add(.5).toVar(),seed=float(i*.37);
        dark.assign(max(dark,min(infall(rho,angle,seed),1).mul(behind)));
        glow.addAssign(rim(rho,angle,seed).mul(behind));
        nearest.assign(select(weight.greaterThan(0),min(nearest,aux.x.sub(aux.w)),nearest));
      }
      If(lens.wavesAux.z.greaterThan(0),()=>{
        const wave=ripple(q,depth,softness).toVar();
        alpha.addAssign(wave);nearest.assign(select(dot(wave,wave).greaterThan(0),min(nearest,lens.wavesAux.x),nearest));
      });
      const magnitude=length(alpha).toVar();
      alpha.assign(select(magnitude.greaterThan(lens.cap),alpha.mul(lens.cap.div(magnitude)),alpha));
      source.assign(uv.sub(vec2(alpha.x.div(aspect),alpha.y.negate())));
      const overshoot=max(source.negate(),source.sub(1)).toVar();
      source.assign(mix(uv,source,float(1).sub(smoothstep(0,lens.depth.y,max(overshoot.x,overshoot.y)))));
      source.assign(mix(uv,source,smoothstep(0,softness,viewDepth(source).sub(nearest))));
    });
    return vec4(source,dark,glow);
  })().toVar();
  const emission=warped.w.mul(lens.glow.w);
  return {uv:warped.xy,dark:warped.z,emission:lens.hot.mul(smoothstep(.5,2,emission)).mul(emission)};
}

// Radii and offsets are authoring units times the anchor's world scale, so the
// holes follow the ship's game size.
const view=new THREE.Vector3(),axis=new THREE.Vector3(),side=new THREE.Vector3(),centre=new THREE.Vector3(),middle=new THREE.Vector3(),tail=new THREE.Vector3(),bend=new THREE.Vector3();
const projected=()=>({q:new THREE.Vector2(),depth:0,scale:0});
function project(point,camera,aspect,out){
  view.copy(point).applyMatrix4(camera.matrixWorldInverse);out.depth=-view.z;
  if(out.depth<camera.near)return false;
  view.applyMatrix4(camera.projectionMatrix);out.q.set(view.x*.5*aspect,view.y*.5);out.scale=camera.projectionMatrix.elements[5]*.5/out.depth;
  return true;
}
const onScreen=({q},aspect,margin)=>Math.abs(q.x)<aspect*.5+margin&&Math.abs(q.y)<.5+margin;

export function createSingularityLenses(anchors,signals,lens){
  const hole=projected(),head=projected(),end=projected();
  function projectCore(index,radius,camera,aspect){
    const {strength,reach,spin}=SINGULARITY.lensing,visible=project(centre,camera,aspect,hole);
    const horizon=radius*hole.scale,einstein=horizon*strength,extent=einstein*reach;
    if(!visible||!onScreen(hole,aspect,extent)){lens.core[index].value.setScalar(0);lens.coreAux[index].value.setScalar(0);return false;}
    lens.core[index].value.set(hole.q.x,hole.q.y,einstein*einstein,horizon);
    lens.coreAux[index].value.set(hole.depth,extent,index%2?spin:-spin,radius*strength*reach);
    return true;
  }
  function projectWaves(camera,aspect,unit){
    const {mode,waves:shape}=SINGULARITY.turbulence;
    tail.copy(middle).addScaledVector(axis,shape.length*unit).add(bend);
    const ahead=project(middle,camera,aspect,head)&&project(tail,camera,aspect,end),scale=(head.scale+end.scale)*.5*unit,width=shape.width*scale;
    if(mode==='radial'||shape.amplitude<=0||!ahead||!(onScreen(head,aspect,width)||onScreen(end,aspect,width))){lens.waves.value.setScalar(0);lens.wavesAux.value.setScalar(0);return false;}
    const energy=(.3+.7*signals.level)*(1+SINGULARITY.surge*signals.surge);
    lens.waves.value.set(head.q.x,head.q.y,end.q.x,end.q.y);
    lens.wavesAux.value.set(Math.min(head.depth,end.depth)-shape.width*unit,width,shape.amplitude*scale*energy,shape.frequency);
    return true;
  }
  return {
    project(camera,aspect){
      const {offset,surge,horizon,instability}=SINGULARITY,time=signals.time*instability.speed,swell=1+surge*signals.surge;
      let visible=false,unit=1;middle.set(0,0,0);
      anchors.forEach((anchor,index)=>{
        const wobble=1+instability.amount*Math.sin(time+index*2.3)*Math.sin(time*.53+index);
        unit=axis.setFromMatrixColumn(anchor.matrixWorld,1).length();axis.normalize();side.setFromMatrixColumn(anchor.matrixWorld,0).normalize();
        const radius=THREE.MathUtils.lerp(horizon.radius.idle,horizon.radius.cruise,signals.level)*swell*wobble*unit;
        centre.setFromMatrixPosition(anchor.matrixWorld).addScaledVector(axis,offset*unit);
        middle.addScaledVector(centre,1/anchors.length);
        visible=projectCore(index,radius,camera,aspect)||visible;
      });
      bend.copy(signals.bend).multiplyScalar(unit);
      return projectWaves(camera,aspect,unit)||visible;
    },
    sync(visible){
      const {glow,infall,horizon,wake,depth,lensing,turbulence}=SINGULARITY,radial=turbulence.mode==='waves'?0:1;
      lens.active.value=Number(visible);lens.time.value=signals.time*glow.speed;
      lens.glow.value.set(glow.width,glow.turbulence*radial,glow.hotspots,THREE.MathUtils.lerp(glow.intensity.idle,glow.intensity.cruise,signals.level)*(1+signals.surge));
      lens.infall.value.set(infall.halo,infall.dimming,infall.streaks*radial,infall.spiral);
      lens.wavesSpeed.value=turbulence.waves.speed;lens.horizon.value.set(horizon.softness,horizon.absorption,wake.absorption);
      lens.depth.value.set(depth.softness,depth.edge);lens.cap.value=lensing.cap;
    },
  };
}
