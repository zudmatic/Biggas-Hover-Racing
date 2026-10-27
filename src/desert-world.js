import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {createCircuitLandscape} from './circuit-physics.js';
import {createCityCollision,createSurfaceIndex} from './circuit-collision.js';
import {loadFlightFx} from './flight-fx.js';
import {createWater} from './water/water.ts';
import {createDesertWaterContact} from './water/desert-contact.js';
import {applyDesertWaterPreset} from './water/preset.ts';
import {partitionDesertInstances} from './desert-instances.js';
import {createDesertRoute,DESERT_START} from './desert-route.js';
import {DESERT_JUMPS} from './desert-handling.js';
import {createDesertWaterSurface,RIVER_SURFACE} from './water/desert-surface.js';
import {createHoverWaterEffects} from './water/hover-effects.js';
import {createDesertTrain} from './desert-train.js';
import {createDesertTrainAudio} from './desert-train-audio.js';
import {createDesertLod} from './desert-lod.js';
import {extractDesertRuntimeData} from './desert-asset.js';

// Keep the authored scene hierarchy and EXT_mesh_gpu_instancing. The legacy
// circuit batcher bakes only a mesh's base geometry, losing instance transforms.
export async function createDesertWorld({onProgress=()=>{},mobile=false,anisotropy=4,fxMaterialFactory}={}){
  const base=import.meta.env.BASE_URL,path=`${base}models/desert-valley/`;
  const draco=new DRACOLoader().setDecoderPath(`${base}draco/`);
  const loader=new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
  const json=async name=>{const response=await fetch(path+name);if(!response.ok)throw new Error(`Desert Valley: ${response.status} ${name}`);return response.json();};
  let asset,trainAsset,guides,legacyGameplay,railway;
  try{
    [asset,trainAsset,guides,legacyGameplay,railway]=await Promise.all([
      loader.loadAsync(`${path}desert-valley-map.glb`,e=>{if(e.total)onProgress(e.loaded/e.total*.75);}),
      loader.loadAsync(`${path}freight-train-40-game.glb`),json('driving-guides.json'),json('gameplay.json'),json('railway.json'),
    ]);
  }finally{draco.dispose();}
  const root=asset.scene;root.name='Desert Valley 039';
  const {details:detailAsset,collisions:collisionInputs,placed:placedDetails,manifest:detailManifest}=extractDesertRuntimeData(asset);
  if(!detailAsset||!detailManifest?.families)throw new Error('Desert Valley: faltan los detalles del mapa unificado.');
  // Ordinary viewers use the complete default scene. The game swaps its near
  // detail instances for adaptive LOD batches, while collision-only originals
  // and reusable prototypes are stored outside that visible scene.
  placedDetails?.removeFromParent();detailAsset.removeFromParent();
  if(collisionInputs)root.add(collisionInputs);
  root.updateMatrixWorld(true);
  partitionDesertInstances(root);
  let station=null;root.traverse(node=>{if(node.userData.source_object===DESERT_START.sourceObject)station=node;});
  const stationPosition=station?new THREE.Box3().setFromObject(station).getCenter(new THREE.Vector3()).toArray():DESERT_START.fallbackPosition;
  const {route,gameplay}=createDesertRoute(guides,legacyGameplay,stationPosition);
  const landscape=createCircuitLandscape(route,gameplay);
  Object.assign(landscape,{map:'desert-valley',mapHalf:437.5,physicalBoundaries:true,allowJumps:true,jumpSettings:DESERT_JUMPS});
  landscape.shortcut=route.shortcut;
  if(import.meta.env.DEV){
    const sections={bridge:5,river:7,valley:2},key=new URLSearchParams(location.search).get('testSpawn');
    const section=sections[key],samples=route.samples.filter(p=>p.section===section);
    if(samples.length){
      const sample=samples[key==='river'?Math.floor(samples.length/2):0];
      const point=landscape.atDistance(sample.distance_m-(key==='bridge'?20:0));
      landscape.spawn={x:point.x,y:point.y+.65,z:point.z};landscape.yaw=Math.atan2(point.nx,point.nz);
    }
  }
  const geometries=new Set(),materials=new Set(),ownedTextures=new Set();let instanceCount=0;
  const collectResources=mesh=>{
    if(!mesh.isMesh)return;
    geometries.add(mesh.geometry);
    for(const mat of [].concat(mesh.material)){
      materials.add(mat);
      for(const value of Object.values(mat))if(value?.isTexture){ownedTextures.add(value);value.anisotropy=anisotropy;}
    }
    if(mesh.isInstancedMesh){instanceCount+=mesh.count;mesh.computeBoundingBox();mesh.computeBoundingSphere();}
    mesh.castShadow=!mesh.isInstancedMesh&&!/TERRAIN|BANK|SHOULDERS|SM_Water/.test(mesh.name);
    mesh.receiveShadow=true;
  };
  root.traverse(collectResources);trainAsset.scene.traverse(collectResources);
  placedDetails?.traverse(mesh=>{collectResources(mesh);if(mesh.isInstancedMesh)mesh.dispose();});
  // Art direction: warm ochre sand, with the authored atlas kept intact.
  // This is scoped to Desert Valley and does not touch the water preset.
  for(const material of materials)if(material.name==='MAT_Desert_SandTile'||material.name==='MAT_Export25_PaintedGround_Baked')material.color.set(0xf3d5b8);
  const surface=root.getObjectByName('SM_Water');
  if(!surface)throw new Error('Desert Valley: falta SM_Water.');
  const isRamp=mesh=>{for(let node=mesh;node&&node!==root;node=node.parent)if(node.userData.role==='driveable_ramp'||node.userData.ramp_instance)return true;return false;};
  const isDryFloor=m=>isRamp(m)||/S07_(ROAD|DIRT|TERRAIN|BANK|SHOULDERS)|BrokenBridge_Deck/.test(m.name);
  const floorMeshes=[];root.traverse(mesh=>{if(mesh.isMesh&&mesh!==surface&&isDryFloor(mesh))floorMeshes.push(mesh);});
  const dryHeight=createSurfaceIndex(floorMeshes),river=createDesertWaterSurface(surface,dryHeight,{mobile});
  geometries.add(river.geometry);
  let water=null,waterFx=null,sun=null,previousShadow=null,speed=0;
  const riverHeight=(x,z)=>river.heightAt(x,z,water?.phase.value??0,water?.waveHeight.value??0);
  const surfaceHeight=(x,z)=>{
    const ground=dryHeight(x,z),b=river.bounds;
    if(x<b.min.x||x>b.max.x||z<b.min.z||z>b.max.z)return ground;
    return Math.max(ground??-Infinity,riverHeight(x,z));
  };
  const collision=createCityCollision(root,{
    isFloor:m=>m===surface||isDryFloor(m),
    isSolid:m=>!m.isInstancedMesh&&!/Deck_Markings/.test(m.name),exploration:true,surfaceHeightOverride:surfaceHeight,
  });
  // Capture the original collision proxies first; visual detail never changes
  // driveable surfaces, train clearance or the authored collision geometry.
  detailAsset.traverse(collectResources);
  const lod=createDesertLod(root,detailAsset,detailManifest,{mode:import.meta.env.DEV&&new URLSearchParams(location.search).get('lod')==='full'?'full':'adaptive'});
  collisionInputs?.removeFromParent();
  lod.update(landscape.spawn,0,true);
  instanceCount=0;root.traverse(mesh=>{if(mesh.isInstancedMesh&&!mesh.userData.visualDetail)instanceCount+=mesh.count;});
  instanceCount+=detailManifest.instanceCount;
  landscape.spawn.y=(surfaceHeight(landscape.spawn.x,landscape.spawn.z)??landscape.spawn.y-.65)+.65;
  // Moving vehicles must stay out of the immutable scenery octree.
  const train=createDesertTrain({root:trainAsset.scene,railway});root.add(train.root);
  const trainAudio=createDesertTrainAudio(train);
  const fx=await loadFlightFx(root,{surfaceHeight:collision.surfaceHeight,mobile,materialFactory:fxMaterialFactory});
  const toSun=new THREE.Vector3(-160,220,-120).normalize();
  onProgress(1);
  return {
    root,landscape,fx,train,lod,instanceCount,detailCount:instanceCount,
    textures:{count:3,applyRoot(){}},surfaceHeight:collision.surfaceHeight,clipCamera:collision.clipCamera,
    get water(){return water;},
    get waterStats(){return {surfaceTriangles:river.triangles,effectTriangles:waterFx?.triangles??0};},
    resetWaterFx(){waterFx?.reset();},
    async initWater(light){
      if(water)return;
      sun=light;previousShadow=sun.shadow.shadowNode;
      const textureLoader=new THREE.TextureLoader();
      const [pattern,bed]=await Promise.all(['water-pattern.png','water-bed.png'].map(name=>textureLoader.loadAsync(`${base}textures/water/${name}`)));
      const contact=createDesertWaterContact(root,surface);
      for(const texture of [pattern,bed,contact.texture])ownedTextures.add(texture);
      water=createWater(pattern,sun,toSun,contact.texture,contact.info,surface,bed,{geometry:river.geometry,maxWaveHeight:RIVER_SURFACE.maximumWaveHeight,desert:true});
      speed=applyDesertWaterPreset(water);
      surface.geometry=water.geometry;surface.material=water.material;surface.castShadow=false;
      root.add(water.seabed);
      geometries.add(water.geometry);geometries.add(water.seabed.geometry);
      materials.add(water.material);materials.add(water.seabed.material);
      waterFx=createHoverWaterEffects({root,river,heightAt:riverHeight,mobile});
    },
    step(state,dt,previous){train.step(dt);collision.step(state,dt,landscape,previous);train.collide(state,dt,previous);},
    reset(){fx.reset();train.reset();trainAudio.reset();waterFx?.reset();if(water)water.phase.value=0;},
    update(time,reduced,context){
      lod.update(context.state,context.dt??0);
      fx.update(context.dt??0,{...context,reduced});
      if(context.camera)trainAudio.update(context.camera,context.phase);
      if(water){
        if(context.phase!=='paused'&&!reduced)water.phase.value+=Math.min(context.dt??0,.05)*speed;
        toSun.subVectors(sun.position,sun.target.position).normalize();
        water.sunStrength.value=sun.intensity/7;
      }
      waterFx?.update(context.dt??0,{...context,reduced});
    },
    dispose(){
      lod.dispose();
      trainAudio.dispose();train.dispose();
      waterFx?.dispose();river.dispose();
      fx.dispose();collision.dispose();
      if(water){sun.shadow.shadowNode=previousShadow;water.dispose();}
      root.traverse(o=>{if(o.isInstancedMesh)o.dispose();});
      geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());ownedTextures.forEach(t=>t.dispose());
      root.removeFromParent();
    },
  };
}
