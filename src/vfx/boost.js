import * as THREE from 'three/webgpu';
import {uniform,uv,float,smoothstep,mix,vec4} from 'three/tsl';
import {VFXParticles,Appearance,Blending} from 'vanilla-vfx';
import {createDialKit} from 'dialkit/vanilla';
import {createFlameMaterial} from './flame-material.js';
import {createFlameTrail} from './flame-trail.js';
import {createEngineCore} from './engine-core.js';

export async function createBoost(renderer,scene,ship){
  const nozzles=ship.config.exhausts,flame=createFlameMaterial(),trail=createFlameTrail(scene,flame.material,nozzles),engine=createEngineCore(ship.root,nozzles);
  const color=uniform(new THREE.Color('#ff6b16')),hot=uniform(new THREE.Color('#fff1bc')),opacity=uniform(.18);
  const round=float(1).sub(smoothstep(0,1,uv().mul(2).sub(1).length())).pow(2);
  const fragments=new VFXParticles(renderer,{autoStart:false,maxParticles:1800,size:[.36,.6],lifetime:[.25,.5],speed:[6,9],
    fadeSize:[1,0],fadeOpacity:[1,0],appearance:Appearance.DEFAULT,blending:Blending.NORMAL,gravity:[0,.8,0],
    turbulence:{intensity:2,frequency:2.3,speed:2.5},alphaTestNode:float(.01),opacityNode:()=>opacity.mul(round),
    colorNode:({progress},base)=>vec4(mix(hot,color,smoothstep(0,.55,progress)),base.a)});
  const embers=new VFXParticles(renderer,{autoStart:false,maxParticles:400,size:[.04,.1],lifetime:[.26,.65],speed:[9,15],gravity:[0,-.3,0],
    fadeSize:[1,0],fadeOpacity:[1,0],appearance:Appearance.GRADIENT,blending:Blending.ADDITIVE,turbulence:{intensity:8,frequency:2,speed:1},colorNode:(_d,base)=>vec4(color,base.a)});
  const lineGeometry=new THREE.CapsuleGeometry(.025,.4,2,6);
  const lines=new VFXParticles(renderer,{autoStart:false,maxParticles:200,geometry:lineGeometry,orientToDirection:true,orientAxis:'y',size:[.3,.55],lifetime:[.2,.4],speed:[10,18],gravity:[0,.1,0],
    fadeSize:[1,0],fadeOpacity:[1,0],blending:Blending.ADDITIVE,turbulence:{intensity:2,frequency:2,speed:1},colorNode:(_d,base)=>vec4(hot,base.a.mul(.8))});
  const systems=[fragments,embers,lines];
  try{for(const system of systems){await system.init();system.stop();scene.add(system.object3D);}}
  catch(error){for(const system of systems)system.dispose();trail.dispose();engine.dispose();flame.material.dispose();lineGeometry.dispose();throw error;}
  const kit=createDialKit('Propulsor · WebGPU',{
    Llama:true,Motor:true,'Densidad llama':[.82,.1,1,.01],Longitud:[2.7,.2,9,.1],Ancho:[.7,.1,3,.02],Turbulencia:[1.3,0,6,.1],
    Trama:{type:'select',options:['Apagado','Damero','Dither'],default:'Dither'},
    Fragmentos:true,'Cantidad fragmentos':[600,0,600,5],'Tamaño fragmentos':[.24,.05,1.2,.05],'Duración fragmentos':[.18,.02,1,.01],
    'Opacidad fragmentos':[.18,0,1,.01],Brasas:true,'Chispas lineales':true,
    Calor:true,'Intensidad calor':[.25,0,2,.05],
  },{id:'webgpu-boost',persist:false,defaultCollapsed:true});
  const unsubscribe=kit.subscribe(v=>{
    opacity.value=v['Opacidad fragmentos'];fragments.setProps({size:[v['Tamaño fragmentos']*.6,v['Tamaño fragmentos']],lifetime:[v['Duración fragmentos']*.5,v['Duración fragmentos']]});
    [v.Fragmentos,v.Brasas,v['Chispas lineales']].forEach((on,i)=>{systems[i].object3D.visible=on;if(!on)systems[i].clear();});
  });
  let power=0,time=0,quality=1;const previous=new THREE.Vector3(),worldPosition=new THREE.Vector3();let positioned=false;const accumulators=[0,0,0],origin=new THREE.Vector3(),direction=new THREE.Vector3();
  const stats={emitted:0,power:0,palette:'Rojo',capacity:2400};
  function clear(){systems.forEach(s=>s.clear());trail.clear();accumulators.fill(0);stats.emitted=0;positioned=false;}
  return {kit,stats,clear,setQuality(lite){quality=lite?.55:1;},
    async update(dt,mode,enabled){
      ship.root.getWorldPosition(worldPosition);
      const distance=positioned?worldPosition.distanceTo(previous):0;
      const motionSpeed=dt>0&&distance<15?distance/dt:0;
      if(distance>=15)clear();previous.copy(worldPosition);positioned=true;
      time+=dt;const v=kit.values,target=enabled?({Turbo:1,Aceleración:.45,Reposo:.13,Soltar:0}[mode]??0):0;
      power+=(target-power)*(1-Math.exp(-dt*(target>power?12:18)));if(!enabled)power=0;
      const blue=mode==='Turbo';stats.power=power;stats.palette=blue?'Azul':'Rojo';
      flame.update(time,v,blue);color.value.set(blue?'#86a5ff':'#ff6b16');
      ship.root.updateMatrixWorld(true);trail.record(time,ship.root);
      trail.update(time,{Activa:enabled&&v.Llama,Longitud:v.Longitud,Ancho:v.Ancho,Pulsación:.02},power,7.5,.8);
      engine.update(dt,time,power,{Activo:enabled&&v.Motor,Profundidad:2.25,Intensidad:1.1,Tamaño:1.225,Enfriamiento:.85,Pulsación:.04,'Luz cercana':.5,'Color borde':blue?'#42a4ff':'#ff5812','Color centro':'#fff1b0'});
      const rates=[v.Fragmentos?v['Cantidad fragmentos']:0,v.Brasas?71:0,v['Chispas lineales']?22:0],speeds=[7.5,12,14],spread=[.33,.64,.22];
      for(let j=0;j<systems.length;j++){
        accumulators[j]+=dt*rates[j]*target*quality;const count=Math.floor(accumulators[j]);accumulators[j]-=count;
        for(const [x,y,z] of nozzles){
          origin.set(x,y,z).applyMatrix4(ship.root.matrixWorld);
          for(let i=0;i<count;i++){
            direction.set((Math.random()-.5)*spread[j],(Math.random()-.5)*spread[j],-1).normalize().transformDirection(ship.root.matrixWorld);
            const length=v.Longitud*Math.max(power,.13)*ship.root.scale.x;
            const life=Math.min(j===0?v['Duración fragmentos']:j===1?.22:.16,length*1.15/Math.max(1,motionSpeed+speeds[j]*1.25));
            systems[j].spawn(origin.x,origin.y,origin.z,1,{lifetime:[life*.65,life],direction:[[direction.x,direction.x],[direction.y,direction.y],[direction.z,direction.z]],speed:[speeds[j]*.75,speeds[j]*1.25]});stats.emitted++;
          }
        }
        if(dt>0)await systems[j].system.update(dt);
      }
    },
    updateHeat(heat){const v=kit.values;heat.setNozzles(nozzles);heat.update(ship.root,time*3,power,v.Calor?v['Intensidad calor']:0,v.Longitud*.9/1.5,8,1.2);},
    dispose(){unsubscribe();kit.destroy();systems.forEach(s=>s.dispose());lineGeometry.dispose();trail.dispose();engine.dispose();flame.material.dispose();},
  };
}
