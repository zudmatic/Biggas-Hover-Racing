import * as THREE from 'three';
import {createZudModel} from './zud-model.js';
import {equipZudWardrobe} from './zud-wardrobe.js';
import {zudHat} from './hat-catalog.js';
import {createFlightShip} from './flight-ship.js';
import {shipConfig} from './ship-catalog.js';
import {pilotConfig,pilotPalette} from './pilot-catalog.js';
import {createCharacterComic} from './character-comic.js';

// One small scene for the front end; disposed before loading a circuit.
export async function createFlightPreview(canvas,{reducedMotion,signal,initialKind='pilot',paper=true,vehicle='033',pilot='zud',palette='Original',hat='beanie',onStatus=()=>{}}){
  if(signal.aborted)return null;
  const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
  const comic=createCharacterComic(renderer,{samples:0,glowSamples:4});let paperEnabled=paper;
  function renderScene(){updateActors();if(paperEnabled)comic.render(scene,camera,'#ffffff');else renderer.render(scene,camera);canvas.dataset.paper=String(paperEnabled);}
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,1,.1,100);
  scene.add(new THREE.HemisphereLight(0xffffff,0x747474,3));
  const key=new THREE.DirectionalLight(0xffe2b7,4);key.position.set(-4,7,6);scene.add(key);
  const rim=new THREE.DirectionalLight(0xd5e4ff,2);rim.position.set(5,4,-4);scene.add(rim);
  const pedestal=new THREE.Group();scene.add(pedestal);
  const shadow=new THREE.Mesh(new THREE.CircleGeometry(1.9,48),new THREE.MeshBasicMaterial({color:0x171717,transparent:true,opacity:.22,depthWrite:false}));
  shadow.rotation.x=-Math.PI/2;shadow.position.y=-.04;shadow.scale.y=.76;pedestal.add(shadow);
  const zud=equipZudWardrobe(createZudModel({detail:'medium',curve:0,comic:false}));zud.laptop.visible=false;
  const actors={},floor={},ships=new Map(),pilots=new Map([['zud',zud]]),pending=new Map();let selectedVehicle=shipConfig(vehicle).id,selectedPilot=pilotConfig(pilot).id,selectedPalette=pilotPalette(palette).name,selectedHat=zudHat(hat).id;const vehicleKey=()=>`vehicle:${selectedVehicle}:${selectedPilot}`;const activeId=()=>kind==='pilot'?`pilot:${selectedPilot}`:vehicleKey();let disposed=false,kind=initialKind,yaw=0,drag=null,time=0,last=performance.now(),dirty=true;
  function addActor(id,root){
    const bounds=new THREE.Box3().setFromObject(root),center=bounds.getCenter(new THREE.Vector3());
    root.position.x-=center.x;root.position.z-=center.z;root.position.y-=bounds.min.y;
    floor[id]=root.position.y;scene.add(root);root.visible=id===activeId();actors[id]=root;
  }
  addActor('pilot:zud',zud.root);
  const geometries=new Set(),materials=new Set(),textures=new Set();
  function dispose(){
    if(disposed)return;disposed=true;renderer.setAnimationLoop(null);resize.disconnect();
    scene.traverse(object=>{if(!object.isMesh)return;geometries.add(object.geometry);for(const material of [].concat(object.material)){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}});
    geometries.forEach(value=>value.dispose());materials.forEach(value=>value.dispose());textures.forEach(value=>value.dispose());
    pilots.forEach(actor=>actor.dispose());ships.forEach(ship=>ship.dispose());comic.dispose();renderer.dispose();renderer.forceContextLoss();
  }
  function size(){if(disposed)return;const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();frameCamera();dirty=true;renderScene();}
  const resize=new ResizeObserver(size);resize.observe(canvas);
  const hatFailures=new WeakSet();
  function activeActor(){return kind==='pilot'?pilots.get(selectedPilot):ships.get(vehicleKey())?.pilot.actor;}
  function ready(){return !!actors[activeId()]&&(selectedPilot!=='zud'||activeActor()?.root.userData.hat===selectedHat);}
  function reportStatus(){
    canvas.dataset.ready=String(ready());
    onStatus(ready()?'ready':activeActor()&&hatFailures.has(activeActor())?'fallback':'loading');
  }
  function applyHat(actor){
    if(!actor.setHat)return;
    hatFailures.delete(actor);const requested=selectedHat;
    actor.setHat(requested).then(()=>{if(!disposed)setKind(kind);}).catch(()=>{
      if(disposed||requested!==selectedHat)return;hatFailures.add(actor);reportStatus();
    });
  }
  function frameCamera(){const pilot=kind==='pilot',distance=Math.max(pilot?7.5:10.8,(pilot?4.2:6.8)/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect));camera.position.set(0,pilot?2.35:4.7,distance);camera.lookAt(0,pilot?1.5:1.7,0);
    if(pilot&&selectedPilot==='zud'&&selectedHat!=='beanie'&&ready()){
      const bounds=new THREE.Box3();zud.root.updateWorldMatrix(true,true);zud.root.traverseVisible(mesh=>{if(mesh.isMesh)bounds.expandByObject(mesh);});
      const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
      const distance=Math.max(size.y,size.x/camera.aspect)/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)))*1.18+size.z*.5;
      camera.position.set(0,center.y+.5,distance);camera.lookAt(0,center.y,0);
    }
  }
  function setKind(next){kind=next==='pilot'?'pilot':'vehicle';yaw=kind==='pilot'?-.14:.52;for(const [id,root] of Object.entries(actors))root.visible=id===activeId();canvas.dataset.kind=kind;canvas.dataset.vehicle=selectedVehicle;canvas.dataset.pilot=selectedPilot;canvas.dataset.palette=selectedPalette;canvas.dataset.hat=selectedHat;frameCamera();pedestal.scale.setScalar(kind==='pilot'?.83:1.24);dirty=true;size();reportStatus();}
  canvas.addEventListener('pointerdown',event=>{if(drag!==null)return;drag={id:event.pointerId,x:event.clientX};canvas.setPointerCapture(event.pointerId);},{signal});
  canvas.addEventListener('pointermove',event=>{if(event.pointerId!==drag?.id)return;yaw+=(event.clientX-drag.x)*.009;drag.x=event.clientX;dirty=true;},{signal});
  const release=event=>{if(event.pointerId===drag?.id)drag=null;};
  for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,release,{signal});
  reducedMotion.addEventListener('change',()=>{dirty=true;},{signal});
  setKind(initialKind);
  renderer.setAnimationLoop(now=>{
    if(disposed||document.hidden||!canvas.clientWidth||!canvas.clientHeight){last=now;return;}
    if(!dirty&&now-last<1000/(drag?60:30))return;
    const dt=Math.min((now-last)/1000,.05);last=now;
    if(!reducedMotion.matches)time+=dt;
    if(reducedMotion.matches&&!dirty)return;dirty=false;
    renderScene();
  });
  // Apply the final pose before every render, including the first visible frame.
  function updateActors(){
    for(const [id,root] of Object.entries(actors)){
      if(!root.visible)continue;
      if(id.startsWith('vehicle:'))ships.get(id)?.update(time,0,false,reducedMotion.matches);
      if(id==='pilot:zudmatic')pilots.get('zudmatic')?.update(time);
      root.rotation.y=yaw+(reducedMotion.matches||drag?0:Math.sin(time*.45)*.12);
      root.position.y=floor[id]+(id.startsWith('vehicle:')?.22:0)+(reducedMotion.matches?0:Math.sin(time*(id.startsWith('pilot:')?1.8:1.2))*(id.startsWith('pilot:')?.025:.08));
    }
  }
  async function loadVehicle(){
    const requested=vehicleKey(),id=selectedVehicle,pilot=selectedPilot;
    if(ships.has(requested))return;
    if(!pending.has(requested))pending.set(requested,createFlightShip(id,{pilot,palette:selectedPalette,hat:selectedHat}).then(ship=>{
      if(disposed||signal.aborted){ship.dispose();return;}
      ship.pilot.actor.setPalette?.(selectedPalette);ships.set(requested,ship);ship.update(0,0,false,true);addActor(requested,ship.root);applyHat(ship.pilot.actor);setKind(kind);
    }).catch(()=>{pending.delete(requested);if(!disposed&&requested===activeId())onStatus('fallback');}));
    await pending.get(requested);
  }
  function setVehicle(id){selectedVehicle=shipConfig(id).id;setKind(kind);return loadVehicle();}
  function setPilot(id,palette=selectedPalette,hat=selectedHat){
    selectedPilot=pilotConfig(id).id;selectedPalette=pilotPalette(palette).name;selectedHat=zudHat(hat).id;
    applyHat(zud);ships.forEach(ship=>applyHat(ship.pilot.actor));
    pilots.get('zudmatic')?.setPalette(selectedPalette);ships.forEach(ship=>ship.pilot.actor.setPalette?.(selectedPalette));setKind(kind);
    if(selectedPilot==='zudmatic'&&!pilots.has('zudmatic')&&!pending.has('pilot:zudmatic')){
      pending.set('pilot:zudmatic',import('./zudmatic-model.js').then(({createZudmaticModel})=>createZudmaticModel({palette:selectedPalette})).then(actor=>{
        if(disposed||signal.aborted){actor.dispose();return;}
        actor.setPalette(selectedPalette);pilots.set('zudmatic',actor);addActor('pilot:zudmatic',actor.root);setKind(kind);
      }).catch(()=>{pending.delete('pilot:zudmatic');if(!disposed&&activeId()==='pilot:zudmatic')onStatus('fallback');}));
    }
    void loadVehicle();
  }
  // Keep navigation responsive while the vehicle model loads in the background.
  signal.addEventListener('abort',dispose,{once:true});
  setPilot(selectedPilot,selectedPalette);
  return {setKind,setVehicle,setPilot,setPaper(enabled){paperEnabled=enabled;dirty=true;if(canvas.clientWidth)renderScene();},dispose};
}
