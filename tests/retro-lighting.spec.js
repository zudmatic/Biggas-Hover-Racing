import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {retro} from '../src/retro-material.js';
import {createRetroLighting} from '../src/retro-lighting.js';

function fixture(){
  const scene=new THREE.Scene(),lighting=createRetroLighting(scene);
  const surface=new THREE.Mesh(new THREE.PlaneGeometry(2,2),retro(0xff0000));scene.add(surface);
  const source={object:surface,position:new THREE.Vector3(),normal:new THREE.Vector3(0,1,0),area:2,material:surface.material};
  lighting.key.position.set(0,5,0);lighting.key.color.setRGB(1,1,1);lighting.key.intensity=3;lighting.hemisphere.intensity=0;
  lighting.setEnvironment({patches:[source]});lighting.bind(surface);
  return {scene,lighting,surface,source,radiance:lighting.uniforms.retroRadiance.value[0]};
}

test('Diffuse bounce follows live surface dye, world transforms, light energy and occlusion',()=>{
  const {scene,lighting,surface,source,radiance}=fixture();
  lighting.sampleBounce();expect(radiance.r).toBeGreaterThan(2);expect(radiance.b).toBe(0);
  surface.material.color.setHex(0x0000ff);surface.position.x=2;lighting.sampleBounce();
  expect(radiance.r).toBe(0);expect(radiance.b).toBeGreaterThan(2);expect(lighting.uniforms.retroPatches.value[0].x).toBe(2);
  const bright=radiance.b;lighting.key.intensity=1.5;lighting.sampleBounce();expect(radiance.b).toBeCloseTo(bright/2);
  const blocker=new THREE.Mesh(new THREE.BoxGeometry(2,.2,2),retro(0xffffff));blocker.position.set(2,1,0);scene.add(blocker);
  lighting.setEnvironment({patches:[source],blockers:[blocker]});lighting.sampleBounce();expect(radiance.b).toBe(0);
  blocker.visible=false;lighting.sampleBounce();expect(radiance.b).toBeGreaterThan(0);
  surface.visible=false;lighting.sampleBounce();expect(lighting.uniforms.retroPatches.value[0].w).toBe(0);
});

test('Local colored emitters contribute to transport; separate scenes never share lighting',()=>{
  const a=fixture(),b=fixture();a.surface.material.color.setRGB(1,1,1);a.lighting.key.intensity=0;
  const lamp=new THREE.PointLight(0x00ff00,2);lamp.position.set(0,1,0);a.scene.add(lamp);
  a.lighting.setEnvironment({patches:[a.source],lights:[lamp]});a.lighting.sampleBounce();
  expect(a.radiance.g).toBeGreaterThan(1);expect(a.radiance.r).toBe(0);expect(b.radiance.g).toBe(0);
  expect(a.surface.material.uniforms.retroRadiance).toBe(a.lighting.uniforms.retroRadiance);
  expect(a.surface.castShadow&&a.surface.receiveShadow).toBe(true);
  a.lighting.update(0);const first=a.lighting.key.position.clone();a.lighting.update(20);expect(a.lighting.key.position.equals(first)).toBe(false);
  a.lighting.update(0,{reducedMotion:true});const still=a.lighting.key.position.clone();a.lighting.update(25,{reducedMotion:true});expect(a.lighting.key.position.equals(still)).toBe(true);
});

test('Moving bounce sources follow the current pose even between energy samples',()=>{
  const {lighting,surface}=fixture();
  lighting.update(0,{reducedMotion:true});const revision=lighting.revision;
  surface.position.x=.12;
  lighting.update(1/240,{reducedMotion:true});
  expect(lighting.revision).toBe(revision);
  expect(lighting.uniforms.retroPatches.value[0].x).toBeCloseTo(.12);
});

test('Zud passing in front of the chair only shades part of the floor bounce, without flashes',async({page})=>{
  // Load the actual room and character without a second animated WebGL scene.
  await page.route('**/lighting-probe',route=>route.fulfill({contentType:'text/html',body:'<html></html>'}));
  await page.goto('/lighting-probe');
  const result=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {createRetroRoom,ROOM_SCALE}=await import('/src/retro-room.js');
    const {createRetroLighting}=await import('/src/retro-lighting.js');
    const {createZudModel}=await import('/src/zud-model.js');
    const scene=new THREE.Scene(),room=createRetroRoom(),lighting=createRetroLighting(scene);
    await room.ready;scene.add(room.room);
    const zud=createZudModel(),actor=new THREE.Group();actor.add(zud.root);actor.scale.setScalar(ROOM_SCALE);scene.add(actor);
    zud.root.rotation.y=Math.PI/4;lighting.bind(zud.root);
    const actorPatch={object:actor,position:new THREE.Vector3(0,3.7,0),normal:new THREE.Vector3(0,1,0),omni:true,area:.45,material:()=>zud.bounceMaterial};
    zud.root.traverse(mesh=>{if(mesh.isMesh&&mesh.castShadow)room.bounceBlockers.push(mesh);});
    lighting.setEnvironment({patches:[...room.bouncePatches,actorPatch],blockers:room.bounceBlockers,lights:room.lights});
    let initial,previous,min=Infinity,maxStep=0;
    for(let frame=0;frame<=210;frame++){
      actor.position.set(-.5+Math.min(frame,150)*.02,.12,.15);
      lighting.update(frame/60,{room:true,daylight:room.daylight,cycle:room.cycle,cloudTime:0});
      const energy=lighting.uniforms.retroRadiance.value[0].r;
      initial??=energy;min=Math.min(min,energy);
      if(previous!==undefined)maxStep=Math.max(maxStep,Math.abs(energy-previous));
      previous=energy;
    }
    lighting.dispose();return {min:min/initial,maxStep:maxStep/initial,recovered:previous/initial};
  });
  // The old single ray switched off ~98% of this large patch in one frame.
  expect(result.min).toBeGreaterThan(.45);expect(result.min).toBeLessThan(.95);
  expect(result.maxStep).toBeLessThan(.04);
  expect(result.recovered).toBeCloseTo(1,2);
});

test('The shared shader renders changing colored bounce and moving shadows without WebGL errors',async({page})=>{
  test.setTimeout(60000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('**/render-probe',route=>route.fulfill({contentType:'text/html',body:'<html></html>'}));
  await page.goto('/render-probe');
  const result=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {retro}=await import('/src/retro-material.js');const {createRetroLighting}=await import('/src/retro-lighting.js');
    const renderer=new THREE.WebGLRenderer({preserveDrawingBuffer:true});renderer.setSize(128,128);renderer.shadowMap.enabled=true;
    const scene=new THREE.Scene(),lighting=createRetroLighting(scene,{renderer});
    const receiver=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),retro(0xdccfbc));receiver.position.y=.65;scene.add(receiver);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(6,6),retro(0x948394));floor.rotation.x=-Math.PI/2;scene.add(floor);
    const sourceMaterial=retro(0xff0000);
    lighting.setEnvironment({patches:[{object:floor,position:new THREE.Vector3(1.1,-.6,.04),normal:new THREE.Vector3(0,0,1),area:2,material:sourceMaterial}]});
    lighting.bind(scene);lighting.update(0,{room:false,reducedMotion:true});
    const camera=new THREE.OrthographicCamera(-2,2,2,-2,.1,20);camera.position.set(4,4,5);camera.lookAt(0,.5,0);
    const render=()=>{lighting.sampleBounce();renderer.shadowMap.needsUpdate=true;renderer.render(scene,camera);const gl=renderer.getContext(),pixels=new Uint8Array(128*128*4);gl.readPixels(0,0,128,128,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;};
    const red=render();sourceMaterial.color.setHex(0x0000ff);const blue=render();receiver.position.x=.8;const moved=render();
    const changes=(a,b)=>a.reduce((sum,v,i)=>sum+(Math.abs(v-b[i])>2?1:0),0);
    const result={dyeChanges:changes(red,blue),motionChanges:changes(blue,moved),bound:receiver.material.uniforms.retroRadiance===lighting.uniforms.retroRadiance};
    renderer.dispose();lighting.dispose();scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});sourceMaterial.dispose();return result;
  });
  expect(result.bound).toBe(true);expect(result.dyeChanges).toBeGreaterThan(100);expect(result.motionChanges).toBeGreaterThan(300);expect(errors).toEqual([]);
});

test('Animated casters use the current pose between diffuse-bounce updates',async({page})=>{
  await page.route('**/render-probe',route=>route.fulfill({contentType:'text/html',body:'<html></html>'}));
  await page.goto('/render-probe');
  const result=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {retro}=await import('/src/retro-material.js');
    const {createRetroLighting}=await import('/src/retro-lighting.js');
    const renderer=new THREE.WebGLRenderer({preserveDrawingBuffer:true});
    renderer.setSize(160,160);renderer.shadowMap.enabled=true;
    const scene=new THREE.Scene(),lighting=createRetroLighting(scene,{renderer});
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(8,8),retro(0xffffff));
    floor.rotation.x=-Math.PI/2;scene.add(floor);
    const caster=new THREE.Mesh(new THREE.BoxGeometry(.6,.8,.4),retro(0xffffff));
    caster.position.y=.6;scene.add(caster);lighting.bind(scene);
    const camera=new THREE.OrthographicCamera(-2,2,2,-2,.1,20);
    camera.position.set(4,5,6);camera.lookAt(0,0,0);
    const render=()=>{
      renderer.render(scene,camera);
      const gl=renderer.getContext(),pixels=new Uint8Array(160*160*4);
      gl.readPixels(0,0,160,160,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;
    };
    const changes=(a,b)=>a.reduce((sum,v,i)=>sum+(Math.abs(v-b[i])>2?1:0),0);
    const frames=[];
    for(const room of [false,true]){
      lighting.update(0,{room,force:true});render();const revision=lighting.revision;
      for(const time of [1/60,2/60,3/60]){
        caster.position.x+=.09;caster.rotation.y+=.15;
        lighting.update(time,{room});const actual=render();
        renderer.shadowMap.needsUpdate=true;const fresh=render();
        frames.push({stalePixels:changes(actual,fresh),bounceUnchanged:lighting.revision===revision});
      }
    }
    const shaded=render();caster.castShadow=false;renderer.shadowMap.needsUpdate=true;
    const shadowPixels=changes(shaded,render());
    renderer.dispose();lighting.dispose();
    scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
    return {frames,shadowPixels};
  });
  expect(result.shadowPixels).toBeGreaterThan(100);
  for(const frame of result.frames){
    expect(frame.bounceUnchanged).toBe(true);
    expect(frame.stalePixels).toBe(0);
  }
});
