import {SHIPS,prepareShipModel} from '../../src/ship-catalog.js';
import {createShipCloth} from '../../src/ship-cloth.js';
import {createStudioCamera} from './studio-camera.js';
import {createDither} from './dither.js';
import {createEngineCore} from './engine-core.js';
import {createFlameTrail} from './flame-trail.js';
import {createControls} from './controls.js';
import {createFlightBoostPads} from '../../src/flight-boost-pads.js';
import {createBoostPadControls} from '../../src/boost-pad-controls.js';
import {createPadBoostPalette,smoothBoostPower} from '../../src/vfx/pad-boost-palette.js';
import * as THREE from 'three/webgpu';
import {mix,step,uniform,uv,float,sin,smoothstep,abs,vec4} from 'three/tsl';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createHeatHaze} from './heat-haze.js';
import {VFXParticles,Appearance,Blending} from 'vanilla-vfx';

const $=s=>document.querySelector(s),status=$('#status');
async function main(){
  const renderer=new THREE.WebGPURenderer({antialias:true,forceWebGL:new URLSearchParams(location.search).has('webgl')});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));$('main').append(renderer.domElement);await renderer.init();
  const scene=new THREE.Scene();scene.background=new THREE.Color('#182b34');
  const camera=new THREE.PerspectiveCamera(45,1,.1,100);camera.position.set(7,4,-11);
  const orbit=new OrbitControls(camera,renderer.domElement);orbit.target.set(0,.6,-2);orbit.enableDamping=true;
  scene.add(new THREE.HemisphereLight(0xdff5ff,0x62432a,2));const light=new THREE.DirectionalLight(0xffe9ca,3);light.position.set(4,6,-5);scene.add(light);
  const grid=new THREE.GridHelper(30,30,0x6a8894,0x3c505b);grid.position.y=-.4;scene.add(grid);
  const vehicles=Object.fromEntries(Object.values(SHIPS).map(config=>[config.id,{...config,nozzles:config.exhausts,cloth:[]}]));
  await Promise.all(Object.values(vehicles).map(async v=>{
    v.model=prepareShipModel((await new GLTFLoader().loadAsync('/models/spaceship/'+v.file)).scene,v);
    v.model.traverse(mesh=>{if(mesh.isMesh&&v.clothName?.test(mesh.name))v.cloth.push(createShipCloth(mesh,mesh.matrixWorld));});
  }));
  const ship=new THREE.Group();scene.add(ship);ship.add(vehicles['033'].model);
  let nozzles=vehicles['033'].nozzles;

  const ink=uniform(0),hot=uniform(new THREE.Color('#fff1bc')),fire=uniform(new THREE.Color('#ff6b16'));
  // Crossed, advected flame sheets keep combustion attached to each nozzle.
  const clock=uniform(0),roughness=uniform(2),frequency=uniform(1.2),flowSpeed=uniform(1),brightness=uniform(1.5),opacity=uniform(.7),taper=uniform(.65);
  const fireDither=createDither();
  const flameMaterial=new THREE.MeshBasicNodeMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
  // The translated plane starts at UV.y = 0 at the nozzle and ends at 1.
  const t=uv().y,x=uv().x.sub(.5).mul(2);
  const flow=t.mul(18).sub(clock.mul(24).mul(flowSpeed));
  const noise=sin(flow.add(x.mul(5))).mul(.5).add(sin(flow.mul(1.73).add(x.mul(11))).mul(.3)).add(sin(flow.mul(2.91).sub(x.mul(17))).mul(.2));
  const bend=sin(t.mul(9).mul(frequency).sub(clock.mul(10).mul(flowSpeed))).mul(t).mul(.16).mul(roughness);
  const width=float(1).sub(t).pow(taper).mul(.68).add(noise.mul(.13).mul(t)).max(.015);
  const edge=abs(x.add(bend)).div(width);
  const mask=smoothstep(float(1),float(.45),edge).mul(smoothstep(float(1),float(.72),t));
  const core=smoothstep(float(.7),float(.05),edge.add(t.mul(.7)));
  flameMaterial.colorNode=mix(fire,hot,core).mul(brightness);
  flameMaterial.opacityNode=fireDither.alpha(mask.mul(opacity));
  let flameTrail=createFlameTrail(scene,flameMaterial,nozzles);
  let engineCore=createEngineCore(ship,nozzles);
  const rounded=uniform(1);
  const radial=uv().mul(2).sub(1).length();
  const roundMask=float(1).sub(smoothstep(float(.72),float(1),radial));
  const fragmentColor=uniform(new THREE.Color()),fragmentHot=uniform(new THREE.Color()),emberColor=uniform(new THREE.Color()),fragmentOpacity=uniform(1),emberOpacity=uniform(1);
  const embers=new VFXParticles(renderer,{autoStart:false,maxParticles:300,size:[.018,.045],lifetime:[.25,.65],speed:[9,15],gravity:[0,.5,0],fadeSize:[1,0],fadeOpacity:[1,0],appearance:Appearance.GRADIENT,blending:Blending.ADDITIVE,turbulence:{intensity:3,frequency:2,speed:1},stretchBySpeed:{factor:.08,maxStretch:4},opacityNode:()=>emberOpacity,colorNode:(_data,base)=>vec4(emberColor,fireDither.alpha(base.a))});
  await embers.init();embers.stop();scene.add(embers.object3D);
  const streakColor=uniform(new THREE.Color('#ffd18a')),streakOpacity=uniform(.8);
  const streakGeometry=new THREE.CapsuleGeometry(.025,.4,2,6);
  const streaks=new VFXParticles(renderer,{autoStart:false,maxParticles:400,geometry:streakGeometry,orientToDirection:true,orientAxis:'y',
    size:[.3,.55],lifetime:[.2,.4],speed:[10,18],gravity:[0,.1,0],fadeSize:[1,0],fadeOpacity:[1,0],
    blending:Blending.ADDITIVE,turbulence:{intensity:2,frequency:2,speed:1},stretchBySpeed:{factor:.15,maxStretch:6},
    opacityNode:()=>streakOpacity,colorNode:(_data,base)=>vec4(streakColor,fireDither.alpha(base.a))});
  await streaks.init();streaks.stop();scene.add(streaks.object3D);
  const particles=new VFXParticles(renderer,{autoStart:false,maxParticles:1600,size:[.24,.42],lifetime:[.25,.55],speed:[8,12],direction:[[0,0],[0,0],[-1,-1]],gravity:[0,1.1,0],friction:{intensity:.12},fadeSize:[1,0],fadeOpacity:[1,0],appearance:Appearance.DEFAULT,blending:Blending.NORMAL,turbulence:{intensity:2,frequency:1.2,speed:1},stretchBySpeed:{factor:.10,maxStretch:2.5},
    alphaTestNode:float(.01),opacityNode:()=>fragmentOpacity.mul(mix(float(1),roundMask,rounded)),colorNode:({progress},base)=>vec4(mix(mix(fragmentHot,fragmentColor,smoothstep(float(0),float(.55),progress)),mix(fragmentHot,fragmentColor,step(.25,progress)),ink),fireDither.alpha(base.a))});
  await particles.init();particles.stop();scene.add(particles.object3D);
  const backend=renderer.backend.isWebGPUBackend?'WebGPU · simulación GPU':'WebGL · simulación CPU';status.textContent=backend;document.body.dataset.ready='true';
  let time=0,accumulator=0,emberAccumulator=0,streakAccumulator=0,power=0,last=performance.now();
  const origin=new THREE.Vector3(),direction=new THREE.Vector3();
  const heat=createHeatHaze(renderer,scene,camera);
  const controls=createControls(action=>{
    if(action==='Limpiar'){particles.clear();embers.clear();streaks.clear();accumulator=emberAccumulator=streakAccumulator=0;}
    if(action==='Restablecer')controls.reset();
  });
  const {kits}=controls;
  const padPalette=createPadBoostPalette(),padEngineEdge=new THREE.Color(),padEngineCore=new THREE.Color();
  const studioCamera=createStudioCamera(camera,orbit,ship);
  const padState={x:5,y:0,z:0,speed:0,padBoostRemaining:0};
  const pads=await createFlightBoostPads({scene,distances:[0],surfaceHeight:()=>-.4,
    landscape:{spawn:{x:5,z:0},roadAt:()=>({distance:0}),atDistance:()=>({x:5,z:0,y:-.4,nx:0,nz:1,grade:0})}});
  const padControls=createBoostPadControls(pads,padState,()=>{
    kits.camera.setValues({'Cámara':'Fija'});
    orbit.target.set(5,0,0);camera.position.set(12,8,-10);orbit.update();
  });
  const unsubscribers=[kits.camera.subscribe(v=>studioCamera.configure(v))];
  unsubscribers.push(kits.print.subscribe(v=>{fireDither.configure(v,'Fuego');heat.configureDither(v);}));
  unsubscribers.push(kits.flame.subscribe(v=>{
    roughness.value=v.Turbulencia;frequency.value=v['Escala ruido'];flowSpeed.value=v['Velocidad flujo'];
    brightness.value=v.Intensidad;opacity.value=v.Opacidad;taper.value=v['Afinar punta'];fire.value.set(v['Color fuego']);hot.value.set(v['Color núcleo']);
  }));
  unsubscribers.push(kits.fragments.subscribe(v=>{
    rounded.value=v.Forma==='Pelotitas'?1:0;ink.value=v['Colores por bandas']?1:0;fragmentColor.value.set(v.Color);fragmentHot.value.set(v['Color inicial']);fragmentOpacity.value=v.Opacidad;
    particles.object3D.visible=v.Activos;
    if(!v.Activos){particles.clear();accumulator=0;}
    particles.setProps({size:[v.Tamaño*.6,v.Tamaño],lifetime:[v.Duración*.5,v.Duración],
      turbulence:{intensity:Math.max(1e-7,v.Turbulencia),frequency:v['Escala ruido'],speed:v['Velocidad ruido']},
      gravity:[0,v.Elevación,0],stretchBySpeed:{factor:v.Forma==='Pelotitas'?0:v.Estiramiento,maxStretch:2.5}});
  }));
  unsubscribers.push(kits.embers.subscribe(v=>{
    emberColor.value.set(v.Color);emberOpacity.value=v.Opacidad;embers.object3D.visible=v.Activas;
    if(!v.Activas){embers.clear();emberAccumulator=0;}
    embers.setProps({size:[v.Tamaño*.4,v.Tamaño],lifetime:[v.Duración*.4,v.Duración],
      turbulence:{intensity:Math.max(1e-7,v.Turbulencia),frequency:2,speed:1},gravity:[0,v.Elevación,0],stretchBySpeed:{factor:v.Estiramiento,maxStretch:4}});
  }));
  unsubscribers.push(kits.streaks.subscribe(v=>{
    streakColor.value.set(v.Color);streakOpacity.value=v.Opacidad;streaks.object3D.visible=v.Activas;
    if(!v.Activas){streaks.clear();streakAccumulator=0;}
    streaks.setProps({size:[v.Tamaño*.55,v.Tamaño],lifetime:[v.Duración*.5,v.Duración],
      turbulence:{intensity:Math.max(1e-7,v.Turbulencia),frequency:2,speed:1},gravity:[0,v.Elevación,0],stretchBySpeed:{factor:v.Estiramiento,maxStretch:6}});
  }));
  let previousView,previousVehicle;
  unsubscribers.push(kits.studio.subscribe(v=>{
    const id=v.Vehículo.slice(0,3);
    if(id!==previousVehicle){
      flameTrail.dispose();engineCore.dispose();
      for(const vehicle of Object.values(vehicles))ship.remove(vehicle.model);
      nozzles=vehicles[id].nozzles;ship.add(vehicles[id].model);
      flameTrail=createFlameTrail(scene,flameMaterial,nozzles);engineCore=createEngineCore(ship,nozzles);heat.setNozzles(nozzles);
      particles.clear();embers.clear();streaks.clear();accumulator=emberAccumulator=streakAccumulator=0;
      ship.updateMatrixWorld(true);flameTrail.record(time,ship);previousVehicle=id;document.body.dataset.ship=id;
    }

    heat.setToon(v['Toon / cómic']);
    grid.visible=v.Cuadrícula;scene.background.set(v.Fondo);
    if(orbit.enabled&&v.Vista!==previousView){camera.position.set(...({'Tres cuartos':[7,4,-11],Trasera:[0,3,-12],Lateral:[11,3,-3]}[v.Vista]));camera.position.add(ship.position);orbit.target.copy(ship.position).add(new THREE.Vector3(0,.6,-2));if(orbit.enabled)orbit.update();previousView=v.Vista;}
  }));
  const resize=()=>{const r=$('main').getBoundingClientRect();renderer.setSize(r.width,r.height);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();studioCamera.resize(r.width,r.height);};const observer=new ResizeObserver(resize);observer.observe($('main'));resize();
  let busy=false;
  renderer.setAnimationLoop(async now=>{if(busy)return;busy=true;
    try{const dt=Math.min((now-last)/1000,.05);last=now;
      const studio=kits.studio.values,flame=kits.flame.values,fragment=kits.fragments.values,ember=kits.embers.values,haze=kits.heat.values,line=kits.streaks.values;
      const stepDt=dt*studio['Velocidad animación'];
      if(!studio.Pausa){time+=stepDt;
        const previousPadState={...padState},motion=studioCamera.move(stepDt,time,studio,padState.padBoostRemaining>0);
        if(motion.reset){padState.padBoostRemaining=0;flameTrail.clear();particles.clear();embers.clear();streaks.clear();}
        ship.updateMatrixWorld(true);flameTrail.record(time,ship);
        Object.assign(padState,{x:ship.position.x,y:ship.position.y,z:ship.position.z,speed:motion.speed});
        padState.padBoostRemaining=Math.max(0,padState.padBoostRemaining-stepDt);
        pads.step(stepDt,padState,motion.reset?padState:previousPadState);padControls.update();pads.update(stepDt,false);
        document.body.dataset.boostPad=JSON.stringify({remaining:pads.sim.entries[0].remaining,activations:pads.sim.entries[0].activations,turbo:padState.padBoostRemaining,speed:motion.speed});
        const target=padState.padBoostRemaining>0?1:{Turbo:1,'Aceleración':.45,Reposo:.13,Soltar:0}[studio.Modo];
        power=smoothBoostPower(power,target,stepDt);clock.value=time;
        accumulator+=stepDt*fragment['Cantidad por segundo']*power*(fragment.Activos?1:0);
        emberAccumulator+=stepDt*ember['Cantidad por segundo']*power*(ember.Activas?1:0);
        streakAccumulator+=stepDt*line['Cantidad por segundo']*power*(line.Activas?1:0);
        const lineCount=Math.floor(streakAccumulator);streakAccumulator-=lineCount;
        const count=Math.floor(accumulator),sparkCount=Math.floor(emberAccumulator);accumulator-=count;emberAccumulator-=sparkCount;
        // Independent emitters: turning fragments off must never suppress the embers.
        const emit=(system,count,settings)=>{if(!count)return;
          for(const [x,y,z] of nozzles){origin.set(x,y,z).applyMatrix4(ship.matrixWorld);
            for(let i=0;i<count;i++){
              direction.set((Math.random()-.5)*settings.Dispersión,(Math.random()-.5)*settings.Dispersión,-1).normalize().transformDirection(ship.matrixWorld);
              const d=[[direction.x,direction.x],[direction.y,direction.y],[direction.z,direction.z]];
              system.spawn(origin.x,origin.y,origin.z,1,{direction:d,speed:[settings.Velocidad*.75,settings.Velocidad*1.25]});
            }
          }
        };
        emit(particles,count,fragment);emit(embers,sparkCount,ember);emit(streaks,lineCount,line);
        await particles.system.update(stepDt);await embers.system.update(stepDt);await streaks.system.update(stepDt);
      }
      studioCamera.update(stepDt,power,studio.Pausa);
      padPalette.update(studio.Pausa?0:stepDt,padState.padBoostRemaining>0);
      padPalette.apply(fire.value,flame['Color fuego']);padPalette.apply(hot.value,flame['Color núcleo'],true);
      padPalette.apply(fragmentColor.value,fragment.Color);padPalette.apply(fragmentHot.value,fragment['Color inicial'],true);
      padPalette.apply(emberColor.value,ember.Color);padPalette.apply(streakColor.value,line.Color,true);
      padPalette.apply(padEngineEdge,kits.engine.values['Color borde']);padPalette.apply(padEngineCore,kits.engine.values['Color centro'],true);
      document.body.dataset.boostSource=padState.padBoostRemaining>0?'placa':studio.Modo==='Turbo'?'nitro':'motor';
      document.body.dataset.camera=kits.camera.values['Cámara'];
      document.body.dataset.shipPosition=ship.position.toArray().join(',');
      for(const cloth of vehicles[previousVehicle].cloth)cloth.update(time,power*52,studio.Modo==='Turbo',false);
      engineCore.update(studio.Pausa?0:stepDt,time,power,{...kits.engine.values,'Color borde':padEngineEdge,'Color centro':padEngineCore});
      flameTrail.update(time,flame,power,fragment.Velocidad,fragment.Elevación);
      document.body.dataset.time=time.toFixed(3);
      heat.update(ship,time*haze['Velocidad ondas'],power,haze.Activa?haze.Intensidad:0,flame.Longitud*haze.Longitud/1.5,haze.Turbulencia,haze.Ancho);
      heat.updatePadField(pads.heatFields);
      await heat.render();
    }catch(error){status.textContent='Error de renderizado: '+error.message;console.error(error);renderer.setAnimationLoop(null);}finally{busy=false;}
  });
  window.addEventListener('pagehide',()=>{renderer.setAnimationLoop(null);observer.disconnect();unsubscribers.forEach(fn=>fn());padControls.dispose();pads.dispose();controls.dispose();studioCamera.dispose();particles.dispose();embers.dispose();streaks.dispose();streakGeometry.dispose();flameTrail.dispose();engineCore.dispose();flameMaterial.dispose();heat.dispose();orbit.dispose();renderer.dispose();},{once:true});
}
main().catch(error=>{status.textContent='No se pudo iniciar: '+error.message;console.error(error);});
