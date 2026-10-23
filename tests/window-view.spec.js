import {test,expect} from '@playwright/test';

test('The 3D exterior caches idle frames, follows time and camera, and restores renderer state',async({page})=>{
  await page.route('**/render-probe',route=>route.fulfill({contentType:'text/html',body:'<html></html>'}));
  await page.goto('/render-probe');
  const result=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {createWindowView}=await import('/src/window-view.js');
    const {retroStyle}=await import('/src/retro-style.js');
    const view=createWindowView();view.view.position.set(1.2,2.175,-2.43);await view.ready;
    const renderer=new THREE.WebGLRenderer();renderer.shadowMap.enabled=true;
    renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
    const originalClipping=renderer.clippingPlanes;
    const previous=new THREE.WebGLRenderTarget(16,16);renderer.setRenderTarget(previous);
    const camera=new THREE.OrthographicCamera(-4,4,3,-3,.1,80);
    camera.position.set(8,8,12);camera.lookAt(0,1,0);camera.updateMatrixWorld();
    let passes=0,exteriorCamera,exteriorTarget,drawCalls;const inkSuppressed=[];const render=renderer.render.bind(renderer);
    renderer.render=(...args)=>{passes++;exteriorCamera=args[1];exteriorTarget=renderer.getRenderTarget();inkSuppressed.push(retroStyle.uniforms.retroMirror.value);render(...args);};
    // A point outdoors and the point where its room-camera ray crosses the
    // aperture must sample the exact same texel, for any orbit/zoom/translation.
    const alignment=()=>{
      const point=new THREE.Vector3(-1,0,-5),ndc=point.clone().project(camera);
      const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(ndc.x,ndc.y),camera);
      const hit=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),2.43),new THREE.Vector3());
      view.view.worldToLocal(hit);
      const uv=new THREE.Vector4(hit.x,hit.y,hit.z,1).applyMatrix4(view.view.material.userData.textureMatrix);
      const expected=point.clone().project(exteriorCamera).multiplyScalar(.5).addScalar(.5);
      return Math.hypot(uv.x/uv.w-expected.x,uv.y/uv.w-expected.y);
    };
    const errors=[];
    // Count actual draws, including invalidation when vector style uniforms change.
    renderer.info.autoReset=false;renderer.info.reset();
    view.render(renderer,camera);drawCalls=renderer.info.render.calls;
    renderer.info.autoReset=true;
    const first=passes;errors.push(alignment());
    view.render(renderer,camera);const idle=passes;
    camera.position.x=-8;camera.lookAt(0,1,0);camera.updateMatrixWorld();
    view.render(renderer,camera);const orbit=passes;errors.push(alignment());
    const day=view.scene.background.getHex();view.update(1320);
    view.render(renderer,camera);const night=passes,nightSky=view.scene.background.getHex();
    const mono=retroStyle.uniforms.retroMono.value.clone();
    retroStyle.uniforms.retroMono.value.x=1;view.render(renderer,camera);const style=passes;
    retroStyle.uniforms.retroMono.value.copy(mono);
    camera.zoom=1.3;camera.updateProjectionMatrix();view.render(renderer,camera);errors.push(alignment());
    camera.position.x+=.5;camera.updateMatrixWorld();view.render(renderer,camera);errors.push(alignment());
    const moved=passes;
    // Read the actual landscape target before the window glass and frame grade.
    // Style changes must invalidate its cache and alter the surface ink itself.
    const strength=retroStyle.uniforms.retroStrength.value;
    const sample=()=>{const pixels=new Uint16Array(exteriorTarget.width*exteriorTarget.height*4);renderer.readRenderTargetPixels(exteriorTarget,0,0,exteriorTarget.width,exteriorTarget.height,pixels);return pixels;};
    retroStyle.uniforms.retroStrength.value=0;view.render(renderer,camera);const noInk=sample();
    retroStyle.uniforms.retroStrength.value=strength;view.render(renderer,camera);const ink=sample();
    let inkChanged=0;for(let i=0;i<ink.length;i+=4)if(Math.abs(ink[i]-noInk[i])+Math.abs(ink[i+1]-noInk[i+1])+Math.abs(ink[i+2]-noInk[i+2])>6)inkChanged++;
    const restored=renderer.getRenderTarget()===previous&&renderer.shadowMap.needsUpdate&&
      !renderer.shadowMap.autoUpdate&&renderer.clippingPlanes===originalClipping&&retroStyle.uniforms.retroMirror.value===0;
    const flowers=view.scenery.children.filter(object=>object.name.startsWith('Flower_')).length;
    let triangles=0,plants=0;
    view.scenery.traverse(object=>{
      if(!object.isMesh)return;
      const instances=object.isInstancedMesh?object.count:1;
      triangles+=(object.geometry.index?.count??object.geometry.attributes.position.count)/3*instances;
      if(object.isInstancedMesh)plants+=instances;
    });
    previous.dispose();renderer.dispose();
    return {first,idle,orbit,night,style,restored,flowers,errors,moved,day,nightSky,drawCalls,triangles,plants,inkSuppressed,inkChanged};
  });
  expect(result.first).toBe(1);expect(result.idle).toBe(1);
  expect(result.inkSuppressed.every(value=>value===0)).toBe(true);
  expect(result.inkChanged).toBeGreaterThan(100);
  expect(result.orbit).toBe(2);expect(result.night).toBe(3);expect(result.style).toBe(4);
  expect(result.day).not.toBe(result.nightSky);expect(result.restored).toBe(true);
  expect(result.flowers).toBeGreaterThan(0);
  // Keep the full meadow while reducing the former 184 draws (with shadows).
  expect(result.triangles).toBe(85037);expect(result.plants).toBe(117);
  expect(result.drawCalls).toBeLessThan(100);
  expect(result.moved).toBe(6);
  expect(Math.max(...result.errors)).toBeLessThan(1e-6);
});

test('Exterior sun stays aligned with the garden and its ground does not follow the window height',async({page})=>{
  await page.route('**/window-lighting-probe',route=>route.fulfill({contentType:'text/html',body:'<html></html>'}));
  await page.goto('/window-lighting-probe');
  const result=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {createWindowView}=await import('/src/window-view.js');
    const {createNatureGarden}=await import('/src/nature-garden.js');
    const {createRetroLighting}=await import('/src/retro-lighting.js');
    const {dayCycle}=await import('/src/day-cycle.js');
    const view=createWindowView(),garden=createNatureGarden(),roomScene=new THREE.Scene();
    const roomLight=createRetroLighting(roomScene);
    await Promise.all([view.ready,garden.ready]);
    const renderer=new THREE.WebGLRenderer(),camera=new THREE.OrthographicCamera(-4,4,3,-3,.1,80);
    camera.position.set(8,8,12);camera.lookAt(0,1,0);
    view.view.position.set(1.2,2.175,-2.43);
    const direction=light=>light.getWorldPosition(new THREE.Vector3()).sub(light.target.getWorldPosition(new THREE.Vector3())).normalize();
    const errors=[];
    for(const minutes of [360,610,720,1110,1320]){
      const cycle=dayCycle(minutes);roomLight.update(0,{room:true,cycle,daylight:cycle.daylight,reducedMotion:true});
      view.update(minutes);view.render(renderer,camera);roomScene.updateMatrixWorld(true);
      errors.push({direction:direction(view.lighting.key).distanceTo(direction(roomLight.key)),
        sunColor:view.lighting.key.color.equals(roomLight.key.color),
        sunIntensity:view.lighting.key.intensity===roomLight.key.intensity,
        fill:view.lighting.hemisphere.color.equals(roomLight.hemisphere.color),
        white:view.lighting.uniforms.retroWhite.value===roomLight.uniforms.retroWhite.value});
    }
    const gardenY=new THREE.Box3().setFromObject(garden.garden.getObjectByName('Isla de césped')).max.y;
    const groundY=()=>view.ground.getWorldPosition(new THREE.Vector3()).y;
    const original=groundY();
    view.view.position.y+=.8;view.view.rotation.y=.3;view.render(renderer,camera);
    const moved=groundY(),sunAfterMove=direction(view.lighting.key).distanceTo(direction(roomLight.key));
    const treeHeight=new THREE.Box3().setFromObject(view.scenery.getObjectByName('CommonTree_1')).getSize(new THREE.Vector3()).y;
    renderer.dispose();roomLight.dispose();view.lighting.dispose();
    return {errors,gardenY,original,moved,sunAfterMove,treeHeight};
  });
  expect(result.errors.every(error=>error.direction<1e-6&&error.sunColor&&error.sunIntensity&&error.fill&&error.white)).toBe(true);
  expect(result.original).toBeCloseTo(result.gardenY,6);
  expect(result.moved).toBeCloseTo(result.gardenY,6);
  expect(result.sunAfterMove).toBeLessThan(1e-6);
  expect(result.treeHeight).toBeCloseTo(3.7,4);
});
