// Render the actual game pilot and ink finish. Requires a running Vite server.
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const outputDir=process.env.PREVIEW_OUTPUT_DIR??fileURLToPath(new URL('../public/images/flight/',import.meta.url));
await mkdir(outputDir,{recursive:true});
const browser=await chromium.launch({headless:false,args:['--enable-unsafe-webgpu']});
try{
  const page=await browser.newPage();await page.goto(process.argv[2]??'http://127.0.0.1:5173/');
  const images=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.webgpu.js');
    const {characters}=await import('/src/content/characters/index.ts');
    const {GameRenderer}=await import('/src/render/game-renderer.ts');
    const {ComicView}=await import('/src/render/comic-view.ts');
    const renderer=(await GameRenderer.create(document.createElement('canvas'),{alpha:true,preserveDrawingBuffer:true})).renderer;renderer.setSize(640,640);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
    const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xffffff,0x747474,3));
    const key=new THREE.DirectionalLight(0xffe2b7,4);key.position.set(-4,7,6);scene.add(key);
    const rim=new THREE.DirectionalLight(0xd5e4ff,2);rim.position.set(5,4,-4);scene.add(rim);
    const actor=await characters.require('bluleet').create({seated:false});actor.root.rotation.y=-.12;scene.add(actor.root);actor.root.updateMatrixWorld(true);
    const images={};
    for(const face of [false,true]){
      const bounds=new THREE.Box3().setFromObject(actor.root,true);
      if(face)bounds.min.y=actor.bones.get('neck_01').getWorldPosition(new THREE.Vector3()).y-.05;
      const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()),half=Math.max(size.x,size.y)*.55;
      const camera=new THREE.OrthographicCamera(-half,half,half,-half,.1,100);camera.position.copy(center).add(new THREE.Vector3(0,0,8));camera.lookAt(center);
      const name=face?'bluleet-pilot-face':'bluleet-pilot';
      const comic=new ComicView(renderer,scene,camera);
      await comic.render(false,'#ffffff');images[name]=renderer.domElement.toDataURL('image/png').split(',')[1];
      await comic.render(true,'#ffffff');images[`${name}-paper`]=renderer.domElement.toDataURL('image/png').split(',')[1];comic.dispose();
    }
    actor.dispose();renderer.dispose();return images;
  });
  for(const [name,data] of Object.entries(images))await writeFile(resolve(outputDir,`${name}.png`),Buffer.from(data,'base64'));
  console.log('Rendered four Bluleet menu previews.');
}finally{await browser.close();}
