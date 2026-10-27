import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {HAT_CATALOG,hatAssetUrl} from './hat-catalog';
import {refineHat,fitHatToHead} from './hat-refinements';

function disposeHat(root) {
  const geometries=new Set(),materials=new Set(),textures=new Set();
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    geometries.add(mesh.geometry);
    for(const material of [mesh.material].flat()) {
      materials.add(material);
      for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
    }
  });
  geometries.forEach(value=>value.dispose());materials.forEach(value=>value.dispose());textures.forEach(value=>value.dispose());
}

// Authored in Zud root coordinates (+Y up, +Z front). Refined models stay in
// those coordinates; adjustments pivot at the head and retain a fitted opening.
// The anchor can follow the lab's head proportions without altering GLB roots.
export function createCharacterHats(model,{onChange=()=>{},load=url=>new GLTFLoader().loadAsync(url)}={}) {
  const anchor=new THREE.Group(),mount=new THREE.Group();
  anchor.name='Sombreros de Zud';anchor.add(mount);model.root.add(anchor);
  const beanie=model.root.getObjectByName('Beanie de Zud');
  const pivot=new THREE.Vector3(0,.49,0),tint=new THREE.Color();
  const head=model.root.getObjectByName('Cabeza de Zud');
  let current=null,requested=null,revision=0,disposed=false,settings,state='ready',active='beanie',lastFit='';
  function apply() {
    if(!settings)return;
    beanie.visible=settings.showHat&&(active==='beanie');
    beanie.scale.setScalar(settings.hatSize);
    beanie.getObjectByName('Pompón').visible=settings.showPompom;
    anchor.visible=settings.showHat;
    mount.scale.setScalar(settings.hatSize);
    mount.rotation.set(THREE.MathUtils.degToRad(settings.hatTilt),THREE.MathUtils.degToRad(settings.hatYaw),0,'YXZ');
    mount.position.copy(pivot).sub(pivot.clone().multiplyScalar(settings.hatSize).applyQuaternion(mount.quaternion));
    mount.position.add(new THREE.Vector3(settings.hatOffsetX,settings.hatOffsetY,settings.hatOffsetZ));
    if(current&&head){
      const fitKey=JSON.stringify([settings.hatSize,settings.hatTilt,settings.hatYaw,settings.hatOffsetX,settings.hatOffsetY,settings.hatOffsetZ,settings.hatAutoFit,settings.hatCrownHeight,...head.scale.toArray(),head.geometry.uuid]);
      if(fitKey!==lastFit){fitHatToHead(current,mount,anchor,head,{autoFit:settings.hatAutoFit!==false,crownHeight:settings.hatCrownHeight??1});lastFit=fitKey;}
    }
    tint.set(settings.hatTint);
    current?.traverse(mesh=>{
      if(!mesh.isMesh)return;
      for(const material of [mesh.material].flat()) {
        const original=material.userData.hatOriginal;
        material.color.copy(original.color).multiply(tint);
        material.roughness=original.roughness*settings.hatRoughness;
        material.metalness=THREE.MathUtils.lerp(original.metalness,1,settings.hatMetalness);
        material.wireframe=Boolean(settings.wireframe);
      }
    });
  }
  function report(error=null) {onChange({state,active,requested,error});}
  function clear() {lastFit='';if(current){mount.remove(current);disposeHat(current);current=null;}}
  async function update(next) {
    if(disposed)return;
    settings={...next};apply();
    if(requested===settings.hatModel)return;
    requested=settings.hatModel;const token=++revision;
    clear();active=requested==='none'?'none':'beanie';
    const entry=HAT_CATALOG.find(hat=>hat.id===requested);
    state=entry?'loading':'ready';apply();report();
    if(!entry)return;
    try {
      const gltf=await load(hatAssetUrl(entry.file));
      if(disposed||token!==revision){disposeHat(gltf.scene);return;}
      try {current=refineHat(gltf.scene,entry.id);} finally {disposeHat(gltf.scene);}
      current.name=entry.name;
      current.traverse(mesh=>{
        if(!mesh.isMesh)return;
        mesh.castShadow=true;mesh.receiveShadow=true;
        for(const material of [mesh.material].flat())material.userData.hatOriginal={color:material.color.clone(),roughness:material.roughness,metalness:material.metalness};
      });
      mount.add(current);active=entry.id;state='ready';apply();report();
    } catch(error) {
      if(disposed||token!==revision)return;
      clear();active='beanie';state='error';apply();report(error);
    }
  }
  return {anchor,update,retry(){requested=null;return update(settings);},dispose(){disposed=true;revision++;clear();anchor.removeFromParent();}};
}
