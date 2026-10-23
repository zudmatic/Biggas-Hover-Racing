import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createSceneBed} from '../src/scene-bed.js';
import {createZudModel} from '../src/zud-model.js';
import {createZudAnimator} from '../src/zud-animation.js';
import {HomeJourney} from '../src/home-journey.js';
import {createTwosClock} from '../src/twos.js';
import {layout} from '../src/home-layout.js';
import {ROOM_SCALE} from '../src/retro-room.js';

const originalBed=layout.bed;
test.afterEach(()=>{layout.bed=originalBed;});
async function fixture(){
  const saved=JSON.parse(readFileSync(new URL('../src/scene-base.json',import.meta.url))).objects.find(e=>e.model==='032');
  const bytes=readFileSync(new URL('../public/models/room-objects/032_single_bed_v01.glb',import.meta.url));
  const {scene:object}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  object.position.fromArray(saved.position);object.rotation.fromArray(saved.rotation);object.scale.fromArray(saved.scale);
  const bed=createSceneBed({object});expect(bed.item.getVisit(layout.home)).not.toBeNull();
  const model=createZudModel(),animator=createZudAnimator(model),actor=new THREE.Group();actor.scale.setScalar(ROOM_SCALE);actor.add(model.root);
  const cloth=[];object.traverse(mesh=>{if(mesh.isMesh&&/duvet|throw|fringe/.test(mesh.name))cloth.push(mesh);});
  const body=[];
  for(const part of [model.root.getObjectByName('Cabeza de Zud'),model.root.getObjectByName('Torso'),...model.arms,...model.feet])part.traverse(mesh=>{
    if(!mesh.isMesh)return;
    mesh.geometry.computeBoundingBox();
    const box=mesh.geometry.boundingBox,center=box.getCenter(new THREE.Vector3()),radii=box.getSize(new THREE.Vector3()).multiplyScalar(.42);
    body.push({mesh,center,radii});
  });
  return {bed,model,animator,actor,cloth,body};
}

// Test cloth triangles against interior body volumes, not just the final sleep
// pose: a blanket passing through an arm/head is still a collision when open.
function penetrations({cloth,body}){
  const hits=[],triangle=new THREE.Triangle(),closest=new THREE.Vector3(),origin=new THREE.Vector3();
  for(const part of body){
    const bodyBounds=new THREE.Box3().setFromObject(part.mesh);
    for(const mesh of cloth){
      if(!bodyBounds.intersectsBox(new THREE.Box3().setFromObject(mesh)))continue;
      const toBody=part.mesh.matrixWorld.clone().invert().multiply(mesh.matrixWorld),p=mesh.geometry.attributes.position,index=mesh.geometry.index;
      for(let i=0;i<(index?.count??p.count);i+=3){
        [triangle.a,triangle.b,triangle.c].forEach((v,j)=>v.fromBufferAttribute(p,index?index.getX(i+j):i+j).applyMatrix4(toBody).sub(part.center).divide(part.radii));
        triangle.closestPointToPoint(origin,closest);
        if(closest.lengthSq()<1){hits.push(mesh.name);break;}
      }
    }
  }
  return [...new Set(hits)];
}

for(const twos of [false,true])test(`bedding clears Zud throughout entry and exit${twos?' on twos':''}`,async()=>{
  const f=await fixture(),journey=new HomeJourney(),clock=createTwosClock(),collisions=[];
  const dt=1/60;
  for(let i=0;i<90;i++)f.animator.update({dt,motion:1});
  for(const intent of ['bed','home']){
    journey.go(intent);
    for(let frame=0;frame<600;frame++){
      journey.update(dt);const tick=clock.step(dt,{on:twos});
      if(tick.tick){
        f.actor.position.copy(journey.position);
        f.animator.update({state:intent==='bed'?'sleep':'idle',traveling:Boolean(journey.segment),time:frame*dt,dt:tick.dt,yaw:journey.heading,...journey.pose});
      }
      f.bed.update({lying:journey.pose.lying,opening:journey.bedOpening??0,dt});
      if(frame%3===0){
        f.actor.updateWorldMatrix(true,true);f.bed.item.object.updateWorldMatrix(true,true);
        const hits=penetrations(f);if(hits.length)collisions.push({phase:journey.phase,progress:journey.segment?.elapsed,hits});
      }
      if(!journey.segment&&frame>300)break;
    }
    expect(journey.phase).toBe(intent==='bed'?'resting':'idle');
  }
  f.model.dispose();
  expect(collisions.slice(0,8),`${collisions.length} frames penetrate bedding`).toEqual([]);
});

test('cancelling while opening, climbing or covering never closes the sheet through Zud',async()=>{
  for(const [phase,elapsed] of [['aligning',.3],['lying',.9],['covering',.4]]){
    const f=await fixture(),journey=new HomeJourney(),collisions=[];
    let interrupted=false;
    journey.go('bed');
    for(let frame=0;frame<600;frame++){
      if(!interrupted&&journey.phase===phase&&journey.segment.elapsed>=elapsed){journey.go('home');interrupted=true;}
      journey.update(1/60);f.actor.position.copy(journey.position);
      f.animator.update({traveling:Boolean(journey.segment),time:frame/60,yaw:journey.heading,...journey.pose});
      f.bed.update({lying:journey.pose.lying,opening:journey.bedOpening});
      if(frame%3===0){
        f.actor.updateWorldMatrix(true,true);f.bed.item.object.updateWorldMatrix(true,true);
        const hits=penetrations(f);if(hits.length)collisions.push({phase:journey.phase,hits});
      }
      if(interrupted&&journey.phase==='idle')break;
    }
    expect(interrupted).toBe(true);expect(journey.phase).toBe('idle');expect(journey.bedOpening).toBe(0);
    f.model.dispose();expect(collisions.slice(0,5),`cancel during ${phase}`).toEqual([]);
  }
});
