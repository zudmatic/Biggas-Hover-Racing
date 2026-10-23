import * as THREE from 'three';
import {isVisible} from './scene-document.js';
import {layout} from './home-layout.js';
import {ROOM_SCALE,RETRO_SPOTS} from './retro-room.js';
import {createSceneBed} from './scene-bed.js';
import {canStand,findWalkPath} from './home-movement.js';

// Lights follow the imported bulb geometry, including edited rotation and scale.
export function createPropLighting(room,doc) {
  const lamps=new Map();
  function dispose(lamp){lamp.light.removeFromParent();const index=room.lights.indexOf(lamp.light);if(index>=0)room.lights.splice(index,1);for(const emitter of lamp.emitters){if(emitter.mesh.material===emitter.material)emitter.mesh.material=emitter.source;emitter.material?.dispose();}}
  function sync(){
    for(const [id,lamp] of lamps)if(doc.entries.get(id)?.object!==lamp.object){dispose(lamp);lamps.delete(id);}
    for(const entry of doc.entries.values())if(['002','008'].includes(entry.model)&&!lamps.has(entry.id)){
      const emitters=[];
      entry.object.traverse(mesh=>{if(mesh.isMesh&&/horizontal tubular bulb|warm matte visible bulb/.test(mesh.name.replaceAll('_',' ')))emitters.push({mesh,source:mesh.material,material:null});});
      const light=new THREE.PointLight(0xffbc79,0,4,2);light.name='Luz automática de '+entry.label;entry.object.add(light);room.lights.push(light);
      entry.object.updateWorldMatrix(true,true);
      if(emitters[0]){
        const center=new THREE.Box3().setFromObject(emitters[0].mesh).getCenter(new THREE.Vector3());light.position.copy(entry.object.worldToLocal(center));light.position.y-=.04;
      }else light.position.set(0,.7,0);
      lamps.set(entry.id,{object:entry.object,light,emitters});
    }
  }
  return {sync,
    update(darkness){sync();for(const lamp of lamps.values()){
      const active=isVisible(lamp.object)?darkness:0;lamp.light.intensity=active*2.8;
      for(const emitter of lamp.emitters){
        if(emitter.mesh.material!==emitter.material){emitter.material?.dispose();emitter.source=emitter.mesh.material;emitter.material=emitter.source.clone();emitter.mesh.material=emitter.material;}
        emitter.material.emissive.set(0xffcc8a);emitter.material.emissiveIntensity=active*2.2;
      }
    }},
    get source(){return [...lamps.values()].find(l=>isVisible(l.object))?.light??room.lights[0];},
    get on(){return room.lights.some(light=>isVisible(light)&&light.intensity>.08&&light!==room.lights[1]);},
    dispose(){for(const lamp of lamps.values())dispose(lamp);lamps.clear();},
  };
}

// Pick a reachable place beside the *current* object, rather than its old slot.
export function visitForObject(object,origin=layout.home) {
  object.updateWorldMatrix(true,true);
  const bounds=new THREE.Box3().setFromObject(object),center=bounds.getCenter(new THREE.Vector3());
  const radius=Math.max(bounds.max.x-bounds.min.x,bounds.max.z-bounds.min.z)/2+layout.radius+.08;
  const candidates=[];
  for(let ring=0;ring<4;ring++)for(let i=0;i<32;i++){
    const angle=i/32*Math.PI*2,position=new THREE.Vector3(center.x+Math.cos(angle)*(radius+ring*.16),layout.home.y,center.z+Math.sin(angle)*(radius+ring*.16));
    if(canStand(position.x,position.z))candidates.push({position,heading:Math.atan2(center.x-position.x,center.z-position.z),stay:true});
  }
  candidates.sort((a,b)=>a.position.distanceToSquared(origin)-b.position.distanceToSquared(origin));
  const from=canStand(origin.x,origin.z)?origin:layout.stand;
  return candidates.find(candidate=>findWalkPath(from,candidate.position).length)??null;
}

function createGrowingPlant(entry) {
  const object=entry.object,leaves=[],soils=[];
  object.traverse(mesh=>{if(mesh.isMesh){if(/Succulent.*(?:leaf|bud)|^Fern /.test(mesh.name.replaceAll('_',' ')))leaves.push(mesh);if(/soil/i.test(mesh.name.replaceAll('_',' ')))soils.push(mesh);}});
  object.updateWorldMatrix(true,true);
  const soilBounds=new THREE.Box3();for(const mesh of soils)soilBounds.union(new THREE.Box3().setFromObject(mesh));
  const localSoil=soilBounds.isEmpty()?new THREE.Vector3(0,.25,0):object.worldToLocal(soilBounds.getCenter(new THREE.Vector3()).setY(soilBounds.max.y));
  const shoots=new THREE.Group();shoots.name='Crecimiento por riego';shoots.position.copy(localSoil);object.add(shoots);object.updateWorldMatrix(true,true);
  for(const mesh of leaves)shoots.attach(mesh);
  let growth=0,watered=false,wet=0;
  const soilMaterials=soils.map(mesh=>({mesh,source:mesh.material,material:null}));
  function update({watering=false,dt=0,reducedMotion=false}={}){
    watered ||= watering;if(watered)growth=reducedMotion?1:Math.min(1,growth+dt/2.4);
    shoots.scale.setScalar(THREE.MathUtils.lerp(.65,1,THREE.MathUtils.smoothstep(growth,0,1)));
    wet=watering?Math.min(1,wet+dt*1.5):Math.max(0,wet-dt*.12);
    for(const soil of soilMaterials){
      if(soil.mesh.material!==soil.material){soil.material?.dispose();soil.source=soil.mesh.material;soil.material=soil.source.clone();soil.mesh.material=soil.material;}
      soil.material.color.copy(soil.source.color).multiplyScalar(1-wet*.4);
    }
  }
  update();
  return {update,get growth(){return growth;},target:()=>object.localToWorld(localSoil.clone())};
}

// Approach the reflective face, including its saved rotation, instead of the
// nearest edge of the frame. Keep the character looking into the mirror.
export function visitForMirror(mirror,origin=layout.home) {
  mirror.updateWorldMatrix(true,false);
  const center=mirror.getWorldPosition(new THREE.Vector3());
  const normal=new THREE.Vector3(0,0,1).transformDirection(mirror.matrixWorld);
  normal.y=0;normal.normalize();
  if(normal.lengthSq()<.5)return null;
  const side=new THREE.Vector3(normal.z,0,-normal.x);
  const from=canStand(origin.x,origin.z)?origin:layout.stand;
  for(let distance=.85;distance<=1.8;distance+=.15)for(const offset of [0,.15,-.15,.3,-.3]){
    const position=center.clone().addScaledVector(normal,distance).addScaledVector(side,offset);position.y=layout.home.y;
    if(canStand(position.x,position.z)&&findWalkPath(from,position).length)
      return {position,heading:Math.atan2(center.x-position.x,center.z-position.z),stay:true};
  }
  return null;
}

export function createSceneInteractions(room,doc,{onLook=()=>{},onPlaceholder=()=>{}}={}) {
  const lights=createPropLighting(room,doc),plants=new Map(),beds=[];
  room.interactables=room.interactables.filter(item=>item.action!=='sleep'||isVisible(item.object));
  for(const item of room.interactables)if(item.bed)item.getVisit=()=>{
    layout.bed=RETRO_SPOTS.bed;
    return {position:layout.bed.side,heading:layout.bed.sideHeading,stay:true};
  };
  for(const entry of doc.entries.values())if(entry.model==='032'&&isVisible(entry.object)){
    const bed=createSceneBed(entry);beds.push(bed);room.interactables.push(bed.item);
  }
  const mirror=doc.entries.get('mirror');
  if(mirror&&isVisible(mirror.object))room.interactables.push({object:mirror.object,action:'look',label:'Look',lift:1,
    getVisit:origin=>visitForMirror(room.mirror,origin),onArrive:onLook});
  for(const entry of doc.entries.values()){
    const section=entry.id==='camera'?'Photos':null;
    if(section&&isVisible(entry.object))room.interactables.push({object:entry.object,action:section.toLowerCase(),label:section,
      targetPoint:()=>new THREE.Box3().setFromObject(entry.object).getCenter(new THREE.Vector3()),activate:()=>onPlaceholder(section)});
  }
  room.interactables=room.interactables.filter(item=>item.action!=='water');
  for(const entry of doc.entries.values())if(isVisible(entry.object)&&(entry.id==='plant'||['020','021'].includes(entry.model))){
    const plant=entry.builtin?{get growth(){return room.plantGrowth;},update(){},target:()=>entry.object.localToWorld(new THREE.Vector3(0,.61,0))}:createGrowingPlant(entry);
    const item={object:entry.object,action:'water',label:entry.model==='020'?'Water the succulent':entry.model==='021'?'Water the terrarium':'Water the plant',lift:1,plant,entry,
      getVisit:origin=>visitForObject(entry.object,origin),targetPoint:plant.target};
    room.interactables.push(item);plants.set(entry.id,item);
  }
  // Clock and handheld props remain interactive after movement, scaling or paint.
  for(const item of room.interactables)if(['smoke','disco'].includes(item.action))item.getVisit=origin=>{
    const visit=visitForObject(item.object,origin);if(visit)visit.stay=false;return visit;
  };
  return {lights,plants,
    update({wateringItem=null,watering=false,lying=0,bedOpening=0,dt=1/60,reducedMotion=false}={}){
      lights.update(1-room.daylight);
      for(const bed of beds){const active=layout.bed.object===bed.item.object;bed.update({lying:active?lying:0,opening:active?bedOpening:0});}
      for(const item of plants.values())item.plant.update({watering:watering&&wateringItem===item,dt,reducedMotion});
    },
    getGrowth:item=>item?.plant?.growth??room.plantGrowth,
  };
}

// Fit the swivel chair to Zud's proportions: his head is wider than his
// shoulders, so a human-sized seat center is not a safe sitting anchor.
export function configureSceneChair(room,doc) {
  const original=doc.entries.get('chair');
  const replacement=[...doc.entries.values()].find(entry=>entry.model==='001'&&isVisible(entry.object)&&(entry.replaces==='chair'||!original?.object.visible));
  const laptop=doc.entries.get('laptop')?.object;
  if(!replacement||!laptop||!isVisible(laptop))return null;
  const object=replacement.object;object.updateWorldMatrix(true,true);laptop.updateWorldMatrix(true,true);
  let seat=null,piston=null;const upper=[];
  object.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const name=mesh.name.replaceAll('_',' ');
    if(/terracotta upholstered seat/.test(name))seat=mesh;
    if(/exposed pneumatic piston/.test(name))piston=mesh;
    // The seat, back and armrests move together on the adjustable column.
    if(/seat|back|armrest|height|piston upper|underside tilt/.test(name))upper.push(mesh);
  });
  if(!seat)return null;
  const before=new THREE.Box3().setFromObject(object);
  const seatBox=new THREE.Box3().setFromObject(seat,true);
  const laptopPoint=laptop.getWorldPosition(new THREE.Vector3());
  // Keep the chin above the keyboard, with hands resting on the laptop deck.
  const lift=Math.max(0,laptopPoint.y-.192-seatBox.max.y);
  for(const mesh of upper){
    const position=mesh.getWorldPosition(new THREE.Vector3());position.y+=lift;
    mesh.position.copy(mesh.parent.worldToLocal(position));
  }
  if(piston&&lift){
    const box=new THREE.Box3().setFromObject(piston,true),height=box.max.y-box.min.y;
    piston.scale.y*=1+lift/height;
    const position=piston.getWorldPosition(new THREE.Vector3());position.y+=lift/2;
    piston.position.copy(piston.parent.worldToLocal(position));
  }
  object.updateWorldMatrix(true,true);
  const direction=new THREE.Vector3(0,0,1).applyQuaternion(object.getWorldQuaternion(new THREE.Quaternion()));direction.y=0;direction.normalize();
  const box=new THREE.Box3().setFromObject(seat,true),point=box.getCenter(new THREE.Vector3());
  // Keep the pelvis over the cushion. The work pose leans from the hips,
  // bringing the head forward without leaving the body perched off the edge.
  point.addScaledVector(direction,.23);
  // Pull the chair out instead of rolling the face into the laptop.
  const pull=laptopPoint.clone().sub(point).dot(direction)-.485;
  object.position.addScaledVector(direction,pull);point.addScaledVector(direction,pull);
  point.y=box.max.y-(1.30-1.015)*ROOM_SCALE+.035;
  object.updateWorldMatrix(true,true);
  // Navigation must use the fitted chair, not its saved, pushed-in footprint.
  const matches=obstacle=>obstacle.every((value,i)=>Math.abs(value-[before.min.x,before.max.x,before.min.z,before.max.z][i])<.001);
  layout.obstacles=layout.obstacles.filter(obstacle=>!matches(obstacle));
  const bounds=new THREE.Box3().setFromObject(object,true);
  layout.obstacles.push([bounds.min.x,bounds.max.x,bounds.min.z,bounds.max.z]);
  // Approach from a side: the nearest radial point is usually behind the
  // backrest, which sends the beanie through it on the way onto the seat.
  const side=new THREE.Vector3(direction.z,0,-direction.x),center=bounds.getCenter(new THREE.Vector3());
  const halfWidth=(bounds.max.x-bounds.min.x)*Math.abs(side.x)/2+(bounds.max.z-bounds.min.z)*Math.abs(side.z)/2;
  const approaches=[];
  for(const sign of [-1,1])for(let ring=0;ring<4;ring++){
    const position=center.clone().addScaledVector(direction,-.18).addScaledVector(side,sign*(halfWidth+layout.radius+.04+ring*.08));position.y=layout.home.y;
    if(canStand(position.x,position.z)&&findWalkPath(layout.home,position).length)approaches.push(position);
  }
  approaches.sort((a,b)=>a.distanceToSquared(layout.home)-b.distanceToSquared(layout.home));
  if(!approaches.length)return null;
  const visit={position:approaches[0]};
  layout.seated=point;layout.chair=visit.position.clone();layout.stand=visit.position.clone();layout.aisle=visit.position.clone();layout.sitHeading=Math.atan2(direction.x,direction.z);
  layout.deskReach=0;layout.workArmPitch=-1.35;layout.workLean=.30;layout.sitLegPitch=-1.85;
  return {object};
}
