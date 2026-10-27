import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createNomadaPilotSupports} from './pilot-supports';

// Seats any racer on the UE mannequin skeleton; the spec holds what differs per rig.

// Midpoints between the authored grip rings 001/002 and 007/008 in
// nomada-038.glb, after its +X to +Z conversion.
const NOMADA_GRIPS={r:new THREE.Vector3(-.4862,1.6809,.534),l:new THREE.Vector3(.4862,1.6809,.534)};

// Cache bytes, not a live rig: each preview/ship owns its pose and GPU resources.
const modelBytes=new Map();
async function loadModel(spec){
  if(!modelBytes.has(spec.url))modelBytes.set(spec.url,fetch(`${import.meta.env.BASE_URL}${spec.url}`).then(response=>{
    if(!response.ok)throw new Error(`No se pudo cargar ${spec.name}`);return response.arrayBuffer();
  }).catch(error=>{modelBytes.delete(spec.url);throw error;}));
  return new GLTFLoader().parseAsync(await modelBytes.get(spec.url),'');
}

export async function createMannequinPilot(spec,{seated=false,offset=[0,0,0],fit}={}){
  const gltf=await loadModel(spec),model=gltf.scene,root=new THREE.Group();root.name=spec.name;root.userData.pilot=spec.id;root.add(model);
  const bones={},meshes=[],geometries=new Set(),materials=new Set(),textures=new Set(),skeletons=new Set();
  model.traverse(object=>{
    if(object.isBone)bones[object.name]=object;
    if(!object.isMesh)return;
    meshes.push(object);geometries.add(object.geometry);if(object.skeleton)skeletons.add(object.skeleton);
    for(const material of [].concat(object.material)){
      materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
    }
    object.castShadow=spec.castShadow?.(object)??true;object.receiveShadow=true;object.frustumCulled=false;object.userData.system='cockpit';
  });
  const actor={root,model,bones,meshes};
  const mixer=new THREE.AnimationMixer(model),idle=gltf.animations.find(clip=>clip.name===(seated?spec.seatFrom??spec.idle:spec.idle));
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
    const shoulder=upper.getWorldPosition(new THREE.Vector3()),elbow=lower.getWorldPosition(new THREE.Vector3()),wrist=hand.getWorldPosition(new THREE.Vector3());
    const orientation=hand.getWorldQuaternion(new THREE.Quaternion()),palm=spec.palm(actor,side);
    // Place the palm on the actual rubber grip, rather than the wrist joint.
    const goal=target.clone().sub(palm.sub(wrist)),axis=goal.clone().sub(shoulder),a=shoulder.distanceTo(elbow),b=elbow.distanceTo(wrist),distance=axis.length();
    if(distance>=a+b||distance<=Math.abs(a-b))throw new Error(`${spec.name} no alcanza el manillar de la Nómada`);
    axis.normalize();const pole=new THREE.Vector3(side==='l'?.3:-.3,-1,-.3);pole.addScaledVector(axis,-pole.dot(axis)).normalize();
    const along=(a*a-b*b+distance*distance)/(2*distance),bend=Math.sqrt(Math.max(0,a*a-along*along));
    const joint=shoulder.clone().addScaledVector(axis,along).addScaledVector(pole,bend);
    aim(upper,lower,joint.sub(shoulder));lower.getWorldPosition(elbow);aim(lower,hand,goal.sub(elbow));
    hand.quaternion.copy(hand.parent.getWorldQuaternion(parentRotation).invert().multiply(orientation));hand.updateWorldMatrix(false,true);
  }
  if(seated){
    model.scale.setScalar(bike?spec.scale.nomada:spec.scale.cockpit);root.updateMatrixWorld(true);
    const extremityRotations=new Map(['foot_l','foot_r','hand_l','hand_r'].map(name=>[name,bones[name].getWorldQuaternion(new THREE.Quaternion())]));
    if(bike){
      // Hinge forward from the hips, while keeping the gaze on the road.
      const headRotation=bones.Head.getWorldQuaternion(new THREE.Quaternion());
      rotation.setFromAxisAngle(new THREE.Vector3(1,0,0),THREE.MathUtils.degToRad(25)).multiply(bones.pelvis.getWorldQuaternion(parentRotation));
      bones.pelvis.quaternion.copy(bones.pelvis.parent.getWorldQuaternion(parentRotation).invert().multiply(rotation));bones.pelvis.updateWorldMatrix(false,true);
      bones.Head.quaternion.copy(bones.Head.parent.getWorldQuaternion(parentRotation).invert().multiply(headRotation));bones.Head.updateWorldMatrix(false,true);
    }
    for(const side of ['l','r']){
      const sign=side==='l'?1:-1,foot=bones[`foot_${side}`],hand=bones[`hand_${side}`];
      const footRotation=extremityRotations.get(foot.name),handRotation=extremityRotations.get(hand.name);
      aim(bones[`thigh_${side}`],bones[`calf_${side}`],new THREE.Vector3(sign*(bike?.95:.12),bike?-.55:-.08,1));
      aim(bones[`calf_${side}`],foot,new THREE.Vector3(sign*(bike?.2:0),-1,bike?.15:0));
      foot.quaternion.copy(foot.parent.getWorldQuaternion(parentRotation).invert().multiply(footRotation));foot.updateWorldMatrix(false,true);
      aim(bones[`upperarm_${side}`],bones[`lowerarm_${side}`],new THREE.Vector3(sign*.22,-.7,bike?.7:.4));
      aim(bones[`lowerarm_${side}`],hand,new THREE.Vector3(sign*.1,.03,1));
      hand.quaternion.copy(hand.parent.getWorldQuaternion(parentRotation).invert().multiply(handRotation));hand.updateWorldMatrix(false,true);
    }
    const pelvis=bones.pelvis.getWorldPosition(new THREE.Vector3());
    model.position.add(new THREE.Vector3(0,bike?1.41:1.16,bike?-.18:-.32).sub(pelvis));root.updateMatrixWorld(true);
    if(bike)for(const side of ['r','l']){
      if(!spec.handlebarExtensions){gripHandlebar(side,NOMADA_GRIPS[side]);continue;}
      // Arms that cannot reach the grips point at them; extensions meet the palms.
      const elbow=bones[`lowerarm_${side}`],hand=bones[`hand_${side}`],handRotation=hand.getWorldQuaternion(new THREE.Quaternion());
      aim(bones[`upperarm_${side}`],elbow,NOMADA_GRIPS[side].clone().sub(bones[`upperarm_${side}`].getWorldPosition(from)));
      aim(elbow,hand,NOMADA_GRIPS[side].clone().sub(elbow.getWorldPosition(from)));
      hand.quaternion.copy(hand.parent.getWorldQuaternion(parentRotation).invert().multiply(handRotation));hand.updateWorldMatrix(false,true);
    }
    root.position.fromArray(offset);root.userData.fit=fit??'cockpit';root.updateMatrixWorld(true);
    if(bike){
      supports=createNomadaPilotSupports(root,{
        hands:spec.handlebarExtensions?['r','l'].map(side=>target=>target.copy(spec.palm(actor,side))):[],
        soles:['r','l'].map(side=>target=>{bones[`foot_${side}`].getWorldPosition(target);root.worldToLocal(target);target.y-=spec.sole.down*model.scale.x;target.z+=spec.sole.forward*model.scale.x;root.localToWorld(target);}),
      });supports.update();
    }else{
      // Short arms retain their proportions; control extensions meet the hands.
      const steel=new THREE.MeshStandardMaterial({color:0x566165,roughness:.65}),grip=new THREE.MeshStandardMaterial({color:0xb94b08,roughness:.8});materials.add(steel);materials.add(grip);
      const rodGeometry=new THREE.CylinderGeometry(.018,.018,1,6),gripGeometry=new THREE.SphereGeometry(.038,8,6);geometries.add(rodGeometry);geometries.add(gripGeometry);
      for(const [side,sign] of [['l',1],['r',-1]]){
        const base=new THREE.Vector3(sign*.32,1.15,.069),point=root.worldToLocal(bones[`hand_${side}`].getWorldPosition(new THREE.Vector3()));
        const rod=new THREE.Mesh(rodGeometry,steel),handle=new THREE.Mesh(gripGeometry,grip);rod.name=`Extensión del control de ${spec.name}`;handle.name=`Agarre de ${spec.name}`;
        to.copy(point).sub(base);rod.position.copy(base).add(point).multiplyScalar(.5);rod.scale.y=to.length();rod.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),to.normalize());handle.position.copy(point);root.add(rod,handle);
      }
    }
  }else{
    if(spec.stance)for(const [side,sign] of [['l',1],['r',-1]]){
      const [arm,forearm,hand]=[spec.stance.arm,spec.stance.forearm,spec.stance.hand].map(([x,y,z])=>new THREE.Vector3(sign*x,y,z));
      aim(bones[`upperarm_${side}`],bones[`lowerarm_${side}`],arm);aim(bones[`lowerarm_${side}`],bones[`hand_${side}`],forearm);aim(bones[`hand_${side}`],bones[`middle_01_${side}`],hand);
    }
    const bodyBounds=new THREE.Box3();for(const mesh of meshes)if(spec.standingHeight?.(mesh)??true)bodyBounds.expandByObject(mesh,true);
    model.scale.setScalar(3.2/bodyBounds.getSize(new THREE.Vector3()).y);
  }
  const headRest=bones.Head.quaternion.clone();let lastTime=-1,lastMoving;
  function update(time=0,moving=false){
    if(time===lastTime&&moving===lastMoving)return;lastTime=time;lastMoving=moving;
    if(seated){
      bones.Head.quaternion.copy(headRest);if(moving)bones.Head.rotateY(Math.sin(time*1.3)*.025);
      supports?.update();
    }else mixer.setTime(time);
  }
  return Object.assign(actor,{mixer,update,dispose(){
    supports?.dispose();mixer.stopAllAction();mixer.uncacheRoot(model);skeletons.forEach(value=>value.dispose());geometries.forEach(value=>value.dispose());materials.forEach(value=>value.dispose());textures.forEach(value=>value.dispose());root.removeFromParent();
  }});
}

export function meshCentroid(mesh){
  const center=new THREE.Vector3(),vertex=new THREE.Vector3(),count=mesh.geometry.attributes.position.count;
  for(let i=0;i<count;i++){mesh.getVertexPosition(i,vertex).applyMatrix4(mesh.matrixWorld);center.add(vertex);}
  return center.divideScalar(count);
}
