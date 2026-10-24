import {createFlightRenderPose} from './flight-render-pose.js';
import {createFlightCameraKlipp} from './flight-camera-klipp.js';
import {pilotChoice,pilotConfig,pilotQuery} from './pilot-catalog.js';
import {createFlightHeat} from './flight-heat.js';
import {createExhaustControls} from './flight-exhaust-controls.js';
import * as THREE from 'three';
import {circuitMap} from './circuit-maps.js';
import {createCircuitLighting} from './circuit-lighting.js';
import {createCircuitWorld} from './circuit-world.js';
import {createHoverState,advanceHover,recoverHover,crossesCircuitGate} from './circuit-physics.js';
import {createFlightShip} from './flight-ship.js';
import {createFlightScale,scaledHull} from './flight-scale.js';
import {createFlightOil} from './flight-oil.js';
import {createFlightFxControls} from './flight-fx-controls.js';
import {createCharacterComic} from './character-comic.js';
import {formatRaceTime} from './circuit-physics.js';
import './flight-simulator.css';
import {raceAudio} from './race-audio.js';
import {soundControlMarkup,mountSoundControl} from './sound-control.js';
import {shipConfig} from './ship-catalog.js';
import {createCircuitSky,createSpeedAtmosphere,speedCameraProfile} from './flight-atmosphere.js';
import {createFlightPerformance} from './flight-performance.js';

export async function createFlightSimulator({launchMode,entryTransition}={}){
  const base=import.meta.env.BASE_URL,query=new URLSearchParams(location.search),reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const mapConfig=circuitMap(query.get('map')),selectedShip=shipConfig(query.get('vehicle')),choice=pilotChoice(query),selectedPilot=pilotConfig(choice.pilot),pilotParams=pilotQuery(choice);
  document.title=`Biggas Hover Racing · ${mapConfig.name} ${mapConfig.number}`;
  const canonical=new URL(location.href);canonical.searchParams.set('map',mapConfig.id);canonical.searchParams.set('vehicle',selectedShip.id);canonical.searchParams.delete('seed');history.replaceState(null,'',canonical);
  document.body.innerHTML=`<main class="flight-app" data-ready="false" data-phase="loading">
    <canvas class="flight-canvas" tabindex="0" aria-label="Circuito flotante. W y S para velocidad, A y D o flechas laterales para girar, E para derrapar, espacio para frenar, Shift para turbo, F para faros y Escape para pausar. Altura automática."></canvas>
    <header class="flight-header"><div class="flight-brand" aria-label="Biggas Hover Racing"><strong aria-hidden="true">✳</strong> <span class="flight-brand-name">BIGGAS</span> <small id="flight-map-name">${mapConfig.name.toUpperCase()} ${mapConfig.number}</small></div><nav aria-label="Controles del simulador"><a href="${base}spaceship.html?vehicle=${selectedShip.id}&${pilotParams}">Hangar</a>${soundControlMarkup('flight-sound')}<button id="flight-comic" aria-pressed="${query.get('comic')!=='0'}" aria-label="Cómic" title="Cómic">◐</button><button id="flight-headlights" aria-label="Faros" aria-pressed="false" title="Faros · F"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M14 5v14c9 0 9-14 0-14Z M10 6H2 M10 10H2 M10 14H2 M10 18H2"/></svg></button><button id="flight-light" aria-label="Iluminación nocturna" aria-pressed="false" title="Día / noche">☾</button><button id="flight-camera" disabled aria-label="Cambiar cámara" title="Cambiar cámara · C">◉ <span class="flight-camera-word">Cámara</span></button><button id="flight-pause" aria-label="Pausar vuelo" title="Pausar · Esc" disabled>Ⅱ</button></nav></header>
    <section class="flight-race" aria-label="Estado de la carrera" hidden><div><label id="flight-mode-label">CONTRARRELOJ</label><output id="flight-time">00:00.00</output></div><div><label>PUERTAS</label><output id="flight-gates">01 / 16</output></div><div class="flight-best"><label>MEJOR TIEMPO</label><output id="flight-best">—</output></div></section>
    <section class="flight-menu" aria-label="Menú de vuelo" hidden><div class="flight-menu-tag"><span>${selectedPilot.name.toUpperCase()} AL MANDO</span><span id="flight-seed">HOVER</span></div><h1 id="flight-menu-title">${mapConfig.name} <span>${mapConfig.number}.</span></h1><a class="flight-team-link" href="${base}simulator.html?map=${mapConfig.id}&vehicle=${selectedShip.id}&${pilotParams}"><span>${selectedPilot.name} × ${selectedShip.name}</span><span>Cambiar selección</span></a><p class="flight-menu-score" hidden></p><p class="flight-menu-record" hidden></p><button id="flight-resume" class="flight-primary" hidden>Continuar </button><div id="flight-modes"><button id="flight-free" class="flight-primary">Recorrer circuito </button><button id="flight-race-start">Contrarreloj <span>1 vuelta</span></button></div><button id="flight-restart" hidden>Reiniciar <span>↻</span></button><nav class="flight-exit-links" aria-label="Salir del circuito"><a id="flight-map-selection" href="${base}?selection=map&map=${mapConfig.id}&vehicle=${selectedShip.id}&${pilotParams}">Selección de mapa <span aria-hidden="true">→</span></a><a id="flight-main-menu" href="${base}">Volver al menú principal <span aria-hidden="true">⌂</span></a></nav><div class="flight-quality"><label for="flight-quality">Gráficos</label><select id="flight-quality"><option value="auto">Automático</option><option value="high">Mayor calidad</option><option value="performance">Más fluidez</option></select><span id="flight-quality-state">Se adapta a tu equipo</span></div><div class="flight-menu-help"><span><kbd>W S</kbd> Velocidad</span><span><kbd>A D</kbd> Girar</span><span><kbd>SHIFT</kbd> Turbo</span><span><kbd>ESPACIO</kbd> Frenar</span><span><kbd>E</kbd> Derrapar</span><span><kbd>R</kbd> Recuperar</span><span><kbd>Q</kbd> Aceite (libre)</span><span><kbd>F</kbd> Faros</span><span><kbd>M</kbd> Sonido</span></div></section>
    <div class="flight-loader" role="status"><span id="flight-load-status">Preparando ${mapConfig.name} ${mapConfig.number}…</span><progress max="1" value="0"></progress></div>
    <div class="flight-target" hidden aria-hidden="true"><i>⌄</i><span></span></div><div class="flight-countdown" role="status" hidden></div><div class="flight-notice" role="status" hidden></div>
    <section class="flight-telemetry" aria-label="Telemetría"><div class="flight-speed"><output id="flight-speed">0</output><span>km/h</span></div><span class="flight-drift" hidden>DERRAPE</span><div class="flight-altitude">ALT <output id="flight-altitude">0</output> m</div><div class="flight-energy" role="progressbar" aria-label="Reserva de turbo" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><span></span></div><div class="flight-energy-label"><span>TURBO</span><span id="flight-energy-value">100%</span></div></section>
    <aside class="flight-minimap" aria-label="Mapa del circuito"><canvas width="192" height="192" role="img" aria-label="Tu posición y la siguiente puerta en el circuito"></canvas><span id="flight-map-caption">${mapConfig.name.toUpperCase()} / ${mapConfig.number}</span></aside>
    <div class="flight-key-hint">W/S VELOCIDAD · A/D GIRO · E DERRAPE · SHIFT TURBO · Q ACEITE · F FAROS · C CÁMARA · M SONIDO · ESC PAUSA</div>
    <div class="flight-touch" hidden><div class="flight-stick" role="group" aria-label="Joystick: girar"><span></span></div><div class="flight-touch-buttons"><button data-hold="accelerate" aria-label="Acelerar" aria-pressed="false">ACELERAR</button><button data-hold="brake" aria-label="Frenar" aria-pressed="false">FRENAR</button><button data-hold="drift" aria-label="Derrapar" aria-pressed="false">DERRAPAR</button><button data-hold="boost" aria-label="Turbo" aria-pressed="false">TURBO</button></div></div>
  </main>`;
  entryTransition?.mount();
  const $=s=>document.querySelector(s),app=$('.flight-app'),canvas=$('.flight-canvas'),loader=$('.flight-loader');
  app.dataset.entryMotion=String(entryTransition?.animated??false);
  const useWebGPU=['webgpu','webgl2'].includes(query.get('renderer'));
  const gpuModule=useWebGPU?await import('./flight-webgpu.js'):null;
  let renderer,gpuGraphics;
  function fail(message){entryTransition?.cancel();raceAudio.setPhase('loading');loader.hidden=false;loader.replaceChildren();const text=document.createElement('p');text.textContent=message;const retry=document.createElement('button');retry.textContent='Reintentar';retry.onclick=()=>location.reload();loader.append(text,retry);}
  try{renderer=useWebGPU?await gpuModule.createRenderer(canvas,query.get('renderer')==='webgl2'):new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});}catch(error){console.error(error);fail('No se pudo iniciar la vista 3D.');return;}
  app.dataset.backend=useWebGPU?(renderer.backend.isWebGPUBackend?'WebGPU':'WebGL2'):'WebGL';
  const mobile=matchMedia('(max-width:760px), (pointer:coarse)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1.25:1.5));renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=useWebGPU?THREE.PCFShadowMap:THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  const scene=new THREE.Scene();scene.fog=new THREE.Fog(0xb6c6bd,220,1100);scene.background=new THREE.Color(0xb6c6bd);
  scene.matrixWorldAutoUpdate=false;
  const camera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.15,7000);
  const lighting=createCircuitLighting(scene,{mobile,headlightMounts:selectedShip.headlights});
  const skyWorld=createCircuitSky(scene,{mobile,map:mapConfig.id}),speedAtmosphere=createSpeedAtmosphere(scene,{mobile});
  const comic=useWebGPU?null:createCharacterComic(renderer);let comicEnabled=query.get('comic')!=='0';
  let shadowElapsed=Infinity,shadowInterval=1/30;
  const performanceControl=createFlightPerformance({width:innerWidth,height:innerHeight,pixelRatio:devicePixelRatio,mobile,onChange:applyQuality});
  function applyQuality(settings){
    renderer.setPixelRatio(settings.pixelRatio);comic?.setQuality(settings);gpuGraphics?.setQuality(settings);
    app.dataset.quality=settings.mode;app.dataset.renderScale=settings.scale.toFixed(2);
    shadowInterval=settings.shadowInterval;
    lighting.sun.shadow.needsUpdate=true;
  }
  applyQuality(performanceControl.settings);lighting.sun.shadow.autoUpdate=false;
  let landscape,world,vehicle,oil,fxControls,exhaustControls,heat,state,phase='loading',mode='free',elapsed=0,simulationTime=0,worldTime=0,countdown=3,countdownDeadline=0,gateIndex=0,penalty=0,best=null,cameraMode=0,accumulator=0,noticeUntil=0;
  const keys=new Set(),touch={turn:0,accelerate:false,brake:false,boost:false,drift:false};let stickPointer=null;
  const mapCanvas=$('.flight-minimap canvas'),mapContext=mapCanvas.getContext('2d'),mapBase=document.createElement('canvas');mapBase.width=mapBase.height=192;
  const cameraAnchor=new THREE.Vector3(),followAnchor=new THREE.Vector3(),cameraPoint=new THREE.Vector3(),lookPoint=new THREE.Vector3(),desiredCamera=new THREE.Vector3(),desiredLook=new THREE.Vector3(),forward=new THREE.Vector3(),projected=new THREE.Vector3();
  let mapBitmap=null,lastHud=-1,lastPilotFrame=-1,disposed=false;
  const hud={speed:$('#flight-speed'),alt:$('#flight-altitude'),time:$('#flight-time'),gate:$('#flight-gates'),energy:$('.flight-energy span'),energyBar:$('.flight-energy'),energyValue:$('#flight-energy-value'),target:$('.flight-target'),targetText:$('.flight-target span')};
  function setText(element,text){if(element.textContent!==text)element.textContent=text;}
  const recordKey=()=>mapConfig.record;
  const mapHalf=()=>landscape.mapHalf;
  let modelScale=.75;
  const freshState=()=>({...createHoverState(landscape),hull:scaledHull(selectedShip,modelScale),modelScale});
  const scaleControl=createFlightScale(scale=>{
    modelScale=scale;app.dataset.modelScale=scale.toFixed(2);
    if(state){state.hull=scaledHull(selectedShip,scale);state.modelScale=scale;}
    vehicle?.root.scale.setScalar(scale);lighting.sun.shadow.needsUpdate=true;
  },clearInput);
  const klippCamera=createFlightCameraKlipp(camera,{enabled:query.get('camera')!=='actual',element:canvas,canOrbit:()=>phase==='flying'||phase==='paused'});
  const renderPose=createFlightRenderPose();
  const gateNumber=()=>Math.min(gateIndex,16);
  app.dataset.map=mapConfig.id;app.dataset.pilot=choice.pilot;app.dataset.palette=choice.palette;app.dataset.hat=choice.hat;app.dataset.vehicle=selectedShip.id;
  function readBest(){best=null;try{const stored=Number(localStorage.getItem(recordKey()));if(stored>0&&Number.isFinite(stored))best=stored;}catch{}setText($('#flight-best'),best===null?'—':formatRaceTime(best));}
  function clearInput(){keys.clear();touch.turn=0;touch.accelerate=touch.brake=touch.boost=touch.drift=false;stickPointer=null;$('.flight-stick span').style.transform='none';document.querySelectorAll('[data-hold]').forEach(button=>button.setAttribute('aria-pressed','false'));}
  function setPhase(next){
    scaleControl.setVisible(next==='flying'||next==='countdown');
    const previousPhase=phase;phase=next;raceAudio.setPhase(next);app.dataset.phase=next;if(next!=='flying'||previousPhase==='paused')clearInput();
    if(previousPhase!==next)performanceControl.reset();
    const moving=next==='flying'||next==='countdown';$('.flight-menu').hidden=!['menu','paused','finished'].includes(next);$('.flight-race').hidden=!moving&&next!=='paused';$('.flight-touch').hidden=next!=='flying';hud.target.hidden=!moving;
    $('#flight-pause').disabled=!moving&&next!=='paused';$('#flight-pause').textContent=next==='paused'?'▶':'Ⅱ';$('#flight-pause').setAttribute('aria-label',next==='paused'?'Continuar vuelo':'Pausar vuelo');
    $('.flight-countdown').hidden=next!=='countdown';$('#flight-camera').disabled=next==='loading'||next==='menu';
    $('#flight-resume').hidden=next!=='paused';$('#flight-restart').hidden=next!=='paused';$('#flight-modes').hidden=next==='paused';
    $('.flight-menu-score').hidden=next!=='finished';$('.flight-menu-record').hidden=next!=='finished';
    if(next==='menu')$('#flight-menu-title').innerHTML=`${mapConfig.name} <span>${mapConfig.number}.</span>`;
    if(next==='paused')$('#flight-menu-title').textContent='En pausa.';
    if(next==='finished')$('#flight-menu-title').textContent='Meta.';
    if(moving)canvas.focus({preventScroll:true});else if(next==='paused')$('#flight-resume').focus({preventScroll:true});else if(next==='finished')$('#flight-race-start').focus({preventScroll:true});
    if(next==='paused'){lastHud=-1;updateHud(performance.now()/1000);}
  }
  function notice(text){setText($('.flight-notice'),text);$('.flight-notice').hidden=false;noticeUntil=performance.now()+2300;}
  function resetFlight(){gpuGraphics?.reset();state=freshState();elapsed=0;simulationTime=0;gateIndex=0;penalty=0;accumulator=0;world.setGate(0);world.reset();oil?.reset(state,mode==='free');syncShip();updateCamera(1,true);lastHud=-1;}
  function start(nextMode){raceAudio.unlock();mode=nextMode;resetFlight();$('.flight-notice').hidden=true;setText($('#flight-mode-label'),mode==='race'?'CONTRARRELOJ':'CIRCUITO LIBRE');countdown=3;countdownDeadline=performance.now()+3000;setText($('.flight-countdown'),'3');setPhase(mode==='race'?'countdown':'flying');raceAudio.cue(mode==='race'?'countdown':'go',3);updateCamera(1,true);}
  function prepareOilTest(botDrops=false){
    if(mode!=='free'||phase!=='flying')return;
    resetFlight();
    const startDistance=landscape.roadAt(landscape.spawn.x,landscape.spawn.z).distance;
    const road=landscape.atDistance(startDistance+30),speed=oil.sim.config.botSpeed+(botDrops?8:0);
    Object.assign(state,{x:road.x,y:(world.surfaceHeight(road.x,road.z)??road.y)+.65,z:road.z,yaw:Math.atan2(road.nx,road.nz),pitch:Math.atan(road.grade),speed,throttle:speed,vx:road.nx*speed,vz:road.nz*speed});
    gateIndex=1;world.setGate(gateIndex);clearInput();oil.prepare(state,botDrops);syncShip();updateCamera(1,true);canvas.focus({preventScroll:true});notice(botDrops?'El bot vierte aceite · atravesá la estela':'Prueba lista · Q para dejar aceite al bot');
  }
  function pause(){if(phase==='flying'||phase==='countdown'){if(phase==='countdown')countdown=Math.max(0,(countdownDeadline-performance.now())/1000);setPhase('paused');}else if(phase==='paused'){raceAudio.unlock();countdownDeadline=performance.now()+countdown*1000;setPhase(countdown>0&&mode==='race'?'countdown':'flying');}}
  function recover(manual=false){
    world.fx.reset();gpuGraphics?.reset();
    oil?.cancelPour();raceAudio.cue('recover');const checkpoint=recoverHover(landscape,gateIndex);
    Object.assign(state,createHoverState(landscape),checkpoint,{speed:0,pitch:0,roll:0,throttle:0,boosting:false,cooldown:1.2});
    if(mode==='race'){penalty+=3;notice(manual?'Recuperado · +3 s':'Fuera de pista · +3 s');}else notice(manual?'Nave recuperada':'Fuera de pista · nave recuperada');
    syncShip();updateCamera(1,true);
  }
  function finish(){
    const score=elapsed+penalty,newRecord=best===null||score<best;
    if(newRecord){best=score;try{localStorage.setItem(recordKey(),String(score));}catch{}}
    setText($('.flight-menu-score'),formatRaceTime(score));setText($('.flight-menu-record'),newRecord?'Nuevo mejor tiempo':`Mejor: ${formatRaceTime(best)}`);setText($('#flight-best'),formatRaceTime(best));setPhase('finished');raceAudio.cue('finish');
  }
  function input(){return {reducedMotion:reduced.matches,turn:THREE.MathUtils.clamp(Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'))+touch.turn,-1,1),throttle:Number(keys.has('KeyW')||touch.accelerate)-Number(keys.has('KeyS')),boost:keys.has('ShiftLeft')||keys.has('ShiftRight')||touch.boost,brake:keys.has('Space')||touch.brake,drift:keys.has('KeyE')||touch.drift};}
  function step(dt){
    if(phase!=='flying')return;
    renderPose.capture(state);
    elapsed+=dt;simulationTime+=dt;
    const impactSerial=state.impactSerial;
    oil?.beforeStep(state,dt);
    const previous=advanceHover(state,input(),dt,landscape,world.surfaceHeight);
    world.step(state,dt,previous);if(state.impactSerial!==impactSerial)raceAudio.cue('impact',state.impact);if(state.recoverNeeded){recover(false);return;}
    oil?.step(dt,state,previous);
    const gate=landscape.gates[gateIndex];
    if(crossesCircuitGate(previous,state,gate)){
      gateIndex++;
      if(gateIndex===landscape.gates.length){if(mode==='race'){finish();return;}gateIndex=1;}
      raceAudio.cue('checkpoint');world.setGate(gateIndex);notice(gateIndex===1?'Nueva vuelta':`${String(gateIndex-1).padStart(2,'0')} / 16`);
    }
  }
  function syncShip(viewState=state){const state=viewState;if(!vehicle)return;vehicle.root.position.set(state.x,state.y,state.z);vehicle.root.rotation.set(-state.pitch,state.yaw,reduced.matches?0:state.roll,'YXZ');}
  function updateCamera(dt,snap=false,viewState=state){
    const state=viewState;
    if(snap)renderPose.reset(state);
    if(phase==='menu'){klippCamera.suspend();camera.position.fromArray(mapConfig.overview);lookPoint.fromArray(mapConfig.lookAt);camera.lookAt(lookPoint);cameraPoint.copy(camera.position);followAnchor.set(state.x,state.y,state.z);return;}
    forward.set(Math.sin(state.yaw),0,Math.cos(state.yaw));
    const profile=speedCameraProfile(state,{reducedMotion:reduced.matches,cameraMode}),distance=profile.distance,up=profile.height;
    const useKlipp=klippCamera.enabled&&cameraMode!==2&&!oil?.lookingBack;
    app.dataset.cameraSystem=useKlipp?'Klipp':'Actual';
    if(useKlipp){
      klippCamera.update(state,dt,{world,profile,snap,reduced:reduced.matches,cameraMode});
      cameraPoint.copy(camera.position);followAnchor.set(state.x,state.y,state.z);
      camera.getWorldDirection(lookPoint);lookPoint.multiplyScalar(12).add(camera.position);return;
    }
    klippCamera.suspend();
    if(!snap){const dx=state.x-followAnchor.x,dy=state.y-followAnchor.y,dz=state.z-followAnchor.z;cameraPoint.x+=dx;cameraPoint.y+=dy;cameraPoint.z+=dz;lookPoint.x+=dx;lookPoint.y+=dy;lookPoint.z+=dz;}
    followAnchor.set(state.x,state.y,state.z);
    const rear=oil?.lookingBack;
    desiredCamera.set(state.x,state.y+(rear?5:up),state.z).addScaledVector(forward,rear?Math.max(12,distance):-distance);
    if(cameraMode!==2){const side=.8;desiredCamera.x+=Math.cos(state.yaw)*side;desiredCamera.z-=Math.sin(state.yaw)*side;}
    desiredCamera.y=Math.max(desiredCamera.y,(world?.surfaceHeight(desiredCamera.x,desiredCamera.z)??0)+3.5);
    const lookDistance=rear?-12:cameraMode===2?70:8;
    desiredLook.set(state.x+Math.sin(state.yaw+profile.anticipation)*lookDistance,state.y+(cameraMode===2?2.4:2)+Math.sin(state.pitch)*(cameraMode===2?70:4),state.z+Math.cos(state.yaw+profile.anticipation)*lookDistance);
    const alpha=snap||reduced.matches?1:1-Math.exp(-dt*8);
    cameraPoint.lerp(desiredCamera,alpha);cameraAnchor.set(state.x,state.y+2.3,state.z);world.clipCamera?.(cameraAnchor,cameraPoint);lookPoint.lerp(desiredLook,alpha);camera.position.copy(cameraPoint);if(!reduced.matches&&state.impact>0){camera.position.x+=Math.sin(simulationTime*48)*state.impact*.008;camera.position.y+=Math.cos(simulationTime*39)*state.impact*.006;}camera.lookAt(lookPoint);
    const fov=profile.fov;if(Math.abs(camera.fov-fov)>.01){camera.fov+=snap||reduced.matches?fov-camera.fov:(fov-camera.fov)*(1-Math.exp(-dt*4));camera.updateProjectionMatrix();}
  }
  function buildMap(){
    const ctx=mapBase.getContext('2d');
    ctx.fillStyle='#263f3e';ctx.fillRect(0,0,192,192);ctx.strokeStyle='#9aab8d';ctx.lineWidth=7;ctx.setLineDash([]);ctx.beginPath();
      landscape.samples.forEach((sample,i)=>{const x=(sample.position[0]/mapHalf()+1)*96,y=(sample.position[2]/mapHalf()+1)*96;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.closePath();ctx.stroke();ctx.lineWidth=1;ctx.strokeStyle='#e5dfba';ctx.stroke();mapBitmap=mapBase;
  }

  function drawMap(){
    if(!mapBitmap)return;mapContext.drawImage(mapBitmap,0,0);
    landscape.gates.forEach((gate,i)=>{if(i===16&&gateIndex!==16)return;mapContext.fillStyle=i===gateIndex?'#ffb35e':i<gateIndex?'#567361':'#eee5ce';mapContext.beginPath();mapContext.arc((gate.x/mapHalf()+1)*96,(gate.z/mapHalf()+1)*96,i===gateIndex?3.5:1.5,0,Math.PI*2);mapContext.fill();});
    mapContext.save();mapContext.translate((state.x/mapHalf()+1)*96,(state.z/mapHalf()+1)*96);mapContext.rotate(Math.PI-state.yaw);mapContext.fillStyle='#fff9dd';mapContext.strokeStyle='#233e3d';mapContext.lineWidth=1.5;mapContext.beginPath();mapContext.moveTo(0,-7);mapContext.lineTo(4,4);mapContext.lineTo(0,2);mapContext.lineTo(-4,4);mapContext.closePath();mapContext.fill();mapContext.stroke();mapContext.restore();oil?.drawMap(mapContext,mapHalf());
  }
  function updateHud(now){
    const gate=landscape.gates[Math.min(gateIndex,landscape.gates.length-1)],distance=Math.hypot(gate.x-state.x,gate.y-state.y,gate.z-state.z);
    projected.set(gate.x,gate.y+3,gate.z).project(camera);
    let x=(projected.x*.5+.5)*innerWidth,y=(-projected.y*.5+.5)*innerHeight;
    const behind=projected.z>1;
    if(behind){const error=Math.atan2(Math.sin(Math.atan2(gate.x-state.x,gate.z-state.z)-state.yaw),Math.cos(Math.atan2(gate.x-state.x,gate.z-state.z)-state.yaw));x=innerWidth*(error<0?.72:.28);y=innerHeight*.65;setText($('.flight-target i'),error<0?'↷':'↶');}else setText($('.flight-target i'),'⌄');
    x=THREE.MathUtils.clamp(x,55,innerWidth-55);y=THREE.MathUtils.clamp(y,150,innerHeight-180);
    hud.target.style.transform=`translate3d(${x}px,${y}px,0) translate(-50%,-100%)`;
    if(now-lastHud<.1)return;lastHud=now;
    setText(hud.speed,String(Math.round(state.speed*3.6)));setText(hud.alt,Math.max(0,state.y-(world.surfaceHeight(state.x,state.z)??landscape.height(state.x,state.z))).toFixed(1));
    setText(hud.time,formatRaceTime(elapsed+penalty));setText(hud.gate,`${String(gateNumber()).padStart(2,'0')} / 16`);
    const energy=Math.round(state.energy*100);hud.energy.style.transform=`scaleX(${state.energy})`;hud.energyBar.setAttribute('aria-valuenow',String(energy));setText(hud.energyValue,`${energy}%`);setText(hud.targetText,`${gateIndex===0?'SALIDA':gateIndex===16?'META':String(gateNumber()).padStart(2,'0')} · ${Math.round(distance)} m`);
    $('.flight-drift').hidden=!state.drifting||phase!=='flying';app.dataset.drifting=String(state.drifting);app.dataset.lighting=lighting.night?'night':'day';app.dataset.headlights=String(lighting.headlightsEnabled);app.dataset.textureFamilies=String(world.textures.count);
    app.dataset.fov=camera.fov.toFixed(2);app.dataset.speedEffect=speedAtmosphere.intensity.toFixed(3);app.dataset.cloudCount=String(skyWorld.cloudCount);
    app.dataset.fps=String(performanceControl.fps);
    app.dataset.fxAir=String(world.fx.stats.air);app.dataset.fxMarks=String(world.fx.stats.marks);app.dataset.fxTime=world.fx.stats.time.toFixed(3);app.dataset.fxStyle=world.fx.style;
    setText($('#flight-quality-state'),performanceControl.fps?`${performanceControl.fps} FPS`:'Se adapta a tu equipo');
    app.dataset.offTrack=String((state.offTrackTime??0)>0);app.dataset.yaw=state.yaw.toFixed(3);app.dataset.pitch=state.pitch.toFixed(3);app.dataset.speed=state.speed.toFixed(2);app.dataset.x=state.x.toFixed(2);app.dataset.y=state.y.toFixed(2);app.dataset.z=state.z.toFixed(2);app.dataset.gate=String(gateIndex);app.dataset.energy=state.energy.toFixed(3);app.dataset.penalty=String(penalty);app.dataset.time=elapsed.toFixed(2);app.dataset.camera=String(cameraMode);app.dataset.comic=String(comicEnabled);app.dataset.hover=(state.y-(world.surfaceHeight(state.x,state.z)??landscape.height(state.x,state.z))).toFixed(3);app.dataset.wallHit=String(state.wallHit);app.dataset.slip=state.slip.toFixed(3);app.dataset.impact=state.impact.toFixed(2);app.dataset.effectsTime=worldTime.toFixed(2);app.dataset.detailCount=String(world.detailCount);
    drawMap();
  }
  async function loadWorld(){
    const next=await createCircuitWorld({map:mapConfig.id,mobile,fxMaterialFactory:gpuModule?.createSmokeMaterial,anisotropy:Math.min(4,(useWebGPU?renderer.getMaxAnisotropy():renderer.capabilities.getMaxAnisotropy())),onProgress:value=>{$('.flight-loader progress').value=value;entryTransition?.progress(value);}});
    world=next;landscape=next.landscape;scene.add(world.root);lighting.setTrack(landscape);world.textures.applyRoot(lighting.root);
    fxControls=createFlightFxControls(world.fx,message=>{notice(message);if(phase==='flying')canvas.focus({preventScroll:true});});
    setText($('#flight-seed'),`${Math.round(landscape.length)} M · HOVER`);buildMap();readBest();resetFlight();loader.hidden=true;setPhase('menu');updateCamera(1,true);
  }
  document.querySelectorAll('.flight-team-link, #flight-map-selection').forEach(link=>link.addEventListener('click',()=>{const url=new URL(link.href);url.searchParams.set('comic',comicEnabled?'1':'0');if(useWebGPU)url.searchParams.set('renderer',query.get('renderer'));if(link.id==='flight-map-selection')url.searchParams.set('mode',mode);link.href=url.href;}));
  const soundControl=mountSoundControl($('.sound-control'),{onOpen:clearInput});
  const toggleSound=()=>soundControl.toggleSound();
  $('#flight-quality').value=performanceControl.mode;
  $('#flight-quality').addEventListener('change',event=>performanceControl.setMode(event.target.value));
  $('#flight-free').onclick=()=>start('free');$('#flight-race-start').onclick=()=>start('race');$('#flight-resume').onclick=pause;$('#flight-pause').onclick=pause;$('#flight-restart').onclick=()=>start(mode);
  function changeCamera(){cameraMode=(cameraMode+1)%3;notice(['Cámara cercana','Cámara lejana','Cámara a bordo'][cameraMode]);if(reduced.matches)updateCamera(1,true);}
  $('#flight-camera').onclick=changeCamera;
  function toggleHeadlights(){lighting.setHeadlights(!lighting.headlightsEnabled);vehicle?.setHeadlights(lighting.headlightsEnabled);$('#flight-headlights').setAttribute('aria-pressed',String(lighting.headlightsEnabled));}
  $('#flight-headlights').onclick=toggleHeadlights;
  $('#flight-light').onclick=event=>{lighting.setNight(!lighting.night);event.currentTarget.setAttribute('aria-pressed',String(lighting.night));event.currentTarget.textContent=lighting.night?'☀':'☾';};
  $('#flight-comic').onclick=event=>{comicEnabled=!comicEnabled;event.currentTarget.setAttribute('aria-pressed',String(comicEnabled));};
  document.addEventListener('keydown',event=>{
    if(/INPUT|SELECT|TEXTAREA/.test(event.target.tagName))return;
    if(event.code==='Space'&&event.target.closest('button,a'))return;
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(event.code))event.preventDefault();
    if(event.code==='Escape'&&!event.repeat)pause();
    if(event.code==='KeyM'&&!event.repeat){event.preventDefault();toggleSound();}
    if(event.code==='KeyF'&&!event.repeat){event.preventDefault();toggleHeadlights();}
    if(event.code==='KeyC'&&!event.repeat&&!['loading','menu'].includes(phase))changeCamera();
    if(event.code==='KeyQ'&&!event.repeat&&phase==='flying'){event.preventDefault();oil?.use();}
    if(event.code==='KeyR'&&!event.repeat&&phase==='flying')recover(true);
    if(phase==='flying'||phase==='countdown'){raceAudio.unlock();keys.add(event.code);}
  });
  canvas.addEventListener('pointerdown',()=>raceAudio.unlock());
  document.addEventListener('keyup',event=>keys.delete(event.code));
  window.addEventListener('blur',()=>{raceAudio.setPhase('paused');clearInput();if(phase==='flying'||phase==='countdown')pause();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){raceAudio.setPhase('paused');clearInput();if(phase==='flying'||phase==='countdown')pause();}});
  const stick=$('.flight-stick');
  function moveStick(event){if(event.pointerId!==stickPointer)return;const rect=stick.getBoundingClientRect(),radius=rect.width*.33;touch.turn=THREE.MathUtils.clamp((event.clientX-rect.left-rect.width/2)/radius,-1,1);$('.flight-stick span').style.transform=`translateX(${touch.turn*radius}px)`;}
  stick.addEventListener('pointerdown',event=>{if(stickPointer!==null)return;raceAudio.unlock();stickPointer=event.pointerId;stick.setPointerCapture(event.pointerId);moveStick(event);});stick.addEventListener('pointermove',moveStick);
  const releaseStick=event=>{if(event.pointerId!==stickPointer)return;stickPointer=null;touch.turn=0;$('.flight-stick span').style.transform='none';};
  for(const type of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(type,releaseStick);
  document.querySelectorAll('[data-hold]').forEach(button=>{
    let pointerId=null;button.addEventListener('pointerdown',event=>{if(pointerId!==null)return;raceAudio.unlock();pointerId=event.pointerId;button.setPointerCapture(pointerId);touch[button.dataset.hold]=true;button.setAttribute('aria-pressed','true');});
    const release=event=>{if(event.pointerId!==pointerId)return;pointerId=null;touch[button.dataset.hold]=false;button.setAttribute('aria-pressed','false');};for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,release);
  });
  window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);performanceControl.resize(innerWidth,innerHeight,devicePixelRatio);});
  reduced.addEventListener('change',()=>{if(state)updateCamera(1,true);});
  try{
    const results=await Promise.allSettled([createFlightShip(selectedShip.id,choice),loadWorld()]);const failure=results.find(result=>result.status==='rejected');if(failure)throw failure.reason;vehicle=results[0].value;vehicle.root.scale.setScalar(modelScale);vehicle.setHeadlights(lighting.headlightsEnabled);scene.add(vehicle.root);syncShip();updateCamera(1,true);
    if(!useWebGPU){heat=createFlightHeat(renderer);exhaustControls=createExhaustControls(vehicle.exhaust,heat);}
    oil=await createFlightOil({scene,landscape,surfaceHeight:world.surfaceHeight,app,clearInput,onPrepare:prepareOilTest,onNotice:notice,materialFactory:gpuModule?.oilMaterialFactory});oil.reset(state,mode==='free');
    if(useWebGPU){gpuGraphics=await gpuModule.createFlightWebGPU(renderer,scene,camera,vehicle,oil);gpuGraphics.setQuality(performanceControl.settings);}
    setPhase('loading');loader.hidden=!!entryTransition;setText($('#flight-load-status'),'Preparando gráficos…');
    lighting.update(state,worldTime,{reducedMotion:reduced.matches});skyWorld.update(camera,0,{reducedMotion:reduced.matches});scene.updateMatrixWorld(true);camera.updateMatrixWorld();
    await renderer.compileAsync(scene,camera);await comic?.prepare(scene,camera);
    loader.hidden=true;
    if(entryTransition){
      // Draw the actual track before pulling away the cover. The race clock and
      // countdown only start after the player can see the circuit.
      setPhase('loading');updateCamera(1,true);skyWorld.update(camera,0,{reducedMotion:reduced.matches});scene.updateMatrixWorld(true);camera.updateMatrixWorld();
      if(gpuGraphics)await gpuGraphics.render({state,phase,comic:comicEnabled,reduced:reduced.matches});else heat.render(()=>{if(comicEnabled)comic.render(scene,camera,`#${scene.background.getHexString()}`);else renderer.render(scene,camera);},{ship:vehicle,camera,time:simulationTime,reduced:reduced.matches,boost:state.boosting,depthTexture:comicEnabled?()=>comic.depthTexture:null});
      await entryTransition.reveal();
    }
    app.dataset.ready='true';if(launchMode==='free'||launchMode==='race'){start(launchMode);if(document.hidden)pause();}else setPhase('menu');
  }catch(error){console.error(error);fail('No se pudo cargar el simulador.');return;}
  const clock=new THREE.Clock();
  let rendering=false;
  async function frame(){
    if(disposed||rendering)return;rendering=true;try{const rawDelta=clock.getDelta(),dt=Math.min(rawDelta,.1);if(document.hidden||phase==='loading')return;
    if(phase==='flying'||phase==='countdown')performanceControl.sample(rawDelta*1000);
    if(phase==='countdown'){
      countdown=Math.max(0,(countdownDeadline-performance.now())/1000);setText($('.flight-countdown'),String(Math.max(1,Math.ceil(countdown))));
      if(countdown<=0){setPhase('flying');raceAudio.cue('go');}else raceAudio.cue('countdown',Math.ceil(countdown));accumulator=0;
    }else{accumulator+=dt;while(accumulator>=1/60){step(1/60);accumulator-=1/60;}}
    raceAudio.update(state);
    const viewState=phase==='flying'?renderPose.sample(state,accumulator*60):state;
    syncShip(viewState);updateCamera(dt,false,viewState);
    if(!useWebGPU)vehicle.exhaust.update(simulationTime,state.speed,state.boosting,reduced.matches,viewState);
    const pilotFrame=Math.floor(simulationTime*24);if(pilotFrame!==lastPilotFrame){vehicle.pilot.update(pilotFrame/24,!reduced.matches&&state.speed>1);lastPilotFrame=pilotFrame;}
    if(phase!=='paused'&&phase!=='finished')worldTime+=dt;
    world.update(worldTime,reduced.matches,{state,phase,countdown,night:lighting.night,camera,scale:modelScale,dt:phase==='flying'?dt:0});
    lighting.update(state,worldTime,{dt,reducedMotion:reduced.matches,paused:phase==='paused'||phase==='finished'});
    skyWorld.update(camera,worldTime,{night:lighting.night,dt,reducedMotion:reduced.matches});
    speedAtmosphere.update(camera,state,simulationTime,{dt,phase,reducedMotion:reduced.matches});
    shadowElapsed+=dt;
    if(shadowElapsed>=shadowInterval){lighting.sun.shadow.needsUpdate=true;shadowElapsed=0;}
    oil?.update(state,camera,phase,modelScale,reduced.matches);
    scene.updateMatrixWorld(true);camera.updateMatrixWorld();updateHud(performance.now()/1000);
    if(noticeUntil&&performance.now()>noticeUntil){$('.flight-notice').hidden=true;noticeUntil=0;}
    if(gpuGraphics){await gpuGraphics.render({dt,state,phase,comic:comicEnabled,reduced:reduced.matches});app.dataset.boostPalette=gpuGraphics.boost.stats.palette;app.dataset.boostParticles=JSON.stringify({lifetimes:gpuGraphics.boost.stats.particleLifetimes,emitted:gpuGraphics.boost.stats.emittedByLayer});app.dataset.postSamples=String(gpuGraphics.stats.samples);app.dataset.glowSamples=String(gpuGraphics.stats.glowSamples);}else heat.render(()=>{if(comicEnabled)comic.render(scene,camera,`#${scene.background.getHexString()}`);else renderer.render(scene,camera);},{ship:vehicle,camera,time:simulationTime,reduced:reduced.matches,boost:state.boosting,depthTexture:comicEnabled?()=>comic.depthTexture:null});
    app.dataset.frame=String(Number(app.dataset.frame??0)+1);
    }catch(error){console.error(error);renderer.setAnimationLoop(null);clearInput();fail('Se interrumpió la vista 3D.');}finally{rendering=false;}
  }
  renderer.setAnimationLoop(frame);
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();renderer.setAnimationLoop(null);raceAudio.setPhase('paused');clearInput();fail('Se interrumpió la vista 3D.');});
  window.addEventListener('pagehide',()=>{disposed=true;gpuGraphics?.dispose();klippCamera.dispose();heat?.dispose();exhaustControls?.dispose();fxControls?.dispose();oil?.dispose();scaleControl.dispose();soundControl.dispose();raceAudio.dispose();renderer.setAnimationLoop(null);world.dispose();lighting.dispose();skyWorld.dispose();speedAtmosphere.dispose();vehicle.dispose();comic?.dispose();renderer.dispose();},{once:true});
}
