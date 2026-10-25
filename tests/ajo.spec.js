import {test,expect} from '@playwright/test';

// Full Chromium uses the native GPU in headless mode on macOS.
test.use({channel:'chromium',launchOptions:{args:['--enable-unsafe-webgpu']}});

for(const backend of ['webgpu','webgl2'])test(`Ajo can select every ship, fly and return through the hangar (${backend})`,async({page})=>{
  test.setTimeout(180000);await page.setViewportSize({width:1200,height:850});await page.emulateMedia({reducedMotion:'reduce'});
  const errors=[],modelRequests=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('request',request=>{if(request.url().endsWith('/models/ajo/ajo.glb'))modelRequests.push(request.url());});
  await page.goto(backend==='webgl2'?'/?renderer=webgl2':'/');await page.getByRole('button',{name:'Jugar',exact:true}).click();
  await page.locator('[data-pilot-choice=zud]').focus();await page.keyboard.press('End');
  const lobby=page.locator('.race-lobby'),canvas=page.locator('.lobby-preview-canvas');
  await expect(lobby).toHaveAttribute('data-pilot','ajo');await expect(lobby).toHaveAttribute('data-preview','ready',{timeout:60000});
  await expect(canvas).toHaveAttribute('data-backend',backend==='webgpu'?'WebGPU':'WebGL2');
  await expect(page.locator('[data-screen="1"] .lobby-section-title>span')).toHaveText('03 / 09');
  await expect(page.locator('.lobby-hats')).toBeHidden();await expect(page.locator('.lobby-palettes')).toBeHidden();
  for(const paper of [true,false]){
    if(!paper)await page.getByRole('button',{name:'Papel',exact:true}).click();
    await expect(canvas).toHaveAttribute('data-paper',String(paper));
    for(const selector of ['[data-pilot-choice=ajo] img','.lobby-preview-fallback'])await expect.poll(()=>page.locator(selector).evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
  }
  // Switching while a different actor loads must leave the requested pilot visible.
  await page.locator('[data-pilot-choice=zudmatic]').click();await page.locator('[data-pilot-choice=ajo]').click();
  await expect(lobby).toHaveAttribute('data-preview','ready',{timeout:60000});await expect(canvas).toHaveAttribute('data-pilot','ajo');
  await page.screenshot({path:`.context/ajo-selection-${backend}.png`});
  await page.getByRole('button',{name:'Confirmar Ajo',exact:true}).click();
  for(const id of ['037','038','033']){
    await page.locator(`[data-vehicle-choice="${id}"]`).click();await expect(canvas).toHaveAttribute('data-vehicle',id);
    await expect(canvas).toHaveAttribute('data-ready','true',{timeout:60000});await expect(canvas).toHaveAttribute('data-pilot','ajo');
  }
  expect(modelRequests).toHaveLength(1);
  await page.getByRole('button',{name:'Confirmar nave',exact:true}).click();await expect(page.locator('.lobby-team')).toContainText('AJO');
  await page.getByRole('button',{name:'Volar',exact:true}).click();
  const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});await expect(app).toHaveAttribute('data-pilot','ajo');await expect(app).toHaveAttribute('data-phase','flying',{timeout:15000});
  expect(new URL(page.url()).searchParams.get('pilot')).toBe('ajo');
  await page.keyboard.down('KeyW');await expect.poll(async()=>Number(await app.getAttribute('data-speed')),{timeout:15000}).toBeGreaterThan(15);await page.keyboard.up('KeyW');
  await page.keyboard.press('Escape');await page.screenshot({path:`.context/ajo-flight-${backend}.png`});await page.locator('#flight-restart').click();await expect(app).toHaveAttribute('data-pilot','ajo');
  await expect(app).toHaveAttribute('data-phase','flying');await page.keyboard.press('Escape');await page.locator('.flight-team-link').click();await expect(lobby).toHaveAttribute('data-pilot','ajo');
  await page.getByRole('link',{name:'Hangar',exact:true}).click();
  const stage=page.locator('.ship-viewport');
  for(const id of ['033','037','038']){
    if(id!=='033')await page.locator(`.ship-picker a[href*="vehicle=${id}"]`).click();
    await expect(stage).toHaveAttribute('data-ready','true',{timeout:60000});await page.getByLabel('Ajo al mando',{exact:true}).check();await expect(stage).toHaveAttribute('data-pilot','true');
  }
  await page.screenshot({path:`.context/ajo-hangar-${backend}.png`});await page.getByRole('link',{name:'Simulador de vuelo'}).click();
  await expect(lobby).toHaveAttribute('data-pilot','ajo');await expect(lobby).toHaveAttribute('data-vehicle','038');expect(errors).toEqual([]);
});

test('Ajo retains independent rigs, animation and textures; driving poses stay seated while the ship rotates',async({page})=>{
  test.setTimeout(60000);await page.goto('/');
  const result=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');const {createAjoModel}=await import('/src/ajo-model.js');const {createFlightShip}=await import('/src/flight-ship.js');
    const {createZudmaticModel}=await import('/src/zudmatic-model.js');
    const {GLTFLoader}=await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');const {prepareShipModel,shipConfig}=await import('/src/ship-catalog.js');
    const nomada=(await new GLTFLoader().loadAsync('/models/spaceship/nomada-038.glb')).scene;prepareShipModel(nomada,shipConfig('038'));
    const gripTargets=[['007','008'],['001','002']].map(rings=>rings.map(suffix=>new THREE.Box3().setFromObject(nomada.getObjectByName(`Anillo_empuñadura${suffix}`)).getCenter(new THREE.Vector3())).reduce((a,b)=>a.add(b)).multiplyScalar(.5));
    const saddle=new THREE.Box3().setFromObject(nomada.getObjectByName('Asiento_cuero_cojin_2'));
    const a=await createAjoModel(),b=await createAjoModel();a.update(1.5);b.update(0);
    const independent=a.bones.Head!==b.bones.Head&&a.meshes[0].geometry!==b.meshes[0].geometry&&a.meshes[0].material.map!==b.meshes[0].material.map;
    const animated=a.bones.Head.quaternion.angleTo(b.bones.Head.quaternion)>1e-4;
    const maps=b.meshes.filter(mesh=>mesh.material.map).length,pose=b.bones.Head.quaternion.toArray();a.dispose();b.update(0);
    const survivor=pose.every((value,i)=>Math.abs(value-b.bones.Head.quaternion.toArray()[i])<1e-6);
    const standingReference=await createZudmaticModel(),bodyBounds=new THREE.Box3();b.root.updateMatrixWorld(true);standingReference.root.updateMatrixWorld(true);
    for(const mesh of b.meshes)if(!mesh.name.includes('Ear'))bodyBounds.expandByObject(mesh,true);
    const referenceBounds=new THREE.Box3().setFromObject(standingReference.model,true),referenceHead=new THREE.Box3().setFromObject(standingReference.meshes.find(mesh=>mesh.name.includes('Helmet_')),true);
    const standingSizeRatio=bodyBounds.getSize(new THREE.Vector3()).y/(referenceHead.max.y-referenceBounds.min.y);standingReference.dispose();b.dispose();
    const fits=[];
    for(const id of ['033','037','038']){
      const ship=await createFlightShip(id,{pilot:'ajo',exhaust:false}),actor=ship.pilot.actor;
      ship.root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(actor.model,true);
      const head=new THREE.Box3().setFromObject(actor.meshes.find(mesh=>mesh.name.includes('Cat_Head')),true);
      const reference=await createZudmaticModel({seated:true,fit:ship.config.pilotFit,offset:ship.config.pilotOffset});reference.update(0,false);reference.root.updateMatrixWorld(true);
      const referenceBox=new THREE.Box3().setFromObject(reference.model,true),referenceCrown=new THREE.Box3().setFromObject(reference.meshes.find(mesh=>mesh.name.includes('Helmet_')),true).max.y;reference.dispose();
      const local=bone=>ship.root.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
      const before=local(actor.bones.hand_l);ship.root.rotation.set(.2,1.1,-.3);ship.root.scale.setScalar(.75);ship.update(2,0,false,true);ship.root.updateMatrixWorld(true);
      const after=local(actor.bones.hand_l),pelvis=local(actor.bones.pelvis);
      const controls=[];actor.root.traverse(mesh=>{if(mesh.name==='Agarre de la Nómada')controls.push(mesh.position.x);});
      const gripErrors=id==='038'?['HandR','HandL'].map((name,index)=>{
        const mesh=actor.meshes.find(mesh=>mesh.name.includes(name)),center=new THREE.Vector3(),vertex=new THREE.Vector3();
        for(let i=0;i<mesh.geometry.attributes.position.count;i++){mesh.getVertexPosition(i,vertex).applyMatrix4(mesh.matrixWorld);center.add(vertex);}
        center.divideScalar(mesh.geometry.attributes.position.count);return ship.root.worldToLocal(center).distanceTo(gripTargets[index]);
      }):[];
      fits.push({id,scale:actor.model.scale.toArray(),pelvis:pelvis.toArray(),torso:local(actor.bones.spine_03).sub(pelvis).toArray(),offset:ship.config.pilotOffset,handDrift:before.distanceTo(after),min:box.min.toArray(),max:box.max.toArray(),referenceWidth:referenceBox.getSize(new THREE.Vector3()).x,crown:head.max.y,referenceCrown,controls,gripErrors});ship.dispose();
    }
    return {independent,animated,maps,survivor,standingSizeRatio,fits,saddle:{min:saddle.min.toArray(),max:saddle.max.toArray()}};
  });
  expect(result.independent).toBe(true);expect(result.animated).toBe(true);expect(result.survivor).toBe(true);expect(result.maps).toBeGreaterThan(5);
  expect(result.standingSizeRatio).toBeGreaterThan(.95);expect(result.standingSizeRatio).toBeLessThan(1.05);
  for(const fit of result.fits){
    const bike=fit.id==='038';expect(fit.scale[0]).toBe(fit.scale[1]);expect(fit.scale[1]).toBe(fit.scale[2]);
    expect(fit.pelvis[1]).toBeCloseTo((bike?1.41:1.16)+fit.offset[1]);
    expect((fit.max[0]-fit.min[0])/fit.referenceWidth).toBeGreaterThan(.95);expect((fit.max[0]-fit.min[0])/fit.referenceWidth).toBeLessThan(1.05);
    expect(Math.abs(fit.crown-fit.referenceCrown)).toBeLessThan(.08);
    expect(fit.handDrift).toBeLessThan(.0001);expect(fit.max[1]).toBeLessThan(bike?3.2:2.8);expect(fit.min[1]).toBeGreaterThan(.7);
    if(bike){
      expect(fit.pelvis[2]).toBeGreaterThan(result.saddle.min[2]);expect(fit.pelvis[2]).toBeLessThan(result.saddle.max[2]);
      expect(fit.torso[2]).toBeGreaterThan(.2);expect(fit.torso[1]).toBeGreaterThan(0);
      expect(fit.controls).toEqual([]);for(const error of fit.gripErrors)expect(error).toBeLessThan(.005);
    }else expect(fit.pelvis[2]).toBeCloseTo(-.32+fit.offset[2]);
  }
});

test('Ajo is selectable on a small screen and has fallback art when the model fails',async({page})=>{
  test.setTimeout(60000);await page.setViewportSize({width:320,height:640});await page.emulateMedia({reducedMotion:'reduce'});
  await page.route('**/models/ajo/ajo.glb',route=>route.fulfill({status:503,body:'Temporarily unavailable'}));
  await page.goto('/?pilot=ajo');await page.getByRole('button',{name:'Jugar',exact:true}).click();
  const lobby=page.locator('.race-lobby');await expect(lobby).toHaveAttribute('data-pilot','ajo');await expect(lobby).toHaveAttribute('data-preview','fallback',{timeout:45000});
  await expect(page.locator('.lobby-preview-fallback')).toBeVisible();await expect.poll(()=>page.locator('.lobby-preview-fallback').evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
  await expect(page.getByRole('button',{name:'Confirmar Ajo',exact:true})).toBeInViewport();await expect(page.locator('[data-pilot-choice=ajo]')).toBeInViewport();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(320);
  await page.unroute('**/models/ajo/ajo.glb');await page.locator('[data-pilot-choice=zud]').click();await page.locator('[data-pilot-choice=ajo]').click();
  await expect(lobby).toHaveAttribute('data-preview','ready',{timeout:45000});await page.screenshot({path:'.context/ajo-mobile.png'});
});
