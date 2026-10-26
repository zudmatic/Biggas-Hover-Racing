import {test,expect} from '@playwright/test';

test('studio starts with character ink and keeps the car finish separate',async({page})=>{
  test.setTimeout(90000);const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/chubee-studio.html');
  await expect(page.locator('body')).toHaveAttribute('data-ready','true',{timeout:60000});
  await expect.poll(()=>page.locator('canvas').getAttribute('data-frame')).not.toBeNull();
  expect(await page.evaluate(()=>window.__bluleetStudio.controls.values.Acabado['Tinta personaje'])).toBe(true);
  expect(await page.evaluate(()=>window.__bluleetStudio.controls.values.Acabado['Tinta auto'])).toBe(false);
  expect(await page.evaluate(()=>window.__bluleetStudio.controls.values.Acabado.CMYK)).toBe(1);
  expect(await page.evaluate(()=>window.__bluleetStudio.controls.values.Piloto)).toMatchObject({
    Altura:2.8,'Altura asiento':1.225,'Posición asiento':-.1,'Inclinación':7,'Altura manos':1.35,'Posición manos':.625,
  });
  await page.screenshot({path:'test-results/chubee-studio-character-ink.png'});
  await page.evaluate(()=>{const c=window.__bluleetStudio.controls;c.setValue('Acabado.Tinta personaje',true);c.setValue('Acabado.Tinta auto',true);c.setValue('Acabado.Contorno',true);c.setValue('Acabado.Recorte amarillo',true);c.setValue('Acabado.CMYK',2);});
  await page.screenshot({path:'test-results/chubee-studio.png'});
  const stats=await page.evaluate(()=>({pose:window.__bluleetStudio.pose,programs:window.__bluleetStudio.renderer.info.programs.map(p=>p.diagnostics?.runnable!==false),eyes:window.__bluleetStudio.actor.eyes}));
  expect(stats.eyes.left).toBeGreaterThan(0);expect(stats.eyes.right).toBeGreaterThan(0);
  expect(stats.pose.handErrors.every(e=>e<.1),JSON.stringify(stats.pose)).toBe(true);
  expect(stats.programs.every(Boolean)).toBe(true);expect(errors).toEqual([]);
  await page.getByText('Escena',{exact:true}).click();
  await page.getByRole('button',{name:'Costado',exact:true}).click();
  await page.screenshot({path:'test-results/chubee-studio-side.png'});
  await page.getByRole('button',{name:'Frente',exact:true}).click();
  await page.screenshot({path:'test-results/chubee-studio-front.png'});
  await page.getByRole('button',{name:'Perspectiva',exact:true}).click();
  const frame=await page.locator('canvas').getAttribute('data-frame');
  await page.evaluate(()=>{window.__bluleetStudio.controls.setValue('Acabado.Tinta personaje',false);window.__bluleetStudio.controls.setValue('Acabado.Tinta auto',false);});
  await expect.poll(()=>page.locator('canvas').getAttribute('data-frame')).not.toBe(frame);
  await page.screenshot({path:'test-results/chubee-studio-pbr.png'});
  expect(errors).toEqual([]);
});
