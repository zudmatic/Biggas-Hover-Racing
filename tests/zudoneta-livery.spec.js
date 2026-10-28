import {test,expect} from '@playwright/test';
import {ZUDONETA_LIVERIES,shipLivery} from '../src/ship-livery.js';

test('four paint variants preserve PBR detail, restore the original and stay independent of other ships',async({page})=>{
  test.setTimeout(90000);await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {createFlightShip}=await import('/src/flight-ship.js');
    const {ZUDONETA_LIVERIES}=await import('/src/ship-livery.js');
    const ship=await createFlightShip('037',{exhaust:false}),other=await createFlightShip('037',{exhaust:false});
    const paints=[],mechanical=[];
    ship.root.traverse(mesh=>{if(!mesh.isMesh)return;const m=mesh.material;
      if(/^(01 Marfil|02 Verde oliva|03 Naranja seguridad)/.test(m.name))paints.push({m,map:m.map,color:m.color.clone(),rough:m.roughnessMap,normal:m.normalMap,uv:mesh.geometry.attributes.uv});
      else mechanical.push({m,map:m.map,color:m.color.clone()});
    });
    const variants=ZUDONETA_LIVERIES.slice(1).map(livery=>{
      ship.setLivery(livery.id);
      return {id:ship.root.userData.livery,colors:paints.map(({m})=>'#'+m.color.getHexString()),detail:paints.every(p=>p.uv&&p.m.map&&p.m.map!==p.map&&p.m.roughnessMap===p.rough&&p.m.normalMap===p.normal),mechanical:mechanical.every(p=>p.m.map===p.map&&p.m.color.equals(p.color))};
    });
    ship.setLivery('original');const restored=paints.every(p=>p.m.map===p.map&&p.m.color.equals(p.color));
    const independent=other.root.userData.livery==='original';
    const texture=paints[0].map;ship.setLivery('violeta');const tinted=paints[0].m.map;
    ship.setLivery('original');ship.setLivery('cobalto');const reused=paints[0].m.map===tinted&&texture!==tinted;
    ship.setLivery('unknown');const fallback=ship.root.userData.livery;
    const count=paints.length;ship.dispose();other.dispose();return {variants,restored,independent,reused,fallback,count};
  });
  expect(result.count).toBe(3);expect(result.restored&&result.independent&&result.reused).toBe(true);expect(result.fallback).toBe('original');
  expect(shipLivery('invalid').id).toBe('original');expect(result.variants).toHaveLength(4);
  for(const [i,variant] of result.variants.entries()){
    expect(variant.id).toBe(ZUDONETA_LIVERIES[i+1].id);expect(variant.colors.sort()).toEqual([...ZUDONETA_LIVERIES[i+1].colors].sort());expect(variant.detail&&variant.mechanical).toBe(true);
  }
});

test('hangar paints render, survive reload and reach the vehicle preview on mobile',async({page})=>{
  test.setTimeout(120000);await page.setViewportSize({width:1280,height:900});await page.emulateMedia({reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/spaceship.html?vehicle=037&comic=0&renderer=webgl2');const stage=page.locator('.ship-viewport');
  await expect(stage).toHaveAttribute('data-ready','true',{timeout:60000});await expect(page.locator('button[data-livery]')).toHaveCount(5);
  const shots=[];
  for(const livery of ZUDONETA_LIVERIES){
    const frame=Number(await stage.getAttribute('data-frame'));
    await page.getByRole('button',{name:`Pintura ${livery.name}`,exact:true}).click();
    await expect(stage).toHaveAttribute('data-livery',livery.id);await expect.poll(async()=>Number(await stage.getAttribute('data-frame'))).toBeGreaterThan(frame+1);
    const shot=await page.locator('.ship-canvas').screenshot();for(const previous of shots)expect(shot.equals(previous)).toBe(false);shots.push(shot);
  }
  await page.screenshot({path:'.context/zudoneta-hangar.png'});
  await page.reload();await expect(stage).toHaveAttribute('data-ready','true',{timeout:60000});await expect(stage).toHaveAttribute('data-livery','violeta');
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('link',{name:'Simulador de vuelo'}).click();
  for(const name of ['Jugar','Confirmar Zud'])await page.getByRole('button',{name,exact:true}).click();
  const canvas=page.locator('.lobby-preview-canvas');await expect(canvas).toHaveAttribute('data-ready','true',{timeout:60000});await expect(canvas).toHaveAttribute('data-livery','violeta');
  await page.getByRole('button',{name:'Pintura Turquesa',exact:true}).click();await expect(canvas).toHaveAttribute('data-ready','true');await expect(canvas).toHaveAttribute('data-livery','turquesa');
  await page.locator('[data-vehicle-choice="038"]').click();await expect(page.locator('.ship-liveries')).toBeHidden();
  await page.locator('[data-vehicle-choice="037"]').click();await expect(canvas).toHaveAttribute('data-ready','true',{timeout:60000});await expect(canvas).toHaveAttribute('data-livery','turquesa');
  await expect(page.getByRole('button',{name:'Pintura Turquesa',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.screenshot({path:'.context/zudoneta-mobile.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);expect(errors).toEqual([]);
});

test('paint and pilot palette persist independently through race, restart and return',async({page})=>{
  test.setTimeout(150000);await page.setViewportSize({width:1100,height:800});await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/?vehicle=037&livery=cobalto&pilot=zudmatic&palette=Coral&renderer=webgl2');
  for(const name of ['Jugar','Confirmar Zudmatic','Confirmar nave','Volar'])await page.getByRole('button',{name,exact:true}).click();
  const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});
  await expect(app).toHaveAttribute('data-livery','cobalto');await expect(app).toHaveAttribute('data-palette','Coral');await expect(app).toHaveAttribute('data-phase','flying',{timeout:15000});
  await page.keyboard.press('Escape');await page.locator('#flight-restart').click();await expect(app).toHaveAttribute('data-livery','cobalto');await expect(app).toHaveAttribute('data-phase','flying',{timeout:15000});
  await page.keyboard.press('Escape');await page.locator('.flight-team-link').click();
  await expect(page.locator('.race-lobby')).toHaveAttribute('data-livery','cobalto');await expect(page.locator('.race-lobby')).toHaveAttribute('data-palette','Coral');
  await page.getByRole('link',{name:'Hangar',exact:true}).click();await expect(page.locator('.ship-viewport')).toHaveAttribute('data-ready','true',{timeout:60000});
  await expect(page.getByRole('button',{name:'Pintura Cobalto',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('paper materials follow live paint texture changes and restore the original',async({page})=>{
  await page.goto('/');
  const checks=await page.evaluate(async()=>{
    const {createFlightShip}=await import('/src/flight-ship.js');
    const {ZUDONETA_LIVERIES}=await import('/src/ship-livery.js');
    const {createComicStyle,createComicMaterials}=await import('/src/comic-tsl-material.js');
    const ship=await createFlightShip('037',{exhaust:false});
    const paints=ship.root.children.filter(mesh=>mesh.isMesh&&/^(01 Marfil|02 Verde oliva|03 Naranja seguridad)/.test(mesh.material.name));
    const sources=paints.map(mesh=>mesh.material),originals=sources.map(material=>material.map);
    const comic=createComicMaterials(ship.root,createComicStyle());
    const checks=[...ZUDONETA_LIVERIES.slice(1),ZUDONETA_LIVERIES[0]].map(livery=>{
      ship.setLivery(livery.id);comic.sync();comic.setEnabled(true);
      const matches=paints.length===3&&paints.every((mesh,i)=>mesh.material.map===sources[i].map&&mesh.material.color.equals(sources[i].color)&&(livery.id==='original'?mesh.material.map===originals[i]:mesh.material.map!==originals[i]));
      comic.setEnabled(false);return matches;
    });
    comic.dispose();ship.dispose();return checks;
  });
  expect(checks).toEqual([true,true,true,true,true]);
});

test('paper preview renders a changed paint like the same paint loaded directly',async({page,context})=>{
  test.setTimeout(120000);
  const reference=await context.newPage();
  for(const view of [page,reference]){await view.setViewportSize({width:1100,height:800});await view.emulateMedia({reducedMotion:'reduce'});}
  async function openSelection(view,livery){
    await view.goto(`/?vehicle=037&livery=${livery}&comic=1&renderer=webgl2`);
    for(const name of ['Jugar','Confirmar Zud'])await view.getByRole('button',{name,exact:true}).click();
    await expect(view.locator('.lobby-preview-canvas')).toHaveAttribute('data-ready','true',{timeout:60000});
  }
  await openSelection(page,'original');
  for(const livery of [...ZUDONETA_LIVERIES.slice(1),ZUDONETA_LIVERIES[0]]){
    await page.getByRole('button',{name:`Pintura ${livery.name}`,exact:true}).click();
    await expect(page.locator('.lobby-preview-canvas')).toHaveAttribute('data-ready','true');
    const changed=(await page.locator('.lobby-preview-canvas').screenshot()).toString('base64');
    await openSelection(reference,livery.id);
    const direct=(await reference.locator('.lobby-preview-canvas').screenshot()).toString('base64');
    const difference=await page.evaluate(async images=>{
      const pixels=await Promise.all(images.map(async base64=>{
        const bitmap=await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
        const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
        const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();return ctx.getImageData(0,0,canvas.width,canvas.height).data;
      }));
      if(pixels[0].length!==pixels[1].length)return Infinity;
      let delta=0;for(let i=0;i<pixels[0].length;i++)delta+=Math.abs(pixels[0][i]-pixels[1][i]);
      return delta/pixels[0].length/255;
    },[changed,direct]);
    expect(difference,`${livery.name}: changing paint must match loading it directly`).toBeLessThan(.003);
  }
  await reference.close();
});
