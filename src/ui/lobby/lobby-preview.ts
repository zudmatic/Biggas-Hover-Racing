import * as THREE from 'three';
import {createZudModel} from '../../content/characters/zud/zud-model';
import {equipZudWardrobe} from '../../content/characters/zud/zud-wardrobe';
import {zudHat} from '../../content/characters/hats/hat-catalog';
import {createFlightShip} from '../../content/vehicles/flight-ship';
import {shipConfig} from '../../content/vehicles/catalog';
import {pilotConfig,pilotPalette} from '../../content/characters/catalog';
import {createGameRenderer} from '../../render/game-renderer';
import {createComicView} from '../../render/comic-view';

// One small scene for the front end; disposed before loading a circuit.
export async function createFlightPreview(canvas,{reducedMotion,signal,initialKind='pilot',paper=true,vehicle='033',pilot='zud',palette='Original',hat='beanie',onStatus=()=>{}}){
  if(signal.aborted)return null;
  const renderer=await createGameRenderer(canvas,{alpha:true});
  if(signal.aborted){renderer.dispose();return null;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
  let paperEnabled=paper,rendering=false,renderTask=Promise.resolve(),frames=0,renderedKey=null,lastWidth=0,lastHeight=0;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,1,.1,100);
  const comic=createComicView(renderer,scene,camera,{samples:0,glowSamples:4});
  function renderScene(){
    if(disposed||rendering)return renderTask;
    rendering=true;const frameKey=actorKey(),canPresent=assetsReady();updateActors();
    const rect=canvas.getBoundingClientRect();
    if(rect.width&&rect.height&&(rect.width!==lastWidth||rect.height!==lastHeight)){lastWidth=rect.width;lastHeight=rect.height;renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();}
    renderTask=comic.render(paperEnabled,'#ffffff').then(()=>{canvas.dataset.paper=String(paperEnabled);canvas.dataset.frame=String(++frames);if(canPresent)renderedKey=frameKey;reportStatus();})
      .catch(error=>{if(!disposed){console.error(error);onStatus('fallback');}}).finally(()=>{rendering=false;});
    return renderTask;
  }
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
    renderTask.finally(()=>{
    scene.traverse(object=>{if(!object.isMesh)return;geometries.add(object.geometry);for(const material of [].concat(object.material)){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}});
    geometries.forEach(value=>value.dispose());materials.forEach(value=>value.dispose());textures.forEach(value=>value.dispose());
    pilots.forEach(actor=>actor.dispose());ships.forEach(ship=>ship.dispose());comic.dispose();renderer.dispose();});
  }
  function size(){if(disposed)return;if(rendering){dirty=true;return;}const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();frameCamera();dirty=true;renderScene();}
  const resize=new ResizeObserver(size);resize.observe(canvas);
  const hatFailures=new WeakSet();
  function activeActor(){return kind==='pilot'?pilots.get(selectedPilot):ships.get(vehicleKey())?.pilot.actor;}
  const actorKey=()=>`${activeId()}:${selectedHat}:${selectedPalette}:${paperEnabled}`;
  function ready(){return assetsReady()&&renderedKey===actorKey();}
  function assetsReady(){return !!actors[activeId()]&&(selectedPilot!=='zud'||activeActor()?.root.userData.hat===selectedHat);}
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
    if(pilot&&selectedPilot==='zud'&&selectedHat!=='beanie'&&assetsReady()){
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
    if(rendering)return;
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
      if(id.startsWith('pilot:'))pilots.get(id.slice(6))?.update?.(time);
      root.rotation.y=yaw+(reducedMotion.matches||drag?0:Math.sin(time*.45)*.12);
      root.position.y=floor[id]+(id.startsWith('vehicle:')?.22:0)+(reducedMotion.matches?0:Math.sin(time*(id.startsWith('pilot:')?1.8:1.2))*(id.startsWith('pilot:')?.025:.08));
    }
  }
  async function loadVehicle(){
    const requested=vehicleKey(),id=selectedVehicle,pilot=selectedPilot;
    if(ships.has(requested))return;
    if(!pending.has(requested))pending.set(requested,createFlightShip(id,{pilot,palette:selectedPalette,hat:selectedHat,exhaust:false}).then(ship=>{
      if(disposed||signal.aborted){ship.dispose();return;}
      ship.pilot.actor.setPalette?.(selectedPalette);ships.set(requested,ship);ship.update(0,0,false,true);addActor(requested,ship.root);applyHat(ship.pilot.actor);setKind(kind);
    }).catch(()=>{pending.delete(requested);if(!disposed&&requested===activeId())onStatus('fallback');}));
    await pending.get(requested);
  }
  function setVehicle(id){selectedVehicle=shipConfig(id).id;setKind(kind);return loadVehicle();}
  function setPilot(id,palette=selectedPalette,hat=selectedHat){
    selectedPilot=pilotConfig(id).id;selectedPalette=pilotPalette(palette).name;selectedHat=zudHat(hat).id;
    applyHat(zud);ships.forEach(ship=>applyHat(ship.pilot.actor));
    pilots.forEach(actor=>actor.setPalette?.(selectedPalette));ships.forEach(ship=>ship.pilot.actor.setPalette?.(selectedPalette));setKind(kind);
    const requestedPilot=selectedPilot,pilotKey=`pilot:${requestedPilot}`;
    const {load}=pilotConfig(requestedPilot);
    if(load&&!pilots.has(requestedPilot)&&!pending.has(pilotKey)){
      pending.set(pilotKey,load({palette:selectedPalette}).then(actor=>{
        if(disposed||signal.aborted){actor.dispose();return;}
        actor.setPalette?.(selectedPalette);pilots.set(requestedPilot,actor);addActor(pilotKey,actor.root);setKind(kind);
      }).catch(()=>{pending.delete(pilotKey);if(!disposed&&activeId()===pilotKey)onStatus('fallback');}));
    }
    void loadVehicle();
  }
  // Keep navigation responsive while the vehicle model loads in the background.
  canvas.addEventListener('graphicslost',()=>{renderer.setAnimationLoop(null);onStatus('fallback');},{signal});
  signal.addEventListener('abort',dispose,{once:true});
  setPilot(selectedPilot,selectedPalette);
  return {setKind,setVehicle,setPilot,setPaper(enabled){paperEnabled=enabled;dirty=true;if(canvas.clientWidth)renderScene();},dispose};
}
