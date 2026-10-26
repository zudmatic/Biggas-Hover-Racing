import * as THREE from 'three/webgpu';
import {uniform,uv,float,smoothstep,mix,vec4,step} from 'three/tsl';
import {VFXParticles,Appearance,Blending} from 'vanilla-vfx';
import {createDialKit} from '../dev-dials.js';
import {createPadBoostPalette,smoothBoostPower} from './pad-boost-palette.js';
import {createFlameMaterial} from './flame-material.js';
import {createFlameTrail} from './flame-trail.js';
import {createEngineCore} from './engine-core.js';
import {measureNozzleMouths,combineMouths} from './nozzle-mouth.js';

export async function createBoost(renderer,scene,ship){
  const padPalette=createPadBoostPalette(),fireColor=new THREE.Color(),coreColor=new THREE.Color(),edgeColor=new THREE.Color(),engineColor=new THREE.Color();
  const emberTint=uniform(new THREE.Color('#ff861f')),lineTint=uniform(new THREE.Color('#ffd18a'));
  const nozzles=ship.config.exhausts,flame=createFlameMaterial(),trail=createFlameTrail(scene,flame.material,nozzles),engine=createEngineCore(ship.root,nozzles);
  const color=uniform(new THREE.Color('#ff6b16')),hot=uniform(new THREE.Color('#fff1bc')),opacity=uniform(.13);
  const round=float(1).sub(smoothstep(.72,1,uv().mul(2).sub(1).length()));
  const fragments=new VFXParticles(renderer,{autoStart:false,maxParticles:1800,size:[.36,.6],lifetime:[.25,.5],speed:[6,9],
    fadeSize:[1,0],fadeOpacity:[1,0],appearance:Appearance.DEFAULT,blending:Blending.NORMAL,gravity:[0,.8,0],
    friction:{intensity:.12},turbulence:{intensity:8,frequency:2.3,speed:2.5},alphaTestNode:float(.01),opacityNode:()=>opacity.mul(round),
    colorNode:({progress},base)=>vec4(mix(hot,color,step(.25,progress)),flame.ditherAlpha(base.a))});
  const embers=new VFXParticles(renderer,{autoStart:false,maxParticles:400,size:[.04,.1],lifetime:[.26,.65],speed:[9,15],gravity:[0,-.3,0],
    fadeSize:[1,0],fadeOpacity:[1,0],appearance:Appearance.GRADIENT,blending:Blending.ADDITIVE,turbulence:{intensity:8,frequency:2,speed:1},stretchBySpeed:{factor:.15,maxStretch:4},colorNode:(_d,base)=>vec4(emberTint,flame.ditherAlpha(base.a))});
  const lineGeometry=new THREE.CapsuleGeometry(.025,.4,2,6);
  const lines=new VFXParticles(renderer,{autoStart:false,maxParticles:200,geometry:lineGeometry,orientToDirection:true,orientAxis:'y',size:[.3,.55],lifetime:[.2,.4],speed:[10,18],gravity:[0,.1,0],
    fadeSize:[1,0],fadeOpacity:[1,0],blending:Blending.ADDITIVE,turbulence:{intensity:2,frequency:2,speed:1},stretchBySpeed:{factor:.15,maxStretch:6},opacityNode:()=>float(.8),colorNode:(_d,base)=>vec4(lineTint,flame.ditherAlpha(base.a))});
  const systems=[fragments,embers,lines];
  try{for(const system of systems){await system.init();system.stop();scene.add(system.object3D);}}
  catch(error){for(const system of systems)system.dispose();trail.dispose();engine.dispose();flame.material.dispose();lineGeometry.dispose();throw error;}
  const kit=createDialKit('Propulsor · WebGPU',{
    Llama:true,Motor:true,'Densidad llama':[1,.1,1,.01],Longitud:[4.6,.2,9,.1],Ancho:[1.22,.1,3,.02],Turbulencia:[.4,0,6,.1],'Fade base':[.25,0,.5,.01],'Separación boca':[0,-.3,.5,.01],'Llama mínima':[.7,0,2,.05],
    Trama:{type:'select',options:['Apagado','Damero','Dither'],default:'Dither'},
    'Intensidad trama':[.6,0,1,.05],'Tamaño trama':[2,1,8,1],
    'Estela partículas':[8,.5,8,.1],'Seguir nave':[1,0,1,.05],
    Fragmentos:true,'Cantidad fragmentos':[600,0,600,5],'Tamaño fragmentos':[.6,.05,1.2,.01],'Duración fragmentos':[.5,.09,1,.01],
    'Opacidad fragmentos':[.13,0,1,.01],Brasas:true,
    'Cantidad brasas':[71,0,300,1],'Tamaño brasas':[.1,.03,.4,.01],'Duración brasas':[.65,.09,1,.01],
    'Chispas lineales':true,'Cantidad chispas':[22,0,150,1],'Tamaño chispas':[.55,.1,1.5,.05],'Duración chispas':[.4,.09,1,.01],
    Calor:true,'Intensidad calor':[2,0,2,.05],
  },{id:'webgpu-boost',persist:false,defaultCollapsed:true});
  const unsubscribe=kit.subscribe(v=>{
    opacity.value=v['Opacidad fragmentos'];fragments.setProps({size:[v['Tamaño fragmentos']*.6,v['Tamaño fragmentos']],lifetime:[v['Duración fragmentos']*.5,v['Duración fragmentos']]});
    embers.setProps({size:[v['Tamaño brasas']*.4,v['Tamaño brasas']]});
    lines.setProps({size:[v['Tamaño chispas']*.55,v['Tamaño chispas']]});
    [v.Fragmentos,v.Brasas,v['Chispas lineales']].forEach((on,i)=>{systems[i].object3D.visible=on;if(!on)systems[i].clear();});
  });
  // Model mouths are static: measure once (the engine insert is skipped and reports its own lip per frame).
  const modelMouths=measureNozzleMouths(ship.root,nozzles);
  let power=0,time=0,quality=1;const previous=new THREE.Vector3(),worldPosition=new THREE.Vector3(),velocity=new THREE.Vector3();let positioned=false;const accumulators=[0,0,0],origin=new THREE.Vector3(),direction=new THREE.Vector3();
  const stats={emitted:0,power:0,palette:'Rojo',capacity:2400,particleLifetimes:[0,0,0],emittedByLayer:[0,0,0]};
  function clear(){systems.forEach(s=>s.clear());trail.clear();accumulators.fill(0);stats.emitted=0;stats.emittedByLayer.fill(0);positioned=false;}
  return {kit,stats,clear,setQuality(lite){quality=lite?.55:1;},
    async update(dt,mode,enabled,padBoost=false){
      ship.root.getWorldPosition(worldPosition);
      const distance=positioned?worldPosition.distanceTo(previous):0;
      const motionSpeed=dt>0&&distance<15?distance/dt:0;
      velocity.subVectors(worldPosition,previous).multiplyScalar(dt>0&&positioned&&distance<15?1/dt:0);
      if(distance>=15)clear();previous.copy(worldPosition);positioned=true;
      time+=dt;const v=kit.values,target=enabled?({Turbo:1,Aceleración:.45,Reposo:.13,Soltar:0}[mode]??0):0;
      power=smoothBoostPower(power,target,dt);if(!enabled)power=0;
      const blue=mode==='Turbo';stats.power=power;stats.palette=padBoost?'Verde · placa':blue?'Azul':'Rojo';
      padPalette.update(dt,enabled&&padBoost);
      flame.update(time,v,blue);
      padPalette.apply(fireColor,blue?'#42a4ff':'#ff6b16');padPalette.apply(coreColor,blue?'#9e8c00':'#fff1bc',true);flame.setColors(fireColor,coreColor);
      padPalette.apply(color.value,blue?'#86a5ff':'#ff6b16');padPalette.apply(hot.value,'#fff1bc',true);
      padPalette.apply(emberTint.value,'#ff861f');padPalette.apply(lineTint.value,'#ffd18a',true);
      padPalette.apply(edgeColor,blue?'#42a4ff':'#ff5812');padPalette.apply(engineColor,'#fff1b0',true);
      ship.root.updateMatrixWorld(true);trail.record(time,ship.root);
      engine.update(dt,time,power,{Activo:enabled&&v.Motor,Profundidad:2.25,Intensidad:1.1,Tamaño:1.225,Enfriamiento:.85,Pulsación:.04,'Luz cercana':.5,'Color borde':edgeColor,'Color centro':engineColor});
      trail.update(time,{Activa:enabled&&v.Llama,Longitud:v.Longitud,Ancho:v.Ancho,Pulsación:.02,Bocas:combineMouths(modelMouths,engine.mouths()),Separación:v['Separación boca'],Mínima:v['Llama mínima']},power,7.5,.8);
      const rates=[v.Fragmentos?v['Cantidad fragmentos']:0,v.Brasas?v['Cantidad brasas']:0,v['Chispas lineales']?v['Cantidad chispas']:0],speeds=[7.5,12,14],spread=[.33,.64,.22];
      const durations=[v['Duración fragmentos'],v['Duración brasas'],v['Duración chispas']];
      for(let j=0;j<systems.length;j++){
        // Keep small accents in low quality; reduce only the dense flame filler.
        accumulators[j]+=dt*rates[j]*Math.sqrt(power)*(j===0?quality:1);const count=Math.floor(accumulators[j]);accumulators[j]-=count;
        const relativeSpeed=motionSpeed*(1-v['Seguir nave'])+speeds[j]*1.25;
        const budget=v['Estela partículas']*ship.root.scale.x*(j===0?.75:1.7);
        // A minimum visible lifespan avoids deleting a newly emitted spark in one update.
        const life=Math.max(.09,Math.min(durations[j],budget/Math.max(1,relativeSpeed)));
        stats.particleLifetimes[j]=life;
        for(const [x,y,z] of nozzles){
          origin.set(x,y,z).applyMatrix4(ship.root.matrixWorld);
          for(let i=0;i<count;i++){
            direction.set((Math.random()-.5)*spread[j],(Math.random()-.5)*spread[j],-1).normalize().transformDirection(ship.root.matrixWorld);
            direction.multiplyScalar(speeds[j]*(.75+Math.random()*.5)).addScaledVector(velocity,v['Seguir nave']);
            const speed=direction.length();direction.normalize();
            systems[j].spawn(origin.x,origin.y,origin.z,1,{lifetime:[life*.85,life],direction:[[direction.x,direction.x],[direction.y,direction.y],[direction.z,direction.z]],speed:[speed,speed]});stats.emitted++;stats.emittedByLayer[j]++;
          }
        }
        if(dt>0)await systems[j].system.update(dt);
      }
    },
    updateHeat(heat){const v=kit.values;heat.setNozzles(nozzles);heat.update(ship.root,time*3,power,v.Calor?v['Intensidad calor']:0,.9,8,1.2);},
    dispose(){unsubscribe();kit.destroy();systems.forEach(s=>s.dispose());lineGeometry.dispose();trail.dispose();engine.dispose();flame.material.dispose();},
  };
}
