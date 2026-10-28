import {test,expect} from '@playwright/test';

// Full Chromium uses the native GPU in headless mode on macOS.
test.use({channel:'chromium',launchOptions:{args:['--enable-unsafe-webgpu']}});

for(const backend of ['webgpu','webgl2'])test(`Lomi can select every ship, fly and return through the hangar (${backend})`,async({page})=>{
  test.setTimeout(180000);await page.setViewportSize({width:1200,height:850});await page.emulateMedia({reducedMotion:'reduce'});
  const errors=[],modelRequests=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('request',request=>{if(request.url().endsWith('/models/lomi/lomi.glb'))modelRequests.push(request.url());});
  await page.goto(backend==='webgl2'?'/?renderer=webgl2':'/');await page.getByRole('button',{name:'Jugar',exact:true}).click();
  await page.locator('[data-pilot-choice=zud]').focus();await page.keyboard.press('End');
  const lobby=page.locator('.race-lobby'),canvas=page.locator('.lobby-preview-canvas');
  await expect(lobby).toHaveAttribute('data-pilot','lomi');await expect(lobby).toHaveAttribute('data-preview','ready',{timeout:60000});
  await expect(canvas).toHaveAttribute('data-backend',backend==='webgpu'?'WebGPU':'WebGL2');
  await expect(page.locator('[data-screen="1"] .lobby-section-title>span')).toHaveText('05 / 09');
  await expect(page.locator('.lobby-hats')).toBeHidden();await expect(page.locator('.lobby-palettes')).toBeHidden();
  for(const paper of [true,false]){
    if(!paper)await page.getByRole('button',{name:'Papel',exact:true}).click();
    await expect(canvas).toHaveAttribute('data-paper',String(paper));
    await expect(page.locator('[data-pilot-choice=lomi] img')).toHaveAttribute('src',`/images/flight/lomi-face${paper?'-paper':''}.png`);
    await expect(page.locator('.lobby-preview-fallback')).toHaveAttribute('src',`/images/flight/lomi${paper?'-paper':''}.png`);
    for(const selector of ['[data-pilot-choice=lomi] img','.lobby-preview-fallback'])await expect.poll(()=>page.locator(selector).evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
  }
  await page.locator('[data-pilot-choice=ajo]').click();await page.locator('[data-pilot-choice=lomi]').click();
  await expect(lobby).toHaveAttribute('data-preview','ready',{timeout:60000});await expect(canvas).toHaveAttribute('data-pilot','lomi');
  await page.getByRole('button',{name:'Confirmar Lomi',exact:true}).click();
  for(const id of ['037','038','039']){
    await page.locator(`[data-vehicle-choice="${id}"]`).click();await expect(canvas).toHaveAttribute('data-vehicle',id);
    await expect(canvas).toHaveAttribute('data-ready','true',{timeout:60000});await expect(canvas).toHaveAttribute('data-pilot','lomi');
  }
  expect(modelRequests).toHaveLength(1);
  await page.getByRole('button',{name:'Confirmar nave',exact:true}).click();await expect(page.locator('.lobby-team')).toContainText('LOMI');
  await page.getByRole('button',{name:'Volar',exact:true}).click();
  const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});await expect(app).toHaveAttribute('data-pilot','lomi');await expect(app).toHaveAttribute('data-phase','flying',{timeout:15000});
  expect(new URL(page.url()).searchParams.get('pilot')).toBe('lomi');await expect(page.locator('#flight-pilot')).toHaveText('LOMI');
  await page.keyboard.down('KeyW');await expect.poll(async()=>Number(await app.getAttribute('data-speed')),{timeout:15000}).toBeGreaterThan(15);await page.keyboard.up('KeyW');
  await page.keyboard.press('Escape');await page.locator('#flight-restart').click();await expect(app).toHaveAttribute('data-pilot','lomi');
  await expect(app).toHaveAttribute('data-phase','flying');await page.keyboard.press('Escape');await page.locator('.flight-team-link').click();await expect(lobby).toHaveAttribute('data-pilot','lomi');
  await page.getByRole('link',{name:'Hangar',exact:true}).click();
  const stage=page.locator('.ship-viewport');
  for(const id of ['037','038','039']){
    await page.locator(`.ship-picker a[href*="vehicle=${id}"]`).click();
    await expect(stage).toHaveAttribute('data-ready','true',{timeout:60000});await page.getByLabel('Lomi al mando',{exact:true}).check();await expect(stage).toHaveAttribute('data-pilot','true');
  }
  await page.getByRole('link',{name:'Simulador de vuelo'}).click();
  await expect(lobby).toHaveAttribute('data-pilot','lomi');await expect(lobby).toHaveAttribute('data-vehicle','039');expect(errors).toEqual([]);
});

test('Lomi retains independent rigs and textures, stands still with lowered arms; seated poses match Ajo and stay put while the ship rotates',async({page})=>{
  test.setTimeout(60000);await page.goto('/');
  const result=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');const {createLomiModel}=await import('/src/lomi-model.js');const {createFlightShip}=await import('/src/flight-ship.js');
    const {createZudmaticModel}=await import('/src/zudmatic-model.js');
    const {GLTFLoader}=await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');const {prepareShipModel,shipConfig}=await import('/src/ship-catalog.js');
    const nomada=(await new GLTFLoader().loadAsync('/models/spaceship/nomada-038.glb')).scene;prepareShipModel(nomada,shipConfig('038'));
    const gripTargets=[['007','008'],['001','002']].map(rings=>rings.map(suffix=>new THREE.Box3().setFromObject(nomada.getObjectByName(`Anillo_empuñadura${suffix}`)).getCenter(new THREE.Vector3())).reduce((a,b)=>a.add(b)).multiplyScalar(.5));
    const saddle=new THREE.Box3().setFromObject(nomada.getObjectByName('Asiento_cuero_cojin_2'));
    const a=await createLomiModel(),b=await createLomiModel();a.update(.5);b.update(0);
    const independent=a.bones.Head!==b.bones.Head&&a.meshes[0].geometry!==b.meshes[0].geometry&&a.meshes[0].material.map!==b.meshes[0].material.map;
    const still=a.bones.Head.quaternion.angleTo(b.bones.Head.quaternion);b.root.updateMatrixWorld(true);
    const joint=name=>b.bones[name].getWorldPosition(new THREE.Vector3());
    const stance={wrists:[joint('hand_l').toArray(),joint('hand_r').toArray()],shoulder:joint('upperarm_l').y,elbow:THREE.MathUtils.radToDeg(joint('lowerarm_l').sub(joint('upperarm_l')).angleTo(joint('hand_l').sub(joint('lowerarm_l'))))};
    const maps=b.meshes.filter(mesh=>mesh.material.map).map(mesh=>mesh.name).sort(),pose=b.bones.Head.quaternion.toArray();a.dispose();b.update(0);
    const survivor=pose.every((value,i)=>Math.abs(value-b.bones.Head.quaternion.toArray()[i])<1e-6);
    const standingReference=await createZudmaticModel();b.root.updateMatrixWorld(true);standingReference.root.updateMatrixWorld(true);
    const standingSizeRatio=new THREE.Box3().setFromObject(b.model,true).getSize(new THREE.Vector3()).y/new THREE.Box3().setFromObject(standingReference.model,true).getSize(new THREE.Vector3()).y;standingReference.dispose();b.dispose();
    const fits=[];
    for(const id of ['037','038','039']){
      const bike=id==='038',ship=await createFlightShip(id,{pilot:'lomi',exhaust:false}),actor=ship.pilot.actor,reference=await createFlightShip(id,{pilot:'ajo',exhaust:false});
      ship.root.updateMatrixWorld(true);reference.root.updateMatrixWorld(true);
      const above=pilot=>new THREE.Box3().setFromObject(pilot.model,true).max.y-pilot.bones.pelvis.getWorldPosition(new THREE.Vector3()).y;
      const sizeRatio=above(actor)/above(reference.pilot.actor),box=new THREE.Box3().setFromObject(actor.model,true);reference.dispose();
      const local=point=>ship.root.worldToLocal(point.clone());
      const aimErrors=bike?['l','r'].map((side,index)=>{
        const elbow=local(actor.bones[`lowerarm_${side}`].getWorldPosition(new THREE.Vector3())),wrist=local(actor.bones[`hand_${side}`].getWorldPosition(new THREE.Vector3()));
        return THREE.MathUtils.radToDeg(wrist.sub(elbow).angleTo(gripTargets[index].clone().sub(elbow)));
      }):[];
      const before=local(actor.bones.hand_l.getWorldPosition(new THREE.Vector3()));ship.root.rotation.set(.2,1.1,-.3);ship.root.scale.setScalar(.75);ship.update(2,0,false,true);ship.root.updateMatrixWorld(true);
      const after=local(actor.bones.hand_l.getWorldPosition(new THREE.Vector3())),pelvis=local(actor.bones.pelvis.getWorldPosition(new THREE.Vector3()));
      const controls=[],rests=[];actor.root.traverse(mesh=>{if(/^Agarre/.test(mesh.name))controls.push({name:mesh.name,position:mesh.getWorldPosition(new THREE.Vector3())});if(mesh.name==='Estribo adaptado al piloto')rests.push(mesh.getWorldPosition(new THREE.Vector3()));});
      const contact=side=>{const wrist=actor.bones[`hand_${side}`].getWorldPosition(new THREE.Vector3());return bike?wrist.lerp(actor.bones[`middle_01_${side}`].getWorldPosition(new THREE.Vector3()),.5):wrist;};
      const gripErrors=controls.map(control=>Math.min(...['r','l'].map(side=>control.position.distanceTo(contact(side))))/.75);
      const body=actor.meshes.filter(mesh=>mesh.name.startsWith('Lomi_Character')),vertex=new THREE.Vector3();
      const soleGaps=rests.map((rest,index)=>{
        const foot=local(actor.bones[`foot_${['r','l'][index]}`].getWorldPosition(new THREE.Vector3()));let lowest=Infinity;
        for(const mesh of body)for(let i=0;i<mesh.geometry.attributes.position.count;i++){mesh.getVertexPosition(i,vertex).applyMatrix4(mesh.matrixWorld);ship.root.worldToLocal(vertex);if(Math.hypot(vertex.x-foot.x,vertex.z-foot.z)<.25&&vertex.y<foot.y)lowest=Math.min(lowest,vertex.y);}
        return lowest-(local(rest).y+.0175);
      });
      fits.push({id,scale:actor.model.scale.toArray(),pelvis:pelvis.toArray(),offset:ship.config.pilotOffset,handDrift:before.distanceTo(after),min:box.min.toArray(),max:box.max.toArray(),sizeRatio,controls:controls.map(control=>control.name),gripErrors,aimErrors,soleGaps});ship.dispose();
    }
    return {independent,still,stance,maps,survivor,standingSizeRatio,fits,saddle:{min:saddle.min.toArray(),max:saddle.max.toArray()}};
  });
  expect(result.independent).toBe(true);expect(result.still).toBeLessThan(1e-6);
  expect(result.stance.shoulder).toBeCloseTo(1.251,2);expect(result.stance.elbow).toBeCloseTo(25.3,0);
  for(const [wrist,x] of [[result.stance.wrists[0],.38],[result.stance.wrists[1],-.37]]){expect(wrist[0]).toBeCloseTo(x,1);expect(wrist[1]).toBeCloseTo(.898,2);expect(wrist[2]).toBeCloseTo(.37,1);}expect(result.survivor).toBe(true);
  expect(result.maps).toEqual(['Lomi_Character_Retop','Lomi_Character_Retop_1','Lomi_Head']);
  expect(result.standingSizeRatio).toBeCloseTo(1,3);
  for(const fit of result.fits){
    const bike=fit.id==='038';expect(fit.scale[0]).toBe(fit.scale[1]);expect(fit.scale[1]).toBe(fit.scale[2]);
    expect(fit.pelvis[1]).toBeCloseTo((bike?1.41:1.16)+fit.offset[1]);
    expect(fit.sizeRatio).toBeGreaterThan(.93);expect(fit.sizeRatio).toBeLessThan(1.03);
    expect(fit.handDrift).toBeLessThan(.0001);expect(fit.max[1]-fit.offset[1]).toBeLessThan(bike?3.2:2.8);expect(fit.min[1]-fit.offset[1]).toBeGreaterThan(.7);
    for(const error of fit.gripErrors)expect(error).toBeLessThan(.005);
    if(bike){
      expect(fit.pelvis[2]).toBeGreaterThan(result.saddle.min[2]);expect(fit.pelvis[2]).toBeLessThan(result.saddle.max[2]);
      expect(fit.controls).toEqual(['Agarre de la Nómada','Agarre de la Nómada']);
      for(const error of fit.aimErrors)expect(error).toBeLessThan(1);
      expect(fit.soleGaps).toHaveLength(2);for(const gap of fit.soleGaps){expect(gap).toBeGreaterThan(-.02);expect(gap).toBeLessThan(.02);}
    }else{
      expect(fit.pelvis[2]).toBeCloseTo(-.32+fit.offset[2]);expect(fit.controls).toEqual(['Agarre de Lomi','Agarre de Lomi']);
    }
  }
});

test('Lomi is selectable on a small screen and has fallback art when the model fails',async({page})=>{
  test.setTimeout(60000);await page.setViewportSize({width:320,height:640});await page.emulateMedia({reducedMotion:'reduce'});
  await page.route('**/models/lomi/lomi.glb',route=>route.fulfill({status:503,body:'Temporarily unavailable'}));
  await page.goto('/?pilot=lomi');await page.getByRole('button',{name:'Jugar',exact:true}).click();
  const lobby=page.locator('.race-lobby');await expect(lobby).toHaveAttribute('data-pilot','lomi');await expect(lobby).toHaveAttribute('data-preview','fallback',{timeout:45000});
  await expect(page.locator('.lobby-preview-fallback')).toBeVisible();await expect.poll(()=>page.locator('.lobby-preview-fallback').evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
  await expect(page.getByRole('button',{name:'Confirmar Lomi',exact:true})).toBeInViewport();await expect(page.locator('[data-pilot-choice=lomi]')).toBeInViewport();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(320);
  await page.unroute('**/models/lomi/lomi.glb');await page.locator('[data-pilot-choice=zud]').click();await page.locator('[data-pilot-choice=lomi]').click();
  await expect(lobby).toHaveAttribute('data-preview','ready',{timeout:45000});
});
