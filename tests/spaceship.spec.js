import {test,expect} from '@playwright/test';
import {classifyShipPart,flightPose,FLIGHT_DURATION} from '../src/spaceship-parts.js';

test('named model parts and flight endpoints remain coherent',()=>{
  for(const [name,expected] of [['033_asa_naranja_lateral_derecha','guards'],['033_borda_interior_-1','cockpit'],['033_anillo_interior_negro','engines'],['033_apoyo_trasero','landing'],['033_mástil','mast'],['033_lámina_disipadora_derecha','cooling'],['033_hueco_faro_frontal','lights'],['033_desgaste_morro','hull']])expect(classifyShipPart(name)).toBe(expected);
  expect(classifyShipPart('033_marco_visor',true)).toBe('cockpit');
  expect(flightPose(0).altitude).toBe(0);expect(flightPose(0).power).toBe(0);
  expect(flightPose(8).altitude).toBeGreaterThan(1);expect(flightPose(8).power).toBe(1);
  expect(flightPose(FLIGHT_DURATION).altitude).toBe(0);expect(flightPose(FLIGHT_DURATION).power).toBe(0);
});

test('hangar loads the supplied model, inspects parts and animates without errors',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/spaceship.html');const stage=page.locator('.ship-viewport');
  await expect(stage).toHaveAttribute('data-ready','true');await expect(stage).toHaveAttribute('data-mesh-count','322');
  await expect(page.locator('.ship-part')).toHaveCount(8);
  await page.locator('[data-part="cockpit"]').click();
  await expect(stage).toHaveAttribute('data-selected','cockpit');
  await expect(page.getByLabel('Abrir cabina',{exact:true})).toBeChecked();
  await expect.poll(()=>stage.getAttribute('data-canopy')).toBe('1.00');
  await page.getByLabel('Desarmar',{exact:true}).check();await expect.poll(()=>stage.getAttribute('data-exploded')).toBe('1.00');
  await page.getByRole('button',{name:'Iniciar vuelo',exact:true}).click();
  await expect(stage).toHaveAttribute('data-playing','true');
  await expect(page.getByLabel('Abrir cabina',{exact:true})).not.toBeChecked();
  await expect(page.getByLabel('Desarmar',{exact:true})).not.toBeChecked();
  await page.getByRole('button',{name:'Pausar vuelo',exact:true}).click();await expect(stage).toHaveAttribute('data-playing','false');
  await page.getByLabel('Tiempo de la animación').fill('8');await expect(stage).toHaveAttribute('data-altitude','1.150');
  await expect(page.locator('#ship-phase')).toHaveText('VUELO ESTACIONARIO');
  await page.getByLabel('Tiempo de la animación').fill('18');await expect(stage).toHaveAttribute('data-altitude','0.000');
  await page.getByRole('button',{name:'Atrás',exact:true}).click();await expect(page.getByRole('button',{name:'Atrás',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Restablecer vista y nave'}).click();await expect(page.locator('#ship-phase')).toHaveText('EN HANGAR');
  await expect(stage).toHaveAttribute('data-selected','');
  await page.getByLabel('Etiquetas',{exact:true}).uncheck();await expect(page.locator('.ship-hotspot:visible')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('mobile hangar and reduced motion retain all controls',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/?view=spaceship');const stage=page.locator('.ship-viewport');await expect(stage).toHaveAttribute('data-ready','true');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await expect(stage).toHaveAttribute('data-playing','false');
  await page.locator('[data-part="engines"]').click();await expect(stage).toHaveAttribute('data-selected','engines');
  await expect(page.locator('#ship-description')).toHaveText('Propulsores gemelos');
  await page.getByLabel('Abrir cabina',{exact:true}).check();await expect(stage).toHaveAttribute('data-canopy','1.00');
  await page.getByRole('button',{name:'Restablecer vista y nave'}).click();await expect(stage).toHaveAttribute('data-canopy','0.00');
});

test('missing model presents a recoverable error',async({page})=>{
  await page.route('**/models/spaceship/zud-033.glb',route=>route.abort());
  await page.goto('/spaceship.html');await expect(page.locator('.ship-loader')).toContainText('No se pudo cargar la nave');
  await expect(page.getByRole('button',{name:'Reintentar'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Iniciar vuelo'})).toBeDisabled();
});

test('roof visibility and seated pilot survive flight, inspection and reset',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/spaceship.html');const stage=page.locator('.ship-viewport');await expect(stage).toHaveAttribute('data-ready','true');
  const hidden=page.getByLabel('Ocultar cabina',{exact:true}),pilot=page.getByLabel('Zud al mando',{exact:true}),open=page.getByLabel('Abrir cabina',{exact:true});
  await hidden.check();await expect(stage).toHaveAttribute('data-canopy-hidden','true');await expect(open).toBeDisabled();
  await hidden.uncheck();await expect(stage).toHaveAttribute('data-canopy-hidden','false');await expect(open).toBeEnabled();
  await pilot.check();await expect(stage).toHaveAttribute('data-pilot','true');await expect(hidden).toBeChecked();
  const fit=await page.evaluate(async()=>{
    const {createSpaceshipPilot}=await import('/src/spaceship-pilot.js');
    const THREE=await import('/node_modules/three/build/three.module.js');
    const driver=createSpaceshipPilot(),point=new THREE.Vector3(),soles=new THREE.Box3();driver.root.updateMatrixWorld(true);
    for(const hip of driver.actor.feet){const leg=hip.getObjectByName('Pierna'),vertices=leg.geometry.attributes.position;for(let i=0;i<vertices.count;i++){point.fromBufferAttribute(vertices,i).applyMatrix4(leg.matrixWorld);if(point.y<.91)soles.expandByPoint(point);}}
    const rest=new THREE.Box3().setFromObject(driver.root.getObjectByName('Reposapiés del piloto'));
    const result={aheadOfSeat:soles.min.z>-.166,footrestGap:Math.abs(soles.min.y-rest.max.y)};driver.dispose();return result;
  });
  expect(fit.aheadOfSeat).toBe(true);expect(fit.footrestGap).toBeLessThan(.005);

  await hidden.uncheck();await expect(stage).toHaveAttribute('data-canopy','1.00');await expect(open).toBeDisabled();
  await hidden.check();await page.getByLabel('Desarmar',{exact:true}).check();await expect(stage).toHaveAttribute('data-exploded','1.00');
  await page.getByRole('button',{name:'Iniciar vuelo',exact:true}).click();await expect(stage).toHaveAttribute('data-playing','true');await expect(stage).toHaveAttribute('data-pilot','true');await expect(stage).toHaveAttribute('data-canopy-hidden','true');
  await page.getByRole('button',{name:'Pausar vuelo',exact:true}).click();
  await page.getByRole('button',{name:'Restablecer vista y nave'}).click();await expect(stage).toHaveAttribute('data-pilot','false');await expect(stage).toHaveAttribute('data-canopy-hidden','false');await expect(open).toBeEnabled();await expect(open).not.toBeChecked();
});

test('comic defaults on, toggles cleanly and carries an explicit opt-out into flight',async({page})=>{
  test.setTimeout(90000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/spaceship.html');const stage=page.locator('.ship-viewport');await expect(stage).toHaveAttribute('data-ready','true');
  await page.getByLabel('Zud al mando',{exact:true}).check();await expect(stage).toHaveAttribute('data-pilot','true');
  const comic=page.getByRole('button',{name:'Cómic',exact:true});await expect(stage).toHaveAttribute('data-comic','true');await expect(comic).toHaveAttribute('aria-pressed','true');
  await comic.click();await expect(stage).toHaveAttribute('data-comic','false');await expect(page.locator('.ship-simulator')).toHaveAttribute('href',/comic=0$/);
  const canvas=page.locator('.ship-canvas'),normal=await canvas.screenshot();
  await comic.click();await expect(stage).toHaveAttribute('data-comic','true');await expect(comic).toHaveAttribute('aria-pressed','true');
  const printed=await canvas.screenshot();expect(printed.equals(normal)).toBe(false);
  await comic.click();await expect(stage).toHaveAttribute('data-comic','false');
  const restored=await canvas.screenshot();expect(restored.equals(normal)).toBe(true);
  await page.getByRole('button',{name:'Restablecer vista y nave'}).click();await expect(stage).toHaveAttribute('data-comic','true');
  await comic.click();await page.getByRole('link',{name:'Simulador de vuelo'}).click();await expect(page.locator('.flight-app')).toHaveAttribute('data-ready','true',{timeout:60000});await expect(page.locator('.flight-app')).toHaveAttribute('data-comic','false');
  expect(errors).toEqual([]);
});
