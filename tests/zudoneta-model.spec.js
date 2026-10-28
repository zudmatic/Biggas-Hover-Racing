import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {shipConfig} from '../src/ship-catalog.js';

// Inspect the actual shipped asset, not a second description of its geometry.
test('Zudoneta ships the integrated revision with UVs, embedded textures and editable pivots',()=>{
  const config=shipConfig('037');
  const buffer=readFileSync(new URL(`../public/models/spaceship/${config.file}`,import.meta.url));
  expect(buffer.readUInt32LE(0)).toBe(0x46546c67);
  const gltf=JSON.parse(buffer.subarray(20,20+buffer.readUInt32LE(12)).toString());
  const nodes=gltf.nodes.map(n=>n.name),root=gltf.nodes.find(n=>n.name==='037_ZUDONETA_CONTROL');
  expect(root.extras.revision).toContain('v07');
  for(const name of ['Casco integrado pod izquierdo','Casco integrado pod derecho','Carenado central proa continuo','Montante alerón continuo -1','Montante alerón continuo 1'])expect(nodes).toContain(name);
  // Material primitives inherit the mesh datablock name in GLTFLoader, so they
  // must still classify as wing parts after the structural boolean operations.
  for(const name of ['Montante alerón continuo -1','Montante alerón continuo 1']){
    const node=gltf.nodes.find(n=>n.name===name);
    expect(config.classify(gltf.meshes[node.mesh].name)).toBe('mast');
  }
  for(const retired of ['Armadura marfil delantera','Armadura marfil trasera','Placa superior inclinada del morro','Montante alerón superior'])expect(nodes).not.toContain(retired);
  expect(nodes.filter(name=>/^ROTOR .*pivote/.test(name))).toHaveLength(3);
  expect(nodes).toContain('VOLANTE · pivote editable');expect(nodes).toContain('Parabrisas ahumado');
  const primitives=gltf.meshes.flatMap(mesh=>mesh.primitives);
  expect(primitives.every(p=>p.attributes.POSITION!==undefined&&p.attributes.NORMAL!==undefined&&p.attributes.TEXCOORD_0!==undefined)).toBe(true);
  const triangles=primitives.reduce((n,p)=>n+gltf.accessors[p.indices].count/3,0);
  expect(triangles).toBeLessThan(90000);expect(buffer.length).toBeLessThan(11_000_000);
  expect(gltf.images).toHaveLength(45);expect(gltf.images.every(image=>Number.isInteger(image.bufferView)&&!image.uri)).toBe(true);
  expect(gltf.materials.filter(m=>/^(01 Marfil|02 Verde oliva|03 Naranja seguridad)/.test(m.name))).toHaveLength(3);
});

test('integrated wing primitives stay together in the hangar exploded view',async({page})=>{
  test.setTimeout(120000);await page.emulateMedia({reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/spaceship.html?vehicle=037&renderer=webgl2&comic=0');
  const stage=page.locator('.ship-viewport');await expect(stage).toHaveAttribute('data-ready','true',{timeout:60000});
  async function settledRear(){
    await page.getByRole('button',{name:'Atrás',exact:true}).click();
    const frame=Number(await stage.getAttribute('data-frame'));
    await page.waitForFunction(f=>Number(document.querySelector('.ship-viewport').dataset.frame)>f+3,frame);
    return (await stage.locator('canvas').screenshot()).toString('base64');
  }
  const assembled=await settledRear();
  const wing=await page.evaluate(async()=>{
    const {GLTFLoader}=await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
    const {shipConfig,shipUrl}=await import('/src/ship-catalog.js');
    const {scene}=await new GLTFLoader().loadAsync(shipUrl('037'));const parts=[];
    scene.traverse(group=>{if(!group.name.startsWith('Montante_alerón_continuo'))return;group.traverse(mesh=>{if(mesh.isMesh)parts.push({name:mesh.name,part:shipConfig('037').classify(mesh.name)});});});
    return parts;
  });
  expect(wing.length).toBeGreaterThanOrEqual(4);expect(wing.every(piece=>piece.part==='mast')).toBe(true);
  await page.locator('[data-part="mast"]').click();await page.getByLabel('Desarmar',{exact:true}).check();await expect(stage).toHaveAttribute('data-exploded','1.00');
  await page.screenshot({path:'.context/zudoneta-v07-desarmada.png'});
  await page.getByRole('button',{name:'Restablecer vista y nave'}).click();await expect(stage).toHaveAttribute('data-exploded','0.00');
  const restored=await settledRear();
  const changedPixels=await page.evaluate(async images=>{
    const pixels=await Promise.all(images.map(async base64=>{
      const image=await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
      const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);image.close();return ctx.getImageData(0,0,canvas.width,canvas.height).data;
    }));
    let changed=0;for(let i=0;i<pixels[0].length;i+=4)if([0,1,2].some(c=>Math.abs(pixels[0][i+c]-pixels[1][i+c])>10))changed++;
    return changed;
  },[assembled,restored]);
  // CPU transforms alone miss stale GPU matrices: compare the rendered assembly.
  expect(changedPixels,'reassembly must restore every rendered part').toBeLessThan(200);
  await page.screenshot({path:'.context/zudoneta-v07-hangar.png'});
  expect(errors).toEqual([]);
});
