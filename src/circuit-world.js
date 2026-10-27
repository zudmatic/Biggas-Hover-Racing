import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createCircuitTextures} from './circuit-textures.js';
import {createCircuitDetails} from './circuit-details.js';
import {createCircuitLandscape} from './circuit-physics.js';

import {circuitMap} from './circuit-maps.js';
import {collisionMaterials,createSurfaceIndex,createCityCollision} from './circuit-collision.js';
import {createNexusDetails} from './nexus-details.js';
import {loadFlightFx} from './flight-fx.js';
export const createRoadSurface=createSurfaceIndex;

export async function createCircuitWorld({onProgress=()=>{},mobile=false,anisotropy=4,map='ruins',fxMaterialFactory,underglow}={}){
  const config=circuitMap(map),city=config.id==='nexus',base=`${import.meta.env.BASE_URL}models/${config.folder}/`,loader=new GLTFLoader(),colliderLoader=new GLTFLoader().register(collisionMaterials);
  const json=async file=>{const response=await fetch(base+file);if(!response.ok)throw new Error(`Circuito: ${response.status} ${file}`);return response.json();};
  const results=await Promise.allSettled([loader.loadAsync(base+config.model,e=>{if(e.total)onProgress(e.loaded/e.total*.8);}),colliderLoader.loadAsync(base+config.collider),json('route_gltf.json'),json('gameplay.json')]);
  const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
  const [asset,colliders,route,gameplay]=results.map(r=>r.value),landscape=createCircuitLandscape(route,gameplay),root=new THREE.Group();root.name=`${config.name} ${config.number}`;landscape.map=config.id;landscape.physicalBoundaries=!!config.physicalBoundaries;
  const textures=createCircuitTextures({anisotropy}),anchors=[];const bounds=new THREE.Box3();
  asset.scene.updateMatrixWorld(true);const batches=new Map(),originalGeometries=new Set(),startLights=[];
  asset.scene.traverse(mesh=>{
    if(!mesh.isMesh)return;originalGeometries.add(mesh.geometry);
    let geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    if(geometry.index){const old=geometry;geometry=old.toNonIndexed();old.dispose();}
    for(const key of Object.keys(geometry.attributes))if(!['position','normal','uv','color'].includes(key))geometry.deleteAttribute(key);
    const prepared=new THREE.Mesh(geometry,mesh.material);textures.apply(prepared);
    if(!geometry.attributes.uv)geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));
    if(city&&/^CITY_.*__cement$/.test(mesh.name)){geometry.computeBoundingBox();const box=geometry.boundingBox.clone(),p=geometry.attributes.position,n=geometry.attributes.normal;let area=0,position=null;
      for(let i=0;i<p.count;i+=3){if(n.getY(i)<.8||p.getY(i)<box.max.y-(box.max.y-box.min.y)*.25)continue;const a=Math.abs((p.getX(i+1)-p.getX(i))*(p.getZ(i+2)-p.getZ(i))-(p.getZ(i+1)-p.getZ(i))*(p.getX(i+2)-p.getX(i)));if(a>area){area=a;position=new THREE.Vector3((p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,p.getY(i),(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3);}}
      if(position&&area>12)anchors.push({name:mesh.name,box,position});}
    if(/^Start_light/.test(mesh.name)){const light=new THREE.Mesh(geometry,mesh.material.clone());light.material.emissiveIntensity=1.2;root.add(light);startLights.push(light);return;}
    geometry.computeBoundingBox();geometry.boundingBox.getCenter(bounds.min);
    const cell=city?`${Math.floor(bounds.min.x/80)},${Math.floor(bounds.min.z/80)}`:'all',key=`${mesh.material.uuid}:${cell}`;
    if(!batches.has(key))batches.set(key,{material:mesh.material,parts:[]});batches.get(key).parts.push(geometry);
  });
  for(const {material,parts} of batches.values()){
    const mesh=new THREE.Mesh(mergeGeometries(parts),material);parts.forEach(g=>g.dispose());mesh.name=material.name;mesh.geometry.userData.circuitUV=true;
    mesh.castShadow=!/water|foam|fall|glazing|Terrain/i.test(material.name);mesh.receiveShadow=true;root.add(mesh);
  }
  originalGeometries.forEach(g=>g.dispose());
  const floor=colliders.scene.getObjectByName(config.surface);if(!floor)throw new Error('Falta la superficie de pista.');
  const collision=config.physicalBoundaries?createCityCollision(colliders.scene):null,surfaceHeight=collision?.surfaceHeight??createRoadSurface(floor);
  colliders.scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
  const details=createCircuitDetails(root,landscape,{mobile,city,islands:config.id==='ruins',underglow});
  const urban=city?createNexusDetails(root,anchors,{mobile}):null;textures.applyRoot(root);
  const fx=await loadFlightFx(root,{surfaceHeight,mobile,materialFactory:fxMaterialFactory});
  onProgress(1);
  return {root,landscape,textures,surfaceHeight,fx,clipCamera:collision?.clipCamera,detailCount:details.detailCount+(urban?.detailCount??0),step(state,dt,previous){collision?.step(state,dt,landscape,previous);details.step(state,dt);},reset(){details.reset();fx.reset();},update(time,reduced,context){
    details.update(time,reduced,context);urban?.update(time,reduced,context);
    fx.update(context.dt??0,{...context,reduced});
    const running=context.phase==='flying';
    if(context.phase!=='paused')startLights.forEach(light=>{const lit=running;const color=running?0x65dd9a:0x4b5c51;light.material.color.setHex(color);light.material.emissive.setHex(lit?color:0x000000);});
  },dispose(){
    fx.dispose();
    const geometries=new Set(),materials=new Set();root.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.geometry&&o.material){geometries.add(o.geometry);materials.add(o.material);}});geometries.forEach(g=>g.dispose());const authored=new Set();materials.forEach(m=>{if(m.map&&!m.userData.circuitSurface)authored.add(m.map);m.dispose();});authored.forEach(t=>t.dispose());textures.dispose();collision?.dispose();
  }};
}
