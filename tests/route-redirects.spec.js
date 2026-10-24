import {test,expect} from '@playwright/test';

test('old simulator bookmarks keep their options and open the canonical lobby',async({page})=>{
  await page.goto('/simulator.html?vehicle=038&map=nexus&camera=actual&renderer=webgl2&pilot=zudmatic#setup');
  await expect(page).toHaveURL(/\/\?vehicle=038&map=nexus&camera=actual&renderer=webgl2&pilot=zudmatic#setup$/);
  await expect(page.getByRole('button',{name:'Jugar',exact:true})).toBeVisible();
  await expect(page.locator('.race-lobby')).toHaveAttribute('data-vehicle','038');
});

test('retired studio redirects to the integrated preview without loading its old module',async({page})=>{
  const requests=[];page.on('request',request=>requests.push(request.url()));
  // This test checks navigation; rendering is covered by the WebGPU preview suite.
  await page.route('**/src/webgpu-preview.js',route=>route.fulfill({contentType:'text/javascript',body:''}));
  await page.goto('/propulsor-studio.html?vehicle=038&backend=webgl2#effects');
  await expect(page).toHaveURL(/\/webgpu-preview.html\?vehicle=038&backend=webgl2#effects$/);
  await expect(page.getByRole('link',{name:'Volver al juego',exact:true})).toHaveAttribute('href','./?selection=map');
  expect(requests.some(url=>url.includes('/src/propulsor-studio'))).toBe(false);
});
