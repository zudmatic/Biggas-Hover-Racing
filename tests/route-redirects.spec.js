import {test,expect} from '@playwright/test';

test('old simulator bookmarks keep their options and open the canonical lobby',async({page})=>{
  await page.goto('/simulator.html?vehicle=038&map=nexus&camera=actual&renderer=webgl2&pilot=zudmatic#setup');
  await expect(page).toHaveURL(/\/\?vehicle=038&map=nexus&camera=actual&renderer=webgl2&pilot=zudmatic#setup$/);
  await expect(page.getByRole('button',{name:'Jugar',exact:true})).toBeVisible();
  await expect(page.locator('.race-lobby')).toHaveAttribute('data-vehicle','038');
});

for(const retired of ['/propulsor-studio.html','/webgpu-preview.html','/playground'])test(`${retired} opens the playground with its options`,async({page})=>{
  // This test checks navigation; rendering is covered by the playground suites.
  await page.route('**/src/playground.js',route=>route.fulfill({contentType:'text/javascript',body:''}));
  await page.goto(`${retired}?vehicle=038&backend=webgl2#effects`);
  await expect(page).toHaveURL(/\/playground\/\?vehicle=038&backend=webgl2#effects$/);
  await expect(page.getByRole('link',{name:'Volver al juego',exact:true})).toHaveAttribute('href','/?selection=map');
});
