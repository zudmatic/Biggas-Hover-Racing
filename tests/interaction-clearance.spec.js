import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createZudModel} from '../src/zud-model.js';
import {createZudAnimator} from '../src/zud-animation.js';
import {configureSceneChair} from '../src/scene-interactions.js';
import {HomeJourney} from '../src/home-journey.js';
import {canStand} from '../src/home-movement.js';
import {layout} from '../src/home-layout.js';
import {ROOM_SCALE} from '../src/retro-room.js';

const saved={...layout,workArmPitch:layout.workArmPitch,workLean:layout.workLean,sitLegPitch:layout.sitLegPitch,obstacles:layout.obstacles.map(box=>[...box])};
test.afterEach(()=>Object.assign(layout,{...saved,obstacles:saved.obstacles.map(box=>[...box])}));
const bounds=object=>new THREE.Box3().setFromObject(object,true);

function intersectsMeshBox(object,box){
  let hit=false;
  object.traverse(mesh=>{
    if(hit||!mesh.isMesh||!bounds(mesh).intersectsBox(box))return;
    const positions=mesh.geometry.attributes.position,index=mesh.geometry.index;
    for(let i=0;i<(index?.count??positions.count)&&!hit;i+=3){
      const triangle=new THREE.Triangle();
      [triangle.a,triangle.b,triangle.c].forEach((point,j)=>point.fromBufferAttribute(positions,index?index.getX(i+j):i+j).applyMatrix4(mesh.matrixWorld));
      hit=box.intersectsTriangle(triangle);
    }
  });
  return hit;
}

function intersectsHead(head,mesh){
  if(!bounds(head).intersectsBox(bounds(mesh)))return false;
  head.geometry.computeBoundingBox();
  const box=head.geometry.boundingBox,center=box.getCenter(new THREE.Vector3()),radii=box.getSize(new THREE.Vector3()).multiplyScalar(.5);
  const toHead=head.matrixWorld.clone().invert().multiply(mesh.matrixWorld),positions=mesh.geometry.attributes.position,index=mesh.geometry.index;
  const origin=new THREE.Vector3(),closest=new THREE.Vector3();
  for(let i=0;i<(index?.count??positions.count);i+=3){
    const triangle=new THREE.Triangle();
    [triangle.a,triangle.b,triangle.c].forEach((point,j)=>point.fromBufferAttribute(positions,index?index.getX(i+j):i+j).applyMatrix4(toHead).sub(center).divide(radii));
    triangle.closestPointToPoint(origin,closest);
    if(closest.lengthSq()<1)return true;
  }
  return false;
}

async function workstation(){
  const scene=JSON.parse(readFileSync(new URL('../src/scene-base.json',import.meta.url)));
  const entry=scene.objects.find(entry=>entry.model==='001');
  const buffer=readFileSync(new URL('../public/models/room-objects/001_swivel_desk_chair_v01.glb',import.meta.url));
  const {scene:chair}=await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'');
  chair.position.fromArray(entry.position);chair.rotation.fromArray(entry.rotation);chair.scale.fromArray(entry.scale);chair.updateWorldMatrix(true,true);
  const oldBounds=new THREE.Box3().setFromObject(chair);
  layout.obstacles=layout.obstacles.filter((_,i)=>i!==4);
  layout.obstacles.push([oldBounds.min.x,oldBounds.max.x,oldBounds.min.z,oldBounds.max.z]);
  const laptop=new THREE.Group();laptop.position.fromArray(scene.builtins.find(entry=>entry.id==='laptop').position);
  const original=new THREE.Group();original.visible=false;
  const fit=configureSceneChair(null,{entries:new Map([['chair',{object:original}],['laptop',{object:laptop}],['replacement',{...entry,object:chair}]])});
  expect(fit).not.toBeNull();
  const model=createZudModel(),animator=createZudAnimator(model),actor=new THREE.Group();actor.scale.setScalar(ROOM_SCALE);actor.add(model.root);
  const protectedParts=['Cabeza de Zud','Beanie de Zud'].map(name=>model.root.getObjectByName(name));
  return {chair,laptop,model,animator,actor,protectedParts};
}

function pose(fixture,journey,time,motion=1){
  fixture.actor.position.copy(journey.position);
  fixture.animator.update({state:'work',time,motion,typingAtDesk:journey.phase==='typing',workPose:['typing','sitting'].includes(journey.phase),
    traveling:journey.phase!=='typing',deskReach:layout.deskReach,workArmPitch:layout.workArmPitch,workLean:layout.workLean,sitLegPitch:layout.sitLegPitch,yaw:journey.heading,...journey.pose});
  fixture.actor.updateWorldMatrix(true,true);
}

function chairClearance({chair,protectedParts},phase){
  const bodyBounds=protectedParts.map(bounds);
  const overlaps=[];
  chair.traverse(mesh=>{if(mesh.isMesh)for(const [i,box] of bodyBounds.entries()){
    if(i===0?intersectsHead(protectedParts[i],mesh):box.intersectsBox(bounds(mesh)))overlaps.push(`${protectedParts[i].name} intersects ${mesh.name} while ${phase}`);
  }});
  expect(overlaps).toEqual([]);
}

test('the supplied swivel chair fits the head and beanie, and the keyboard stays below the chin',async()=>{
  const fixture=await workstation(),journey=new HomeJourney();journey.go('desk',true);
  for(const motion of [0,1])for(let frame=0;frame<120;frame++){
    pose(fixture,journey,frame/60,motion);
    if(frame<60)continue;
    chairClearance(fixture,'typing');
    const [head,hat]=fixture.protectedParts.map(bounds);
    // Keyboard/base top is y=1.237; the open screen is behind z=-1.9.
    expect(head.min.y).toBeGreaterThan(fixture.laptop.position.y+.045);
    expect(Math.min(head.min.z,hat.min.z)).toBeGreaterThan(-1.89);
    for(const socket of fixture.model.rig.hands){
      const hand=socket.getWorldPosition(new THREE.Vector3());
      expect(hand.y).toBeGreaterThan(fixture.laptop.position.y+.015);
      expect(hand.y).toBeLessThan(fixture.laptop.position.y+.065);
      expect(hand.z).toBeLessThan(fixture.laptop.position.z+.31);
    }
  }
  expect(canStand(layout.chair.x,layout.chair.z)).toBe(true);
  expect(canStand(fixture.chair.position.x,fixture.chair.position.z)).toBe(false);
  fixture.model.dispose();
});

test('the head clears the chair during the approach, sit and dismount',async()=>{
  const fixture=await workstation(),journey=new HomeJourney();
  journey.go('desk');
  for(let frame=0;frame<480;frame++){
    journey.update(1/60);pose(fixture,journey,frame/60);
    chairClearance(fixture,journey.phase);
  }
  expect(journey.phase).toBe('typing');
  journey.go('home');expect(journey.pose.seated).toBe(1);
  for(let frame=0;frame<480;frame++){
    journey.update(1/60);pose(fixture,journey,frame/60);
    chairClearance(fixture,journey.phase);
  }
  expect(journey.phase).toBe('idle');expect(journey.pose).toEqual({seated:0,lying:0,reach:0});
  fixture.model.dispose();
});

test('sleeping lies horizontally above the bedding and stays inside the headboard',()=>{
  const model=createZudModel(),animator=createZudAnimator(model),actor=new THREE.Group();
  actor.scale.setScalar(ROOM_SCALE);actor.add(model.root);actor.position.copy(layout.bed.lie);
  for(const motion of [0,1])for(let frame=0;frame<180;frame++){
    animator.update({state:'sleep',time:frame/60,lying:1,motion});actor.updateWorldMatrix(true,true);
    if(frame<90)continue;
    for(const name of ['Cabeza de Zud','Beanie de Zud']){
      const box=bounds(model.root.getObjectByName(name));
      expect(box.min.y,`${name} above mattress`).toBeGreaterThan(.90);
      expect(box.min.z,`${name} in front of headboard`).toBeGreaterThan(-2.21);
    }
    // A recumbent pose: the body follows the bed, rather than sitting up.
    expect(model.root.rotation.x).toBeLessThan(-1.4);
    const torso=bounds(model.root.getObjectByName('Torso'));
    expect(torso.max.z-torso.min.z).toBeGreaterThan(torso.max.y-torso.min.y);
  }
  const journey=new HomeJourney();journey.go('bed',true);journey.go('home');
  expect(journey.pose.lying).toBe(1);
  model.dispose();
});

test('the legs clear the seat cushion instead of passing through its front edge',async()=>{
  const fixture=await workstation(),journey=new HomeJourney();journey.go('desk',true);
  for(let frame=0;frame<90;frame++)pose(fixture,journey,frame/60,0);
  let seat;fixture.chair.traverse(mesh=>{if(/terracotta_upholstered_seat/.test(mesh.name))seat=mesh;});
  // Test actual triangles: a bent leg's bounding box can overlap a seat
  // even though its foot hangs safely in front of it. Allow soft contact.
  const cushion=bounds(seat).expandByScalar(-.008);let intersections=0;
  for(const foot of fixture.model.feet)foot.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const positions=mesh.geometry.attributes.position,index=mesh.geometry.index;
    for(let i=0;i<(index?.count??positions.count);i+=3){
      const triangle=new THREE.Triangle();
      [triangle.a,triangle.b,triangle.c].forEach((point,j)=>point.fromBufferAttribute(positions,index?index.getX(i+j):i+j).applyMatrix4(mesh.matrixWorld));
      if(cushion.intersectsTriangle(triangle))intersections++;
    }
  });
  expect(intersections).toBe(0);fixture.model.dispose();
});

test('climbing into bed and getting up keep the head clear of the pillow and headboard',()=>{
  const model=createZudModel(),animator=createZudAnimator(model),actor=new THREE.Group(),journey=new HomeJourney();
  actor.scale.setScalar(ROOM_SCALE);actor.add(model.root);
  const pillow=new THREE.Box3(new THREE.Vector3(-2.1,.83,-2.12),new THREE.Vector3(-1.08,.95,-1.50));
  const headboard=new THREE.Box3(new THREE.Vector3(-2.4,.23,-2.37),new THREE.Vector3(-.78,1.185,-2.21));
  for(const intent of ['bed','home']){
    journey.go(intent);
    for(let frame=0;frame<480;frame++){
      journey.update(1/60);actor.position.copy(journey.position);
      animator.update({traveling:Boolean(journey.segment),yaw:journey.heading,time:frame/60,...journey.pose});actor.updateWorldMatrix(true,true);
      for(const name of ['Cabeza de Zud','Beanie de Zud']){
        const box=bounds(model.root.getObjectByName(name));
        expect(intersectsMeshBox(model.root.getObjectByName(name),pillow),`${name} intersects pillow while ${journey.phase} at ${journey.segment?.elapsed}, pitch ${model.root.rotation.x}`).toBe(false);
        expect(box.intersectsBox(headboard),`${name} intersects headboard while ${journey.phase}`).toBe(false);
      }
    }
    expect(journey.phase).toBe(intent==='bed'?'resting':'idle');
  }
  model.dispose();
});


test('the seated torso is supported within the cushion rather than perched beyond its edge',async()=>{
  const fixture=await workstation(),journey=new HomeJourney();journey.go('desk',true);
  for(let frame=0;frame<120;frame++)pose(fixture,journey,frame/60,0);
  let seat;fixture.chair.traverse(mesh=>{if(/terracotta_upholstered_seat/.test(mesh.name))seat=mesh;});
  const cushion=bounds(seat),torso=bounds(fixture.model.root.getObjectByName('Torso'));
  expect(torso.min.y-cushion.max.y).toBeGreaterThanOrEqual(0);
  expect(torso.min.y-cushion.max.y).toBeLessThan(.025);
  for(const axis of ['x','z']){
    expect(torso.min[axis]).toBeGreaterThan(cushion.min[axis]);
    expect(torso.max[axis]).toBeLessThan(cushion.max[axis]);
  }
  fixture.model.dispose();
});
