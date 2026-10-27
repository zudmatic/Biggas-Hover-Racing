import * as THREE from 'three/webgpu';
import {float,positionWorld,texture,vec2} from 'three/tsl';
import {createDialKit} from '@/core/debug/dials';
import {CIRCUIT_BOOST} from '../../sim/hover-physics';
import {createWaterFxMaterial} from './hover-material';

export const HOVER_WATER_FX=Object.freeze({
  foamCount:192,sprayCount:128,splashCount:24,
  mobileFoamCount:96,mobileSprayCount:64,mobileSplashCount:16,
  gravity:12,maxBirthsPerFrame:16,
});

// Bounded instance pools like skid effects. No rings, compute dependency,
// offscreen pass, texture downloads, or per-frame geometry allocation.
export function createHoverWaterEffects({root,river,heightAt,mobile=false}){
  const config=HOVER_WATER_FX,group=new THREE.Group();group.name='Desert hover foam and splashes';root.add(group);
  const info=river.coverageInfo;
  const maskUV=positionWorld.xz.sub(vec2(...info.minXZ)).div(vec2(...info.sizeXZ));
  const inBounds=maskUV.x.greaterThan(0).and(maskUV.x.lessThan(1)).and(maskUV.y.greaterThan(0)).and(maskUV.y.lessThan(1)).select(float(1),float(0));
  const wetMask=texture(river.coverage,maskUV).r.mul(inBounds);
  const dummy=new THREE.Object3D(),right=new THREE.Vector3(),up=new THREE.Vector3();
  function pool(kind,count){
    const geometry=new THREE.PlaneGeometry(1,1);
    if(kind==='foam')geometry.rotateX(-Math.PI/2);
    const data=new THREE.InstancedBufferAttribute(new Float32Array(count*3),3).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('waterFxData',data);
    const shader=createWaterFxMaterial(kind,wetMask),mesh=new THREE.InstancedMesh(geometry,shader.material,count);
    mesh.name='Water '+kind+' pool';mesh.frustumCulled=false;mesh.renderOrder=3;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(mesh);
    const items=Array.from({length:count},()=>({life:0,total:1,x:0,y:0,z:0,vx:0,vy:0,vz:0,width:1,length:1,angle:0,opacity:0,seed:0}));
    return {kind,mesh,geometry,shader,data,items,cursor:0,emission:0};
  }
  const foam=pool('foam',mobile?config.mobileFoamCount:config.foamCount);
  const spray=pool('spray',mobile?config.mobileSprayCount:config.sprayCount);
  const splash=pool('splash',mobile?config.mobileSplashCount:config.splashCount),pools=[foam,spray,splash];
  const kit=createDialKit('Agua · espuma y salpicones',{
    Activo:true,Intensidad:[1,0,2,.05],Densidad:[1,0,2,.05],Espuma:true,Salpicones:true,
    'Ancho espuma':[1.1,.25,3,.05],'Persistencia espuma':[1.35,.2,4,.05],
    'Tamaño lento':[.1,.05,.6,.01],'Tamaño rápido':[.6,.1,.6,.01],
    'Altura salpicón':[1.1,.2,2.6,.05],'Altura máxima':[2.6,.2,2.6,.05],
    'Alcance lateral':[1,.2,2,.05],
    'Cerca del agua':[.9,.2,2,.05],'Altura de corte':[3.2,1,8,.1],
    'Velocidad mínima':[3,0,25,1],'Velocidad plena':[35,10,80,1],
    'Respuesta velocidad':[.7,.3,2,.05],Trama:[.3,0,1,.05],
  },{id:'desert-water-fx-v2',persist:true,defaultCollapsed:false});
  let strength=0,lastX=null,lastZ=null,disposed=false;
  const random=Math.random;
  function acquire(p,x,z,life,opacity){
    if(!river.isWet(x,z))return null;
    const item=p.items[p.cursor];p.cursor=(p.cursor+1)%p.items.length;
    Object.assign(item,{x,z,y:heightAt(x,z)+.08,life,total:life,opacity,seed:random()*100,
      vx:0,vy:0,vz:0,angle:0,width:1,length:1});return item;
  }
  function reset(){
    for(const p of pools){for(const item of p.items)item.life=0;p.data.array.fill(0);p.data.needsUpdate=true;p.emission=0;}
    strength=0;lastX=lastZ=null;group.visible=false;
  }
  reset();
  return {
    kit,reset,
    get triangles(){return pools.reduce((sum,p)=>sum+p.items.length*2,0);},
    update(dt,{state,camera,phase,night=false,reduced=false,scale=1}){
      if(disposed||!state||!camera)return;
      const v=kit.values;
      if(reduced||!v.Activo){reset();return;}
      const elapsed=phase==='flying'?Math.max(0,Math.min(dt,.1)):0;
      const distance=lastX===null?0:Math.hypot(state.x-lastX,state.z-lastZ);
      if(distance>30)reset();
      const previousX=lastX??state.x,previousZ=lastZ??state.z;
      lastX=state.x;lastZ=state.z;
      const wet=river.isWet(state.x,state.z),altitude=state.y-heightAt(state.x,state.z);
      const cutoff=Math.max(v['Cerca del agua']+.1,v['Altura de corte']);
      const proximity=wet?1-THREE.MathUtils.smoothstep(altitude,v['Cerca del agua'],cutoff):0;
      const speed=Math.max(0,state.speed),minSpeed=v['Velocidad mínima'];
      const speedStrength=THREE.MathUtils.clamp((speed-minSpeed)/Math.max(1,v['Velocidad plena']-minSpeed),0,1)**v['Respuesta velocidad'];
      // Dimensions follow actual m/s up to the physics turbo ceiling (72 m/s),
      // independently of the emission response and without a boost-toggle jump.
      const splashProgress=THREE.MathUtils.smoothstep(speed,minSpeed,CIRCUIT_BOOST);
      const sizeHigh=THREE.MathUtils.clamp(v['Tamaño rápido'],.05,.6);
      const sizeLow=THREE.MathUtils.clamp(v['Tamaño lento'],.05,sizeHigh);
      const heightHigh=THREE.MathUtils.clamp(v['Altura máxima'],.2,2.6);
      const heightLow=THREE.MathUtils.clamp(v['Altura salpicón'],.2,heightHigh);
      const splashSize=THREE.MathUtils.lerp(sizeLow,sizeHigh,splashProgress);
      const splashHeight=THREE.MathUtils.lerp(heightLow,heightHigh,splashProgress);
      strength+=(proximity-strength)*(1-Math.exp(-elapsed*15));
      const power=Math.min(proximity,strength)*v.Intensidad;
      const fx=Math.sin(state.yaw),fz=Math.cos(state.yaw),rx=fz,rz=-fx,span=Math.max(.5,scale);
      const half=state.hull?.halfWidth??1.52*span,rear=(state.hull?.halfLength??2.4*span)*.7;
      const moving=elapsed>0&&wet&&power>.01&&v.Densidad>0;
      const quality=mobile?.65:1;
      const rates=[v.Espuma?(7+Math.min(speed,90)*1.6)*(.15+.85*speedStrength):0,
        v.Salpicones?100*speedStrength:0,v.Salpicones?15*speedStrength:0];
      for(let j=0;j<pools.length;j++){
        const p=pools[j];p.shader.configure(night,v.Trama);
        const enabled=p===foam?v.Espuma:v.Salpicones;
        if(!enabled){p.emission=0;for(const item of p.items)item.life=0;}
        if(moving&&enabled){
          p.emission+=elapsed*rates[j]*v.Densidad*Math.min(1,power)*quality;
          const count=Math.min(config.maxBirthsPerFrame,Math.floor(p.emission));p.emission-=Math.floor(p.emission);
          for(let i=0;i<count;i++){
            // Interpolate births along this frame's travel, as skid marks do.
            const t=(i+.5)/count,cx=THREE.MathUtils.lerp(previousX,state.x,t),cz=THREE.MathUtils.lerp(previousZ,state.z,t);
            const side=random()<.5?-1:1,lateral=side*half*(.75+random()*.25);
            const x=cx-fx*rear+rx*lateral,z=cz-fz*rear+rz*lateral;
            if(!river.isWet(cx,cz))continue;
            if(p===foam){
              const item=acquire(p,x,z,v['Persistencia espuma']*(.7+random()*.6),.65*power);
              if(item)Object.assign(item,{angle:state.yaw+(random()-.5)*1.4,
                width:v['Ancho espuma']*span*(.7+random()*.65),length:(1.2+random()*1.7)*span,
                vx:rx*side*(.3+speedStrength*.65),vz:rz*side*(.3+speedStrength*.65)});
            }else{
              const height=splashHeight*(.45+random()*.55),vy=Math.sqrt(2*config.gravity*height);
              const life=Math.min(vy*2/config.gravity,p===splash?.4:1.35);
              const item=acquire(p,x,z,life,(p===splash?.5:.85)*power);
              if(item){
                const outward=side*(2+random()*3)*v['Alcance lateral']*(.4+.6*speedStrength);
                const size=splashSize*span*(.55+random()*.45);
                Object.assign(item,{width:p===splash?size*4:size,length:p===splash?size*5:size*(1.8+random()*1.4),
                  vx:(state.vx??fx*speed)*.72+rx*outward-fx,vy,vz:(state.vz??fz*speed)*.72+rz*outward-fz});
              }
            }
          }
        }else p.emission=0;
      }
      camera.updateMatrixWorld();right.setFromMatrixColumn(camera.matrixWorld,0);up.setFromMatrixColumn(camera.matrixWorld,1);
      let visible=false;
      for(const p of pools){
        for(let i=0;i<p.items.length;i++){
          const item=p.items[i];item.life=Math.max(0,item.life-elapsed);
          if(item.life>0){
            item.x+=item.vx*elapsed;item.z+=item.vz*elapsed;
            if(p!==foam){item.vy-=config.gravity*elapsed;item.y+=item.vy*elapsed;}
            if(!river.isWet(item.x,item.z)||(p!==foam&&item.y<heightAt(item.x,item.z)))item.life=0;
          }
          if(item.life<=0){p.data.setXYZ(i,0,0,0);dummy.scale.setScalar(0);}
          else{
            const age=1-item.life/item.total,fade=Math.min(1,age/.07+.2)*(1-age)**1.35;
            if(p===foam){
              dummy.position.set(item.x,heightAt(item.x,item.z)+.07,item.z);dummy.rotation.set(0,item.angle,0);
              dummy.scale.set(item.width*(1+age*.7),1,item.length*(1+age*.35));
            }else{
              dummy.position.set(item.x,item.y,item.z);dummy.quaternion.copy(camera.quaternion);
              // The droplet's long axis follows its projected velocity.
              const dx=item.vx*right.x+item.vy*right.y+item.vz*right.z;
              const dy=item.vx*up.x+item.vy*up.y+item.vz*up.z;
              dummy.rotateZ(-Math.atan2(dx,dy));
              dummy.scale.set(item.width*(1-age*.35),item.length*(1-age*.2),1);
            }
            p.data.setXYZ(i,Math.min(1,item.opacity*fade),item.seed,age);visible=true;
          }
          dummy.updateMatrix();p.mesh.setMatrixAt(i,dummy.matrix);
        }
        p.data.needsUpdate=true;p.mesh.instanceMatrix.needsUpdate=true;
      }
      group.visible=visible;
    },
    dispose(){if(disposed)return;disposed=true;kit.destroy();group.removeFromParent();for(const p of pools){p.mesh.dispose();p.geometry.dispose();p.shader.material.dispose();}},
  };
}
