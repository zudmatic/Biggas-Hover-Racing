import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {SHIPS,shipConfig,shipUrl} from '../src/ship-catalog.js';
import {createHoverState,advanceHover} from '../src/circuit-physics.js';
import {createCityCollision} from '../src/circuit-collision.js';
import {createCircuitLighting} from '../src/circuit-lighting.js';

test('Oliva uses its own parts, outlets and front light, with safe fallback',()=>{
  const config=shipConfig('037');expect(config).toBe(SHIPS['037']);expect(shipConfig('unknown').id).toBe('033');expect(shipUrl('037','/house/')).toBe('/house/models/spaceship/oliva-037.glb');
  for(const [name,part] of [['Alerón_transversal_marfil','mast'],['Tobera_central_interior','engines'],['Parabrisas_ahumado','cockpit'],['Toma_frontal_carcasa','lights'],['Conducto_longitudinal','cooling']])expect(config.classify(name,name.includes('Parabrisas'))).toBe(part);
  const scene=new THREE.Scene();scene.background=new THREE.Color();scene.fog=new THREE.Fog(0,1,100);const lights=createCircuitLighting(scene,{headlightMounts:config.headlights});
  lights.update({x:0,y:0,z:0,yaw:0,pitch:0},0,{reducedMotion:true});expect(lights.headlights).toHaveLength(1);expect(lights.headlights[0].position.toArray()).toEqual([0,1.29,2.79]);expect(lights.headlights[0].intensity).toBe(0);lights.setHeadlights(true);lights.update({x:0,y:0,z:0,yaw:0,pitch:0},0,{reducedMotion:true});expect(lights.headlights[0].intensity).toBeGreaterThan(0);lights.dispose();
});

test('hangar Oliva keeps its textured parts, pilot, animation and game link',async({page})=>{
  test.setTimeout(90000);await page.setViewportSize({width:1100,height:800});await page.emulateMedia({reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/spaceship.html');await page.getByRole('link',{name:'Oliva 037',exact:true}).click();const stage=page.locator('.ship-viewport');await expect(stage).toHaveAttribute('data-ready','true',{timeout:60000});await expect(stage).toHaveAttribute('data-vehicle','037');await expect(stage).toHaveAttribute('data-mesh-count','277');
  await expect(page.getByRole('link',{name:'DESCARGAR GLB'})).toHaveAttribute('href',/oliva-037.glb$/);await page.getByLabel('Ocultar parabrisas',{exact:true}).check();await expect(stage).toHaveAttribute('data-canopy-hidden','true');await page.getByLabel('Zud al mando',{exact:true}).check();await expect(stage).toHaveAttribute('data-pilot','true');
  await page.locator('[data-part="engines"]').click();await expect(page.locator('#ship-description')).toHaveText('Tres propulsores');await page.getByLabel('Desarmar',{exact:true}).check();await expect(stage).toHaveAttribute('data-exploded','1.00');await page.getByLabel('Tiempo de la animación').fill('8');await expect(stage).toHaveAttribute('data-altitude','1.150');await page.getByRole('button',{name:'Restablecer vista y nave'}).click();await expect(stage).toHaveAttribute('data-vehicle','037');
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);await page.getByRole('link',{name:'Simulador de vuelo'}).click();await expect(page.locator('.race-lobby')).toHaveAttribute('data-vehicle','037');expect(errors).toEqual([]);
});

test('vehicle selection swaps previews safely, drives Oliva and preserves the choice on return',async({page})=>{
  test.setTimeout(150000);await page.setViewportSize({width:960,height:640});await page.emulateMedia({reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/simulator.html');await page.getByRole('button',{name:'Jugar',exact:true}).click();await page.getByRole('button',{name:'Confirmar Zud',exact:true}).click();
  const lobby=page.locator('.race-lobby'),canvas=page.locator('.lobby-preview-canvas');await expect(page.locator('[data-screen="2"] .is-locked')).toHaveCount(7);await page.locator('[data-vehicle-choice="033"]').focus();await page.keyboard.press('ArrowRight');await expect(lobby).toHaveAttribute('data-vehicle','037');await page.keyboard.press('ArrowLeft');await expect(lobby).toHaveAttribute('data-vehicle','033');await page.keyboard.press('ArrowRight');
  await expect(canvas).toHaveAttribute('data-vehicle','037');await expect(canvas).toHaveAttribute('data-ready','true',{timeout:60000});await expect(page.getByRole('button',{name:'Oliva 037, seleccionado'})).toHaveAttribute('aria-pressed','true');await expect(page.locator('[data-vehicle-choice="037"] img')).toHaveAttribute('src',/037-paper.png$/);
  await page.getByRole('button',{name:'Papel',exact:true}).click();await expect(canvas).toHaveAttribute('data-paper','false');await expect(page.locator('[data-vehicle-choice="037"] img')).toHaveAttribute('src',/037.png$/);await page.getByRole('button',{name:'Papel',exact:true}).click();
  await page.getByRole('button',{name:'Confirmar nave',exact:true}).click();await expect(page.locator('.lobby-team')).toContainText('037');await page.locator('.lobby-map-card:has(input[value=nexus])').click();await page.getByRole('button',{name:'Volar',exact:true}).click();
  const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});await expect(app).toHaveAttribute('data-vehicle','037');await expect(app).toHaveAttribute('data-headlights','false');await expect(app).toHaveAttribute('data-comic','true');await page.keyboard.press('KeyF');await expect(app).toHaveAttribute('data-headlights','true');await page.keyboard.press('KeyF');
  await page.keyboard.down('ShiftLeft');await expect.poll(async()=>Number(await app.getAttribute('data-speed')),{timeout:15000}).toBeGreaterThan(20);await page.keyboard.up('ShiftLeft');await page.screenshot({path:'.context/oliva-nexus.png'});await page.keyboard.press('Escape');await page.getByRole('link',{name:'Zud × Oliva 037 Cambiar selección'}).click();await expect(lobby).toHaveAttribute('data-vehicle','037');expect(new URL(page.url()).searchParams.get('vehicle')).toBe('037');expect(errors).toEqual([]);
});

test('flight meshes preserve Oliva UVs and toggle only the headlamp emissions',async({page})=>{
  test.setTimeout(60000);await page.goto('/simulator.html');
  const info=await page.evaluate(async()=>{
    const {createFlightShip}=await import('/src/flight-ship.js');const results=[];
    for(const id of ['033','037']){
      const ship=await createFlightShip(id);ship.update(0,0,false,true);const lamps=[],textures=[],plumes=[];
      ship.root.traverse(mesh=>{if(!mesh.isMesh)return;if(mesh.material.userData.headlight)lamps.push(mesh.material);if(/pintura|seguridad|oliva militar/.test(mesh.material.name))textures.push({map:!!mesh.material.map,uv:!!mesh.geometry.attributes.uv});});
      plumes.push(...ship.exhaust.jets.map(j=>j.group.position.toArray()));
      const off=lamps.map(m=>m.emissiveIntensity);ship.setHeadlights(true);const on=lamps.map(m=>m.emissiveIntensity);ship.setHeadlights(false);
      results.push({id,textures,plumes,off,on,again:lamps.map(m=>m.emissiveIntensity),pilot:ship.pilot.root.visible});ship.dispose();
    }return results;
  });
  expect(info[1].textures).toHaveLength(3);expect(info[1].textures.every(item=>item.map&&item.uv)).toBe(true);expect(info[1].plumes).toHaveLength(3);expect(info[0].plumes).toHaveLength(2);
  for(const ship of info){expect(ship.pilot).toBe(true);expect(ship.off.length).toBeGreaterThan(0);expect(ship.off.every(n=>n===0)).toBe(true);expect(ship.on.some(n=>n>0)).toBe(true);expect(ship.again.every(n=>n===0)).toBe(true);}
});

test('Oliva also runs a Ruinas race and survives restart',async({page})=>{
  test.setTimeout(90000);await page.setViewportSize({width:960,height:640});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/simulator.html?vehicle=037&map=ruins');
  for(const name of ['Jugar','Confirmar Zud','Confirmar nave'])await page.getByRole('button',{name,exact:true}).click();await page.locator('.lobby-mode label:has(input[value=race])').click();await page.getByRole('button',{name:'Correr',exact:true}).click();
  const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});await expect(app).toHaveAttribute('data-vehicle','037');await expect(app).toHaveAttribute('data-phase','flying',{timeout:10000});await page.keyboard.down('KeyW');await expect.poll(async()=>Number(await app.getAttribute('data-speed')),{timeout:15000}).toBeGreaterThan(8);await page.keyboard.up('KeyW');await page.keyboard.press('Escape');await page.locator('#flight-restart').click();await expect(app).toHaveAttribute('data-vehicle','037');await expect(app).toHaveAttribute('data-map','ruins');await expect(app).toHaveAttribute('data-headlights','false');
});


test('the wider Oliva hull meets parapets and city walls before the 033',()=>{
  const track={spawn:{x:-4.1,y:.65,z:0},yaw:0,height:()=>0,roadAt:(x,z)=>({x:0,y:0,z,nx:0,nz:1,width:12,offset:-x,grade:0,distanceToRoad:0})};
  const classic=createHoverState(track),oliva={...createHoverState(track),hull:SHIPS['037'].hull};
  advanceHover(classic,{},1/60,track);advanceHover(oliva,{},1/60,track);expect(classic.wallHit).toBe(false);expect(oliva.wallHit).toBe(true);expect(Math.abs(oliva.x)).toBeLessThan(Math.abs(classic.x));
  const root=new THREE.Group(),material=new THREE.MeshBasicMaterial();
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(30,30),material);floor.rotation.x=-Math.PI/2;floor.name='COL_ENV_TERRAIN_CITY';root.add(floor);
  const wall=new THREE.Mesh(new THREE.BoxGeometry(.3,6,20),material);wall.position.set(3,3,0);wall.name='COL_BUILDING';root.add(wall);const collision=createCityCollision(root);
  Object.assign(classic,{x:1.4,z:0});Object.assign(oliva,{x:1.4,z:0});collision.step(classic,1/60,track,{x:1.4,z:0});collision.step(oliva,1/60,track,{x:1.4,z:0});
  expect(classic.wallHit).toBe(false);expect(oliva.wallHit).toBe(true);expect(oliva.x).toBeLessThan(classic.x);floor.geometry.dispose();wall.geometry.dispose();material.dispose();
});
