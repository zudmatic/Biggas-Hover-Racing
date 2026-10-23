import {test,expect} from '@playwright/test';
import {Box3,Raycaster,Vector3} from 'three';
import {createZudModel,BEANIE_COLORS} from '../src/zud-model.js';
import {SURFACE_FAMILIES} from '../src/surface-library.js';
import {ZUD} from '../src/zud-profile.js';
import {enter,act,line} from './helpers.js';

test('Zud has a round profile while the chin remains at the shoulder line',()=>{
  const model=createZudModel();model.root.position.set(0,0,0);model.root.updateMatrixWorld(true);
  const bounds=new Box3().setFromObject(model.root.getObjectByName('Cabeza de Zud'));
  const size=bounds.getSize(new Vector3());
  expect(size.z/size.x).toBeGreaterThan(.9);expect(size.z/size.x).toBeLessThan(1.02);
  expect(size.y/size.x).toBeGreaterThan(.86);
  expect(bounds.min.y).toBeGreaterThan(-.47);expect(bounds.min.y).toBeLessThan(-.40);
});

test('Both eyes follow the enlarged head surface without sinking or floating',()=>{
  const model=createZudModel();model.root.updateMatrixWorld(true);
  const head=model.root.getObjectByName('Cabeza de Zud'),ray=new Raycaster();
  for(const eye of model.eyes.children)for(const mesh of eye.children){
    const p=mesh.geometry.attributes.position;
    for(let i=0;i<p.count;i+=97){
      const vertex=new Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);
      ray.set(new Vector3(vertex.x,vertex.y,3),new Vector3(0,0,-1));
      const hit=ray.intersectObject(head,false)[0];expect(hit).toBeTruthy();
      const gap=vertex.z-hit.point.z;expect(gap).toBeGreaterThan(0);expect(gap).toBeLessThan(.085);
    }
  }
});

test('Default eyes stay within budget and their triangle interiors remain in front of the face',()=>{
  const model=createZudModel();model.root.updateMatrixWorld(true);
  const head=model.root.getObjectByName('Cabeza de Zud'),ray=new Raycaster();
  let triangles=0;
  for(const eye of model.eyes.children)for(const mesh of eye.children){
    const positions=mesh.geometry.attributes.position;triangles+=positions.count/3;
    for(let i=0;i<positions.count;i+=3){
      const center=new Vector3();
      for(let j=0;j<3;j++)center.add(new Vector3().fromBufferAttribute(positions,i+j));
      center.divideScalar(3).applyMatrix4(mesh.matrixWorld);
      ray.set(new Vector3(center.x,center.y,5),new Vector3(0,0,-1));
      const hit=ray.intersectObject(head,false)[0];
      expect(hit).toBeTruthy();expect(center.z-hit.point.z).toBeGreaterThan(0);
    }
  }
  expect(triangles).toBeLessThanOrEqual(4000);model.dispose();
});

test('Beanie recolors its dome, cuff and pompom without changing skin or eyes',()=> {
  const model=createZudModel();
  const head=model.root.children[0],headColor=head.material.color.getHexString();
  const eyeColor=model.eyes.children[0].children[0].material.color.getHexString();
  const hat=model.root.getObjectByName('Beanie de Zud');
  const before=hat.children.map(mesh=>mesh.material.color.getHexString());
  model.setBeanieColor('#315d95');
  expect(hat.children.every((mesh,index)=>mesh.material.color.getHexString()!==before[index])).toBe(true);
  model.setBeanieColor('#b5f500');
  expect(new Set(hat.children.map(mesh=>mesh.material.color.getHexString())).size).toBe(1);
  expect(model.root.userData.beanieColor).toBe('#b5f500');
  expect(model.eyes.children.every(eye=>eye.getObjectByName('Pupila'))).toBe(true);
  expect(head.material.color.getHexString()).toBe(headColor);
  expect(model.eyes.children[0].children[0].material.color.getHexString()).toBe(eyeColor);
});

test('Rear beanie stays continuous across the crown and folded cuff join',()=> {
  const model=createZudModel();model.root.position.set(0,0,0);model.root.updateMatrixWorld(true);
  const hat=model.root.getObjectByName('Beanie de Zud');
  for(const angle of [Math.PI-.5,Math.PI,Math.PI+.5]) {
    for(let y=.35;y<.96;y+=.025) {
      const origin=new Vector3(Math.sin(angle)*3,y,Math.cos(angle)*3);
      const ray=new Raycaster(origin,new Vector3(-origin.x,0,-origin.z).normalize(),0,3);
      expect(ray.intersectObject(hat,true).length,`Open hat seam at angle ${angle}, height ${y}`).toBeGreaterThan(0);
    }
  }
});

test('Beanie fold covers the head through the crown seam from elevated views',()=> {
  for(const detail of ['original','low','medium','high']) {
    const model=createZudModel({detail});model.root.position.set(0,0,0);model.root.updateMatrixWorld(true);
    const hat=model.root.getObjectByName('Beanie de Zud'),head=model.root.getObjectByName('Cabeza de Zud');
    // Horizontal rays can hit the far side of the crown even when the near
    // seam is open. Compare the first visible surface from above instead.
    for(let degrees=2.5;degrees<360;degrees+=5)for(let y=.65;y<=1;y+=.025)for(const slope of [.5,1,2]) {
      const angle=degrees*Math.PI/180,radial=new Vector3(Math.sin(angle),0,Math.cos(angle));
      const target=radial.clone().multiplyScalar(1.02);target.y=y;
      const direction=radial.clone().negate();direction.y=-slope;direction.normalize();
      const ray=new Raycaster(target.clone().addScaledVector(direction,-3),direction);
      const hit=ray.intersectObjects([hat,head],true)[0];
      expect(hit?.object.parent===hat,`${detail}: open seam at ${degrees}°, height ${y}, slope ${slope}`).toBe(true);
    }
    model.dispose();
  }
});

test('Zud runs every keyboard action in his room and wears the default beanie',async({page})=> {
  test.setTimeout(60000); // Every action, each with its own line.
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await enter(page);
  const stage=page.locator('#stage');
  await expect(line(page)).toHaveText(ZUD.homeLine);
  await expect(stage).toHaveAttribute('data-beanie-color',BEANIE_COLORS[0].hex);
  for(const [action] of ZUD.controls) {
    await act(page,action);await expect(stage).toHaveAttribute('data-state',action);
    await expect(page.locator('#state-label')).toHaveText(ZUD.actions[action].label);
  }
  await expect(stage).toHaveAttribute('data-accessory','mask');
  await page.keyboard.press('Escape');
  await expect(stage).toHaveAttribute('data-accessory','none');
  expect(errors).toEqual([]);
});

test('Zud walks, jumps and uses the house desk',async({page})=> {
  test.setTimeout(60000);
  await enter(page);
  const stage=page.locator('#stage');await page.keyboard.down('ArrowRight');
  await expect(stage).toHaveAttribute('data-walk-cycle','walking');await page.keyboard.up('ArrowRight');
  await page.keyboard.press('Space');await expect.poll(async()=>Number(await stage.getAttribute('data-jump-height'))).toBeGreaterThan(.2);
  await expect(stage).toHaveAttribute('data-jump-height','0.000');
  await act(page,'work');await expect(stage).toHaveAttribute('data-activity','typing',{timeout:12000});
  await expect(line(page)).toHaveText('Modo concentración. Una cosa a la vez.',{timeout:12000});
});

test('Standardized comic base preserves the rig, surface families, dye and unobstructed eyes',()=> {
  const model=createZudModel(),hat=model.root.getObjectByName('Beanie de Zud'),head=model.root.getObjectByName('Cabeza de Zud');
  expect(model.root.userData.modelStyle).toBe('comic');
  expect(head.material.userData.retro).toBeTruthy();
  const fullCurves=createZudModel({detail:'high',curve:1});
  const expectedHead=fullCurves.root.getObjectByName('Cabeza de Zud').geometry.attributes.position.array;
  expect(head.geometry.attributes.position.array.every((value,index)=>value===expectedHead[index])).toBe(true);
  fullCurves.dispose();
  expect(head.material.flatShading).toBe(false);
  expect(head.material.color.getHexString()).toBe('302727');
  expect(hat.getObjectByName('Copa').material.color.getHexString()).toBe('d95326');
  expect(model.eyes.children[0].children[0].material.color.getHexString()).toBe('fffefa');
  expect(model.eyes.children[0].children[1].material.color.getHexString()).toBe('251e1d');
  expect(head.geometry.attributes.uv.count).toBe(head.geometry.attributes.position.count);
  expect(head.material.map.isDataTexture).toBe(true);
  expect(head.material.userData.surfaceFamily).toBe('skin');
  expect(head.material.map.repeat.toArray()).toEqual([SURFACE_FAMILIES.skin.density,SURFACE_FAMILIES.skin.density]);
  expect(head.material.bumpMap.colorSpace).toBe('');
  expect(head.material.bumpScale).toBeCloseTo(SURFACE_FAMILIES.skin.bump);
  expect(hat.getObjectByName('Copa').material.userData.surfaceFamily).toBe('fabric');
  expect(hat.getObjectByName('Copa').material.map).not.toBe(head.material.map);
  expect(head.material.map.channel).toBe(1);
  for(const name of ['Copa','Doblez','Pompón'])expect(hat.getObjectByName(name).geometry.attributes.position.count).toBeGreaterThan(0);
  model.root.position.set(0,0,0);model.root.updateMatrixWorld(true);
  const ray=new Raycaster();
  for(const eye of model.eyes.children) {
    const white=eye.children[0],position=white.geometry.attributes.position;
    for(let i=0;i+2<position.count;i+=99) {
      const point=new Vector3();for(let k=0;k<3;k++)point.add(new Vector3().fromBufferAttribute(position,i+k));
      point.divideScalar(3).applyMatrix4(white.matrixWorld);
      ray.set(new Vector3(point.x,point.y,5),new Vector3(0,0,-1));
      expect(ray.intersectObjects([head,white],false)[0].object).toBe(white);
    }
  }
  model.setBeanieColor('#315d95');
  const dye=hat.getObjectByName('Copa').material.color;
  expect(dye.getHexString()).toBe(hat.getObjectByName('Doblez').material.color.getHexString());
  expect(dye.getHexString()).toBe('315d95');
});
