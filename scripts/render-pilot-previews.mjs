// Run against Vite: node scripts/render-pilot-previews.mjs <ajo|lomi> [URL]
import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const portraits={ajo:'Head|Ear',lomi:'Head|Hair'};
const pilot=process.argv[2];if(!portraits[pilot])throw new Error(`Uso: node scripts/render-pilot-previews.mjs <${Object.keys(portraits).join('|')}> [URL]`);
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage();await page.goto(process.argv[3]??'http://127.0.0.1:5173/');
  const images=await page.evaluate(async({pilot,portrait})=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {pilotConfig}=await import('/src/content/characters/catalog.ts');
    const {createCharacterComic}=await import('/src/render/materials/character-comic.ts');
    const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(640,640);renderer.setPixelRatio(1);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
    const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xffffff,0x747474,3));
    const key=new THREE.DirectionalLight(0xffe2b7,4);key.position.set(-4,7,6);scene.add(key);
    const rim=new THREE.DirectionalLight(0xd5e4ff,2);rim.position.set(5,4,-4);scene.add(rim);
    const actor=await pilotConfig(pilot).load();actor.update(0);actor.root.rotation.y=-.12;scene.add(actor.root);actor.root.updateMatrixWorld(true);
    const comic=createCharacterComic(renderer),images={};
    for(const face of [false,true]){
      const bounds=new THREE.Box3();
      if(face)actor.meshes.filter(mesh=>new RegExp(portrait).test(mesh.name)).forEach(mesh=>bounds.expandByObject(mesh,true));
      else bounds.setFromObject(actor.root,true);
      const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()),half=Math.max(size.x,size.y)*.55;
      const camera=new THREE.OrthographicCamera(-half,half,half,-half,.1,100);camera.position.copy(center).add(new THREE.Vector3(0,0,8));camera.lookAt(center);
      const name=face?`${pilot}-face`:pilot;
      renderer.render(scene,camera);images[name]=renderer.domElement.toDataURL('image/png').split(',')[1];
      comic.render(scene,camera,'#ffffff');images[`${name}-paper`]=renderer.domElement.toDataURL('image/png').split(',')[1];
    }
    comic.dispose();actor.dispose();renderer.dispose();return images;
  },{pilot,portrait:portraits[pilot]});
  for(const [name,data] of Object.entries(images))await writeFile(new URL(`../public/images/flight/${name}.png`,import.meta.url),Buffer.from(data,'base64'));
}finally{await browser.close();}
