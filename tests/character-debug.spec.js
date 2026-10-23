import {expandCharacterSections} from './helpers/character-editor.js';
import {test,expect} from '@playwright/test';
import {createZudModel} from '../src/zud-model.js';
import {CHARACTER_DEFAULTS,geometryFromQuality,CHARACTER_STORAGE,normalizeCharacterSettings,readCharacterDocument} from '../src/character-settings.js';
import {Box3,Raycaster,Vector3} from 'three';

const field=(page,key)=>page.locator(`[data-setting="${key}"]`);
async function openLab(page){await page.goto('/?debug=character');await expect(page.locator('.lab-viewport')).toHaveAttribute('data-ready','true');await expandCharacterSections(page);}

test('resolution changes actual body, head and hat geometry while retaining the rig',()=>{
  const models=['low','medium','high'].map(detail=>createZudModel({detail}));
  for(const name of ['Cabeza de Zud','Torso','Brazo','Pierna','Copa','Doblez','Pompón']){
    const counts=models.map(model=>model.root.getObjectByName(name).geometry.attributes.position.count);
    expect(counts[1],name).toBeGreaterThan(counts[0]);expect(counts[2],name).toBeGreaterThan(counts[1]);
  }
  for(const model of models){expect(model.arms).toHaveLength(2);expect(model.feet).toHaveLength(2);expect(model.eyes.children).toHaveLength(2);model.dispose();}
});

test('quality rounds the same base shell, preserves expression and interpolates real curves',()=>{
  const base=createZudModel({detail:'high',appearance:false});
  const half=createZudModel({detail:'high',curve:.5,appearance:false});
  const full=createZudModel({detail:'high',curve:1,appearance:false});
  for(const name of ['Cabeza de Zud','Torso','Brazo','Pierna','Copa','Doblez','Pompón']) {
    const a=base.root.getObjectByName(name),b=half.root.getObjectByName(name),c=full.root.getObjectByName(name);
    const original=a.geometry.attributes.position.array,curved=c.geometry.attributes.position.array;
    expect(curved.length).toBe(original.length);
    let moved=0,maxDelta=0,maxInterpolationError=0,finite=true;
    for(let i=0;i<original.length;i++) {
      finite &&=Number.isFinite(curved[i]);
      maxInterpolationError=Math.max(maxInterpolationError,Math.abs(b.geometry.attributes.position.array[i]-(original[i]+curved[i])/2));
      const delta=Math.abs(curved[i]-original[i]);maxDelta=Math.max(maxDelta,delta);if(delta>1e-4)moved++;
    }
    expect(moved,name).toBeGreaterThan(0);expect(finite).toBe(true);expect(maxDelta).toBeLessThan(.1);expect(maxInterpolationError).toBeLessThan(1e-6);
    expect(c.position.toArray()).toEqual(a.position.toArray());
  }
  full.eyes.children.forEach((eye,i)=>eye.children.forEach((mesh,j)=>{
    const actual=mesh.geometry.attributes.position,expected=base.eyes.children[i].children[j].geometry.attributes.position;
    expect(actual.count).toBe(expected.count);
    expect(Array.from(actual.array.subarray(0,actual.count*3))).toEqual(Array.from(expected.array.subarray(0,expected.count*3)));
  }));
  for(const model of [base,half,full])model.dispose();
});

test('full curves keep the eyes exposed and the crown joined to the folded beanie',()=>{
  const model=createZudModel({detail:'high',curve:1});model.root.position.set(0,0,0);model.root.updateMatrixWorld(true);
  const head=model.root.getObjectByName('Cabeza de Zud'),hat=model.root.getObjectByName('Beanie de Zud'),ray=new Raycaster();
  for(const eye of model.eyes.children)for(const mesh of eye.children) {
    const p=mesh.geometry.attributes.position;
    for(let i=0;i<p.count;i+=99) {
      const center=new Vector3();for(let j=0;j<3;j++)center.add(new Vector3().fromBufferAttribute(p,i+j));
      center.divideScalar(3).applyMatrix4(mesh.matrixWorld);ray.set(new Vector3(center.x,center.y,5),new Vector3(0,0,-1));
      const hit=ray.intersectObject(head,false)[0];expect(hit).toBeTruthy();expect(center.z-hit.point.z).toBeGreaterThan(0);
    }
  }
  for(let degrees=2.5;degrees<360;degrees+=10)for(let y=.65;y<=1;y+=.05)for(const slope of [.5,1,2]) {
    const angle=degrees*Math.PI/180,radial=new Vector3(Math.sin(angle),0,Math.cos(angle));
    const target=radial.clone().multiplyScalar(1.02);target.y=y;
    const direction=radial.clone().negate();direction.y=-slope;direction.normalize();ray.set(target.clone().addScaledVector(direction,-3),direction);
    expect(ray.intersectObjects([hat,head],true)[0]?.object.parent).toBe(hat);
  }
  model.dispose();
});

test('default document and quality migration preserve the supplied character',()=>{
  expect(CHARACTER_DEFAULTS).toMatchObject({detail:'high',shading:'smooth',meshQuality:100,comicShader:true,skinColor:'#302727',hatColor:'#d95326',light:3.1});
  expect(readCharacterDocument({version:1,settings:{},lightStudy:{enabled:true}})).not.toHaveProperty('lightStudy');
  expect(()=>readCharacterDocument({type:'zud-sss',version:1,settings:{}})).toThrow();
  for(const value of [0,25,40,50,75,90,100])expect(normalizeCharacterSettings({meshQuality:value})).toMatchObject(geometryFromQuality(value));
  expect(normalizeCharacterSettings({detail:'original',shading:'flat'}).meshQuality).toBe(25);
  expect(normalizeCharacterSettings({detail:'high',shading:'smooth'}).meshQuality).toBe(75);
});

test('manual resolutions preserve the base hat profile from all directions and after disposal',()=>{
  const base=createZudModel({detail:'original',appearance:false});base.root.updateMatrixWorld(true);
  const hat=base.root.getObjectByName('Beanie de Zud'),bounds=new Box3().setFromObject(hat),ray=new Raycaster();
  for(const detail of ['low','medium','high','original']) {
    const model=createZudModel({detail,appearance:false});model.root.updateMatrixWorld(true);
    const variant=model.root.getObjectByName('Beanie de Zud'),actual=new Box3().setFromObject(variant);
    expect(actual.min.distanceTo(bounds.min)).toBeLessThan(1e-6);
    expect(actual.max.distanceTo(bounds.max)).toBeLessThan(1e-6);
    for(let angle=0;angle<Math.PI*2;angle+=Math.PI/12)for(let y=1.85;y<3.4;y+=.12) {
      const origin=new Vector3(4*Math.sin(angle),y,4*Math.cos(angle));
      ray.set(origin,new Vector3(-origin.x,0,-origin.z).normalize());
      const expected=ray.intersectObject(hat,true)[0],hit=ray.intersectObject(variant,true)[0];
      expect(Boolean(hit),`${detail} silhouette at ${angle}, ${y}`).toBe(Boolean(expected));
      if(expected)expect(Math.abs(hit.distance-expected.distance)).toBeLessThan(1e-5);
    }
    model.dispose();
  }
  base.dispose();
});

test('import validates its version, clamps values and excludes arbitrary properties',()=>{
  expect(normalizeCharacterSettings({width:100,metalness:-2,light:NaN,hatColor:'bad',detail:'ultra',wireframe:'yes',unexpected:42}))
    .toEqual({...CHARACTER_DEFAULTS,width:1.3,metalness:0});
  expect(()=>readCharacterDocument({version:2,settings:{}})).toThrow();
  expect(()=>readCharacterDocument({version:1,settings:{},texture:'https://example.com/image.png'})).toThrow();
  expect(readCharacterDocument({version:1,settings:{hatTexture:'custom'}}).settings.hatTexture).toBe('none');
});

test('lab edits, saves, reloads, exports, imports and restores a variant',async({page})=>{
  test.setTimeout(90000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.addInitScript(key=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({version:1,settings:{meshQuality:75,comicShader:false},texture:null,lightStudy:{enabled:true,settings:{scatter:.98}}}));
  },CHARACTER_STORAGE);
  await openLab(page);
  await expect(page.locator('#light-study')).toHaveCount(0);
  await expect(page.locator('[data-light-setting]')).toHaveCount(0);
  await expect(field(page,'meshQuality')).toHaveValue('100');
  await expect(field(page,'comicShader')).toBeChecked();
  await expect(page.locator('.lab-viewport')).toHaveAttribute('data-comic','true');
  await field(page,'comicShader').uncheck();
  await expect(field(page,'material')).toHaveValue('toon');
  await expect(field(page,'skinTexture')).toHaveValue('skin');
  await expect(field(page,'hatColor')).toHaveValue('#d95326');
  await expect(page.locator('.lab-presets')).toHaveCount(0);
  await field(page,'meshQuality').fill('0');
  const low=Number(await page.locator('.lab-viewport').getAttribute('data-triangles'));
  await field(page,'meshQuality').fill('100');
  await expect(page.locator('.lab-viewport')).toHaveAttribute('data-detail','high');
  expect(Number(await page.locator('.lab-viewport').getAttribute('data-triangles'))).toBeGreaterThan(low);
  await expect(page.locator('.lab-viewport')).toHaveAttribute('data-shading','smooth');
  await field(page,'hatColor').fill('#315d95');
  await field(page,'wireframe').check();
  await expect.poll(()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).settings.hatColor,CHARACTER_STORAGE)).toBe('#315d95');
  await page.reload();await expandCharacterSections(page);
  await expect(field(page,'hatColor')).toHaveValue('#315d95');await expect(field(page,'wireframe')).toBeChecked();
  await field(page,'wireframe').uncheck();
  const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar JSON'}).click();
  const download=await downloadEvent;const stream=await download.createReadStream();let json='';for await(const chunk of stream)json+=chunk;
  expect(JSON.parse(json)).not.toHaveProperty('lightStudy');
  const exported=readCharacterDocument(JSON.parse(json));expect(exported.settings.detail).toBe('high');expect(exported.settings.meshQuality).toBe(100);expect(exported.settings.hatColor).toBe('#315d95');
  await page.getByRole('button',{name:'Restaurar base'}).click();await expect(field(page,'meshQuality')).toHaveValue('100');
  await expect(field(page,'material')).toHaveValue('toon');
  await expect(field(page,'skinColor')).toHaveValue('#302727');
  await expect(field(page,'hatTexture')).toHaveValue('fabric');
  await page.locator('#lab-import-file').setInputFiles({name:'variant.json',mimeType:'application/json',buffer:Buffer.from(json)});
  await expect(field(page,'hatColor')).toHaveValue('#315d95');
  await page.locator('#lab-import-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{oops')});
  await expect(page.locator('.lab-status')).toContainText('No se pudo leer');await expect(field(page,'hatColor')).toHaveValue('#315d95');
  for(const material of ['normal','toon','standard']){await field(page,'material').selectOption(material);await expect(page.locator('.lab-viewport')).toHaveAttribute('data-material',material);}
  for(const view of ['Frente','Perfil','Espalda','Centrar'])await page.getByRole('button',{name:view,exact:true}).click();
  await page.locator('.lab-panel').evaluate(el=>el.scrollTop=0);
  await page.screenshot({path:'.context/character-lab-desktop.png'});
  expect(errors).toEqual([]);
});

test('custom texture survives export, restore and import; editor fits mobile',async({page})=>{
  test.setTimeout(60000);await page.setViewportSize({width:390,height:844});await openLab(page);
  await page.locator('#lab-texture-file').setInputFiles('public/textures/zud-rug.png');
  await expect(field(page,'hatTexture')).toHaveValue('custom');
  await expect.poll(()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).texture?.startsWith('data:image/png;base64,'),CHARACTER_STORAGE)).toBe(true);
  const saved=await page.evaluate(key=>localStorage.getItem(key),CHARACTER_STORAGE);
  await page.getByRole('button',{name:'Restaurar base'}).click();
  await expect(field(page,'hatTexture')).toHaveValue(CHARACTER_DEFAULTS.hatTexture);
  await page.locator('#lab-import-file').setInputFiles({name:'texture.json',mimeType:'application/json',buffer:Buffer.from(saved)});
  await expect(field(page,'hatTexture')).toHaveValue('custom');
  await page.reload();await expandCharacterSections(page);await expect(field(page,'hatTexture')).toHaveValue('custom');
  await expect(page.locator('.lab-viewport')).toHaveAttribute('data-ready','true');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'.context/character-lab-mobile.png',fullPage:true});
});

test('existing debug panel and room still load, with a working editor entry',async({page})=>{
  test.setTimeout(60000);await page.goto('/?debug');
  await expect(page.locator('#stage')).toHaveAttribute('data-ready','true',{timeout:20000});
  await expect(page.locator('.lil-gui.lil-root')).toBeVisible({timeout:20000});
  await page.getByRole('link',{name:'Editar personaje'}).click();
  await expect(page.locator('.lab-viewport')).toHaveAttribute('data-ready','true');await expandCharacterSections(page);
  await expect(page.locator('#zud-canvas')).toHaveCount(0);
  await page.getByRole('link',{name:'Volver al cuarto'}).click();
  await expect(page.locator('#stage')).toHaveAttribute('data-ready','true',{timeout:20000});
});
