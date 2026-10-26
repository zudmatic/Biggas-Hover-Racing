import {createLegacySmokeMaterial} from './legacy-smoke-material.js';
import {CIRCUIT_MAPS,circuitMap} from './circuit-maps.js';
import {SHIPS,shipConfig} from './ship-catalog.js';
import {createEngine} from './flight-webgpu.js';
import {createLensUniforms} from './vfx/singularity-lens.js';
import {createSmokeMaterial} from './vfx/smoke-material.js';
import {createOilPreview} from './vfx/oil.js';
import {loadFlightFx} from './flight-fx.js';
import {createComicStyle,createComicMaterials} from './comic-tsl-material.js';
import {createComicPost} from './comic-tsl-post.js';
import {retroStyle,RETRO_DEFAULTS} from './retro-style.js';
import {createCharacterComic} from './character-comic.js';
import * as THREE from 'three';
import {WebGPURenderer} from 'three/webgpu';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createDialKit,createDialRoot} from './dev-dials.js';
import 'dialkit/vanilla/styles.css';
import {createCircuitWorld} from './circuit-world.js';
import {createCircuitLighting} from './circuit-lighting.js';
import {createFlightShip} from './flight-ship.js';
import {createBaseMaterials} from './base-materials.js';
import {createHoverState} from './circuit-physics.js';
import {createFlightBoostPads} from './flight-boost-pads.js';
import {createBoostPadControls} from './boost-pad-controls.js';
import './webgpu-preview.css';

const query=new URLSearchParams(location.search),status=document.querySelector('#status');
async function main(){
  const canvas=document.querySelector('canvas'),legacy=query.get('backend')==='webgl';
  const renderer=legacy?new THREE.WebGLRenderer({canvas,antialias:true}):new WebGPURenderer({canvas,antialias:true,forceWebGL:query.get('backend')==='webgl2'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);
  if(!legacy)await renderer.init();
  const backend=legacy?'WebGL original':renderer.backend.isWebGPUBackend?'WebGPU':'WebGL2 · fallback';
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  document.body.dataset.backend=backend;
  const compare=new URL(location.href);compare.searchParams.set('backend',legacy?'webgpu':'webgl');
  const link=document.querySelector('#compare');link.href=compare.href;link.textContent=legacy?'Comparar con WebGPU':'Comparar con WebGL';
  const drive=new URL('./',location.href);drive.searchParams.set('selection','map');drive.searchParams.set('renderer',query.get('backend')==='webgl2'?'webgl2':'webgpu');drive.searchParams.set('map',query.get('map')??'ruins');drive.searchParams.set('vehicle',query.get('vehicle')??'037');drive.searchParams.set('camera','klipp');document.querySelector('#drive').href=drive.href;
  const scene=new THREE.Scene();scene.background=new THREE.Color(0xb6c6bd);scene.fog=new THREE.Fog(0xb6c6bd,220,1100);
  const camera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.15,7000);
  const orbit=new OrbitControls(camera,canvas);orbit.enableDamping=true;orbit.maxDistance=1000;orbit.minDistance=3;
  const results=await Promise.allSettled([createCircuitWorld({fxMaterialFactory:legacy?createLegacySmokeMaterial:undefined,map:query.get('map')??'ruins',onProgress:p=>{status.textContent=`Cargando mapa · ${Math.round(p*100)}%`;}}),createFlightShip(query.get('vehicle')??'037',{exhaust:false})]);
  const failure=results.find(r=>r.status==='rejected');if(failure){for(const r of results)if(r.status==='fulfilled')r.value.dispose();renderer.dispose();throw failure.reason;}
  const [world,ship]=results.map(r=>r.value);scene.add(world.root,ship.root);ship.root.scale.setScalar(.75);
  const lighting=createCircuitLighting(scene,{headlightMounts:ship.config.headlights});lighting.setTrack(world.landscape);world.textures.applyRoot(lighting.root);
  const baseline=createBaseMaterials(scene),state={...createHoverState(world.landscape),modelScale:.75};
  const comicStyle=createComicStyle();
  const comicMaterials=legacy?null:createComicMaterials(scene,comicStyle);
  const lens=ship.config.engine==='singularity'?createLensUniforms():null,comicPost=legacy?null:createComicPost(renderer,scene,camera,{lens});
  const originalComic=legacy?createCharacterComic(renderer):null;
  let route=0,time=0,previous=performance.now(),busy=false;
  const lastPosition=new THREE.Vector3(),delta=new THREE.Vector3();
  function place(){
    const road=world.landscape.atDistance(route);
    state.x=road.x;state.z=road.z;state.y=(world.surfaceHeight(road.x,road.z)??road.y)+.65;
    state.yaw=Math.atan2(road.nx,road.nz);state.pitch=Math.atan(road.grade??0);
    ship.root.position.set(state.x,state.y,state.z);ship.root.rotation.set(-state.pitch,state.yaw,0,'YXZ');
  }
  function frameShip(){orbit.target.copy(ship.root.position).add(new THREE.Vector3(0,1,0));camera.position.copy(orbit.target).add(new THREE.Vector3(7,5,-10).applyAxisAngle(new THREE.Vector3(0,1,0),state.yaw));orbit.update();}
  place();lastPosition.copy(ship.root.position);frameShip();
  const root=createDialRoot({target:document.querySelector('#dials'),mode:'inline',defaultOpen:true,theme:'dark'});
  const boost=legacy?null:await createEngine(renderer,scene,ship,{camera,lens});
  const smoke=legacy?null:await loadFlightFx(scene,{surfaceHeight:world.surfaceHeight,materialFactory:createSmokeMaterial});
  const oil=legacy?null:createOilPreview(scene,world);
  const pads=legacy?null:await createFlightBoostPads({scene,landscape:world.landscape,surfaceHeight:world.surfaceHeight,distances:[12]});
  const focusPad=()=>{const p=pads.sim.entries[0];orbit.target.set(p.x,p.y,p.z);camera.position.copy(orbit.target).add(new THREE.Vector3(7,7,-9).applyAxisAngle(new THREE.Vector3(0,1,0),Math.atan2(p.nx,p.nz)));orbit.update();};
  const padControls=pads?createBoostPadControls(pads,state,focusPad):null;
  if(pads&&query.get('effect')==='pad')focusPad();
  function clearFx(){boost?.clear();smoke?.reset();oil?.clear();}
  const fxKit=legacy?null:createDialKit('VFX · pruebas',{
    Activos:query.get('vfx')!=='off',Pausa:false,Modo:{type:'select',options:['Aceleración','Turbo','Reposo','Soltar'],default:'Aceleración'},
    Derrape:false,Frenado:false,
    Aceite:{type:'action',label:'Soltar aceite'},Limpiar:{type:'action',label:'Limpiar efectos'},
  },{id:'webgpu-vfx',persist:false,onAction:action=>{if(action==='Aceite'&&fxKit.values.Activos)oil.drop();else if(action==='Limpiar')clearFx();}});
  const smokeKit=legacy?null:createDialKit('Humo · comparación',{
    Tamaño:[1.3,.5,2.5,.05],Duración:[1.5,.5,3,.05],'Color humo':{type:'color',default:'#bababa'},Densidad:[1,.15,1,.05],Trama:[1.5,1,4,.1],'Cuatro ruedas':false,
    Estilo:{type:'select',options:['Híbrido','Procedural','Mixto'],default:'Híbrido'},
  },{id:'webgpu-smoke',persist:false,defaultCollapsed:true});
  const unsubscribeSmoke=smokeKit?.subscribe(v=>{smoke.configure({size:v.Tamaño,lifetime:v.Duración,color:v['Color humo'],density:v.Densidad,grain:v.Trama,fourSupports:v['Cuatro ruedas']});smoke.setStyle({'Híbrido':'hybrid',Procedural:'procedural',Mixto:'mixed'}[v.Estilo]);});
  const unsubscribeFx=fxKit?.subscribe(v=>{if(!v.Activos)clearFx();});
  const kit=createDialKit('Validación · cómic',{
    Mapa:{type:'select',options:Object.values(CIRCUIT_MAPS).map(m=>m.name),default:circuitMap(query.get('map')).name},
    Nave:{type:'select',options:Object.keys(SHIPS),default:shipConfig(query.get('vehicle')??'037').id},
    'Cómic':query.get('look')!=='base','Trama':[1.03,0,2,.01],'Puntos':true,'Rayado':true,'Contornos':true,'Color cómic':true,
    'Espacio trama':{type:'select',options:['Objeto','Pantalla'],default:'Objeto'},
    Noche:false,Faros:false,Sombras:true,Recorrer:false,'Velocidad recorrido':[15,0,50,1],
    'Posición en pista':[0,0,100,1],Encuadrar:{type:'action',label:'Encuadrar nave'},
  },{id:'webgpu-base-preview',persist:false,onAction:()=>frameShip()});
  let lastRoute=0;
  const unsubscribe=kit.subscribe(v=>{
    const map=Object.values(CIRCUIT_MAPS).find(m=>m.name===v.Mapa).id,vehicle=v.Nave;
    if(map!==(query.get('map')??'ruins')||vehicle!==(query.get('vehicle')??'037')){const url=new URL(location.href);url.searchParams.set('map',map);url.searchParams.set('vehicle',vehicle);location.assign(url);return;}
    comicMaterials?.setEnabled(v['Cómic']);comicStyle.strength.value=v.Trama;comicStyle.hatch.value=Number(v.Rayado);comicStyle.dots.value=Number(v.Puntos);comicStyle.screenSpace.value=Number(v['Espacio trama']==='Pantalla');
    if(comicPost){comicPost.outline.value=Number(v.Contornos);comicPost.grading.value=Number(v['Color cómic']);}
    if(legacy){
      Object.assign(retroStyle.params,{strength:v.Trama,hiOn:v.Puntos,hatchOn:v.Rayado,outlineOn:v.Contornos,
        gradeSaturation:v['Color cómic']?RETRO_DEFAULTS.gradeSaturation:1,
        gradeContrast:v['Color cómic']?RETRO_DEFAULTS.gradeContrast:1,
        splitAmount:v['Color cómic']?RETRO_DEFAULTS.splitAmount:0,
        space:v['Espacio trama']==='Pantalla'?'screen':'object'});
      retroStyle.sync();
    }
    document.body.dataset.comic=String(v['Cómic']);
    lighting.setNight(v.Noche);lighting.setHeadlights(v.Faros);ship.setHeadlights(v.Faros);renderer.shadowMap.enabled=v.Sombras;
    if(lastRoute!==v['Posición en pista']){clearFx();lastRoute=v['Posición en pista'];route=world.landscape.length*lastRoute/100;place();lastPosition.copy(ship.root.position);frameShip();}
  });
  const resize=()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);};window.addEventListener('resize',resize);
  lighting.update(state,0,{dt:1,reducedMotion:true});scene.updateMatrixWorld(true);
  await renderer.compileAsync(scene,camera);
  document.body.dataset.ready='true';document.body.dataset.materialStats=JSON.stringify(baseline.stats);
  status.textContent=`${backend} · ${baseline.stats.textured} mallas con textura · ${legacy?'referencia GLSL sin VFX':'cómic + VFX TSL'}`;
  renderer.setAnimationLoop(async now=>{
    if(busy)return;busy=true;
    try{
      const dt=fxKit?.values.Pausa?0:Math.min((now-previous)/1000,.05);previous=now;time+=dt;
      const previousPadPosition={x:state.x,y:state.y,z:state.z};
      if(kit.values.Recorrer){route=(route+dt*kit.values['Velocidad recorrido'])%world.landscape.length;place();delta.subVectors(ship.root.position,lastPosition);camera.position.add(delta);orbit.target.add(delta);lastPosition.copy(ship.root.position);}
      if(boost){
        const v=fxKit.values;state.speed=kit.values.Recorrer?kit.values['Velocidad recorrido']:15;
        state.vx=Math.sin(state.yaw)*state.speed;state.vz=Math.cos(state.yaw)*state.speed;
        state.drifting=v.Derrape;state.braking=v.Frenado;state.slip=v.Derrape?.55:0;state.boosting=v.Activos&&v.Modo==='Turbo';state.hull=ship.config.hull?{halfWidth:ship.config.hull.halfWidth*.75,halfLength:ship.config.hull.halfLength*.75}:undefined;
        state.padBoostRemaining=Math.max(0,(state.padBoostRemaining??0)-dt);
        if(dt>0){pads.step(dt,state,previousPadPosition);padControls.update();}
        pads.update(dt,false);
        const padTurbo=state.padBoostRemaining>0;state.boosting=state.boosting||padTurbo;
        await boost.update(dt,padTurbo?'Turbo':v.Modo,v.Activos,padTurbo,state);smoke.update(dt,{state,camera,scale:.75,reduced:!v.Activos});oil.update(dt,state);
        document.body.dataset.boostPad=JSON.stringify({remaining:pads.sim.entries[0].remaining,activations:pads.sim.entries[0].activations,turbo:state.padBoostRemaining});
        document.body.dataset.vfx=JSON.stringify({enabled:v.Activos,mode:v.Modo,...boost.stats,smoke:smoke.stats.air,marks:smoke.stats.marks,oil:oil.sim.patches.length,time});
      }
      ship.pilot.update(time,true);orbit.update();lighting.update(state,time,{dt});boost?.updatePost(comicPost);
      if(comicPost)comicPost.heat.updatePadFields(pads?.heatFields??[]);
      comicStyle.pixelRatio.value=renderer.getPixelRatio();renderer.getDrawingBufferSize(comicStyle.resolution.value);comicMaterials?.sync();
      if(comicPost)comicPost.comic.value=Number(kit.values['Cómic']);
      if(kit.values['Cómic']||fxKit?.values.Activos){if(legacy)originalComic.render(scene,camera,`#${scene.background.getHexString()}`);else await comicPost.render();}
      else if(legacy)renderer.render(scene,camera);else await renderer.renderAsync(scene,camera);
      document.body.dataset.frame=String(Number(document.body.dataset.frame??0)+1);
    }catch(error){renderer.setAnimationLoop(null);status.textContent=`Error: ${error.message}`;console.error(error);}finally{busy=false;}
  });
  window.addEventListener('pagehide',()=>{renderer.setAnimationLoop(null);window.removeEventListener('resize',resize);unsubscribe();unsubscribeSmoke?.();unsubscribeFx?.();fxKit?.destroy();smokeKit?.destroy();padControls?.dispose();pads?.dispose();boost?.dispose();smoke?.dispose();oil?.dispose();kit.destroy();root.destroy();orbit.dispose();comicMaterials?.dispose();comicPost?.dispose();originalComic?.dispose();baseline.dispose();lighting.dispose();ship.dispose();world.dispose();renderer.dispose();},{once:true});
}
main().catch(error=>{status.textContent=`No se pudo iniciar: ${error.message}`;document.body.dataset.error=error.message;console.error(error);});
