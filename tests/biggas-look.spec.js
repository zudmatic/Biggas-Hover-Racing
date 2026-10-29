import {test,expect} from '@playwright/test';
import * as T from 'three';
import {createBiggasCityLook} from '../src/biggas-city-look.js';
import {createBiggasLightingBatches} from '../src/biggas-city-lighting.js';
import {circuitComic} from '../src/circuit-maps.js';

test('city defaults to PSX while explicit choices and other maps keep their style',()=>{
  expect(circuitComic('biggas-city')).toBe(false);expect(circuitComic('biggas-city','1')).toBe(true);expect(circuitComic('biggas-city','0')).toBe(false);
  for(const map of ['ruins','nexus','mario-raceway']){expect(circuitComic(map)).toBe(true);expect(circuitComic(map,'0')).toBe(false);}
});

test('PSX snapping preserves light groups, PBR maps and geometry, and disables for reduced motion',()=>{
  const scene=new T.Scene(),geometry=new T.BoxGeometry(),texture=new T.DataTexture(new Uint8Array([255,255,255,255]),1,1),material=new T.MeshStandardMaterial({map:texture,roughness:.74,metalness:.2}),a=new T.Mesh(geometry,material),b=new T.Mesh(geometry,material);scene.add(a,b);
  const light=new T.PointLight(0xffffff,100,10),sun=new T.DirectionalLight();scene.add(light,sun);createBiggasLightingBatches([a,b],[light]).setGlobalLights([sun]);
  const source=a.material,waterSource=new T.MeshStandardMaterial({transparent:true,opacity:.8});waterSource.userData.circuitSurface='water';const water=new T.Mesh(geometry,waterSource);scene.add(water);
  const look=createBiggasCityLook(scene,{getDrawingBufferSize:v=>v.set(1200,750)}),positions=geometry.attributes.position.array.slice();look.update();
  const converted=a.material;expect(converted.isNodeMaterial).toBe(true);expect(converted.map).toBe(texture);expect(converted.roughness).toBe(.74);expect(converted.metalness).toBe(.2);expect(converted.lightsNode).toBe(source.lightsNode);expect(b.material).toBe(converted);expect(water.material).toBe(waterSource);
  expect(look.grid.value.toArray()).toEqual([184,115]);expect(look.jitter.value).toBe(.22);expect(geometry.attributes.position.array).toEqual(positions);
  source.emissiveIntensity=2;look.update();expect(converted.emissiveIntensity).toBe(2);
  look.update({reducedMotion:true});expect(a.material).toBe(converted);expect(look.jitter.value).toBe(0);expect(look.warmth.value).toBe(.18);
  look.update();expect(a.material).toBe(converted);look.update({enabled:false});expect(a.material).toBe(source);expect(look.warmth.value).toBe(0);
  look.dispose();geometry.dispose();material.dispose();source.dispose();waterSource.dispose();texture.dispose();
});


test('map selection adopts the city style until the player explicitly chooses a style',async({page})=>{
  await page.goto('/?selection=map&map=ruins');const paper=page.getByRole('button',{name:'Papel',exact:true});
  await expect(paper).toHaveAttribute('aria-pressed','true');
  await page.locator('.lobby-map-card').filter({has:page.locator('input[value="biggas-city"]')}).click();await expect(paper).toHaveAttribute('aria-pressed','false');
  await page.locator('.lobby-map-card').filter({has:page.locator('input[value="ruins"]')}).click();await expect(paper).toHaveAttribute('aria-pressed','true');
  await paper.click();await page.locator('.lobby-map-card').filter({has:page.locator('input[value="biggas-city"]')}).click();await page.locator('.lobby-map-card').filter({has:page.locator('input[value="ruins"]')}).click();await expect(paper).toHaveAttribute('aria-pressed','false');
  await page.goto('/?selection=map&map=biggas-city&comic=1');await expect(paper).toHaveAttribute('aria-pressed','true');
});

test('thin railway surfaces keep stable projection in PSX and comic transitions',()=>{
  const scene=new T.Scene(),geometry=new T.BoxGeometry(4,.2,10),source=new T.MeshStandardMaterial();source.userData.cityStableProjection=true;
  const mesh=new T.Mesh(geometry,source.clone());scene.add(mesh);const material=mesh.material,look=createBiggasCityLook(scene,{getDrawingBufferSize:v=>v.set(960,600)});
  for(const enabled of [true,false,true]){look.update({enabled});expect(mesh.material).toBe(material);}
  look.dispose();geometry.dispose();source.dispose();material.dispose();
});
