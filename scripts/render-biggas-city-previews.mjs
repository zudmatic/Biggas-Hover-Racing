// Use the game's PSX treatment and optional comic view for the selection art.
// Usage: node scripts/render-biggas-city-previews.mjs http://127.0.0.1:5391
import {chromium} from '@playwright/test';
import {writeFile,mkdir} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,args:process.platform==='darwin'?['--use-angle=metal','--disable-features=WebGPUService']:['--disable-features=WebGPUService']});
try{
  const page=await browser.newPage({viewport:{width:960,height:600}}),errors=[];
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.text().startsWith('PREVIEW'))console.log(m.text());});page.on('pageerror',e=>errors.push(e.message));
  await mkdir('.context',{recursive:true});
  await page.exposeFunction('savePreview',async(name,data)=>writeFile(`.context/psx-${name}.png`,Buffer.from(data,'base64')));
  await page.route('**/@vite/client',r=>r.fulfill({contentType:'application/javascript',body:''}));
  await page.route('**/city-preview',r=>r.fulfill({contentType:'text/html',body:'<html><body></body></html>'}));
  await page.goto(`${process.argv[2]??'http://127.0.0.1:5391'}/city-preview`);
  const images=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js');
    const {createGameRenderer}=await import('/src/game-renderer.js'),{createCircuitWorld}=await import('/src/circuit-world.js'),{createCircuitLighting}=await import('/src/circuit-lighting.js'),{createCircuitSky}=await import('/src/flight-atmosphere.js'),{createComicView}=await import('/src/comic-view.js'),{createBiggasCityLook,createBiggasCityPost}=await import('/src/biggas-city-look.js');
    const canvas=document.createElement('canvas'),renderer=await createGameRenderer(canvas,{preserveDrawingBuffer:true,forceWebGL:true});renderer.setSize(960,600);renderer.setPixelRatio(1);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;
    const scene=new T.Scene();scene.background=new T.Color(0xb6c6bd);scene.fog=new T.Fog(0xb6c6bd,220,1100);
    const world=await createCircuitWorld({map:'biggas-city'});scene.add(world.root);console.log('PREVIEW world loaded');
    const camera=new T.PerspectiveCamera(62,1.6,.15,7000),sky=createCircuitSky(scene,{map:'biggas-city'}),lighting=createCircuitLighting(scene);lighting.setTrack(world.landscape);
    const comic=createComicView(renderer,scene,camera),look=createBiggasCityLook(scene,renderer),post=createBiggasCityPost(renderer,scene,camera,{warmth:look.warmth});
    const state={...world.landscape.spawn,yaw:0,pitch:0,hover:.65,speed:0},shots={};
    for(const [name,position,target] of [['city',[-190,75,480],[-65,24,277]],['forest',[294,66,-408],[246,65,-441]],['cascade',[-390,66,-147],[-451,46,-230]]]){
      camera.position.set(...position);camera.lookAt(...target);Object.assign(state,{x:target[0],y:target[1],z:target[2]});lighting.update(state,12,{reducedMotion:true});sky.update(camera,12,{reducedMotion:true});world.update(12,false,{state,phase:'flying',dt:0,camera,shadowLight:lighting.sun});scene.updateMatrixWorld(true);
      look.update();await new Promise(requestAnimationFrame);await post.render();console.log('PREVIEW '+name);shots[name]=canvas.toDataURL('image/png').split(',')[1];await window.savePreview(name,shots[name]);
      if(name==='city'){
        look.update({enabled:false});await comic.render(true);shots.paper=canvas.toDataURL('image/png').split(',')[1];await window.savePreview('comic',shots.paper);
      }
    }
    look.dispose();comic.dispose();post.dispose();world.dispose();sky.dispose();lighting.dispose();renderer.dispose();return shots;
  });
  if(errors.length)throw new Error(errors.join('\n'));
  await writeFile('public/images/flight/biggas-city-normal.png',Buffer.from(images.city,'base64'));
  await writeFile('public/images/flight/biggas-city.png',Buffer.from(images.paper,'base64'));
}finally{await browser.close();}
