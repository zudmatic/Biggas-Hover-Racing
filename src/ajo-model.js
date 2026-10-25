import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createNomadaPilotSupports} from './nomada-pilot-supports.js';

// Cache bytes, not a live rig: each preview/ship owns its pose and GPU resources.
let modelBytes;
async function loadModel(){
  modelBytes??=fetch(`${import.meta.env.BASE_URL}models/ajo/ajo.glb`).then(response=>{
    if(!response.ok)throw new Error('No se pudo cargar Ajo');return response.arrayBuffer();
  }).catch(error=>{modelBytes=null;throw error;});
  return new GLTFLoader().parseAsync(await modelBytes,'');
}

export async function createAjoModel({seated=false,offset=[0,0,0],fit}={}){
  const gltf=await loadModel(),model=gltf.scene,root=new THREE.Group();root.name='Ajo';root.userData.pilot='ajo';root.add(model);
  const bones={},meshes=[],geometries=new Set(),materials=new Set(),textures=new Set(),skeletons=new Set();
  model.traverse(object=>{
    if(object.isBone)bones[object.name]=object;
    if(!object.isMesh)return;
    meshes.push(object);geometries.add(object.geometry);if(object.skeleton)skeletons.add(object.skeleton);
    for(const material of [].concat(object.material)){
      materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
    }
    object.castShadow=!object.name.includes('Face');object.receiveShadow=true;object.frustumCulled=false;object.userData.system='cockpit';
  });
  const mixer=new THREE.AnimationMixer(model),idle=gltf.animations.find(clip=>clip.name==='Ajo Relaxed Idle');
  if(idle)mixer.clipAction(idle).play();mixer.update(0);root.updateMatrixWorld(true);
  const bike=seated&&fit==='nomada';let supports;
  const parentRotation=new THREE.Quaternion(),rotation=new THREE.Quaternion(),from=new THREE.Vector3(),to=new THREE.Vector3();
  // Exported joints have different local axes; aim from the authored pose.
  function aim(bone,child,direction){
    bone.getWorldPosition(from);child.getWorldPosition(to);to.sub(from).normalize();
    rotation.setFromUnitVectors(to,direction.normalize()).multiply(bone.getWorldQuaternion(parentRotation));
    bone.quaternion.copy(bone.parent.getWorldQuaternion(parentRotation).invert().multiply(rotation));bone.updateWorldMatrix(false,true);
  }
  function gripHandlebar(side,target){
    const upper=bones[`upperarm_${side}`],lower=bones[`lowerarm_${side}`],hand=bones[`hand_${side}`];
    // Mesh L/R names are opposite to the skeleton's L/R in this export.
    const paw=meshes.find(mesh=>mesh.name.includes(side==='l'?'HandR':'HandL'));
    const shoulder=upper.getWorldPosition(new THREE.Vector3()),elbow=lower.getWorldPosition(new THREE.Vector3()),wrist=hand.getWorldPosition(new THREE.Vector3());
    const orientation=hand.getWorldQuaternion(new THREE.Quaternion()),palm=new THREE.Vector3(),vertex=new THREE.Vector3();
    for(let i=0;i<paw.geometry.attributes.position.count;i++){paw.getVertexPosition(i,vertex).applyMatrix4(paw.matrixWorld);palm.add(vertex);}
    palm.divideScalar(paw.geometry.attributes.position.count);
    // Place the palm on the actual rubber grip, rather than the wrist joint.
    const goal=target.clone().sub(palm.sub(wrist)),axis=goal.clone().sub(shoulder),a=shoulder.distanceTo(elbow),b=elbow.distanceTo(wrist),distance=axis.length();
    if(distance>=a+b||distance<=Math.abs(a-b))throw new Error('Ajo no alcanza el manillar de la Nómada');
    axis.normalize();const pole=new THREE.Vector3(side==='l'?.3:-.3,-1,-.3);pole.addScaledVector(axis,-pole.dot(axis)).normalize();
    const along=(a*a-b*b+distance*distance)/(2*distance),bend=Math.sqrt(Math.max(0,a*a-along*along));
    const joint=shoulder.clone().addScaledVector(axis,along).addScaledVector(pole,bend);
    aim(upper,lower,joint.sub(shoulder));lower.getWorldPosition(elbow);aim(lower,hand,goal.sub(elbow));
    hand.quaternion.copy(hand.parent.getWorldQuaternion(parentRotation).invert().multiply(orientation));hand.updateWorldMatrix(false,true);
  }
  if(seated){
    model.scale.setScalar(bike?1:.72);root.updateMatrixWorld(true);
    for(const side of ['l','r']){
      const sign=side==='l'?1:-1,foot=bones[`foot_${side}`],hand=bones[`hand_${side}`];
      const footRotation=foot.getWorldQuaternion(new THREE.Quaternion()),handRotation=hand.getWorldQuaternion(new THREE.Quaternion());
      aim(bones[`thigh_${side}`],bones[`calf_${side}`],new THREE.Vector3(sign*(bike?.95:.12),bike?-.55:-.08,1));
      aim(bones[`calf_${side}`],foot,new THREE.Vector3(sign*(bike?.2:0),-1,bike?.15:0));
      foot.quaternion.copy(foot.parent.getWorldQuaternion(parentRotation).invert().multiply(footRotation));foot.updateWorldMatrix(false,true);
      aim(bones[`upperarm_${side}`],bones[`lowerarm_${side}`],new THREE.Vector3(sign*.22,-.7,bike?.7:.4));
      aim(bones[`lowerarm_${side}`],hand,new THREE.Vector3(sign*.1,.03,1));
      hand.quaternion.copy(hand.parent.getWorldQuaternion(parentRotation).invert().multiply(handRotation));hand.updateWorldMatrix(false,true);
    }
    const pelvis=bones.pelvis.getWorldPosition(new THREE.Vector3());
    model.position.add(new THREE.Vector3(0,bike?1.35:1.16,bike?.30:-.32).sub(pelvis));root.updateMatrixWorld(true);
    if(bike){
      // Midpoints between the authored grip rings 001/002 and 007/008 in
      // nomada-038.glb, after its +X to +Z conversion. No arm scaling.
      gripHandlebar('r',new THREE.Vector3(-.4862,1.6809,.534));
      gripHandlebar('l',new THREE.Vector3(.4862,1.6809,.534));
    }
    root.position.fromArray(offset);root.userData.fit=fit??'cockpit';root.updateMatrixWorld(true);
    if(bike){
      supports=createNomadaPilotSupports(root,{
        hands:[],
        soles:['r','l'].map(side=>target=>{bones[`foot_${side}`].getWorldPosition(target);root.worldToLocal(target);target.y-=.04;target.z+=.06;root.localToWorld(target);}),
      });supports.update();
    }else{
      // Short arms retain their proportions; control extensions meet the paws.
      const steel=new THREE.MeshStandardMaterial({color:0x566165,roughness:.65}),grip=new THREE.MeshStandardMaterial({color:0xb94b08,roughness:.8});materials.add(steel);materials.add(grip);
      const rodGeometry=new THREE.CylinderGeometry(.018,.018,1,6),gripGeometry=new THREE.SphereGeometry(.038,8,6);geometries.add(rodGeometry);geometries.add(gripGeometry);
      for(const [side,sign] of [['l',1],['r',-1]]){
        const base=new THREE.Vector3(sign*.32,1.15,.069),point=root.worldToLocal(bones[`hand_${side}`].getWorldPosition(new THREE.Vector3()));
        const rod=new THREE.Mesh(rodGeometry,steel),handle=new THREE.Mesh(gripGeometry,grip);rod.name='Extensión del control de Ajo';handle.name='Agarre de Ajo';
        to.copy(point).sub(base);rod.position.copy(base).add(point).multiplyScalar(.5);rod.scale.y=to.length();rod.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),to.normalize());handle.position.copy(point);root.add(rod,handle);
      }
    }
  }else{
    const bounds=new THREE.Box3().setFromObject(model,true);model.scale.setScalar(3.2/bounds.getSize(new THREE.Vector3()).y);
  }
  const headRest=bones.Head.quaternion.clone();let lastTime=-1,lastMoving;
  function update(time=0,moving=false){
    if(time===lastTime&&moving===lastMoving)return;lastTime=time;lastMoving=moving;
    if(seated){
      bones.Head.quaternion.copy(headRest);if(moving)bones.Head.rotateY(Math.sin(time*1.3)*.025);
      supports?.update();
    }else mixer.setTime(time);
  }
  return {root,model,bones,meshes,mixer,update,dispose(){
    supports?.dispose();mixer.stopAllAction();mixer.uncacheRoot(model);skeletons.forEach(value=>value.dispose());geometries.forEach(value=>value.dispose());materials.forEach(value=>value.dispose());textures.forEach(value=>value.dispose());root.removeFromParent();
  }};
}
