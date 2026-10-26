import {createFlameMaterial} from './vfx/flame-material.js';
import {createFlameTrail} from './vfx/flame-trail.js';
import {createGameRenderer} from './game-renderer.js';
import {attribute} from 'three/tsl';
import {createBaseMaterials} from './base-materials.js';
import {createComicStyle,createComicMaterials} from './comic-tsl-material.js';
import {createComicPost} from './comic-tsl-post.js';
import {createBoost} from './vfx/boost.js';
import {createSingularityEngine} from './vfx/singularity-engine.js';
import {createLensUniforms} from './vfx/singularity-lens.js';
import {createSmokeMaterial} from './vfx/smoke-material.js';
import {createOilMaterial} from './vfx/oil.js';

export {createSmokeMaterial};
export const oilMaterialFactory=()=>createOilMaterial(attribute('color','vec4').a);
export async function createRenderer(canvas,forceWebGL){
  return createGameRenderer(canvas,{forceWebGL});
}
// Exhaust engines share one contract: stats, clear, setQuality, update, updatePost, dispose.
const ENGINES={flame:createBoost,singularity:createSingularityEngine};
export const createEngine=(renderer,scene,ship,options)=>ENGINES[ship.config.engine??'flame'](renderer,scene,ship,options);

// Rendering adapter only: the simulator owns physics, race timing and cameras.
export async function createFlightWebGPU(renderer,scene,camera,vehicle,oil,boostPads){
  const baseline=createBaseMaterials(scene),style=createComicStyle(),materials=createComicMaterials(scene,style);
  const passes=new Map(),lens=vehicle.config.engine==='singularity'?createLensUniforms():null;let quality={samples:4,glowSamples:12,lite:false},lastComic=null;
  const stats={glowSamples:12,samples:4};
  function currentPost(){
    const taps=quality.lite?4:12,key=`${taps}/${quality.samples}`;
    if(!passes.has(key))passes.set(key,createComicPost(renderer,scene,camera,{glowSamples:taps,samples:quality.samples,lens}));
    return passes.get(key);
  }
  const boost=await createEngine(renderer,scene,vehicle,{camera,lens});
  const botFlame=createFlameMaterial(),botTrail=createFlameTrail(scene,botFlame.material,oil.botShip.config.exhausts);
  const botSettings={Activa:true,Longitud:2.7,Ancho:.7,Pulsación:.02,Turbulencia:1.3,Trama:'Dither'};
  return {
    boost,stats,
    setQuality(settings){quality={samples:settings.samples?4:0,lite:!!settings.lite};boost.setQuality(quality.lite);stats.glowSamples=quality.lite?4:12;stats.samples=quality.samples;},
    reset(){boost.clear();botTrail.clear();},
    async render({dt=0,state,phase,comic=true,reduced=false}={}){
      // The initial binding is explicit; it doesn't depend on a UI event.
      if(lastComic!==comic){materials.setEnabled(comic);lastComic=comic;}materials.sync();style.pixelRatio.value=renderer.getPixelRatio();renderer.getDrawingBufferSize(style.resolution.value);
      const running=phase==='flying'||phase==='countdown'||phase==='intro';
      const mode=state.boosting?'Turbo':state.speed>1?'Aceleración':'Reposo';
      await boost.update(running?dt:0,mode,!reduced,state.boosting&&state.padBoostRemaining>0,state);
      scene.updateMatrixWorld(true);
      botFlame.update(oil.sim.time,botSettings,false);botTrail.record(oil.sim.time,oil.botShip.root);
      botTrail.update(oil.sim.time,{...botSettings,Activa:oil.botShip.root.visible&&oil.botShip.root.parent.visible&&!reduced},.45,7.5,.8);
      const post=currentPost();camera.updateMatrixWorld();boost.updatePost(post);post.comic.value=Number(comic);
      post.heat.updatePadFields(reduced?[]:boostPads?.heatFields??[]);
      await post.render();
    },
    dispose(){botTrail.dispose();botFlame.material.dispose();boost.dispose();materials.dispose();for(const post of passes.values())post.dispose();passes.clear();baseline.dispose();},
  };
}
