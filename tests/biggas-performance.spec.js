import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {createBiggasVisibility} from '../src/biggas-city-visibility.js';
import {prepareBiggasCity} from '../src/biggas-city-scene.js';
import {createBiggasLightingBatches,collectBiggasStaticLighting,createBiggasBuildingLights} from '../src/biggas-city-lighting.js';
import {createComicMaterials,createComicStyle} from '../src/comic-tsl-material.js';
import {createBiggasCityLook} from '../src/biggas-city-look.js';

test('runtime dressing filters distant lamps but moving objects retain dynamic lighting',()=>{
  const root=new THREE.Group(),geometry=new THREE.BoxGeometry(2,2,2),material=new THREE.MeshStandardMaterial();
  const grass=new THREE.Mesh(geometry,material),rail=new THREE.Mesh(geometry,material),train=new THREE.InstancedMesh(geometry,material,4),droneGroup=new THREE.Group(),drone=new THREE.Mesh(geometry,material),flag=new THREE.Mesh(geometry.clone(),material);
  rail.position.x=100;droneGroup.userData.dynamicLighting=true;droneGroup.add(drone);flag.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);root.add(grass,rail,train,droneGroup,flag);
  const near=new THREE.PointLight(0xffffff,100,10),far=new THREE.PointLight(0xffffff,100,10);far.position.x=100;root.add(near,far);
  const selected=collectBiggasStaticLighting(root),batch=createBiggasLightingBatches(selected,[near,far]);
  expect(selected).toEqual([grass,rail]);expect(grass.material.lightsNode.getLights()).toEqual([near]);expect(rail.material.lightsNode.getLights()).toEqual([far]);
  expect(train.material).toBe(material);expect(drone.material).toBe(material);expect(flag.material).toBe(material);
  expect(batch.stats.selectedEvaluations).toBe(2);expect(batch.stats.originalEvaluations).toBe(4);
  geometry.dispose();flag.geometry.dispose();material.dispose();grass.material.dispose();rail.material.dispose();train.dispose();
});

test('building windows switch off in daylight and restore at night in PSX and comic',()=>{
  const root=new THREE.Group(),geometry=new THREE.BoxGeometry(),windowMaterial=new THREE.MeshStandardMaterial({name:'039_WindowWarm',color:0xe8bd79,emissive:0xffcc88,emissiveIntensity:.8}),glassMaterial=new THREE.MeshStandardMaterial({name:'039_TealGlass',color:0x24525e}),accentMaterial=new THREE.MeshStandardMaterial({name:'039_CyanAccent',emissive:0x00ffff,emissiveIntensity:.3}),signMaterial=new THREE.MeshStandardMaterial({name:'Bigga neon cyan',emissive:0x00ffff,emissiveIntensity:3});
  const window=new THREE.Mesh(geometry,windowMaterial),glass=new THREE.Mesh(geometry,glassMaterial),accent=new THREE.Mesh(geometry,accentMaterial),sign=new THREE.Mesh(geometry,signMaterial);root.add(window,glass,accent,sign);
  const warm=windowMaterial.color.clone(),lighting=createBiggasBuildingLights(root),comic=createComicMaterials(root,createComicStyle()),look=createBiggasCityLook(root,{getDrawingBufferSize:v=>v.set(960,600)});
  expect(lighting.count).toBe(2);expect(windowMaterial.emissiveIntensity).toBe(0);expect(windowMaterial.color.equals(glassMaterial.color)).toBe(true);expect(accentMaterial.emissiveIntensity).toBe(0);expect(signMaterial.emissiveIntensity).toBe(3);
  for(const night of [true,false,true]){
    lighting.update(night);look.update();
    expect(window.material.emissiveIntensity).toBe(night?.8:0);expect(window.material.color.equals(night?warm:glassMaterial.color)).toBe(true);
    look.update({enabled:false});comic.setEnabled(true);comic.sync();
    expect(window.material.emissiveIntensity).toBe(night?.8:0);expect(window.material.color.equals(night?warm:glassMaterial.color)).toBe(true);expect(sign.material.emissiveIntensity).toBe(3);comic.setEnabled(false);
  }
  look.dispose();comic.dispose();geometry.dispose();[windowMaterial,glassMaterial,accentMaterial,signMaterial].forEach(m=>m.dispose());
});

test('static lighting removes only zero-contribution fixtures and preserves dynamic lights in both modes',()=>{
  const root=new THREE.Group(),material=new THREE.MeshStandardMaterial(),geometry=new THREE.BoxGeometry(2,2,2);
  const a=new THREE.Mesh(geometry,material),b=new THREE.Mesh(geometry,material),c=new THREE.InstancedMesh(geometry,material,2);
  b.position.x=100;c.setMatrixAt(0,new THREE.Matrix4().makeTranslation(200,0,0));c.setMatrixAt(1,new THREE.Matrix4().makeTranslation(300,0,0));root.add(a,b,c);
  const near=new THREE.PointLight(0xffffff,100,10),far=new THREE.PointLight(0xffffff,100,10),edge=new THREE.SpotLight(0xffffff,100,10),unlimited=new THREE.PointLight(0xffffff,100,0);
  far.position.x=100;edge.position.x=311;root.add(near,far,edge,unlimited);
  const batch=createBiggasLightingBatches([a,b,c],[near,far,edge,unlimited]),sun=new THREE.DirectionalLight(),headlight=new THREE.SpotLight();
  batch.setGlobalLights([sun,headlight]);
  expect(a.material.lightsNode.getLights()).toEqual([sun,headlight,near,unlimited]);
  expect(b.material.lightsNode.getLights()).toEqual([sun,headlight,far,unlimited]);
  expect(a.material.customProgramCacheKey()).not.toBe(b.material.customProgramCacheKey());
  expect(c.material.lightsNode.getLights()).toEqual([sun,headlight,edge,unlimited]);
  expect([near,far,edge,unlimited].every(l=>l.visible&&l.intensity===100)).toBe(true);
  const comic=createComicMaterials(root,createComicStyle()),source=a.material;comic.setEnabled(true);
  expect(a.material.lightsNode).toBe(source.lightsNode);
  const engine=new THREE.PointLight();batch.setGlobalLights([sun,headlight,engine]);
  expect(a.material.lightsNode.getLights()).toContain(engine);
  headlight.position.x=1000;expect(a.material.lightsNode.getLights()).toContain(headlight);
  comic.setEnabled(false);expect(a.material).toBe(source);comic.dispose();
  for(const mesh of [a,b,c])mesh.material.dispose();material.dispose();geometry.dispose();c.dispose();
});

test('instanced templates reuse duplicate vertices without changing rendered triangle attributes',()=>{
  const source=new THREE.Group(),geometry=new THREE.BoxGeometry(2,3,4).toNonIndexed(),expected=geometry.clone(),material=new THREE.MeshStandardMaterial({name:'Tree'});
  for(let i=0;i<5;i++){const mesh=new THREE.Mesh(geometry,material);mesh.position.x=i*7;source.add(mesh);}
  const root=new THREE.Group(),authored=prepareBiggasCity([{scene:source}],root,{apply(){}}),mesh=authored.instances[0],merged=mesh.geometry;
  expect(mesh.count).toBe(5);expect(merged.attributes.position.count).toBeLessThan(expected.attributes.position.count);
  expect(merged.index.count).toBe(expected.attributes.position.count);
  for(const key of ['position','normal','uv']){const before=expected.attributes[key],after=merged.attributes[key];
    for(let i=0;i<before.count;i++)for(let c=0;c<before.itemSize;c++)expect(after.array[merged.index.getX(i)*after.itemSize+c]).toBe(before.array[i*before.itemSize+c]);
  }
  const matrix=new THREE.Matrix4();for(let i=0;i<5;i++){mesh.getMatrixAt(i,matrix);expect(matrix.elements[12]).toBe(i*7);}
  mesh.dispose();merged.dispose();expected.dispose();material.dispose();
});

test('instance culling keeps offscreen shadow casters and restores batches after camera turns',()=>{
  const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshStandardMaterial(),256);mesh.count=3;mesh.castShadow=true;
  [[0,0,-20],[100,0,-20],[0,0,20]].forEach((p,i)=>mesh.setMatrixAt(i,new THREE.Matrix4().makeTranslation(...p)));mesh.computeBoundingSphere();
  const bounds=mesh.boundingSphere.clone(),visibility=createBiggasVisibility([mesh]),camera=new THREE.PerspectiveCamera(60,1,.1,200),sun=new THREE.DirectionalLight();
  sun.castShadow=true;sun.position.set(100,100,-20);sun.target.position.set(100,0,-20);Object.assign(sun.shadow.camera,{left:-10,right:10,top:10,bottom:-10,near:.1,far:200});sun.shadow.camera.updateProjectionMatrix();
  const shadowMatrix=sun.shadow.matrix.clone(),at=i=>new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(mesh.instanceMatrix.array,i*16)).toArray();
  camera.lookAt(0,0,-20);visibility.update(camera,sun);expect(mesh.count).toBe(2);expect(at(0)).toEqual([0,0,-20]);expect(at(1)).toEqual([100,0,-20]);
  const version=mesh.instanceMatrix.version;visibility.update(camera,sun);expect(mesh.instanceMatrix.version).toBe(version);
  expect(sun.shadow.matrix.equals(shadowMatrix)).toBe(true);expect(mesh.boundingSphere.equals(bounds)).toBe(true);
  camera.lookAt(0,0,20);visibility.update(camera,sun);expect(mesh.count).toBe(2);expect(at(1)).toEqual([0,0,20]);
  visibility.update(camera);expect(mesh.count).toBe(1);expect(at(0)).toEqual([0,0,20]);
  camera.position.set(0,0,300);camera.lookAt(0,0,400);visibility.update(camera);expect(mesh.count).toBe(0);
  camera.position.set(0,0,0);camera.lookAt(0,0,-20);visibility.update(camera);expect(mesh.count).toBe(1);expect(at(0)).toEqual([0,0,-20]);expect(mesh.instanceMatrix.count).toBe(256);
  mesh.geometry.dispose();mesh.material.dispose();mesh.dispose();
});

test('static batches reuse vertices while preserving every triangle attribute',()=>{
  const geometry=new THREE.PlaneGeometry(10,10).toNonIndexed(),expected=geometry.clone(),material=new THREE.MeshStandardMaterial({name:'Wall'}),source=new THREE.Group();
  source.add(new THREE.Mesh(geometry,material));const root=new THREE.Group();prepareBiggasCity([{scene:source}],root,{apply(){}});
  const merged=root.children[0].geometry;expect(merged.index.count).toBe(expected.attributes.position.count);expect(merged.attributes.position.count).toBe(4);
  for(const key of ['position','normal','uv']){
    const before=expected.attributes[key],after=merged.attributes[key];
    for(let i=0;i<before.count;i++)for(let c=0;c<before.itemSize;c++)expect(after.array[merged.index.getX(i)*after.itemSize+c]).toBe(before.array[i*before.itemSize+c]);
  }
  merged.dispose();expected.dispose();material.dispose();
});

test('water outside the view skips uploads and resumes at the current animation time',async()=>{
  const {createBiggasWater}=await import('../src/biggas-water.js');
  const geometry=new THREE.PlaneGeometry(20,30,2,2),mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());geometry.computeBoundingBox();
  const base=geometry.attributes.position.array.slice(),box=geometry.boundingBox.clone(),group=new THREE.Group(),water=createBiggasWater(group,[{mesh,fall:true,foam:false,base,box}],{random:()=>.5});
  const camera=new THREE.PerspectiveCamera(60,1,.1,200);camera.position.set(0,0,50);camera.lookAt(0,0,0);
  water.update(1,false,'flying',camera);const impactVersion=water.impact.instanceMatrix.version,version=geometry.attributes.position.version,uv=geometry.attributes.uv.array.slice();
  camera.lookAt(0,0,100);water.update(2,false,'flying',camera);expect(geometry.attributes.position.version).toBe(version);expect(water.spray.visible).toBe(false);expect(water.impact.visible).toBe(false);expect(water.impact.instanceMatrix.version).toBe(impactVersion);
  camera.lookAt(0,0,0);water.update(3,false,'flying',camera);expect(geometry.attributes.position.version).toBeGreaterThan(version);expect(water.spray.visible).toBe(true);expect(water.impact.visible).toBe(true);expect(water.impact.instanceMatrix.version).toBeGreaterThan(impactVersion);
  expect(geometry.attributes.uv.getY(0)-uv[1]).toBeCloseTo(-2.6,5);
  water.dispose();geometry.dispose();mesh.material.dispose();group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
});
