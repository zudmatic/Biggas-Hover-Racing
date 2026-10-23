import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {retro,bindRetroLighting,createBounceUniforms} from '../src/retro-material.js';
import {retroStyle} from '../src/retro-style.js';
import {applySceneMaterials} from '../src/scene-materials.js';
import {createArmModel} from '../src/character-arms.js';
import {ARM_CATALOG} from '../src/arm-catalog.js';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {prepareColors,applyColors} from '../src/scene-colors.js';
const catalog=JSON.parse(readFileSync(new URL('../src/scene-catalog.json',import.meta.url)));

test('material conversion preserves texture, alpha, emission and shared slots',()=>{
  const map=new THREE.Texture(),source=new THREE.MeshStandardMaterial({color:0xabc123,map,
    transparent:true,opacity:.4,alphaTest:.2,side:THREE.DoubleSide,emissive:0x332211,emissiveIntensity:.7});
  source.name='Paint';
  const root=new THREE.Group(),a=new THREE.Mesh(new THREE.BoxGeometry(),[source,source]),b=new THREE.Mesh(a.geometry,source);
  root.add(a,b);applySceneMaterials(root);
  const material=b.material;
  expect(a.material).toEqual([material,material]);
  expect(material.userData.retro).toBe(true);
  for(const key of ['name','map','transparent','opacity','alphaTest','side','emissiveIntensity'])expect(material[key]).toBe(source[key]);
  expect(material.color.equals(source.color)).toBe(true);expect(material.emissive.equals(source.emissive)).toBe(true);
  applySceneMaterials(root);expect(b.material).toBe(material);
});

test('paint and interaction clones retain shader, live lighting and pattern switches',()=>{
  const source=retro(0xaabbcc),mesh=new THREE.Mesh(new THREE.BoxGeometry(),source),lighting=createBounceUniforms();
  bindRetroLighting(mesh,lighting);
  const copy=source.clone();copy.color.set('#ff3300');copy.uniforms.retroHalftoneStrength.value=.1;
  expect(copy.uniforms.albedo.value).toBe(copy.color);
  expect(copy.uniforms.retroSun).toBe(lighting.retroSun);
  expect(source.uniforms.retroHalftoneStrength.value).toBe(.42);
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.lambert.vertexShader,fragmentShader:THREE.ShaderLib.lambert.fragmentShader};
  copy.onBeforeCompile(shader);expect(shader.fragmentShader).toContain('outgoingLight=retroPrint(');
  expect(shader.uniforms.albedo.value).toBe(copy.color);
  const space=retroStyle.space;
  try{
    retroStyle.setSpace('screen');expect(copy.defines.RETRO_OBJECT_SPACE).toBeUndefined();
    retroStyle.setSpace('object');expect(copy.defines.RETRO_OBJECT_SPACE).toBeDefined();
  }finally{retroStyle.setSpace(space);source.dispose();copy.dispose();}
});

test('custom arms keep live colors and wardrobe metadata survives the print conversion',()=>{
  for(const {id} of ARM_CATALOG){
    const arm=createArmModel(id,{comic:true});
    const colors={Color:'#112233',TrimColor:'#445566',AccentColor:'#ddeeff'};
    arm.setColors(colors);
    arm.root.traverse(mesh=>{if(mesh.isMesh){
      expect(mesh.material.userData.retro).toBe(true);expect(mesh.material.uniforms.albedo.value).toBe(mesh.material.color);
      const role=mesh.material.userData.armColorRole;if(role)expect('#'+mesh.material.color.getHexString()).toBe(colors[role]);
    }});
    arm.dispose();
  }
  const source=new THREE.MeshStandardMaterial({color:0x123456,roughness:.8,metalness:.2});
  source.userData.hatOriginal={color:source.color.clone(),roughness:source.roughness,metalness:source.metalness};
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(),source);applySceneMaterials(mesh);
  expect(mesh.material.userData.hatOriginal).toEqual(source.userData.hatOriginal);
  mesh.material.color.copy(mesh.material.userData.hatOriginal.color).multiply(new THREE.Color('#ff8800'));
  expect(mesh.material.uniforms.albedo.value).toBe(mesh.material.color);
});

test('all 31 catalog assets keep print and lighting after template cloning and saved paint',async()=>{
  const loader=new GLTFLoader(),lighting=createBounceUniforms();
  for(const model of catalog){
    const bytes=readFileSync(new URL(`../public/models/room-objects/${model.model}`,import.meta.url));
    const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    applySceneMaterials(gltf.scene);
    const entry={object:gltf.scene.clone(true)};prepareColors(entry);applyColors(entry,{'0':'#bc9955'});bindRetroLighting(entry.object,lighting);
    let meshes=0;
    entry.object.traverse(mesh=>{if(mesh.isMesh){meshes++;
      for(const material of [mesh.material].flat()){
        const shader={uniforms:{},vertexShader:THREE.ShaderLib.lambert.vertexShader,fragmentShader:THREE.ShaderLib.lambert.fragmentShader};
        material.onBeforeCompile(shader);
        expect(shader.fragmentShader,model.id).toContain('outgoingLight=retroPrint(');
        expect(shader.uniforms.retroSun,model.id).toBe(lighting.retroSun);
        expect(shader.uniforms.retroBands,model.id).toBe(retroStyle.uniforms.retroBands);
      }
    }});
    expect(meshes,model.id).toBeGreaterThan(0);
    expect(entry.colorSlots[0].owned.color.getHexString(),model.id).toBe('bc9955');
  }
});

test('a loaded and repainted bed visibly responds to the live comic shader',async({page})=>{
  test.setTimeout(120000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.route('**/src/entry.js',route=>route.fulfill({contentType:'text/javascript',body:''}));await page.goto('/');
  const result=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {createSceneDocument,catalog}=await import('/src/scene-document.js');
    const {bindRetroLighting,createBounceUniforms}=await import('/src/retro-material.js');
    const {retroStyle}=await import('/src/retro-style.js');
    const lighting=createBounceUniforms(),room={room:new THREE.Group(),editableObjects:[]};
    const doc=createSceneDocument(room,{onLoad:root=>bindRetroLighting(root,lighting)});
    const renderer=new THREE.WebGLRenderer();renderer.setSize(96,96);
    const target=new THREE.WebGLRenderTarget(96,96);renderer.setRenderTarget(target);
    const scene=new THREE.Scene();scene.add(room.room,new THREE.AmbientLight(0xffffff,2));
    const camera=new THREE.PerspectiveCamera(40,1,.01,100),results=[];
    const render=()=>{renderer.render(scene,camera);const pixels=new Uint8Array(96*96*4);renderer.readRenderTargetPixels(target,0,0,96,96,pixels);return pixels;};
    for(const model of catalog.filter(model=>model.id==='032')){
      const entry=await doc.add(model.id);doc.setColor(entry,0,'#bc9955');
      const snapshot=doc.snapshot();await doc.apply(snapshot);
      const object=doc.entries.get(entry.id).object;
      const bounds=new THREE.Box3().setFromObject(object),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()).length();
      camera.position.copy(center).add(new THREE.Vector3(size,size*.6,size));camera.lookAt(center);
      retroStyle.setLook('normal');const normal=render();retroStyle.setLook('comic');const comic=render();
      let changed=0,missing=0,compiled=0;
      for(let i=0;i<normal.length;i+=4)if(Math.abs(normal[i]-comic[i])+Math.abs(normal[i+1]-comic[i+1])+Math.abs(normal[i+2]-comic[i+2])>6)changed++;
      object.traverse(mesh=>{if(mesh.isMesh)for(const material of [mesh.material].flat()){
        if(!material.userData.retro||material.uniforms?.retroSun!==lighting.retroSun)missing++;
        if(material._retroShader)compiled++;
      }});
      results.push({id:model.id,changed,missing,compiled});doc.remove(doc.entries.get(entry.id));
    }
    target.dispose();renderer.dispose();return results;
  });
  expect(result).toHaveLength(1);
  for(const model of result){expect(model.missing,model.id).toBe(0);expect(model.compiled,model.id).toBeGreaterThan(0);expect(model.changed,model.id).toBeGreaterThan(10);}
  expect(errors).toEqual([]);
});
