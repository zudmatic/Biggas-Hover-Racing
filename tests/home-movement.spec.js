import {test,expect} from '@playwright/test';
import {enter,act} from './helpers.js';
import {HomeJourney} from '../src/home-journey.js';
import {HomeMovement,canStand,findWalkPath} from '../src/home-movement.js';
import * as THREE from 'three';
import {layout} from '../src/home-layout.js';

const advance=(movement,keys,seconds,yaw=0)=>{for(let i=0;i<seconds*60;i++)movement.update(1/60,new Set(keys),yaw);};

test('Movement is camera-relative, diagonal speed is normalized and walls/furniture block travel',()=>{
  const route=new HomeJourney(),move=new HomeMovement(route);move.takeControl();route.position.z=1.3;const start=route.position.clone();
  advance(move,['ArrowRight'],.4,Math.PI/4);
  expect(route.position.x).toBeGreaterThan(start.x);expect(route.position.z).toBeLessThan(start.z);
  expect(route.position.distanceTo(start)).toBeCloseTo(.66,2);
  const before=route.position.clone();advance(move,['ArrowRight','ArrowDown'],.2,Math.PI/4);
  expect(route.position.distanceTo(before)).toBeCloseTo(.33,2);
  for(const key of ['ArrowRight','ArrowUp','ArrowLeft','ArrowDown']) {
    for(let i=0;i<600;i++){move.update(1/60,new Set([key]),0);expect(canStand(route.position.x,route.position.z)).toBe(true);}
  }
});

test('Jump lands once, rejects midair double jumps, and takes over an automatic journey',()=>{
  const route=new HomeJourney();route.go('desk');route.update(.3);
  const move=new HomeMovement(route);move.jump();expect(route.segment).toBe(null);
  advance(move,[],.2);expect(move.height).toBeGreaterThan(.4);
  const velocity=move.velocity;move.jump();expect(move.velocity).toBe(velocity);
  advance(move,[],1);expect(move.height).toBe(0);expect(route.phase).toBe('idle');
  for(let i=0;i<500;i++)move.update(1/60,new Set(),0);
  expect(route.phase).not.toBe('typing');
});

test('Manual positions route around furniture before resuming work',()=>{
  const target=layout.aisle;
  // Free spots in every part of the room: by the nightstand, between bed and
  // chair, beside the desk and in the open corner.
  for(const [x,z] of [[-1.15,2],[-.16,-.9],[2, .4],[1.9,1.9]]) {
    const start=new THREE.Vector3(x,.12,z);expect(canStand(x,z)).toBe(true);
    const path=findWalkPath(start,target);expect(path.length).toBeGreaterThan(0);
    let from=start;
    for(const to of path){for(let i=0;i<=50;i++){const p=from.clone().lerp(to,i/50);expect(canStand(p.x,p.z)).toBe(true);}from=to;}
    const route=new HomeJourney();route.position.copy(start);route.intent='manual';route.go('desk');
    for(let i=0;i<1200;i++)route.update(1/60);
    expect(route.phase).toBe('typing');
  }
});

test('Arrows walk, Space jumps once, blur stops motion and work still works',async({page})=>{
  test.setTimeout(90000); // Includes loading, jumping and a full desk journey in software WebGL.
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await enter(page);
  const stage=page.locator('#stage');
  const initial=await stage.getAttribute('data-position-x');
  await page.keyboard.down('ArrowRight');await expect(stage).toHaveAttribute('data-walk-cycle','walking');await page.waitForTimeout(300);await page.keyboard.up('ArrowRight');
  await expect(stage).not.toHaveAttribute('data-position-x',initial);
  await page.keyboard.down('Space');await expect.poll(async()=>Number(await stage.getAttribute('data-jump-height'))).toBeGreaterThan(.25);
  await page.screenshot({path:'.context/zud-house-jump.png',fullPage:true});
  await expect(stage).toHaveAttribute('data-walk-cycle','rest');
  await expect(stage).toHaveAttribute('data-jump-height','0.000');await page.keyboard.up('Space');
  await page.keyboard.down('ArrowDown');await page.waitForTimeout(100);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await page.waitForTimeout(100);const stopped=await stage.getAttribute('data-position-z');await page.waitForTimeout(200);
  await expect(stage).toHaveAttribute('data-position-z',stopped);await expect(stage).toHaveAttribute('data-walk-cycle','rest');await page.keyboard.up('ArrowDown');
  await act(page,'work');await expect(stage).toHaveAttribute('data-activity','typing',{timeout:25000});
  await page.keyboard.press('ArrowDown');await expect(stage).toHaveAttribute('data-activity','typing');
  await page.getByRole('link',{name:'Home',exact:true}).click();
  await expect(stage).not.toHaveAttribute('data-activity','typing');
  const position=await stage.getAttribute('data-position-x');
  await page.keyboard.down('ArrowRight');await expect(stage).not.toHaveAttribute('data-position-x',position);await page.keyboard.up('ArrowRight');
  expect(errors).toEqual([]);
});

test('The head and folded beanie stay clear of furniture, back posts and walls',()=>{
  // These positions used to fit the small foot collider but clipped the mesh.
  for(const [x,z] of [[-.3,-.6],[1.2,.2],[1.99,-.85],[-2,1.95],[-.35,-1.15]]) {
    expect(canStand(x,z),`mesh overlap at ${x}, ${z}`).toBe(false);
  }
  for(const point of [layout.home,layout.aisle,layout.chair,layout.stand,layout.bed.side]) {
    expect(canStand(point.x,point.z)).toBe(true);
  }
});

test('Long movement frames cannot tunnel through obstacles, including while jumping',()=>{
  layout.obstacles.push([0,.04,1.4,1.6]);
  try {
  for(const jumping of [false,true]) {
    const route=new HomeJourney(),move=new HomeMovement(route);
    route.position.set(1.5,layout.home.y,1.5);move.takeControl();
    if(jumping)move.jump();
    move.update(1.3,new Set(['ArrowLeft']),0);
    expect(route.position.x).toBeGreaterThanOrEqual(.60);
    expect(canStand(route.position.x,route.position.z)).toBe(true);
  }
  } finally {layout.obstacles.pop();}
});

test('An unreachable destination never replaces a safe route with a walk through furniture',()=>{
  const route=new HomeJourney();route.go('desk');
  const segment=route.segment;
  const target=new THREE.Vector3(-1.6,layout.home.y,-.6);
  expect(findWalkPath(layout.home,target)).toEqual([]);
  expect(route.go('visit',false,{position:target,heading:0})).toBe(false);
  expect(route.segment).toBe(segment);
  expect(route.intent).toBe('desk');
  // A solid partition leaves valid floor on both sides, but no connecting path.
  layout.obstacles.push([-layout.limit,layout.limit,.8,.9]);
  try {
    const destination=new THREE.Vector3(1,layout.home.y,1.8);
    expect(canStand(destination.x,destination.z)).toBe(true);
    expect(route.go('visit',false,{position:destination,heading:0})).toBe(false);
    expect(route.segment).toBe(segment);
    expect(route.intent).toBe('desk');
  } finally {layout.obstacles.pop();}
});

test('Walking collider encloses the animated character mesh at every heading',async({page})=>{
  await page.route('**/collision-probe',route=>route.fulfill({contentType:'text/html',body:'<main></main>'}));
  await page.goto('/collision-probe');
  const result=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {createZudModel}=await import('/src/zud-model.js');
    const {createZudAnimator}=await import('/src/zud-animation.js');
    const {layout}=await import('/src/home-layout.js');
    const {ROOM_SCALE}=await import('/src/retro-room.js');
    const model=createZudModel(),animator=createZudAnimator(model);
    const point=new THREE.Vector3();let radius=0;
    for(let frame=0;frame<120;frame++) {
      animator.update({time:frame/60,dt:1/60,traveling:true,yaw:frame/120*Math.PI*2,gait:{weight:1,phase:frame/120*Math.PI*4}});
      model.root.updateMatrixWorld(true);
      model.root.traverseVisible(mesh=>{
        if(!mesh.isMesh)return;
        const position=mesh.geometry.attributes.position;
        for(let i=0;i<position.count;i++) {
          point.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
          radius=Math.max(radius,Math.hypot(point.x,point.z)*ROOM_SCALE);
        }
      });
    }
    return {radius,collider:layout.radius};
  });
  expect(result.radius).toBeGreaterThan(.5);
  expect(result.radius).toBeLessThanOrEqual(result.collider);
});
