import {test,expect} from '@playwright/test';

const finiteMotion=page=>page.evaluate(()=>document.getAnimations().filter(a=>a.effect.getTiming().iterations!==Infinity&&a.playState==='running').length);

test('pointer navigation animates, interruption stays clean and keyboard remains immediate',async({page})=>{
  await page.setViewportSize({width:960,height:640});await page.goto('/simulator.html');
  await page.locator('.lobby-start').waitFor({state:'visible'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const snapshot=await page.evaluate(()=>{
    document.querySelector('.lobby-start').dispatchEvent(new MouseEvent('click',{detail:1,bubbles:true}));
    const ghost=document.querySelector('.lobby-exit');
    return {count:document.getAnimations().filter(a=>a.effect.getTiming().iterations!==Infinity).length,inert:ghost.inert,hidden:ghost.getAttribute('aria-hidden'),focus:document.activeElement.id};
  });
  expect(snapshot.count).toBeGreaterThan(5);expect(snapshot.inert).toBe(true);expect(snapshot.hidden).toBe('true');expect(snapshot.focus).toBe('lobby-title-1');
  await page.evaluate(()=>{
    const click=selector=>document.querySelector(selector).dispatchEvent(new MouseEvent('click',{detail:1,bubbles:true}));
    click('.lobby-next');click('.lobby-next');click('.lobby-back');click('.lobby-back');click('.lobby-next');
  });
  await expect(page.locator('.race-lobby')).toHaveAttribute('data-stage','2');
  expect(await page.locator('.lobby-exit').count()).toBeLessThanOrEqual(1);
  const duplicates=await page.locator('[id]').evaluateAll(nodes=>nodes.map(n=>n.id).filter((id,i,ids)=>ids.indexOf(id)!==i));expect(duplicates).toEqual([]);
  await expect.poll(()=>finiteMotion(page)).toBe(0);await expect(page.locator('.lobby-exit')).toHaveCount(0);
  await page.keyboard.press('Escape');await expect(page.locator('.race-lobby')).toHaveAttribute('data-stage','1');expect(await finiteMotion(page)).toBe(0);
  await page.evaluate(()=>document.querySelector('.lobby-next').dispatchEvent(new MouseEvent('click',{detail:1,bubbles:true})));
  await page.emulateMedia({reducedMotion:'reduce'});await expect.poll(()=>finiteMotion(page)).toBe(0);await expect(page.locator('.lobby-exit')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the launch cover survives loading and only reveals a rendered circuit before free driving',async({page})=>{
  test.setTimeout(120000);await page.setViewportSize({width:960,height:640});
  let release;const gate=new Promise(resolve=>release=resolve);
  await page.route('**/models/circuit034/gameplay.json',async route=>{await gate;await route.continue();});
  await page.addInitScript(()=>{
    window.entryStates=[];
    new MutationObserver(()=>{const cover=document.querySelector('.race-entry-cover'),app=document.querySelector('.flight-app');if(cover&&app)window.entryStates.push({cover:cover.dataset.phase,phase:app.dataset.phase,ready:app.dataset.ready});}).observe(document,{subtree:true,attributes:true,attributeFilter:['data-phase','data-ready']});
  });
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/simulator.html');
  for(const name of ['Jugar','Confirmar Zud','Confirmar nave'])await page.getByRole('button',{name,exact:true}).click();
  await page.getByRole('button',{name:'Volar',exact:true}).click();
  const cover=page.locator('.race-entry-cover'),app=page.locator('.flight-app');
  try{
    await expect(cover).toHaveAttribute('data-phase','loading');await expect(cover).toHaveCSS('position','fixed');
    await expect(app).toHaveAttribute('data-ready','false');await expect(app).toHaveAttribute('data-phase','loading');
    await expect(cover.getByRole('progressbar')).toBeVisible();
  }finally{release();}
  await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});await expect(cover).toHaveCount(0);
  expect(await page.evaluate(()=>window.entryStates.some(s=>s.cover==='revealing'&&s.phase==='loading'&&s.ready==='false'))).toBe(true);
  await expect(page.locator('.flight-countdown')).toHaveCount(0);await expect(app).toHaveAttribute('data-phase','flying',{timeout:15000});
  expect(errors).toEqual([]);
});

test('a failed load removes the transition and leaves retry accessible',async({page})=>{
  test.setTimeout(60000);await page.setViewportSize({width:320,height:640});await page.emulateMedia({reducedMotion:'reduce'});
  await page.route('**/models/circuit034/gameplay.json',route=>route.fulfill({status:503,body:'Unavailable'}));
  await page.goto('/simulator.html');
  for(const name of ['Jugar','Confirmar Zud','Confirmar nave','Volar'])await page.getByRole('button',{name,exact:true}).click();
  await expect(page.getByRole('button',{name:'Reintentar',exact:true})).toBeVisible({timeout:45000});
  await expect(page.locator('.race-entry-cover')).toHaveCount(0);await expect.poll(()=>finiteMotion(page)).toBe(0);
});
