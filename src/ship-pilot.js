import * as THREE from 'three';
import {createSelectablePilot} from './selectable-pilot.js';

// A ship exported with its own pilot seated keeps that rig live when that pilot
// flies it, and drops it for anyone else, who takes the ship's pilotOffset.
export async function createShipPilot(scene,animations,config,choice){
  const rig=config.pilotRig,model=rig&&scene.getObjectByName(rig.node);
  if(!model||choice.pilot!==rig.pilot){
    model?.removeFromParent();
    return createSelectablePilot({...choice,offset:config.pilotOffsets?.[choice.pilot]??config.pilotOffset,fit:config.pilotFit});
  }
  const root=new THREE.Group();root.name=rig.pilot;root.userData.pilot=rig.pilot;root.attach(model);
  const bones={},meshes=[],geometries=new Set(),materials=new Set(),textures=new Set(),skeletons=new Set();
  model.traverse(object=>{
    if(object.isBone)bones[object.name]=object;
    if(!object.isMesh)return;
    meshes.push(object);geometries.add(object.geometry);if(object.skeleton)skeletons.add(object.skeleton);
    for(const material of [].concat(object.material)){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}
    object.castShadow=true;object.receiveShadow=true;object.frustumCulled=false;object.userData.system='cockpit';
  });
  const mixer=new THREE.AnimationMixer(model);mixer.clipAction(animations.find(clip=>clip.name===rig.clip)).play();mixer.update(0);
  let lastTime=0;
  function update(time=0){if(time===lastTime)return;lastTime=time;mixer.setTime(time);}
  const actor={root,model,bones,meshes,mixer,update};
  return {root,actor,update,dispose(){
    mixer.stopAllAction();mixer.uncacheRoot(model);skeletons.forEach(value=>value.dispose());geometries.forEach(value=>value.dispose());materials.forEach(value=>value.dispose());textures.forEach(value=>value.dispose());root.removeFromParent();
  }};
}
