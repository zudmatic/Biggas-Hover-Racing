import {CIRCUIT_MAPS,circuitMap} from './circuit-maps.js';
import {SHIPS,shipConfig} from './ship-catalog.js';
import {createEngine} from './flight-webgpu.js';
import {createLensUniforms} from './vfx/singularity-lens.js';
import {createSmokeMaterial} from './vfx/smoke-material.js';
import {createOilPreview} from './vfx/oil.js';
import {loadFlightFx} from './flight-fx.js';
import {createComicStyle,createComicMaterials} from './comic-tsl-material.js';
import {createComicPost} from './comic-tsl-post.js';
import * as THREE from 'three';
import {WebGPURenderer} from 'three/webgpu';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createDialKit,createDialRoot} from './dev-dials.js';
import 'dialkit/vanilla/styles.css';
import {createCircuitWorld} from './circuit-world.js';
import {createCircuitLighting} from './circuit-lighting.js';
import {createFlightShip} from './flight-ship.js';
import {createBaseMaterials} from './base-materials.js';
import {createHoverState,advanceHover} from './circuit-physics.js';
import {createFlightRenderPose} from './flight-render-pose.js';
import {scaledHull} from './flight-scale.js';
import {createFlightBoostPads} from './flight-boost-pads.js';
import {createBoostPadControls} from './boost-pad-controls.js';
import './playground.css';

// Debug playground: the preview scene plus reproducible camera views, ship states and time control,
// all scriptable through window.playground so checks and screenshots don't depend on mouse drags.
const SCALE=.75;
// Offsets are world units in the ship's frame (forward +z, flames leave toward -z).
const VIEWS={
  libre:{label:'Libre'},
  carrera:{label:'Carrera',camera:[0,4,-8.5],target:[0,1,0]},
  trasera:{label:'Trasera',camera:[0,1.3,-5.5],target:[0,.8,-1.8]},
  tobera:{label:'Tobera',camera:[.9,.55,-2.4],nozzle:true},
  costado:{label:'Costado',camera:[7,1.4,-1.2],target:[0,.8,-.8]},
  arriba:{label:'Arriba',camera:[0,11,-.6],target:[0,0,0]},
  frontal:{label:'Frontal',camera:[0,1.6,7.5],target:[0,.9,0]},
};
// Speed is a factor of the "Velocidad" dial; "wall" pins the ship and shakes it against the barrier;
// "turn" leaves the track and circles at Radio giro, nose turned into the curve by Deriva degrees;
// "manual" hands the ship to the game's own hover physics and the keyboard (W/S, A/D, Shift, Space, E, R).
const STATES={
  manejar:{label:'Manejar',mode:'Aceleración',speed:0,manual:true},
  parada:{label:'Parada',mode:'Reposo',speed:0},
  acelerando:{label:'Acelerando',mode:'Aceleración',speed:1},
  turbo:{label:'Turbo',mode:'Turbo',speed:1.4},
  'contra-muro':{label:'Contra muro',mode:'Reposo',speed:0,wall:true},
  frenando:{label:'Frenando',mode:'Aceleración',speed:.5,braking:true},
  derrape:{label:'Derrape',mode:'Aceleración',speed:1,drift:true},
  girando:{label:'Girando',mode:'Aceleración',speed:1,turn:true},
  soltar:{label:'Soltar',mode:'Soltar',speed:0},
};
const byLabel=(table,label)=>Object.keys(table).find(id=>table[id].label===label);

const query=new URLSearchParams(location.search),status=document.querySelector('#status'),hud=document.querySelector('#hud');
async function main(){
  const canvas=document.querySelector('canvas');
  const renderer=new WebGPURenderer({canvas,antialias:true,forceWebGL:query.get('backend')==='webgl2'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);
  await renderer.init();
  const backend=renderer.backend.isWebGPUBackend?'WebGPU':'WebGL2 · fallback';
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  document.body.dataset.backend=backend;
  const mapId=query.get('map')??'ruins',vehicleId=query.get('vehicle')??'037';
  const drive=new URL('/',location.href);drive.search=new URLSearchParams({selection:'map',renderer:query.get('backend')==='webgl2'?'webgl2':'webgpu',map:mapId,vehicle:vehicleId,camera:'klipp'});document.querySelector('#drive').href=drive.href;
  const scene=new THREE.Scene();scene.background=new THREE.Color(0xb6c6bd);scene.fog=new THREE.Fog(0xb6c6bd,220,1100);
  const camera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.15,7000);
  const orbit=new OrbitControls(camera,canvas);orbit.enableDamping=true;orbit.maxDistance=1000;orbit.minDistance=1;
  const results=await Promise.allSettled([createCircuitWorld({map:mapId,onProgress:p=>{status.textContent=`Cargando mapa · ${Math.round(p*100)}%`;}}),createFlightShip(vehicleId,{exhaust:false})]);
  const failure=results.find(r=>r.status==='rejected');if(failure){for(const r of results)if(r.status==='fulfilled')r.value.dispose();renderer.dispose();throw failure.reason;}
  const [world,ship]=results.map(r=>r.value);scene.add(world.root,ship.root);ship.root.scale.setScalar(SCALE);
  const lighting=createCircuitLighting(scene,{headlightMounts:ship.config.headlights});lighting.setTrack(world.landscape);world.textures.applyRoot(lighting.root);
  const baseline=createBaseMaterials(scene),state={...createHoverState(world.landscape),modelScale:SCALE};
  const comicStyle=createComicStyle(),comicMaterials=createComicMaterials(scene,comicStyle),lens=ship.config.engine==='singularity'?createLensUniforms():null,comicPost=createComicPost(renderer,scene,camera,{lens});
  const nozzles=ship.config.exhausts,mainNozzle=nozzles.reduce((best,n)=>n[3]>best[3]?n:best,nozzles[0]);
  let route=0,time=0,previous=performance.now(),busy=false,pendingSteps=0,frames=0,fps=0,frameMs=0,lastHud=0;
  const lastPosition=new THREE.Vector3(),delta=new THREE.Vector3(),target=new THREE.Vector3();
  // Follow-camera rig: track yaw arrives in per-segment steps, so the camera follows a smoothed copy of the
  // ship's rotation, and view changes glide in rig space instead of cutting.
  const rig=new THREE.Quaternion(),inverseRig=new THREE.Quaternion(),cameraRig=new THREE.Vector3(),targetRig=new THREE.Vector3(),wantedCamera=new THREE.Vector3(),wantedTarget=new THREE.Vector3();
  let rigReady=false,lastView=null;

  const root=createDialRoot({target:document.querySelector('#dials'),mode:'inline',defaultOpen:true,theme:'dark'});
  const viewKit=createDialKit('Cámara',{
    Vista:{type:'select',options:Object.values(VIEWS).map(v=>v.label),default:VIEWS[query.get('view')]?.label??'Libre'},
    FOV:[62,30,100,1],Encuadrar:{type:'action',label:'Encuadrar nave'},
  },{id:'playground-camera',persist:false,onAction:()=>frameShip()});
  const stateKit=createDialKit('Estado nave',{
    Estado:{type:'select',options:Object.values(STATES).map(s=>s.label),default:STATES[query.get('state')]?.label??'Acelerando'},
    Velocidad:[30,0,80,1],'Radio giro':[14,4,60,1],Sentido:{type:'select',options:['Izquierda','Derecha'],default:'Izquierda'},Deriva:[0,-30,40,1],'Mover nave':true,'Activar placas':false,'VFX activos':query.get('vfx')!=='off',
    Aceite:{type:'action',label:'Soltar aceite'},Limpiar:{type:'action',label:'Limpiar efectos'},
  },{id:'playground-state',persist:false,onAction:action=>{if(action==='Aceite')oil.drop();else if(action==='Limpiar')clearFx();}});
  const timeKit=createDialKit('Tiempo',{
    Pausa:false,'Velocidad tiempo':[1,.05,2,.05],Avanzar:{type:'action',label:'Avanzar un cuadro'},
  },{id:'playground-time',persist:false,onAction:()=>{pendingSteps++;}});
  const sceneKit=createDialKit('Escena',{
    Mapa:{type:'select',options:Object.values(CIRCUIT_MAPS).map(m=>m.name),default:circuitMap(mapId).name},
    Nave:{type:'select',options:Object.keys(SHIPS),default:shipConfig(vehicleId).id},
    'Cómic':query.get('look')!=='base',Trama:[1.03,0,2,.01],Puntos:true,Rayado:true,Contornos:true,'Color cómic':true,
    'Espacio trama':{type:'select',options:['Objeto','Pantalla'],default:'Objeto'},
    Noche:false,Faros:false,Sombras:true,'Posición en pista':[0,0,100,1],
  },{id:'playground-scene',persist:false,defaultCollapsed:true});
  const boost=await createEngine(renderer,scene,ship,{camera,lens});
  const smoke=await loadFlightFx(scene,{surfaceHeight:world.surfaceHeight,materialFactory:createSmokeMaterial});
  const oil=createOilPreview(scene,world);
  const pads=await createFlightBoostPads({scene,landscape:world.landscape,surfaceHeight:world.surfaceHeight,distances:[12]});
  const focusPad=()=>{const p=pads.sim.entries[0];setView('libre');orbit.target.set(p.x,p.y,p.z);camera.position.copy(orbit.target).add(new THREE.Vector3(7,7,-9).applyAxisAngle(THREE.Object3D.DEFAULT_UP,Math.atan2(p.nx,p.nz)));orbit.update();};
  const padControls=createBoostPadControls(pads,state,focusPad);
  const smokeKit=createDialKit('Humo',{
    Tamaño:[1.3,.5,2.5,.05],Duración:[1.5,.5,3,.05],'Color humo':{type:'color',default:'#bababa'},Densidad:[1,.15,1,.05],Trama:[1.5,1,4,.1],'Cuatro ruedas':false,
    Estilo:{type:'select',options:['Híbrido','Procedural','Mixto'],default:'Híbrido'},
  },{id:'playground-smoke',persist:false,defaultCollapsed:true});

  const viewId=()=>byLabel(VIEWS,viewKit.values.Vista),stateId=()=>byLabel(STATES,stateKit.values.Estado);
  function clearFx(){boost.clear();smoke.reset();oil.clear();}
  // Turning rig: travel heading advances at speed / radius around a centre anchored where the turn began.
  const circle={heading:0,cx:0,cz:0,y:0,key:''};
  function anchorCircle(){
    const v=stateKit.values,direction=v.Sentido==='Izquierda'?1:-1,radius=v['Radio giro'];
    circle.heading=circle.key?circle.heading:state.yaw;circle.key=`${radius}|${direction}`;
    circle.cx=state.x+direction*radius*Math.cos(circle.heading);circle.cz=state.z-direction*radius*Math.sin(circle.heading);circle.y=state.y;
  }
  function place(){
    const v=stateKit.values;
    if(STATES[stateId()].turn){
      const direction=v.Sentido==='Izquierda'?1:-1,radius=v['Radio giro'];
      if(circle.key!==`${radius}|${direction}`)anchorCircle();
      state.x=circle.cx-direction*radius*Math.cos(circle.heading);state.z=circle.cz+direction*radius*Math.sin(circle.heading);
      state.y=(world.surfaceHeight(state.x,state.z)??circle.y-.65)+.65;
      state.yaw=circle.heading+direction*THREE.MathUtils.degToRad(v.Deriva);state.pitch=0;
      ship.root.position.set(state.x,state.y,state.z);ship.root.rotation.set(0,state.yaw,0,'YXZ');ship.root.updateMatrixWorld();
      return;
    }
    circle.key='';
    const road=world.landscape.atDistance(route);
    state.x=road.x;state.z=road.z;state.y=(world.surfaceHeight(road.x,road.z)??road.y)+.65;
    // Heading from a chord across the polyline: segment directions jump at every sample, the chord turns continuously.
    const back=world.landscape.atDistance(route-1.5),ahead=world.landscape.atDistance(route+1.5);
    state.yaw=Math.atan2(ahead.x-back.x,ahead.z-back.z);state.pitch=Math.atan2(ahead.y-back.y,Math.hypot(ahead.x-back.x,ahead.z-back.z));
    // Pinned against a wall: small forward/back shake, the way contact resolution jitters in a race.
    const shake=STATES[stateId()].wall?.04*Math.sin(time*55):0;
    state.x+=Math.sin(state.yaw)*shake;state.z+=Math.cos(state.yaw)*shake;
    ship.root.position.set(state.x,state.y,state.z);ship.root.rotation.set(-state.pitch,state.yaw,0,'YXZ');ship.root.updateMatrixWorld();
  }
  function frameShip(){setView('libre');orbit.target.copy(ship.root.position).add(new THREE.Vector3(0,1,0));camera.position.copy(orbit.target).add(new THREE.Vector3(7,5,-10).applyAxisAngle(THREE.Object3D.DEFAULT_UP,state.yaw));orbit.update();}
  function applyView(realDt){
    const id=viewId(),view=VIEWS[id];orbit.enabled=!view.camera;
    if(!view.camera){lastView=id;return;}
    if(!rigReady){rig.copy(ship.root.quaternion);rigReady=true;}else rig.slerp(ship.root.quaternion,1-Math.exp(-realDt*5));
    if(id!==lastView){
      // Start the glide from wherever the camera is now (another view or the free orbit).
      inverseRig.copy(rig).invert();
      cameraRig.subVectors(camera.position,ship.root.position).applyQuaternion(inverseRig);targetRig.subVectors(orbit.target,ship.root.position).applyQuaternion(inverseRig);
      lastView=id;
    }
    if(view.nozzle)wantedTarget.set(mainNozzle[0],mainNozzle[1],mainNozzle[2]).multiplyScalar(SCALE);else wantedTarget.set(...view.target);
    wantedCamera.set(...view.camera);if(view.nozzle)wantedCamera.add(wantedTarget);
    const glide=1-Math.exp(-realDt*7);cameraRig.lerp(wantedCamera,glide);targetRig.lerp(wantedTarget,glide);
    camera.position.copy(cameraRig).applyQuaternion(rig).add(ship.root.position);
    target.copy(targetRig).applyQuaternion(rig).add(ship.root.position);camera.lookAt(target);orbit.target.copy(target);
  }
  function setView(id){if(!VIEWS[id])throw new Error(`Vista desconocida: ${id}`);viewKit.setValue('Vista',VIEWS[id].label);document.body.dataset.view=id;}
  function setState(id){if(!STATES[id])throw new Error(`Estado desconocido: ${id}`);stateKit.setValue('Estado',STATES[id].label);document.body.dataset.state=id;}
  function info(){
    const s=STATES[stateId()],local=ship.root.worldToLocal(camera.position.clone());
    return {view:viewId(),state:stateId(),mode:currentMode,speed:state.speed,time,paused:timeKit.values.Pausa,power:boost.stats.power,palette:boost.stats.palette,
      cameraLocal:{x:local.x,y:local.y,z:local.z},camera:camera.position.toArray(),ship:{position:ship.root.position.toArray(),yaw:state.yaw,travel:STATES[stateId()].turn?circle.heading:state.yaw},pendingSteps,frame:Number(document.body.dataset.frame??0),backend};
  }
  function setTurn({radius,direction,drift}={}){
    if(radius!==undefined)stateKit.setValue('Radio giro',radius);
    if(direction!==undefined)stateKit.setValue('Sentido',direction==='derecha'?'Derecha':'Izquierda');
    if(drift!==undefined)stateKit.setValue('Deriva',drift);
  }
  // Every panel by title, so scripts and tests can drive any dial even while its folder is collapsed.
  const dials={'Cámara':viewKit,'Estado nave':stateKit,Tiempo:timeKit,Escena:sceneKit,Humo:smokeKit,'Placa turbo · laboratorio':padControls.kit,...(boost.kit?{'Propulsor · WebGPU':boost.kit}:{})};
  const panel=name=>{if(!dials[name])throw new Error(`Panel desconocido: ${name}`);return dials[name];};
  window.playground={views:Object.keys(VIEWS),states:Object.keys(STATES),panels:Object.keys(dials),setView,setState,setTurn,info,clearFx,
    set:(name,path,value)=>panel(name).setValue(path,value),get:name=>({...panel(name).values}),
    dropOil:()=>{if(stateKit.values['VFX activos'])oil.drop();},activatePad:()=>pads.activate(state),rearmPad:()=>{pads.reset();state.padBoostRemaining=0;},focusPad,
    pause:(on=true)=>timeKit.setValue('Pausa',on),step:(count=1)=>{timeKit.setValue('Pausa',true);pendingSteps+=count;}};

  const unsubscribers=[
    viewKit.subscribe(v=>{camera.fov=v.FOV;camera.updateProjectionMatrix();document.body.dataset.view=viewId();}),
    stateKit.subscribe(v=>{document.body.dataset.state=stateId();if(!v['VFX activos'])clearFx();}),
    smokeKit.subscribe(v=>{smoke.configure({size:v.Tamaño,lifetime:v.Duración,color:v['Color humo'],density:v.Densidad,grain:v.Trama,fourSupports:v['Cuatro ruedas']});smoke.setStyle({'Híbrido':'hybrid',Procedural:'procedural',Mixto:'mixed'}[v.Estilo]);}),
  ];
  let lastRoute=0;
  unsubscribers.push(sceneKit.subscribe(v=>{
    const map=Object.values(CIRCUIT_MAPS).find(m=>m.name===v.Mapa).id;
    if(map!==mapId||v.Nave!==vehicleId){const url=new URL(location.href);url.searchParams.set('map',map);url.searchParams.set('vehicle',v.Nave);location.assign(url);return;}
    comicMaterials.setEnabled(v['Cómic']);comicStyle.strength.value=v.Trama;comicStyle.hatch.value=Number(v.Rayado);comicStyle.dots.value=Number(v.Puntos);comicStyle.screenSpace.value=Number(v['Espacio trama']==='Pantalla');document.body.dataset.comic=String(v['Cómic']);
    comicPost.outline.value=Number(v.Contornos);comicPost.grading.value=Number(v['Color cómic']);
    lighting.setNight(v.Noche);lighting.setHeadlights(v.Faros);ship.setHeadlights(v.Faros);renderer.shadowMap.enabled=v.Sombras;
    if(lastRoute!==v['Posición en pista']){clearFx();lastRoute=v['Posición en pista'];route=world.landscape.length*lastRoute/100;place();lastPosition.copy(ship.root.position);if(viewId()==='libre')frameShip();}
  }));
  // Manual driving: same fixed 60 Hz hover physics and wall collisions as the race, rendered from an interpolated pose.
  const keys=new Set(),renderPose=createFlightRenderPose(),DRIVE_KEYS=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','Space','KeyE']);
  let manualAccumulator=0,activeState=null,currentMode='Aceleración';
  const pressed=(...codes)=>codes.some(code=>keys.has(code));
  const driveInput=()=>({reducedMotion:false,turn:Number(pressed('KeyD','ArrowRight'))-Number(pressed('KeyA','ArrowLeft')),
    throttle:Number(pressed('KeyW','ArrowUp'))-Number(pressed('KeyS','ArrowDown')),boost:pressed('ShiftLeft','ShiftRight'),brake:pressed('Space'),drift:pressed('KeyE')});
  function backToTrack(){
    const road=world.landscape.roadAt(state.x,state.z);route=road.distance;place();
    Object.assign(state,{speed:0,throttle:0,vx:0,vz:0,yawRate:0,roll:0,pitch:0,recoverNeeded:false,boosting:false});renderPose.reset(state);manualAccumulator=0;
  }
  function startManual(){
    Object.assign(state,createHoverState(world.landscape),{x:state.x,y:state.y,z:state.z,yaw:state.yaw,pitch:0,roll:0,hull:scaledHull(ship.config,SCALE),modelScale:SCALE});
    renderPose.reset(state);manualAccumulator=0;if(viewId()==='libre')setView('carrera');
  }
  const views=Object.keys(VIEWS);
  const onKeyUp=event=>keys.delete(event.code),onBlur=()=>keys.clear();
  const onKey=event=>{
    if(event.target.closest?.('input,select,textarea,[contenteditable]'))return;
    if(STATES[stateId()].manual){
      if(DRIVE_KEYS.has(event.code)){keys.add(event.code);event.preventDefault();return;}
      if(event.code==='KeyR'){backToTrack();return;}
    }
    const index=Number(event.key)-1;
    if(index>=0&&index<views.length)setView(views[index]);
    else if(event.key==='p'||event.key==='P')timeKit.setValue('Pausa',!timeKit.values.Pausa);
    else if(event.key==='.')window.playground.step(1);
  };
  window.addEventListener('keydown',onKey);window.addEventListener('keyup',onKeyUp);window.addEventListener('blur',onBlur);
  const resize=()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);};window.addEventListener('resize',resize);

  place();lastPosition.copy(ship.root.position);frameShip();
  if(query.get('view'))setView(query.get('view'));
  lighting.update(state,0,{dt:1,reducedMotion:true});scene.updateMatrixWorld(true);
  await renderer.compileAsync(scene,camera);
  if(query.get('effect')==='pad')focusPad();
  document.body.dataset.materialStats=JSON.stringify(baseline.stats);
  document.body.dataset.ready='true';
  status.textContent=`${backend} · ${ship.config.name} · ${circuitMap(mapId).name}`;
  renderer.setAnimationLoop(async now=>{
    if(busy)return;busy=true;
    try{
      const elapsed=(now-previous)/1000,real=Math.min(elapsed,.05),t=timeKit.values;previous=now;
      let dt=t.Pausa?0:real*t['Velocidad tiempo'];
      // Queued steps run together (n × 1/60 s), so scripted steps don't depend on the frame rate.
      if(t.Pausa&&pendingSteps>0){dt=pendingSteps/60;pendingSteps=0;}
      time+=dt;
      const id=stateId(),s=STATES[id],v=stateKit.values,speed=s.speed*v.Velocidad,previousPadPosition={x:state.x,y:state.y,z:state.z};
      if(id!==activeState){if(s.manual)startManual();else if(STATES[activeState]?.manual)backToTrack();activeState=id;}
      if(s.manual){
        manualAccumulator+=dt;
        while(manualAccumulator>=1/60-1e-9){
          renderPose.capture(state);const before=advanceHover(state,driveInput(),1/60,world.landscape,world.surfaceHeight);world.step(state,1/60,before);
          if(v['Activar placas'])pads.step(1/60,state,before);
          if(state.recoverNeeded)backToTrack();
          manualAccumulator-=1/60;
        }
        const pose=renderPose.sample(state,manualAccumulator*60);
        ship.root.position.set(pose.x,pose.y,pose.z);ship.root.rotation.set(-pose.pitch,pose.yaw,pose.roll,'YXZ');ship.root.updateMatrixWorld();
        currentMode=state.boosting?'Turbo':state.speed>1?'Aceleración':'Reposo';
      }else{
        if(s.turn){if(circle.key)circle.heading+=(v.Sentido==='Izquierda'?1:-1)*dt*speed/v['Radio giro'];}
        else if(v['Mover nave']&&speed>0)route=(route+dt*speed)%world.landscape.length;
        place();currentMode=s.mode;
      }
      if(viewId()==='libre'){delta.subVectors(ship.root.position,lastPosition);camera.position.add(delta);orbit.target.add(delta);}
      lastPosition.copy(ship.root.position);applyView(Math.min(elapsed,.25));
      if(!s.manual){
        state.speed=speed;state.vx=Math.sin(state.yaw)*speed;state.vz=Math.cos(state.yaw)*speed;
        state.drifting=Boolean(s.drift);state.braking=Boolean(s.braking);state.slip=s.drift?.55:0;state.boosting=v['VFX activos']&&s.mode==='Turbo';
        state.hull=ship.config.hull?{halfWidth:ship.config.hull.halfWidth*SCALE,halfLength:ship.config.hull.halfLength*SCALE}:undefined;
        state.padBoostRemaining=Math.max(0,(state.padBoostRemaining??0)-dt);
        // Pads on the route would override the chosen state with their own turbo; opt in when testing them.
        if(dt>0&&v['Activar placas'])pads.step(dt,state,previousPadPosition);
      }
      if(dt>0&&v['Activar placas'])padControls.update();
      pads.update(dt,false);
      const padTurbo=state.padBoostRemaining>0;state.boosting=state.boosting||padTurbo;
      await boost.update(dt,padTurbo?'Turbo':currentMode,v['VFX activos'],padTurbo,state);smoke.update(dt,{state,camera,scale:SCALE,reduced:!v['VFX activos']});oil.update(dt,state);
      ship.pilot.update(time,true);if(orbit.enabled)orbit.update();lighting.update(state,time,{dt});boost.updatePost(comicPost);
      comicPost.heat.updatePadFields(pads.heatFields??[]);
      comicStyle.pixelRatio.value=renderer.getPixelRatio();renderer.getDrawingBufferSize(comicStyle.resolution.value);comicMaterials.sync();
      comicPost.comic.value=Number(sceneKit.values['Cómic']);
      const started=performance.now();await comicPost.render();frameMs+=performance.now()-started;frames++;
      document.body.dataset.frame=String(Number(document.body.dataset.frame??0)+1);
      document.body.dataset.vfx=JSON.stringify({enabled:v['VFX activos'],mode:currentMode,...boost.stats,smoke:smoke.stats.air,marks:smoke.stats.marks,oil:oil.sim.patches.length,time});
      document.body.dataset.boostPad=JSON.stringify({remaining:pads.sim.entries[0].remaining,activations:pads.sim.entries[0].activations,turbo:state.padBoostRemaining});
      if(now-lastHud>250){
        fps=frames*1000/(now-lastHud||1);const ms=frameMs/Math.max(1,frames);frames=0;frameMs=0;lastHud=now;
        const render=renderer.info.render,i=info();
        hud.textContent=[`FPS ${fps.toFixed(0)} · cpu ${ms.toFixed(1)} ms`,`${backend} · draw calls ${render.drawCalls??render.calls??'-'} · tris ${Math.round((render.triangles??0)/1000)}k`,
          `Vista ${VIEWS[i.view].label} · Estado ${STATES[i.state].label}`,`Modo ${i.mode} · potencia ${i.power.toFixed(2)} · ${i.palette}`,
          `Velocidad ${speed.toFixed(0)} · tiempo ${time.toFixed(2)} s ×${t['Velocidad tiempo'].toFixed(2)}${t.Pausa?' · PAUSA':''}`].join('\n');
      }
    }catch(error){renderer.setAnimationLoop(null);status.textContent=`Error: ${error.message}`;console.error(error);}finally{busy=false;}
  });
  window.addEventListener('pagehide',()=>{
    renderer.setAnimationLoop(null);window.removeEventListener('resize',resize);window.removeEventListener('keydown',onKey);window.removeEventListener('keyup',onKeyUp);window.removeEventListener('blur',onBlur);unsubscribers.forEach(u=>u());
    for(const kit of [viewKit,stateKit,timeKit,sceneKit,smokeKit])kit.destroy();
    padControls.dispose();pads.dispose();boost.dispose();smoke.dispose();oil.dispose();root.destroy();orbit.dispose();
    comicMaterials.dispose();comicPost.dispose();baseline.dispose();lighting.dispose();ship.dispose();world.dispose();renderer.dispose();delete window.playground;
  },{once:true});
}
main().catch(error=>{status.textContent=`No se pudo iniciar: ${error.message}`;document.body.dataset.error=error.message;console.error(error);});
