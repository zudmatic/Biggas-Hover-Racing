import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {pilotPalette} from './pilot-catalog.js';

// Cache only the bytes. Each actor owns its skeleton, materials and GPU resources.
let modelBytes;
async function loadModel(){
  modelBytes??=fetch(`${import.meta.env.BASE_URL}models/zudmatic/zudmatic.glb`).then(response=>{
    if(!response.ok)throw new Error('No se pudo cargar Zudmatic');return response.arrayBuffer();
  }).catch(error=>{modelBytes=null;throw error;});
  return new GLTFLoader().parseAsync(await modelBytes,'');
}
export async function createZudmaticModel({palette='Original',seated=false,offset=[0,0,0]}={}){
  const gltf=await loadModel(),model=gltf.scene,root=new THREE.Group();root.name='Zudmatic';root.add(model);
  const bones={},meshes=[],materials=new Set(),geometries=new Set(),skeletons=new Set();
  model.traverse(object=>{
    if(object.isBone)bones[object.name]=object;
    if(!object.isMesh)return;
    meshes.push(object);geometries.add(object.geometry);if(object.skeleton)skeletons.add(object.skeleton);
    // Per-part materials preserve Bosque's individual shell, detail and shoe colors.
    object.material=object.material.clone();materials.add(object.material);
    object.castShadow=true;object.receiveShadow=true;object.frustumCulled=false;object.userData.system='cockpit';
  });
  function setPalette(name){
    const selected=pilotPalette(name);root.userData.palette=selected.name;
    for(const mesh of meshes){const hex=selected.parts?.[mesh.userData.partId]??selected.colors[mesh.userData.colorKey];if(hex)mesh.material.color.set(hex);}
  }
  setPalette(palette);root.userData.pilot='zudmatic';
  const mixer=new THREE.AnimationMixer(model),idle=gltf.animations.find(clip=>clip.name==='Reposo');
  const rootRotation=new THREE.Quaternion(),parentRotation=new THREE.Quaternion(),rotation=new THREE.Quaternion(),axis=new THREE.Vector3(1,0,0);
  function worldRotation(bone,quaternion){
    bone.parent.getWorldQuaternion(parentRotation);root.getWorldQuaternion(rootRotation);bone.quaternion.copy(parentRotation.invert()).multiply(rootRotation).multiply(quaternion);bone.updateWorldMatrix(false,true);
  }
  const footRotations={};model.updateMatrixWorld(true);
  for(const side of ['L','R'])footRotations[side]=bones[`foot_${side}`].getWorldQuaternion(new THREE.Quaternion());
  function drivingPose(time=0,moving=false){
    for(const side of ['L','R']){
      worldRotation(bones[`thigh_${side}`],rotation.setFromAxisAngle(axis,Math.PI/2));
      worldRotation(bones[`shin_${side}`],rotation.setFromAxisAngle(axis,Math.PI));
      worldRotation(bones[`foot_${side}`],footRotations[side]);
      worldRotation(bones[`upper_arm_${side}`],rotation.setFromAxisAngle(axis,2.25+(moving?Math.sin(time*1.3)*.025:0)));
      worldRotation(bones[`forearm_${side}`],rotation.setFromAxisAngle(axis,1.35));
    }
  }
  if(seated){
    // Uniform scale retains the supplied proportions. Anchor the pelvis to the
    // seat, then use the ship's cockpit offset for the 033 and Oliva 037.
    model.scale.setScalar(.31);drivingPose();
    const pelvis=bones.pelvis.getWorldPosition(new THREE.Vector3());model.position.add(new THREE.Vector3(0,1.16,-.32).sub(pelvis));
    root.position.fromArray(offset);
  }else{
    const bounds=new THREE.Box3().setFromObject(model),height=bounds.getSize(new THREE.Vector3()).y;
    model.scale.setScalar(3.2/height);if(idle)mixer.clipAction(idle).play();mixer.update(0);
  }
  let lastTime=-1;
  function update(time=0,moving=false){
    if(time===lastTime)return;lastTime=time;
    if(seated){
      drivingPose(time,moving);
    }else mixer.setTime(time);
  }
  return {root,model,bones,meshes,mixer,setPalette,update,dispose(){
    mixer.stopAllAction();mixer.uncacheRoot(model);skeletons.forEach(s=>s.dispose());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());root.removeFromParent();
  }};
}
