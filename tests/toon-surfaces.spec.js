import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {lightToonSurfaces} from '../src/toon-surfaces.js';

test('baked toon bands collapse to one lit material per family, using the lightest band',()=>{
  const root=new THREE.Group(),basic=(name,hex)=>new THREE.MeshBasicMaterial({name,color:hex,side:THREE.DoubleSide});
  const geometry=new THREE.BoxGeometry(),eyes=basic('Toon_new_eyes_graphic_unlit',0xffffff),plain=new THREE.MeshStandardMaterial({name:'Untouched'});
  const sources=[basic('Shell toon 0',0x111111),basic('Shell toon 2',0x333333),basic('Shell toon 1',0x222222),basic('Groove toon 0',0x440000),basic('Inset toon 1',0x005500),basic('Inset toon 2',0x007700),eyes,plain];
  const meshes=sources.map(material=>{const mesh=new THREE.Mesh(geometry,material);root.add(mesh);return mesh;});
  expect(lightToonSurfaces(root)).toEqual({families:3,replaced:6});
  const [s0,s2,s1,groove,i1,i2,eye,untouched]=meshes.map(mesh=>mesh.material);
  expect(s0).toBe(s2);expect(s1).toBe(s2);expect(i1).toBe(i2);
  expect(s2).toBeInstanceOf(THREE.MeshStandardMaterial);expect(s2.name).toBe('Shell');expect(s2.color.getHex()).toBe(0x333333);expect(s2.side).toBe(THREE.DoubleSide);
  expect(groove.color.getHex()).toBe(0x440000);expect(i2.color.getHex()).toBe(0x007700);
  expect(eye).toBe(eyes);expect(untouched).toBe(plain);
});
