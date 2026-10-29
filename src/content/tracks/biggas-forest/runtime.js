import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {AssetLoader,publicUrl} from '../../../core/assets/asset-loader.ts';
import {Landscape} from '../../../sim/landscape.ts';
import {DriftFx} from '../../../fx/drift/drift-fx.ts';
import {createCircuitTextures} from './circuit-textures.js';
import {createCircuitDetails} from './circuit-details.js';
import {collisionMaterials,createCityCollision} from './circuit-collision.js';
import {prepareBiggasCity} from './biggas-city-scene.js';
import {createBiggasCityDetails} from './biggas-city-details.js';
import {createBiggasRoutes,openBiggasRoutes} from './biggas-city-routes.js';
import {prepareBiggasForest,populateBiggasForest} from './biggas-forest.js';
import {createBiggasForestAdventure} from './biggas-forest-adventure.js';
import {addBiggasGrass} from './biggas-city-terrain.js';

export async function loadForestRuntime(definition,{onProgress=()=>{},mobile=false,anisotropy=4,underglow=true,fxMaterialFactory}={}){
  const loader=AssetLoader.shared,base=`models/${definition.folder}/`,files=['Core','Forest_LOD1','Cascade','Collision'].map(part=>`${base}Biggas_City_039_v02_${part}.glb`);
  const [assets,colliders,route,gameplay]=await Promise.all([
    Promise.all(files.slice(0,3).map(file=>loader.gltf(file))),
    loader.arrayBuffer(files[3]).then(data=>new GLTFLoader().register(collisionMaterials).parseAsync(data,publicUrl(base))),
    loader.json(base+'route_gltf.json'),loader.json(base+'gameplay.json'),
  ]);onProgress(.65);
  const landscape=new Landscape(route,gameplay),root=new THREE.Group();root.name='Biggas Forest 039';landscape.map=definition.id;landscape.physicalBoundaries=true;
  const textures=createCircuitTextures({anisotropy,size:mobile?128:256,style:'biggas-city'}),terrain=[];
  assets[0].scene.traverse(mesh=>{if(mesh.isMesh&&/Continuous_sculpted_landscape/.test(mesh.name))terrain.push(mesh);});
  const routes=createBiggasRoutes(landscape,{terrain}),materials=prepareBiggasForest(assets,colliders.scene,landscape,routes);
  openBiggasRoutes(assets,colliders.scene,routes);
  const forest=populateBiggasForest(assets,landscape,routes,{mobile}),authored=prepareBiggasCity(assets,root,textures);
  const adventure=createBiggasForestAdventure(root,colliders.scene,landscape,routes,textures,forest,{mobile,...materials});
  const grass=addBiggasGrass(root,landscape,{mobile}),collision=createCityCollision(colliders.scene,{surfaceName:'COL_ROAD'});
  colliders.scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
  const details=createCircuitDetails(root,landscape,{mobile,underglow,woodland:true,islands:false});
  const urban=createBiggasCityDetails(root,landscape,authored,{mobile,windAt:adventure.windAt});textures.applyRoot(root);
  const fx=await DriftFx.load(root,{surfaceHeight:collision.surfaceHeight,mobile,materialFactory:fxMaterialFactory});onProgress(1);
  return {root,landscape,textures,fx,adventure,surfaceHeight:collision.surfaceHeight,clipCamera:collision.clipCamera,
    detailCount:details.detailCount+urban.detailCount+adventure.detailCount+grass.clumps,
    step(state,dt,previous){collision.step(state,dt,landscape,previous);adventure.step(state,dt);details.step(state,dt);},
    update(time,reduced,context){details.update(time,reduced,context);urban.update(time,reduced,context);adventure.update(time,reduced,context);fx.update(context.dt??0,{...context,reduced});},
    reset(){details.reset();adventure.reset();fx.reset();},
    dispose(){fx.dispose();urban.dispose();adventure.dispose();collision.dispose();const geometries=new Set(),materials=new Set();root.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.dispose();root.removeFromParent();files.forEach(file=>loader.evict(file));},
  };
}
