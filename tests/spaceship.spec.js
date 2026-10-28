import {test,expect} from '@playwright/test';
import {launchFromLobby} from './helpers/flight.js';
import {flightPose,FLIGHT_DURATION} from '../src/spaceship-parts.js';

// The detailed default model and first shader compilation can exceed five seconds.
test.describe.configure({timeout:90000});

test('flight endpoints remain coherent',()=>{
  expect(flightPose(0).altitude).toBe(0);expect(flightPose(0).power).toBe(0);
  expect(flightPose(8).altitude).toBeGreaterThan(1);expect(flightPose(8).power).toBe(1);
  expect(flightPose(FLIGHT_DURATION).altitude).toBe(0);expect(flightPose(FLIGHT_DURATION).power).toBe(0);
});

test('hangar loads the supplied model, inspects parts and animates without errors',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/spaceship.html');const stage=page.locator('.ship-viewport');
  await expect(stage).toHaveAttribute('data-ready','true',{timeout:60000});await expect(stage).toHaveAttribute('data-mesh-count','655');
  await expect(page.locator('.ship-part')).toHaveCount(8);
  await expect(page.getByLabel('Etiquetas',{exact:true})).not.toBeChecked();await expect(page.locator('.ship-hotspot:visible')).toHaveCount(0);
  await page.getByLabel('Etiquetas',{exact:true}).check();await expect.poll(()=>page.locator('.ship-hotspot:visible').count()).toBeGreaterThan(0);
  await page.locator('[data-part="cockpit"]').click();
  await expect(stage).toHaveAttribute('data-selected','cockpit');
  await expect(page.getByLabel('Abrir parabrisas',{exact:true})).toBeChecked();
  await expect.poll(()=>stage.getAttribute('data-canopy')).toBe('1.00');
  await page.getByLabel('Desarmar',{exact:true}).check();await expect.poll(()=>stage.getAttribute('data-exploded')).toBe('1.00');
  await page.getByRole('button',{name:'Iniciar vuelo',exact:true}).click();
  await expect(stage).toHaveAttribute('data-playing','true');
  await expect(page.getByLabel('Abrir parabrisas',{exact:true})).not.toBeChecked();
  await expect(page.getByLabel('Desarmar',{exact:true})).not.toBeChecked();
  await page.getByRole('button',{name:'Pausar vuelo',exact:true}).click();await expect(stage).toHaveAttribute('data-playing','false');
  await page.getByLabel('Tiempo de la animación').fill('8');await expect(stage).toHaveAttribute('data-altitude','1.150');
  await expect(page.locator('#ship-phase')).toHaveText('VUELO ESTACIONARIO');
  await page.getByLabel('Tiempo de la animación').fill('18');await expect(stage).toHaveAttribute('data-altitude','0.000');
  await page.getByRole('button',{name:'Atrás',exact:true}).click();await expect(page.getByRole('button',{name:'Atrás',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Restablecer vista y nave'}).click();await expect(page.locator('#ship-phase')).toHaveText('EN HANGAR');
  await expect(stage).toHaveAttribute('data-selected','');
  await expect(page.getByLabel('Etiquetas',{exact:true})).not.toBeChecked();await expect(page.locator('.ship-hotspot:visible')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('mobile hangar and reduced motion retain all controls',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/?view=spaceship');const stage=page.locator('.ship-viewport');await expect(stage).toHaveAttribute('data-ready','true',{timeout:60000});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await expect(stage).toHaveAttribute('data-playing','false');
  await page.locator('[data-part="engines"]').click();await expect(stage).toHaveAttribute('data-selected','engines');
  await expect(page.locator('#ship-description')).toHaveText('Tres propulsores');
  await page.getByLabel('Abrir parabrisas',{exact:true}).check();await expect(stage).toHaveAttribute('data-canopy','1.00');
  await page.getByRole('button',{name:'Restablecer vista y nave'}).click();await expect(stage).toHaveAttribute('data-canopy','0.00');
});

test('missing model presents a recoverable error',async({page})=>{
  await page.route('**/models/spaceship/zudoneta-037-v07.glb',route=>route.abort());
  await page.goto('/spaceship.html');await expect(page.locator('.ship-loader')).toContainText('No se pudo cargar la nave');
  await expect(page.getByRole('button',{name:'Reintentar'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Iniciar vuelo'})).toBeDisabled();
});

test('windshield visibility and seated pilot survive flight, inspection and reset',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/spaceship.html');const stage=page.locator('.ship-viewport');await expect(stage).toHaveAttribute('data-ready','true',{timeout:60000});
  const hidden=page.getByLabel('Ocultar parabrisas',{exact:true}),pilot=page.getByLabel('Zud al mando',{exact:true}),open=page.getByLabel('Abrir parabrisas',{exact:true});
  await hidden.check();await expect(stage).toHaveAttribute('data-canopy-hidden','true');await expect(open).toBeDisabled();
  await hidden.uncheck();await expect(stage).toHaveAttribute('data-canopy-hidden','false');await expect(open).toBeEnabled();
  await pilot.check();await expect(stage).toHaveAttribute('data-pilot','true');await expect(hidden).not.toBeChecked();
  await expect(stage).toHaveAttribute('data-canopy-hidden','false');await expect(stage).toHaveAttribute('data-canopy','0.00');await expect(open).toBeEnabled();
  await page.getByLabel('Tiempo de la animación').fill('8');await expect(stage).toHaveAttribute('data-altitude','1.150');await expect(open).not.toBeChecked();await expect(stage).toHaveAttribute('data-canopy-hidden','false');
  const fit=await page.evaluate(async()=>{
    const {createSpaceshipPilot}=await import('/src/spaceship-pilot.js');
    const THREE=await import('/node_modules/three/build/three.module.js');
    const driver=createSpaceshipPilot(),point=new THREE.Vector3(),soles=new THREE.Box3();driver.root.updateMatrixWorld(true);
    for(const hip of driver.actor.feet){const leg=hip.getObjectByName('Pierna'),vertices=leg.geometry.attributes.position;for(let i=0;i<vertices.count;i++){point.fromBufferAttribute(vertices,i).applyMatrix4(leg.matrixWorld);if(point.y<.91)soles.expandByPoint(point);}}
    const rest=new THREE.Box3().setFromObject(driver.root.getObjectByName('Reposapiés del piloto'));
    const result={aheadOfSeat:soles.min.z>-.166,footrestGap:Math.abs(soles.min.y-rest.max.y)};driver.dispose();return result;
  });
  expect(fit.aheadOfSeat).toBe(true);expect(fit.footrestGap).toBeLessThan(.005);

  await open.check();await expect(stage).toHaveAttribute('data-canopy','1.00');await expect(open).toBeEnabled();
  await open.uncheck();await expect(stage).toHaveAttribute('data-canopy','0.00');
  await page.screenshot({path:'.context/hangar-parabrisas-piloto.png'});
  await hidden.check();await page.getByLabel('Desarmar',{exact:true}).check();await expect(stage).toHaveAttribute('data-exploded','1.00');
  await page.getByRole('button',{name:'Iniciar vuelo',exact:true}).click();await expect(stage).toHaveAttribute('data-playing','true');await expect(stage).toHaveAttribute('data-pilot','true');await expect(stage).toHaveAttribute('data-canopy-hidden','true');
  await page.getByRole('button',{name:'Pausar vuelo',exact:true}).click();
  await page.getByRole('button',{name:'Restablecer vista y nave'}).click();await expect(stage).toHaveAttribute('data-pilot','false');await expect(stage).toHaveAttribute('data-canopy-hidden','false');await expect(open).toBeEnabled();await expect(open).not.toBeChecked();
});

test('comic defaults on, toggles cleanly and carries an explicit opt-out into flight',async({page})=>{
  test.setTimeout(90000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/spaceship.html');const stage=page.locator('.ship-viewport');await expect(stage).toHaveAttribute('data-ready','true',{timeout:60000});
  await page.getByLabel('Zud al mando',{exact:true}).check();await expect(stage).toHaveAttribute('data-pilot','true');
  const comic=page.getByRole('button',{name:'Cómic',exact:true});await expect(stage).toHaveAttribute('data-comic','true');await expect(comic).toHaveAttribute('aria-pressed','true');
  await comic.click();await expect(stage).toHaveAttribute('data-comic','false');await expect(page.locator('.ship-simulator')).toHaveAttribute('href',/comic=0$/);
  const canvas=page.locator('.ship-canvas'),normal=await canvas.screenshot();
  await comic.click();await expect(stage).toHaveAttribute('data-comic','true');await expect(comic).toHaveAttribute('aria-pressed','true');
  const printed=await canvas.screenshot();expect(printed.equals(normal)).toBe(false);
  await comic.click();await expect(stage).toHaveAttribute('data-comic','false');
  const restored=await canvas.screenshot();expect(restored.equals(normal)).toBe(true);
  await page.getByRole('button',{name:'Restablecer vista y nave'}).click();await expect(stage).toHaveAttribute('data-comic','true');
  await comic.click();await page.getByRole('link',{name:'Simulador de vuelo'}).click();await launchFromLobby(page);await expect(page.locator('.flight-app')).toHaveAttribute('data-ready','true',{timeout:60000});await expect(page.locator('.flight-app')).toHaveAttribute('data-comic','false');
  expect(errors).toEqual([]);
});


test('hangar runs the racing propulsion and freezes or clears it with the timeline',async({page})=>{
  test.setTimeout(120000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/spaceship.html?renderer=webgl2');const stage=page.locator('.ship-viewport');
  await expect(stage).toHaveAttribute('data-ready','true',{timeout:60000});
  await expect(stage).toHaveAttribute('data-backend','WebGL2');await expect(stage).toHaveAttribute('data-engine','flame');await expect(stage).toHaveAttribute('data-engine-power','0.000');
  await page.getByRole('button',{name:'Atrás',exact:true}).click();
  await page.getByLabel('Tiempo de la animación').fill('8');
  await expect.poll(async()=>Number(await stage.getAttribute('data-engine-power'))).toBeGreaterThan(.1);
  await expect.poll(async()=>Number(await stage.getAttribute('data-engine-particles'))).toBeGreaterThan(0);
  const emitted=await stage.getAttribute('data-engine-particles'),frame=Number(await stage.getAttribute('data-frame'));
  await expect.poll(async()=>Number(await stage.getAttribute('data-frame'))).toBeGreaterThan(frame+2);
  await expect(stage).toHaveAttribute('data-engine-particles',emitted);
  await page.getByRole('button',{name:'Iniciar vuelo',exact:true}).click();
  await expect.poll(async()=>Number(await stage.getAttribute('data-engine-particles'))).toBeGreaterThan(Number(emitted)+100);
  await page.getByRole('button',{name:'Pausar vuelo',exact:true}).click();
  await page.screenshot({path:'.context/hangar-propulsion-juego.png'});
  await page.getByRole('button',{name:'Cómic',exact:true}).click();await expect(stage).toHaveAttribute('data-comic','false');
  await page.getByLabel('Tiempo de la animación').fill('18');
  await expect(stage).toHaveAttribute('data-engine-power','0.000');await expect(stage).toHaveAttribute('data-engine-particles','0');
  await page.getByLabel('Tiempo de la animación').fill('8');await expect.poll(async()=>Number(await stage.getAttribute('data-engine-power'))).toBeGreaterThan(.1);
  await page.getByRole('button',{name:'Restablecer vista y nave'}).click();
  await expect(stage).toHaveAttribute('data-engine-power','0.000');await expect(stage).toHaveAttribute('data-engine-particles','0');
  await page.emulateMedia({reducedMotion:'reduce'});await page.getByLabel('Tiempo de la animación').fill('8');
  await expect(stage).toHaveAttribute('data-altitude','1.150');await expect(stage).toHaveAttribute('data-engine-power','0.000');
  await expect(stage).toHaveAttribute('data-engine-particles','0');expect(errors).toEqual([]);
});
