import {test,expect} from '@playwright/test';
import {enter} from './helpers.js';

test('Window click closes and reopens the blind without interrupting the character',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await enter(page);
  const stage=page.locator('#stage'),hint=page.locator('#hover-hint');
  await expect(stage).toHaveAttribute('data-blinds','open');
  await expect(stage).toHaveAttribute('data-lamp','off');
  const clickWindow=async label=>{
    const bounds=await page.locator('#zud-canvas').boundingBox();
    const target=(await stage.getAttribute('data-targets')).split(' ').find(t=>t.startsWith('blinds:'));
    const [,x,y]=target.split(':').map(Number);
    await page.mouse.move(bounds.x+bounds.width*x/100,bounds.y+bounds.height*y/100);
    await expect(hint).toHaveText(label);await page.mouse.down();await page.mouse.up();
  };
  await page.waitForTimeout(1200);
  const state=await stage.getAttribute('data-state');
  await clickWindow('Lower the blind');
  await expect(stage).toHaveAttribute('data-blinds','closed');
  await expect(stage).toHaveAttribute('data-lamp','on');
  await expect(stage).toHaveAttribute('data-state',state);
  await page.waitForTimeout(1200);
  await clickWindow('Raise the blind');
  await expect(stage).toHaveAttribute('data-blinds','open');
  await expect(stage).toHaveAttribute('data-lamp','off');
  await page.screenshot({path:'.context/window-projection.png'});
  expect(errors).toEqual([]);
});

test('Blind blocks the view, powers a real lamp and updates diffuse transport; wall joints have no internal caps',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {createRetroRoom}=await import('/src/retro-room.js');
    const {createRetroLighting}=await import('/src/retro-lighting.js');
    const room=createRetroRoom(),scene=new THREE.Scene();scene.add(room.room);
    const lighting=createRetroLighting(scene);lighting.setEnvironment({patches:room.bouncePatches,blockers:room.bounceBlockers,lights:room.lights});lighting.bind(room.room);
    const update=()=>{room.update(false,0,0,{reducedMotion:true});lighting.update(0,{room:true,daylight:room.daylight,reducedMotion:true});};
    const snapshot=()=>({lamp:room.lights[0].intensity,sun:lighting.key.intensity,revision:lighting.revision,height:room.room.getObjectByName('Tela de la persiana').scale.y});
    update();const open=snapshot();room.interactables.find(i=>i.action==='blinds').activate();update();const closed=snapshot();
    room.interactables.find(i=>i.action==='blinds').activate();update();const reopened=snapshot();
    // Interior joint at x=-2.35, behind the inner back wall, must not contain
    // either of the old opposing caps that occupied the same plane.
    let internalCaps=0;
    room.room.getObjectByName('Paredes').traverse(o=>{
      if(!o.isMesh)return;const p=o.geometry.attributes.position;
      for(let i=0;i<p.count;i+=3){
        const vertices=[0,1,2].map(n=>new THREE.Vector3().fromBufferAttribute(p,i+n).add(o.position));
        if(vertices.every(v=>Math.abs(v.x+2.35)<.00001)&&vertices.every(v=>v.z<=-2.35+.00001))internalCaps++;
      }
    });
    const outsideShadow=room.room.children.some(o=>o.isMesh&&o.position.y<-.43&&o.material.transparent);
    const floor=new THREE.Box3().setFromObject(room.room.getObjectByName('Acabado del piso'));
    lighting.dispose();return {open,closed,reopened,internalCaps,outsideShadow,floorMin:floor.min.toArray()};
  });
  expect(result.open.lamp).toBe(0);expect(result.closed.lamp).toBeGreaterThan(2);
  expect(result.closed.sun).toBeLessThan(result.open.sun/4);
  expect(result.closed.height).toBeGreaterThan(1.35);
  expect(result.closed.revision).toBeGreaterThan(result.open.revision);
  expect(result.reopened.lamp).toBe(0);expect(result.reopened.sun).toBe(result.open.sun);
  expect(result.internalCaps).toBe(0);expect(result.outsideShadow).toBe(false);
  // The floor finish may meet the plaster, but cannot extend underneath its
  // exposed end cap (the previous floor began at -2.73 on both axes).
  expect(result.floorMin[0]).toBeGreaterThan(-2.351);expect(result.floorMin[2]).toBeGreaterThan(-2.351);
});
