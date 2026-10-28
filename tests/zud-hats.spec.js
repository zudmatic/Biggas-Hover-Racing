import {test,expect} from '@playwright/test';

const hats=['beanie','samurai_kasa','cloud_chef','crescent_wizard'];

test('four hats render, remain selected across pilots, and fit the mobile selector',async({page})=>{
  test.setTimeout(60000);await page.setViewportSize({width:1200,height:800});await page.emulateMedia({reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/?hat=unknown');
  await expect(page.locator('.race-lobby')).toHaveAttribute('data-hat','beanie');await page.getByRole('button',{name:'Jugar',exact:true}).click();
  const canvas=page.locator('.lobby-preview-canvas'),shots=[];await expect(page.locator('button[data-hat]')).toHaveCount(4);await expect(page.locator('.lobby-hats img')).toHaveCount(0);await expect(page.locator('button[data-hat=beanie]')).toHaveCSS('border-radius','50%');
  for(const hat of hats){
    const button=page.locator(`button[data-hat=${hat}]`);await button.focus();await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('aria-pressed','true');await expect(canvas).toHaveAttribute('data-hat',hat);await expect(canvas).toHaveAttribute('data-ready','true',{timeout:20000});
    const shot=await canvas.screenshot();for(const previous of shots)expect(shot.equals(previous)).toBe(false);shots.push(shot);
  }
  await page.screenshot({path:'.context/zud-hats-selection.png'});
  await page.getByRole('button',{name:'Zudmatic',exact:true}).click();await expect(page.locator('.lobby-hats')).toBeHidden();await expect(page.locator('.lobby-palettes')).toBeVisible();
  await page.getByRole('button',{name:'Zud',exact:true}).click();await expect(page.locator('button[data-hat=crescent_wizard]')).toHaveAttribute('aria-pressed','true');
  await page.setViewportSize({width:320,height:640});
  for(const hat of hats)await expect(page.locator(`button[data-hat=${hat}]`)).toBeInViewport();
  await expect(page.getByRole('button',{name:'Confirmar Zud',exact:true})).toBeInViewport();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(320);expect(errors).toEqual([]);
});

test('late and failed loads cannot override a newer hat, and a failed selection can retry',async({page})=>{
  test.setTimeout(60000);await page.emulateMedia({reducedMotion:'reduce'});
  let release,started;const requested=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>release=resolve);
  await page.route('**/001_samurai_kasa_detailed_v01.glb',async route=>{started();await gate;await route.continue();});
  await page.goto('/');await page.getByRole('button',{name:'Jugar',exact:true}).click();await expect(page.locator('.race-lobby')).toHaveAttribute('data-preview','ready');
  await page.locator('button[data-hat=samurai_kasa]').click();await requested;
  await page.locator('button[data-hat=cloud_chef]').click();await expect(page.locator('.lobby-preview-canvas')).toHaveAttribute('data-ready','true');
  release();await page.unrouteAll({behavior:'wait'});
  await expect(page.locator('.lobby-preview-canvas')).toHaveAttribute('data-hat','cloud_chef');
  await page.route('**/007_crescent_wizard_detailed_v01.glb',route=>route.abort());await page.locator('button[data-hat=crescent_wizard]').click();
  await expect(page.locator('.race-lobby')).toHaveAttribute('data-preview','fallback');
  await page.unroute('**/007_crescent_wizard_detailed_v01.glb');await page.locator('button[data-hat=crescent_wizard]').click();
  await expect(page.locator('.race-lobby')).toHaveAttribute('data-preview','ready');await expect(page.locator('.lobby-preview-canvas')).toHaveAttribute('data-hat','crescent_wizard');
  await page.locator('button[data-hat=beanie]').click();await expect(page.locator('.lobby-preview-canvas')).toHaveAttribute('data-ready','true');
});

test('restored hats attach to both seated pilots, hide the beanie, and release their resources',async({page})=>{
  test.setTimeout(60000);await page.goto('/');
  const result=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');const {createSelectablePilot}=await import('/src/selectable-pilot.js');const {SHIPS}=await import('/src/ship-catalog.js');
    const results=[];
    for(const id of ['038','037']){
      const driver=await createSelectablePilot({hat:'beanie',offset:SHIPS[id].pilotOffset}),actor=driver.actor;
      for(const hat of ['samurai_kasa','cloud_chef','crescent_wizard']){
        await actor.setHat(hat);const anchor=actor.root.getObjectByName('Sombreros de Zud');driver.root.updateMatrixWorld(true);
        const box=new THREE.Box3().setFromObject(anchor),meshes=[];anchor.traverse(mesh=>{if(mesh.isMesh)meshes.push(mesh);});
        const point=meshes[0].getWorldPosition(new THREE.Vector3());driver.root.worldToLocal(point);
        const parent=new THREE.Group();parent.add(driver.root);parent.rotation.set(.2,1.2,-.1);parent.scale.setScalar(.75);driver.update(3,true);parent.updateMatrixWorld(true);
        const turned=meshes[0].getWorldPosition(new THREE.Vector3());driver.root.worldToLocal(turned);
        const materials=new Set(meshes.map(mesh=>mesh.material));let disposed=0;for(const material of materials)material.addEventListener('dispose',()=>disposed++);
        const info={id,hat,active:actor.root.userData.hat,beanie:actor.root.getObjectByName('Beanie de Zud').visible,meshes:meshes.length,cockpit:meshes.every(mesh=>mesh.userData.system==='cockpit'),width:box.max.x-box.min.x,height:box.max.y,drift:point.distanceTo(turned)};
        await actor.setHat('beanie');info.disposed=disposed;info.materials=materials.size;info.restored=actor.root.getObjectByName('Beanie de Zud').visible;results.push(info);parent.remove(driver.root);
      }
      driver.dispose();
    }return results;
  });
  expect(result).toHaveLength(6);for(const row of result){expect(row.active).toBe(row.hat);expect(row.beanie).toBe(false);expect(row.meshes).toBeGreaterThan(0);expect(row.cockpit).toBe(true);expect(row.width).toBeLessThan(1.7);expect(row.height).toBeLessThan(3);expect(row.drift).toBeLessThan(.00001);expect(row.disposed).toBe(row.materials);expect(row.restored).toBe(true);}
});

test('chosen hat travels through both ships, flight, the hangar and the return to selection',async({page})=>{
  test.setTimeout(120000);await page.setViewportSize({width:960,height:640});await page.emulateMedia({reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/?hat=crescent_wizard');
  for(const name of ['Jugar','Confirmar Zud'])await page.getByRole('button',{name,exact:true}).click();
  const canvas=page.locator('.lobby-preview-canvas');for(const vehicle of ['038','037']){await page.locator(`[data-vehicle-choice="${vehicle}"]`).click();await expect(canvas).toHaveAttribute('data-ready','true',{timeout:30000});await expect(canvas).toHaveAttribute('data-hat','crescent_wizard');}
  await page.getByRole('button',{name:'Confirmar nave',exact:true}).click();await page.getByRole('button',{name:'Volar',exact:true}).click();
  await expect(page.locator('.flight-app')).toHaveAttribute('data-ready','true',{timeout:60000});await expect(page.locator('.flight-app')).toHaveAttribute('data-hat','crescent_wizard');
  await page.keyboard.press('Escape');await page.locator('.flight-team-link').click();await expect(page.locator('.race-lobby')).toHaveAttribute('data-hat','crescent_wizard');
  await page.getByRole('link',{name:'Hangar',exact:true}).click();await expect(page.locator('.ship-viewport')).toHaveAttribute('data-ready','true',{timeout:30000});await expect(page.locator('.ship-viewport')).toHaveAttribute('data-hat','crescent_wizard');await page.getByLabel('Zud al mando',{exact:true}).check();
  await page.getByRole('link',{name:'Nómada 038',exact:true}).click();await expect(page.locator('.ship-viewport')).toHaveAttribute('data-ready','true',{timeout:30000});await expect(page.locator('.ship-viewport')).toHaveAttribute('data-hat','crescent_wizard');
  await page.getByRole('link',{name:'Simulador de vuelo'}).click();await expect(page.locator('.race-lobby')).toHaveAttribute('data-hat','crescent_wizard');expect(errors).toEqual([]);
});
