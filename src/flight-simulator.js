import {createFlightBoostPads} from './flight-boost-pads.js';
import {createFlightFovControls} from './flight-camera-fov-controls.js';
import {smoothCameraFov} from './flight-camera-fov.js';
import {createFlightRenderPose} from './flight-render-pose.js';
import {createFlightCameraKlipp} from './flight-camera-klipp.js';
import {pilotChoice,pilotConfig,pilotQuery} from './pilot-catalog.js';
import * as THREE from 'three';
import {circuitMap} from './circuit-maps.js';
import {createCircuitLighting} from './circuit-lighting.js';
import {createCircuitWorld} from './circuit-world.js';
import {createHoverState,advanceHover,recoverHover,crossesCircuitGate} from './circuit-physics.js';
import {createFlightShip} from './flight-ship.js';
import {createFlightScale,scaledHull} from './flight-scale.js';
import {createFlightOil} from './flight-oil.js';
import {createFlightFxControls} from './flight-fx-controls.js';
import './flight-simulator.css';
import {raceAudio} from './race-audio.js';
import {soundControlMarkup,mountSoundControl} from './sound-control.js';
import {shipConfig} from './ship-catalog.js';
import {createCircuitSky,createSpeedAtmosphere,speedCameraProfile} from './flight-atmosphere.js';
import {createFlightPerformance} from './flight-performance.js';
import {BULLDOG_INTRO_DURATION,INTRO_IGNITION,createIntroCamera,introEyes,introInput,introLift} from './bulldog-intro.js';
import {createIntroOverlay} from './bulldog-intro-overlay.js';
import {EYE_CLOSED} from './ship-eyes.js';

export async function createFlightSimulator({entryTransition}={}){
  const base=import.meta.env.BASE_URL,query=new URLSearchParams(location.search),reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const mapConfig=circuitMap(query.get('map')),selectedShip=shipConfig(query.get('vehicle')),choice=pilotChoice(query),selectedPilot=pilotConfig(choice.pilot),pilotParams=pilotQuery(choice);
  document.title=`Biggas Hover Racing · ${mapConfig.name} ${mapConfig.number}`;
  const canonical=new URL(location.href);canonical.searchParams.set('map',mapConfig.id);canonical.searchParams.set('vehicle',selectedShip.id);canonical.searchParams.delete('seed');canonical.searchParams.delete('mode');history.replaceState(null,'',canonical);
  document.body.innerHTML=`<main class="flight-app" data-ready="false" data-phase="loading">
    <canvas class="flight-canvas" tabindex="0" aria-label="Circuito flotante. W y S para velocidad, A y D o flechas laterales para girar, E para derrapar, espacio para frenar, Shift para turbo, F para faros y Escape para pausar. Altura automática."></canvas>
    <section class="flight-status race-panel" aria-label="Estado de conducción" hidden><div><span class="flight-status-label">PILOTO</span><strong class="flight-status-value" id="flight-pilot">${selectedPilot.name.toUpperCase()}</strong></div><div><span class="flight-status-label">NAVE</span><strong class="flight-status-value">${selectedShip.id}</strong></div><div class="flight-driving"><span class="flight-status-label">ESTADO</span><output class="flight-status-value" id="flight-driving-state" aria-live="off">DETENIDO</output></div></section>
    <section class="flight-menu race-panel" aria-label="Menú de vuelo" hidden><div class="flight-menu-tag"><span><b class="flight-player-tag">P1</b> ${selectedPilot.name.toUpperCase()} AL MANDO</span><span id="flight-seed">HOVER</span></div><h1 id="flight-menu-title">${mapConfig.name} <span>${mapConfig.number}.</span></h1><a class="flight-team-link" href="${base}?map=${mapConfig.id}&vehicle=${selectedShip.id}&${pilotParams}"><span>${selectedPilot.name} × ${selectedShip.name}</span><span>Cambiar selección</span></a><button id="flight-resume" class="flight-primary race-primary">Continuar <span aria-hidden="true">→</span></button><button id="flight-restart">Reiniciar <span>↻</span></button><div class="flight-menu-sections"><details class="flight-controls"><summary>Controles <span aria-hidden="true">⌨</span></summary><div class="flight-section-body"><p class="flight-section-label">TECLADO</p><dl class="flight-controls-list"><div><dt>Acelerar / reducir velocidad</dt><dd><kbd>W / S</kbd></dd></div><div><dt>Girar</dt><dd><kbd>A / D · ← / →</kbd></dd></div><div><dt>Turbo</dt><dd><kbd>SHIFT</kbd></dd></div><div><dt>Frenar</dt><dd><kbd>ESPACIO</kbd></dd></div><div><dt>Derrapar</dt><dd><kbd>E</kbd></dd></div><div><dt>Recuperar nave</dt><dd><kbd>R</kbd></dd></div><div><dt>Aceite</dt><dd><kbd>Q</kbd></dd></div><div><dt>Faros</dt><dd><kbd>F</kbd></dd></div><div><dt>Cambiar cámara</dt><dd><kbd>C</kbd></dd></div><div><dt>Silenciar / activar sonido</dt><dd><kbd>M</kbd></dd></div><div><dt>Pausar / continuar</dt><dd><kbd>ESC</kbd></dd></div></dl><p class="flight-touch-help">En pantalla táctil: arrastrá el joystick para girar y mantené pulsados los botones para acelerar, frenar, derrapar o usar el turbo.</p></div></details>
      <details class="flight-options"><summary>Opciones <span aria-hidden="true">⚙</span></summary><div class="flight-section-body">
        ${soundControlMarkup('flight-sound').replace('</button>','<span>Sonido</span></button>')}
        <button id="flight-camera" disabled aria-label="Cambiar cámara">Cámara <span id="flight-camera-state">Cercana</span></button>
        <button id="flight-light" aria-label="Iluminación nocturna" aria-pressed="false">Iluminación <span id="flight-light-state">Día</span></button>
        <button id="flight-comic" aria-pressed="${query.get('comic')!=='0'}" aria-label="Cómic">Estilo cómic <span id="flight-comic-state">${query.get('comic')!=='0'?'Activado':'Desactivado'}</span></button>
        <div class="flight-quality"><label for="flight-quality">Gráficos</label><select id="flight-quality"><option value="auto">Automático</option><option value="high">Mayor calidad</option><option value="performance">Más fluidez</option></select><span id="flight-quality-state">Se adapta a tu equipo</span></div>
        <a class="flight-hangar-link" href="${base}spaceship.html?vehicle=${selectedShip.id}&${pilotParams}">Ir al hangar <span aria-hidden="true">→</span></a>
      </div></details></div><nav class="flight-exit-links" aria-label="Salir del circuito"><a id="flight-map-selection" href="${base}?selection=map&map=${mapConfig.id}&vehicle=${selectedShip.id}&${pilotParams}">Selección de mapa <span aria-hidden="true">→</span></a><a id="flight-main-menu" href="${base}">Volver al menú principal <span aria-hidden="true">⌂</span></a></nav></section>
    <div class="flight-loader" role="status"><span id="flight-load-status">Preparando ${mapConfig.name} ${mapConfig.number}…</span><progress max="1" value="0"></progress></div>
    <div class="flight-notice" role="status" hidden></div>
    <section class="flight-telemetry race-panel race-panel-dark" aria-label="Telemetría"><span class="flight-hud-label">VELOCIDAD</span><div class="flight-speed"><output id="flight-speed">0</output><span>km/h</span></div><span class="flight-drift" hidden>DERRAPE</span><div class="flight-altitude">ALT <output id="flight-altitude">0</output> m</div><div class="flight-energy" role="progressbar" aria-label="Reserva de turbo" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><span></span></div><div class="flight-energy-label"><span>TURBO</span><span id="flight-energy-value">100%</span></div></section>
    <aside class="flight-minimap race-panel race-panel-dark" aria-label="Mapa del circuito"><canvas width="192" height="192" role="img" aria-label="Tu posición en el circuito"></canvas><span id="flight-map-caption">${mapConfig.name.toUpperCase()} / ${mapConfig.number}</span></aside>
    <div class="flight-key-hint">ESC · PAUSA / CONTROLES</div>
    <div class="flight-touch" hidden><div class="flight-stick" role="group" aria-label="Joystick: girar"><span></span></div><div class="flight-touch-buttons"><button data-hold="accelerate" aria-label="Acelerar" aria-pressed="false">ACELERAR</button><button data-hold="brake" aria-label="Frenar" aria-pressed="false">FRENAR</button><button data-hold="drift" aria-label="Derrapar" aria-pressed="false">DERRAPAR</button><button data-hold="boost" aria-label="Turbo" aria-pressed="false">TURBO</button></div></div>
  </main>`;
  entryTransition?.mount();
  const $=s=>document.querySelector(s),app=$('.flight-app'),canvas=$('.flight-canvas'),loader=$('.flight-loader');
  app.dataset.entryMotion=String(entryTransition?.animated??false);
  const gpuModule=await import('./flight-webgpu.js');
  let renderer,gpuGraphics;
  function fail(message){entryTransition?.cancel();raceAudio.setPhase('loading');loader.hidden=false;loader.replaceChildren();const text=document.createElement('p');text.textContent=message;const retry=document.createElement('button');retry.textContent='Reintentar';retry.onclick=()=>location.reload();loader.append(text,retry);}
  try{renderer=await gpuModule.createRenderer(canvas,query.get('renderer')==='webgl2');}catch(error){console.error(error);fail('No se pudo iniciar la vista 3D.');return;}
  app.dataset.backend=renderer.backend.isWebGPUBackend?'WebGPU':'WebGL2';
  const mobile=matchMedia('(max-width:760px), (pointer:coarse)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1.25:1.5));renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  const scene=new THREE.Scene();scene.fog=new THREE.Fog(0xb6c6bd,220,1100);scene.background=new THREE.Color(0xb6c6bd);
  scene.matrixWorldAutoUpdate=false;
  const camera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.15,7000);
  const lighting=createCircuitLighting(scene,{mobile,headlightMounts:selectedShip.headlights,underglow:selectedShip.underglow});
  const skyWorld=createCircuitSky(scene,{mobile,map:mapConfig.id}),speedAtmosphere=createSpeedAtmosphere(scene,{mobile});
  let comicEnabled=query.get('comic')!=='0';
  let shadowElapsed=Infinity,shadowInterval=1/30;
  const performanceControl=createFlightPerformance({width:innerWidth,height:innerHeight,pixelRatio:devicePixelRatio,mobile,onChange:applyQuality});
  function applyQuality(settings){
    renderer.setPixelRatio(settings.pixelRatio);gpuGraphics?.setQuality(settings);
    app.dataset.quality=settings.mode;app.dataset.renderScale=settings.scale.toFixed(2);
    shadowInterval=settings.shadowInterval;
    lighting.sun.shadow.needsUpdate=true;
  }
  applyQuality(performanceControl.settings);lighting.sun.shadow.autoUpdate=false;
  let landscape,world,vehicle,oil,boostPads,fxControls,state,phase='loading',simulationTime=0,worldTime=0,gateIndex=0,cameraMode=0,accumulator=0,noticeUntil=0;
  const keys=new Set(),touch={turn:0,accelerate:false,brake:false,boost:false,drift:false};let stickPointer=null;
  const mapCanvas=$('.flight-minimap canvas'),mapContext=mapCanvas.getContext('2d'),mapBase=document.createElement('canvas');mapBase.width=mapBase.height=192;
  const cameraAnchor=new THREE.Vector3(),followAnchor=new THREE.Vector3(),cameraPoint=new THREE.Vector3(),lookPoint=new THREE.Vector3(),desiredCamera=new THREE.Vector3(),desiredLook=new THREE.Vector3(),forward=new THREE.Vector3();
  const theme=getComputedStyle(app),mapPalette=Object.fromEntries(['ink','paper','blue','yellow','muted','dark'].map(name=>[name,theme.getPropertyValue(`--race-${name}`).trim()]));
  let mapBitmap=null,lastHud=-1,lastPilotFrame=-1,disposed=false,intro=null;
  const hud={speed:$('#flight-speed'),alt:$('#flight-altitude'),energy:$('.flight-energy span'),energyBar:$('.flight-energy'),energyValue:$('#flight-energy-value')};
  function setText(element,text){if(element.textContent!==text)element.textContent=text;}
  const mapHalf=()=>landscape.mapHalf;
  let modelScale=.75;
  const freshState=()=>({...createHoverState(landscape),hull:scaledHull(selectedShip,modelScale),modelScale});
  const scaleControl=createFlightScale(scale=>{
    modelScale=scale;app.dataset.modelScale=scale.toFixed(2);
    if(state){state.hull=scaledHull(selectedShip,scale);state.modelScale=scale;}
    vehicle?.root.scale.setScalar(scale);lighting.sun.shadow.needsUpdate=true;
  },clearInput);
  const fovControls=createFlightFovControls();
  const klippCamera=createFlightCameraKlipp(camera,{enabled:query.get('camera')!=='actual',element:canvas,canOrbit:()=>phase==='flying'||phase==='paused'});
  const renderPose=createFlightRenderPose();
  app.dataset.map=mapConfig.id;app.dataset.pilot=choice.pilot;app.dataset.palette=choice.palette;app.dataset.hat=choice.hat;app.dataset.vehicle=selectedShip.id;
  function clearInput(){keys.clear();touch.turn=0;touch.accelerate=touch.brake=touch.boost=touch.drift=false;stickPointer=null;$('.flight-stick span').style.transform='none';document.querySelectorAll('[data-hold]').forEach(button=>button.setAttribute('aria-pressed','false'));}
  function setPhase(next){
    scaleControl.setVisible(next==='flying'||next==='paused');
    const previousPhase=phase;phase=next;raceAudio.setPhase(next);app.dataset.phase=next;if(next!=='flying'||previousPhase==='paused')clearInput();
    if(previousPhase!==next)performanceControl.reset();
    $('.flight-status').hidden=next!=='flying';$('.flight-menu').hidden=next!=='paused';$('.flight-touch').hidden=next!=='flying';$('#flight-camera').disabled=next==='loading';
    if(next==='flying'){soundControl.close();canvas.focus({preventScroll:true});}
    if(next==='paused'){
      $('#flight-menu-title').textContent='En pausa.';$('.flight-menu').scrollTop=0;$('#flight-resume').focus({preventScroll:true});
      lastHud=-1;updateHud(performance.now()/1000);
    }
  }
  function notice(text){setText($('.flight-notice'),text);$('.flight-notice').hidden=false;noticeUntil=performance.now()+2300;}
  function resetFlight(){boostPads?.reset();gpuGraphics?.reset();state=freshState();simulationTime=0;gateIndex=0;accumulator=0;world.reset();oil?.reset(state,true);syncShip();updateCamera(1,true);lastHud=-1;}
  function start(){raceAudio.unlock();resetFlight();$('.flight-notice').hidden=true;setPhase('flying');updateCamera(1,true);}
  // Bulldog 039 only: a skippable cinematic on the real track before free driving.
  function prepareIntro(){
    if(selectedShip.id!=='039'||reduced.matches||query.get('intro')==='0')return;
    intro={time:0,eyes:false,ignited:false,finishing:false,headlights:lighting.headlightsEnabled,camera:createIntroCamera(camera,{landscape,surfaceHeight:world.surfaceHeight,clipCamera:world.clipCamera}),overlay:createIntroOverlay(app,{onSkip:()=>finishIntro()})};
    // Parked on the grid, asleep, until the engine catches.
    vehicle.root.position.y+=introLift(0)*modelScale;vehicle.eyes?.hold(EYE_CLOSED);intro.overlay.setShot(intro.camera.update(0,state,modelScale));
  }
  function playIntro(){raceAudio.unlock();setPhase('intro');app.dataset.introShot='ignition';}
  function updateIntro(dt,viewState){
    if(!intro.finishing)intro.time+=dt;
    // The eyes are the headlamps: blink them awake, as if the bulldog opened them.
    const eyes=introEyes(intro.time);if(eyes!==intro.eyes){intro.eyes=eyes;lighting.setHeadlights(eyes);vehicle.setHeadlights(eyes);vehicle.eyes?.hold(eyes?1:EYE_CLOSED);}
    if(!intro.ignited&&intro.time>=INTRO_IGNITION){intro.ignited=true;raceAudio.cue('ignition');}
    vehicle.root.position.y+=introLift(intro.time)*modelScale;
    const shot=intro.camera.update(intro.time,viewState,modelScale);intro.overlay.setShot(shot);app.dataset.introShot=shot.id;
    if(intro.time>=BULLDOG_INTRO_DURATION)finishIntro();
  }
  async function finishIntro(){
    if(!intro||intro.finishing)return;intro.finishing=true;
    await intro.overlay.cover();
    lighting.setHeadlights(intro.headlights);vehicle.setHeadlights(intro.headlights);vehicle.eyes?.hold(null);
    const overlay=intro.overlay;intro=null;delete app.dataset.introShot;start();
    await overlay.reveal();
  }
  function prepareOilTest(botDrops=false){
    if(phase!=='flying')return;
    resetFlight();
    const startDistance=landscape.roadAt(landscape.spawn.x,landscape.spawn.z).distance;
    const road=landscape.atDistance(startDistance+30),speed=oil.sim.config.botSpeed+(botDrops?8:0);
    Object.assign(state,{x:road.x,y:(world.surfaceHeight(road.x,road.z)??road.y)+.65,z:road.z,yaw:Math.atan2(road.nx,road.nz),pitch:Math.atan(road.grade),speed,throttle:speed,vx:road.nx*speed,vz:road.nz*speed});
    gateIndex=1;clearInput();oil.prepare(state,botDrops);syncShip();updateCamera(1,true);canvas.focus({preventScroll:true});notice(botDrops?'El bot vierte aceite · atravesá la estela':'Prueba lista · Q para dejar aceite al bot');
  }
  function pause(){if(phase==='flying')setPhase('paused');else if(phase==='paused'){raceAudio.unlock();setPhase('flying');}}
  function recover(manual=false){
    world.fx.reset();gpuGraphics?.reset();
    oil?.cancelPour();raceAudio.cue('recover');const checkpoint=recoverHover(landscape,gateIndex,world.surfaceHeight);
    Object.assign(state,createHoverState(landscape),checkpoint,{speed:0,pitch:0,roll:0,throttle:0,boosting:false,cooldown:1.2});
    notice(manual?'Nave recuperada':'Fuera de pista · nave recuperada');
    syncShip();updateCamera(1,true);
  }
  function input(){return {reducedMotion:reduced.matches,turn:THREE.MathUtils.clamp(Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'))+touch.turn,-1,1),throttle:Number(keys.has('KeyW')||touch.accelerate)-Number(keys.has('KeyS')),boost:keys.has('ShiftLeft')||keys.has('ShiftRight')||touch.boost,brake:keys.has('Space')||touch.brake,drift:keys.has('KeyE')||touch.drift};}
  function step(dt){
    if(phase!=='flying'&&phase!=='intro')return;
    renderPose.capture(state);
    simulationTime+=dt;
    const impactSerial=state.impactSerial;
    oil?.beforeStep(state,dt);
    const previous=advanceHover(state,phase==='intro'?introInput(intro.time,state,landscape):input(),dt,landscape,world.surfaceHeight);
    world.step(state,dt,previous);if(state.impactSerial!==impactSerial)raceAudio.cue('impact',state.impact);if(state.recoverNeeded){recover(false);return;}
    oil?.step(dt,state,previous);
    boostPads?.step(dt,state,previous);
    // Track safe recovery checkpoints silently; free driving has no race progression UI.
    const gate=landscape.gates[gateIndex];
    if(crossesCircuitGate(previous,state,gate)){
      gateIndex++;
      if(gateIndex===landscape.gates.length)gateIndex=1;
    }
  }
  function syncShip(viewState=state){const state=viewState;if(!vehicle)return;vehicle.root.position.set(state.x,state.y,state.z);vehicle.root.rotation.set(-state.pitch,state.yaw,reduced.matches?0:state.roll,'YXZ');}
  function updateCamera(dt,snap=false,viewState=state){
    const state=viewState;
    if(snap)renderPose.reset(state);
    forward.set(Math.sin(state.yaw),0,Math.cos(state.yaw));
    const profile=speedCameraProfile(state,{reducedMotion:reduced.matches,cameraMode,lens:fovControls.settings}),distance=profile.distance,up=profile.height;
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
    const fov=profile.fov;if(Math.abs(camera.fov-fov)>.01){camera.fov=smoothCameraFov(camera.fov,fov,dt,snap||reduced.matches,profile.lens);camera.updateProjectionMatrix();}
  }
  function buildMap(){
    const ctx=mapBase.getContext('2d');
    ctx.fillStyle=mapPalette.dark;ctx.fillRect(0,0,192,192);ctx.strokeStyle=mapPalette.paper;ctx.lineWidth=7;ctx.setLineDash([]);ctx.beginPath();
      landscape.samples.forEach((sample,i)=>{const x=(sample.position[0]/mapHalf()+1)*96,y=(sample.position[2]/mapHalf()+1)*96;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.closePath();ctx.stroke();ctx.lineWidth=1;ctx.strokeStyle=mapPalette.dark;ctx.stroke();mapBitmap=mapBase;
  }

  function drawMap(){
    if(!mapBitmap)return;mapContext.drawImage(mapBitmap,0,0);
    mapContext.save();mapContext.translate((state.x/mapHalf()+1)*96,(state.z/mapHalf()+1)*96);mapContext.rotate(Math.PI-state.yaw);mapContext.fillStyle=mapPalette.yellow;mapContext.strokeStyle=mapPalette.ink;mapContext.lineWidth=1.5;mapContext.beginPath();mapContext.moveTo(0,-7);mapContext.lineTo(4,4);mapContext.lineTo(0,2);mapContext.lineTo(-4,4);mapContext.closePath();mapContext.fill();mapContext.stroke();mapContext.restore();oil?.drawMap(mapContext,mapHalf());
  }
  function updateHud(now){
    if(now-lastHud<.1)return;lastHud=now;
    const drivingState=state.braking&&state.speed>.1?'FRENANDO':state.drifting?'DERRAPANDO':state.boosting?'TURBO':state.speed>.1?'EN MARCHA':'DETENIDO';
    setText($('#flight-driving-state'),drivingState);
    setText(hud.speed,String(Math.round(state.speed*3.6)));setText(hud.alt,Math.max(0,state.y-(world.surfaceHeight(state.x,state.z)??landscape.height(state.x,state.z))).toFixed(1));
    const energy=Math.round(state.energy*100);hud.energy.style.transform=`scaleX(${state.energy})`;hud.energyBar.setAttribute('aria-valuenow',String(energy));setText(hud.energyValue,`${energy}%`);
    $('.flight-drift').hidden=!state.drifting||phase!=='flying';app.dataset.drifting=String(state.drifting);app.dataset.lighting=lighting.night?'night':'day';app.dataset.headlights=String(lighting.headlightsEnabled);app.dataset.textureFamilies=String(world.textures.count);
    app.dataset.fov=camera.fov.toFixed(2);app.dataset.speedEffect=speedAtmosphere.intensity.toFixed(3);app.dataset.cloudCount=String(skyWorld.cloudCount);
    app.dataset.fps=String(performanceControl.fps);
    app.dataset.fxAir=String(world.fx.stats.air);app.dataset.fxMarks=String(world.fx.stats.marks);app.dataset.fxTime=world.fx.stats.time.toFixed(3);app.dataset.fxStyle=world.fx.style;
    setText($('#flight-quality-state'),performanceControl.fps?`${performanceControl.fps} FPS`:'Se adapta a tu equipo');
    app.dataset.offTrack=String((state.offTrackTime??0)>0);app.dataset.yaw=state.yaw.toFixed(3);app.dataset.pitch=state.pitch.toFixed(3);app.dataset.speed=state.speed.toFixed(2);app.dataset.x=state.x.toFixed(2);app.dataset.y=state.y.toFixed(2);app.dataset.z=state.z.toFixed(2);app.dataset.gate=String(gateIndex);app.dataset.energy=state.energy.toFixed(3);app.dataset.time=simulationTime.toFixed(2);app.dataset.camera=String(cameraMode);app.dataset.comic=String(comicEnabled);app.dataset.hover=(state.y-(world.surfaceHeight(state.x,state.z)??landscape.height(state.x,state.z))).toFixed(3);app.dataset.wallHit=String(state.wallHit);app.dataset.slip=state.slip.toFixed(3);app.dataset.impact=state.impact.toFixed(2);app.dataset.effectsTime=worldTime.toFixed(2);app.dataset.detailCount=String(world.detailCount);
    drawMap();
  }
  async function loadWorld(){
    const next=await createCircuitWorld({map:mapConfig.id,mobile,underglow:selectedShip.underglow,fxMaterialFactory:gpuModule?.createSmokeMaterial,anisotropy:Math.min(4,renderer.getMaxAnisotropy()),onProgress:value=>{$('.flight-loader progress').value=value;entryTransition?.progress(value);}});
    world=next;landscape=next.landscape;scene.add(world.root);lighting.setTrack(landscape);world.textures.applyRoot(lighting.root);
    fxControls=createFlightFxControls(world.fx,message=>{notice(message);if(phase==='flying')canvas.focus({preventScroll:true});});
    setText($('#flight-seed'),`${Math.round(landscape.length)} M · HOVER`);buildMap();resetFlight();updateCamera(1,true);
  }
  document.querySelectorAll('.flight-team-link, #flight-map-selection').forEach(link=>link.addEventListener('click',()=>{const url=new URL(link.href);url.searchParams.set('comic',comicEnabled?'1':'0');if(query.get('renderer')==='webgl2')url.searchParams.set('renderer','webgl2');link.href=url.href;}));
  const soundControl=mountSoundControl($('.sound-control'),{onOpen:clearInput});
  const toggleSound=()=>soundControl.toggleSound();
  $('.flight-options').addEventListener('toggle',()=>{if(!$('.flight-options').open)soundControl.close();});
  $('#flight-quality').value=performanceControl.mode;
  $('#flight-quality').addEventListener('change',event=>performanceControl.setMode(event.target.value));
  $('#flight-resume').onclick=pause;$('#flight-restart').onclick=start;
  function changeCamera(){cameraMode=(cameraMode+1)%3;setText($('#flight-camera-state'),['Cercana','Lejana','A bordo'][cameraMode]);notice(['Cámara cercana','Cámara lejana','Cámara a bordo'][cameraMode]);if(reduced.matches)updateCamera(1,true);}
  $('#flight-camera').onclick=changeCamera;
  function toggleHeadlights(){lighting.setHeadlights(!lighting.headlightsEnabled);vehicle?.setHeadlights(lighting.headlightsEnabled);notice(lighting.headlightsEnabled?'Faros encendidos':'Faros apagados');}
  $('#flight-light').onclick=event=>{lighting.setNight(!lighting.night);event.currentTarget.setAttribute('aria-pressed',String(lighting.night));setText($('#flight-light-state'),lighting.night?'Noche':'Día');};
  $('#flight-comic').onclick=event=>{comicEnabled=!comicEnabled;event.currentTarget.setAttribute('aria-pressed',String(comicEnabled));setText($('#flight-comic-state'),comicEnabled?'Activado':'Desactivado');};
  document.addEventListener('keydown',event=>{
    if(phase==='intro'){if(['Enter','Escape','Space'].includes(event.code)&&!event.repeat){event.preventDefault();finishIntro();}return;}
    if(event.code==='Escape'&&!event.repeat){event.preventDefault();pause();return;}
    if(/INPUT|SELECT|TEXTAREA/.test(event.target.tagName))return;
    if(event.target.closest?.('summary'))return;
    if(event.code==='Space'&&event.target.closest('button,a'))return;
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(event.code))event.preventDefault();
    if(event.code==='KeyM'&&!event.repeat){event.preventDefault();toggleSound();}
    if(event.code==='KeyF'&&!event.repeat){event.preventDefault();toggleHeadlights();}
    if(event.code==='KeyC'&&!event.repeat&&phase!=='loading')changeCamera();
    if(event.code==='KeyQ'&&!event.repeat&&phase==='flying'){event.preventDefault();oil?.use();}
    if(event.code==='KeyR'&&!event.repeat&&phase==='flying')recover(true);
    if(phase==='flying'){raceAudio.unlock();keys.add(event.code);}
  });
  canvas.addEventListener('pointerdown',()=>raceAudio.unlock());
  document.addEventListener('keyup',event=>keys.delete(event.code));
  window.addEventListener('blur',()=>{raceAudio.setPhase('paused');clearInput();if(phase==='flying')pause();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){raceAudio.setPhase('paused');clearInput();if(phase==='flying')pause();}});
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
    const results=await Promise.allSettled([createFlightShip(selectedShip.id,{...choice,exhaust:false}),loadWorld()]);const failure=results.find(result=>result.status==='rejected');if(failure)throw failure.reason;vehicle=results[0].value;vehicle.root.scale.setScalar(modelScale);vehicle.setHeadlights(lighting.headlightsEnabled);scene.add(vehicle.root);syncShip();updateCamera(1,true);
    oil=await createFlightOil({scene,landscape,surfaceHeight:world.surfaceHeight,app,clearInput,onPrepare:prepareOilTest,onNotice:notice,materialFactory:gpuModule?.oilMaterialFactory});oil.reset(state,true);
    if(mapConfig.id==='mario-raceway')boostPads=await createFlightBoostPads({scene,landscape,surfaceHeight:world.surfaceHeight,onActivate:()=>notice('¡Placa turbo!')});
    {gpuGraphics=await gpuModule.createFlightWebGPU(renderer,scene,camera,vehicle,oil,boostPads);gpuGraphics.setQuality(performanceControl.settings);}
    prepareIntro();setPhase('loading');loader.hidden=!!entryTransition;setText($('#flight-load-status'),'Preparando gráficos…');
    lighting.update(state,worldTime,{reducedMotion:reduced.matches});skyWorld.update(camera,0,{reducedMotion:reduced.matches});scene.updateMatrixWorld(true);camera.updateMatrixWorld();
    await renderer.compileAsync(scene,camera);
    loader.hidden=true;
    if(entryTransition){
      // Draw the track before revealing it; driving starts once the cover is gone.
      setPhase('loading');if(intro)intro.camera.update(0,state,modelScale);else updateCamera(1,true);skyWorld.update(camera,0,{reducedMotion:reduced.matches});scene.updateMatrixWorld(true);camera.updateMatrixWorld();
      await gpuGraphics.render({state,phase,comic:comicEnabled,reduced:reduced.matches});
      await entryTransition.reveal();
    }
    app.dataset.ready='true';if(intro)playIntro();else{start();if(document.hidden)pause();}
  }catch(error){console.error(error);fail('No se pudo cargar el simulador.');return;}
  const clock=new THREE.Clock();
  let rendering=false;
  async function frame(){
    if(disposed||rendering)return;rendering=true;try{const rawDelta=clock.getDelta(),dt=Math.min(rawDelta,.1);if(document.hidden||phase==='loading')return;
    if(phase==='flying')performanceControl.sample(rawDelta*1000);
    accumulator+=dt;while(accumulator>=1/60){step(1/60);accumulator-=1/60;}
    raceAudio.update(state);
    const viewState=phase==='flying'||phase==='intro'?renderPose.sample(state,accumulator*60):state;
    syncShip(viewState);if(phase==='intro')updateIntro(dt,viewState);else updateCamera(dt,false,viewState);
    const pilotFrame=Math.floor(simulationTime*24);if(pilotFrame!==lastPilotFrame){vehicle.update(pilotFrame/24,state.speed,state.boosting,reduced.matches,viewState);lastPilotFrame=pilotFrame;}
    if(phase!=='paused')worldTime+=dt;
    const driving=phase==='flying'||phase==='intro';
    world.update(worldTime,reduced.matches,{state,phase,night:lighting.night,camera,scale:modelScale,dt:driving?dt:0});
    lighting.update(state,worldTime,{dt,reducedMotion:reduced.matches,paused:phase==='paused'});
    skyWorld.update(camera,worldTime,{night:lighting.night,dt,reducedMotion:reduced.matches});
    speedAtmosphere.update(camera,state,simulationTime,{dt,phase,reducedMotion:reduced.matches});
    shadowElapsed+=dt;
    if(shadowElapsed>=shadowInterval){lighting.sun.shadow.needsUpdate=true;shadowElapsed=0;}
    oil?.update(state,camera,phase,modelScale,reduced.matches);
    boostPads?.update(driving?dt:0,reduced.matches);
    if(boostPads)app.dataset.boostPads=JSON.stringify(boostPads.sim.entries.map(p=>({remaining:p.remaining,activations:p.activations,x:p.x,y:p.y,z:p.z})));
    app.dataset.padBoost=String(state.padBoostRemaining??0);
    scene.updateMatrixWorld(true);camera.updateMatrixWorld();updateHud(performance.now()/1000);
    if(noticeUntil&&performance.now()>noticeUntil){$('.flight-notice').hidden=true;noticeUntil=0;}
    if(gpuGraphics){await gpuGraphics.render({dt,state,phase,comic:comicEnabled,reduced:reduced.matches});app.dataset.boostPalette=gpuGraphics.boost.stats.palette;app.dataset.boostParticles=JSON.stringify({lifetimes:gpuGraphics.boost.stats.particleLifetimes,emitted:gpuGraphics.boost.stats.emittedByLayer});app.dataset.postSamples=String(gpuGraphics.stats.samples);app.dataset.glowSamples=String(gpuGraphics.stats.glowSamples);}
    app.dataset.frame=String(Number(app.dataset.frame??0)+1);
    }catch(error){console.error(error);renderer.setAnimationLoop(null);clearInput();fail('Se interrumpió la vista 3D.');}finally{rendering=false;}
  }
  let renderTask=Promise.resolve();
  renderer.setAnimationLoop(()=>{if(!rendering&&!disposed)renderTask=frame();});
  for(const event of ['webglcontextlost','graphicslost'])canvas.addEventListener(event,event=>{event.preventDefault();renderer.setAnimationLoop(null);raceAudio.setPhase('paused');clearInput();fail('Se interrumpió la vista 3D.');});
  window.addEventListener('pagehide',()=>{disposed=true;renderer.setAnimationLoop(null);renderTask.finally(()=>{boostPads?.dispose();gpuGraphics?.dispose();klippCamera.dispose();fxControls?.dispose();oil?.dispose();scaleControl.dispose();fovControls.dispose();soundControl.dispose();raceAudio.dispose();renderer.setAnimationLoop(null);world.dispose();lighting.dispose();skyWorld.dispose();speedAtmosphere.dispose();vehicle.dispose();renderer.dispose();});},{once:true});
}
