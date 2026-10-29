import {createFlameMaterial} from './vfx/flame-material.js';
import {createFlameTrail} from './vfx/flame-trail.js';
import {createGameRenderer} from './game-renderer.js';
import {attribute} from 'three/tsl';
import {createBaseMaterials} from './base-materials.js';
import {createComicStyle,createComicMaterials} from './comic-tsl-material.js';
import {createComicPost} from './comic-tsl-post.js';
import {createBiggasCityLook,createBiggasCityPost} from './biggas-city-look.js';
import {createBoost} from './vfx/boost.js';
import {createSmokeMaterial} from './vfx/smoke-material.js';
import {createOilMaterial} from './vfx/oil.js';
import {warmupFlightScene} from './flight-scene-warmup.js';

export {createSmokeMaterial};
export const oilMaterialFactory=()=>createOilMaterial(attribute('color','vec4').a);
export async function createRenderer(canvas,forceWebGL){
  return createGameRenderer(canvas,{forceWebGL});
}

// Rendering adapter only: the simulator owns physics, race timing and cameras.
export async function createFlightWebGPU(renderer,scene,camera,vehicle,oil,{naturalCity=false}={}){
  const baseline=createBaseMaterials(scene),style=createComicStyle(),materials=createComicMaterials(scene,style);
  const look=naturalCity?createBiggasCityLook(scene,renderer):null;
  const passes=new Map();let quality={samples:4,glowSamples:12,lite:false},lastComic=null;
  const stats={glowSamples:12,samples:4};
  function currentPost(comic){
    const natural=naturalCity&&!comic,taps=quality.lite?4:12,key=`${natural?'natural':'comic'}/${taps}/${quality.samples}`;
    if(!passes.has(key))passes.set(key,natural?createBiggasCityPost(renderer,scene,camera,{samples:quality.samples,warmth:look.warmth}):createComicPost(renderer,scene,camera,{glowSamples:taps,samples:quality.samples}));
    stats.glowSamples=natural?0:taps;return passes.get(key);
  }
  function applyLook(comic,reduced){
    if(comic)look?.update({enabled:false});
    if(lastComic!==comic){materials.setEnabled(comic);lastComic=comic;}materials.sync();
    if(!comic)look?.update({reducedMotion:reduced});
    style.pixelRatio.value=renderer.getPixelRatio();renderer.getDrawingBufferSize(style.resolution.value);
  }
  const boost=await createBoost(renderer,scene,vehicle);
  const botFlame=createFlameMaterial(),botTrail=createFlameTrail(scene,botFlame.material,oil.botShip.config.exhausts);
  const botSettings={Activa:true,Longitud:2.7,Ancho:.7,Pulsación:.02,Turbulencia:1.3,Trama:'Dither'};
  const graphics={
    boost,stats,look,
    setQuality(settings){quality={samples:settings.samples?4:0,lite:!!settings.lite};boost.setQuality(quality.lite);stats.glowSamples=quality.lite?4:12;stats.samples=quality.samples;},
    reset(){boost.clear();botTrail.clear();},
    async prepare(options){
      applyLook(options.comic,options.reduced);
      await warmupFlightScene(scene,async()=>{
        await currentPost(options.comic).compile();
        await graphics.render({...options,dt:0});
      });
    },
    async render({dt=0,state,phase,comic=true,reduced=false}={}){
      // The initial binding is explicit; it doesn't depend on a UI event.
      applyLook(comic,reduced);
      const running=phase==='flying'||phase==='countdown';
      const mode=state.boosting?'Turbo':state.speed>1?'Aceleración':'Reposo';
      await boost.update(running?dt:0,mode,!reduced);
      scene.updateMatrixWorld(true);
      botFlame.update(oil.sim.time,botSettings,false);botTrail.record(oil.sim.time,oil.botShip.root);
      botTrail.update(oil.sim.time,{...botSettings,Activa:oil.botShip.root.visible&&oil.botShip.root.parent.visible&&!reduced},.45,7.5,.8);
      const post=currentPost(comic);camera.updateMatrixWorld();boost.updateHeat(post.heat);if(post.comic)post.comic.value=Number(comic);
      await post.render();
    },
    dispose(){botTrail.dispose();botFlame.material.dispose();boost.dispose();look?.dispose();materials.dispose();for(const post of passes.values())post.dispose();passes.clear();baseline.dispose();},
  };
  return graphics;
}
