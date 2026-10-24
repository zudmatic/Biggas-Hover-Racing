import {test,expect} from '@playwright/test';

const palettes=['Original','Matcha','Lavanda','Coral','Bosque'];

test('Zudmatic previews all five palettes, supports keyboard selection and retains the choice in flight',async({page})=>{
  test.setTimeout(150000);await page.setViewportSize({width:1200,height:800});await page.emulateMedia({reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
  await page.getByRole('button',{name:'Jugar',exact:true}).click();await page.locator('[data-pilot-choice=zud]').focus();await page.keyboard.press('ArrowRight');
  const lobby=page.locator('.race-lobby'),canvas=page.locator('.lobby-preview-canvas');
  await expect(lobby).toHaveAttribute('data-pilot','zudmatic');await expect(lobby).toHaveAttribute('data-preview','ready',{timeout:60000});
  await expect(page.locator('button[data-palette]')).toHaveCount(5);
  const shots=[];
  for(const palette of palettes){
    await page.getByRole('button',{name:`Color ${palette}`,exact:true}).click();await expect(canvas).toHaveAttribute('data-palette',palette);
    await expect(page.getByRole('button',{name:`Color ${palette}`,exact:true})).toHaveAttribute('aria-pressed','true');
    const shot=await canvas.screenshot();for(const previous of shots)expect(shot.equals(previous)).toBe(false);shots.push(shot);
  }
  await page.screenshot({path:'.context/zudmatic-selection.png'});
  await page.getByRole('button',{name:'Confirmar Zudmatic',exact:true}).click();
  for(const vehicle of ['037','033']){await page.locator(`[data-vehicle-choice="${vehicle}"]`).click();await expect(canvas).toHaveAttribute('data-ready','true',{timeout:60000});await expect(canvas).toHaveAttribute('data-pilot','zudmatic');await expect(canvas).toHaveAttribute('data-palette','Bosque');}
  await page.getByRole('button',{name:'Confirmar nave',exact:true}).click();await expect(page.locator('.lobby-team')).toContainText('ZUDMATIC');await page.getByRole('button',{name:'Volar',exact:true}).click();
  const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});await expect(app).toHaveAttribute('data-pilot','zudmatic');await expect(app).toHaveAttribute('data-palette','Bosque');expect(new URL(page.url()).searchParams.get('palette')).toBe('Bosque');
  await page.keyboard.press('Escape');await page.locator('.flight-team-link').click();await expect(lobby).toHaveAttribute('data-pilot','zudmatic');await expect(lobby).toHaveAttribute('data-palette','Bosque');
  await page.getByRole('link',{name:'Hangar',exact:true}).click();await expect(page.locator('.ship-viewport')).toHaveAttribute('data-ready','true',{timeout:60000});await page.getByLabel('Zudmatic al mando',{exact:true}).check();await expect(page.locator('.ship-viewport')).toHaveAttribute('data-pilot','true');
  await page.getByRole('link',{name:'Oliva 037',exact:true}).click();await expect(page.locator('.ship-viewport')).toHaveAttribute('data-ready','true',{timeout:60000});await page.getByLabel('Zudmatic al mando',{exact:true}).check();
  await page.getByRole('link',{name:'Simulador de vuelo'}).click();await expect(lobby).toHaveAttribute('data-vehicle','037');await expect(lobby).toHaveAttribute('data-pilot','zudmatic');await expect(lobby).toHaveAttribute('data-palette','Bosque');expect(errors).toEqual([]);
});

test('palettes preserve part overrides, actors are independent and seated rigs fit both cockpits while turning',async({page})=>{
  test.setTimeout(60000);await page.goto('/');
  const result=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');const {createFlightShip}=await import('/src/flight-ship.js');const {ZUDMATIC_PALETTES}=await import('/src/pilot-catalog.js');
    const results=[];
    for(const id of ['033','037']){
      const ship=await createFlightShip(id,{pilot:'zudmatic',palette:'Original'}),actor=ship.pilot.actor;
      const checks=ZUDMATIC_PALETTES.map(p=>{actor.setPalette(p.name);return actor.meshes.every(m=>m.material.color.getHexString()===(p.parts?.[m.userData.partId]??p.colors[m.userData.colorKey]).slice(1));});
      ship.root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(actor.root),pelvis=actor.bones.pelvis.getWorldPosition(new THREE.Vector3());
      const before=actor.bones.hand_L.getWorldPosition(new THREE.Vector3());ship.root.worldToLocal(before);
      ship.root.rotation.set(.2,1.1,-.3);ship.root.scale.setScalar(.75);ship.update(2,0,false,true);ship.root.updateMatrixWorld(true);
      const after=actor.bones.hand_L.getWorldPosition(new THREE.Vector3());ship.root.worldToLocal(after);
      results.push({id,checks,meshes:actor.meshes.length,bones:Object.keys(actor.bones).length,scale:actor.model.scale.toArray(),min:box.min.toArray(),max:box.max.toArray(),pelvis:pelvis.toArray(),offset:ship.config.pilotOffset,handDrift:before.distanceTo(after)});ship.dispose();
    }
    const {createZudmaticModel}=await import('/src/zudmatic-model.js');const a=await createZudmaticModel({palette:'Coral'}),b=await createZudmaticModel({palette:'Matcha'});
    a.setPalette('Lavanda');const independent=b.meshes.find(m=>m.userData.colorKey==='orange').material.color.getHexString()==='8caa68';a.dispose();b.dispose();return {results,independent};
  });
  expect(result.independent).toBe(true);
  for(const actor of result.results){
    expect(actor.checks).toEqual([true,true,true,true,true]);expect(actor.meshes).toBe(83);expect(actor.bones).toBe(24);expect(actor.scale).toEqual([.31,.31,.31]);
    expect(actor.pelvis[1]).toBeCloseTo(1.16+actor.offset[1]);expect(actor.pelvis[2]).toBeCloseTo(-.32+actor.offset[2]);
    expect(actor.max[0]-actor.min[0]).toBeLessThan(1.2);expect(actor.max[1]).toBeLessThan(2.4);expect(actor.min[1]).toBeGreaterThan(.7);expect(actor.handDrift).toBeLessThan(.0001);
  }
});

test('all five colors and confirmation remain usable on a small screen; invalid choices fall back',async({page})=>{
  test.setTimeout(60000);await page.setViewportSize({width:320,height:640});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/?pilot=unknown&palette=unknown');
  await expect(page.locator('.race-lobby')).toHaveAttribute('data-pilot','zud');await expect(page.locator('.race-lobby')).toHaveAttribute('data-palette','Original');await page.getByRole('button',{name:'Jugar',exact:true}).click();
  await page.getByRole('button',{name:'Zudmatic',exact:true}).click();await expect(page.locator('.race-lobby')).toHaveAttribute('data-preview','ready',{timeout:45000});
  for(const name of palettes){const button=page.getByRole('button',{name:`Color ${name}`,exact:true});await expect(button).toBeInViewport();await button.click();}
  await expect(page.getByRole('button',{name:'Confirmar Zudmatic',exact:true})).toBeInViewport();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(320);await page.screenshot({path:'.context/zudmatic-mobile.png'});
  await page.getByRole('button',{name:'Zud',exact:true}).click();await expect(page.locator('.lobby-palettes')).toBeHidden();await page.getByRole('button',{name:'Zudmatic',exact:true}).click();await expect(page.locator('.race-lobby')).toHaveAttribute('data-palette','Bosque');
});
