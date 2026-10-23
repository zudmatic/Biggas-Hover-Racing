import {expandCharacterSections} from './helpers/character-editor.js';
import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {createCharacterHats} from '../src/character-hats.js';
import {CHARACTER_DEFAULTS,CHARACTER_STORAGE,normalizeCharacterSettings,readCharacterDocument} from '../src/character-settings.js';
import {HAT_CATALOG,hatDefaults} from '../src/hat-catalog.js';

const field=(page,key)=>page.locator(`[data-setting="${key}"]`);
const openLab=async page=>{await page.goto('/?debug=character');await expect(page.locator('.lab-viewport')).toHaveAttribute('data-ready','true');await expandCharacterSections(page);};

test('old documents keep the beanie; imported wardrobe values are bounded',()=>{
  expect(readCharacterDocument({version:1,settings:{}}).settings.hatModel).toBe('beanie');
  const settings=normalizeCharacterSettings({hatModel:'../../unknown.glb',hatYaw:999,hatOffsetY:-999,hatSize:99,hatTint:'red',hatMetalness:NaN});
  expect(settings).toMatchObject({hatModel:'beanie',hatYaw:180,hatOffsetY:-.35,hatSize:1.4,hatTint:'#ffffff',hatMetalness:0});
});

test('only the three approved hats remain, with the supplied defaults and a safe legacy fallback',()=>{
  const approved={
    samurai_kasa:[1.03,0,2,'#fff8e0',.34,1.2],
    cloud_chef:[1.04,0,0,'#ffffff',.35,1.2],
    crescent_wizard:[1.07,10,5,'#bcc6fb',.58,1.2],
  };
  expect(HAT_CATALOG.map(hat=>hat.id)).toEqual(Object.keys(approved));
  for(const [id,[hatSize,hatYaw,hatTilt,hatTint,hatMetalness,hatCrownHeight]] of Object.entries(approved)){
    const expected={hatModel:id,hatSize,hatYaw,hatTilt,hatTint,hatMetalness,hatCrownHeight,hatOffsetX:0,hatOffsetY:-.35,hatOffsetZ:0,hatRoughness:1,hatAutoFit:true,showHat:true};
    expect(hatDefaults(id)).toEqual(expected);
    expect(readCharacterDocument({version:1,settings:{hatModel:id}}).settings).toMatchObject(expected);
  }
  for(const id of ['sunset_ballcap','samurai_kabuto','tidal_bucket','forest_ranger','lunar_pilot','festival_jester','clockwork_topper'])
    expect(readCharacterDocument({version:1,settings:{hatModel:id}}).settings.hatModel).toBe('beanie');
});

test('late loads cannot replace the latest selection and release their resources',async()=>{
  const root=new THREE.Group(),beanie=new THREE.Group(),pompom=new THREE.Group();
  beanie.name='Beanie de Zud';pompom.name='Pompón';beanie.add(pompom);root.add(beanie);
  let resolve;
  const hats=createCharacterHats({root},{load:()=>new Promise(done=>{resolve=done;})});
  const loading=hats.update({...CHARACTER_DEFAULTS,hatModel:HAT_CATALOG[0].id});
  await hats.update({...CHARACTER_DEFAULTS,hatModel:'none'});
  const scene=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());scene.add(mesh);
  let disposed=0;mesh.geometry.addEventListener('dispose',()=>disposed++);mesh.material.addEventListener('dispose',()=>disposed++);
  resolve({scene});await loading;
  expect(disposed).toBe(2);expect(beanie.visible).toBe(false);expect(hats.anchor.children[0].children).toHaveLength(0);
  hats.dispose();
});

test('all three GLBs attach at identity, adjust around the head and dispose cleanly',async({page})=>{
  await openLab(page);
  const results=await page.evaluate(async()=>{
    const {createZudModel}=await import('/src/zud-model.js');
    const {createCharacterHats}=await import('/src/character-hats.js');
    const {HAT_CATALOG,hatDefaults}=await import('/src/hat-catalog.js');
    const {CHARACTER_DEFAULTS}=await import('/src/character-settings.js');
    const model=createZudModel({appearance:false});
    const controller=createCharacterHats(model);
    const result=[];
    for(const entry of HAT_CATALOG){
      await controller.update({...CHARACTER_DEFAULTS,hatModel:entry.id});
      model.root.updateMatrixWorld(true);
      const mount=controller.anchor.children[0],hat=mount.children[0];
      let triangles=0,meshes=0;hat.traverse(mesh=>{if(mesh.isMesh){meshes++;triangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3;}});
      result.push({name:hat.name,triangles,meshes,position:mount.position.toArray(),scale:mount.scale.toArray(),beanie:model.root.getObjectByName('Beanie de Zud').visible});
    }
    await controller.update({...CHARACTER_DEFAULTS,hatModel:HAT_CATALOG.at(-1).id,hatSize:1.2,hatOffsetY:.1,hatYaw:45,hatTint:'#ff0000',hatMetalness:1});
    const mount=controller.anchor.children[0];let material;mount.traverse(mesh=>{if(mesh.isMesh)material=mesh.material;});
    const adjusted={scale:mount.scale.x,yaw:mount.rotation.y,y:mount.position.y,green:material.color.g,metal:material.metalness};
    controller.dispose();model.dispose();return {result,adjusted};
  });
  for(const [i,hat] of results.result.entries()){expect(hat.triangles).toBeGreaterThan(HAT_CATALOG[i].triangles);expect(hat.triangles).toBeLessThan(HAT_CATALOG[i].triangles*4);expect(hat.meshes).toBeLessThanOrEqual(20);}
  for(const hat of results.result){expect(hat.position).toEqual([0,0,0]);expect(hat.scale).toEqual([1,1,1]);expect(hat.beanie).toBe(false);}
  expect(results.adjusted.scale).toBe(1.2);expect(results.adjusted.yaw).toBeCloseTo(Math.PI/4);expect(results.adjusted.y).toBeCloseTo(.002);expect(results.adjusted.green).toBe(0);expect(results.adjusted.metal).toBe(1);
});

test('equip, adjust, export, reload and return to the room with the same hat',async({page})=>{
  test.setTimeout(120000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  // Keep full-room frames responsive on the headless software GPU; this test
  // checks wardrobe persistence, while print effects have their own coverage.
  await page.setViewportSize({width:960,height:720});
  await page.goto('/?debug=character&look=normal');
  await expect(page.locator('.lab-viewport')).toHaveAttribute('data-ready','true');await expandCharacterSections(page);
  expect(await field(page,'hatModel').locator('option').count()).toBe(5);
  await field(page,'hatModel').selectOption('crescent_wizard');
  await expect(page.locator('.lab-viewport')).toHaveAttribute('data-hat','crescent_wizard');
  for(const [key,value] of Object.entries({hatSize:'1.08',hatOffsetY:'0.06',hatYaw:'15',hatTilt:'3',hatRoughness:'0.7',hatMetalness:'0.2',hatCrownHeight:'0.92'}))await field(page,key).fill(value);
  await field(page,'hatTint').fill('#ffe8ce');
  await expect.poll(()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key))?.settings.hatTint,CHARACTER_STORAGE)).toBe('#ffe8ce');
  const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar JSON'}).click();
  const stream=await(await downloadEvent).createReadStream();let json='';for await(const chunk of stream)json+=chunk;
  expect(JSON.parse(json).settings).toMatchObject({hatModel:'crescent_wizard',hatSize:1.08,hatYaw:15,hatTint:'#ffe8ce'});
  await page.getByRole('button',{name:'Restaurar base',exact:true}).click();
  await page.locator('#lab-import-file').setInputFiles({name:'hats.json',mimeType:'application/json',buffer:Buffer.from(json)});
  await expect(page.locator('.lab-viewport')).toHaveAttribute('data-hat','crescent_wizard');
  await page.reload();await expandCharacterSections(page);await expect(page.locator('.lab-viewport')).toHaveAttribute('data-hat','crescent_wizard');
  await expect(field(page,'hatYaw')).toHaveValue('15');await expect(field(page,'hatAutoFit')).toBeChecked();await expect(field(page,'hatCrownHeight')).toHaveValue('0.92');
  await page.locator('.lab-panel').evaluate(el=>el.scrollTop=0);
  await page.screenshot({path:'.context/hats-editor.png'});
  // Navigate within the save debounce window to verify the explicit flush.
  await field(page,'hatYaw').fill('20');
  await page.getByRole('link',{name:'Volver al cuarto'}).click();
  await expect(page.locator('#stage')).toHaveAttribute('data-ready','true',{timeout:20000});
  await expect(page.locator('#stage')).toHaveAttribute('data-hat','crescent_wizard');
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).settings.hatYaw,CHARACTER_STORAGE)).toBe(20);
  await expect(page.locator('body')).toHaveAttribute('data-house-ready','true',{timeout:45000});
  await page.locator('#zud-canvas').focus();await page.keyboard.press('3');
  await page.screenshot({path:'.context/hats-room.png'});
  await page.getByRole('link',{name:'Editar personaje'}).click();await expandCharacterSections(page);
  await expect(field(page,'hatModel')).toHaveValue('crescent_wizard');
  await page.getByRole('button',{name:'Restablecer ajustes del sombrero'}).click();
  await expect(field(page,'hatSize')).toHaveValue('1.07');await expect(field(page,'hatTint')).toHaveValue('#bcc6fb');
  await field(page,'showHat').uncheck();
  await field(page,'hatModel').selectOption('none');
  await page.getByRole('link',{name:'Volver al cuarto'}).click();
  await expect(page.locator('#stage')).toHaveAttribute('data-hat','none',{timeout:20000});
  expect(errors).toEqual([]);
});

test('failed loads show a fallback and can retry; selector fits mobile',async({page})=>{
  await page.setViewportSize({width:390,height:844});await openLab(page);
  await page.route('**/models/hats/*.glb',route=>route.abort());
  await field(page,'hatModel').selectOption('samurai_kasa');
  await expect(page.locator('.lab-viewport')).toHaveAttribute('data-hat-state','error');
  await expect(page.locator('.lab-viewport')).toHaveAttribute('data-hat','beanie');
  await expect(page.locator('.lab-hat-status')).toContainText('No se pudo cargar');
  await page.unroute('**/models/hats/*.glb');
  await page.getByRole('button',{name:'Reintentar carga'}).click();
  await expect(page.locator('.lab-viewport')).toHaveAttribute('data-hat','samurai_kasa');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'.context/hats-mobile.png',fullPage:true});
});
