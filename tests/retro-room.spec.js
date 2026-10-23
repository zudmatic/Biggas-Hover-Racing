import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {layout} from '../src/home-layout.js';
import {HomeJourney} from '../src/home-journey.js';
import {canStand,findWalkPath} from '../src/home-movement.js';
import {RETRO_SPOTS} from '../src/retro-room.js';
import {enter,act} from './helpers.js';

test('Retro room layout: Zud walks a clear route to the chair and sits facing the desk under the window',()=> {
  expect(layout.name).toBe('retro');
  const journey=new HomeJourney();
  expect(journey.position.distanceTo(RETRO_SPOTS.home)).toBe(0);
  expect(canStand(RETRO_SPOTS.home.x,RETRO_SPOTS.home.z)).toBe(true);
  expect(canStand(RETRO_SPOTS.aisle.x,RETRO_SPOTS.aisle.z)).toBe(true);
  // Below seat height Zud's feet never enter the chair: he steps up from its side.
  const seat=RETRO_SPOTS.seated,insideChair=p=>Math.abs(p.x-seat.x)<.42&&p.z>seat.z-.4&&p.z<seat.z+.64;
  const clearOfChair=()=>{if(journey.position.y<.72)expect(insideChair(journey.position),`feet in chair at ${journey.position.toArray()}`).toBe(false);};
  journey.go('desk');
  for(let i=0;i<600&&journey.phase!=='typing';i++){journey.update(1/60);clearOfChair();}
  expect(journey.phase).toBe('typing');
  expect(journey.position.distanceTo(RETRO_SPOTS.seated)).toBeLessThan(.001);
  expect(Math.abs(Math.atan2(Math.sin(journey.heading-Math.PI),Math.cos(journey.heading-Math.PI)))).toBeLessThan(.02);
  journey.go('home');
  for(let i=0;i<600&&journey.phase!=='idle';i++){journey.update(1/60);clearOfChair();}
  expect(journey.position.distanceTo(RETRO_SPOTS.home)).toBeLessThan(.001);
  // Furniture blocks walking, and a free spot always finds its way to the aisle.
  for(const [x,z] of [[-1.6,-.6],[1.3,-1.9],[-.35,-1.95],[-1.9,1.46]])expect(canStand(x,z)).toBe(false);
  const path=findWalkPath(new THREE.Vector3(-.3,.12,1.6),RETRO_SPOTS.aisle);
  expect(path.length).toBeGreaterThan(0);
});

test('Walking up to an object: a clear route from the rug or the desk, ending face to face with it',()=> {
  expect(layout.name).toBe('retro');
  const bedside={position:new THREE.Vector3(-.86,.12,1.46),heading:-Math.PI/2};
  expect(canStand(bedside.position.x,bedside.position.z)).toBe(true);
  for(const start of ['home','desk']) {
    const journey=new HomeJourney();
    if(start==='desk')journey.go('desk',true);
    journey.go('visit',false,bedside);
    let previous=journey.position.clone();
    for(let i=0;i<900&&(journey.segment||journey.segments.length);i++) {
      journey.update(1/60);
      if(journey.position.y<.3&&journey.phase==='walking')expect(canStand(journey.position.x,journey.position.z),`blocked at ${journey.position.toArray()}`).toBe(true);
      previous.copy(journey.position);
    }
    for(let i=0;i<60;i++)journey.update(1/60);
    expect(journey.phase).toBe('idle');
    expect(journey.position.distanceTo(bedside.position)).toBeLessThan(.001);
    expect(Math.abs(Math.atan2(Math.sin(journey.heading-bedside.heading),Math.cos(journey.heading-bedside.heading)))).toBeLessThan(.02);
  }
});

test('Bed: from the rug or the desk Zud walks to its side, climbs in to lie on the pillow, and gets off the same side',()=> {
  expect(layout.name).toBe('retro');
  const {bed}=RETRO_SPOTS;
  for(const start of ['home','desk']) {
    const journey=new HomeJourney();if(start==='desk')journey.go('desk',true);
    journey.go('bed');
    for(let i=0;i<900&&journey.phase!=='resting';i++) {
      journey.update(1/60);
      if(journey.phase==='walking')expect(canStand(journey.position.x,journey.position.z),`blocked at ${journey.position.toArray()}`).toBe(true);
    }
    expect(journey.phase).toBe('resting');expect(journey.position.distanceTo(bed.lie)).toBeLessThan(.001);
    journey.go('home');journey.update(1/60);
    expect(journey.phase).toBe('standing');
    for(let i=0;i<90&&journey.phase==='standing';i++)journey.update(1/60);
    expect(journey.position.distanceTo(bed.side)).toBeLessThan(.001);
    for(let i=0;i<600&&journey.phase!=='idle';i++){journey.update(1/60);if(journey.phase==='returning')expect(canStand(journey.position.x,journey.position.z)).toBe(true);}
    expect(journey.position.distanceTo(RETRO_SPOTS.home)).toBeLessThan(.001);
  }
});

test('Zud lives in the Retro Print room and keeps its desk route',async({page})=> {
  test.setTimeout(90000); // Software WebGL can stretch the capped animation clock.
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await enter(page);
  const stage=page.locator('#stage');
  await expect(stage).toHaveAttribute('data-room','retro');
  await act(page,'work');
  await expect(stage).toHaveAttribute('data-activity','typing',{timeout:25000});
  await page.getByRole('link',{name:'Home',exact:true}).click();
  await page.keyboard.down('ArrowDown');await expect(stage).toHaveAttribute('data-walk-cycle','walking');await page.keyboard.up('ArrowDown');
  await act(page,'work');
  await expect(stage).toHaveAttribute('data-activity','typing',{timeout:25000});
  expect(errors).toEqual([]);
});

test('Clicking room objects: glasses and cigarette send Zud to the nightstand, the plant gets watered, the laptop sends him to work',async({page})=> {
  // Zud walks to five objects in turn: a long end-to-end test.
  test.setTimeout(180000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await enter(page);await page.waitForTimeout(600);
  const stage=page.locator('#stage'),hint=page.locator('#hover-hint');
  const box=await page.locator('#zud-canvas').boundingBox();
  const targets=Object.fromEntries((await stage.getAttribute('data-targets')).split(' ').map(entry=>{
    const [action,x,y]=entry.split(':');return [action,{x:box.x+box.width*x/100,y:box.y+box.height*y/100}];
  }));
  expect(Object.keys(targets).sort()).toEqual(['blinds','clock','disco','sleep','smoke','water','work']);
  for(const [action,label] of [['disco','Put on glasses'],['smoke','Smoke'],['water','Water the plant'],['sleep','Sleep'],['work','Work']]) {
    await page.mouse.move(targets[action].x,targets[action].y);await expect(hint).toHaveText(label);
  }
  await page.mouse.click(targets.disco.x,targets.disco.y);
  await expect(hint).toBeHidden();
  await expect(stage).toHaveAttribute('data-walk-cycle','walking');
  await expect(stage).toHaveAttribute('data-state','disco',{timeout:25000});
  expect(await stage.getAttribute('data-targets')).not.toContain('disco');
  await page.keyboard.press('Escape');await page.waitForTimeout(1500);
  await page.mouse.click(targets.smoke.x,targets.smoke.y);
  await expect(stage).toHaveAttribute('data-state','smoke',{timeout:25000});
  await page.mouse.click(targets.water.x,targets.water.y);
  await expect(stage).toHaveAttribute('data-state','water',{timeout:25000});
  await page.mouse.click(targets.work.x,targets.work.y);
  await expect(stage).toHaveAttribute('data-activity','typing',{timeout:25000});
  // The bed: climb in, sleep and dream of cheesecake.
  await page.getByRole('link',{name:'Home',exact:true}).click();
  await page.mouse.click(targets.sleep.x,targets.sleep.y);
  await expect(stage).toHaveAttribute('data-dream','cheesecake',{timeout:30000});
  await expect(stage).toHaveAttribute('data-state','sleep');
  await expect(page.locator('#thought')).toBeVisible();
  // Click the open floor in the wider garden framing; the dream ends.
  await page.mouse.click(box.x+box.width*.53,box.y+box.height*.72);
  await expect(page.locator('#thought')).toBeHidden();
  await expect(stage).toHaveAttribute('data-walk-cycle','walking',{timeout:10000});
  await expect(stage).toHaveAttribute('data-walk-cycle','rest',{timeout:25000});
  expect(Number(await stage.getAttribute('data-position-z'))).toBeGreaterThan(.9);
  expect(errors).toEqual([]);
});
