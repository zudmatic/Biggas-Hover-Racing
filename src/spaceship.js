import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {flightPose, FLIGHT_DURATION} from './spaceship-parts.js';
import {createSelectablePilot} from './selectable-pilot.js';
import {pilotChoice,pilotConfig,pilotQuery} from './pilot-catalog.js';
import {createCharacterComic} from './character-comic.js';
import './spaceship.css';
import {SHIPS,shipConfig,shipUrl,shipCanopy} from './ship-catalog.js';

export async function createSpaceship() {
  const config=shipConfig(new URLSearchParams(location.search).get('vehicle')),parts=config.parts,choice=pilotChoice(),pilotParams=pilotQuery(choice);
  document.title=`${config.id} · ${config.title}`;
  const base=import.meta.env.BASE_URL;
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  document.body.innerHTML=`<main class="ship-app"><div class="ship-paper-surface" aria-hidden="true"></div>
    <header class="ship-header"><a class="ship-brand" href="${base}" aria-label="Biggas Hover Racing, inicio"><span class="ship-mark" aria-hidden="true">✳</span><strong>BIGGAS<small>HOVER RACING</small></strong><span class="ship-header-tag">Hangar</span></a><nav aria-label="Navegación del hangar"><a class="ship-back" href="${base}?vehicle=${config.id}&${pilotParams}"><span aria-hidden="true">←</span> Volver al inicio</a></nav></header>
    <section class="ship-intro"><div class="ship-heading"><span class="ship-eyebrow">HANGAR / EXPLORÁ TU NAVE</span><h1>${config.title}<span class="ship-title-number">${config.id}</span></h1></div><div class="ship-intro-actions"><nav class="ship-picker" aria-label="Naves del hangar">${Object.values(SHIPS).map(item=>`<a href="${base}spaceship.html?vehicle=${item.id}&${pilotParams}" ${item.id===config.id?'aria-current="page"':''}>${item.name}</a>`).join('')}</nav><a class="ship-simulator" href="${base}simulator.html?vehicle=${config.id}&${pilotParams}">Simulador de vuelo <span aria-hidden="true">▶</span></a></div></section>
    <div class="ship-workspace">
      <section class="ship-viewport" aria-label="Hangar 3D de ${config.title}" data-vehicle="${config.id}" data-hat="${choice.hat}" data-ready="false">
        <canvas class="ship-canvas" tabindex="0" aria-label="Nave 3D. Arrastrá para girar, rueda para acercar y clic para identificar una pieza."></canvas>
        <div class="ship-stage-top"><span>HANGAR / ${config.id}</span><span class="ship-status"><i class="ship-dot"></i><span id="ship-phase" role="status">EN HANGAR</span></span></div>
        <div class="ship-labels">${parts.map(p=>`<button class="ship-hotspot" disabled data-hotspot="${p.id}" aria-label="Identificar ${p.name}" aria-pressed="false" title="${p.name}">${p.tag}</button>`).join('')}</div>
        <div class="ship-stage-specs"><p title="Ancho × alto × largo en unidades de autoría">…</p></div>
        <div class="ship-viewbar"><div class="ship-views" role="group" aria-label="Vistas de la nave">${[['perspective','3/4'],['front','Frente'],['side','Perfil'],['back','Atrás'],['top','Arriba']].map(([v,label])=>`<button data-ship-view="${v}" aria-pressed="${v==='perspective'}" disabled>${label}</button>`).join('')}</div><div class="ship-tools"><button id="ship-rotate" aria-label="Giro automático" aria-pressed="false" title="Giro automático" disabled>⟳</button><button id="ship-reset" aria-label="Restablecer vista y nave" title="Restablecer vista y nave" disabled>⌖</button></div></div>
        <div class="ship-loader" role="status"><span>Preparando el hangar…<br><small>Cargando ${config.name}</small></span></div>
      </section>
      <aside class="ship-panel" aria-label="Componentes de la nave"><div class="ship-panel-top"><h2>Componentes</h2><span>08</span></div>
      <div class="ship-part-list">${parts.map(p=>`<button class="ship-part" data-part="${p.id}" aria-pressed="false" disabled><span class="ship-part-number">${p.tag}</span><span><span class="ship-part-name">${p.name}</span></span></button>`).join('')}</div>
      <p class="sr-only" id="ship-description" aria-live="polite"></p>
      <div class="ship-toggles"><label class="ship-switch">${config.windshield?'Abrir parabrisas':'Abrir cabina'}<input id="ship-canopy" type="checkbox" disabled></label><label class="ship-switch">${config.windshield?'Ocultar parabrisas':'Ocultar cabina'}<input id="ship-hide-canopy" type="checkbox" disabled></label><label class="ship-switch">${pilotConfig(choice.pilot).name} al mando<input id="ship-pilot" type="checkbox" disabled></label><label class="ship-switch">Desarmar<input id="ship-explode" type="checkbox" disabled></label><label class="ship-switch">Etiquetas<input id="ship-label-toggle" type="checkbox" checked disabled></label><button id="ship-comic" class="ship-comic" aria-pressed="true" disabled><span aria-hidden="true">◐</span> Cómic</button></div>
      </aside>
    </div>
    <section class="ship-transport" aria-label="Animación de la nave"><button class="ship-play" id="ship-play" aria-label="Iniciar vuelo" disabled>▶</button><div><p class="ship-track-title">Vuelo</p><div class="ship-track-status" id="ship-play-status" role="status">18 SEGUNDOS</div></div><div class="ship-track"><input class="ship-timeline" id="ship-time" aria-label="Tiempo de la animación" type="range" min="0" max="18" step="0.01" value="0" disabled><div class="ship-track-labels"><span>Encendido</span><span>Despegue</span><span>Vuelo</span><span>Aterrizaje</span></div></div><div class="ship-playback"><span id="ship-time-label">00:00 / 00:18</span><select id="ship-speed" aria-label="Velocidad de animación" disabled><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option></select><button id="ship-loop" aria-label="Repetir vuelo" aria-pressed="false" title="Repetir vuelo" disabled>↻</button></div></section>
    <footer class="ship-footer"><span><span class="ship-desktop-hint">ARRASTRÁ PARA GIRAR · SCROLL PARA ACERCAR</span><span class="ship-mobile-hint">GIRÁ CON UN DEDO · ZOOM CON DOS</span><span class="ship-key-hint"> &nbsp; / &nbsp; ESPACIO: PLAY / PAUSA</span></span><a href="${shipUrl(config.id,base)}" download="${config.file}">DESCARGAR GLB</a></footer>
  </main>`;
  const $=s=>document.querySelector(s);
  $('.ship-workspace').insertBefore($('.ship-transport'),$('.ship-panel'));
  let keyboardInput=false;
  document.addEventListener('pointerdown',()=>{keyboardInput=false;},true);
  document.addEventListener('keydown',()=>{keyboardInput=true;},true);
  const viewport=$('.ship-viewport'), canvas=$('.ship-canvas'), loader=$('.ship-loader');
  let renderer;
  const fail=message=>{loader.hidden=false;loader.replaceChildren();const p=document.createElement('p');p.textContent=message;const button=document.createElement('button');button.textContent='Reintentar';button.onclick=()=>location.reload();loader.append(p,button);};
  try {renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});}
  catch {fail('No pudimos iniciar el visor 3D. Probá con un navegador con WebGL habilitado.');return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(36,1,.1,100);
  const controls=new OrbitControls(camera,canvas);
  controls.enableDamping=!reducedMotion.matches;controls.dampingFactor=.08;controls.minDistance=4;controls.maxDistance=18;
  controls.maxPolarAngle=Math.PI*.48;controls.enablePan=false;controls.autoRotateSpeed=.55;
  const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();
  const environment=pmrem.fromScene(room,.04);scene.environment=environment.texture;scene.environmentIntensity=.5;room.dispose();pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xfaf8eb,0x798a75,1.25));
  const key=new THREE.DirectionalLight(0xfff9eb,2.5);key.position.set(-3,8,5);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-6;key.shadow.camera.right=6;key.shadow.camera.top=7;key.shadow.camera.bottom=-5;key.shadow.normalBias=.025;key.shadow.bias=-.00015;key.shadow.radius=3;scene.add(key);
  const fill=new THREE.DirectionalLight(0xd4e5ff,1.1);fill.position.set(5,4,-5);scene.add(fill);
  const platform=new THREE.Mesh(new THREE.CylinderGeometry(3.6,3.65,.16,96),new THREE.MeshStandardMaterial({color:0xf3f3f3,roughness:1}));platform.position.y=-.12;platform.receiveShadow=true;scene.add(platform);
  const ring=new THREE.Mesh(new THREE.RingGeometry(3.22,3.235,128),new THREE.MeshBasicMaterial({color:0x008dca,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=-.035;scene.add(ring);
  const ringOuter=ring.clone();ringOuter.scale.setScalar(1.09);scene.add(ringOuter);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({color:0x111111,opacity:.11}));floor.rotation.x=-Math.PI/2;floor.position.y=-.205;floor.receiveShadow=true;scene.add(floor);
  const grid=new THREE.GridHelper(6,12,0xcccccc,0xcccccc);grid.position.y=-.033;grid.material.transparent=true;grid.material.opacity=.32;scene.add(grid);
  const tickMaterial=new THREE.LineBasicMaterial({color:0x111111,transparent:true,opacity:.65});
  for(let i=0;i<60;i++){const a=i/60*Math.PI*2,r=i%5===0?3.3:3.36;const g=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(Math.sin(a)*r,-.028,Math.cos(a)*r),new THREE.Vector3(Math.sin(a)*3.43,-.028,Math.cos(a)*3.43)]);scene.add(new THREE.Line(g,tickMaterial));}
  // A soft, procedural contact shadow grounds the ship without extra assets.
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=128;shadowCanvas.height=128;
  const ctx=shadowCanvas.getContext('2d'),gradient=ctx.createRadialGradient(64,64,5,64,64,62);gradient.addColorStop(0,'rgba(38,50,32,.30)');gradient.addColorStop(1,'rgba(38,50,32,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
  const contact=new THREE.Mesh(new THREE.PlaneGeometry(4.8,6),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));contact.rotation.x=-Math.PI/2;contact.position.y=-.024;scene.add(contact);
  const ship=new THREE.Group();scene.add(ship);
  const systems=Object.fromEntries(parts.map(p=>{const group=new THREE.Group();group.name=p.id;ship.add(group);return [p.id,group];}));
  let model,canopy;const meshes=[],exhausts=[];
  try {model=(await new GLTFLoader().loadAsync(shipUrl(config.id,base))).scene;}
  catch {fail('No se pudo cargar la nave. Comprobá la conexión e intentá de nuevo.');renderer.dispose();return;}
  model.updateMatrixWorld(true);
  const dimensions=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());$('.ship-stage-specs p').textContent=`${[dimensions.x,dimensions.y,dimensions.z].map(value=>value.toFixed(2).replace('.',',')).join(' × ')} u.`;
  canopy=shipCanopy(model,config);
  const canopyMeshes=new Set();canopy?.traverse(o=>{if(o.isMesh)canopyMeshes.add(o);});
  model.traverse(o=>{if(o.isMesh)meshes.push(o);});
  for(const mesh of meshes){
    mesh.userData.system=config.classify(mesh.name,canopyMeshes.has(mesh));
    mesh.material=mesh.material.clone();mesh.userData.originalEmission=mesh.material.emissive.clone();mesh.userData.originalIntensity=mesh.material.emissiveIntensity;
    mesh.castShadow=true;mesh.receiveShadow=true;
    if(!canopyMeshes.has(mesh))systems[mesh.userData.system].attach(mesh);
    mesh.userData.side=new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3()).x<0?-1:1;
  }
  if(canopy)systems.cockpit.attach(canopy);
  for(const mesh of meshes)mesh.userData.rest=mesh.position.clone();
  const canopyRest=canopy?.position.clone();
  let pilot;try{pilot=await createSelectablePilot({...choice,offset:config.pilotOffset});}catch{fail('No se pudo cargar el piloto. Intentá de nuevo.');renderer.dispose();return;}systems.cockpit.add(pilot.root);
  const pilotMeshes=[];pilot.root.traverse(mesh=>{if(mesh.isMesh)pilotMeshes.push(mesh);});
  const comic=createCharacterComic(renderer);let comicEnabled=true;
  // Plumes point backwards (-Z). Their scale and emission follow the flight timeline.
  for(const [x,y,z,radius] of config.exhausts){
    const plume=new THREE.Mesh(new THREE.ConeGeometry(radius,1.2,8,1,true),new THREE.MeshBasicMaterial({color:0xff9944,transparent:true,opacity:.3,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}));
    plume.rotation.x=-Math.PI/2;plume.position.set(x,y,z-.6);plume.userData.outlet=z;systems.engines.add(plume);exhausts.push(plume);
    const core=new THREE.Mesh(new THREE.ConeGeometry(.12,.8,8,1,true),new THREE.MeshBasicMaterial({color:0xd9f6ff,transparent:true,opacity:.7,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}));core.rotation.x=-Math.PI/2;core.position.set(x,y,z-.4);core.userData.outlet=z;systems.engines.add(core);exhausts.push(core);
  }
  let selected=null,elapsed=0,playing=false,loop=false,speed=1,explode=0,open=0;
  let viewTween=null;const initialTarget=new THREE.Vector3(0,1.35,0);
  const viewPositions={perspective:[6.4,4.7,7.6],front:[0,3,10],side:[10,3,0],back:[4,3.2,-9],top:[.01,11,.01]};
  let cameraLift=0;
  const responsiveDistance=()=>viewport.clientWidth/viewport.clientHeight<1?1.2:1;
  function goToView(position,viewName=null){
    const destination=new THREE.Vector3(...position).sub(initialTarget).multiplyScalar(responsiveDistance()).add(initialTarget);
    if(reducedMotion.matches||keyboardInput){camera.position.copy(destination);controls.target.copy(initialTarget);camera.position.y+=cameraLift;controls.target.y+=cameraLift;controls.update();}
    else viewTween={from:camera.position.clone().sub(new THREE.Vector3(0,cameraLift,0)),to:destination,target:controls.target.clone().sub(new THREE.Vector3(0,cameraLift,0)),elapsed:0};
    document.querySelectorAll('[data-ship-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.shipView===viewName)));
    controls.autoRotate=false;$('#ship-rotate').setAttribute('aria-pressed','false');
  }
  function selectPart(id,{focus=true}={}){
    selected=id;const part=parts.find(p=>p.id===id);
    viewport.dataset.selected=id??'';
    document.querySelectorAll('[data-part],[data-hotspot]').forEach(button=>button.setAttribute('aria-pressed',String((button.dataset.part??button.dataset.hotspot)===id)));
    $('#ship-description').textContent=part?.name??'';
    for(const mesh of meshes){const active=mesh.userData.system===id;mesh.material.emissive.copy(active?new THREE.Color(0xd6632e):mesh.userData.originalEmission);mesh.material.emissiveIntensity=active?.2:mesh.userData.originalIntensity;}
    if(part&&focus)goToView(part.view);
    if(id==='cockpit'){$('#ship-canopy').checked=true;stopFlight();}
  }
  function updateTransport(){
    $('#ship-play').textContent=playing?'Ⅱ':'▶';$('#ship-play').setAttribute('aria-label',playing?'Pausar vuelo':elapsed>=FLIGHT_DURATION?'Repetir secuencia de vuelo':'Iniciar vuelo');
    $('#ship-play-status').textContent=playing?'EN CURSO':elapsed>0&&elapsed<FLIGHT_DURATION?'EN PAUSA':'18 SEGUNDOS';
    viewport.dataset.playing=String(playing);
  }
  function stopFlight(){playing=false;elapsed=0;updateTransport();}
  function togglePlay(){
    playing=!playing;
    if(playing){if(elapsed>=FLIGHT_DURATION)elapsed=0;$('#ship-canopy').checked=$('#ship-pilot').checked;$('#ship-explode').checked=false;}
    updateTransport();
  }
  function reset(){stopFlight();selectPart(null,{focus:false});$('#ship-hide-canopy').checked=false;$('#ship-pilot').checked=false;pilot.root.visible=false;comicEnabled=true;$('#ship-comic').setAttribute('aria-pressed','true');$('.ship-simulator').href=`${base}simulator.html?vehicle=${config.id}&${pilotParams}`;syncCanopyControls();$('#ship-canopy').checked=false;$('#ship-explode').checked=false;$('#ship-label-toggle').checked=true;goToView(viewPositions.perspective,'perspective');}
  document.querySelectorAll('[data-part],[data-hotspot]').forEach(button=>button.addEventListener('click',()=>selectPart(button.dataset.part??button.dataset.hotspot)));
  document.querySelectorAll('[data-ship-view]').forEach(button=>button.addEventListener('click',()=>goToView(viewPositions[button.dataset.shipView],button.dataset.shipView)));
  $('#ship-play').addEventListener('click',togglePlay);$('#ship-reset').addEventListener('click',reset);
  $('#ship-time').addEventListener('input',event=>{playing=false;elapsed=Number(event.target.value);$('#ship-canopy').checked=$('#ship-pilot').checked;$('#ship-explode').checked=false;updateTransport();});
  $('#ship-speed').addEventListener('change',event=>speed=Number(event.target.value));
  $('#ship-loop').addEventListener('click',event=>{loop=!loop;event.currentTarget.setAttribute('aria-pressed',String(loop));});
  $('#ship-rotate').addEventListener('click',event=>{viewTween=null;controls.autoRotate=!controls.autoRotate;event.currentTarget.setAttribute('aria-pressed',String(controls.autoRotate));});
  for(const selector of ['#ship-canopy','#ship-explode'])$(selector).addEventListener('change',()=>{stopFlight();if(selector==='#ship-canopy'&&$('#ship-canopy').checked)goToView([4.9,7.4,7.4]);});
  function syncCanopyControls(){
    const hidden=$('#ship-hide-canopy').checked,occupied=$('#ship-pilot').checked;
    // Zud's hat needs more clearance than the closed cover provides.
    $('#ship-canopy').disabled=hidden||occupied;
    if(occupied)$('#ship-canopy').checked=true;
    if(canopy)canopy.visible=!hidden;
  }
  $('#ship-hide-canopy').addEventListener('change',syncCanopyControls);
  $('#ship-pilot').addEventListener('change',event=>{
    pilot.root.visible=event.target.checked;
    if(event.target.checked){$('#ship-hide-canopy').checked=true;goToView([4.9,7.4,7.4]);}
    syncCanopyControls();
  });
  $('#ship-comic').addEventListener('click',event=>{comicEnabled=!comicEnabled;event.currentTarget.setAttribute('aria-pressed',String(comicEnabled));$('.ship-simulator').href=`${base}simulator.html?vehicle=${config.id}&${pilotParams}&comic=${comicEnabled?'1':'0'}`;});
  reducedMotion.addEventListener('change',()=>{controls.enableDamping=!reducedMotion.matches;if(reducedMotion.matches){playing=false;loop=false;viewTween=null;controls.autoRotate=false;$('#ship-loop').setAttribute('aria-pressed','false');$('#ship-rotate').setAttribute('aria-pressed','false');updateTransport();}});
  const pointer=new THREE.Vector2(),raycaster=new THREE.Raycaster();let down=null;
  canvas.addEventListener('pointerdown',event=>{down=event.isPrimary?{x:event.clientX,y:event.clientY}:null;});
  canvas.addEventListener('pointerup',event=>{
    if(!down||Math.hypot(event.clientX-down.x,event.clientY-down.y)>5)return;
    down=null;const bounds=canvas.getBoundingClientRect();pointer.set((event.clientX-bounds.left)/bounds.width*2-1,-(event.clientY-bounds.top)/bounds.height*2+1);raycaster.setFromCamera(pointer,camera);
    const hit=raycaster.intersectObjects([...meshes.filter(mesh=>!canopyMeshes.has(mesh)||canopy.visible),...(pilot.root.visible?pilotMeshes:[])],false)[0];if(hit)selectPart(hit.object.userData.system,{focus:false});
  });
  canvas.addEventListener('pointercancel',()=>down=null);
  controls.addEventListener('start',()=>{viewTween=null;document.querySelectorAll('[data-ship-view]').forEach(button=>button.setAttribute('aria-pressed','false'));});
  document.addEventListener('keydown',event=>{
    if(event.code==='Space'&& !/INPUT|SELECT|BUTTON|A|TEXTAREA/.test(event.target.tagName)){event.preventDefault();togglePlay();}
    if(event.key==='Escape')selectPart(null,{focus:false});
  });
  const sizeObserver=new ResizeObserver(()=>{const w=viewport.clientWidth,h=viewport.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);});sizeObserver.observe(viewport);
  camera.position.copy(new THREE.Vector3(...viewPositions.perspective).sub(initialTarget).multiplyScalar(responsiveDistance()).add(initialTarget));controls.target.copy(initialTarget);controls.update();
  const labels=parts.map(part=>({part,element:$(`[data-hotspot="${part.id}"]`),anchor:new THREE.Vector3(...part.anchor)}));
  const canopyInput=$('#ship-canopy'),explodeInput=$('#ship-explode'),labelsInput=$('#ship-label-toggle'),timeInput=$('#ship-time'),timeLabel=$('#ship-time-label'),phaseLabel=$('#ship-phase');
  const splitMeshes=Object.fromEntries(parts.filter(p=>p.split).map(p=>[p.id,meshes.filter(m=>m.userData.system===p.id)]));
  const hotVanes=meshes.filter(mesh=>/aleta[_ ]caliente/.test(mesh.name));
  const projected=new THREE.Vector3();const clock=new THREE.Clock();let lastPhase='';
  function frame(){
    const dt=Math.min(clock.getDelta(),.05);
    if(document.hidden)return;
    if(playing){elapsed+=dt*speed;if(elapsed>=FLIGHT_DURATION){if(loop)elapsed%=FLIGHT_DURATION;else {elapsed=FLIGHT_DURATION;playing=false;updateTransport();}}}
    const pose=flightPose(reducedMotion.matches ? elapsed<2?0:elapsed<6?4:elapsed<13?9:elapsed<17?15:18 : elapsed);
    if(reducedMotion.matches){pose.roll=0;pose.pitch=0;pose.bob=0;}
    const ease=1-Math.exp(-dt*6);
    explode=THREE.MathUtils.lerp(explode,explodeInput.checked?1:0,reducedMotion.matches||keyboardInput?1:ease);
    open=THREE.MathUtils.lerp(open,canopyInput.checked?1:0,reducedMotion.matches||keyboardInput?1:ease);
    ship.position.y=pose.altitude+pose.bob+explode*.55;ship.rotation.z=pose.roll;ship.rotation.x=pose.pitch;
    for(const part of parts){
      const group=systems[part.id];group.position.fromArray(part.offset).multiplyScalar(explode);
      if(part.split){group.position.x=0;for(const mesh of splitMeshes[part.id])mesh.position.x=mesh.userData.rest.x+part.offset[0]*explode*mesh.userData.side;}
    }
    if(canopy){canopy.position.copy(canopyRest);canopy.position.y+=open*.95;canopy.position.x-=open*.75;}
    for(let i=0;i<exhausts.length;i++){
      const plume=exhausts[i],length=pose.power*(1+(reducedMotion.matches?0:.08*Math.sin(elapsed*20+i)));plume.visible=pose.power>.01;plume.scale.y=length;plume.position.z=plume.userData.outlet-(i%2===0?.6:.4)*length;
    }
    for(const mesh of hotVanes){mesh.material.emissive.setHex(selected==='engines'?0xd6632e:0xff6b1c);mesh.material.emissiveIntensity=selected==='engines'?.2+pose.power*2:pose.power*2;}
    if(pilot.root.visible)pilot.update(elapsed,!reducedMotion.matches&&elapsed>0&&elapsed<FLIGHT_DURATION);
    contact.material.opacity=1-pose.altitude*.38;contact.scale.setScalar(1+pose.altitude*.12);
    camera.position.y-=cameraLift;controls.target.y-=cameraLift;
    if(viewTween){viewTween.elapsed+=dt;const t=Math.min(viewTween.elapsed/.28,1),u=t*t*(3-2*t);camera.position.lerpVectors(viewTween.from,viewTween.to,u);controls.target.lerpVectors(viewTween.target,initialTarget,u);if(t===1)viewTween=null;}
    const nextLift=pose.altitude*.7+explode*.45;
    camera.position.y+=nextLift;controls.target.y+=nextLift;
    cameraLift=nextLift;
    const fieldOfView=36+explode*12;if(Math.abs(camera.fov-fieldOfView)>.01){camera.fov=fieldOfView;camera.updateProjectionMatrix();}
    controls.update(dt);scene.updateMatrixWorld(true);
    const labelVisible=labelsInput.checked;
    const occupied=[];
    for(const item of labels){
      projected.copy(item.anchor);if(item.part.split)projected.x+=Math.sign(projected.x)*item.part.offset[0]*explode;
      systems[item.part.id].localToWorld(projected);projected.project(camera);
      const x=(projected.x*.5+.5)*viewport.clientWidth,y=(-projected.y*.5+.5)*viewport.clientHeight;
      const visible=labelVisible&&projected.z>-1&&projected.z<1&&x>16&&x<viewport.clientWidth-16&&y>50&&y<viewport.clientHeight-70&&!occupied.some(p=>Math.hypot(p.x-x,p.y-y)<44);
      item.element.hidden=!visible;if(visible){item.element.style.transform=`translate3d(${x}px,${y}px,0) translate(-50%,-50%)`;occupied.push({x,y});}
    }
    const phase=explodeInput.checked?'VISTA DESARMADA':elapsed>0?pose.phase.toUpperCase():$('#ship-hide-canopy').checked?'CABINA OCULTA':canopyInput.checked?'CABINA ABIERTA':'EN HANGAR';
    if(phase!==lastPhase){phaseLabel.textContent=phase;lastPhase=phase;}
    timeInput.value=String(elapsed);const timeText=`00:${String(Math.floor(elapsed)).padStart(2,'0')} / 00:18`;if(timeLabel.textContent!==timeText)timeLabel.textContent=timeText;
    viewport.dataset.altitude=pose.altitude.toFixed(3);viewport.dataset.canopy=open.toFixed(2);viewport.dataset.exploded=explode.toFixed(2);
    viewport.dataset.canopyHidden=String(canopy?!canopy.visible:false);viewport.dataset.pilot=String(pilot.root.visible);viewport.dataset.comic=String(comicEnabled);
    if(comicEnabled)comic.render(scene,camera,'#e8e9e2');else renderer.render(scene,camera);
  }
  document.querySelectorAll('.ship-app [disabled]').forEach(element=>element.disabled=false);
  viewport.dataset.ready='true';viewport.dataset.meshCount=String(meshes.length);loader.hidden=true;
  updateTransport();renderer.setAnimationLoop(frame);
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();playing=false;renderer.setAnimationLoop(null);fail('Se interrumpió la vista 3D. Recargá el hangar para continuar.');});
  window.addEventListener('pagehide',()=>{renderer.setAnimationLoop(null);sizeObserver.disconnect();controls.dispose();comic.dispose();pilot.dispose();environment.dispose();renderer.dispose();},{once:true});
}
