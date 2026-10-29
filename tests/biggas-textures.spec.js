import {test,expect} from '@playwright/test';
import * as T from 'three';
import {createCircuitTextures} from '../src/circuit-textures.js';
import {citySurface,cityTextureProfiles} from '../src/biggas-city-textures.js';

test('city materials distinguish natural surfaces, architecture and props',()=>{
  for(const [name,kind] of Object.entries({
    '039_Timber':'wood','F039_Birch_cream':'birch','F039_Bark_dark':'bark','039_WarmConcrete':'plaster',
    'Dirt forest earth':'dirt','Urban plaza paving':'paving','039_StoneIvory':'stone','F039_Stone_layer':'rock','039_Aluminium':'metal',
    'CAT_Warm ivory cast bronze':'bronze','039_RoofVegetation':'foliage','F039_Pine_mid':'pine',
    'Awning coral':'fabric','Asfalto grafito':'asphalt','Vegetacion terreno':'grass','Rubber braking marks':'rubber',
    '039_TealGlass':'glass','Marcas marfil':'paint','Agua glacial':'water','Espuma':'foam',
  }))expect(citySurface(name),name).toBe(kind);
});

test('city tiles share packed surface maps and fit the desktop/mobile texture budgets',()=>{
  for(const size of [128,256]){
    const textures=createCircuitTextures({style:'biggas-city',size}),maps=new Set(),materials=[],geometry=new T.BoxGeometry(3,3,3),before=geometry.attributes.position.array.slice();
    for(const kind of Object.keys(cityTextureProfiles)){
      const a=new T.MeshStandardMaterial(),b=new T.MeshStandardMaterial();a.userData.cityTextured=b.userData.cityTextured=kind;
      textures.apply(new T.Mesh(geometry,a));textures.apply(new T.Mesh(geometry,b));materials.push(a,b);
      expect(a.map).toBe(b.map);expect(a.bumpMap).toBe(a.roughnessMap);expect(a.bumpMap).toBe(b.bumpMap);
      expect(a.map.image.width).toBe(size);expect(a.map.generateMipmaps).toBe(true);expect(a.map.wrapS).toBe(T.RepeatWrapping);
      expect(new Set(a.map.image.data).size).toBeGreaterThan(8);maps.add(a.map);maps.add(a.bumpMap);
    }
    expect(maps.size).toBe(Object.keys(cityTextureProfiles).length*2);
    const bytes=[...maps].reduce((n,t)=>n+t.image.data.byteLength*4/3,0);
    expect(bytes).toBeLessThan(size===256?15*1024**2:3.75*1024**2);
    expect(geometry.attributes.position.array).toEqual(before);
    let disposals=0;for(const map of maps)map.addEventListener('dispose',()=>disposals++);textures.dispose();expect(disposals).toBe(maps.size);
    geometry.dispose();materials.forEach(m=>m.dispose());
  }
});

test('existing ad atlases, animated water and luminous lenses keep their textures and UVs',()=>{
  const textures=createCircuitTextures({style:'biggas-city',size:16}),geometry=new T.PlaneGeometry(2,2),uv=geometry.attributes.uv.array.slice(),atlas=new T.Texture();
  const ad=new T.MeshBasicMaterial({map:atlas}),water=new T.MeshStandardMaterial({map:atlas,transparent:true}),lens=new T.MeshBasicMaterial();lens.userData.circuitUntextured=true;
  water.userData.circuitSurface='water';
  for(const material of [ad,water,lens])textures.apply(new T.Mesh(geometry,material));
  expect(ad.map).toBe(atlas);expect(water.map).toBe(atlas);expect(lens.map).toBeNull();expect(geometry.attributes.uv.array).toEqual(uv);expect(textures.count).toBe(0);
  textures.dispose();geometry.dispose();atlas.dispose();[ad,water,lens].forEach(m=>m.dispose());
});

test('textured vehicle paint is city-only and preserves the painted vertex colors',()=>{
  for(const style of ['default','biggas-city']){
    const textures=createCircuitTextures({style,size:16}),geometry=new T.BoxGeometry(),material=new T.MeshStandardMaterial({vertexColors:true});
    material.userData.circuitUntextured=true;material.userData.cityTextured='paint';
    textures.apply(new T.Mesh(geometry,material));expect(!!material.map).toBe(style==='biggas-city');expect(material.vertexColors).toBe(true);
    textures.dispose();geometry.dispose();material.dispose();
  }
});

test('texture scale remains consistent across separate world-space pavement batches',()=>{
  const textures=createCircuitTextures({style:'biggas-city',size:16}),material=new T.MeshStandardMaterial({name:'Urban plaza paving'}),parts=[];
  for(const x of [0,4]){const geometry=new T.PlaneGeometry(4,4).rotateX(-Math.PI/2).translate(x,0,0);textures.apply(new T.Mesh(geometry,material));parts.push(geometry);}
  const seams=[];for(const geometry of parts){const p=geometry.attributes.position,uv=geometry.attributes.uv;for(let i=0;i<p.count;i++)if(p.getX(i)===2)seams.push([p.getZ(i),uv.getX(i),uv.getY(i)]);}
  expect(seams.slice(0,2).sort()).toEqual(seams.slice(2).sort());
  textures.dispose();parts.forEach(g=>g.dispose());material.dispose();
});

test('steep grassy banks retain texture area instead of stretching one row vertically',()=>{
  const textures=createCircuitTextures({style:'biggas-city',size:16}),geometry=new T.PlaneGeometry(4,4),material=new T.MeshStandardMaterial({name:'Vegetacion terreno'});
  textures.apply(new T.Mesh(geometry,material));const uv=geometry.attributes.uv;
  expect(Math.abs(uv.getX(1)-uv.getX(0))).toBeCloseTo(1);expect(Math.abs(uv.getY(2)-uv.getY(0))).toBeCloseTo(1);
  textures.dispose();geometry.dispose();material.dispose();
});
