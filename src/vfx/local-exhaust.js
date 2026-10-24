import * as THREE from 'three';
import {createFlameMaterial} from './flame-material.js';

// Lightweight local flame for model viewers. Racing uses the world-space
// history and particle system in boost.js instead.
export function createLocalExhaust(root,nozzles){
  const flame=createFlameMaterial(),geometry=new THREE.PlaneGeometry(1,1,1,16);
  geometry.translate(0,.5,0);geometry.rotateX(-Math.PI/2);
  const jets=nozzles.map(([x,y,z,radius])=>{
    const group=new THREE.Group();group.position.set(x,y,z);root.add(group);
    for(let i=0;i<3;i++){const mesh=new THREE.Mesh(geometry,flame.material);mesh.rotation.z=i*Math.PI/3;group.add(mesh);}
    return {group,radius};
  });
  let lastTime=0,power=.45;
  return {jets,material:flame.material,
    update(time,speed,boost,reduced,state){
      const dt=Math.max(0,Math.min(.1,time-lastTime));lastTime=time;
      const target=state?.braking?.2:boost?3.5:.45+Math.min(speed,55)*.024;
      power=time===0?target:power+(target-power)*(1-Math.exp(-dt*14));
      flame.update(reduced?0:time,{Turbulencia:reduced?0:1.3,Trama:'Dither','Densidad llama':.82},boost);
      for(const {group,radius} of jets)group.scale.set(radius*2,radius*2,power);
    },
    dispose(){jets.forEach(({group})=>group.removeFromParent());geometry.dispose();flame.material.dispose();}
  };
}
