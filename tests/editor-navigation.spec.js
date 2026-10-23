import {test,expect} from '@playwright/test';

test('switch editors without losing pending character changes or room URL options',async({page})=>{
  test.setTimeout(90000);
  await page.goto('/?debug=character&lang=es#studio');
  await expect(page.locator('.lab-viewport')).toHaveAttribute('data-ready','true');
  await page.getByRole('button',{name:'Mirada',exact:true}).click();
  await page.locator('[data-setting="eyeOpening"]').fill('0.75');
  await page.getByRole('navigation',{name:'Editores'}).getByRole('link',{name:'Escena',exact:true}).click();
  await expect(page).toHaveURL(/edit=scene/);
  expect(new URL(page.url()).searchParams.get('lang')).toBe('es');
  expect(new URL(page.url()).hash).toBe('#studio');
  await expect(page.locator('.scene-editor')).toHaveAttribute('data-ready','true',{timeout:60000});
  await expect(page.locator('#se-fields')).toBeHidden();
  await page.getByRole('button',{name:'Ver objetos de la escena'}).click();
  await expect(page.getByRole('tab',{name:'En escena'})).toBeFocused();
  await page.locator('[data-object]').first().click();
  await expect(page.locator('#se-fields')).toBeVisible();
  await expect(page.locator('#se-empty-selection')).toBeHidden();
  await page.getByRole('navigation',{name:'Editores'}).getByRole('link',{name:'Personaje'}).click();
  await expect(page.locator('.lab-viewport')).toHaveAttribute('data-ready','true');
  await expect(page.locator('[data-setting="eyeOpening"]')).toHaveValue('0.75');
});

test('character shortcuts reveal collapsed sections and camera buttons show the selected view',async({page})=>{
  await page.goto('/?debug=character');
  await expect(page.locator('.lab-viewport')).toHaveAttribute('data-ready','true');
  await expect(page.locator('.lab-panel details[open]')).toHaveCount(0);
  await expect(page.locator('.lab-brand,.lab-mark,.lab-scene-title h2')).toHaveCount(0);
  await page.getByRole('button',{name:'Forma',exact:true}).click();
  await expect(page.locator('[data-setting="width"]')).toBeVisible();
  await expect(page.locator('#lab-section-shape summary')).toBeFocused();
  await page.locator('[data-setting="width"]').fill('1.2');
  await expect(page.locator('#lab-save')).toHaveText('✓ Guardado en este navegador');
  await page.getByRole('button',{name:'Frente',exact:true}).click();
  await expect(page.getByRole('button',{name:'Frente',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('button',{name:'Centrar',exact:true})).toHaveAttribute('aria-pressed','false');
});

test('mobile scene starts with the preview and provides direct access to the inspector',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/?edit=scene');
  await expect(page.locator('.scene-editor')).toHaveAttribute('data-ready','true',{timeout:60000});
  const preview=await page.locator('.se-viewport').boundingBox();
  const library=await page.locator('.se-library').boundingBox();
  expect(preview.y).toBeLessThan(library.y);
  await page.getByRole('button',{name:'Propiedades ↓'}).click();
  await expect(page.getByRole('button',{name:'Ver objetos de la escena'})).toBeInViewport();
  await page.getByRole('button',{name:'Volver a la vista 3D'}).click();
  await expect(page.locator('#se-canvas')).toBeInViewport();
  await expect(page.locator('#se-canvas')).toBeFocused();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
});
