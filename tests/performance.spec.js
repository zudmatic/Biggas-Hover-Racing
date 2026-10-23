import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {createOcclusionQuery} from '../src/occlusion-query.js';
import {createRoomBatches,ROOM_SOURCE_LAYER} from '../src/room-batches.js';

test('Occlusion queries match exact raycasts and invalidate for motion, visibility and deformation',()=>{
  const root=new THREE.Group(),objects=[];
  for(let i=0;i<30;i++){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(.5,.5,.5),new THREE.MeshBasicMaterial());
    mesh.position.set((i%6)-3,1+Math.floor(i/6),0);root.add(mesh);objects.push(mesh);
  }
  const query=createOcclusionQuery(),ray=new THREE.Raycaster();
  const compare=()=>{
    root.updateMatrixWorld(true);query.sync(objects);
    for(let i=0;i<31;i++){
      const origin=new THREE.Vector3(i/5-3,0,0),direction=new THREE.Vector3(0,1,0);
      ray.set(origin,direction);ray.near=.035;ray.far=10;
      const expected=!ray.intersectObjects(objects,false).some(hit=>hit.object.visible);
      expect(query.unblocked(origin,direction,10)).toBe(expected);
    }
  };
  compare();const before=query.stats.triangleQueries;compare();
  expect(query.stats.triangleQueries).toBe(before);expect(query.stats.cacheHits).toBe(31);
  expect(before).toBeLessThan(31*objects.length/4);
  objects[0].position.z=10;objects[1].visible=false;compare();
  objects[2].geometry.translate(0,0,10);compare();
});

test('Room batches preserve authored picking and restore changing geometry or materials',()=>{
  const root=new THREE.Group(),material=new THREE.MeshBasicMaterial(),meshes=[];
  for(let i=0;i<4;i++){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(.5,.5,.5),material);mesh.position.x=i;root.add(mesh);meshes.push(mesh);
  }
  const batches=createRoomBatches(root);expect(batches.batches).toHaveLength(1);
  const batch=batches.batches[0];expect(meshes[0].layers.isEnabled(ROOM_SOURCE_LAYER)).toBe(true);
  meshes[0].position.y=2;meshes[1].visible=false;batches.update();
  const matrix=new THREE.Matrix4();batch.getMatrixAt(0,matrix);expect(matrix.elements[13]).toBe(2);
  expect(batch.getVisibleAt(1)).toBe(false);
  root.updateMatrixWorld(true);const ray=new THREE.Raycaster(new THREE.Vector3(0,2,4),new THREE.Vector3(0,0,-1));ray.layers.enable(ROOM_SOURCE_LAYER);
  expect(ray.intersectObject(root,true)[0].object).toBe(meshes[0]);
  meshes[2].geometry.translate(0,1,0);meshes[3].material=material.clone();batches.update();
  expect(meshes[2].layers.mask).toBe(1);expect(batch.getVisibleAt(2)).toBe(false);
  expect(meshes[3].layers.mask).toBe(1);expect(batch.getVisibleAt(3)).toBe(false);
  batches.dispose();expect(meshes.every(mesh=>mesh.layers.mask===1)).toBe(true);
});

test('Repeated frame UI values do not mutate DOM, and intervening actions remain authoritative',async({page})=>{
  await page.route('**/performance-probe',route=>route.fulfill({contentType:'text/html',body:'<div id="probe"></div>'}));await page.goto('/performance-probe');
  const result=await page.evaluate(async()=>{
    const {setData,setText,setStyle}=await import('/src/frame-dom.js');const element=document.querySelector('#probe');
    setData(element,'time','10:10');setText(element,'Ready');setStyle(element,'left','10px');
    const observer=new MutationObserver(()=>{});observer.observe(element,{attributes:true,childList:true});
    for(let i=0;i<60;i++){setData(element,'time','10:10');setText(element,'Ready');setStyle(element,'left','10px');}
    const unchanged=observer.takeRecords().length;
    element.textContent='Action';setText(element,'Ready');observer.disconnect();return {unchanged,text:element.textContent};
  });
  expect(result).toEqual({unchanged:0,text:'Ready'});
});

test('Batched rendering preserves the patterned surfaces and shadows with fewer draws',async({page})=>{
  await page.route('**/performance-probe',route=>route.fulfill({contentType:'text/html',body:'<html></html>'}));await page.goto('/performance-probe');
  const result=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/.vite/deps/three.js');
    const {createRoomBatches}=await import('/src/room-batches.js');const {retro}=await import('/src/retro-material.js');
    const renderer=new THREE.WebGLRenderer({preserveDrawingBuffer:true});renderer.setSize(256,256);renderer.shadowMap.enabled=true;
    if(!renderer.extensions.has('WEBGL_multi_draw')){renderer.dispose();return {supported:false};}
    const scene=new THREE.Scene(),group=new THREE.Group();scene.add(group);
    scene.add(new THREE.AmbientLight(0xffffff,1));const sun=new THREE.DirectionalLight(0xffffff,3);sun.position.set(2,5,3);sun.castShadow=true;scene.add(sun);
    const material=retro(0x8ca26c),floor=new THREE.Mesh(new THREE.PlaneGeometry(10,10),retro(0xafa399));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
    for(let i=0;i<12;i++){
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(.4,.5,.3),material);mesh.position.set((i%4)-1.5,.4,Math.floor(i/4)-1);
      mesh.rotation.y=i*.2;mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);
    }
    const camera=new THREE.OrthographicCamera(-3,3,3,-3,.1,30);camera.position.set(5,6,7);camera.lookAt(0,0,0);
    const render=()=>{
      renderer.info.autoReset=false;renderer.info.reset();renderer.render(scene,camera);
      const gl=renderer.getContext(),pixels=new Uint8Array(256*256*4);gl.readPixels(0,0,256,256,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      return {pixels,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
    };
    const before=render(),batches=createRoomBatches(group);batches.update();const after=render();
    const largeDifferences=before.pixels.reduce((sum,v,i)=>sum+Number(Math.abs(v-after.pixels[i])>20),0);
    batches.dispose();renderer.dispose();return {supported:true,before:before.calls,after:after.calls,triangles:[before.triangles,after.triangles],largeDifferences};
  });
  test.skip(!result.supported,'Browser does not support multi-draw; the application keeps the original path.');
  expect(result.after).toBeLessThan(result.before/2);expect(result.triangles[0]).toBe(result.triangles[1]);
  expect(result.largeDifferences).toBeLessThan(20);
});

test('Garden and exterior reuse geometry and texture sources but keep independent transforms and lighting',async({page})=>{
  await page.route('**/performance-probe',route=>route.fulfill({contentType:'text/html',body:'<html></html>'}));await page.goto('/performance-probe');
  const result=await page.evaluate(async()=>{
    const {natureAssets}=await import('/src/nature-assets.js');
    const [a,b]=await Promise.all([natureAssets.load('CommonTree_1'),natureAssets.load('CommonTree_1')]);
    const meshes=root=>{const list=[];root.traverse(o=>{if(o.isMesh)list.push(o);});return list;};
    const am=meshes(a.scene),bm=meshes(b.scene);a.scene.position.x=99;
    const {createNatureGarden}=await import('/src/nature-garden.js');const {createWindowView}=await import('/src/window-view.js');
    const garden=createNatureGarden(),outside=createWindowView();await Promise.all([garden.ready,outside.ready]);
    const g=meshes(garden.garden.getObjectByName('CommonTree_1'))[0],w=meshes(outside.scenery.getObjectByName('CommonTree_1'))[0];
    return {geometry:am[0].geometry===bm[0].geometry,transform:b.scene.position.x,
      sceneGeometry:g.geometry===w.geometry,texture:g.material.map.source===w.material.map.source,materials:g.material!==w.material,
      lighting:g.material.uniforms.retroRadiance!==w.material.uniforms.retroRadiance};
  });
  expect(result).toEqual({geometry:true,transform:0,sceneGeometry:true,texture:true,materials:true,lighting:true});
});

test('The room becomes usable before delayed decorative scenery finishes loading',async({page})=>{
  test.setTimeout(60000);
  await page.setViewportSize({width:640,height:480});
  await page.emulateMedia({reducedMotion:'reduce'});
  // Once the room is shown, stop drawing: this test measures the loading
  // dependency, not the headless software renderer's animation throughput.
  await page.route(/\/src\/main\.js(?:\?.*)?$/,async route=>{
    const response=await route.fetch();const body=(await response.text()).replace('renderer.setAnimationLoop(animate);',
      'renderer.setAnimationLoop(now=>{animate(now);if(document.body.dataset.houseReady)renderer.setAnimationLoop(null);});');
    await route.fulfill({response,body});
  });
  let release;const delayed=new Promise(resolve=>{release=resolve;});let requested=0;
  await page.route('**/models/nature/CommonTree_*.gltf',async route=>{requested++;await delayed;await route.continue();});
  try{
    await page.goto('/');await expect(page.locator('#stage')).toHaveAttribute('data-ready','true');
    await expect(page.locator('body')).toHaveAttribute('data-house-ready','true');
    expect(requested).toBeGreaterThan(0);expect(await page.locator('#stage').getAttribute('data-nature')).not.toBe('ready');
  }finally{release();}
  await expect(page.locator('#stage')).toHaveAttribute('data-nature','ready',{timeout:20000});
});
