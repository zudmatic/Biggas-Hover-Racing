import {test,expect} from '@playwright/test';

test('Bluleet loads in hangar and flight with embedded materials',async({page})=>{
  test.setTimeout(120000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/spaceship.html?vehicle=bluleet&renderer=webgl2');
  await expect(page.locator('.ship-viewport')).toHaveAttribute('data-ready','true',{timeout:60000});
  await expect(page.locator('.ship-viewport')).toHaveAttribute('data-pilot','true');
  await expect(page.locator('.ship-viewport')).toHaveAttribute('data-comic','false');
  await expect(page.getByRole('link',{name:'Estudio de tinta'})).toHaveAttribute('href','/chubee-studio.html');
  await page.getByRole('button',{name:'Restablecer vista y nave',exact:true}).click();
  await expect(page.getByRole('link',{name:'Estudio de tinta'})).toHaveAttribute('href','/chubee-studio.html');
  await expect(page.getByRole('link',{name:'Simulador de vuelo'})).toHaveAttribute('href',/pilot=bluleet.*comic=0/);
  await page.screenshot({path:'test-results/bluleet-hangar.png'});
  const stats=await page.evaluate(async()=>{
    const {createFlightShip}=await import('/src/flight-ship.js');
    const THREE=await import('/node_modules/three/build/three.module.js');
    const ship=await createFlightShip('bluleet',{exhaust:false});
    const bounds=new THREE.Box3().setFromObject(ship.root);
    const size=bounds.getSize(new THREE.Vector3()).toArray();
    ship.update(1,20,false,false);ship.dispose();return size;
  });
  expect(stats[0]).toBeGreaterThan(3);expect(stats[2]).toBeGreaterThan(4);
  expect(stats.every(Number.isFinite)).toBe(true);expect(errors).toEqual([]);
});
