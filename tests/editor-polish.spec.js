import {test,expect} from '@playwright/test';

const ready=async(page,url,selector)=>{
  await page.goto(url);
  await expect(page.locator(selector)).toHaveAttribute('data-ready','true',{timeout:60000});
};

test('catalog filters recover and loading gives way to visible success feedback',async({page})=>{
  test.setTimeout(90000);
  await ready(page,'/?edit=scene','.scene-editor');
  await page.getByLabel('Buscar modelos').fill('no-existe');
  await expect(page.locator('#se-empty')).toBeVisible();
  await page.getByRole('button',{name:'Limpiar filtros'}).click();
  await expect(page.getByLabel('Buscar modelos')).toBeFocused();
  await expect(page.locator('[data-model]')).toHaveCount(31);
  let release;
  const gate=new Promise(resolve=>release=resolve);
  await page.route('**/003_compact_bookshelf_v02.glb',async route=>{await gate;await route.continue();});
  const card=page.locator('[data-model="003"]');
  await card.click();
  await expect(card).toHaveAttribute('aria-busy','true');
  await expect(card).toBeDisabled();
  await expect(page.locator('#se-status')).toBeInViewport();
  await expect(page.locator('#se-status')).toContainText('Cargando');
  release();
  await expect(page.locator('#se-selection')).toHaveText('Estantería compacta');
  await expect(card).not.toHaveAttribute('aria-busy','true');
  await expect(page.locator('#se-status')).toContainText('Objeto agregado');
  await page.screenshot({path:'.context/emil-scene-desktop.png'});
});

test('errors persist, notices pause while reading, and dismissal returns keyboard focus',async({page})=>{
  await ready(page,'/?debug=character','.lab-viewport');
  await page.clock.install();
  const exportButton=page.getByRole('button',{name:'Exportar JSON'});
  await exportButton.focus();
  await exportButton.press('Enter');
  const notice=page.locator('.studio-notice');
  await expect(notice).toBeVisible();
  await notice.hover();
  await page.clock.fastForward(7000);
  await expect(notice).toBeVisible();
  await page.getByRole('button',{name:'Cerrar aviso'}).click();
  await expect(exportButton).toBeFocused();
  await page.mouse.move(0,0);
  await page.clock.fastForward(200);
  await expect(notice).toBeHidden();
  await page.locator('#lab-import-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{oops')});
  await page.clock.fastForward(7000);
  await expect(notice).toBeVisible();
  await expect(page.locator('.lab-status')).toContainText('No se pudo leer');
});

test('reduced motion keeps feedback without moving controls; mobile shortcuts retain context',async({browser,baseURL})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const page=await context.newPage();
  await ready(page,baseURL+'/?debug=character','.lab-viewport');
  await page.getByRole('button',{name:'Sombrero',exact:true}).click();
  await expect(page.getByRole('button',{name:'Sombrero',exact:true})).toHaveAttribute('aria-current','location');
  await expect(page.locator('.lab-hats summary')).toBeInViewport();
  await page.screenshot({path:'.context/emil-character-mobile.png'});
  await page.getByRole('button',{name:'Volver al personaje'}).click();
  await expect(page.locator('.lab-canvas')).toBeFocused();
  await expect(page.locator('.lab-canvas')).toBeInViewport();
  const button=page.getByRole('button',{name:'Frente',exact:true});
  const box=await button.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  expect(await button.evaluate(el=>getComputedStyle(el).transform)).toBe('none');
  await page.mouse.up();
  await button.focus();await button.press('Enter');
  expect(await button.evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0s');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await context.close();
});
