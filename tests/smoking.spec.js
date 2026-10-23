import {test,expect} from '@playwright/test';
import {Group,Vector3} from 'three';
import {createAccessories,smokeCycle} from '../src/accessories.js';
import {createZudModel} from '../src/zud-model.js';
import {createZudAnimator} from '../src/zud-animation.js';

test('smoking starts from the action clock and holds the cigarette through the drag',()=>{
  const models=[createZudModel({appearance:false}),createZudModel({appearance:false})];
  const animators=models.map(createZudAnimator);
  for(const elapsed of [0,1.7,2.4,4]){
    models.forEach((m,i)=>{for(let f=0;f<90;f++)animators[i].update({state:'smoke',time:elapsed+i*137,elapsed});});
    models[0].arms.forEach((arm,i)=>arm.rotation.toArray().slice(0,3).forEach((v,j)=>expect(v).toBeCloseTo(models[1].arms[i].rotation.toArray()[j],7)));
    expect(models[0].root.position.y).toBeCloseTo(models[1].root.position.y,7);
  }
  for(let t=0;t<5.2;t+=.01){const c=smokeCycle(t);if(c.drag>.1)expect(c.reach).toBeCloseTo(1,5);if(c.exhale>.1)expect(c.drag).toBe(0);}
  expect(smokeCycle(2.5).drag).toBe(0);expect(smokeCycle(2.5).exhale).toBe(0);
  models.forEach(m=>m.dispose());
});

test('smoke is emitted from the rotated ember and released puffs do not follow the hand',()=>{
  const root=new Group(),a=createAccessories(root),cigarette=a.smoking.getObjectByName('Cigarro');
  const update=elapsed=>a.update({state:'smoke',time:100+elapsed,elapsed,motion:1});
  update(1.8);
  const puff=a.smoking.getObjectByName('Humo del cigarrillo 1');root.updateMatrixWorld(true);
  // This puff has just spawned at the tip, including the cigarette's turn.
  const direction=new Vector3(-1,-.12,.28).normalize();
  const tip=cigarette.localToWorld(direction.multiplyScalar(.83));
  expect(puff.getWorldPosition(new Vector3()).distanceTo(tip)).toBeLessThan(1e-6);
  update(1.85);root.updateMatrixWorld(true);
  const before=puff.getWorldPosition(new Vector3());
  a.smoking.position.set(.4,-.3,.2);update(1.85);root.updateMatrixWorld(true);
  expect(puff.getWorldPosition(new Vector3()).distanceTo(before)).toBeLessThan(1e-6);
  update(4);expect(a.smoking.getObjectByName('Exhalación 1').material.opacity).toBeGreaterThan(.05);
  update(5.19);
  for(const child of a.smoking.children.filter(child=>child.name.startsWith('Exhalación')))expect(child.material.opacity).toBe(0);
  a.update({state:'smoke',time:200,elapsed:4,motion:0});
  for(const child of a.smoking.children.filter(child=>child!==cigarette)){
    const material=child.material??child.children[0].material;expect(material.opacity).toBe(0);
  }
  a.update({state:'idle',time:201,elapsed:0,motion:1});expect(a.smoking.visible).toBe(false);
});
