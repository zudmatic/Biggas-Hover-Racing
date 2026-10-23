import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {createBedBlanketGeometry} from '../src/bed-blanket.js';
import {createZudModel} from '../src/zud-model.js';
import {createZudAnimator} from '../src/zud-animation.js';
import {layout} from '../src/home-layout.js';
import {ROOM_SCALE} from '../src/retro-room.js';

test('the duvet covers the sleeping torso, arms and feet throughout breathing',()=>{
  const model=createZudModel(),animator=createZudAnimator(model),actor=new THREE.Group();
  actor.scale.setScalar(ROOM_SCALE);actor.position.copy(layout.bed.lie);actor.add(model.root);
  const cloth=createBedBlanketGeometry();cloth.update(1);
  const duvet=new THREE.Mesh(cloth.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  duvet.position.set(-1.59,0,-.63);duvet.updateMatrixWorld();
  const head=model.root.getObjectByName('Cabeza de Zud'),parts=[model.root.getObjectByName('Torso'),...model.arms,...model.feet];
  const ray=new THREE.Raycaster(),point=new THREE.Vector3(),down=new THREE.Vector3(0,-1,0);
  for(let frame=0;frame<360;frame++){
    animator.update({state:'sleep',lying:1,time:frame/60,motion:1});
    if(frame<120||frame%30)continue;
    actor.updateWorldMatrix(true,true);
    const exposed=[];
    for(const part of parts)part.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const positions=mesh.geometry.attributes.position;
      for(let i=0;i<positions.count;i++){
        point.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);
        ray.set(new THREE.Vector3(point.x,3,point.z),down);
        // The head itself conceals the neck; the rest must be beneath cloth.
        const hit=ray.intersectObjects([duvet,head],false)[0];
        if(!hit||hit.point.y<point.y+.005)exposed.push(point.toArray());
      }
    });
    expect(exposed).toEqual([]);
  }
  model.dispose();duvet.material.dispose();cloth.geometry.dispose();
});

test('the duvet remains a closed sheet without collapsed triangles and returns to its resting shape',()=>{
  const cloth=createBedBlanketGeometry(),geometry=cloth.geometry,positions=geometry.attributes.position,index=geometry.index;
  const rest=positions.array.slice(),edges=new Map();
  for(let i=0;i<index.count;i+=3)for(let j=0;j<3;j++){
    const a=index.getX(i+j),b=index.getX(i+(j+1)%3),key=[Math.min(a,b),Math.max(a,b)].join(':');
    edges.set(key,(edges.get(key)??0)+1);
  }
  expect([...edges.values()].every(count=>count===2)).toBe(true);
  const triangle=new THREE.Triangle();
  for(const amount of [0,.25,.5,.75,1,.5,0]){
    cloth.update(amount);
    let minimumArea=Infinity;
    for(let i=0;i<index.count;i+=3){
      [triangle.a,triangle.b,triangle.c].forEach((point,j)=>point.fromBufferAttribute(positions,index.getX(i+j)));
      minimumArea=Math.min(minimumArea,triangle.getArea());
    }
    expect(minimumArea).toBeGreaterThan(.0001);
  }
  expect(positions.array).toEqual(rest);geometry.dispose();
});
