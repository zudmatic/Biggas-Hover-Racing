import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {createWallMirror} from '../src/wall-mirror.js';

test('Offscreen, hidden and back-facing mirrors never request a reflection render',()=>{
  const scene=new THREE.Scene(),mirror=createWallMirror(1,1),camera=new THREE.OrthographicCamera(-2,2,2,-2,.1,20);
  scene.add(mirror);camera.position.z=4;camera.lookAt(0,0,0);
  // An empty renderer also proves that the early exit never touches GPU state.
  mirror.position.x=10;expect(mirror.renderReflection({},scene,camera)).toBe(false);
  mirror.position.x=0;mirror.rotation.y=Math.PI;expect(mirror.renderReflection({},scene,camera)).toBe(false);
  mirror.rotation.y=0;scene.visible=false;expect(mirror.renderReflection({},scene,camera)).toBe(false);
  mirror.dispose();mirror.geometry.dispose();
});

test('Wall mirror reflects moving objects with the room camera and clips geometry behind the wall',async({page})=>{
  await page.route('**/render-probe',route=>route.fulfill({contentType:'text/html',body:'<html></html>'}));
  await page.goto('/render-probe');
  const result=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {createWallMirror}=await import('/src/wall-mirror.js');
    const renderer=new THREE.WebGLRenderer();renderer.setSize(128,128);
    const scene=new THREE.Scene();scene.background=new THREE.Color(0x000000);
    const camera=new THREE.OrthographicCamera(-2,2,2,-2,.1,20);
    camera.position.set(0,0,4);camera.lookAt(0,0,0);
    const mirror=createWallMirror(3,3);scene.add(mirror);
    const cube=new THREE.Mesh(new THREE.BoxGeometry(.6,.6,.6),new THREE.MeshBasicMaterial({color:0xff0000}));
    cube.position.set(-.65,0,1);scene.add(cube);
    const wall=new THREE.Mesh(new THREE.BoxGeometry(6,6,.1),new THREE.MeshBasicMaterial({color:0x00ff00}));
    wall.position.z=-.2;scene.add(wall);
    const sample=()=>{
      mirror.renderReflection(renderer,scene,camera);renderer.render(scene,camera);
      const target=mirror.getRenderTarget(),pixels=new Uint16Array(target.width*target.height*4);
      renderer.readRenderTargetPixels(target,0,0,target.width,target.height,pixels);
      let red=0,green=0,sumX=0;
      for(let i=0;i<pixels.length;i+=4){
        const r=THREE.DataUtils.fromHalfFloat(pixels[i]),g=THREE.DataUtils.fromHalfFloat(pixels[i+1]);
        if(r>.5&&g<.1){red++;sumX+=(i/4)%target.width;}
        if(g>.5&&r<.1)green++;
      }
      return {red,green,x:sumX/red};
    };
    const first=sample();cube.position.x=.65;const moved=sample();
    cube.material.color.set(0x0000ff);const recolored=sample();
    const restored=renderer.getRenderTarget()===null&&mirror.visible;
    const orthographic=mirror.camera.isOrthographicCamera;
    mirror.dispose();mirror.geometry.dispose();cube.geometry.dispose();cube.material.dispose();
    wall.geometry.dispose();wall.material.dispose();renderer.dispose();
    return {first,moved,recolored,restored,orthographic};
  });
  expect(result.orthographic).toBe(true);
  expect(result.first.red).toBeGreaterThan(100);
  expect(result.first.green).toBe(0);
  expect(result.moved.green).toBe(0);
  expect(result.moved.red).toBeGreaterThan(100);
  // A mirror reverses the horizontal direction of movement.
  expect(result.first.x-result.moved.x).toBeGreaterThan(30);
  expect(result.recolored.red).toBe(0);
  expect(result.restored).toBe(true);
});

for(const perspective of [false,true])test(`Reflection keeps detail and smooth edges when orbiting and resizing (${perspective?'perspective':'orthographic'})`,async({page})=>{
  await page.route('**/render-probe',route=>route.fulfill({contentType:'text/html',body:'<html></html>'}));
  await page.goto('/render-probe');
  const result=await page.evaluate(async perspective=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {createWallMirror}=await import('/src/wall-mirror.js');
    const renderer=new THREE.WebGLRenderer();renderer.setSize(400,300);
    const scene=new THREE.Scene();scene.background=new THREE.Color(0x000000);
    const camera=perspective?new THREE.PerspectiveCamera(50,4/3,.1,20):new THREE.OrthographicCamera(-4,4,3,-3,.1,20);
    camera.position.set(1,1,5);camera.lookAt(0,0,0);
    const mirror=createWallMirror(.7,2.3);scene.add(mirror);
    const object=new THREE.Mesh(new THREE.PlaneGeometry(.32,.8),new THREE.MeshBasicMaterial({color:0xff0000,side:THREE.DoubleSide}));
    object.position.z=.2;object.rotation.z=.3;scene.add(object);
    const sample=()=>{
      mirror.renderReflection(renderer,scene,camera);
      const target=mirror.getRenderTarget(),pixels=new Uint16Array(target.width*target.height*4);
      renderer.readRenderTargetPixels(target,0,0,target.width,target.height,pixels);
      let red=0,smoothed=0;
      for(let i=0;i<pixels.length;i+=4){
        const r=THREE.DataUtils.fromHalfFloat(pixels[i]);
        if(r>.9)red++;
        if(r>.05&&r<.95)smoothed++;
      }
      // Texture coordinates must use almost the whole cropped image, even at
      // an oblique angle; the old full-scene texture wasted most of its pixels.
      const uv=new THREE.Vector4(),bounds=new THREE.Box2();
      for(const x of [-.35,.35])for(const y of [-1.15,1.15]){
        uv.set(x,y,0,1).applyMatrix4(mirror.material.uniforms.textureMatrix.value);
        bounds.expandByPoint(new THREE.Vector2(uv.x/uv.w,uv.y/uv.w));
      }
      return {width:target.width,height:target.height,red,smoothed,coverage:bounds.getSize(new THREE.Vector2()).toArray()};
    };
    const initial=sample();renderer.setPixelRatio(2);const retina=sample();
    camera.position.set(-1,.5,5);camera.lookAt(0,0,0);camera.zoom=1.5;camera.updateProjectionMatrix();
    const orbit=sample();renderer.setSize(200,150);const smaller=sample();
    mirror.dispose();mirror.geometry.dispose();object.geometry.dispose();object.material.dispose();renderer.dispose();
    return {initial,retina,orbit,smaller};
  },perspective);
  for(const frame of Object.values(result)){
    expect(frame.red).toBeGreaterThan(100);
    expect(frame.smoothed).toBeGreaterThan(20);
    for(const coverage of frame.coverage)expect(coverage).toBeGreaterThan(.95);
    expect(frame.width).toBeLessThanOrEqual(2048);expect(frame.height).toBeLessThanOrEqual(2048);
  }
  expect(result.retina.height).toBeGreaterThan(result.initial.height);
  expect(result.orbit.height).toBeGreaterThan(result.retina.height);
  expect(result.smaller.height).toBeLessThan(result.orbit.height);
});
