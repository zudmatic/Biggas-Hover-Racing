import {test,expect} from '@playwright/test';
import * as THREE from 'three/webgpu';
import {createEngineCore} from '../src/vfx/engine-core.js';

for(const depth of [1,2.25,3])test(`bulb stays inside the lip at depth ${depth}`,()=>{
  const ship=new THREE.Group(),engine=createEngineCore(ship,[[0,0,-2,.44]]);
  engine.update(1/60,0,.5,{Activo:true,Profundidad:depth,Intensidad:1,Tamaño:1.225,Enfriamiento:.85,Pulsación:0,'Luz cercana':.5,'Color borde':'#ff5812','Color centro':'#fff1b0'});
  ship.updateMatrixWorld(true);
  const [lip,,bulb]=ship.children[0].children;
  const lipBox=new THREE.Box3().setFromObject(lip),bulbBox=new THREE.Box3().setFromObject(bulb);
  expect(bulbBox.min.z).toBeGreaterThanOrEqual(lipBox.min.z);
  engine.dispose();
});

test('reports the lip exit as its mouth, and nothing when inactive',()=>{
  const ship=new THREE.Group(),engine=createEngineCore(ship,[[0,0,-2,.44]]);
  const settings={Activo:true,Profundidad:2.25,Intensidad:1,Tamaño:1.225,Enfriamiento:.85,Pulsación:0,'Luz cercana':.5,'Color borde':'#ff5812','Color centro':'#fff1b0'};
  engine.update(1/60,0,.5,settings);ship.updateMatrixWorld(true);
  const lipBox=new THREE.Box3().setFromObject(ship.children[0].children[0]),[mouth]=engine.mouths();
  expect(mouth.start).toBeCloseTo(-2-lipBox.min.z,3);expect(mouth.radius).toBeCloseTo(.245*1.225*(.44/.24),3);
  engine.update(1/60,0,.5,{...settings,Activo:false});expect(engine.mouths()).toBeNull();
  engine.dispose();
});
