import {expandCharacterSections} from './helpers/character-editor.js';
import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {ARM_CATALOG,ARM_PALETTES,armColorsFor} from '../src/arm-catalog.js';
import {createArmModel,createCharacterArms} from '../src/character-arms.js';
import {createZudModel} from '../src/zud-model.js';
import {CHARACTER_DEFAULTS,CHARACTER_STORAGE,normalizeCharacterSettings,readCharacterDocument} from '../src/character-settings.js';

const field=(page,key)=>page.locator(`[data-setting="${key}"]`);
const openLab=async page=>{await page.goto('/?debug=character');await expect(page.locator('.lab-viewport')).toHaveAttribute('data-ready','true');await expandCharacterSections(page);};

test('legacy documents keep original arms; imports only accept catalog models and a boolean comic setting',()=>{
  expect(readCharacterDocument({version:1,settings:{}}).settings).toMatchObject({armLeft:'none',armRight:'none',comicShader:true});
  expect(normalizeCharacterSettings({armLeft:'unknown.glb',armRight:42,comicShader:'yes'})).toMatchObject({armLeft:'none',armRight:'none',comicShader:true});
  expect(ARM_CATALOG.filter(entry=>entry.type==='Armadura')).toHaveLength(2);
});

test('five detailed, bounded assemblies batch their geometry and release all resources',()=>{
  const signatures=new Set();
  for(const {id} of ARM_CATALOG) {
    const asset=createArmModel(id),box=new THREE.Box3().setFromObject(asset.root);
    expect(asset.root.userData.detailCount).toBeGreaterThanOrEqual(50);
    expect(asset.root.children.length).toBeLessThanOrEqual(5);
    expect(box.min.y).toBeGreaterThan(-.9);expect(box.max.y).toBeLessThan(.2);
    expect(box.max.x).toBeLessThan(.6);expect(box.min.z).toBeLessThan(-.1);expect(box.max.z).toBeGreaterThan(.1);
    let released=0,vertices=0;
    asset.root.traverse(mesh=>{if(mesh.isMesh){
      vertices+=mesh.geometry.attributes.position.count;
      expect(mesh.geometry.attributes.position.array.every(Number.isFinite)).toBe(true);
      mesh.geometry.addEventListener('dispose',()=>released++);mesh.material.addEventListener('dispose',()=>released++);
    }});
    signatures.add(vertices);asset.dispose();expect(released).toBe(10);
  }
  expect(signatures.size).toBe(5);
});

test('anatomical sides mirror correctly, stay on the animated shoulder and restore the original arm',()=>{
  const model=createZudModel({appearance:false}),arms=createCharacterArms(model);
  const originals=model.arms.map(pivot=>pivot.getObjectByName('Brazo'));
  arms.update({...CHARACTER_DEFAULTS,armRight:'forge'});
  expect(originals[0].visible).toBe(false);expect(originals[1].visible).toBe(true);
  const cores=model.root.children.filter(part=>part.name==='Núcleo del hombro');
  expect(cores.map(core=>core.visible)).toEqual([false,true]);
  const right=model.arms[0].children.find(child=>child.userData.armModel);
  expect(right.scale.x).toBe(-1);
  const point=new THREE.Vector3(0,-.6,0),before=right.localToWorld(point.clone());
  model.arms[0].rotation.z=.6;
  expect(right.localToWorld(point.clone()).distanceTo(before)).toBeGreaterThan(.2);
  arms.update({...CHARACTER_DEFAULTS,armLeft:'sentinel',armRight:'aero',wireframe:true});
  expect(right.parent).toBe(null);
  expect(model.arms[1].children.find(child=>child.userData.armModel).scale.x).toBe(1);
  expect(model.arms[0].children.find(child=>child.userData.armModel).children.every(mesh=>mesh.material.wireframe)).toBe(true);
  arms.dispose();expect(originals.every(mesh=>mesh.visible)).toBe(true);expect(cores.every(core=>core.visible)).toBe(true);
  expect(model.arms.every(pivot=>pivot.children.length===2&&pivot.getObjectByName('Codo'))).toBe(true);model.dispose();
});

test('forearms have substantial front-to-back volume, including rear-facing surfaces',()=>{
  for(const {id} of ARM_CATALOG) {
    const asset=createArmModel(id);asset.root.updateMatrixWorld(true);
    const surfaces=[-1,1].map(side=>new THREE.Raycaster(new THREE.Vector3(.23,-.45,side*2),new THREE.Vector3(0,0,-side)).intersectObject(asset.root)[0]);
    expect(surfaces.every(Boolean),id).toBe(true);
    expect(surfaces[0].point.distanceTo(surfaces[1].point),id).toBeGreaterThan(.39);
    asset.dispose();
  }
});

test('equip all models, swap, render comic, export, reload and restore',async({page})=>{
  test.setTimeout(120000);await page.setViewportSize({width:1100,height:800});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await openLab(page);
  for(const {id} of ARM_CATALOG){
    await field(page,'armRight').selectOption(id);
    await expect(page.locator('.lab-viewport')).toHaveAttribute('data-arm-right',id);
  }
  await field(page,'armLeft').selectOption('sentinel');
  await page.getByRole('button',{name:'Intercambiar brazos'}).click();
  await expect(field(page,'armRight')).toHaveValue('sentinel');await expect(field(page,'armLeft')).toHaveValue('reactor');
  // Comic must also work from the diagnostic normal-material view.
  await field(page,'comicShader').uncheck();
  await field(page,'material').selectOption('normal');
  const plain=await page.locator('.lab-canvas').screenshot();
  await field(page,'comicShader').check();
  await expect(page.locator('.lab-viewport')).toHaveAttribute('data-comic','true');
  await expect(field(page,'material')).toBeDisabled();
  expect((await page.locator('.lab-canvas').screenshot()).equals(plain)).toBe(false);
  await field(page,'hatModel').selectOption('samurai_kasa');
  await expect(page.locator('.lab-viewport')).toHaveAttribute('data-hat','samurai_kasa');
  const event=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar JSON'}).click();
  const stream=await(await event).createReadStream();let json='';for await(const chunk of stream)json+=chunk;
  expect(JSON.parse(json).settings).toMatchObject({armLeft:'reactor',armRight:'sentinel',comicShader:true});
  await page.reload();await expandCharacterSections(page);await expect(field(page,'comicShader')).toBeChecked();await expect(field(page,'armLeft')).toHaveValue('reactor');
  await page.getByRole('button',{name:'Restaurar base',exact:true}).click();
  await expect(field(page,'armLeft')).toHaveValue('none');await expect(field(page,'comicShader')).toBeChecked();
  await page.locator('#lab-import-file').setInputFiles({name:'arms.json',mimeType:'application/json',buffer:Buffer.from(json)});
  await expect(field(page,'armRight')).toHaveValue('sentinel');await expect(field(page,'comicShader')).toBeChecked();
  await field(page,'comicShader').uncheck();await expect(field(page,'material')).toHaveValue('normal');
  await page.getByRole('button',{name:'Quitar brazos especiales'}).click();
  await expect(field(page,'armLeft')).toHaveValue('none');await expect(field(page,'armRight')).toHaveValue('none');
  expect(errors).toEqual([]);
});

test('mobile controls fit and the equipped sides survive the return to the room',async({page})=>{
  test.setTimeout(90000);await page.setViewportSize({width:390,height:844});await openLab(page);
  await field(page,'armRight').selectOption('hydraulic');await field(page,'armLeft').selectOption('aero');
  await field(page,'comicShader').check();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('link',{name:'Volver al cuarto'}).click();
  await expect(page.locator('#stage')).toHaveAttribute('data-ready','true',{timeout:30000});
  await expect(page.locator('#stage')).toHaveAttribute('data-arm-right','hydraulic');
  await expect(page.locator('#stage')).toHaveAttribute('data-arm-left','aero');
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).settings.comicShader,CHARACTER_STORAGE)).toBe(true);
});


test('all alternate palms face inward on both anatomical sides',()=>{
  const model=createZudModel(),arms=createCharacterArms(model);
  for(const {id} of ARM_CATALOG) {
    arms.update({armLeft:id,armRight:id});model.root.updateMatrixWorld(true);
    for(const pivot of model.arms) {
      const asset=pivot.children.find(child=>child.userData.armModel);
      const wrist=asset.localToWorld(new THREE.Vector3(.25,-.66,0)),fingers=new THREE.Vector3();let count=0;
      for(const mesh of asset.children)for(const part of mesh.userData.parts.filter(part=>part.name==='Falange proximal')) {
        for(let i=part.start;i<part.start+part.count;i++) {
          fingers.add(new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld));count++;
        }
      }
      expect(count).toBeGreaterThan(0);fingers.divideScalar(count);
      expect(Math.sign(wrist.x)*(fingers.x-wrist.x),id).toBeLessThan(-.1);
      expect(Math.abs(fingers.z-wrist.z),id).toBeLessThan(.02);
    }
  }
  arms.dispose();model.dispose();
});

test('Centinela socket stays below the shoulder plate and the plate clears the head',()=>{
  const ray=new THREE.Raycaster();
  for(const curve of [0,1]) {
    const model=createZudModel({curve}),arms=createCharacterArms(model);arms.update({armLeft:'sentinel',armRight:'sentinel'});model.root.updateMatrixWorld(true);
    const head=model.root.getObjectByName('Cabeza de Zud');let checked=0;
    for(const pivot of model.arms) {
      const asset=pivot.children.find(child=>child.userData.armModel);
      for(const mesh of asset.children)for(const part of mesh.userData.parts.filter(part=>['Hombrera en punta','Bisel de la hombrera'].includes(part.name))) {
        for(let i=part.start;i<part.start+part.count;i++) {
          if(mesh.geometry.attributes.position.getX(i)<-.02)continue; // The inner lip deliberately enters the torso.
          const vertex=new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld);
          ray.set(new THREE.Vector3(vertex.x,-5,vertex.z),new THREE.Vector3(0,1,0));
          const hit=ray.intersectObject(head)[0];if(hit){checked++;expect(hit.point.y-vertex.y).toBeGreaterThan(.02);}
        }
      }
    }
    expect(checked).toBeGreaterThan(100);arms.dispose();model.dispose();
  }
  for(const id of ['sentinel','hydraulic']) {
  const asset=createArmModel(id);asset.root.updateMatrixWorld(true);
  for(let x=-.08;x<.3;x+=.02)for(let z=-.15;z<.16;z+=.02) {
    ray.set(new THREE.Vector3(x,1,z),new THREE.Vector3(0,-1,0));const hit=ray.intersectObject(asset.root)[0];expect(hit).toBeTruthy();
    const part=hit.object.userData.parts.find(part=>hit.faceIndex*3>=part.start&&hit.faceIndex*3<part.start+part.count);
    expect(['Rótula del hombro','Núcleo del húmero']).not.toContain(part.name);
  }
  asset.dispose();
  }
});


test('Centinela inner lip overlaps the torso on both shoulders instead of leaving an open seam',()=>{
  for(const curve of [0,1])for(const spread of [0,.1]) {
    const model=createZudModel({curve}),arms=createCharacterArms(model);arms.update({armLeft:'sentinel',armRight:'sentinel'});
    model.arms.forEach((pivot,i)=>pivot.rotation.z=i?spread:-spread);model.root.updateMatrixWorld(true);
    const torso=model.root.getObjectByName('Torso'),ray=new THREE.Raycaster();
    for(const pivot of model.arms) {
      const asset=pivot.children.find(child=>child.userData.armModel),side=Math.sign(pivot.position.x);let buried=0;
      for(const mesh of asset.children)for(const part of mesh.userData.parts.filter(part=>part.name==='Hombrera en punta'))for(let i=part.start;i<part.start+part.count;i++) {
        const p=new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld);
        ray.set(new THREE.Vector3(side*3,p.y,p.z),new THREE.Vector3(-side,0,0));const hit=ray.intersectObject(torso)[0];
        if(hit&&side*(hit.point.x-p.x)>.02)buried++;
      }
      expect(buried,`curve ${curve}, spread ${spread}, side ${side}`).toBeGreaterThanOrEqual(4);
    }
    arms.dispose();model.dispose();
  }
});

test('arm colors are independent, preserve metal joints and restore each model palette',()=>{
  const model=createZudModel(),arms=createCharacterArms(model);
  const settings={...CHARACTER_DEFAULTS,armLeft:'reactor',armRight:'sentinel',armLeftCustomColors:true,armLeftColor:'#d83642',armLeftTrimColor:'#dec18a',armLeftAccentColor:'#64ed9b'};
  arms.update(settings);
  const assets=model.arms.map(pivot=>pivot.children.find(child=>child.userData.armModel));
  const colors=asset=>Object.fromEntries(asset.children.filter(mesh=>mesh.material.userData.armColorRole).map(mesh=>[mesh.material.userData.armColorRole,`#${mesh.material.color.getHexString()}`]));
  expect(colors(assets[1])).toEqual(armColorsFor(settings,'armLeft'));
  expect(colors(assets[0])).toEqual(armColorsFor(settings,'armRight'));
  const glow=assets[1].children.find(mesh=>mesh.material.userData.armColorRole==='AccentColor');expect(glow.material.emissive.getHexString()).toBe('64ed9b');
  const fixed=assets[1].children.filter(mesh=>!mesh.material.userData.armColorRole).map(mesh=>mesh.material.color.getHexString());
  expect(fixed).toEqual(expect.arrayContaining(ARM_PALETTES.reactor.slice(2,4).map(color=>color.slice(1))));
  arms.update({...settings,armLeftCustomColors:false});expect(colors(assets[1])).toEqual(armColorsFor({...settings,armLeftCustomColors:false},'armLeft'));
  expect(normalizeCharacterSettings({armLeftColor:'red',armLeftCustomColors:'yes'})).toMatchObject({armLeftColor:'#ffffff',armLeftCustomColors:false});
  arms.dispose();model.dispose();
});

test('arm palettes survive swap, reload, export and import and can be restored independently',async({page})=>{
  test.setTimeout(90000);await openLab(page);
  await expect(page.locator('[data-arm-colors="armLeft"]')).toBeHidden();
  await field(page,'armLeft').selectOption('reactor');await field(page,'armRight').selectOption('sentinel');
  await expect(field(page,'armLeftColor')).toHaveValue('#263846');await expect(field(page,'armRightColor')).toHaveValue('#657084');
  await field(page,'armLeftColor').fill('#d83642');await field(page,'armLeftTrimColor').fill('#dec18a');await field(page,'armLeftAccentColor').fill('#64ed9b');
  await expect(field(page,'armRightColor')).toHaveValue('#657084');
  await page.getByRole('button',{name:'Intercambiar brazos'}).click();await expect(field(page,'armRightColor')).toHaveValue('#d83642');
  await expect.poll(()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).settings.armRightColor,CHARACTER_STORAGE)).toBe('#d83642');
  await page.reload();await expandCharacterSections(page);await expect(field(page,'armRightColor')).toHaveValue('#d83642');
  const download=page.waitForEvent('download');await page.locator('#lab-export').click();let json='';for await(const chunk of await(await download).createReadStream())json+=chunk;
  expect(readCharacterDocument(JSON.parse(json)).settings).toMatchObject({armRight:'reactor',armRightCustomColors:true,armRightColor:'#d83642',armRightTrimColor:'#dec18a',armRightAccentColor:'#64ed9b'});
  await page.locator('[data-arm-colors-reset="armRight"]').click();await expect(field(page,'armRightColor')).toHaveValue('#263846');await expect(field(page,'armLeftColor')).toHaveValue('#657084');
  await page.locator('#lab-import-file').setInputFiles({name:'colors.json',mimeType:'application/json',buffer:Buffer.from(json)});await expect(field(page,'armRightColor')).toHaveValue('#d83642');
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('link',{name:'Volver al cuarto'}).click();await expect(page.locator('#stage')).toHaveAttribute('data-ready','true',{timeout:30000});
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).settings.armRightColor,CHARACTER_STORAGE)).toBe('#d83642');
});

// Extract authored components from the production batches so these checks
// exercise actual surfaces, rather than copies of the construction formulas.
function armParts(root,name) {
  const result=[];
  for(const mesh of root.children)for(const part of mesh.userData.parts.filter(part=>part.name===name)) {
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(mesh.geometry.attributes.position.array.slice(part.start*3,(part.start+part.count)*3),3));
    const isolated=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
    isolated.updateMatrixWorld(true);result.push(isolated);
  }
  return result;
}
const releaseParts=parts=>parts.forEach(part=>{part.geometry.dispose();part.material.dispose();});

test('armor bands seat in their parent surfaces around the whole circumference',()=>{
  const pairs=[
    ['Reborde envolvente de hombrera','Cúpula de hombrera'],
    ['Canto de lámina','Lámina envolvente'],
    ['Aro del brazal','Brazal completo'],
    ['Correa del brazal','Brazal completo'],
    ['Collar de cerámica','Carcasa cerámica de hombro'],
    ['Labio cerámico','Carcasa aerodinámica'],
    ['Bisel del reactor','Blindaje integral del reactor'],
    ['Borde del guantelete','Carcasa del puño'],
  ];
  for(const {id} of ARM_CATALOG) {
    const asset=createArmModel(id);
    for(const [trimName,shellName] of pairs) {
      const trims=armParts(asset.root,trimName),shells=armParts(asset.root,shellName);
      trims.forEach((trim,index)=>{
        const shell=shells.length===1?shells[0]:shells[index];
        const bounds=new THREE.Box3().setFromObject(trim),center=bounds.getCenter(new THREE.Vector3());
        for(const t of [.1,.5,.9])for(let n=0;n<12;n++) {
          const angle=n*Math.PI/6+.13,direction=new THREE.Vector3(Math.sin(angle),0,Math.cos(angle));
          center.y=THREE.MathUtils.lerp(bounds.min.y,bounds.max.y,t);
          const ray=new THREE.Raycaster(center.clone().addScaledVector(direction,2),direction.clone().negate(),0,2);
          const trimHits=ray.intersectObject(trim),shellHits=ray.intersectObject(shell);
          const label=`${id}: ${trimName} ${index}, y=${center.y}, angle=${angle}`;
          expect(trimHits.length,label).toBeGreaterThanOrEqual(2);expect(shellHits.length,label).toBeGreaterThan(0);
          // The shell sits between the inner and outer trim walls: no air
          // gap behind the band, and no shell poking through its outer face.
          expect(shellHits[0].distance-trimHits[0].distance,label).toBeGreaterThan(.003);
          expect(trimHits.at(-1).distance-shellHits[0].distance,label).toBeGreaterThan(.002);
        }
      });
      releaseParts([...trims,...shells]);
    }
    asset.dispose();
  }
});

test('every wrist connects separated hand and forearm shells on one centered bearing',()=>{
  const forearms={forge:'Brazal completo',sentinel:'Brazal completo',hydraulic:'Bloque hidráulico',aero:'Carcasa aerodinámica',reactor:'Blindaje integral del reactor'};
  for(const {id} of ARM_CATALOG) {
    const asset=createArmModel(id),parts=['Carcasa del puño','Collar articulado',forearms[id]].flatMap(name=>armParts(asset.root,name));
    const [hand,wrist,forearm]=parts.map(part=>new THREE.Box3().setFromObject(part));
    const center=wrist.getCenter(new THREE.Vector3());
    expect(center.x,id).toBeCloseTo(.25,6);expect(center.z,id).toBeCloseTo(0,6);
    expect(hand.max.y,id).toBeLessThan(forearm.min.y-.02);
    expect(wrist.min.y,id).toBeLessThan(hand.max.y-.005);
    expect(wrist.max.y,id).toBeGreaterThan(forearm.min.y);
    releaseParts(parts);asset.dispose();
  }
});

test('hydraulic sleeves, rings and piston rods share an axis',()=>{
  const asset=createArmModel('hydraulic'),sleeves=armParts(asset.root,'Camisa del pistón'),rods=armParts(asset.root,'Vástago cromado'),rings=armParts(asset.root,'Anillo del pistón');
  const center=part=>{
    const p=part.geometry.attributes.position,sum=new THREE.Vector3();
    for(let i=0;i<p.count;i++)sum.add(new THREE.Vector3().fromBufferAttribute(p,i));
    return sum.divideScalar(p.count);
  };
  sleeves.forEach((sleeve,index)=>{
    const a=center(sleeve),axis=center(rods[index]).sub(a).normalize();
    for(const ring of rings.slice(index*2,index*2+2)) {
      const delta=center(ring).sub(a);
      expect(delta.clone().addScaledVector(axis,-delta.dot(axis)).length()).toBeLessThan(.000001);
    }
  });
  releaseParts([...sleeves,...rods,...rings]);asset.dispose();
});
