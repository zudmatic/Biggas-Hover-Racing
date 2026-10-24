import * as THREE from 'three';
import {createFlightExhaust} from './flight-exhaust.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createSelectablePilot} from './selectable-pilot.js';
import {shipConfig,shipUrl,shipCanopy} from './ship-catalog.js';

export async function createFlightShip(id='033',choice={}){
  const config=shipConfig(id);
  const source=(await new GLTFLoader().loadAsync(shipUrl(config.id))).scene;
  source.updateMatrixWorld(true);
  const canopy=shipCanopy(source,config),excluded=new Set();if(config.removeCanopyInFlight)canopy?.traverse(o=>excluded.add(o));
  const batches=new Map(),headlamps=new Map(),root=new THREE.Group();root.name=`${config.title} · vuelo`;root.userData.vehicle=config.id;
  source.traverse(mesh=>{
    if(!mesh.isMesh||excluded.has(mesh))return;
    let geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    if(geometry.index){const indexed=geometry;geometry=indexed.toNonIndexed();indexed.dispose();}
    for(const attribute of Object.keys(geometry.attributes))if(!['position','normal','uv'].includes(attribute))geometry.deleteAttribute(attribute);
    if(!geometry.attributes.uv)geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));
    let material=mesh.material;
    // Front lamp lenses share their source material with cockpit instruments.
    // Separate only the lamps so switching F never darkens Zud's dashboard.
    if(config.lampName.test(mesh.name)){
      if(!headlamps.has(material)){const lamp=material.clone();lamp.emissiveIntensity=0;lamp.userData.headlight=true;headlamps.set(material,lamp);}
      material=headlamps.get(material);
    }
    if(!batches.has(material))batches.set(material,[]);
    batches.get(material).push(geometry);
  });
  for(const [material,geometries] of batches){
    const geometry=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());
    const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
  }
  source.traverse(mesh=>{if(mesh.isMesh)mesh.geometry.dispose();});
  const pilot=await createSelectablePilot({...choice,offset:config.pilotOffset});pilot.root.visible=true;root.add(pilot.root);
  const exhaust=createFlightExhaust(root,config.exhausts);
  return {root,pilot,config,exhaust,dispose(){
    exhaust.dispose();
    pilot.dispose();const geometries=new Set(),materials=new Set(),textures=new Set();
    for(const tree of [source,root])tree.traverse(mesh=>{if(!mesh.isMesh)return;geometries.add(mesh.geometry);for(const material of [].concat(mesh.material)){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}});
    for(const material of headlamps.values())materials.add(material);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());root.removeFromParent();
  },setHeadlights(enabled){for(const [source,material] of headlamps)material.emissiveIntensity=enabled?source.emissiveIntensity:0;},update(time,speed,boost,reduced,state){
    pilot.update(Math.floor(time*24)/24,!reduced&&speed>1);
    exhaust.update(time,speed,boost,reduced,state);
  }};
}
