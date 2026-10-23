import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {SURFACE_FAMILIES,CHARACTER_SURFACE_SCALE,createSurfaceTexture,setRoomSurfaceUV} from '../src/surface-library.js';
import {createRoomSurfaces} from '../src/room-surfaces.js';
import {editableGeometry,createCharacterMaterials,updateCharacterMaterials,patternTexture} from '../src/character-surfaces.js';
import {CHARACTER_DEFAULTS,readCharacterDocument} from '../src/character-settings.js';

test('family maps are deterministic, neutral and use linear heights separately from color',()=>{
  for(const kind of Object.keys(SURFACE_FAMILIES)){
    const color=createSurfaceTexture(kind),again=createSurfaceTexture(kind),height=createSurfaceTexture(kind,{heightMap:true});
    expect(Buffer.from(color.image.data).equals(Buffer.from(again.image.data))).toBe(true);
    expect(color.colorSpace).toBe(THREE.SRGBColorSpace);expect(height.colorSpace).toBe(THREE.NoColorSpace);
    const pixels=color.image.data;let min=255,max=0,neutral=true;
    for(let i=0;i<pixels.length;i+=4){min=Math.min(min,pixels[i]);max=Math.max(max,pixels[i]);neutral&&=pixels[i]===pixels[i+1]&&pixels[i]===pixels[i+2];}
    expect(neutral).toBe(true);expect(max-min).toBeGreaterThan(0);expect(min).toBeGreaterThanOrEqual(Math.floor(255*(1-SURFACE_FAMILIES[kind].contrast)));
    for(const texture of [color,again,height])texture.dispose();
  }
});

test('texture density follows physical size, while old UVs remain available',()=>{
  const source=new THREE.BoxGeometry(2,3,4);
  const small=editableGeometry(source,false,new THREE.Vector3(1,1,1));
  const large=editableGeometry(source,false,new THREE.Vector3(2,2,2));
  expect(large.attributes.uv.array).toEqual(small.attributes.uv.array);
  for(let i=0;i<small.attributes.uv1.array.length;i++)expect(large.attributes.uv1.array[i]).toBeCloseTo(small.attributes.uv1.array[i]*2,5);
  const v=small.attributes.uv1.array.filter((_,i)=>i%2===1);
  expect(Math.max(...v)-Math.min(...v)).toBeCloseTo(3*CHARACTER_SURFACE_SCALE);
  setRoomSurfaceUV(source);
  const top=[];for(let i=0;i<source.attributes.position.count;i++)if(source.attributes.normal.getY(i)>.99)top.push(source.attributes.uv.getX(i));
  expect(Math.max(...top)-Math.min(...top)).toBeCloseTo(2);
  source.dispose();small.dispose();large.dispose();
});

test('room and character use the same cloth density and relief, with independent linear height maps',()=>{
  const pool=createRoomSurfaces(),blanket=pool.material('fabric',0x565d86),pillow=pool.material('fabric',0xf4f1ec);
  const maps=new Map([['fabric',patternTexture('fabric')],['skin',patternTexture('skin')]]),materials=createCharacterMaterials(CHARACTER_DEFAULTS);
  updateCharacterMaterials(materials,CHARACTER_DEFAULTS,maps);
  expect(materials.hat.map.repeat.toArray()).toEqual(blanket.map.repeat.toArray());
  expect(materials.hat.bumpScale).toBeCloseTo(blanket.bumpScale);
  expect(materials.skin.bumpScale).not.toBe(materials.hat.bumpScale);
  expect(blanket.map).toBe(pillow.map);expect(blanket.color.getHexString()).toBe('565d86');
  expect(materials.hat.map.channel).toBe(1);expect(blanket.map.channel).toBe(0);
  expect(blanket.bumpMap.colorSpace).toBe(THREE.NoColorSpace);
  Object.values(materials).forEach(material=>material.dispose());maps.forEach(map=>map.dispose());pool.dispose();
});

test('older exported textures retain normalized UVs, repeat and relief; changing presets releases owned maps',()=>{
  const settings=readCharacterDocument({version:1,settings:{...CHARACTER_DEFAULTS,skinTexture:'noise',hatTexture:'noise',textureScale:5,bump:.15}}).settings;
  const maps=new Map([['noise',patternTexture('noise')],['skin',patternTexture('skin')],['fabric',patternTexture('fabric')]]);
  const materials=createCharacterMaterials(settings);
  updateCharacterMaterials(materials,settings,maps);
  expect(materials.skin.map.channel).toBe(0);expect(materials.skin.map.repeat.toArray()).toEqual([5,5]);expect(materials.skin.bumpScale).toBe(.15);
  expect(materials.skin.map.image).toBe(maps.get('noise').image);
  let sourceDisposed=0,oldDisposed=0;maps.get('noise').addEventListener('dispose',()=>sourceDisposed++);materials.skin.map.addEventListener('dispose',()=>oldDisposed++);
  updateCharacterMaterials(materials,CHARACTER_DEFAULTS,maps);
  expect(oldDisposed).toBe(1);expect(sourceDisposed).toBe(0);expect(materials.skin.map.channel).toBe(1);
  const current=materials.skin.map;updateCharacterMaterials(materials,{...CHARACTER_DEFAULTS,textureScale:6},maps);
  expect(materials.skin.map).toBe(current);expect(current.repeat.x).toBeCloseTo(SURFACE_FAMILIES.skin.density*2);
  Object.values(materials).forEach(material=>material.dispose());maps.forEach(map=>map.dispose());
});

test('room surface families render under all three print looks without shader errors',async({page})=>{
  test.setTimeout(90000);const errors=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  for(const look of ['comic','mono','normal']){
    // The current toolbar toggles comic/mono; normal remains a URL option.
    await page.goto(`/?look=${look}`);
    await expect(page.locator('#stage')).toHaveAttribute('data-ready','true',{timeout:20000});
    await expect(page.locator('body')).toHaveAttribute('data-house-ready','true',{timeout:20000});
    await expect(page.locator('#stage')).toHaveAttribute('data-look',look);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  }
  expect(errors).toEqual([]);
});
