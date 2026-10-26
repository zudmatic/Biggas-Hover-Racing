import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createDrivingPose} from './bluleet-driving-pose.js';
import {createBluleetInk} from './bluleet-ink.js';

// Each actor owns its rig and GPU resources; only the downloaded bytes are shared.
let modelBytes;
async function loadModel(){
  modelBytes??=fetch(`${import.meta.env.BASE_URL}models/bluleet/bluleet-motionlab-dedos.glb`).then(response=>{
    if(!response.ok)throw new Error('No se pudo cargar Bluleet');return response.arrayBuffer();
  }).catch(error=>{modelBytes=null;throw error;});
  return new GLTFLoader().parseAsync(await modelBytes,'');
}

export async function createBluleetModel({seated=false,offset=[0,0,0],fit,ink=true}={}){
  const {scene:model}=await loadModel(),root=new THREE.Group(),rig=new THREE.Group();
  root.name='Bluleet · piloto';root.userData.pilot='bluleet';root.userData.fit=fit??'cockpit';root.add(rig);rig.add(model);
  const bones={},meshes=[],rest=new Map(),geometries=new Set(),materials=new Set(),textures=new Set(),skeletons=new Set();
  model.traverse(object=>{
    if(object.isBone){bones[object.name]=object;rest.set(object,object.quaternion.clone());}
    if(!object.isMesh)return;
    meshes.push(object);geometries.add(object.geometry);if(object.skeleton)skeletons.add(object.skeleton);
    // Retain authored materials for native comparisons and ownership/disposal.
    // The optional ink finish is attached after the rig is posed.
    for(const material of [].concat(object.material)){
      materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
    }
    object.castShadow=true;object.receiveShadow=true;object.frustumCulled=false;object.userData.system='cockpit';
  });
  model.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(model,true),sourceHeight=bounds.getSize(new THREE.Vector3()).y;
  model.position.set(-(bounds.min.x+bounds.max.x)/2,-bounds.min.y,-(bounds.min.z+bounds.max.z)/2);
  let poseStats=null;
  if(seated){
    const pose=createDrivingPose({root:rig,setPose(){for(const [bone,q] of rest)bone.quaternion.copy(q);},set({height}){rig.scale.setScalar(height/sourceHeight);}});
    poseStats=pose(fit==='bluleet'?{}:fit==='nomada'
      ?{seatY:1.38,seatZ:-.1,gripY:1.68,gripZ:.534,gripX:.486,footX:.7,lean:.44,steering:false}
      :{seatY:1.16,seatZ:-.32,gripY:1.35,gripZ:.25,gripX:.29,lean:.3,steering:false});
    root.position.fromArray(offset);
  }else{
    rig.scale.setScalar(3.2/sourceHeight);root.updateMatrixWorld(true);
    for(const [side,sign] of [['l',1],['r',-1]]){
      const arm=bones[`upperarm_${side}`],world=arm.getWorldQuaternion(new THREE.Quaternion());
      world.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-sign*.87));
      arm.quaternion.copy(arm.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));root.updateMatrixWorld(true);
    }
  }
  const finish=ink?createBluleetInk(meshes.find(m=>m.isSkinnedMesh&&m.name==='Bluleet')):null;
  root.userData.ink=ink;
  const headRest=bones.Head.quaternion.clone();
  function update(time=0,moving=false){
    bones.Head.quaternion.copy(headRest);if(moving)bones.Head.rotateY(Math.sin(time*1.3)*.025);
    finish?.update(time);
  }
  return {root,model,rig,bones,meshes,poseStats,update,dispose(){
    finish?.dispose();skeletons.forEach(s=>s.dispose());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());root.removeFromParent();
  }};
}
