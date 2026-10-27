import * as THREE from 'three';
import {MeshBasicNodeMaterial} from 'three/webgpu';
import {Fn,If,attribute,float,vec2,vec3,vec4,uniform,texture,positionLocal,normalGeometry,cameraPosition,cameraProjectionMatrix,cameraViewMatrix,modelWorldMatrix,modelWorldMatrixInverse,modelScale,varying,mix,smoothstep,fract,floor,sin,cos,sqrt,abs,pow,exp,min,max,clamp,length,normalize,cross,dot,atan,fwidth,select} from 'three/tsl';
import {BOOST_RATIO,PLASMA,PLASMA_QUALITY} from './lomi-constants.js';
import {tiled} from './lomi-energy.js';

const TAU=6.2831853;

// Shard bake: per-vertex crease barycentrics, distance along the flow and the
// orbit angle around the shard's axis.
const key=(position,index)=>[position.getX(index),position.getY(index),position.getZ(index)].map(value=>Math.round(value*1e4)).join(',');
function frameOf(position,flow){
  const point=new THREE.Vector3(),box=new THREE.Box3().setFromBufferAttribute(position);
  const projections=Array.from({length:position.count},(_,index)=>point.fromBufferAttribute(position,index).dot(flow));
  const fore=Math.min(...projections),up=new THREE.Vector3(0,1,0).addScaledVector(flow,-flow.y).normalize();
  return {flow,up,side:new THREE.Vector3().crossVectors(flow,up),center:box.getCenter(new THREE.Vector3()),fore,span:Math.max(Math.max(...projections)-fore,1e-4)};
}
const alongOf=(frame,point)=>point.dot(frame.flow)-frame.fore;
function angleOf(frame,point){const offset=point.clone().sub(frame.center);return Math.atan2(offset.dot(frame.up),offset.dot(frame.side))/TAU+.5;}
function creases(position,normal){
  const faces=position.count/3,normals=Array.from({length:faces},(_,face)=>new THREE.Vector3().fromBufferAttribute(normal,face*3).normalize());
  const edgeKey=(face,corner)=>{const from=key(position,face*3+(corner+1)%3),to=key(position,face*3+(corner+2)%3);return from<to?`${from}|${to}`:`${to}|${from}`;};
  const shared=new Map();
  for(let face=0;face<faces;face++)for(let corner=0;corner<3;corner++)shared.set(edgeKey(face,corner),[...(shared.get(edgeKey(face,corner))??[]),face]);
  const isCrease=(face,corner)=>{const neighbours=shared.get(edgeKey(face,corner));return neighbours.length<2||neighbours.some(other=>normals[other].dot(normals[face])<PLASMA.edge.crease);};
  const barycentric=new Float32Array(position.count*3),edges=new Map();
  for(let face=0;face<faces;face++)for(let corner=0;corner<3;corner++){
    const crease=isCrease(face,corner);
    for(let vertex=0;vertex<3;vertex++)barycentric[(face*3+vertex)*3+corner]=Number(corner===vertex)+Number(!crease);
    if(!crease||edges.has(edgeKey(face,corner)))continue;
    edges.set(edgeKey(face,corner),{from:new THREE.Vector3().fromBufferAttribute(position,face*3+(corner+1)%3),to:new THREE.Vector3().fromBufferAttribute(position,face*3+(corner+2)%3),
      normal:shared.get(edgeKey(face,corner)).reduce((sum,other)=>sum.add(normals[other]),new THREE.Vector3()).normalize()});
  }
  return {barycentric:new THREE.BufferAttribute(barycentric,3),edges:[...edges.values()]};
}
export function bakeShard(mesh,flow){
  const geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();
  const position=geometry.getAttribute('position'),frame=frameOf(position,flow);
  const {barycentric,edges}=creases(position,geometry.getAttribute('normal'));
  const point=new THREE.Vector3(),along=new Float32Array(position.count),orbit=new Float32Array(position.count*2);
  for(let index=0;index<position.count;index++){
    point.fromBufferAttribute(position,index);along[index]=alongOf(frame,point);point.sub(frame.center);
    orbit[index*2]=point.dot(frame.side);orbit[index*2+1]=point.dot(frame.up);
  }
  geometry.setAttribute('aEdge',barycentric);geometry.setAttribute('aAlong',new THREE.BufferAttribute(along,1));geometry.setAttribute('aOrbit',new THREE.BufferAttribute(orbit,2));
  return {mesh,geometry,frame,edges};
}

export function meshToRoot(root,mesh){
  root.updateWorldMatrix(true,false);mesh.updateWorldMatrix(true,false);
  return root.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
}

const STOPS=[.3,.55,.8];
function candidates(root,{mesh,frame,edges}){
  const toRoot=meshToRoot(root,mesh);
  return edges.flatMap(({from,to,normal})=>STOPS.map(stop=>{
    const point=from.clone().lerp(to,stop),outward=normal.clone().transformDirection(toRoot),rear=alongOf(frame,point)/frame.span;
    const exposure=.3+Math.max(0,outward.y)+.5*Math.abs(outward.x);
    return {origin:point.clone().applyMatrix4(toRoot),normal:outward,along:alongOf(frame,point),angle:angleOf(frame,point),score:from.distanceTo(to)*(.3+rear)*exposure};
  }));
}
export function pickTongueAnchors(root,shards,count){
  const ranked=shards.flatMap(shard=>candidates(root,shard)).sort((a,b)=>b.score-a.score),picked=[];
  for(const candidate of ranked){
    if(picked.length===count)break;
    if(picked.some(({origin})=>origin.distanceTo(candidate.origin)<PLASMA.tongues.spacing))continue;
    const seed=(picked.length*.618034)%1;
    picked.push({...candidate,seed,scale:.7+.3*((seed*7.31)%1)});
  }
  return picked;
}
export function createTongueGeometry(anchors,segments){
  const rows=segments+1,count=anchors.length*rows*2;
  const position=new Float32Array(count*3),normal=new Float32Array(count*3),ribbon=new Float32Array(count*2),anchor=new Float32Array(count*4),index=[];
  anchors.forEach(({origin,normal:outward,along,angle,seed,scale},tongue)=>{
    for(let row=0;row<rows;row++){
      for(let side=0;side<2;side++){
        const vertex=(tongue*rows+row)*2+side;
        origin.toArray(position,vertex*3);outward.toArray(normal,vertex*3);ribbon.set([row/segments,side*2-1],vertex*2);anchor.set([along,angle,seed,scale],vertex*4);
      }
      if(row===segments)continue;
      const base=(tongue*rows+row)*2;index.push(base,base+1,base+2,base+1,base+3,base+2);
    }
  });
  const geometry=ribbonGeometry(position);
  geometry.setAttribute('aNormal',new THREE.BufferAttribute(normal,3));
  geometry.setAttribute('aRibbon',new THREE.BufferAttribute(ribbon,2));geometry.setAttribute('aAnchor',new THREE.BufferAttribute(anchor,4));geometry.setIndex(index);
  return geometry;
}
// The node material reads a normal attribute even when the shader ignores it.
function ribbonGeometry(position){
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(position,3));geometry.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(position.length),3));
  return geometry;
}
export function createCoilGeometry(root,exhausts,strands,segments){
  const rows=segments+1,count=exhausts.length*strands*rows*2;
  const position=new Float32Array(count*3),axis=new Float32Array(count*3),side=new Float32Array(count*3),coil=new Float32Array(count*4),index=[];
  const origin=new THREE.Vector3(),aft=new THREE.Vector3(),across=new THREE.Vector3();
  exhausts.forEach((exhaust,engine)=>{
    const toRoot=meshToRoot(root,exhaust);
    origin.setFromMatrixPosition(toRoot);aft.setFromMatrixColumn(toRoot,1).normalize();across.setFromMatrixColumn(toRoot,0).normalize();
    const spin=engine%2?1:-1;
    for(let strand=0;strand<strands;strand++){
      const ribbon=engine*strands+strand;
      for(let row=0;row<rows;row++){
        for(let edge=0;edge<2;edge++){
          const vertex=(ribbon*rows+row)*2+edge;
          origin.toArray(position,vertex*3);aft.toArray(axis,vertex*3);across.toArray(side,vertex*3);coil.set([row/segments,edge*2-1,strand/strands+engine*.17,spin],vertex*4);
        }
        if(row===segments)continue;
        const base=(ribbon*rows+row)*2;index.push(base,base+1,base+2,base+1,base+3,base+2);
      }
    }
  });
  const geometry=ribbonGeometry(position);
  geometry.setAttribute('aAxis',new THREE.BufferAttribute(axis,3));
  geometry.setAttribute('aSide',new THREE.BufferAttribute(side,3));geometry.setAttribute('aCoil',new THREE.BufferAttribute(coil,4));geometry.setIndex(index);
  return geometry;
}

export function createPlasmaUniforms(textures){
  const {colors,flow,filaments,edge,hotspots,tongues,burst,coils}=PLASMA;
  return {
    noise:texture(textures.noise),flowMap:texture(textures.flow),time:uniform(0),phase:uniform(0),flow:uniform(new THREE.Vector2(flow.cycles,flow.scale)),
    turbulence:uniform(0),density:uniform(0),emission:uniform(0),bloom:uniform(PLASMA.bloom),
    shard:uniform(colors.shard),base:uniform(colors.base),hot:uniform(colors.hot),spectrum:colors.burst.map(color=>uniform(color)),
    burst:uniform(0),burstShape:uniform(new THREE.Vector4(burst.flicker,burst.rate,burst.drift,burst.heat)),
    filament:uniform(new THREE.Vector2(filaments.width,filaments.coverage)),edge:uniform(new THREE.Vector3(edge.emission,edge.width,edge.reach)),hotspots:uniform(new THREE.Vector2(hotspots.gain,hotspots.sharpness)),
    aft:uniform(flow.direction.clone().normalize()),bend:uniform(new THREE.Vector3()),tongue:uniform(new THREE.Vector4(0,tongues.width,tongues.lift,tongues.bend)),sweep:uniform(0),
    coil:uniform(new THREE.Vector4(coils.start,coils.length,coils.radius,coils.inner)),coilTwist:uniform(new THREE.Vector4(coils.turns,coils.spin,coils.width,coils.wobble)),
  };
}
function createField(u){
  const flowUv=(along,angle)=>vec2(angle.mul(u.flow.x),along.mul(u.flow.y));
  const warpUv=uv=>uv.mul(vec2(1,.6)).add(vec2(0,u.time.mul(.03).sub(u.phase.mul(.4))));
  const spectrum=Fn(([t0])=>{
    const t=fract(t0).mul(3).toVar(),color=vec3(0).toVar();
    If(t.lessThan(1),()=>{color.assign(mix(u.spectrum[0],u.spectrum[1],t));}).ElseIf(t.lessThan(2),()=>{color.assign(mix(u.spectrum[1],u.spectrum[2],t.sub(1)));}).Else(()=>{color.assign(mix(u.spectrum[2],u.spectrum[0],t.sub(2)));});
    return color;
  });
  const plasma=Fn(([energy0,tint])=>{
    const shift=tint.add(u.phase.mul(u.burstShape.z)).toVar();
    const energy=energy0.mul(float(1).add(u.burst.mul(u.burstShape.x).mul(sin(u.time.mul(u.burstShape.y).add(shift.mul(TAU)))))).toVar();
    const base=mix(u.base,spectrum(shift),u.burst),hot=mix(u.hot,spectrum(shift.add(.33)).add(.5),u.burst.mul(u.burstShape.w));
    return base.mul(energy).add(hot.mul(energy).mul(energy).mul(u.bloom));
  });
  return {flowUv,warpUv,plasma};
}
const hash21=Fn(([p])=>{const p3=fract(vec3(p.x,p.y,p.x).mul(.1031)).toVar();p3.addAssign(dot(p3,p3.yzx.add(33.33)));return fract(p3.x.add(p3.y).mul(p3.z));});

// Additive colour with the destination alpha kept: the comic post divides by
// scene alpha, and plain AdditiveBlending also sums alpha in the HDR target.
const ribbonMaterial=()=>new MeshBasicNodeMaterial({side:THREE.DoubleSide,transparent:true,depthWrite:false,
  blending:THREE.CustomBlending,blendEquation:THREE.AddEquation,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor});

export function createShardMaterial(u,detail){
  const {flowUv,warpUv,plasma}=createField(u),material=new MeshBasicNodeMaterial({side:THREE.DoubleSide});
  const aEdge=attribute('aEdge','vec3'),aAlong=attribute('aAlong','float'),aOrbit=attribute('aOrbit','vec2');
  const camObj=varying(modelWorldMatrixInverse.mul(vec4(cameraPosition,1)).xyz);
  material.colorNode=Fn(()=>{
    const vObj=positionLocal,n0=normalize(normalGeometry).toVar(),v=normalize(vObj.sub(camObj)).toVar();
    const n=select(dot(v,n0).greaterThan(0),n0.negate(),n0).toVar();
    const facing=clamp(dot(v.negate(),n),0,1).toVar();
    const facet=hash21(floor(n.xy.mul(37)).add(floor(n.z.mul(19))));
    const body=u.shard.mul(facet.mul(.8).add(.6)).mul(facing.mul(.6).add(.4)).add(u.base.mul(pow(float(1).sub(facing),5)).mul(.05));
    const period=u.flow.x,uv=flowUv(aAlong,atan(aOrbit.y,aOrbit.x).div(TAU).add(.5)).toVar();
    const warp=tiled(u.flowMap,warpUv(uv),period).rg.sub(.5).toVar();
    const q=uv.add(warp.mul(u.turbulence)).sub(vec2(0,u.phase)).toVar();
    const stream=tiled(u.noise,q.mul(vec2(1,.5)),period).r.toVar();
    const evolve=tiled(u.noise,uv.mul(vec2(2,.35)).add(vec2(u.time.mul(.04),u.phase.mul(-.7))).add(warp.mul(.3)),period.mul(2)).g.toVar();
    const region=tiled(u.noise,uv.mul(vec2(1,.3)).add(vec2(.41,u.phase.mul(-.55).add(.17))),period).r.toVar();
    const pulse=tiled(u.noise,uv.mul(vec2(1,.2)).add(vec2(.73,u.phase.mul(-.8).add(.29))),period).r.toVar();
    const meter=max(length(fwidth(vObj)).mul(.7),1e-5).toVar();
    const contour=stream.mul(u.density).add(evolve.mul(.9)).toVar();
    const distance=abs(fract(contour).sub(.5)).mul(meter).div(max(fwidth(contour),1e-5));
    const thickness=u.filament.x.mul(mix(.2,1.6,evolve)).toVar();
    const filament=float(1).sub(smoothstep(thickness,thickness.add(meter),distance)).mul(clamp(thickness.mul(2).div(meter),0,1)).toVar();
    if(detail)filament.mulAssign(tiled(u.noise,q.mul(3),period.mul(3)).g.add(.5));
    const coverage=smoothstep(float(1).sub(u.filament.y),float(1.2).sub(u.filament.y),region);
    const pixels=aEdge.div(max(fwidth(aEdge),vec3(1e-5))).toVar(),edgePixels=min(min(pixels.x,pixels.y),pixels.z).toVar();
    const near=exp(edgePixels.negate().mul(meter).div(u.edge.z)),line=float(1).sub(smoothstep(0,u.edge.y,edgePixels));
    const edge=line.mul(smoothstep(.45,.7,pulse)).mul(u.edge.x);
    const knot=float(1).add(pow(clamp(stream.mul(region).mul(1.9),0,1),u.hotspots.y).mul(u.hotspots.x));
    const energy=filament.mul(coverage).mul(mix(.15,1,near)).add(edge).mul(knot).mul(u.emission);
    // The comic post's ACES bleaches channels above 1 to white; capping the brightest keeps the hue.
    const color=body.add(plasma(energy,stream.add(evolve.mul(.5)).add(aAlong.mul(.3)))).toVar();
    return color.div(max(float(1),max(color.r,max(color.g,color.b))));
  })();
  return material;
}

// Ribbon width is in authoring units, so it follows modelScale.
function ribbonClip(point,ahead,width){
  const across=normalize(cross(ahead.sub(point.xyz),cameraPosition.sub(point.xyz)));
  return cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(point.xyz.add(across.mul(width).mul(modelScale.x)),1));
}
export function createTongueMaterial(u,detail){
  const {flowUv,warpUv,plasma}=createField(u),material=ribbonMaterial();
  const aNormal=attribute('aNormal','vec3'),aRibbon=attribute('aRibbon','vec2'),aAnchor=attribute('aAnchor','vec4');
  const s=aRibbon.x,reach=u.tongue.x.mul(aAnchor.w);
  const tongue=at=>{
    const side=normalize(cross(u.aft,aNormal));
    const sway=u.flowMap.sample(warpUv(flowUv(aAnchor.x.add(at.mul(reach).mul(.35)),aAnchor.y)).add(aAnchor.z)).level(0).rg.sub(.5).mul(u.turbulence).mul(1.2);
    const rise=u.tongue.z.mul(float(1).sub(float(1).sub(at).mul(float(1).sub(at)))).mul(float(1).sub(u.sweep.mul(.6)));
    const trail=mix(at.mul(at).mul(.35),at,u.sweep);
    return positionLocal.add(aNormal.mul(rise).add(u.aft.mul(trail)).add(side.mul(sway.x).add(aNormal.mul(sway.y)).mul(at).mul(at)).mul(reach)).add(u.bend.mul(u.tongue.w).mul(at).mul(at));
  };
  material.vertexNode=Fn(()=>{
    const point=modelWorldMatrix.mul(vec4(tongue(s),1)).toVar(),ahead=modelWorldMatrix.mul(vec4(tongue(s.add(.03)),1)).xyz;
    const width=u.tongue.y.mul(aAnchor.w).mul(mix(.3,1,smoothstep(0,.3,s))).mul(pow(float(1).sub(s),.7)).mul(aRibbon.y);
    return ribbonClip(point,ahead,width);
  })();
  const vUv=varying(flowUv(aAnchor.x.add(s.mul(reach)),aAnchor.y)),vRibbon=varying(aRibbon);
  material.colorNode=Fn(()=>{
    const t=vRibbon.x,core=float(1).sub(abs(vRibbon.y)),q=vUv.add(vec2(vRibbon.y.mul(.06),u.phase.negate())).toVar();
    const stream=u.noise.sample(q.mul(vec2(1,.5))).r.toVar();
    if(detail)stream.addAssign(u.noise.sample(q.mul(3)).g.sub(.5).mul(.3));
    const lick=smoothstep(.3,.7,stream.add(float(1).sub(t).mul(.4)).sub(.25)),fade=smoothstep(0,.08,t).mul(pow(float(1).sub(t),1.1));
    return plasma(core.mul(core).mul(lick).mul(fade).mul(u.emission).mul(3),stream.add(t.mul(.5)));
  })();
  return material;
}
export function createCoilMaterial(u,detail){
  const {plasma}=createField(u),material=ribbonMaterial();
  const aAxis=attribute('aAxis','vec3'),aSide=attribute('aSide','vec3'),aCoil=attribute('aCoil','vec4');
  const s=aCoil.x;
  const coil=at=>{
    const theta=aCoil.z.add(at.mul(u.coilTwist.x)).mul(TAU).sub(u.phase.mul(u.coilTwist.y));
    const sway=u.flowMap.sample(vec2(theta.div(TAU),at.mul(.5).sub(u.time.mul(.1))).add(aCoil.z)).level(0).rg.sub(.5);
    const radius=mix(u.coil.z,u.coil.w,smoothstep(.35,1,at)).mul(float(1).add(sway.x.mul(u.turbulence).mul(u.coilTwist.w)));
    const up=cross(aAxis,aSide).mul(aCoil.w);
    return positionLocal.add(aAxis.mul(u.coil.x.add(at.mul(u.coil.y)).add(sway.y.mul(u.turbulence).mul(.1)))).add(aSide.mul(cos(theta)).add(up.mul(sin(theta))).mul(radius));
  };
  material.vertexNode=Fn(()=>{
    const point=modelWorldMatrix.mul(vec4(coil(s),1)).toVar(),ahead=modelWorldMatrix.mul(vec4(coil(s.add(.02)),1)).xyz;
    return ribbonClip(point,ahead,u.coilTwist.z.mul(sqrt(sin(s.mul(3.1415926)))).mul(aCoil.y));
  })();
  const vCoil=varying(aCoil.xy),vUv=varying(vec2(aCoil.z.mul(3),s.mul(u.coilTwist.x)));
  material.colorNode=Fn(()=>{
    const t=vCoil.x,core=float(1).sub(abs(vCoil.y));
    const stream=u.noise.sample(vUv.add(vec2(0,u.phase.mul(-1.4)))).r.toVar();
    if(detail)stream.addAssign(u.noise.sample(vUv.mul(3).sub(vec2(0,u.phase.mul(2)))).g.sub(.5).mul(.3));
    const strand=smoothstep(.35,.65,stream),fade=smoothstep(0,.15,t).mul(smoothstep(1,.8,t));
    return plasma(core.mul(core).mul(strand).mul(fade).mul(u.emission).mul(2.5),stream.add(t));
  })();
  return material;
}

// Turbo barely exceeds cruise speed, so held turbo (signals.boost) also boils the plasma over.
export function createPlasmaDrive(){return {phase:0,speed:0,length:0,sweep:0,turbulence:0,density:0,emission:0,burst:0};}
export function stepPlasmaDrive(drive,{level,speed,surge,boost:held=0},dt){
  const cruise=Math.max(level,THREE.MathUtils.clamp(speed,0,1)),boost=Math.max(THREE.MathUtils.clamp((speed-1)/(BOOST_RATIO-1),0,1),held);
  const sample=range=>(THREE.MathUtils.lerp(range.idle,range.cruise,cruise)+(range.boost-range.cruise)*boost)*(1+range.surge*surge);
  for(const key of Object.keys(PLASMA.drive))drive[key]=sample(PLASMA.drive[key]);
  drive.phase+=drive.speed*dt;
}

function dorsalLightPositions(root,shards){
  return [-1,1].map(side=>{
    const [dorsal]=shards.map(({mesh,geometry})=>{
      geometry.computeBoundingBox();
      const box=geometry.boundingBox.clone().applyMatrix4(meshToRoot(root,mesh));
      return {center:box.getCenter(new THREE.Vector3()),length:box.getSize(new THREE.Vector3()).z};
    }).filter(({center})=>Math.sign(center.x)===side).sort((a,b)=>b.length-a.length);
    return dorsal.center.setY(dorsal.center.y+PLASMA.light.lift);
  });
}
const IDLE={level:0,surge:0,speed:0,boost:0,bend:new THREE.Vector3(),time:0};

// Scaled to authoring units so every constant above applies unchanged.
export function createLomiPlasma(root,{crystals,exhausts,nozzles,scale,textures,quality=PLASMA_QUALITY[PLASMA.quality]}){
  const space=new THREE.Group();space.name='Plasma de Lomi';space.scale.setScalar(scale);root.add(space);space.updateWorldMatrix(true,false);
  const shards=crystals.map(mesh=>bakeShard(mesh,PLASMA.flow.direction.clone().transformDirection(meshToRoot(space,mesh).invert())));
  const uniforms=createPlasmaUniforms(textures),surface=createShardMaterial(uniforms,quality.detail);
  for(const {mesh,geometry} of shards){mesh.geometry.dispose();mesh.geometry=geometry;mesh.material=surface;}
  const ribbon=(geometry,material)=>{const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=1;space.add(mesh);return mesh;};
  const tongues=ribbon(createTongueGeometry(pickTongueAnchors(space,shards,quality.tongues),quality.segments),createTongueMaterial(uniforms,quality.detail));
  const coils=ribbon(createCoilGeometry(space,exhausts,PLASMA.coils.strands,quality.coils),createCoilMaterial(uniforms,quality.detail));
  const lights=dorsalLightPositions(space,shards).map(position=>{const light=new THREE.PointLight(PLASMA.colors.base,0,1,PLASMA.light.decay);light.position.copy(position);space.add(light);return light;});
  const black=new THREE.MeshBasicMaterial({color:0});for(const mesh of nozzles)mesh.material=black;
  const drive=createPlasmaDrive(),turn=new THREE.Quaternion(),worldScale=new THREE.Vector3();let lastTime=0;
  const plasma={root:space,uniforms,tongues,coils,lights,driven:false,
    update(signals,dt){
      stepPlasmaDrive(drive,signals,dt);
      const emission=drive.emission*PLASMA.intensity,unit=space.getWorldScale(worldScale).x;
      uniforms.time.value=signals.time;uniforms.phase.value=drive.phase;uniforms.turbulence.value=drive.turbulence;uniforms.density.value=drive.density;
      uniforms.emission.value=emission;uniforms.sweep.value=drive.sweep;uniforms.burst.value=Math.min(drive.burst,1);uniforms.tongue.value.x=drive.length;
      uniforms.bend.value.copy(signals.bend).applyQuaternion(root.getWorldQuaternion(turn).invert());
      tongues.visible=coils.visible=emission>0;
      // Point lights live in world units: scale distance and the inverse-square intensity with the ship.
      for(const light of lights){light.intensity=PLASMA.light.intensity*emission*unit*unit;light.distance=PLASMA.light.distance*unit;light.color.lerpColors(PLASMA.colors.base,PLASMA.colors.burst[0],uniforms.burst.value);}
    },
    idle(time,reduced){
      const dt=reduced?0:THREE.MathUtils.clamp(time-lastTime,0,.1);lastTime=time;IDLE.time=reduced?0:time;
      plasma.update(IDLE,dt);
    },
    dispose(){
      space.removeFromParent();
      for(const mesh of [tongues,coils]){mesh.geometry.dispose();mesh.material.dispose();}
      surface.dispose();black.dispose();
    }};
  plasma.update(IDLE,0);
  return plasma;
}
