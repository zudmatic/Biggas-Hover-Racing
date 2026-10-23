import {test,expect} from '@playwright/test';
import {enter} from './helpers.js';

test('The breeze keeps roots anchored and rocks still, even when reduced motion is preferred',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {createNatureGarden}=await import('/src/nature-garden.js');
    const nature=createNatureGarden();const loaded=await nature.ready;
    const meshes=[];nature.garden.traverse(mesh=>{if(mesh.isInstancedMesh)meshes.push(mesh);});
    const baseline=meshes.map(mesh=>mesh.instanceMatrix.array.slice());
    nature.update(4);
    const changed=new Set();let maxRootDrift=0,maxMotion=0;
    meshes.forEach((mesh,m)=>{
      for(let i=0;i<mesh.count;i++){
        const base=new THREE.Matrix4().fromArray(baseline[m],i*16),current=new THREE.Matrix4();
        mesh.getMatrixAt(i,current);if(base.equals(current))continue;
        changed.add(mesh.name);
        const delta=current.clone().multiply(base.clone().invert());
        // Every source mesh shares the plant's ground pivot, even with a local
        // GLTF offset. Recover x/z from the instance's placement envelope.
        const box=new THREE.Box3();
        for(const part of mesh.parent.children){
          const partBase=new THREE.Matrix4().fromArray(baseline[meshes.indexOf(part)],i*16);
          part.geometry.computeBoundingBox();box.union(part.geometry.boundingBox.clone().applyMatrix4(partBase));
        }
        const root=box.getCenter(new THREE.Vector3());root.y=box.min.y;
        maxRootDrift=Math.max(maxRootDrift,root.distanceTo(root.clone().applyMatrix4(delta)));
        const crown=root.clone();crown.y=box.max.y;
        maxMotion=Math.max(maxMotion,crown.distanceTo(crown.clone().applyMatrix4(delta)));
      }
    });
    const previous=meshes.map(mesh=>mesh.instanceMatrix.array.slice());
    nature.update(12);
    const continued=meshes.some((mesh,m)=>mesh.instanceMatrix.array.some((v,i)=>v!==previous[m][i]));
    return {loaded,changed:[...changed],maxRootDrift,maxMotion,continued};
  });
  expect(result.loaded.loaded).toBe(result.loaded.total);
  expect(result.changed.sort()).toEqual(['CommonTree_1','CommonTree_5','Flower_3_Group','Flower_4_Group']);
  expect(result.maxRootDrift).toBeLessThan(.01);
  expect(result.maxMotion).toBeGreaterThan(.005);
  expect(result.maxMotion).toBeLessThan(.08);
  expect(result.continued).toBe(true);
});

test('Cloud shade stays subtle, stops at night and keeps drifting with reduced motion',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {retro}=await import('/src/retro-material.js');
    const {createRetroLighting}=await import('/src/retro-lighting.js');
    const renderer=new THREE.WebGLRenderer();renderer.setSize(128,128);
    const scene=new THREE.Scene(),lighting=createRetroLighting(scene,{renderer});
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(12,12),retro(0xffffff));
    floor.rotation.x=-Math.PI/2;scene.add(floor);lighting.bind(scene);
    // Remove the ink pattern to measure the lighting gradient.
    floor.material.uniforms.retroHalftoneStrength.value=0;
    const camera=new THREE.OrthographicCamera(-5,5,5,-5,.1,20);
    camera.position.set(0,10,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);
    const cycle={hour:12,daylight:1,twilight:0};
    const render=(time,options={})=>{
      lighting.update(time,{room:true,cycle,...options});renderer.render(scene,camera);
      const gl=renderer.getContext(),pixels=new Uint8Array(128*128*4);
      gl.readPixels(0,0,128,128,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;
    };
    const difference=(a,b)=>a.reduce((sum,v,i)=>sum+Math.abs(v-b[i]),0)/(128*128*3);
    const first=render(0),second=render(40);
    const pinned=render(40,{cloudTime:0});
    const reducedA=render(0,{reducedMotion:true}),reducedB=render(40,{reducedMotion:true});
    const night={hour:0,daylight:0,twilight:0};
    const nightA=render(0,{daylight:0,cycle:night}),nightB=render(40,{daylight:0,cycle:night});
    const result={drift:difference(first,second),pinned:difference(first,pinned),reduced:difference(reducedA,reducedB),night:difference(nightA,nightB)};
    renderer.dispose();lighting.dispose();floor.geometry.dispose();floor.material.dispose();return result;
  });
  expect(result.drift).toBeGreaterThan(.1);
  expect(result.drift).toBeLessThan(12);
  expect(result.pinned).toBe(0);
  expect(result.reduced).toBeCloseTo(result.drift);expect(result.night).toBe(0);
  expect(errors).toEqual([]);
});

test('Clouds drift automatically without a slider or pause panel',async({page})=>{
  await enter(page);
  const stage=page.locator('#stage');
  await expect(page.getByRole('slider',{name:'Paso de nubes'})).toHaveCount(0);
  await expect(page.locator('.cloud-controls')).toHaveCount(0);
  const initial=Number(await stage.getAttribute('data-cloud-time'));
  await expect.poll(async()=>Number(await stage.getAttribute('data-cloud-time'))).toBeGreaterThan(initial+1);
});

test('Clouds run at double speed at low frame rates and exclude hidden-tab time',async({page})=>{
  await page.route('**/cloud-clock-probe',route=>route.fulfill({contentType:'text/html',body:'<div id="stage"></div>'}));
  await page.goto('/cloud-clock-probe');
  const result=await page.evaluate(async()=>{
    const {createCloudClock}=await import('/src/cloud-clock.js');
    const stage=document.querySelector('#stage');let now=0,hidden=false;
    Object.defineProperty(document,'hidden',{get:()=>hidden,configurable:true});
    const clouds=createCloudClock(stage,{now:()=>now});
    for(let frame=0;frame<125;frame++){now+=200;clouds.update();}
    const elapsed=clouds.update();
    hidden=true;document.dispatchEvent(new Event('visibilitychange'));
    now+=15000;const background=clouds.update();
    now+=10000;hidden=false;document.dispatchEvent(new Event('visibilitychange'));
    const resumed=clouds.update();now+=1000;
    return {elapsed,background,resumed,next:clouds.update()};
  });
  expect(result.elapsed).toBeCloseTo(50,6);
  expect(result.background).toBe(result.elapsed);
  expect(result.resumed).toBe(result.elapsed);
  expect(result.next-result.resumed).toBeCloseTo(2,6);
});
