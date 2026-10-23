import * as THREE from 'three';
import {createZudModel} from './zud-model.js';

// The original chair is sized for a conventional pilot. Zud keeps his proportions;
// adjustable control extensions and a footrest accommodate his short limbs.
export function createSpaceshipPilot({offset=[0,0,0]}={}) {
  const actor=createZudModel({detail:'medium',curve:0,comic:false});
  const root=new THREE.Group();root.name='Zud al mando';root.visible=false;root.position.fromArray(offset);
  const zud=actor.root;root.add(zud);zud.scale.setScalar(.36);zud.position.set(0,1.31,-.24);
  actor.feet.forEach((hip,i)=>{hip.rotation.set(-1.52,0,i?-.06:.06);actor.rig.knees[i].rotation.x=.85;});
  const steel=new THREE.MeshStandardMaterial({color:0x566165,roughness:.65});
  const grip=new THREE.MeshStandardMaterial({color:0xb94b08,roughness:.8});
  const extensionGeometry=new THREE.CylinderGeometry(.018,.018,1,6);
  const gripGeometry=new THREE.SphereGeometry(.038,8,6);
  const connections=[-1,1].map(side=>{
    const rod=new THREE.Mesh(extensionGeometry,steel),handle=new THREE.Mesh(gripGeometry,grip);
    rod.name='Extensión del control';handle.name='Agarre de pilotaje';root.add(rod,handle);
    return {rod,handle,base:new THREE.Vector3(side*.32,1.15,.069)};
  });
  const restGeometry=new THREE.BoxGeometry(.43,.035,.10),footrest=new THREE.Mesh(restGeometry,steel);
  footrest.name='Reposapiés del piloto';footrest.position.set(0,.875,-.115);root.add(footrest);
  root.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.system='cockpit';}});
  const hand=new THREE.Vector3(),direction=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
  let lastTime=-1;
  function update(time=0,moving=false){
    const t=moving?time:0;if(t===lastTime)return;lastTime=t;
    actor.arms.forEach((arm,i)=>{arm.rotation.set(-1.35+Math.sin(t*1.3+i)*.045*Number(moving),0,i?-.22:.22);actor.rig.elbows[i].rotation.x=-.3;});
    actor.rig.update();
    const blink=t%4.8;actor.eyeController.pose(moving&&blink>4.55?1-Math.sin((blink-4.55)/.25*Math.PI):1,1/60);
    root.updateWorldMatrix(true,true);
    connections.forEach(({rod,handle,base},i)=>{
      actor.rig.hands[i].getWorldPosition(hand);root.worldToLocal(hand);
      handle.position.copy(hand);direction.copy(hand).sub(base);
      rod.position.copy(base).add(hand).multiplyScalar(.5);rod.scale.y=direction.length();rod.quaternion.setFromUnitVectors(up,direction.normalize());
    });
  }
  update();
  return {root,actor,update,dispose(){actor.dispose();extensionGeometry.dispose();gripGeometry.dispose();restGeometry.dispose();steel.dispose();grip.dispose();}};
}
