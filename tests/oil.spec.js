import {test,expect} from '@playwright/test';
import {createOilSimulation,updateOilResistance} from '../src/oil-simulation.js';
import {advanceHover,createHoverState} from '../src/circuit-physics.js';
import {launchFromLobby} from './helpers/flight.js';

const road=z=>({x:0,y:0,z,nx:0,nz:1,width:12,offset:0,distance:z,grade:0});
const landscape={spawn:{x:0,y:.65,z:0},yaw:0,length:500,height:()=>0,roadAt:(x,z)=>({...road(z),offset:-x}),atDistance:road};
const make=surfaceHeight=>createOilSimulation({landscape,surfaceHeight:surfaceHeight??(()=>0)});
const player=()=>({...createHoverState(landscape),modelScale:.75});

test('oil can taper from wide and scattered to thin, with distance-based spacing',()=>{
  const sim=createOilSimulation({landscape,surfaceHeight:()=>0,settings:{width:3,endWidth:.4,spread:1.2,endSpread:0,spacing:1,pourDuration:2}}),p=player();sim.grant();sim.use();
  for(let i=0;i<120;i++){p.z+=.4;sim.step(1/60,p);}
  expect(sim.patches.length).toBeGreaterThan(40);expect(sim.patches.length).toBeLessThan(50);
  expect(sim.patches[0].radius).toBeCloseTo(1.5);expect(sim.patches.at(-1).radius).toBeLessThan(.25);
  expect(Math.max(...sim.patches.slice(0,10).map(p=>Math.abs(p.x)))).toBeGreaterThan(.5);
  expect(Math.max(...sim.patches.slice(-5).map(p=>Math.abs(p.x)))).toBeLessThan(.2);
  for(let i=1;i<sim.patches.length;i++)expect(sim.patches[i].z-sim.patches[i-1].z).toBeCloseTo(1);
});

test('strong oil and response durations change braking and recovery without stun',()=>{
  const p=player();Object.assign(p,{speed:52,throttle:52,vz:52});
  for(let i=0;i<240;i++){updateOilResistance(p,true,1/60,.85,{entryTime:.1,recoveryTime:2});advanceHover(p,{},1/60,landscape);}
  expect(p.speed).toBeCloseTo(7.8,1);
  const fast={oilFactor:.15},slow={oilFactor:.15};
  for(let i=0;i<30;i++){updateOilResistance(fast,false,1/60,.85,{entryTime:.1,recoveryTime:.2});updateOilResistance(slow,false,1/60,.85,{entryTime:.1,recoveryTime:3});}
  expect(fast.oilFactor).toBeGreaterThan(.99);expect(slow.oilFactor).toBeLessThan(.5);
});

test('oil presets tune live sliders and survive reload',async({page})=>{
  test.setTimeout(90000);await page.goto('/simulator.html');await launchFromLobby(page);
  const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});
  await page.getByText('Aceite · prueba',{exact:true}).click();
  await page.getByRole('button',{name:'Probar: fuerte y fina',exact:true}).click();
  await expect(page.getByRole('slider',{name:'Ralentizacion',exact:true})).toHaveAttribute('aria-valuenow','65');
  await expect(page.getByRole('slider',{name:'Ralentizacion',exact:true})).toHaveAttribute('aria-valuemax','95');
  await page.getByRole('button',{name:'Bot tira aceite',exact:true}).click();
  await expect(app).toHaveAttribute('data-oil-contact','true',{timeout:15000});
  await expect.poll(async()=>Number(await app.getAttribute('data-speed')),{timeout:15000}).toBeLessThan(14);
  await page.reload();await launchFromLobby(page);await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});
  await page.getByText('Aceite · prueba',{exact:true}).click();
  await expect(page.getByRole('slider',{name:'Ralentizacion',exact:true})).toHaveAttribute('aria-valuenow','65');
});

test('swept pickup, single inventory, consumption and timed respawn',()=>{
  const sim=make(),p=player();p.z=18;sim.step(1/60,p,{...p,z:10});expect(sim.inventory).toBe(true);
  expect(sim.pickups.filter(p=>p.readyAt>0)).toHaveLength(1);
  sim.step(1/60,p,{...p,z:10});expect(sim.pickups.filter(p=>p.readyAt>0)).toHaveLength(1);
  expect(sim.use()).toBe(true);expect(sim.use()).toBe(false);expect(sim.inventory).toBe(false);
  p.x=20;for(let i=0;i<600;i++)sim.step(1/60,p);
  expect(sim.pouring).toBe(false);expect(sim.patches).toHaveLength(0);
  p.x=0;p.z=18;sim.step(1/60,p,{...p,z:10});expect(sim.inventory).toBe(true);
});

test('oil leaves connected patches, detects height and clears on reset',()=>{
  const sim=make(),p=player();sim.grant();sim.use();
  for(let i=0;i<60;i++){p.z+=1;sim.step(1/60,p);}
  expect(sim.patches.length).toBeGreaterThan(60);expect(sim.patches.length).toBeLessThanOrEqual(256);
  const patch=sim.patches[20];Object.assign(p,{x:patch.x,z:patch.z,y:.65});expect(sim.contact(p)).toBe(true);
  p.y=10;expect(sim.contact(p)).toBe(false);sim.reset();expect(sim.patches).toHaveLength(0);expect(sim.inventory).toBe(false);expect(sim.pouring).toBe(false);
});

test('oil avoids gaps and invalid road edges',()=>{
  const sim=make((x,z)=>z>8&&z<15?null:0),p=player();sim.grant();sim.use();
  for(let i=0;i<60;i++){p.z+=.5;sim.step(1/60,p);}
  expect(sim.patches.length).toBeGreaterThan(0);
  expect(sim.patches.every(p=>p.z+p.radius<=8||p.z-p.radius>=15)).toBe(true);
});

test('oil reduces actual player velocity without stacking and recovers after leaving',()=>{
  const p=player();Object.assign(p,{speed:52,throttle:52,vz:52});
  for(let i=0;i<180;i++){updateOilResistance(p,true,1/60,.3);advanceHover(p,{},1/60,landscape);}
  expect(p.speed).toBeCloseTo(36.4,1);expect(p.oilFactor).toBeCloseTo(.7,3);
  for(let i=0;i<240;i++){updateOilResistance(p,false,1/60,.3);advanceHover(p,{},1/60,landscape);}
  expect(p.speed).toBeGreaterThan(51);expect(p.oilContact).toBe(false);
});

test('bot emitter drops behind the bot without giving the player an item',()=>{
  const sim=make(),p=player(),bot={...player(),z:20};sim.startPour();sim.step(1/60,p,p,bot);
  expect(sim.inventory).toBe(false);expect(sim.patches[0].z).toBeGreaterThan(17);expect(sim.patches[0].z).toBeLessThan(20);
});

test('oil preserves steering and boost without an impact impulse',()=>{
  const p=player();Object.assign(p,{speed:30,throttle:30,vz:30});
  updateOilResistance(p,true,1/60,.3);expect(p.speed).toBe(30);expect(p.vz).toBe(30);
  advanceHover(p,{turn:1,boost:true},1/60,landscape);
  expect(p.yaw).toBeLessThan(0);expect(p.boosting).toBe(true);
});

for(const map of ['ruins','nexus'])test(`barrel and bot work in ${map}; pause freezes and restart clears`,async({page})=>{
  test.setTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`/simulator.html?map=${map}`);await launchFromLobby(page,{map});
  const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});
  await expect(page.getByRole('button',{name:'Soltar aceite'})).toBeDisabled();
  await page.getByRole('button',{name:'Preparar prueba',exact:true}).click();
  await expect(app).toHaveAttribute('data-oil-inventory','true');await page.keyboard.press('q');
  await expect.poll(async()=>Number(await app.getAttribute('data-bot-oil-hits')),{timeout:20000}).toBeGreaterThan(0);
  await expect.poll(async()=>Number(await app.getAttribute('data-bot-speed')),{timeout:10000}).toBeLessThan(20);
  await page.keyboard.press('Escape');await expect(app).toHaveAttribute('data-phase','paused');
  await page.waitForTimeout(200);const before=await app.evaluate(e=>[e.dataset.oilTime,e.dataset.oilPatches,e.dataset.botDistance]);
  await page.waitForTimeout(300);expect(await app.evaluate(e=>[e.dataset.oilTime,e.dataset.oilPatches,e.dataset.botDistance])).toEqual(before);
  await page.locator('#flight-restart').click();await expect(app).toHaveAttribute('data-oil-patches','0');await expect(app).toHaveAttribute('data-oil-inventory','false');
  await page.getByRole('button',{name:'Preparar prueba',exact:true}).click();await page.getByRole('button',{name:'Soltar aceite'}).click();
  await expect.poll(async()=>Number(await app.getAttribute('data-oil-patches'))).toBeGreaterThan(5);
  await page.getByRole('button',{name:'Mirar atrás',exact:true}).click();await expect(page.getByRole('button',{name:'Mirar adelante',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.waitForTimeout(600);
  await page.screenshot({path:`test-results/oil-${map}.png`});expect(errors).toEqual([]);
});

test('bot lays oil ahead of the player; player slows and recovers',async({page})=>{
  test.setTimeout(90000);await page.goto('/simulator.html');await launchFromLobby(page);
  const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});
  await page.getByRole('button',{name:'Bot tira aceite',exact:true}).click();
  await expect(app).toHaveAttribute('data-oil-source','bot');
  await expect(app).toHaveAttribute('data-oil-contact','true',{timeout:15000});
  await expect.poll(async()=>Number(await app.getAttribute('data-speed')),{timeout:10000}).toBeLessThan(25);
  await expect(page.locator('.oil-player-status')).toContainText('EN ACEITE');
  await page.keyboard.down('Space');
  await page.screenshot({path:'test-results/oil-player-slow.png'});
  await expect(app).toHaveAttribute('data-oil-contact','false',{timeout:20000});
  await expect.poll(async()=>Number(await app.getAttribute('data-oil-factor')),{timeout:10000}).toBeGreaterThan(.98);await page.keyboard.up('Space');
});

test('time trial excludes oil and the training bot',async({page})=>{
  test.setTimeout(90000);await page.goto('/simulator.html');await launchFromLobby(page,{mode:'race'});
  const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});
  await expect(app).toHaveAttribute('data-oil-enabled','false');await expect(page.locator('.flight-oil')).toBeHidden();await page.keyboard.press('q');await expect(app).toHaveAttribute('data-oil-patches','0');
});

test('collect a barrel by driving through the track pickup',async({page})=>{
  test.setTimeout(90000);await page.goto('/simulator.html');await launchFromLobby(page);
  const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});
  await page.keyboard.down('w');await expect(app).toHaveAttribute('data-oil-inventory','true',{timeout:20000});await page.keyboard.up('w');
  await page.keyboard.press('q');await expect(app).toHaveAttribute('data-oil-pouring','true');
});

test('mobile Oliva can deploy oil and disable the bot without overlapping driving controls',async({page})=>{
  test.setTimeout(90000);await page.setViewportSize({width:390,height:844});await page.goto('/simulator.html?vehicle=037');await launchFromLobby(page);
  const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});await expect(app).toHaveAttribute('data-vehicle','037');
  await page.getByRole('button',{name:'Preparar prueba',exact:true}).click();await page.getByRole('button',{name:'Soltar aceite'}).click();
  await expect.poll(async()=>Number(await app.getAttribute('data-bot-oil-hits')),{timeout:20000}).toBeGreaterThan(0);
  await page.getByLabel('Bot de prueba',{exact:true}).uncheck();await expect(page.locator('.oil-bot-status')).toHaveText('Bot desactivado');
  const button=await page.locator('.oil-use').boundingBox(),drive=await page.locator('.flight-touch').boundingBox();expect(button.y+button.height).toBeLessThan(drive.y);
  const point={x:button.x+button.width/2,y:button.y+button.height/2};expect(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.closest('.oil-use')!==null,point)).toBe(true);
  await page.screenshot({path:'test-results/oil-mobile.png'});
});
