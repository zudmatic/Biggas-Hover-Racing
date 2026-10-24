import {test,expect} from '@playwright/test';

test('Mario and Nomada retain authored surfaces and animated cloth with TSL',async({page})=>{
  test.setTimeout(90000);await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {createCircuitWorld}=await import('/src/circuit-world.js');
    const {createFlightShip}=await import('/src/flight-ship.js');
    const {createBaseMaterials}=await import('/src/base-materials.js');
    const {createComicStyle,createComicMaterials}=await import('/src/comic-tsl-material.js');
    const world=await createCircuitWorld({map:'mario-raceway'}),ship=await createFlightShip('038',{pilot:'zudmatic'});
    const records=[];let colored=0,textured=0;
    for(const root of [world.root,ship.root])root.traverse(mesh=>{
      if(!mesh.isMesh||Array.isArray(mesh.material)||mesh.material.isShaderMaterial)return;
      const m=mesh.material;records.push({mesh,map:m.map,alpha:m.alphaTest,side:m.side,colors:m.vertexColors});
      colored+=Number(m.vertexColors&&!!mesh.geometry.attributes.color);textured+=Number(!!m.map);
    });
    const base=[world.root,ship.root].map(createBaseMaterials),comic=[world.root,ship.root].map(r=>createComicMaterials(r,createComicStyle()));
    comic.forEach(c=>c.setEnabled(true));
    const preserved=records.every(r=>r.mesh.material.map===r.map&&r.mesh.material.alphaTest===r.alpha&&r.mesh.material.side===r.side&&r.mesh.material.vertexColors===r.colors);
    const flag=ship.root.children.find(m=>m.userData.cloth),rest=flag.geometry.attributes.position.array.slice();ship.update(2,52,true,false);
    const moved=rest.some((v,i)=>Math.abs(v-flag.geometry.attributes.position.array[i])>.01),node=flag.material.isNodeMaterial;
    comic.forEach(c=>c.dispose());base.forEach(b=>b.dispose());world.dispose();ship.dispose();
    return {colored,textured,preserved,moved,node};
  });
  expect(result.colored).toBeGreaterThan(0);expect(result.textured).toBeGreaterThan(4);
  expect(result.preserved).toBe(true);expect(result.moved).toBe(true);expect(result.node).toBe(true);
});

test('WebGPU preview selectors retain Mario Raceway and Nomada',async({page})=>{
  test.setTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/webgpu-preview.html?map=mario-raceway&vehicle=038&backend=webgpu');
  await expect(page.locator('body')).toHaveAttribute('data-ready','true',{timeout:90000});
  await expect(page).toHaveURL(/map=mario-raceway&vehicle=038/);
  await expect(page.locator('#drive')).toHaveAttribute('href',/map=mario-raceway&vehicle=038/);
  await expect(page.locator('.dialkit-select-trigger').filter({hasText:'Mario Raceway'})).toBeVisible();
  await expect.poll(async()=>JSON.parse(await page.locator('body').getAttribute('data-vfx'))?.emitted??0,{timeout:20000}).toBeGreaterThan(5);
  await page.screenshot({path:'.context/fran-webgpu-preview.png'});expect(errors).toEqual([]);
});
