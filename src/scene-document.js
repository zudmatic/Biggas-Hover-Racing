import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import catalog from './scene-catalog.json' with {type:'json'};
import sceneBase from './scene-base.json' with {type:'json'};
import {prepareColors,applyColors,disposeColors} from './scene-colors.js';
import {applySceneMaterials} from './scene-materials.js';

export {catalog};
// A new baseline starts a new local draft. Previous drafts are left intact.
export const SCENE_STORAGE='zud.scene.v3';
export const assetUrl=file=>`${import.meta.env.BASE_URL}models/room-objects/${file}`;
export const categories={seating:'Asientos',lighting:'Iluminación',storage:'Guardado',furniture:'Muebles',electronics:'Tecnología',ceramics:'Cerámica',botanical:'Plantas',stationery:'Escritorio',personal:'Personal'};
export const isVisible=object=>{for(let node=object;node;node=node.parent)if(!node.visible)return false;return true;};
const transform=object=>({position:object.position.toArray(),rotation:object.rotation.toArray().slice(0,3),scale:object.scale.toArray(),visible:object.visible});
const applyTransform=(object,data)=>{object.position.fromArray(data.position);object.rotation.set(...data.rotation);object.scale.fromArray(data.scale);object.visible=data.visible;object.updateMatrixWorld(true);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const matrix=data=>new THREE.Matrix4().compose(new THREE.Vector3().fromArray(data.position),new THREE.Quaternion().setFromEuler(new THREE.Euler(...data.rotation)),new THREE.Vector3().fromArray(data.scale));

export function readSceneDocument(value,builtinIds) {
  if(!value||![1,2].includes(value.version)||!Array.isArray(value.builtins)||!Array.isArray(value.objects)||value.objects.length>150)throw new Error('Archivo de escena inválido (versiones 1 y 2, hasta 150 objetos).');
  const ids=new Set();
  function read(item,builtin) {
    if(!item||typeof item.id!=='string'||item.id.length>100||ids.has(item.id))throw new Error('Identificador de objeto inválido o repetido.');
    ids.add(item.id);
    if(builtin?!builtinIds.includes(item.id):builtinIds.includes(item.id)||!catalog.some(model=>model.id===item.model))throw new Error('El archivo incluye un modelo desconocido.');
    const result={id:item.id};
    for(const key of ['position','rotation','scale']) {
      const a=item[key];
      if(!Array.isArray(a)||a.length!==3||!a.every(n=>Number.isFinite(n)&&Math.abs(n)<=100&&(key!=='scale'||n>=.05&&n<=5)))throw new Error('Las transformaciones están fuera de rango.');
      result[key]=[...a];
    }
    if(typeof item.visible!=='boolean')throw new Error('Visibilidad inválida.');
    result.visible=item.visible;
    if(!builtin)result.model=item.model;
    if(item.colors!==undefined){
      if(!item.colors||typeof item.colors!=='object'||Array.isArray(item.colors)||Object.keys(item.colors).length>100)throw new Error('Colores inválidos.');
      result.colors={};
      for(const [key,color] of Object.entries(item.colors)){
        if(!/^\d{1,3}$/.test(key)||typeof color!=='string'||!/^#[\da-f]{6}$/i.test(color))throw new Error('Color inválido.');
        result.colors[key]=color.toLowerCase();
      }
    }
    if(item.replaces!==undefined){if(!builtinIds.includes(item.replaces))throw new Error('Reemplazo desconocido.');result.replaces=item.replaces;}
    return result;
  }
  return {version:value.version,builtins:value.builtins.map(item=>read(item,true)),objects:value.objects.map(item=>read(item,false))};
}

export function createSceneDocument(retroRoom,{onLoad=()=>{},baseScene=sceneBase}={}) {
  const entries=new Map(retroRoom.editableObjects.map(entry=>[entry.id,{...entry,builtin:true}]));
  const legacyDefaults=new Map([...entries].map(([id,{object}])=>[id,transform(object)]));
  const legacyParents=new Map([...entries].map(([id,{object}])=>[id,[...entries.values()].find(e=>e.object===object.parent)?.id]));
  retroRoom.room.updateMatrixWorld(true);
  // Flat, independently addressable objects: removing/moving a support cannot
  // hide, move or replace another editable object. Geometry keeps its world pose.
  for(const entry of entries.values())if(entry.object.parent!==retroRoom.room)retroRoom.room.attach(entry.object);
  const defaults=new Map([...entries].map(([id,{object}])=>[id,transform(object)]));
  for(const entry of entries.values())prepareColors(entry);
  const loader=new GLTFLoader(),cache=new Map();
  function load(model) {
    if(!cache.has(model.id))cache.set(model.id,loader.loadAsync(assetUrl(model.model)).then(gltf=>{
      applySceneMaterials(gltf.scene);
      gltf.scene.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=true;mesh.receiveShadow=true;}});
      return gltf.scene;
    }).catch(()=>{cache.delete(model.id);throw new Error(`No se pudo cargar ${model.name}. Intentá de nuevo.`);}));
    return cache.get(model.id);
  }
  const record=entry=>({id:entry.id,...(!entry.builtin?{model:entry.model}:{}),...transform(entry.object),...(Object.keys(entry.colors).length?{colors:{...entry.colors}}:{}),...(entry.replaces?{replaces:entry.replaces}:{})});
  function snapshot(){return {version:2,builtins:[...entries.values()].filter(e=>e.builtin).map(record),objects:[...entries.values()].filter(e=>!e.builtin).map(record)};}
  function normalize(value){
    const data=readSceneDocument(value,[...defaults.keys()]);
    if(data.version===1){
      const local=new Map([...legacyDefaults].map(([id,base])=>[id,data.builtins.find(item=>item.id===id)??base]));
      const world=id=>{const m=matrix(local.get(id)),parent=legacyParents.get(id);return parent?world(parent).multiply(m):m;};
      data.builtins=[...local].map(([id,item])=>{
        if(!legacyParents.get(id))return {id,...item};
        const object=new THREE.Object3D();world(id).decompose(object.position,object.quaternion,object.scale);object.visible=item.visible;
        return {id,...transform(object),...(item.colors?{colors:item.colors}:{})};
      });
    }
    data.version=2;return data;
  }
  async function apply(value) {
    const data=normalize(value);
    const templates=await Promise.all(data.objects.map(item=>load(catalog.find(model=>model.id===item.model))));
    for(const [id,entry] of entries)if(!entry.builtin){disposeColors(entry);entry.object.removeFromParent();entries.delete(id);}
    for(const [id,base] of defaults) {
      const entry=entries.get(id),next=data.builtins.find(item=>item.id===id)??base;
      applyTransform(entry.object,next);applyColors(entry,next.colors);markEdited(entry);
    }
    data.objects.forEach((item,i)=>{
      const model=catalog.find(model=>model.id===item.model),object=templates[i].clone(true);
      object.name=model.name;retroRoom.room.add(object);applyTransform(object,item);
      const entry={id:item.id,label:model.name,object,model:item.model,builtin:false,replaces:item.replaces};
      prepareColors(entry);applyColors(entry,item.colors);entries.set(item.id,entry);onLoad(object);
    });
    retroRoom.room.updateMatrixWorld(true);
  }
  function markEdited(entry){if(entry.builtin){entry.object.userData.sceneEdited=!same(transform(entry.object),defaults.get(entry.id));entry.object.userData.sceneVisible=entry.object.visible;}}
  function remove(entry){if(entry.builtin){entry.object.visible=false;markEdited(entry);}else{disposeColors(entry);entry.object.removeFromParent();entries.delete(entry.id);}}
  return {entries,snapshot,apply,normalize,markEdited,affected:entry=>Boolean(entry.object.userData.sceneEdited),load,
    base:()=>baseScene?normalize(baseScene):{version:2,builtins:[...defaults].map(([id,data])=>({id,...structuredClone(data)})),objects:[]},
    restoreOriginal(id){const entry=entries.get(id);if(!entry?.builtin)throw new Error('Objeto original desconocido.');entry.object.visible=true;markEdited(entry);return entry;},
    setColor(entry,index,color){applyColors(entry,{...entry.colors,[index]:color});},
    resetColors(entry){applyColors(entry);},
    async add(modelId,{replace=null,support='floor'}={}) {
      if([...entries.values()].filter(e=>!e.builtin).length-Number(Boolean(replace&&!replace.builtin))>=150)throw new Error('La escena admite hasta 150 objetos nuevos.');
      const model=catalog.find(item=>item.id===modelId);
      if(!model)throw new Error('Modelo desconocido.');
      const template=await load(model),object=template.clone(true);
      object.name=model.name;
      object.position.set(support==='desk'?1: support==='wall'?0:1.45,support==='desk'?1.18:support==='wall'?1.9:.09,support==='desk'?-1.7:support==='wall'?-2.1:1.35);
      const replaces=replace?.builtin?replace.id:replace?.replaces;
      if(replace) {
        retroRoom.room.updateMatrixWorld(true);
        const bounds=new THREE.Box3().setFromObject(replace.object);
        object.position.copy(bounds.getCenter(new THREE.Vector3()));object.position.y=Math.max(.09,bounds.min.y);
        object.quaternion.copy(replace.object.getWorldQuaternion(new THREE.Quaternion()));
        if(!replace.builtin)object.scale.copy(replace.object.getWorldScale(new THREE.Vector3()));
        remove(replace);
      }
      retroRoom.room.add(object);const id=crypto.randomUUID();
      const entry={id,label:model.name,model:model.id,object,builtin:false,replaces};prepareColors(entry);entries.set(id,entry);onLoad(object);return entry;
    },
    remove,
    save(){localStorage.setItem(SCENE_STORAGE,JSON.stringify(snapshot()));},
    async restore(){const raw=localStorage.getItem(SCENE_STORAGE);await apply(raw?JSON.parse(raw):this.base());return Boolean(raw);},
  };
}
