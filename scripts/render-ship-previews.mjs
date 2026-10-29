// Run against a local Vite server: node scripts/render-ship-previews.mjs <vehicle> [URL]
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const outputDir=process.env.PREVIEW_OUTPUT_DIR??fileURLToPath(new URL('../public/images/flight/',import.meta.url));
await mkdir(outputDir,{recursive:true});
const id=process.argv[2]??'038';
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:640,height:480}});
  await page.goto(process.argv[3]??'http://127.0.0.1:5173/');
  const images=await page.evaluate(async id=>{
    const THREE=await import('/node_modules/three/build/three.webgpu.js');
    const {Vehicle}=await import('/src/content/vehicles/vehicle.ts');
    const {vehicles}=await import('/src/content/vehicles/index.ts');
    const {CharacterComic}=await import('/src/render/materials/character-comic.ts');
    const {WebGLRenderer}=await import('/node_modules/three/src/renderers/WebGLRenderer.js');
    const {AssetLoader}=await import('/src/core/assets/asset-loader.ts');
    const renderer=new WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(640,480);renderer.setPixelRatio(1);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
    AssetLoader.shared.configure(renderer);
    const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xffffff,0x747474,3));
    const key=new THREE.DirectionalLight(0xffe2b7,4);key.position.set(-4,7,6);scene.add(key);
    const rim=new THREE.DirectionalLight(0xd5e4ff,2);rim.position.set(5,4,-4);scene.add(rim);
    // The TSL exhaust and plasma need WebGPURenderer; thumbnails show the ship at rest.
    const ship=await Vehicle.load(vehicles.resolve(id),{exhaust:false,plasma:false});ship.update(0,0,false,true);scene.add(ship.root);
    const camera=new THREE.OrthographicCamera(-3.2,3.2,2.4,-2.4,.1,100);camera.position.set(7,5,8);camera.lookAt(0,1.45,0);
    renderer.render(scene,camera);const normal=renderer.domElement.toDataURL('image/png').split(',')[1];
    const comic=new CharacterComic(renderer);comic.render(scene,camera,'#ffffff');const paper=renderer.domElement.toDataURL('image/png').split(',')[1];
    comic.dispose();ship.dispose();renderer.dispose();return {normal,paper};
  },id);
  for(const [name,data] of Object.entries(images))await writeFile(resolve(outputDir,`${id}${name==='paper'?'-paper':''}.png`),Buffer.from(data,'base64'));
}finally{await browser.close();}
