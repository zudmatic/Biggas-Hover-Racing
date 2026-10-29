import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {warmupFlightScene} from '../src/flight-scene-warmup.js';

test('loading failure restores culling, visibility and shadow invalidation',async()=>{
  const scene=new THREE.Scene(),mesh=new THREE.Mesh(),hidden=new THREE.Mesh(),sun=new THREE.DirectionalLight();
  const decoration=new THREE.Group();decoration.visible=false;decoration.userData.prewarmDecoration=true;
  hidden.visible=false;hidden.frustumCulled=false;sun.castShadow=true;scene.add(mesh,hidden,sun,decoration);
  await expect(warmupFlightScene(scene,async()=>{
    expect(mesh.frustumCulled).toBe(false);expect(hidden.visible).toBe(false);
    expect(decoration.visible).toBe(true);
    sun.shadow.needsUpdate=false;throw new Error('Device lost');
  })).rejects.toThrow('Device lost');
  expect(mesh.frustumCulled).toBe(true);expect(hidden.frustumCulled).toBe(false);expect(hidden.visible).toBe(false);expect(sun.shadow.needsUpdate).toBe(true);
  expect(decoration.visible).toBe(false);
  mesh.geometry.dispose();mesh.material.dispose();hidden.geometry.dispose();hidden.material.dispose();sun.dispose();
});

for(const comic of [true,false])test(`offscreen ${comic?'comic':'normal'} surfaces and shadow casters compile during loading, not on entry`,async({page})=>{
  test.setTimeout(120000);
  await page.route('**/warmup-test',r=>r.fulfill({contentType:'text/html',body:'<html><body></body></html>'}));
  await page.goto('/warmup-test');
  const result=await page.evaluate(async comic=>{
    const T=await import('/node_modules/three/build/three.module.js');
    const {createGameRenderer}=await import('/src/game-renderer.js'),{createComicPost}=await import('/src/comic-tsl-post.js'),{createComicMaterials,createComicStyle}=await import('/src/comic-tsl-material.js'),{warmupFlightScene}=await import('/src/flight-scene-warmup.js');
    const renderer=await createGameRenderer(document.createElement('canvas'),{forceWebGL:true});renderer.setSize(256,256);renderer.shadowMap.enabled=true;
    const gl=renderer.backend.gl,link=gl.linkProgram.bind(gl);let links=0;gl.linkProgram=(...args)=>{links++;return link(...args);};
    const scene=new T.Scene();scene.background=new T.Color(0xabcabc);
    const camera=new T.PerspectiveCamera(60,1,.1,100);camera.position.set(0,3,10);camera.lookAt(0,0,0);camera.updateMatrixWorld();
    const sun=new T.DirectionalLight(0xffffff,3);sun.castShadow=true;sun.shadow.autoUpdate=false;sun.shadow.mapSize.set(128,128);sun.position.set(0,10,5);scene.add(sun,sun.target,new T.HemisphereLight(0xffffff,0x555555,1));
    const box=new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial());box.castShadow=true;box.receiveShadow=true;scene.add(box);
    const texture=new T.DataTexture(new Uint8Array([100,200,50,255]),1,1);texture.needsUpdate=true;
    const distant=new T.InstancedMesh(new T.SphereGeometry(1,8,8),new T.MeshStandardMaterial({map:texture,flatShading:true}),4);distant.count=1;distant.position.x=1000;distant.castShadow=true;distant.receiveShadow=true;scene.add(distant);
    const district=new T.Group();district.visible=false;district.userData.prewarmDecoration=true;scene.add(district);district.add(distant);
    const style=createComicStyle();style.resolution.value.set(256,256);const materials=createComicMaterials(scene,style);materials.setEnabled(comic);
    const post=createComicPost(renderer,scene,camera,{samples:4});scene.updateMatrixWorld(true);
    await new Promise(requestAnimationFrame);
    await warmupFlightScene(scene,async()=>{await post.compile();await post.render();});gl.finish();
    const compiled=links;
    const restoredVisibility=!district.visible;district.visible=true;
    camera.position.x=1000;camera.lookAt(1000,0,0);camera.updateMatrixWorld();sun.position.x=1000;sun.target.position.x=1000;scene.updateMatrixWorld(true);sun.shadow.needsUpdate=true;
    await new Promise(requestAnimationFrame);await post.render();gl.finish();
    const result={compiled,newPrograms:links-compiled,culling:distant.frustumCulled,restoredVisibility,restoredTarget:renderer.getRenderTarget()===null};
    materials.dispose();post.dispose();scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();if(o.isLight)o.dispose();});texture.dispose();renderer.dispose();return result;
  },comic);
  expect(result.compiled).toBeGreaterThan(0);expect(result.newPrograms).toBe(0);expect(result.culling).toBe(true);expect(result.restoredVisibility).toBe(true);expect(result.restoredTarget).toBe(true);
});
