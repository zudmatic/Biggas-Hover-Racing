import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {shipConfig,shipUrl,shipCanopy,prepareShipModel} from '../src/ship-catalog.js';

test('Bulldog already faces +Z and has its own hull, nozzles, eye headlights and parts',()=>{
  const config=shipConfig('039'),root=new THREE.Group(),nose=new THREE.Object3D();nose.position.set(0,1.5,2.5);root.add(nose);prepareShipModel(root,config);
  expect(nose.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([0,1.5,2.5]);
  expect(shipUrl('039','/game/')).toBe('/game/models/spaceship/bulldog-039.glb');expect(shipCanopy(root,config)).toBeNull();
  expect(config.exhausts).toHaveLength(3);expect(config.headlights).toHaveLength(2);expect(config.lampName).toBeUndefined();
  for(const [name,part] of [['LOD0_01_•_Monocoque_and_empty_cockpit_3','cockpit'],['LOD0_02_•_Bulldog_nose_and_facial_bodywork_1','lights'],['Candidate_circular_convex_eye_lens_-1','lights'],['Candidate_circular_convex_eye_lens_1','lights'],['LidCaps_L','lights'],['LidCaps_R_1','lights'],['Candidate_thin_curved_tongue_editable_surface_2','lights'],['Soft_tapered_tongue_groove_tone','lights'],['LOD0_03_•_Tall_aerodynamic_canine_ears_2','guards'],['LOD0_04_•_Side_armor,_intakes_and_service_details_1','cooling'],['LOD0_05_•_Paw_skids_and_racing_winglets_4','landing'],['LOD0_06_•_Rear_thruster_and_auxiliary_exhausts_7','engines'],['LOD0_07_•_Elevated_rear_racing_spoiler_1','mast'],['LOD0_09_•_Reference_side_rail_and_service_assemblies_2','hull']])expect(config.classify(name),name).toBe(part);
  expect(config.parts.every(part=>!part.split)).toBe(true);
});

test('Bulldog lights its baked toon bands for the comic shader and keeps unlit eyes, with every pilot',async({page})=>{
  test.setTimeout(90000);await page.goto('/');
  const results=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {createFlightShip}=await import('/src/flight-ship.js');const {createComicStyle,createComicMaterials}=await import('/src/comic-tsl-material.js');const results=[];
    for(const pilot of ['zud','zudmatic','ajo']){
      const ship=await createFlightShip('039',{pilot});ship.update(0,0,false,true);
      // Batched hull plus the live face rig (lenses, lids, tongue); pilot and flames are not the ship.
      const authored=new Map(),pilotParts=new Set();for(const part of [ship.pilot.root,...ship.exhaust.jets.map(jet=>jet.group)])part.traverse(o=>pilotParts.add(o));ship.root.traverse(m=>{if(m.isMesh&&!pilotParts.has(m))authored.set(m,m.material);});
      const comic=createComicMaterials(ship.root,createComicStyle());comic.setEnabled(true);
      const surfaces=[...authored].map(([mesh,source])=>({name:source.name,unlit:!!source.isMeshBasicMaterial,color:source.color.getHexString(),map:source.map?.image?.width??0,uv:!!mesh.geometry.attributes.uv,printed:!!mesh.material.isNodeMaterial,printedMap:mesh.material.map===source.map}));
      comic.dispose();
      const short=ship.exhaust.jets[1].group.scale.z;for(let i=1;i<=60;i++)ship.update(i/60,50,true,false);const long=ship.exhaust.jets[1].group.scale.z;
      const pilotBox=new THREE.Box3().setFromObject(ship.pilot.root);ship.root.updateMatrixWorld(true);
      results.push({pilot,surfaces,short,long,offset:ship.pilot.root.position.toArray(),pilotTop:pilotBox.max.y,pilotCenterZ:(pilotBox.min.z+pilotBox.max.z)/2});ship.dispose();
    }
    return results;
  });
  for(const r of results){
    // 31 authored materials: 30 toon bands across 11 families, plus the eyes.
    const eyes=r.surfaces.filter(s=>s.name==='Toon_new_eyes_graphic_unlit'),body=r.surfaces.filter(s=>!eyes.includes(s));
    expect(eyes).toHaveLength(2);for(const eye of eyes)expect(eye).toMatchObject({unlit:true,map:2048,uv:true,printed:false});
    expect(new Set(body.map(s=>s.name)).size).toBe(11);expect(body.every(s=>s.printed&&!s.unlit&&!/toon/.test(s.name))).toBe(true);
    // Band 2 is the albedo, e.g. the graphite shell of the earlier textured export.
    expect(body.find(s=>s.name==='Graphite painted shell').color).toBe(new THREE.Color().setRGB(.043233636766672134,.05087608844041824,.059253521263599396).getHexString());
    expect(r.long).toBeGreaterThan(r.short*2);expect(r.offset).toEqual(shipConfig('039').pilotOffset);
    // Seated between the steering wheel (z -0.31) and the bucket seat back (z -1.34).
    expect(r.pilotTop).toBeGreaterThan(2.3);expect(r.pilotCenterZ).toBeLessThan(-.3);expect(r.pilotCenterZ).toBeGreaterThan(-1.34);
  }
});

test('Bulldog hangar shows all 108 primitives, its turbine and no canopy controls',async({page})=>{
  test.setTimeout(90000);await page.setViewportSize({width:1200,height:900});await page.emulateMedia({reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/spaceship.html?vehicle=039&pilot=zudmatic');const stage=page.locator('.ship-viewport');await expect(stage).toHaveAttribute('data-ready','true',{timeout:60000});await expect(stage).toHaveAttribute('data-mesh-count','108');
  await expect(page.getByRole('link',{name:'DESCARGAR GLB'})).toHaveAttribute('href',/bulldog-039.glb$/);await expect(page.locator('#ship-canopy')).toBeHidden();
  await page.locator('[data-part="engines"]').click();await expect(page.locator('#ship-description')).toHaveText('Turbina y escapes');await page.getByLabel('Desarmar',{exact:true}).check();await expect(stage).toHaveAttribute('data-exploded','1.00');
  await page.getByRole('button',{name:'Restablecer vista y nave'}).click();await page.getByLabel('Zudmatic al mando',{exact:true}).check();await page.screenshot({path:'.context/bulldog-hangar.png'});expect(errors).toEqual([]);
});

test('Bulldog is the fifth vehicle in the lobby and flies Mario Raceway',async({page})=>{
  test.setTimeout(150000);await page.setViewportSize({width:1100,height:800});await page.emulateMedia({reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?pilot=ajo&map=mario-raceway&mode=free');await page.getByRole('button',{name:'Jugar',exact:true}).click();await page.getByRole('button',{name:'Confirmar Ajo',exact:true}).click();
  await page.locator('[data-vehicle-choice="033"]').focus();await page.keyboard.press('End');await page.keyboard.press('ArrowLeft');const lobby=page.locator('.race-lobby'),canvas=page.locator('.lobby-preview-canvas');
  await expect(lobby).toHaveAttribute('data-vehicle','039');await expect(page.locator('[data-screen="2"] .lobby-section-title>span')).toHaveText('05 / 09');await expect(canvas).toHaveAttribute('data-ready','true',{timeout:60000});
  const img=page.locator('[data-vehicle-choice="039"] img');await expect(img).toHaveAttribute('src',/039-paper.png$/);await expect.poll(()=>img.evaluate(i=>i.complete&&i.naturalWidth>0)).toBe(true);
  await page.screenshot({path:'.context/bulldog-selection.png'});await page.getByRole('button',{name:'Confirmar nave',exact:true}).click();await page.getByRole('button',{name:'Volar',exact:true}).click();
  const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});await expect(app).toHaveAttribute('data-vehicle','039');await expect(app).toHaveAttribute('data-phase','flying',{timeout:15000});
  await page.keyboard.press('KeyF');await expect(app).toHaveAttribute('data-headlights','true');
  await page.keyboard.down('ShiftLeft');await expect.poll(async()=>Number(await app.getAttribute('data-speed')),{timeout:15000}).toBeGreaterThan(20);await page.keyboard.up('ShiftLeft');await page.screenshot({path:'.context/bulldog-flight.png'});expect(errors).toEqual([]);
});
