import {test,expect} from '@playwright/test';

test('landing, locked roster, sequential confirmation and map choices work with keyboard',async({page})=>{
  test.setTimeout(60000);await page.setViewportSize({width:1200,height:800});
  const maps=[],models=[];page.on('request',request=>{if(/models\/circuit0/.test(request.url()))maps.push(request.url());if(request.url().endsWith('.glb'))models.push(request.url());});
  await page.goto('/?map=nexus');const lobby=page.locator('.race-lobby');
  await expect(lobby).toHaveAttribute('data-stage','0');await expect(page.getByRole('button',{name:'Jugar'})).toBeVisible();
  await expect(page.locator('.flight-app')).toHaveCount(0);
  await expect(page.locator('.lobby-preview')).toBeHidden();
  await expect(lobby).not.toHaveAttribute('data-preview','ready');
  expect(models).toEqual([]);
  await expect(page.locator('.lobby-title-biggas')).not.toHaveCSS('animation-name','none');
  await page.keyboard.press('Enter');await expect(lobby).toHaveAttribute('data-stage','1');
  await expect(page.locator('[data-step="3"]')).toBeDisabled();
  await expect(page.locator('[data-screen="1"] .is-locked')).toHaveCount(7);
  for(const slot of await page.locator('[data-screen="1"] .is-locked').all())await expect(slot).toBeDisabled();
  await expect(page.getByRole('button',{name:'Zud, seleccionado'})).toHaveAttribute('aria-pressed','true');
  await page.keyboard.press('Enter');await expect(lobby).toHaveAttribute('data-stage','2');
  await expect(page.locator('[data-screen="2"] .is-locked')).toHaveCount(7);
  await expect(page.getByRole('button',{name:'Nave 033, seleccionado'})).toBeVisible();
  await page.keyboard.press('Escape');await expect(lobby).toHaveAttribute('data-stage','1');
  await page.keyboard.press('Enter');await page.keyboard.press('Enter');await expect(lobby).toHaveAttribute('data-stage','3');
  await expect(page.locator('input[value=nexus]')).toBeChecked();await page.locator('.lobby-map-card:has(input[value=ruins])').click();
  await page.locator('.lobby-mode label:has(input[value=race])').click();await expect(page.getByRole('button',{name:'Correr',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');await page.keyboard.press('Enter');
  await expect(page.locator('input[value=ruins]')).toBeChecked();await expect(page.locator('input[value=race]')).toBeChecked();
  expect(maps).toEqual([]);
  await page.keyboard.press('Escape');await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  await expect(lobby).toHaveAttribute('data-stage','0');await expect(page.locator('.lobby-preview')).toBeHidden();
});

test('small screens retain all steps, and reduced-motion preview stays still',async({page})=>{
  test.setTimeout(90000);await page.setViewportSize({width:320,height:640});await page.emulateMedia({reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('/');
  const hangar=page.getByRole('link',{name:'Hangar',exact:true});
  await expect(hangar).toBeInViewport();await expect(page.getByRole('button',{name:'Jugar',exact:true})).toBeInViewport();
  await hangar.focus();await page.keyboard.press('Enter');await expect(page).toHaveURL(/spaceship\.html/);
  await page.getByRole('link',{name:'Volver al inicio',exact:true}).click();
  await expect(page.locator('.race-lobby')).toHaveAttribute('data-stage','0');
  await expect(page.locator('.lobby-preview')).toBeHidden();
  await expect(page.locator('.lobby-title-biggas')).toHaveCSS('animation-name','none');
  await page.getByRole('button',{name:'Jugar'}).click();
  await expect(page.locator('.race-lobby')).toHaveAttribute('data-preview','ready',{timeout:45000});
  const canvas=page.locator('.lobby-preview-canvas');const first=await canvas.screenshot();await page.waitForTimeout(150);expect((await canvas.screenshot()).equals(first)).toBe(true);
  for(const name of ['Confirmar Zud','Confirmar nave']){const button=page.getByRole('button',{name,exact:true});const rect=await button.boundingBox();expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.x+rect.width).toBeLessThanOrEqual(320);expect(rect.y+rect.height).toBeLessThanOrEqual(640);await button.click();}
  await expect(page.getByRole('button',{name:'Volar',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(320);
  await page.locator('.lobby-map-card:has(input[value=nexus])').click();await expect(page.locator('input[value=nexus]')).toBeChecked();expect(errors).toEqual([]);
});

test('paper defaults on, updates actual previews and thumbnails, and carries into flight',async({page})=>{
  test.setTimeout(120000);await page.setViewportSize({width:960,height:640});await page.emulateMedia({reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/simulator.html');
  const toggle=page.getByRole('button',{name:'Papel',exact:true}),root=page.locator('.race-lobby'),canvas=page.locator('.lobby-preview-canvas');
  await expect(toggle).toHaveAttribute('aria-pressed','true');await expect(root).toHaveAttribute('data-paper','true');await expect(page.locator('.lobby-paper-surface')).toBeVisible();
  await toggle.click();await expect(page.locator('.lobby-paper-surface')).toBeHidden();
  await page.getByRole('button',{name:'Jugar',exact:true}).click();await expect(root).toHaveAttribute('data-preview','ready',{timeout:60000});await expect(canvas).toHaveAttribute('data-paper','false');
  const portrait=page.locator('[data-screen="1"] [data-lobby-image=zud-face]');await expect(portrait).toHaveAttribute('src',/zud-face\.png$/);
  const normal=await canvas.screenshot();await toggle.click();await expect(canvas).toHaveAttribute('data-paper','true');await expect(portrait).toHaveAttribute('src',/zud-face-paper\.png$/);expect((await canvas.screenshot()).equals(normal)).toBe(false);
  await page.getByRole('button',{name:'Confirmar Zud',exact:true}).click();await expect(canvas).toHaveAttribute('data-paper','true');
  await page.getByRole('button',{name:'Confirmar nave',exact:true}).click();await toggle.click();await expect(page.locator('[data-lobby-image=ruins]')).toHaveAttribute('src',/ruins-normal\.png$/);
  await page.keyboard.press('Escape');await expect(canvas).toHaveAttribute('data-paper','false');await page.keyboard.press('Enter');
  expect(await root.innerText()).not.toMatch(/[↗↖]/);await page.getByRole('button',{name:'Volar',exact:true}).click();
  await expect(page.locator('.flight-app')).toHaveAttribute('data-ready','true',{timeout:60000});await expect(page.locator('.flight-app')).toHaveAttribute('data-comic','false');
  await page.keyboard.press('Escape');await page.locator('.flight-team-link').click();await expect(toggle).toHaveAttribute('aria-pressed','false');expect(errors).toEqual([]);
});
