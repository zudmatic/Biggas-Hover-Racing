import * as THREE from 'three';
import './style.css';
import './room-clock.css';
import { createContactShadow } from './contact-shadow.js';
import { HomeJourney } from './home-journey.js';
import { HomeMovement, canStand } from './home-movement.js';
import { WalkCycle } from './walk-cycle.js';
import { ZUD } from './zud-profile.js';
import { createZudModel, BEANIE_COLORS } from './zud-model.js';
import { createZudAnimator } from './zud-animation.js';
import { createAccessories, smokeCycle } from './accessories.js';
import { createMusicPlayer } from './music-player.js';
import { createSceneAudio } from './scene-audio.js';
import { createFootstepSurface } from './footstep-surface.js';
import { DEFAULT_AUDIO_MIX } from './audio-channels.js';
import { createRetroLighting } from './retro-lighting.js';
import { createPrintPass } from './retro-print.js';
import { retroStyle, RETRO_LOOKS } from './retro-style.js';
import { createTwosClock } from './twos.js';
import { createPaperTheme } from './paper-theme.js';
import { createClockEditor } from './room-clock.js';
import { formatTime } from './day-cycle.js';
import { createRetroRoom, ROOM_SCALE } from './retro-room.js';
import { createDreamBubble } from './dream-bubble.js';
import { layout } from './home-layout.js';
import { createNatureGarden } from './nature-garden.js';
import {createCloudClock} from './cloud-clock.js';
import {createSceneDocument,isVisible} from './scene-document.js';
import {createSceneInteractions,configureSceneChair} from './scene-interactions.js';
import {CHARACTER_DEFAULTS,CHARACTER_STORAGE,readCharacterDocument} from './character-settings.js';
import {createCharacterHats} from './character-hats.js';
import {createCharacterArms} from './character-arms.js';
import {applySceneMaterials} from './scene-materials.js';
import {hatDefaults} from './hat-catalog.js';
import {createLookPicker} from './look-picker.js';
import {createWorkNavigation} from './work-navigation.js';
import {createRoomBatches,ROOM_SOURCE_LAYER} from './room-batches.js';
import {setData,setText,setStyle} from './frame-dom.js';

const $ = (selector) => document.querySelector(selector);
const stage = $('#stage');
const canvas = $('#zud-canvas');
let canWorkInScene=true;
let workNavigation;
if(import.meta.env.MODE!=='house') {
  const sceneLink=document.createElement('a'),sceneUrl=new URL(location.href);
  sceneUrl.searchParams.delete('debug');sceneUrl.searchParams.set('edit','scene');
  sceneLink.href=sceneUrl.pathname+sceneUrl.search;sceneLink.className='scene-editor-launch';
  sceneLink.textContent='Editar escena';stage.append(sceneLink);
  const editorLink=document.createElement('a'),url=new URL(location.href);
  url.searchParams.set('debug','character');
  editorLink.href=url.pathname+url.search;editorLink.className='character-debug-launch';
  editorLink.textContent='Editar personaje';stage.append(editorLink);
  const shipLink=document.createElement('a');
  shipLink.href=`${import.meta.env.BASE_URL}spaceship.html`;shipLink.className='spaceship-launch';
  shipLink.textContent='Nave de Zud';stage.append(shipLink);
}
const symbol = $('#floating-symbol');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
// The room fades in once its textures are in and a couple of frames are drawn.
const revealHouse=()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
  if(document.body.dataset.houseReady)return;
  document.body.dataset.houseReady='true';
  setTimeout(()=>$('.house-loader')?.remove(),400);
}));
let soundEnabled = false;
const sceneAudio=createSceneAudio({onStatus:status=>setData(stage,'audioStatus',status)});
sceneAudio.setMix(DEFAULT_AUDIO_MIX);
let audioContext;
let actionTimer;
let state = 'idle';
let actionStart = performance.now();
let lastTime = performance.now();
let activeTime = 0;
let onAction = () => {};
// An object Zud is walking up to; any new action cancels the errand.
let pendingVisit = null;
let pendingDisco = false;
const music = createMusicPlayer({panel:$('#music-panel'),status:$('#music-status'),onEnd:()=>{if(state==='disco')perform('idle');}});
$('#dance-audio').volume=DEFAULT_AUDIO_MIX.master*DEFAULT_AUDIO_MIX.channels.music;
function beginDisco() {
  pendingDisco=false;actionStart=performance.now();
  music.start();
}
const actionConfig = () => ZUD.actions[state] ?? ZUD.actions.idle;
async function unlockAudio() {
  if (!soundEnabled) return;
  try {
    if (!audioContext) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) throw new Error('Audio no disponible');
      audioContext = new AudioContext();
    }
    // Load while autoplay permission is pending; the first gesture can resume
    // this same context without waiting for the files to download.
    await Promise.all([sceneAudio.connect(audioContext),
      audioContext.state === 'suspended' ? audioContext.resume() : Promise.resolve()]);
    return true;
  } catch (error) {
    if(error.name==='NotAllowedError')return false;
    setSound(false);
  }
}
// Sound starts on; an explicit mute also applies to the dance with glasses.
function setSound(on) {
  soundEnabled = on;
  sceneAudio.setEnabled(on);
  setData(stage,'sound',on?'on':'off');
  $('#sound-toggle').setAttribute('aria-pressed',String(on));
  $('#sound-toggle').setAttribute('aria-label',on?'Silenciar sonido':'Activar sonido');
  $('#sound-toggle').title=on?'Silenciar sonido':'Activar sonido';
  music.setMuted(!on||$('#dance-audio').volume===0);
  if(on)void unlockAudio();
}
$('#sound-toggle').addEventListener('click',()=>setSound(!soundEnabled));
$('#sound-toggle').addEventListener('keydown',event=>{
  if(event.key===' '||event.key==='Enter')event.stopPropagation();
});
setSound(true);
// Autoplay may require a gesture anywhere on the page, including touch and
// keyboard navigation. Keep listening to resume an interrupted context too.
const resumeSceneAudio=()=>{if(soundEnabled&&audioContext?.state!=='running')void unlockAudio();};
for(const event of ['pointerdown','pointerup','keydown'])document.addEventListener(event,resumeSceneAudio,{capture:true});
const announcement = document.createElement('span');
announcement.setAttribute('role', 'status');
announcement.className = 'sr-only';
stage.append(announcement);
// Text-only action status for screen readers; Zud has no voice.
function announce(text) {
  announcement.textContent = text;
}
async function perform(nextState) {
  if(!ZUD.actions[nextState]) return;
  if(nextState==='work'&&!canWorkInScene){announce('El escritorio fue editado. Podés seguir explorando el cuarto.');return;}
  workNavigation?.setWorking(nextState==='work');
  pendingVisit=null;
  clearTimeout(actionTimer);
  pendingDisco=false;music.stop();
  state = nextState;
  actionStart = performance.now();
  setData(stage,'state',state);
  const action = actionConfig();
  $('#state-label').textContent = action.label;
  const line = state === 'work' && stage.dataset.activity !== 'typing' ? ZUD.deskLine : action.text;
  // Unlock scene effects on this user gesture.
  void unlockAudio();
  if(['wave','halloween'].includes(state))sceneAudio.play('interaction');
  announce(line);
  onAction(state);
  if (action.duration) actionTimer = setTimeout(() => perform('idle'), action.duration);
}
// Keep the existing action keys; the retired conversation key (5) is unused.
document.addEventListener('keydown', event => {
  if (document.querySelector('dialog[open]') || event.ctrlKey || event.metaKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
  const shortcut = ZUD.controls.find(([, , key])=>key===event.key)?.[0];
  if (shortcut) { event.preventDefault(); perform(shortcut); }
  if (event.key === 'Escape') perform('idle');
});

async function createWorld() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    stage.insertAdjacentHTML('beforeend', '<div class="fallback"><strong>Zud necesita un poquito de 3D.</strong><p>Activa la aceleración gráfica o abre esta página en un navegador compatible con WebGL.</p></div>');
    revealHouse();
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.10;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-4, 4, 3, -3, .1, 80);
  const lighting=createRetroLighting(scene,{renderer});
  const shadow = createContactShadow();
  scene.add(shadow);
  // Retro Print is a whole-frame treatment: the render is printed and scanned,
  // onto opaque paper (src/paper.js, equal to the page background).
  const printPass=createPrintPass(renderer);
  const zud=createZudModel();
  const {root,eyes,accessoryMount}=zud;
  const accessories=createAccessories(accessoryMount??root);
  const zudAnimator=createZudAnimator(zud);
  lighting.bind(root);
  zud.setBeanieColor(BEANIE_COLORS[0].hex);
  setData(stage,'beanieColor',BEANIE_COLORS[0].hex);
  const actor=new THREE.Group();actor.add(root);scene.add(actor);
  actor.scale.setScalar(ROOM_SCALE);
  const retroRoom = createRetroRoom({bindLighting:object=>lighting.bind(object),deferExterior:true});
  scene.add(retroRoom.room);
  lighting.bind(retroRoom.room);
  const nature=createNatureGarden({bindLighting:object=>lighting.bind(object),deferLoad:true});
  let hatSettings={...CHARACTER_DEFAULTS};
  try {
    const saved=localStorage.getItem(CHARACTER_STORAGE);
    if(saved)hatSettings=readCharacterDocument(JSON.parse(saved)).settings;
  } catch { /* Invalid local variants keep the approved original hat. */ }
  // Only wardrobe settings cross into the room; studio/body experiments stay local.
  zud.setBeanieColor(hatSettings.hatColor);
  setData(stage,'beanieColor',hatSettings.hatColor);
  const hats=createCharacterHats(zud,{onChange:({state,active})=>{
    setData(stage,'hatState',state);setData(stage,'hat',active);
    const wardrobe=root.getObjectByName('Sombreros de Zud');
    if(state==='ready'&&wardrobe){applySceneMaterials(wardrobe);lighting.bind(wardrobe);}
    renderer.shadowMap.needsUpdate=true;
  }});
  const hatsReady=hats.update({...hatSettings,wireframe:false});
  const characterArms=createCharacterArms(zud,{comic:true});
  characterArms.update({...hatSettings,wireframe:false});
  lighting.bind(root);
  stage.dataset.armLeft=hatSettings.armLeft;stage.dataset.armRight=hatSettings.armRight;
  const clouds=createCloudClock(stage);
  scene.add(nature.garden);
  nature.ready.then(({loaded,total})=>{setData(stage,'nature',loaded===total?'ready':'partial');});
  await retroRoom.criticalReady;
  const sceneDocument=createSceneDocument(retroRoom,{onLoad:object=>{
    lighting.bind(object);object.traverse(mesh=>{if(mesh.isMesh&&mesh.castShadow)retroRoom.bounceBlockers.push(mesh);});
  }});
  const footstepSurface=createFootstepSurface(sceneDocument.entries);
  try {
    await sceneDocument.restore();
    {
      const changed=[...sceneDocument.entries.values()].filter(entry=>sceneDocument.affected(entry));
      const changedObstacles=new Set(changed.map(entry=>entry.obstacle).filter(index=>index!==undefined));
      layout.obstacles=layout.obstacles.filter((_,index)=>!changedObstacles.has(index));
      for(const entry of sceneDocument.entries.values()) {
        if(!isVisible(entry.object)||entry.builtin&&!changed.includes(entry))continue;
        const box=new THREE.Box3().setFromObject(entry.object);
        if(box.max.y>.16&&box.min.y<1.6)layout.obstacles.push([box.min.x,box.max.x,box.min.z,box.max.z]);
      }
      const touched=object=>changed.some(entry=>{for(let node=object;node;node=node.parent)if(node===entry.object)return true;return false;});
      canWorkInScene=!['desk','chair','laptop'].some(id=>changed.some(entry=>entry.id===id))&&canStand(layout.chair.x,layout.chair.z)&&canStand(layout.aisle.x,layout.aisle.z);
      retroRoom.interactables=retroRoom.interactables.filter(item=>isVisible(item.object)&&(['clock','disco','smoke','water'].includes(item.action)||!touched(item.object)));
      // A newly placed prop may occupy the rug's original spawn point.
      if(!canStand(layout.home.x,layout.home.z)) {
        let free=null;
        for(let radius=.1;radius<6&&!free;radius+=.1)for(let i=0;i<48;i++) {
          const angle=i/48*Math.PI*2,x=layout.home.x+Math.cos(angle)*radius,z=layout.home.z+Math.sin(angle)*radius;
          if(canStand(x,z)){free=new THREE.Vector3(x,layout.home.y,z);break;}
        }
        if(free)layout.home=free;
      }
      setData(stage,'customScene','true');
    }
  } catch {
    const notice=document.createElement('p');notice.className='scene-load-notice';notice.textContent=import.meta.env.MODE==='house'?'No se pudo cargar tu escena guardada.':'No se pudo cargar tu escena guardada. Abrí Editar escena para recuperarla.';stage.append(notice);
  }
  const sceneChair=configureSceneChair(retroRoom,sceneDocument);
  if(sceneChair&&!['desk','laptop'].some(id=>sceneDocument.affected(sceneDocument.entries.get(id))))canWorkInScene=true;
  retroRoom.interactables=retroRoom.interactables.filter(item=>item.action!=='work'||canWorkInScene);
  const lookPicker=createLookPicker({canvas,model:zud,getSettings:()=>hatSettings,reducedMotion,getSelected:()=>hatSettings.showHat?hatSettings.hatModel:'none',onSelect:async id=>{
    const next={...hatSettings,...hatDefaults(id)};
    // Retry also works after a failed request for this same model.
    await (stage.dataset.hatState==='error'&&hatSettings.hatModel===id?hats.retry():hats.update({...next,wireframe:false}));
    if(stage.dataset.hatState==='error'){
      // Reset the requested model so another click can load it again.
      await hats.update({...hatSettings,hatModel:'beanie',wireframe:false});
      throw new Error('Hat unavailable');
    }
    hatSettings=next;
    try{
      const saved=JSON.parse(localStorage.getItem(CHARACTER_STORAGE)??'null');
      localStorage.setItem(CHARACTER_STORAGE,JSON.stringify({...saved,version:1,settings:{...saved?.settings,...hatSettings}}));
    }catch{ /* Wearing a hat also works when browser storage is unavailable. */ }
  }});
  const sceneInteractions=createSceneInteractions(retroRoom,sceneDocument,{
    onLook:()=>{heldKeys.clear();sceneAudio.play('interaction');lookPicker.open();},
    onPlaceholder:section=>{sceneAudio.play('interaction');announce(`${section} · Próximamente`);},
  });
  let wateringItem=null;
  // The interactive room appears before the decorative meadow finishes loading.
  Promise.all([retroRoom.criticalReady,hatsReady]).then(revealHouse);
  // Zud's beanie bounces its color onto nearby surfaces.
  const actorPatch={object:actor,position:new THREE.Vector3(0,3.7,0),normal:new THREE.Vector3(0,1,0),omni:true,area:.45,
    material:()=>zud.bounceMaterial??root.getObjectByName('Copa')?.material??root.children[0].material};
  root.traverse(object=>{if(object.isMesh&&object.castShadow)retroRoom.bounceBlockers.push(object);});
  lighting.setEnvironment({patches:[...retroRoom.bouncePatches,actorPatch],blockers:retroRoom.bounceBlockers,lights:retroRoom.lights});
  const journey = new HomeJourney();
  const movement = new HomeMovement(journey);
  const walkCycle = new WalkCycle();
  const lastRoute = new THREE.Vector3().copy(journey.position);
  const heldKeys = new Set();
  actor.position.copy(journey.position);
  const clockEditor=createClockEditor({clock:retroRoom.clock,scene,camera,canvas,reducedMotion,getTime:()=>retroRoom.timeOfDay,setTime:minutes=>retroRoom.setTime(minutes),onOpen:()=>{heldKeys.clear();hover(null);sceneAudio.play('interaction');}});
  retroRoom.room.userData.openClock=()=>clockEditor.show();
  const clockLaunch=document.createElement('button');clockLaunch.type='button';clockLaunch.className='clock-launch';clockLaunch.setAttribute('aria-label','Abrir reloj para cambiar la hora');
  clockLaunch.hidden=!sceneDocument.entries.get('clock').object.visible;
  clockLaunch.addEventListener('click',()=>clockEditor.show());stage.append(clockLaunch);
  let roomYaw = Math.PI/4, orbitYaw = roomYaw;
  let roomElevation = .57, orbitElevation = roomElevation;
  let roomPhase = 'idle';
  setData(stage,'activity','idle');
  setData(stage,'room',layout.name);
  // Color comic is the default; the nav toggles black & white. Keep legacy ?look=
  // links and the debug panel working, including Normal. Twos only runs in comic looks.
  const lookToggle=$('#look-toggle');
  const urlLook=new URLSearchParams(location.search).get('look');
  if(RETRO_LOOKS.includes(urlLook))retroStyle.setLook(urlLook);
  const twosActive=()=>retroStyle.params.twosOn&&retroStyle.look!=='normal';
  // The print style's switches, readable by tests.
  const showPrintStyle=()=>{
    setData(stage,'printSpace',retroStyle.space);setData(stage,'printLite',retroStyle.lite?'on':'off');
    setData(stage,'look',retroStyle.look);setData(stage,'twos',twosActive()?'on':'off');
    lookToggle.setAttribute('aria-pressed',String(retroStyle.look==='mono'));
    lookToggle.title=retroStyle.look==='mono'?'Cambiar a cómic en color':'Cambiar a cómic B/N';
  };
  retroStyle.subscribe(showPrintStyle);showPrintStyle();
  lookToggle.addEventListener('click',event=>{
    retroStyle.setLook(retroStyle.look==='mono'?'comic':'mono');
    const url=new URL(location.href);url.searchParams.set('look',retroStyle.look);history.replaceState(null,'',url);
    // After a pointer click, give the keys back to Zud (space jumps instead of re-pressing the button).
    if(event.detail>0)lookToggle.blur();
  });
  // A focused button keeps Space and Enter for itself (the room's own handlers would jump or act).
  document.querySelector('.site-nav')?.addEventListener('keydown',event=>{if(event.key===' '||event.key==='Enter')event.stopPropagation();});
  // The page follows the scene's light: closing the blind or nightfall darkens the paper
  // (src/paper-theme.js). `?time=HH:MM` starts the clock at that time (e.g. 23:30).
  const paperTheme=createPaperTheme({post:retroStyle.post,params:()=>retroStyle.params,root:document.documentElement});
  const startTime=/^(\d{1,2}):(\d{2})$/.exec(new URLSearchParams(location.search).get('time')??'');
  if(startTime)retroRoom.setTime(Number(startTime[1])*60+Number(startTime[2]));
  const lampPoint=new THREE.Vector3();
  const followLight=(dt,snap)=>{
    sceneInteractions.lights.source.getWorldPosition(lampPoint).project(camera);
    const {dark,theme}=paperTheme.update({dt,daylight:retroRoom.cycle.daylight,blind:retroRoom.blindAmount,
      lampUv:[lampPoint.x*.5+.5,lampPoint.y*.5+.5],look:retroStyle.look,reducedMotion:snap||reducedMotion.matches});
    setData(stage,'theme',theme);setData(stage,'darkness',dark.toFixed(2));
  };
  // Dev-only tuning panel: `?debug` in the URL. Absent from production builds.
  if(import.meta.env.DEV&&new URLSearchParams(location.search).has('debug')) {
    import('./debug-gui.js').then(({createDebugGui})=>createDebugGui({style:retroStyle,
      time:{get:()=>retroRoom.timeOfDay,set:minutes=>retroRoom.setTime(minutes)}}));
  }
  const cameraTarget = new THREE.Vector3(0,1.35,0);
  const projected = new THREE.Vector3();
  onAction = nextState => {
    if(nextState!=='water')wateringItem=null;
    heldKeys.clear();
    if(nextState==='work') {pointer=null;hover(null);movement.reset();journey.go('desk',reducedMotion.matches);}
    else if(!movement.active&&!arrivedAction)journey.go('home',reducedMotion.matches);
    if(nextState==='disco'){
      if(journey.phase!=='idle')pendingDisco=true;
      else beginDisco();
    }
  };
  let stageWidth=0,stageHeight=0;
  function resize() {
    const { width, height } = stage.getBoundingClientRect();
    if(!width||!height)return;
    stageWidth=width;stageHeight=height;
    const aspect = width / height;
    const frustum = Math.max(9.5, 12.4 / aspect);
    camera.left = -frustum * aspect / 2; camera.right = frustum * aspect / 2;
    camera.top = frustum / 2; camera.bottom = -frustum / 2;
    camera.updateProjectionMatrix(); renderer.setSize(width, height, false);
    // Print dots are sized in CSS px: they follow the adaptive pixel ratio.
    retroStyle.setPixelRatio(renderer.getPixelRatio());clockEditor.resize();
  }
  new ResizeObserver(resize).observe(stage);
  resize();
  let pointer = null;
  const raycaster = new THREE.Raycaster();raycaster.layers.enable(ROOM_SOURCE_LAYER);
  canvas.addEventListener('pointerdown', event => {
    if(clockEditor.active)return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
    canvas.setPointerCapture(event.pointerId);
  });
  // Clickable room objects: hover lifts them and names the interaction.
  const hint = $('#hover-hint'), thought = $('#thought');
  const dreamBubble=createDreamBubble(thought);
  let restingStartedAt=null;
  let hovered = null, arrivedAction = false;
  retroRoom.room.updateMatrixWorld(true);
  for(const item of retroRoom.interactables) {
    // A padded invisible box makes small props (the cigarette) easy to hit.
    const bounds=new THREE.Box3().setFromObject(item.object),size=bounds.getSize(new THREE.Vector3()).addScalar(.12);
    const area=new THREE.Mesh(new THREE.BoxGeometry(size.x,size.y,size.z),new THREE.MeshBasicMaterial({visible:false}));
    area.userData.hitArea=true;area.position.copy(bounds.getCenter(new THREE.Vector3()));retroRoom.room.add(area);item.object.attach(area);
    item.object.userData.baseScale=item.object.scale.clone();
  }
  const aim = event => {
    const bounds = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1), camera);
  };
  function pick(event) {
    aim(event);
    // A direct hit on an object's own geometry wins; padded areas only help
    // when the pointer is merely close (neighbours like glasses and cigarette).
    let best=null,distance=Infinity,direct=false;
    for(const item of retroRoom.interactables) {
      if(!isVisible(item.object)||(!item.activate&&!item.onArrive&&!ZUD.actions[item.action])) continue;
      const hits=raycaster.intersectObject(item.object,true);
      const ownHit=hits.find(hit=>!hit.object.userData.hitArea),hit=ownHit??hits[0];
      if(!hit)continue;
      const own=Boolean(ownHit);
      if(own&&!direct||own===direct&&hit.distance<distance){best=item;distance=hit.distance;direct=own;}
    }
    // Zud blocks objects behind him, without being interactive himself.
    const character=raycaster.intersectObject(root,true)[0];
    return best&&!(character&&character.distance<distance)?best:null;
  }
  function hover(item,event) {
    hovered=item;canvas.style.cursor=item?'pointer':'';hint.hidden=!item;
    if(item) {
      const bounds=stage.getBoundingClientRect();
      hint.textContent=item.label;hint.style.left=`${event.clientX-bounds.left}px`;hint.style.top=`${event.clientY-bounds.top}px`;
    }
  }
  // Stop the current action without sending him home: a new route follows.
  function holdStill() {arrivedAction=true;perform('idle');arrivedAction=false;heldKeys.clear();movement.reset();}
  function useItem(item) {
    hover(null);
    if(item.activate){item.activate();if(item.action==='blinds')sceneAudio.play('blinds',{volume:.3,cooldown:.25});return;}
    if(item.getVisit){item.visit=item.getVisit(journey.position);if(!item.visit){announce('No encuentro un lugar libre para acercarme.');return;}}
    if(!item.visit&&!item.bed){perform(item.action);return;}
    // Walk up to the object (or into bed) first; the action starts on arrival.
    holdStill();pendingVisit=item;
    const started=item.bed?journey.go('bed',reducedMotion.matches):journey.go('visit',reducedMotion.matches,item.visit);
    if(started===false)pendingVisit=null;
  }
  // Click on the floor: walk there, around the furniture.
  const floorPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0),floorHit=new THREE.Vector3();
  const marker=new THREE.Mesh(new THREE.RingGeometry(.1,.16,20),new THREE.MeshBasicMaterial({color:0xfff4e0,transparent:true,opacity:0,depthWrite:false,toneMapped:false}));
  marker.rotation.x=-Math.PI/2;marker.renderOrder=2;scene.add(marker);let markerLife=0;
  function walkTo(event) {
    aim(event);floorPlane.constant=-layout.home.y;
    if(!raycaster.ray.intersectPlane(floorPlane,floorHit))return false;
    if(Math.abs(floorHit.x)>layout.limit+.35||Math.abs(floorHit.z)>layout.limit+.35)return false;
    // Clicked on furniture or past an edge: the nearest free spot.
    let target=null;
    for(let radius=0;radius<1&&!target;radius+=.08)for(let i=0;i<(radius?24:1);i++) {
      const angle=i/24*Math.PI*2,x=floorHit.x+Math.sin(angle)*radius,z=floorHit.z+Math.cos(angle)*radius;
      if(canStand(x,z)){target=new THREE.Vector3(x,layout.home.y,z);break;}
    }
    if(!target)return false;
    holdStill();
    const heading=Math.atan2(target.x-journey.position.x,target.z-journey.position.z);
    journey.go('visit',reducedMotion.matches,{position:target,heading:Number.isFinite(heading)?heading:journey.heading});
    marker.position.set(target.x,target.y+.02,target.z);markerLife=1;
    return true;
  }
  canvas.addEventListener('pointerleave', () => hover(null));
  canvas.addEventListener('pointermove', event => {
    if(clockEditor.active)return;
    if (!pointer) { hover(pick(event), event); return; }
    if (event.pointerId !== pointer.id) return;
    hover(null);
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    if (Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > 5) pointer.moved = true;
    roomYaw = THREE.MathUtils.clamp(roomYaw + dx * .004, .18, 1.38);
    roomElevation = THREE.MathUtils.clamp(roomElevation + dy * .003, .42, .86);
    pointer.x = event.clientX; pointer.y = event.clientY;
  });
  canvas.addEventListener('pointerup', event => {
    if(clockEditor.active){pointer=null;return;}
    if (pointer && !pointer.moved) {
      const item = pick(event);
      if (item) useItem(item);
      else { aim(event); if (!raycaster.intersectObject(root, true).length) walkTo(event); }
    }
    pointer = null;
  });
  canvas.addEventListener('pointercancel', () => { pointer = null; });
  function engageMovement() {
    pendingVisit=null;
    if(!movement.active||state!=='idle'||pendingDisco) {
      clearTimeout(actionTimer);
      pendingDisco=false;music.stop();state='idle';setData(stage,'state',state);
      $('#state-label').textContent='Zud está explorando la casa';
    }
    workNavigation?.setWorking(false);
    movement.takeControl();
  }
  // Arrows walk relative to the camera; Space jumps.
  document.addEventListener('keydown',event=> {
    if(document.querySelector('dialog[open]')||clockEditor.open||event.ctrlKey||event.metaKey||event.altKey||event.target.isContentEditable||/INPUT|TEXTAREA|SELECT/.test(event.target.tagName))return;
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)) {
      event.preventDefault();engageMovement();heldKeys.add(event.key);
    } else if(event.code==='Space') {
      event.preventDefault();
      if(!event.repeat){engageMovement();movement.jump();}
    }
  });
  document.addEventListener('keyup',event=>heldKeys.delete(event.key));
  window.addEventListener('blur',()=>heldKeys.clear());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)heldKeys.clear();});
  const twos=createTwosClock(),shownPosition=new THREE.Vector3().copy(journey.position);
  let shownDesk=0;
  const smooth = (current, target, dt) => THREE.MathUtils.lerp(current, target, 1 - Math.exp(-dt * 9));
  let halloweenElapsed=0,lastCostumeAction=0;
  let lastJumpCycle=-1;
  function animate(now) {
    const interval=now-lastTime;
    const dt = Math.min(interval / 1000, .05); lastTime = now;
    if (document.hidden) return;
    if(!fixedResolution)adaptResolution(now,interval);
    activeTime += dt;
    const t = activeTime;
    let elapsed = (now - actionStart) / 1000;
    const motion = reducedMotion.matches ? 0 : 1;
    if(movement.active)movement.update(dt,heldKeys,orbitYaw);
    else journey.update(dt);
    // On twos only Zud's displayed position and pose hold between ticks; his
    // journey (the truth other logic reads), camera, lights and UI run at full rate.
    const pose=twos.step(dt,{on:twosActive()&&Boolean(motion),fps:retroStyle.params.twosFps});
    if(pose.tick){shownPosition.copy(journey.position);shownPosition.y+=movement.height;}
    actor.position.copy(shownPosition);
    setData(stage,'shownX',shownPosition.x.toFixed(3));
    setData(stage,'positionX',journey.position.x.toFixed(3));setData(stage,'positionZ',journey.position.z.toFixed(3));
    setData(stage,'jumpHeight',movement.height.toFixed(3));
    if(roomPhase !== journey.phase) {
      roomPhase = journey.phase;
      setData(stage,'activity',roomPhase);
      if(roomPhase === 'typing' && state === 'work') announce(ZUD.actions.work.text);
    }
    orbitYaw = smooth(orbitYaw, roomYaw, dt);
    orbitElevation = smooth(orbitElevation, roomElevation, dt);
    camera.position.set(cameraTarget.x+Math.sin(orbitYaw)*12,cameraTarget.y+Math.tan(orbitElevation)*12,cameraTarget.z+Math.cos(orbitYaw)*12);
    camera.lookAt(cameraTarget);
    const settledThere=pendingVisit&&(pendingVisit.bed?journey.intent==='bed'&&journey.phase==='resting':journey.intent==='visit'&&journey.phase==='idle');
    if(settledThere&&!journey.segment) {
      const item=pendingVisit;pendingVisit=null;
      // Pick the object up, then turn to the room (the plant keeps his attention).
      if(item.visit&&!item.visit.stay)journey.visit={...item.visit,heading:layout.idleHeading};
      if(item.action==='water')wateringItem=item;
      if(item.onArrive)item.onArrive();
      else {arrivedAction=true;perform(item.action);arrivedAction=false;}
      elapsed=0;
    }
    if(hovered&&!hovered.object.visible)hover(null);
    // Where each available object sits on screen, as the other data-* attributes.
    const targets=[];
    for(const item of retroRoom.interactables) {
      if(item.action==='clock'&&clockEditor.active)continue;
      const occupied=item===pendingVisit||(item.action==='work'&&journey.intent==='desk')||(item.bed&&journey.intent==='bed')||(item.action===state&&!journey.segment);
      const base=item.object.userData.baseScale,multiplier=item===hovered&&!occupied?item.lift??1.12:1;
      for(const axis of ['x','y','z'])item.object.scale[axis]=THREE.MathUtils.lerp(item.object.scale[axis],base[axis]*multiplier,1-Math.exp(-dt*14));
      if(!isVisible(item.object)||(!item.activate&&!item.onArrive&&!ZUD.actions[item.action]))continue;
      if(item.targetPoint)projected.copy(item.targetPoint()).project(camera);else item.object.getWorldPosition(projected).project(camera);
      targets.push(`${item.action}:${((projected.x*.5+.5)*100).toFixed(1)}:${((-projected.y*.5+.5)*100).toFixed(1)}`);
    }
    setData(stage,'targets',targets.join(' '));
    if(pendingDisco&&journey.phase==='idle'){beginDisco();elapsed=0;}
    const traveling = !['idle','typing','resting'].includes(journey.phase);
    // In bed: climbing in and lying there.
    const inBed = journey.pose.lying>0;
    const typingAtDesk = journey.phase === 'typing' && state === 'work';
    const workPose = state === 'work' && (typingAtDesk||journey.phase==='sitting');
    // Automatic routes feed the walk cycle with their real displacement too.
    const routeWalk=!movement.active&&['walking','returning'].includes(journey.phase);
    const routeStep=routeWalk?Math.hypot(journey.position.x-lastRoute.x,journey.position.z-lastRoute.z):0;
    lastRoute.copy(journey.position);
    const walkEnabled=movement.height===0&&Boolean(motion)&&(movement.active?state==='idle':routeWalk);
    const gait=walkCycle.update(movement.active?movement.stepDistance:routeStep,dt,walkEnabled,.56);
    setData(stage,'walkCycle',gait.weight>.02?'walking':'rest');
    const smoking=state==='smoke'&&!traveling;
    const disco=state==='disco'&&!traveling;
    const halloween=state==='halloween'&&!traveling;
    if(!halloween||lastCostumeAction!==actionStart)halloweenElapsed=0;
    if(halloween)halloweenElapsed+=dt;
    lastCostumeAction=actionStart;
    const puttingMask=halloween&&motion&&halloweenElapsed<.85;
    const wearing=(disco&&motion&&elapsed<.85)||puttingMask;
    // Watering aims at the pot's soil, expressed in the prop group's space.
    let waterTarget=null;
    if(state==='water') {
      root.updateMatrixWorld(true);
      waterTarget=(accessoryMount??root).worldToLocal(wateringItem?.plant.target()??retroRoom.soilPoint.clone());
    }
    // Smoke emission uses the hand's current pose; other props retain their
    // existing update order (the animator refines glasses while putting them on).
    const accessoryPose={state,time:t,elapsed,motion,traveling,halloweenElapsed,target:waterTarget,cycle:smoking?smokeCycle(motion?elapsed:0):null};
    if(pose.tick&&!smoking)accessories.update(accessoryPose);
    eyes.visible=!(disco&&!wearing)&&!(halloween&&(!motion||halloweenElapsed>.42));
    setData(stage,'accessory',smoking?'smoke':disco?'glasses':halloween?'mask':'none');
    setData(stage,'costumePhase',halloween?(puttingMask?'putting-on':'worn'):'none');
    let symbolText = state === 'sleep' ? 'z z Z' : ['dance','disco'].includes(state) ? '♪' : '';
    if(halloween&&motion&&halloweenElapsed>1.05&&halloweenElapsed<2.45)symbolText='¡Bú!';

    const sleepingEyes=inBed||(state==='sleep'&&!traveling);
    const blink = !sleepingEyes && (t % 5.3 > 5.15);
    // The pose (pivots, props in hand) updates on the twos clock, easing by the
    // time elapsed since its last tick; the chair and laptop keep the last desk reach.
    if(pose.tick)shownDesk=zudAnimator.update({state,time:t,elapsed,dt:reducedMotion.matches&&inBed?1:pose.dt,motion,traveling,
      typingAtDesk,workPose,wearing,halloweenElapsed,gait,
      jumping:movement.height>0,musicTime:music.time,musicPlaying:music.playing,
      blink,yaw:journey.heading,pitch:0,accessories,
      deskReach:layout.deskReach,workArmPitch:layout.workArmPitch,workLean:layout.workLean,sitLegPitch:layout.sitLegPitch,
      ...journey.pose}).desk;
    if(pose.tick&&smoking)accessories.update(accessoryPose);
    const desk=shownDesk;
    retroRoom.update(typingAtDesk,t,desk,{lying:journey.pose.lying,glasses:disco,cigarette:smoking,watering:state==='water'&&!traveling&&wateringItem?.entry.builtin,dt,reducedMotion:reducedMotion.matches});
    sceneInteractions.update({lying:journey.pose.lying,bedOpening:journey.bedOpening,wateringItem,watering:state==='water'&&!traveling,dt,reducedMotion:reducedMotion.matches});
    const floorSurface=footstepSurface(journey.position);
    setData(stage,'footstepSurface',floorSurface);
    sceneAudio.update({surface:floorSurface,daylight:retroRoom.cycle.daylight,blinds:retroRoom.blindAmount,disco:music.playing,
      typing:typingAtDesk,watering:state==='water'&&!traveling,
      stepDistance:movement.active?movement.stepDistance:routeStep,airborne:movement.height>0});
    const jumpCycle=state==='jump'&&!traveling&&motion?Math.floor(elapsed*1.25):-1;
    if(jumpCycle>=0&&jumpCycle!==lastJumpCycle){
      if(lastJumpCycle>=0)sceneAudio.play('jump-land',{volume:floorSurface==='carpet'?.15:.22,cooldown:.3});
      sceneAudio.play('jump',{volume:.24,cooldown:.3});
    }
    lastJumpCycle=jumpCycle;
    setData(stage,'plantGrowth',sceneInteractions.getGrowth(wateringItem).toFixed(3));
    setData(stage,'wateredObject',wateringItem?.entry.id??'');
    setData(stage,'blinds',retroRoom.blindsClosed?'closed':'open');
    setData(stage,'lamp',sceneInteractions.lights.on?'on':'off');
    setData(stage,'time',formatTime(retroRoom.timeOfDay));setData(stage,'dayPhase',retroRoom.cycle.phase);
    setText(clockLaunch,`◷ ${formatTime(retroRoom.timeOfDay)}`);
    followLight(dt,false);
    const airborne = Math.max(0, root.position.y - 1.34)+movement.height/ROOM_SCALE;
    shadow.material.opacity = 1 / (1 + airborne * 1.6);
    shadow.scale.setScalar(ROOM_SCALE * (1 + airborne * .18));
    shadow.position.set(actor.position.x, .12, actor.position.z + .08);
    if(typingAtDesk) shadow.material.opacity *= .5;
    markerLife=Math.max(0,markerLife-dt*1.6);marker.material.opacity=markerLife*.9;marker.visible=markerLife>0;
    marker.scale.setScalar(1+(1-markerLife)*.6);
    // Dreaming of cheesecake: a thought bubble above his head while asleep in bed.
    const resting=inBed&&journey.phase==='resting'&&state==='sleep';
    // Start the wait only after arrival in bed; waking or leaving rest clears
    // it. Use elapsed milliseconds, independent of frame rate or reduced motion.
    restingStartedAt=resting?(restingStartedAt??now):null;
    const dreaming=resting&&now-restingStartedAt>=3000;
    dreamBubble.update({visible:dreaming,dt,reducedMotion:reducedMotion.matches});
    setData(stage,'dream',dreaming?'cheesecake':'none');
    if(dreaming) {
      symbolText='';
      projected.set(0,.35,0); root.localToWorld(projected); projected.project(camera);
      const x=(projected.x*.5+.5)*stageWidth,y=(-projected.y*.5+.5)*stageHeight;
      setStyle(thought,'left',`${THREE.MathUtils.clamp(x-26,4,stageWidth-214)}px`);
      setStyle(thought,'top',`${Math.max(4,y-182)}px`);
    }
    setText(symbol,symbolText);
    if(symbolText){
      projected.set(0,2.8,0);root.localToWorld(projected);projected.project(camera);
      setStyle(symbol,'left',`${(projected.x*.5+.5)*100+5}%`);
      setStyle(symbol,'top',`${(-projected.y*.5+.5)*100}%`);
      setStyle(symbol,'transform',`translateY(${motion * Math.sin(t * 2) * 9}px) rotate(-12deg)`);
    }
    clockEditor.update(dt);
    nature.update(activeTime);
    lighting.update(activeTime,{room:true,daylight:retroRoom.daylight,cycle:retroRoom.cycle,reducedMotion:reducedMotion.matches,cloudTime:clouds.update()});
    setData(stage,'lighting','dynamic-diffuse');
    roomBatches.update();
    retroRoom.outside.render(renderer,camera);
    // The reflection refreshes at 30 Hz, or at once when the view moves (its
    // projection follows the camera, so a stale one would swim while orbiting).
    if(now-mirrorAt>=32||!camera.matrixWorld.equals(mirrorView)) {
      if(isVisible(retroRoom.mirror))retroRoom.mirror.renderReflection(renderer,scene,camera);
      mirrorAt=now;mirrorView.copy(camera.matrixWorld);
    }
    printPass.render(scene,camera,{samples:printSamples()});
  }
  let mirrorAt=-Infinity;const mirrorView=new THREE.Matrix4();
  // Adaptive resolution: slower GPUs keep their frame rate by drawing fewer
  // pixels. Cost follows the pixel count, so one step aims straight at ~55 fps.
  // A level that proved too slow is never tried again, and a drop that doesn't
  // help (the CPU is the limit) is undone. At the floor and still slow, the print
  // itself is the cost: the lite path takes over (once; the panel can undo it).
  // `?resolution=fixed` freezes all of this, for tests and for judging the look at true dpr.
  const fixedResolution=new URLSearchParams(location.search).get('resolution')==='fixed';
  const PIXEL_RATIO_FLOOR=.75;
  const maxRatio=Math.min(devicePixelRatio,2),intervals=[];
  let sampled=0,pixelRatio=maxRatio,ceiling=maxRatio,dropped=null,settleUntil=performance.now()+2000;
  setData(stage,'pixelRatio',pixelRatio.toFixed(2));
  const setRatio=next=>{
    pixelRatio=next;renderer.setPixelRatio(next);resize();setData(stage,'pixelRatio',next.toFixed(2));
    // The frame that reallocates the buffers is slow; don't judge the new level by it.
    settleUntil=performance.now()+500;intervals.length=0;sampled=0;
  };
  // MSAA only at full quality on low-density screens: from 1.5x the pixels
  // smooth the edges themselves, and a reduced level needs the time back.
  const printSamples=()=>pixelRatio>=1.5||pixelRatio<maxRatio?0:4;
  function adaptResolution(now,interval) {
    if(now<settleUntil)return;
    intervals.push(interval);sampled+=interval;
    // Decide about once a second (sooner on fast screens, never on too few frames).
    if(intervals.length<45&&(sampled<1000||intervals.length<4))return;
    const median=intervals.sort((a,b)=>a-b)[intervals.length>>1];intervals.length=0;sampled=0;
    if(dropped&&median>dropped.median*.95){setRatio(dropped.ratio);ceiling=0;dropped=null;return;}
    dropped=null;
    if(median>22&&pixelRatio<=PIXEL_RATIO_FLOOR+1e-6&&!retroStyle.lite&&retroStyle.look!=='normal') {
      console.info(`[retro] adaptive resolution is at its floor (median ${median.toFixed(1)} ms): switching to the lite print path`);
      retroStyle.setLite(true);settleUntil=performance.now()+1000;return;
    }
    if(median>22&&pixelRatio>PIXEL_RATIO_FLOOR&&ceiling) {
      ceiling=pixelRatio;dropped={ratio:pixelRatio,median};
      setRatio(Math.max(PIXEL_RATIO_FLOOR,Math.min(pixelRatio*.8,pixelRatio*Math.sqrt(18/median))));
    } else if(median<17.5&&pixelRatio*1.2<ceiling)setRatio(pixelRatio*1.2);
  }
  // The first frame starts in the right theme (a page opened at night is dark at once).
  camera.position.set(cameraTarget.x+Math.sin(orbitYaw)*12,cameraTarget.y+Math.tan(orbitElevation)*12,cameraTarget.z+Math.cos(orbitYaw)*12);camera.lookAt(cameraTarget);camera.updateMatrixWorld();
  retroRoom.update(false,0,0,{dt:1,reducedMotion:true});followLight(0,true);
  perform('idle');
  announce(ZUD.homeLine);
  workNavigation=createWorkNavigation({stage,canvas,onEnter:()=>perform('work'),onLeave:()=>perform('idle')});
  workNavigation.syncLocation();
  const roomBatches=createRoomBatches(retroRoom.room,{enabled:renderer.extensions.has('WEBGL_multi_draw'),exclude:[retroRoom.clock.object]});
  renderer.setAnimationLoop(animate);
  requestAnimationFrame(()=>{nature.load();retroRoom.outside.load();});
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); renderer.setAnimationLoop(null);music.stop();
    announce('La vista 3D se pausó. Recarga para volver a verme.');
  });
  setData(stage,'ready','true');
}
createWorld();
// Never leave the page blank if a texture stalls.
setTimeout(revealHouse,8000);
setData(stage,'state','idle');
