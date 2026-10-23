import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {SCENE_STORAGE} from '../src/scene-document.js';
const supplied=JSON.parse(readFileSync(new URL('../src/scene-base.json',import.meta.url)));
test.setTimeout(120000);
const editorReady=async page=>{await page.goto('/?edit=scene');await expect(page.locator('.scene-editor')).toHaveAttribute('data-ready','true',{timeout:60000});};
const saved=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SCENE_STORAGE);
async function harness(page){
  await page.route('**/src/entry.js',route=>route.fulfill({contentType:'text/javascript',body:''}));await page.goto('/');
  await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {createRetroRoom}=await import('/src/retro-room.js');
    const {createSceneDocument}=await import('/src/scene-document.js');
    const room=createRetroRoom();await room.ready;const doc=createSceneDocument(room);await doc.restore();
    window.fixture={THREE,room,doc};
  });
}

test('the supplied scene is the default and child objects remain independent',async({page})=>{
  await harness(page);
  const result=await page.evaluate(async()=>{
    const {doc,room}=window.fixture;
    const base=doc.snapshot();
    const independent=[...doc.entries.values()].every(entry=>entry.object.parent===room.room);
    const before=doc.snapshot();doc.remove(doc.entries.get('shelf'));doc.remove(doc.entries.get('nightstand'));
    const removed=doc.snapshot();await doc.apply(removed);const reloaded=doc.snapshot();
    doc.restoreOriginal('shelf');doc.restoreOriginal('nightstand');
    return {base,independent,before,removed,reloaded,restored:doc.snapshot()};
  });
  expect(result.base.version).toBe(2);expect(result.independent).toBe(true);
  expect(result.base.objects).toEqual(supplied.objects);
  expect(result.base.builtins).toEqual(supplied.builtins);
  for(const id of ['camera','glasses','cigarette']){
    expect(result.removed.builtins.find(e=>e.id===id)).toEqual(result.before.builtins.find(e=>e.id===id));
    expect(result.reloaded.builtins.find(e=>e.id===id).visible).toBe(true);
  }
  expect(result.base.builtins.find(e=>e.id==='camera').position[1]).toBeCloseTo(1.93);
  expect(result.base.builtins.find(e=>e.id==='glasses').position[0]).toBeCloseTo(-1.87);
  expect(result.restored.builtins.find(e=>e.id==='shelf').visible).toBe(true);
  expect(result.base.builtins.find(e=>e.id==='clock').scale).toEqual([.65,.65,.65]);
});

test('colors are per object, survive export/import, and keep the Retro shader',async({page})=>{
  await harness(page);
  const result=await page.evaluate(async()=>{
    const {doc}=window.fixture,bed=doc.entries.get('bed'),desk=doc.entries.get('desk');
    const before=desk.colorSlots[0].source.color.getHexString(),old=bed.colorSlots[0].source.color.getHexString();
    doc.setColor(bed,0,'#3388cc');
    const painted=bed.colorSlots[0].targets[0].mesh.material;
    const paintedColor=painted.color.getHexString(),shader=Boolean(painted.userData.retro&&painted.uniforms&&painted.onBeforeCompile);
    const exported=doc.snapshot();await doc.apply(JSON.parse(JSON.stringify(exported)));
    const persisted=doc.entries.get('bed').colorSlots[0].targets[0].mesh.material.color.getHexString();
    doc.resetColors(doc.entries.get('bed'));
    const restored=doc.entries.get('bed').colorSlots[0].targets[0].mesh.material.color.getHexString();
    const a=await doc.add('004'),b=await doc.add('004'),other=b.colorSlots[0].source.color.getHexString();doc.setColor(a,0,'#bb3344');
    return {before,after:desk.colorSlots[0].source.color.getHexString(),old,paintedColor,shader,persisted,restored,other,otherAfter:b.colorSlots[0].targets[0].mesh.material.color.getHexString()};
  });
  expect(result.paintedColor).toBe('3388cc');expect(result.persisted).toBe('3388cc');expect(result.shader).toBe(true);
  expect(result.before).toBe(result.after);expect(result.restored).toBe(result.old);expect(result.other).toBe(result.otherAfter);
});

test('replacement lamps react to blinds/night and a watered succulent grows only its foliage',async({page})=>{
  await harness(page);
  const result=await page.evaluate(async()=>{
    const {doc,room,THREE}=window.fixture;
    const {createSceneInteractions}=await import('/src/scene-interactions.js');
    const succulent=await doc.add('020',{replace:doc.entries.get('plant')}),other=await doc.add('020');
    const behaviors=createSceneInteractions(room,doc);
    const lamp=[...doc.entries.values()].find(e=>e.model==='002');
    room.setTime(610);room.update(false,0,0,{dt:1,reducedMotion:true});behaviors.update();const day=behaviors.lights.source.intensity;
    room.interactables.find(i=>i.action==='blinds').activate();room.update(false,0,0,{dt:1,reducedMotion:true});behaviors.update();const blinds=behaviors.lights.source.intensity;
    room.interactables.find(i=>i.action==='blinds').activate();room.setTime(1410);room.update(false,0,0,{dt:1,reducedMotion:true});behaviors.update();const night=behaviors.lights.source.intensity;
    let bulb;lamp.object.traverse(mesh=>{if(/horizontal tubular bulb/.test(mesh.name.replaceAll('_',' ')))bulb=mesh;});
    const emission=bulb.material.emissiveIntensity;
    const item=behaviors.plants.get(succulent.id),otherItem=behaviors.plants.get(other.id),root=succulent.object;
    const leaf=root.getObjectByName('Crecimiento por riego'),before=leaf.scale.y,pose=root.position.toArray(),scale=root.scale.toArray();
    let pot;root.traverse(mesh=>{if(/Seven-sided planter hollow shell/.test(mesh.name.replaceAll('_',' ')))pot=mesh;});
    const potBefore=new THREE.Box3().setFromObject(pot,true).getSize(new THREE.Vector3()).toArray();
    for(let i=0;i<240;i++)behaviors.update({wateringItem:item,watering:true,dt:1/60});
    const grown=leaf.scale.y,growth=item.plant.growth,untouched=otherItem.plant.growth;
    const potAfter=new THREE.Box3().setFromObject(pot,true).getSize(new THREE.Vector3()).toArray();
    for(let i=0;i<240;i++)behaviors.update({wateringItem:item,watering:true,dt:1/60});
    const capped=leaf.scale.y;doc.remove(lamp);behaviors.update();const afterRemove=behaviors.lights.on;
    return {day,blinds,night,emission,before,grown,growth,untouched,potBefore,potAfter,pose,poseAfter:root.position.toArray(),scale,scaleAfter:root.scale.toArray(),capped,afterRemove};
  });
  expect(result.day).toBeLessThan(.1);expect(result.blinds).toBeGreaterThan(2);expect(result.night).toBeGreaterThan(2);expect(result.emission).toBeGreaterThan(1);
  expect(result.grown).toBeGreaterThan(result.before);expect(result.growth).toBe(1);expect(result.untouched).toBe(0);expect(result.capped).toBe(1);
  expect(result.potAfter).toEqual(result.potBefore);expect(result.poseAfter).toEqual(result.pose);expect(result.scaleAfter).toEqual(result.scale);expect(result.afterRemove).toBe(false);
});

test('editor restores originals independently and persists paint, including after reload',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await editorReady(page);
  await page.getByRole('tab',{name:'Originales',exact:true}).click();
  await page.locator('[data-restore="nightstand"]').click();
  await page.getByRole('tab',{name:'En escena',exact:true}).click();
  for(const [support,accessory] of [['shelf','camera'],['nightstand','glasses']]){
    await page.locator(`[data-object="${support}"]`).click();await page.getByRole('button',{name:'Quitar de la escena'}).click();
    await expect(page.locator(`[data-object="${accessory}"]`)).toBeVisible();
  }
  await page.getByRole('tab',{name:'Originales',exact:true}).click();await page.locator('[data-restore="shelf"]').click();
  await expect(page.locator('[data-restore="shelf"]')).toBeDisabled();
  await page.getByRole('tab',{name:'En escena',exact:true}).click();await page.locator('[data-object="bed"]').click();
  await page.locator('[data-color="0"]').fill('#3388cc');await page.locator('[data-color="0"]').dispatchEvent('change');
  expect((await saved(page)).builtins.find(e=>e.id==='bed').colors['0']).toBe('#3388cc');
  await page.reload();await expect(page.locator('.scene-editor')).toHaveAttribute('data-ready','true',{timeout:60000});
  await page.getByRole('tab',{name:'Originales',exact:true}).click();await page.locator('[data-restore="nightstand"]').click();
  expect((await saved(page)).builtins.find(e=>e.id==='glasses').visible).toBe(true);
  await page.getByRole('tab',{name:'En escena',exact:true}).click();await page.locator('[data-object="bed"]').click();await expect(page.locator('[data-color="0"]')).toHaveValue('#3388cc');
  await page.locator('#se-light-preview').selectOption('night');await page.screenshot({path:'.context/scene-editor-corrections-night.png',fullPage:true});expect(errors).toEqual([]);
});

test('the room waters a replacement succulent and retains the moved clock and swivel-chair work action',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  const custom=structuredClone(supplied),succulent=custom.objects.find(e=>e.model==='020');
  await page.addInitScript(({key,scene})=>localStorage.setItem(key,JSON.stringify(scene)),{key:SCENE_STORAGE,scene:custom});
  await page.goto('/?look=normal');const stage=page.locator('#stage');await expect(stage).toHaveAttribute('data-ready','true',{timeout:60000});
  const targets=await stage.getAttribute('data-targets');expect(targets).toContain('work:');expect(targets).toContain('clock:');
  const [,x,y]=targets.split(' ').find(t=>t.startsWith('water:')).split(':').map(Number),box=await page.locator('#zud-canvas').boundingBox();
  await page.mouse.click(box.x+box.width*x/100,box.y+box.height*y/100);
  await expect(stage).toHaveAttribute('data-state','water',{timeout:15000});await expect(stage).toHaveAttribute('data-plant-growth','1.000');await expect(stage).toHaveAttribute('data-watered-object',succulent.id);
  await page.keyboard.press('6');await expect(stage).toHaveAttribute('data-activity','typing',{timeout:15000});
  await page.goto('/?time=23:30&look=normal');await expect(stage).toHaveAttribute('data-ready','true',{timeout:60000});await expect(stage).toHaveAttribute('data-lamp','on');
});
