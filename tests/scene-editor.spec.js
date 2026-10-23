import {test,expect} from '@playwright/test';
import {readFileSync,readdirSync} from 'node:fs';
import {readSceneDocument,SCENE_STORAGE} from '../src/scene-document.js';
const catalog=JSON.parse(readFileSync(new URL('../src/scene-catalog.json',import.meta.url),'utf8'));
const supplied=JSON.parse(readFileSync(new URL('../src/scene-base.json',import.meta.url),'utf8'));
const ready=async page=>{await page.goto('/?edit=scene');await expect(page.locator('.scene-editor')).toHaveAttribute('data-ready','true',{timeout:60000});};
test.setTimeout(120000);
test.beforeEach(async({page})=>{await page.addInitScript(key=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({version:2,builtins:[],objects:[]}));},SCENE_STORAGE);});
const saved=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SCENE_STORAGE);

test('catalog contains exactly the 31 self-contained supplied GLBs and previews',()=>{
  expect(catalog).toHaveLength(31);expect(new Set(catalog.map(model=>model.id)).size).toBe(31);
  for(const model of catalog){
    const file=readFileSync(new URL(`../public/models/room-objects/${model.model}`,import.meta.url));
    expect(file.toString('utf8',0,4)).toBe('glTF');
    const json=JSON.parse(file.toString('utf8',20,20+file.readUInt32LE(12)));
    expect(json.buffers.every(buffer=>!buffer.uri)).toBe(true);
    expect(json.meshes.length).toBeGreaterThan(0);
    expect(readFileSync(new URL(`../public/models/room-objects/previews/${model.preview}`,import.meta.url)).length).toBeGreaterThan(100);
  }
  expect(readdirSync(new URL('../public/models/room-objects',import.meta.url)).filter(f=>f.endsWith('.glb'))).toHaveLength(31);
});

test('scene documents reject malformed values, unknown models and duplicate IDs',()=>{
  const base={version:1,builtins:[],objects:[{id:'one',model:'001',position:[0,.09,0],rotation:[0,0,0],scale:[1,1,1],visible:true}]};
  expect(readSceneDocument(base,[])).toEqual(base);
  for(const edit of [d=>d.objects[0].scale[0]=-1,d=>d.objects[0].position[1]=Infinity,d=>d.objects[0].model='external-url',d=>d.objects.push(d.objects[0]),d=>d.version=999]){const doc=structuredClone(base);edit(doc);expect(()=>readSceneDocument(doc,[])).toThrow();}
});

test('add, transform, replace, undo, remove, reload and return to the room',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await ready(page);
  await expect(page.locator('[data-model]')).toHaveCount(31);
  await page.getByLabel('Buscar modelos').fill('giratoria');await expect(page.locator('[data-model]')).toHaveCount(1);
  await page.getByRole('button',{name:'Agregar Silla giratoria de escritorio',exact:true}).click();
  await expect(page.locator('#se-selection')).toHaveText('Silla giratoria de escritorio');
  await page.getByLabel('Posición X',{exact:true}).fill('1.8');await page.getByLabel('Posición X',{exact:true}).press('Tab');
  await page.getByLabel('Giro Y',{exact:true}).fill('90');await page.getByLabel('Giro Y',{exact:true}).press('Tab');
  await page.getByLabel('Escala uniforme').fill('0.8');await page.getByLabel('Escala uniforme').press('Tab');
  let doc=await saved(page);expect(doc.objects).toHaveLength(1);expect(doc.objects[0].position[0]).toBe(1.8);expect(doc.objects[0].rotation[1]).toBeCloseTo(Math.PI/2);expect(doc.objects[0].scale).toEqual([.8,.8,.8]);
  await page.getByRole('button',{name:'Reemplazar objeto'}).click();await page.getByLabel('Buscar modelos').fill('Puf');await page.locator('[data-model="006"]').click();
  await expect(page.locator('#se-selection')).toHaveText('Puf de lectura');expect((await saved(page)).objects[0].model).toBe('006');
  await page.getByRole('button',{name:'Deshacer',exact:true}).click();await expect.poll(async()=>(await saved(page)).objects[0].model).toBe('001');
  await page.getByRole('button',{name:'Rehacer',exact:true}).click();await expect.poll(async()=>(await saved(page)).objects[0].model).toBe('006');
  await page.reload();await expect(page.locator('.scene-editor')).toHaveAttribute('data-ready','true',{timeout:60000});await page.getByRole('tab',{name:'En escena'}).click();await page.locator('[data-object]').filter({hasText:'Puf de lectura'}).click();
  await page.getByRole('button',{name:'Quitar de la escena'}).click();expect((await saved(page)).objects).toHaveLength(0);
  await page.getByRole('button',{name:'Deshacer',exact:true}).click();await expect.poll(async()=>(await saved(page)).objects.length).toBe(1);
  await page.getByRole('link',{name:'Volver al cuarto'}).click();await expect(page.locator('#stage')).toHaveAttribute('data-ready','true',{timeout:60000});await expect(page.locator('#stage')).toHaveAttribute('data-custom-scene','true');
  await page.getByRole('link',{name:'Editar escena'}).click();await expect(page.locator('.scene-editor')).toHaveAttribute('data-ready','true',{timeout:60000});expect((await saved(page)).objects).toHaveLength(1);expect(errors).toEqual([]);
});

test('original furniture can be moved/replaced and invalid imports or failed loads leave it intact',async({page})=>{
  await ready(page);await page.getByRole('tab',{name:'En escena'}).click();await page.locator('[data-object="chair"]').click();
  await page.getByLabel('Posición X',{exact:true}).fill('1.7');await page.getByLabel('Posición X',{exact:true}).press('Tab');
  expect((await saved(page)).builtins.find(item=>item.id==='chair').position[0]).toBe(1.7);
  const before=await saved(page);
  await page.locator('#se-file').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{"version":999}')});await expect(page.locator('#se-status')).toHaveAttribute('data-error','true');expect(await saved(page)).toEqual(before);
  await page.getByRole('button',{name:'Reemplazar objeto'}).click();await page.route('**/002_articulated_task_lamp_v02.glb',route=>route.abort());await page.locator('[data-model="002"]').click();await expect(page.locator('#se-status')).toHaveAttribute('data-error','true');expect(await saved(page)).toEqual(before);
  await page.unroute('**/002_articulated_task_lamp_v02.glb');
  await page.locator('[data-model="001"]').click();await expect(page.locator('#se-selection')).toHaveText('Silla giratoria de escritorio');
  expect((await saved(page)).builtins.find(item=>item.id==='chair').visible).toBe(false);
  expect((await saved(page)).objects[0].position[1]).toBe(.09);
  await page.getByRole('button',{name:'Restaurar escena base'}).click();await expect.poll(async()=>(await saved(page)).objects.length).toBe(supplied.objects.length);expect((await saved(page)).builtins.find(item=>item.id==='chair').visible).toBe(false);
  await page.getByRole('button',{name:'Deshacer',exact:true}).click();await expect.poll(async()=>(await saved(page)).objects.length).toBe(1);
});

test('mobile editor fits and exposes catalog and object controls',async({page})=>{
  await page.setViewportSize({width:390,height:844});await ready(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.locator('[data-model="018"]').click();await expect(page.locator('#se-selection')).toHaveText('Taza con posavasos');await page.getByLabel('Posición Y',{exact:true}).fill('1.3');await page.getByLabel('Posición Y',{exact:true}).press('Tab');expect((await saved(page)).objects[0].position[1]).toBe(1.3);
});

test('all catalog models load in Three.js at their authored dimensions',async({page})=>{
  await page.route('**/src/entry.js',route=>route.fulfill({contentType:'text/javascript',body:''}));await page.goto('/');
  const models=await page.evaluate(async()=>{
    const {GLTFLoader}=await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {catalog,assetUrl}=await import('/src/scene-document.js');
    const loader=new GLTFLoader();
    return Promise.all(catalog.map(async model=>{const gltf=await loader.loadAsync(assetUrl(model.model)),box=new THREE.Box3().setFromObject(gltf.scene,true);return {id:model.id,size:box.getSize(new THREE.Vector3()).toArray(),minY:box.min.y};}));
  });
  expect(models).toHaveLength(31);
  for(const model of models){expect(model.minY).toBeCloseTo(0,4);const expected=catalog.find(item=>item.id===model.id);model.size.forEach((n,i)=>expect(n).toBeCloseTo(expected.dimensions[i],3));}
});

test('moving an original prop to the floor updates the room walking obstacles',async({page})=>{
  await page.addInitScript(({key,scene})=>localStorage.setItem(key,JSON.stringify(scene)),{key:SCENE_STORAGE,scene:{version:1,builtins:[{id:'lamp',position:[1.8,.09,1.4],rotation:[0,0,0],scale:[1,1,1],visible:true}],objects:[]}});
  await page.goto('/');await expect(page.locator('#stage')).toHaveAttribute('data-ready','true',{timeout:60000});
  await expect(page.locator('#stage')).toHaveAttribute('data-custom-scene','true');
  const blocked=await page.evaluate(async()=>{const {canStand}=await import('/src/home-movement.js');return !canStand(1.5,1.4);});expect(blocked).toBe(true);
});
