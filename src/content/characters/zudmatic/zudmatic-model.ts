import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createNomadaPilotSupports} from '../shared/pilot-supports';
import {pilotPalette} from '../catalog';

// Cache only the bytes. Each actor owns its skeleton, materials and GPU resources.
let modelBytes;
async function loadModel(){
  modelBytes??=fetch(`${import.meta.env.BASE_URL}models/zudmatic/zudmatic.glb`).then(response=>{
    if(!response.ok)throw new Error('No se pudo cargar Zudmatic');return response.arrayBuffer();
  }).catch(error=>{modelBytes=null;throw error;});
  return new GLTFLoader().parseAsync(await modelBytes,'');
}
export async function createZudmaticModel({palette='Original',seated=false,offset=[0,0,0],fit}={}){
  const bike=seated&&fit==='nomada';
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
  const footRotations={},spread=new THREE.Quaternion(),forward=new THREE.Vector3(0,0,1);let supports;model.updateMatrixWorld(true);
  for(const side of ['L','R'])footRotations[side]=bones[`foot_${side}`].getWorldQuaternion(new THREE.Quaternion());
  function drivingPose(time=0,moving=false){
    for(const side of ['L','R']){
      worldRotation(bones[`thigh_${side}`],rotation.setFromAxisAngle(axis,bike?2.8:Math.PI/2).premultiply(spread.setFromAxisAngle(forward,bike?(side==='L'?-1.1:1.1):0)));
      worldRotation(bones[`shin_${side}`],rotation.setFromAxisAngle(axis,Math.PI));
      worldRotation(bones[`foot_${side}`],footRotations[side]);
      worldRotation(bones[`upper_arm_${side}`],rotation.setFromAxisAngle(axis,(bike?1.9:2.25)+(moving?Math.sin(time*1.3)*.025:0)));
      worldRotation(bones[`forearm_${side}`],rotation.setFromAxisAngle(axis,1.35));
    }
  }
  if(seated){
    // Uniform scale retains the supplied proportions. Anchor the pelvis to the
    // seat. The hoverbike uses a wider leg pose and its own uniform scale.
    model.scale.setScalar(bike?.44:.31);drivingPose();
    const pelvis=bones.pelvis.getWorldPosition(new THREE.Vector3());model.position.add(new THREE.Vector3(0,bike?1.38:1.16,bike?-.06:-.32).sub(pelvis));
    root.position.fromArray(offset);root.userData.fit=fit??'cockpit';
    if(bike){
      supports=createNomadaPilotSupports(root,{
        hands:['L','R'].map(side=>target=>bones[`hand_${side}`].getWorldPosition(target)),
        soles:['L','R'].map(side=>target=>{bones[`foot_${side}`].getWorldPosition(target);root.worldToLocal(target);target.y-=.085;target.z+=.078;root.localToWorld(target);}),
      });supports.update();
    }
  }else{
    const bounds=new THREE.Box3().setFromObject(model),height=bounds.getSize(new THREE.Vector3()).y;
    model.scale.setScalar(3.2/height);if(idle)mixer.clipAction(idle).play();mixer.update(0);
  }
  let lastTime=-1;
  function update(time=0,moving=false){
    if(time===lastTime)return;lastTime=time;
    if(seated){
      drivingPose(time,moving);supports?.update();
    }else mixer.setTime(time);
  }
  return {root,model,bones,meshes,mixer,setPalette,update,dispose(){
    supports?.dispose();mixer.stopAllAction();mixer.uncacheRoot(model);skeletons.forEach(s=>s.dispose());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());root.removeFromParent();
  }};
}
