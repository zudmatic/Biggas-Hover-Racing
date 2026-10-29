// Same cameras, lights, resolution and animation time before/after an edit.
// Usage: node scripts/benchmark-biggas-city.mjs http://127.0.0.1:5391 before
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const url=process.argv[2]??'http://127.0.0.1:5391',label=(process.argv[3]??'current').replace(/[^a-z0-9_-]/gi,'');
await mkdir(`.context/performance-${label}`,{recursive:true});
const browser=await chromium.launch({headless:true,args:process.platform==='darwin'?['--use-angle=metal','--disable-features=WebGPUService']:['--disable-features=WebGPUService']});
try{
  const page=await browser.newPage({viewport:{width:960,height:640}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.text().startsWith('BENCH'))console.log(m.text());});
  await page.exposeFunction('saveBenchmark',async(name,data)=>writeFile(`.context/performance-${label}/${name}.png`,Buffer.from(data,'base64')));
  await page.route('**/?selection=map',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await page.goto(url+'/?selection=map');
  const results=await page.evaluate(async({worldModule,modes})=>{
    const T=await import('/node_modules/three/build/three.webgpu.js'),{GameRenderer}=await import('/src/render/game-renderer.ts'),{tracks}=await import(worldModule),{TrackLighting}=await import('/src/render/lighting/track-lighting.ts'),{createCircuitSky}=await import('/src/render/sky/atmosphere.ts'),{ComicView}=await import('/src/render/comic-view.ts'),{createBiggasCityLook}=await import('/src/content/tracks/biggas-forest/biggas-city-look.js'),{ForestAnimePipeline}=await import('/src/content/tracks/biggas-forest/forest-anime-post.ts');
    const canvas=document.createElement('canvas'),renderer=(await GameRenderer.create(canvas,{preserveDrawingBuffer:true,forceWebGL:true})).renderer;renderer.info.autoReset=false;renderer.setSize(960,640);renderer.setPixelRatio(1);renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
    const scene=new T.Scene();scene.background=new T.Color(0xb6c6bd);scene.fog=new T.Fog(0xb6c6bd,500,2000);
    const start=performance.now(),world=await tracks.require('biggas-city').load({mobile:false,anisotropy:4});scene.add(world.root);const loadMs=performance.now()-start;console.log('BENCH loaded '+Math.round(loadMs)+'ms');
    const camera=new T.PerspectiveCamera(62,960/640,.2,7000),sky=createCircuitSky(scene,{map:'biggas-city'}),lighting=new TrackLighting(scene),comic=new ComicView(renderer,scene,camera);
    const look=createBiggasCityLook(scene,renderer),post=new ForestAnimePipeline({renderer,scene,camera,warmth:look.warmth},{samples:4,glowSamples:0});lighting.setTrack(world.landscape);const state={...world.landscape.spawn,yaw:0,pitch:0,hover:.65,speed:0};
    const horizonStart=performance.now();while(sky.mountains&&!sky.mountains.ready.value){if(performance.now()-horizonStart>15000)throw new Error('Horizon texture did not load');await new Promise(requestAnimationFrame);}
    const forest=world.landscape.samples.find(s=>s.sector==='FOREST'),p=forest.position,f=forest.forward;
    const shots=[['city',[-190,120,480],[-65,24,277],true],['forest',[p[0]-f[0]*10,p[1]+6,p[2]-f[2]*10],[p[0]+f[0]*30,p[1]+2,p[2]+f[2]*30],false],['cascade',[-374,69,-131],[-451,42,-222],false]];
    const samples=[],median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
    for(const mode of modes)for(const [name,position,target,night] of shots){
      camera.position.set(...position);camera.lookAt(...target);camera.updateMatrixWorld();Object.assign(state,{x:target[0],y:target[1],z:target[2]});lighting.setNight(night);
      const step=t=>{lighting.update(state,t,{reducedMotion:true});world.update(t,false,{state,camera,shadowLight:lighting.sun,phase:'flying',night,dt:1/30});sky.update(camera,t,{night,reducedMotion:true});scene.updateMatrixWorld(true);};
      const render=async()=>{renderer.info.reset();if(mode==='comic'){look.update({enabled:false});await comic.render(true);}else{look.update();await post.render();}renderer.backend.gl.finish();};
      console.log('BENCH '+mode+' '+name);await new Promise(requestAnimationFrame);step(12);const cold=performance.now();await render();const firstRenderMs=performance.now()-cold;
      await window.saveBenchmark(`${mode}-${name}`,canvas.toDataURL('image/png').split(',')[1]);
      for(let i=0;i<4;i++){await new Promise(requestAnimationFrame);step(12+i/30);await render();}
      const frames=[],updates=[];for(let i=0;i<24;i++){await new Promise(requestAnimationFrame);const start=performance.now();step(13+i/30);updates.push(performance.now()-start);await render();frames.push(performance.now()-start);}
      const entry={mode,name,firstRenderMs,frameMs:median(frames),updateMs:median(updates),p90Ms:[...frames].sort((a,b)=>a-b)[21],drawCalls:renderer.info.render.drawCalls,triangles:renderer.info.render.triangles};samples.push(entry);console.log('BENCH '+JSON.stringify(entry));
    }
    look.dispose();post.dispose();world.dispose();sky.dispose();lighting.dispose();comic.dispose();renderer.dispose();return {loadMs,samples};
  },{worldModule:process.argv[4]??'/src/content/tracks/index.ts',modes:(process.env.BENCH_MODES??'normal,comic').split(',')});
  await writeFile(`.context/performance-${label}/results.json`,JSON.stringify({url,...results,errors},null,2));console.log(JSON.stringify({...results,errors},null,2));if(errors.length)process.exitCode=1;
}finally{await browser.close();}
