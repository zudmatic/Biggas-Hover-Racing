import {test,expect} from '@playwright/test';
import {enter,target} from './helpers.js';

test.setTimeout(120000);
async function fixture(page){
  await page.route('**/src/entry.js',route=>route.fulfill({contentType:'text/javascript',body:''}));await page.goto('/');
  await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {createRetroRoom}=await import('/src/retro-room.js');
    const {createSceneDocument}=await import('/src/scene-document.js');
    const {createSceneInteractions,configureSceneChair}=await import('/src/scene-interactions.js');
    const {layout}=await import('/src/home-layout.js');
    const room=createRetroRoom();await room.ready;const doc=createSceneDocument(room);await doc.restore();
    const changed=[...doc.entries.values()].filter(e=>doc.affected(e)),indices=new Set(changed.map(e=>e.obstacle));
    layout.obstacles=layout.obstacles.filter((_,i)=>!indices.has(i));
    for(const entry of doc.entries.values()){
      if(!entry.object.visible||entry.builtin&&!changed.includes(entry))continue;
      const b=new THREE.Box3().setFromObject(entry.object);
      if(b.max.y>.16&&b.min.y<1.6)layout.obstacles.push([b.min.x,b.max.x,b.min.z,b.max.z]);
    }
    configureSceneChair(room,doc);const interactions=createSceneInteractions(room,doc);
    const bed=room.interactables.find(i=>i.action==='sleep');
    window.fixture={THREE,room,doc,layout,interactions,bed};
  });
}

test('the supplied replacement bed has a reachable climb, covers the sleeping body and restores its bedding',async({page})=>{
  await fixture(page);
  const result=await page.evaluate(async()=>{
    const {THREE,room,doc,layout,interactions,bed}=window.fixture;
    const {HomeJourney}=await import('/src/home-journey.js');
    const {createZudModel}=await import('/src/zud-model.js');
    const {createZudAnimator}=await import('/src/zud-animation.js');
    const {ROOM_SCALE}=await import('/src/retro-room.js');
    const before=[];bed.object.traverse(m=>{if(m.isMesh&&/duvet|pillow|throw|fringe/.test(m.name))before.push({mesh:m,positions:m.geometry.attributes.position.array.slice()});});
    const visit=bed.getVisit(layout.home),journey=new HomeJourney(),phases=new Set();journey.go('bed');
    for(let i=0;i<1200&&journey.phase!=='resting';i++){phases.add(journey.phase);journey.update(1/60);}
    const model=createZudModel(),animator=createZudAnimator(model),actor=new THREE.Group();actor.scale.setScalar(ROOM_SCALE);actor.position.copy(layout.bed.lie);actor.add(model.root);
    for(let i=0;i<240;i++)animator.update({state:'sleep',lying:1,yaw:layout.bed.heading,time:i/60,motion:0});
    interactions.update({lying:1,reducedMotion:true});actor.updateMatrixWorld(true);bed.object.updateWorldMatrix(true,true);
    const head=model.root.getObjectByName('Cabeza de Zud'),parts=[model.root.getObjectByName('Torso'),...model.arms,...model.feet];
    const cover=before.filter(p=>/duvet|throw|fringe/.test(p.mesh.name)).map(p=>p.mesh),ray=new THREE.Raycaster(),point=new THREE.Vector3(),exposed=[];
    for(const part of parts)part.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const p=mesh.geometry.attributes.position;
      for(let i=0;i<p.count;i++){
        point.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);
        ray.set(new THREE.Vector3(point.x,4,point.z),new THREE.Vector3(0,-1,0));
        const hit=ray.intersectObjects([...cover,head],false)[0];
        if(!hit||hit.point.y<point.y+.005)exposed.push(point.toArray());
      }
    });
    const raised=before.some(({mesh,positions})=>mesh.geometry.attributes.position.array.some((n,i)=>Math.abs(n-positions[i])>.1));
    interactions.update({lying:0,reducedMotion:true});
    const restored=before.every(({mesh,positions})=>mesh.geometry.attributes.position.array.every((n,i)=>Math.abs(n-positions[i])<.000001));
    const resting=journey.phase;journey.go('home');for(let i=0;i<1200&&journey.phase!=='idle';i++)journey.update(1/60);
    return {visit:!!visit,visibleOriginal:doc.entries.get('bed').object.visible,phases:[...phases],resting,exposed:exposed.slice(0,10),exposedCount:exposed.length,raised,restored,woke:journey.phase==='idle'};
  });
  expect(result.visibleOriginal).toBe(false);expect(result.visit).toBe(true);
  expect(result.phases).toEqual(expect.arrayContaining(['walking','aligning','lying']));expect(result.resting).toBe('resting');
  expect(result.exposed,JSON.stringify(result)).toEqual([]);expect(result.raised).toBe(true);expect(result.restored).toBe(true);expect(result.woke).toBe(true);
});

test('sleeping follows the replacement bed after rotation and scaling',async({page})=>{
  await fixture(page);
  const result=await page.evaluate(async()=>{
    const {bed,layout}=window.fixture;
    const {HomeJourney}=await import('/src/home-journey.js');
    bed.object.position.set(0,.09,0);bed.object.rotation.y=Math.PI/2;bed.object.scale.setScalar(1.1);layout.obstacles=[];
    const visit=bed.getVisit(layout.home),journey=new HomeJourney();journey.go('bed',true);journey.update(1);
    const local=bed.object.worldToLocal(journey.position.clone());
    return {visit:!!visit,heading:journey.heading,phase:journey.phase,local:local.toArray(),side:journey.exit.toArray()};
  });
  expect(result.visit).toBe(true);expect(result.heading).toBeCloseTo(Math.PI/2);expect(result.phase).toBe('resting');
  expect(result.local[0]).toBeCloseTo(0);expect(result.local[2]).toBeLessThan(0);expect(result.local[1]).toBeGreaterThan(.5);
});

test('the new default scene sleeps, dreams, wakes and still works without a gallery',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await enter(page);
  const stage=page.locator('#stage'),p=await target(page,'sleep');
  await page.mouse.move(p.x,p.y);await expect(page.locator('#hover-hint')).toHaveText('Sleep');await page.mouse.click(p.x,p.y);
  await expect(stage).toHaveAttribute('data-activity','resting');await expect(stage).toHaveAttribute('data-state','sleep');
  await expect(stage).toHaveAttribute('data-dream','cheesecake',{timeout:15000});
  await page.screenshot({path:'.context/nueva-cama-dormir.png'});
  await page.keyboard.press('Escape');await expect(stage).toHaveAttribute('data-activity','idle');await expect(page.locator('#thought')).toBeHidden();
  await page.keyboard.press('6');await expect(stage).toHaveAttribute('data-activity','typing');
  await expect(page.locator('.work-gallery,.work-scroll-cue')).toHaveCount(0);
});
