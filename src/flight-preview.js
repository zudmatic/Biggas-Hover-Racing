import * as THREE from 'three';
import {createZudModel} from './zud-model.js';
import {createFlightShip} from './flight-ship.js';
import {shipConfig} from './ship-catalog.js';
import {createCharacterComic} from './character-comic.js';

// One small scene for the front end; disposed before loading a circuit.
export async function createFlightPreview(canvas,{reducedMotion,signal,initialKind='pilot',paper=true,vehicle='033',onStatus=()=>{}}){
  const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
  const comic=createCharacterComic(renderer,{samples:0,glowSamples:4});let paperEnabled=paper;
  function renderScene(){if(paperEnabled)comic.render(scene,camera,'#ffffff');else renderer.render(scene,camera);canvas.dataset.paper=String(paperEnabled);}
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,1,.1,100);
  scene.add(new THREE.HemisphereLight(0xffffff,0x747474,3));
  const key=new THREE.DirectionalLight(0xffe2b7,4);key.position.set(-4,7,6);scene.add(key);
  const rim=new THREE.DirectionalLight(0xd5e4ff,2);rim.position.set(5,4,-4);scene.add(rim);
  const pedestal=new THREE.Group();scene.add(pedestal);
  const shadow=new THREE.Mesh(new THREE.CircleGeometry(1.9,48),new THREE.MeshBasicMaterial({color:0x171717,transparent:true,opacity:.22,depthWrite:false}));
  shadow.rotation.x=-Math.PI/2;shadow.position.y=-.04;shadow.scale.y=.76;pedestal.add(shadow);
  const zud=createZudModel({detail:'medium',curve:0,comic:false});zud.laptop.visible=false;
  const actors={pilot:zud.root},floor={},ships=new Map(),pending=new Map();let selectedVehicle=shipConfig(vehicle).id;const activeId=()=>kind==='pilot'?'pilot':`vehicle:${selectedVehicle}`;let disposed=false,kind=initialKind,yaw=0,drag=null,time=0,last=performance.now(),dirty=true;
  function addActor(id,root){
    const bounds=new THREE.Box3().setFromObject(root),center=bounds.getCenter(new THREE.Vector3());
    root.position.x-=center.x;root.position.z-=center.z;root.position.y-=bounds.min.y;
    floor[id]=root.position.y;scene.add(root);root.visible=id===activeId();actors[id]=root;
  }
  addActor('pilot',zud.root);
  const geometries=new Set(),materials=new Set(),textures=new Set();
  function dispose(){
    if(disposed)return;disposed=true;renderer.setAnimationLoop(null);resize.disconnect();
    scene.traverse(object=>{if(!object.isMesh)return;geometries.add(object.geometry);for(const material of [].concat(object.material)){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}});
    geometries.forEach(value=>value.dispose());materials.forEach(value=>value.dispose());textures.forEach(value=>value.dispose());
    zud.dispose();ships.forEach(ship=>ship.dispose());comic.dispose();renderer.dispose();renderer.forceContextLoss();
  }
  function size(){if(disposed)return;const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();frameCamera();dirty=true;renderScene();}
  const resize=new ResizeObserver(size);resize.observe(canvas);
  function frameCamera(){const pilot=kind==='pilot',distance=Math.max(pilot?7.5:10.8,(pilot?4.2:6.8)/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect));camera.position.set(0,pilot?2.35:4.7,distance);camera.lookAt(0,pilot?1.5:1.7,0);}
  function setKind(next){kind=next==='pilot'?'pilot':'vehicle';yaw=kind==='pilot'?-.14:.52;for(const [id,root] of Object.entries(actors))root.visible=id===activeId();canvas.dataset.vehicle=selectedVehicle;canvas.dataset.ready=String(!!actors[activeId()]);onStatus(actors[activeId()]?'ready':'loading');frameCamera();pedestal.scale.setScalar(kind==='pilot'?.83:1.24);dirty=true;size();}
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
    for(const [id,root] of Object.entries(actors)){
      if(!root.visible)continue;
      root.rotation.y=yaw+(reducedMotion.matches||drag?0:Math.sin(time*.45)*.12);
      root.position.y=floor[id]+(id.startsWith('vehicle:')?.22:0)+(reducedMotion.matches?0:Math.sin(time*(id==='pilot'?1.8:1.2))*(id==='pilot'?.025:.08));
    }
    renderScene();
  });
  async function setVehicle(id){
    selectedVehicle=shipConfig(id).id;const requested=selectedVehicle;setKind(kind);
    if(ships.has(requested))return;
    if(!pending.has(requested))pending.set(requested,createFlightShip(requested).then(ship=>{
      if(disposed||signal.aborted){ship.dispose();return;}
      ships.set(requested,ship);ship.update(0,0,false,true);addActor(`vehicle:${requested}`,ship.root);
      setKind(kind);
    }).catch(error=>{pending.delete(requested);if(!disposed&&requested===selectedVehicle&&kind==='vehicle')onStatus('fallback');}));
    await pending.get(requested);
  }
  await setVehicle(selectedVehicle);
  if(signal.aborted){dispose();return null;}
  return {setKind,setVehicle,setPaper(enabled){paperEnabled=enabled;dirty=true;if(canvas.clientWidth)renderScene();},dispose};
}
