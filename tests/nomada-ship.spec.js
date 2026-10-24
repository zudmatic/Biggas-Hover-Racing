import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {shipConfig,shipUrl,shipCanopy,prepareShipModel} from '../src/ship-catalog.js';

test('Nómada follows the game axes and has its own hull, lamp, reactor and parts',()=>{
  const config=shipConfig('038'),root=new THREE.Group(),nose=new THREE.Object3D();nose.position.set(2.8,1,0);root.add(nose);prepareShipModel(root,config);
  const p=nose.getWorldPosition(new THREE.Vector3());expect(p.z).toBeCloseTo(2.8);expect(p.x).toBeCloseTo(0);expect(p.y).toBe(1);
  expect(shipUrl('038','/game/')).toBe('/game/models/spaceship/nomada-038.glb');expect(shipCanopy(root,config)).toBeNull();
  expect(config.hull.halfWidth).toBeLessThan(shipConfig('037').hull.halfWidth);expect(config.exhausts).toHaveLength(1);expect(config.headlights).toHaveLength(1);
  for(const [name,part] of [['Asiento_cuero_cojin_0','cockpit'],['Manillar tubular','cockpit'],['Nucleo reactor','engines'],['Bandera lona desgarrada','mast'],['Casco central blindado','hull'],['Deposito lateral acero','cooling'],['Estribo pie','landing'],['Bastidor asiento','guards'],['Cristal faro','lights']])expect(config.classify(name)).toBe(part);
});

test('both riders fit the saddle, keep their supports while turning and use the real textured model',async({page})=>{
  test.setTimeout(90000);await page.goto('/');
  const results=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');const {createFlightShip}=await import('/src/flight-ship.js');const results=[];
    for(const pilot of ['zud','zudmatic']){
      const ship=await createFlightShip('038',{pilot,palette:'Coral'});ship.update(0,0,false,true);ship.root.updateMatrixWorld(true);
      const actor=ship.pilot.actor,points=()=>{
        ship.root.updateMatrixWorld(true);
        return (pilot==='zud'?actor.rig.hands:[actor.bones.hand_L,actor.bones.hand_R]).map(hand=>ship.root.worldToLocal(hand.getWorldPosition(new THREE.Vector3())).toArray());
      },before=points(),plates=[],grips=[],textures=[],lamps=[],plumes=[];
      ship.root.traverse(m=>{if(!m.isMesh)return;if(m.name==='Estribo adaptado al piloto')plates.push(m);if(m.name==='Agarre de la Nómada')grips.push(m);if(m.material.map)textures.push(!!m.geometry.attributes.uv);if(m.material.userData.headlight)lamps.push(m.material);if(m.geometry.type==='ConeGeometry')plumes.push(m);});
      const materialOff=lamps.map(m=>m.emissiveIntensity);ship.setHeadlights(true);const materialOn=lamps.map(m=>m.emissiveIntensity);ship.setHeadlights(false);
      const short=ship.exhaust.jets[0].group.scale.z;for(let i=1;i<=60;i++)ship.update(i/60,50,true,false);const long=ship.exhaust.jets[0].group.scale.z;ship.update(0,0,false,true);
      ship.root.rotation.set(.2,1.2,-.3);ship.root.scale.setScalar(.75);ship.update(2,0,false,true);const after=points();
      const gripErrors=grips.map((g,i)=>new THREE.Vector3(...after[i]).distanceTo(ship.root.worldToLocal(g.getWorldPosition(new THREE.Vector3()))));
      const supportPositions=plates.map(m=>m.position.toArray());
      results.push({pilot,before,after,gripErrors,supportPositions,textures,materialOff,materialOn,materialAgain:lamps.map(m=>m.emissiveIntensity),short,long,fit:ship.pilot.root.userData.fit});ship.dispose();
    }return results;
  });
  for(const r of results){
    expect(r.fit).toBe('nomada');expect(r.textures.length).toBeGreaterThan(4);expect(r.textures.every(Boolean)).toBe(true);expect(r.materialOff).toEqual([0]);expect(r.materialOn[0]).toBeGreaterThan(0);expect(r.materialAgain).toEqual([0]);expect(r.long).toBeGreaterThan(r.short*2);
    r.before.forEach((p,i)=>p.forEach((n,j)=>expect(r.after[i][j]).toBeCloseTo(n,4)));expect(Math.max(...r.gripErrors)).toBeLessThan(.0001);
    expect(r.supportPositions).toHaveLength(2);for(const p of r.supportPositions){expect(Math.abs(p[0])).toBeGreaterThan(.22);expect(p[1]).toBeGreaterThan(.8);expect(p[1]).toBeLessThan(1.4);}
  }
});

for(const pilot of ['zud','zudmatic'])test(`Nómada hangar with ${pilot}: open saddle, parts and flight sequence`,async({page})=>{
  test.setTimeout(90000);await page.setViewportSize({width:1200,height:900});await page.emulateMedia({reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`/spaceship.html?vehicle=038&pilot=${pilot}`);const stage=page.locator('.ship-viewport');await expect(stage).toHaveAttribute('data-ready','true',{timeout:60000});await expect(stage).toHaveAttribute('data-mesh-count','378');
  await expect(page.getByRole('link',{name:'DESCARGAR GLB'})).toHaveAttribute('href',/nomada-038.glb$/);await expect(page.locator('#ship-canopy')).toBeHidden();await expect(page.locator('#ship-hide-canopy')).toBeHidden();
  await page.getByLabel(`${pilot==='zud'?'Zud':'Zudmatic'} al mando`,{exact:true}).check();await expect(stage).toHaveAttribute('data-pilot','true');await expect(stage).toHaveAttribute('data-canopy-hidden','false');
  await page.locator('[data-part="engines"]').click();await expect(page.locator('#ship-description')).toHaveText('Reactor único');await page.getByLabel('Desarmar',{exact:true}).check();await expect(stage).toHaveAttribute('data-exploded','1.00');
  await page.getByLabel('Tiempo de la animación').fill('8');await expect(stage).toHaveAttribute('data-altitude','1.150');await page.getByLabel('Tiempo de la animación').fill('18');await expect(stage).toHaveAttribute('data-altitude','0.000');
  await page.getByRole('button',{name:'Restablecer vista y nave'}).click();await page.getByLabel(`${pilot==='zud'?'Zud':'Zudmatic'} al mando`,{exact:true}).check();await page.locator('[data-ship-view="side"]').click();await page.screenshot({path:`.context/nomada-hangar-${pilot}.png`});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);await expect(page.getByRole('link',{name:'Nómada 038',exact:true})).toBeVisible();expect(errors).toEqual([]);
});

for(const [pilot,map,mode] of [['zud','nexus','free'],['zudmatic','ruins','race']])test(`Nómada is selectable and flies ${map} with ${pilot}`,async({page})=>{
  test.setTimeout(150000);await page.setViewportSize({width:1100,height:800});await page.emulateMedia({reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`/?pilot=${pilot}&map=${map}&mode=${mode}`);await page.getByRole('button',{name:'Jugar',exact:true}).click();await page.getByRole('button',{name:`Confirmar ${pilot==='zud'?'Zud':'Zudmatic'}`,exact:true}).click();
  await page.locator('[data-vehicle-choice="033"]').focus();await page.keyboard.press('End');const lobby=page.locator('.race-lobby'),canvas=page.locator('.lobby-preview-canvas');await expect(lobby).toHaveAttribute('data-vehicle','038');await expect(page.locator('[data-screen="2"] .lobby-section-title>span')).toHaveText('03 / 09');await expect(canvas).toHaveAttribute('data-ready','true',{timeout:60000});await expect(canvas).toHaveAttribute('data-vehicle','038');
  for(const paper of [true,false]){if(!paper)await page.getByRole('button',{name:'Papel',exact:true}).click();const img=page.locator('[data-vehicle-choice="038"] img');await expect(img).toHaveAttribute('src',paper?/038-paper.png$/:/038.png$/);await expect.poll(()=>img.evaluate(i=>i.complete&&i.naturalWidth>0)).toBe(true);}
  await page.screenshot({path:`.context/nomada-selection-${pilot}.png`});await page.getByRole('button',{name:'Confirmar nave',exact:true}).click();await page.getByRole('button',{name:'Volar',exact:true}).click();
  const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});await expect(app).toHaveAttribute('data-vehicle','038');await expect(app).toHaveAttribute('data-pilot',pilot);await expect(app).toHaveAttribute('data-phase','flying',{timeout:15000});await page.keyboard.press('KeyF');await expect(app).toHaveAttribute('data-headlights','true');
  await page.keyboard.down('ShiftLeft');await expect.poll(async()=>Number(await app.getAttribute('data-speed')),{timeout:15000}).toBeGreaterThan(20);await page.keyboard.up('ShiftLeft');await page.screenshot({path:`.context/nomada-flight-${pilot}.png`});await page.keyboard.press('Escape');await page.locator('#flight-restart').click();await expect(app).toHaveAttribute('data-vehicle','038');await expect(app).toHaveAttribute('data-map',map);
  await page.keyboard.press('Escape');await page.locator('.flight-team-link').click();await expect(lobby).toHaveAttribute('data-vehicle','038');await expect(lobby).toHaveAttribute('data-pilot',pilot);expect(errors).toEqual([]);
});
