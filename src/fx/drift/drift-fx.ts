import * as THREE from 'three';
import {createSmokeMaterial} from './smoke-material';

const corners=[[-.5,0],[.5,0],[.5,1],[-.5,0],[.5,1],[-.5,1]];

function batch(root,capacity,texture,ground,materialFactory){
  const geometry=new THREE.BufferGeometry();
  for(const [name,size] of [['position',3],['uv',2],['fx',3]])geometry.setAttribute(name,new THREE.BufferAttribute(new Float32Array(capacity*6*size),size).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0,0);
  const material=(materialFactory??createSmokeMaterial)(texture,ground);
  material.userData.retro=true;
  const mesh=new THREE.Mesh(geometry,material);mesh.name=ground?'FX · roces de hover':'FX · humo y chispas';mesh.frustumCulled=false;root.add(mesh);
  return {geometry,material,mesh,write(i,point,u,v,fade,frame,warm=0){geometry.attributes.position.setXYZ(i,...point);geometry.attributes.uv.setXY(i,u,v);geometry.attributes.fx.setXYZ(i,fade,frame,warm);},finish(count){geometry.setDrawRange(0,count*6);for(const a of Object.values(geometry.attributes))a.needsUpdate=true;},dispose(){geometry.dispose();material.dispose();mesh.removeFromParent();}};
}

/** Cosmetic only. Pools are bounded; no vehicle state or collision data is mutated. */
export function createFlightFx(root,{surfaceHeight,texture,mobile=false,random=Math.random,materialFactory}={}){
  const group=new THREE.Group();group.name='FX · pixel-cómic';root.add(group);
  const air=batch(group,mobile?40:96,texture,false,materialFactory),ground=batch(group,mobile?64:160,texture,true,materialFactory);
  const particles=Array.from({length:mobile?40:96},()=>({life:0})),marks=Array.from({length:mobile?64:160},()=>({life:0}));
  let cursor=0,markCursor=0,emission=0,last=null,trailDistance=0,disposed=false,style='hybrid',nextEmission=1,supportCursor=0;
  const settings={size:1.3,lifetime:1.5,fourSupports:false};
  air.material.uniforms.style.value=1;
  const right=new THREE.Vector3(1,0,0),up=new THREE.Vector3(0,1,0);
  const stats={air:0,marks:0,emitted:0,markEmitted:0,time:0};group.userData.stats=stats;
  function puff(state,side,scale,spark=false,front=false){
    // Pick once at birth: the mixed plume keeps both silhouettes without morphing.
    const hybrid=style==='hybrid'||(style==='mixed'&&random()<.6);
    const half=state.hull?.halfWidth??1.52*scale,rear=(state.hull?.halfLength??2.4*scale)*.65*(front?-1:1);
    const sx=Math.sin(state.yaw),sz=Math.cos(state.yaw),p=particles[cursor++%particles.length];
    const life=spark?.12+random()*.12:(.4+random()*.35)*settings.lifetime,lateral=(state.slip??0)*state.speed;
    const scatter=(random()-.5)*.4*scale;
    Object.assign(p,{life,total:life,x:state.x-sx*rear+sz*(half*side+scatter),y:state.y-.22*scale,z:state.z-sz*rear-sx*(half*side+scatter),
      vx:state.vx*.08+sz*(lateral*.22+side*.5),vy:spark?.3:.15+random()*.25,vz:state.vz*.08-sx*(lateral*.22+side*.5),
      size:(spark?.65+random()*.35:(hybrid?1.2+random()*.8:.65+random()*.75)*settings.size)*scale,angle:random()*Math.PI*2,spin:(random()-.5)*1.8,seed:random()*999+(hybrid?1000:0),spark,warm:state.braking?1:0});stats.emitted++;
  }
  function mark(state,side,scale,x,z,dx,dz){
    const length=Math.hypot(dx,dz);if(length<.001)return;
    const nx=-dz/length,nz=dx/length,half=state.hull?.halfWidth??1.52*scale,rear=(state.hull?.halfLength??2.4*scale)*.65;
    const cx=x-Math.sin(state.yaw)*rear+Math.cos(state.yaw)*half*side,cz=z-Math.cos(state.yaw)*rear-Math.sin(state.yaw)*half*side;
    const width=.15*scale,len=.52*scale,points=[];
    for(const [u,v] of corners){const px=cx+nx*u*width+dx/length*(v-.5)*len,pz=cz+nz*u*width+dz/length*(v-.5)*len,y=surfaceHeight(px,pz);
      if(y==null||!Number.isFinite(y)||Math.abs(y-(state.y-state.hover))>1.2)return;
      points.push([px,y+.028,pz]);}
    Object.assign(marks[markCursor++%marks.length],{life:2,total:2,points});stats.markEmitted++;
  }
  function reset(){for(const p of particles)p.life=0;for(const m of marks)m.life=0;emission=trailDistance=0;nextEmission=1;supportCursor=0;last=null;stats.air=stats.marks=stats.emitted=stats.markEmitted=stats.time=0;air.finish(0);ground.finish(0);}
  function update(dt,{state,phase='flying',camera,scale=1,reduced=false}={}){
    if(disposed)return;
    const tick=phase==='flying'?Math.max(0,Math.min(dt,.1)):0;
    stats.time+=tick;group.visible=!reduced;
    if(camera){camera.updateMatrixWorld();right.setFromMatrixColumn(camera.matrixWorld,0);up.setFromMatrixColumn(camera.matrixWorld,1);}
    for(const p of particles){p.life-=tick;if(p.life>0){p.x+=p.vx*tick;p.y+=p.vy*tick;p.z+=p.vz*tick;p.vx*=Math.exp(-tick*2);p.vz*=Math.exp(-tick*2);p.angle+=p.spin*tick;}}
    for(const m of marks)m.life-=tick;
    const slide=Math.abs(state.slip??0)*state.speed;
    const active=!reduced&&state.speed>8&&(state.braking||(state.drifting&&slide>.65));
    if(tick>0){
      if(active){
        const strength=state.braking?Math.min(1,state.speed/28):Math.min(1,slide/6);
        const rate=(mobile?30:55)*strength;emission+=tick*rate;
        while(emission>=nextEmission){emission-=nextEmission;nextEmission=.7+random()*.6;
          const outside=Math.sign(state.slip??0)||1,support=supportCursor++%4;
          const side=settings.fourSupports?(support%2===0?-1:1):(random()<.68?outside:-outside),front=settings.fourSupports&&support>=2;
          puff(state,side,scale,false,front);if((state.impact>1||slide>7)&&random()<.06)puff(state,side,scale,true,front);}
        if(last){const dx=state.x-last.x,dz=state.z-last.z,d=Math.hypot(dx,dz);
          if(d<Math.max(4,state.speed*tick*2)){
            const spacing=.65*scale;let offset=spacing-trailDistance;
            for(;offset<=d;offset+=spacing){const f=offset/d;for(const side of [-1,1])mark(state,side,scale,last.x+dx*f,last.z+dz*f,dx,dz);}
            trailDistance=(trailDistance+d)%spacing;
          }else trailDistance=0;
        }
        last={x:state.x,z:state.z};
      }else{emission=trailDistance=0;last=null;}
    }
    if(reduced){for(const p of particles)p.life=0;for(const m of marks)m.life=0;last=null;emission=trailDistance=0;}
    let n=0;
    for(const p of particles){if(p.life<=0)continue;const age=1-p.life/p.total,size=p.size*(.55+age*1.1),frame=p.spark?-1:p.seed,c=Math.cos(p.angle),s=Math.sin(p.angle);
      for(let k=0;k<6;k++){const [u,v]=corners[k],rx=(u*c-(v-.5)*s)*size,ry=(u*s+(v-.5)*c)*size;
        air.write(n*6+k,[p.x+right.x*rx+up.x*ry,p.y+right.y*rx+up.y*ry,p.z+right.z*rx+up.z*ry],u+.5,v,Math.min(.85,p.life/.25),frame,p.warm);}n++;}
    stats.air=n;air.finish(n);n=0;
    for(const m of marks){if(m.life<=0)continue;for(let k=0;k<6;k++){const [u,v]=corners[k];ground.write(n*6+k,m.points[k],u+.5,v,Math.min(.85,m.life/.65),0);}n++;}
    stats.marks=n;ground.finish(n);
  }
  return {update,reset,stats,group,configure({size,lifetime,fourSupports,color,density,grain}={}){if(Number.isFinite(size))settings.size=THREE.MathUtils.clamp(size,.5,2.5);if(Number.isFinite(lifetime))settings.lifetime=THREE.MathUtils.clamp(lifetime,.5,3);if(typeof fourSupports==='boolean')settings.fourSupports=fourSupports;
    if(typeof color==='string'&&/^#[\da-f]{6}$/i.test(color))air.material.uniforms.smokeColor.value.set(color);
    if(Number.isFinite(density))air.material.uniforms.smokeDensity.value=THREE.MathUtils.clamp(density,.15,1);
    if(Number.isFinite(grain))air.material.uniforms.screenGrain.value=THREE.MathUtils.clamp(grain,1,4);
  },get style(){return style;},setStyle(value){if(!['procedural','hybrid','mixed'].includes(value)||value===style)return;style=value;air.material.uniforms.style.value=value==='mixed'?2:value==='hybrid'?1:0;reset();},dispose(){if(disposed)return;disposed=true;air.dispose();ground.dispose();texture?.dispose();group.removeFromParent();}};
}

export async function loadFlightFx(root,options){
  const texture=await new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}images/fx/pixel-comic-source-v1.png`);
  texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;
  return createFlightFx(root,{...options,texture});
}
