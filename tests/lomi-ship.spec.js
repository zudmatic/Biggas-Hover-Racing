import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {shipConfig,shipUrl,shipCanopy,prepareShipModel} from '../src/ship-catalog.js';

test('Lomi 040 sits on the grid, faces +Z and classifies its five groups',()=>{
  const config=shipConfig('040'),root=new THREE.Group(),keel=new THREE.Object3D();keel.position.set(0,-1.55,4.686);root.add(keel);prepareShipModel(root,config);
  const nose=keel.getWorldPosition(new THREE.Vector3());expect(nose.x).toBeCloseTo(0);expect(nose.y).toBeCloseTo(0);expect(nose.z).toBeCloseTo(2.812,3);
  expect(shipUrl('040','/game/')).toBe('/game/models/spaceship/lomi-040.glb');expect(shipCanopy(root,config)).toBeNull();
  expect(config.engine).toBe('singularity');expect(config.exhausts).toHaveLength(2);expect(config.headlights).toHaveLength(2);expect(config.lampName).toBeUndefined();
  expect(config.parts.map(part=>part.id)).toEqual(['cockpit','engines','mast','hull','cooling']);
  for(const [name,part] of [['Lomi_Ship_Seat','cockpit'],['Lomi_Ship_SeatBack','cockpit'],['Lomi_Ship_Footrest','cockpit'],['Lomi_Ship_Thrust_L','engines'],['Lomi_Ship_Thrust_R','engines'],['Lomi_Ship_Crystals_R','mast'],['Lomi_Ship_CrystalWing_L','cooling'],['Lomi_Ship_Hull','hull']])expect(config.classify(name),name).toBe(part);
  for(const name of ['Lomi_Ship_Crystals_L','Lomi_Ship_CrystalWing_R','Lomi_Ship_Thrust_R','Lomi_Ship_Exhaust_Left','Lomi_Ship_Exhaust_Right'])expect(config.liveNodes.test(name),name).toBe(true);
  expect(config.liveNodes.test('Lomi_Ship_Hull')).toBe(false);expect(config.liveNodes.test('Lomi_Ship_Seat')).toBe(false);
});

test('Lomi 040 keeps its keel on y=0, seats other pilots without its own rig and bakes plasma onto the live crystals',async({page})=>{
  test.setTimeout(120000);await page.goto('/');
  const results=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {createFlightShip}=await import('/src/flight-ship.js');const results=[];
    for(const pilot of ['zud','zudmatic','ajo']){
      const ship=await createFlightShip('040',{pilot,exhaust:false});ship.update(0,0,false,true);ship.root.updateMatrixWorld(true);
      const pilotParts=new Set();ship.pilot.root.traverse(o=>pilotParts.add(o));
      const hull=new THREE.Box3(),crystals=[],ribbons=[];let nozzles=0,flames=0;
      ship.root.traverse(m=>{
        if(!m.isMesh||pilotParts.has(m))return;
        if(m.parent===ship.plasma.root){ribbons.push({vertices:m.geometry.getAttribute('position').count,node:!!m.material.isNodeMaterial,depthWrite:m.material.depthWrite});return;}
        hull.expandByObject(m);
        if(m.userData.shader==='lomi_ship_crystal')crystals.push({edge:m.geometry.getAttribute('aEdge')?.itemSize,along:m.geometry.getAttribute('aAlong')?.itemSize,orbit:m.geometry.getAttribute('aOrbit')?.itemSize,node:!!m.material.isNodeMaterial});
        if(m.userData.shader==='lomi_ship_thrust'&&m.material.color?.getHex()===0)nozzles++;
        if(m.geometry.type==='ConeGeometry'||m.geometry.type==='LatheGeometry')flames++;
      });
      const pilotBox=new THREE.Box3().setFromObject(ship.pilot.root);
      const u=ship.plasma.uniforms,idle=u.emission.value;ship.update(1,0,false,false);const phase=u.phase.value;
      ship.plasma.update({level:1,surge:0,speed:1.38,boost:1,bend:new THREE.Vector3(),time:2},1/60);
      results.push({pilot,rig:!!ship.root.getObjectByName('Lomi_Pilot_Rig'),hullMin:hull.min.toArray(),hullMax:hull.max.toArray(),pilotMin:pilotBox.min.toArray(),pilotMax:pilotBox.max.toArray(),offset:ship.pilot.root.position.toArray(),crystals,nozzles,flames,ribbons,anchors:ship.anchors.map(a=>a.name),idle,phase,turbo:{emission:u.emission.value,burst:u.burst.value,length:u.tongue.value.x}});
      ship.dispose();
    }
    return results;
  });
  for(const r of results){
    expect(r.rig).toBe(false);expect(r.hullMin[1]).toBeCloseTo(0,1);expect(r.hullMax[2]).toBeCloseTo(2.81,1);expect(r.hullMin[2]).toBeCloseTo(-2.79,1);expect(r.hullMax[0]).toBeCloseTo(2.24,1);
    expect(r.offset).toEqual(shipConfig('040').pilotOffset);expect(r.pilotMin[1]).toBeGreaterThan(1.03);expect(r.pilotMin[1]).toBeLessThan(1.2);expect(r.pilotMax[1]).toBeGreaterThan(2.2);
    const centerZ=(r.pilotMin[2]+r.pilotMax[2])/2;expect(centerZ).toBeGreaterThan(-.45);expect(centerZ).toBeLessThan(.05);
    expect(r.crystals).toHaveLength(4);for(const crystal of r.crystals)expect(crystal).toEqual({edge:3,along:1,orbit:2,node:true});
    expect(r.nozzles).toBe(2);expect(r.flames).toBe(0);expect(r.anchors).toEqual(['Lomi_Ship_Exhaust_Left','Lomi_Ship_Exhaust_Right']);
    expect(r.ribbons).toEqual([{vertices:8*21*2,node:true,depthWrite:false},{vertices:6*49*2,node:true,depthWrite:false}]);
    expect(r.idle).toBeCloseTo(.7,5);expect(r.phase).toBeGreaterThan(0);
    expect(r.turbo.emission).toBeCloseTo(2.8,5);expect(r.turbo.burst).toBe(1);expect(r.turbo.length).toBeCloseTo(2.6,5);
  }
});

test('Lomi flies 040 in its own seated rig, looping LookAround at the authored pose',async({page})=>{
  test.setTimeout(60000);await page.goto('/');
  const r=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');const {createFlightShip}=await import('/src/flight-ship.js');
    const ship=await createFlightShip('040',{pilot:'lomi',exhaust:false}),actor=ship.pilot.actor,head=time=>{ship.update(time,0,false,true);return actor.bones.head.quaternion.clone();};
    const moves=head(0).angleTo(head(1)),loops=head(1).angleTo(head(5));ship.update(0,0,false,true);ship.root.updateMatrixWorld(true);
    const box=new THREE.Box3();for(const mesh of actor.meshes)box.expandByObject(mesh,true);const rigs=[];ship.root.traverse(o=>{if(o.name==='Lomi_Pilot_Rig')rigs.push(o);});
    const result={pelvis:actor.bones.pelvis.getWorldPosition(new THREE.Vector3()).toArray(),min:box.min.toArray(),max:box.max.toArray(),moves,loops,rigs:rigs.length,live:rigs[0]===actor.model&&actor.model.parent===ship.pilot.root&&ship.pilot.root.parent===ship.root,
      meshes:actor.meshes.map(m=>({name:m.name,skinned:m.isSkinnedMesh,culled:m.frustumCulled,bones:m.skeleton.bones.length,own:m.skeleton.bones.includes(actor.bones.pelvis)}))};
    ship.dispose();result.detached=ship.pilot.root.parent===null;return result;
  });
  expect(r.pelvis[0]).toBeCloseTo(0,3);expect(r.pelvis[1]).toBeCloseTo(1.074,3);expect(r.pelvis[2]).toBeCloseTo(-.372,3);
  for(const [value,expected] of [[r.min,[-.267,.915,-.72]],[r.max,[.267,1.77,-.141]]])value.forEach((v,i)=>expect(v).toBeCloseTo(expected[i],2));
  expect(r.rigs).toBe(1);expect(r.live).toBe(true);expect(r.detached).toBe(true);
  expect(r.meshes).toEqual(['Lomi_Pilot_Character_Mesh','Lomi_Pilot_Character_Mesh_1','Lomi_Pilot_Hair','Lomi_Pilot_Head'].map(name=>({name,skinned:true,culled:false,bones:24,own:true})));
  expect(r.moves).toBeGreaterThan(.1);expect(r.loops).toBeLessThan(1e-6);
});

test('Lomi hangar shows ten meshes in five groups with no canopy controls',async({page})=>{
  test.setTimeout(90000);await page.setViewportSize({width:1200,height:900});await page.emulateMedia({reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/spaceship.html?vehicle=040&pilot=ajo');const stage=page.locator('.ship-viewport');await expect(stage).toHaveAttribute('data-ready','true',{timeout:60000});await expect(stage).toHaveAttribute('data-mesh-count','10');
  await expect(page.locator('.ship-panel-top span')).toHaveText('05');await expect(page.locator('.ship-part')).toHaveCount(5);
  await expect(page.getByRole('link',{name:'DESCARGAR GLB'})).toHaveAttribute('href',/lomi-040.glb$/);await expect(page.locator('#ship-canopy')).toBeHidden();
  await page.locator('[data-part="engines"]').click();await expect(page.locator('#ship-description')).toHaveText('Toberas y singularidades');await page.getByLabel('Desarmar',{exact:true}).check();await expect(stage).toHaveAttribute('data-exploded','1.00');
  await page.getByRole('button',{name:'Restablecer vista y nave'}).click();await page.getByLabel('Ajo al mando',{exact:true}).check();await expect(stage).toHaveAttribute('data-pilot','true');await page.screenshot({path:'.context/lomi-hangar.png'});
  await page.goto('/spaceship.html?vehicle=040&pilot=lomi');await expect(stage).toHaveAttribute('data-ready','true',{timeout:60000});await expect(stage).toHaveAttribute('data-mesh-count','10');
  await page.getByLabel('Lomi al mando',{exact:true}).check();await expect(stage).toHaveAttribute('data-pilot','true');await page.screenshot({path:'.context/lomi-hangar-lomi.png'});expect(errors).toEqual([]);
});

test('Lomi 040 is the last vehicle in the lobby and flies Mario Raceway on the singularity engine',async({page})=>{
  test.setTimeout(150000);await page.setViewportSize({width:1100,height:800});await page.emulateMedia({reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/?pilot=zudmatic&map=mario-raceway&mode=free');await page.getByRole('button',{name:'Jugar',exact:true}).click();await page.getByRole('button',{name:'Confirmar Zudmatic',exact:true}).click();
  await page.locator('[data-vehicle-choice="037"]').focus();await page.keyboard.press('End');const lobby=page.locator('.race-lobby'),canvas=page.locator('.lobby-preview-canvas');
  await expect(lobby).toHaveAttribute('data-vehicle','040');await expect(page.locator('[data-screen="2"] .lobby-section-title>span')).toHaveText('05 / 09');await expect(canvas).toHaveAttribute('data-ready','true',{timeout:60000});await expect(canvas).toHaveAttribute('data-vehicle','040');
  const img=page.locator('[data-vehicle-choice="040"] img');await expect(img).toHaveAttribute('src',/040-paper.png$/);await expect.poll(()=>img.evaluate(i=>i.complete&&i.naturalWidth>0)).toBe(true);
  await page.screenshot({path:'.context/lomi-selection.png'});await page.getByRole('button',{name:'Confirmar nave',exact:true}).click();await page.getByRole('button',{name:'Volar',exact:true}).click();
  const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:120000});await expect(app).toHaveAttribute('data-vehicle','040');await expect(app).toHaveAttribute('data-phase','flying',{timeout:15000});
  await expect(app).toHaveAttribute('data-boost-palette','Azul');
  await page.keyboard.press('KeyF');await expect(app).toHaveAttribute('data-headlights','true');
  await page.keyboard.down('ShiftLeft');await expect.poll(async()=>Number(await app.getAttribute('data-speed')),{timeout:15000}).toBeGreaterThan(20);
  // Reduced motion freezes the engine (as it hides the flame engines), so turbo never bursts here;
  // the WebGL2 test below drives it without that media query. No particle layer ever emits.
  await expect(app).toHaveAttribute('data-boost-palette','Azul');
  expect(JSON.parse(await app.getAttribute('data-boost-particles'))).toEqual({lifetimes:[0,0,0],emitted:[0,0,0]});
  await page.keyboard.up('ShiftLeft');await page.screenshot({path:'.context/lomi-flight.png'});expect(errors).toEqual([]);
});

test('Lomi 040 flies Mario Raceway on the WebGL2 backend',async({page})=>{
  test.setTimeout(240000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/simulator.html?selection=map&renderer=webgl2&map=mario-raceway&vehicle=040&camera=klipp&pilot=zud');
  await page.getByRole('button',{name:'Volar',exact:true}).click();const app=page.locator('.flight-app');
  await expect(app).toHaveAttribute('data-ready','true',{timeout:120000});await expect(app).toHaveAttribute('data-backend','WebGL2');await expect(app).toHaveAttribute('data-phase','flying');
  await page.locator('.flight-canvas').focus();await page.keyboard.down('KeyW');await page.keyboard.down('ShiftLeft');
  await expect.poll(async()=>Number(await app.getAttribute('data-speed')),{timeout:45000}).toBeGreaterThan(20);await expect(app).toHaveAttribute('data-boost-palette','Ráfaga',{timeout:15000});
  for(const key of ['KeyW','ShiftLeft'])await page.keyboard.up(key);
  const before=Number(await app.getAttribute('data-frame'));await expect.poll(async()=>Number(await app.getAttribute('data-frame')),{timeout:15000}).toBeGreaterThan(before+5);
  await page.screenshot({path:'.context/lomi-flight-webgl2.png'});expect(errors).toEqual([]);
});

test('Lomi hangar drives the racing singularities during flight and respects reduced motion',async({page})=>{
  test.setTimeout(90000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/spaceship.html?vehicle=040&renderer=webgl2');const stage=page.locator('.ship-viewport');
  await expect(stage).toHaveAttribute('data-ready','true',{timeout:60000});await expect(stage).toHaveAttribute('data-engine','singularity');
  await page.getByRole('button',{name:'Atrás',exact:true}).click();await page.getByLabel('Tiempo de la animación').fill('8');
  await expect.poll(async()=>Number(await stage.getAttribute('data-engine-power'))).toBeGreaterThan(0);
  const power=await stage.getAttribute('data-engine-power'),frame=Number(await stage.getAttribute('data-frame'));
  await expect.poll(async()=>Number(await stage.getAttribute('data-frame'))).toBeGreaterThan(frame+2);await expect(stage).toHaveAttribute('data-engine-power',power);
  await page.getByRole('button',{name:'Iniciar vuelo',exact:true}).click();await expect.poll(async()=>Number(await stage.getAttribute('data-engine-power'))).toBeGreaterThan(Number(power));
  await page.getByRole('button',{name:'Pausar vuelo',exact:true}).click();await page.screenshot({path:'.context/hangar-lomi-propulsion.png'});
  await page.emulateMedia({reducedMotion:'reduce'});await expect(stage).toHaveAttribute('data-engine-power','0.000');
  await page.getByRole('button',{name:'Restablecer vista y nave'}).click();await expect(stage).toHaveAttribute('data-engine-power','0.000');expect(errors).toEqual([]);
});
