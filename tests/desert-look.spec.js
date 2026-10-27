import {test,expect} from '@playwright/test';
import {openFlightOptions} from './helpers/flight.js';

test.use({headless:!process.env.NATIVE_GPU,viewport:{width:1280,height:800},launchOptions:{args:['--enable-unsafe-webgpu']}});
const backend=process.env.TEST_RENDERER??(process.env.NATIVE_GPU?'webgpu':'webgl2');

test('desert chooses the natural look while an explicit paper choice persists',async({page})=>{
  await page.goto('/?selection=map&map=desert-valley');
  const paper=page.getByRole('button',{name:'Papel',exact:true});
  await expect(paper).toHaveAttribute('aria-pressed','false');
  await page.locator('.lobby-map-card:has(input[value=ruins])').click();
  await expect(paper).toHaveAttribute('aria-pressed','true');
  await page.locator('.lobby-map-card:has(input[value=desert-valley])').click();
  await expect(paper).toHaveAttribute('aria-pressed','false');
  await paper.click();await page.locator('.lobby-map-card:has(input[value=ruins])').click();
  await page.locator('.lobby-map-card:has(input[value=desert-valley])').click();
  await expect(paper).toHaveAttribute('aria-pressed','true');
});

for(const [vehicle,pilot] of [['040','lomi'],['bluleet','bluleet']])test(`natural desert preserves ${vehicle} effects and paper switching (${backend})`,async({page},info)=>{
  test.setTimeout(120000);const errors=[];
  page.on('pageerror',e=>{errors.push(e.message);console.log('Browser error:',e.message);});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.log('Browser error:',m.text());}});
  await page.goto(`/?selection=map&map=desert-valley&vehicle=${vehicle}&pilot=${pilot}&intro=0&renderer=${backend}`);
  await page.getByRole('button',{name:'Volar',exact:true}).click();
  const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:90000});
  await expect(app).toHaveAttribute('data-look','sunlit');await expect(app).toHaveAttribute('data-backend',new RegExp(`^${backend}$`,'i'));
  await expect.poll(async()=>Number(await app.getAttribute('data-frame')),{timeout:30000}).toBeGreaterThan(10);
  await page.locator('.flight-canvas').focus();await page.keyboard.down('KeyW');await page.keyboard.down('Shift');
  await page.waitForTimeout(1000);await page.keyboard.up('Shift');await page.keyboard.up('KeyW');
  await openFlightOptions(page);await expect(app).toHaveAttribute('data-phase','paused');
  const before=await page.evaluate(()=>window.__desertBenchmark.snapshot().lod);
  await page.evaluate(()=>window.__desertBenchmark.overview());await page.waitForTimeout(150);
  expect(await page.evaluate(()=>window.__desertBenchmark.snapshot().lod.levels)).toEqual(before.levels);
  await page.evaluate(()=>window.__desertBenchmark.teleport(255,-170));
  const moved=await page.evaluate(()=>window.__desertBenchmark.snapshot().lod);expect(moved.levels).not.toEqual(before.levels);
  expect(moved.instances).toBe(333);expect(moved.triangles).toBeLessThan(moved.fullTriangles);
  await page.evaluate(()=>{window.__desertBenchmark.setLodMode('full');window.__desertBenchmark.follow();});
  expect(await page.evaluate(()=>window.__desertBenchmark.snapshot().lod.levels)).toEqual([333,0,0]);
  await page.evaluate(()=>window.__desertBenchmark.setLodMode('adaptive'));
  await page.locator('#flight-comic').click();await expect(app).toHaveAttribute('data-look','comic',{timeout:45000});
  await page.locator('#flight-comic').click();await expect(app).toHaveAttribute('data-look','sunlit',{timeout:45000});
  const frame=Number(await app.getAttribute('data-frame'));
  await expect.poll(async()=>Number(await app.getAttribute('data-frame')),{timeout:30000}).toBeGreaterThan(frame+5);
  await page.screenshot({path:info.outputPath(`${vehicle}-${backend}.png`)});
  expect(errors).toEqual([]);
});
