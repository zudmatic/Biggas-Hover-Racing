import * as THREE from 'three';
import {createLocalExhaust} from './vfx/local-exhaust.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createShipCloth} from './ship-cloth.js';
import {createShipEyes} from './ship-eyes.js';
import {createSelectablePilot} from './selectable-pilot.js';
import {shipConfig,shipUrl,shipCanopy,prepareShipModel} from './ship-catalog.js';

export async function createFlightShip(id='033',choice={}){
  const config=shipConfig(id);
  const gltf=await new GLTFLoader().loadAsync(shipUrl(config.id)),source=gltf.scene;
  prepareShipModel(source,config);
  // Rigged parts (eye pivots, morphing lids and tongue) stay live; the rest is baked into batches.
  const live=[];if(config.liveNodes)source.traverse(node=>{if(config.liveNodes.test(node.name))live.push(node);});
  const liveParts=new Set();for(const node of live)node.traverse(part=>liveParts.add(part));
  const canopy=shipCanopy(source,config),excluded=new Set();if(config.removeCanopyInFlight)canopy?.traverse(o=>excluded.add(o));
  const batches=new Map(),clothBatches=new Map(),cloth=[],headlamps=new Map(),root=new THREE.Group();root.name=`${config.title} · vuelo`;root.userData.vehicle=config.id;
  source.traverse(mesh=>{
    if(!mesh.isMesh||excluded.has(mesh)||liveParts.has(mesh))return;
    let geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    if(geometry.index){const indexed=geometry;geometry=indexed.toNonIndexed();indexed.dispose();}
    for(const attribute of Object.keys(geometry.attributes))if(!['position','normal','uv'].includes(attribute))geometry.deleteAttribute(attribute);
    if(!geometry.attributes.uv)geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));
    let material=mesh.material;
    // Front lamp lenses share their source material with cockpit instruments.
    // Separate only the lamps so switching F never darkens Zud's dashboard.
    if(config.lampName?.test(mesh.name)){
      if(!headlamps.has(material)){const lamp=material.clone();lamp.emissiveIntensity=0;lamp.userData.headlight=true;headlamps.set(material,lamp);}
      material=headlamps.get(material);
    }
    const target=config.clothName?.test(mesh.name)?clothBatches:batches;
    if(!target.has(material))target.set(material,[]);
    target.get(material).push(geometry);
  });
  for(const [batch,dynamic] of [[batches,false],[clothBatches,true]])for(const [material,geometries] of batch){
    const geometry=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());
    const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
    if(dynamic){mesh.name='Bandera y flecos';cloth.push(createShipCloth(mesh));}
  }
  for(const node of live){root.attach(node);node.traverse(part=>{if(part.isMesh){part.castShadow=true;part.receiveShadow=true;}});}
  source.traverse(mesh=>{if(mesh.isMesh)mesh.geometry.dispose();});
  const eyes=config.eyes?createShipEyes(root,{...config.eyes,clips:gltf.animations}):null;
  const selectedPilot=choice.pilot??config.defaultPilot;
  const pilot=await createSelectablePilot({...choice,pilot:selectedPilot,offset:config.pilotOffsets?.[selectedPilot]??config.pilotOffset,fit:config.pilotFit});pilot.root.visible=true;root.add(pilot.root);
  const exhaust=choice.exhaust===false?{jets:[],update(){},dispose(){}}:createLocalExhaust(root,config.exhausts);
  return {root,pilot,config,exhaust,eyes,dispose(){
    exhaust.dispose();eyes?.dispose();
    pilot.dispose();const geometries=new Set(),materials=new Set(),textures=new Set();
    for(const tree of [source,root])tree.traverse(mesh=>{if(!mesh.isMesh)return;geometries.add(mesh.geometry);for(const material of [].concat(mesh.material)){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}});
    for(const material of headlamps.values())materials.add(material);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());root.removeFromParent();
  },setHeadlights(enabled){for(const [source,material] of headlamps)material.emissiveIntensity=enabled?source.emissiveIntensity:0;},update(time,speed,boost,reduced,state){
    pilot.update(Math.floor(time*24)/24,!reduced&&speed>1);
    for(const flag of cloth)flag.update(time,speed,boost,reduced);
    eyes?.update(time,state,reduced);
    exhaust.update(time,speed,boost,reduced,state);
  }};
}
