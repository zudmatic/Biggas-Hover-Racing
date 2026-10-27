import {createFlameMaterial} from './vfx/flame-material.js';
import {createFlameTrail} from './vfx/flame-trail.js';
import {createGameRenderer} from './game-renderer.js';
import {attribute} from 'three/tsl';
import {createBaseMaterials} from './base-materials.js';
import {createComicStyle,createComicMaterials} from './comic-tsl-material.js';
import {createComicPost} from './comic-tsl-post.js';
import {createDesertPost} from './desert-post.js';
import {createDesertLook} from './desert-look.js';
import {createBoost} from './vfx/boost.js';
import {createSmokeMaterial} from './vfx/smoke-material.js';
import {createOilMaterial} from './vfx/oil.js';

export {createSmokeMaterial};
export const oilMaterialFactory=()=>createOilMaterial(attribute('color','vec4').a);
export async function createRenderer(canvas,forceWebGL){
  return createGameRenderer(canvas,{forceWebGL});
}

// Rendering adapter only: the simulator owns physics, race timing and cameras.
export async function createFlightWebGPU(renderer,scene,camera,vehicle,oil,{naturalDesert=false}={}){
  const baseline=createBaseMaterials(scene),style=createComicStyle();let materials=null;
  const look=naturalDesert?createDesertLook(scene,renderer):null;let postEnabled=true;
  const passes=new Map();let quality={samples:4,glowSamples:12,lite:false},lastComic=null;
  const stats={glowSamples:12,samples:4};
  function currentPost(comic){
    const natural=naturalDesert&&!comic,taps=quality.lite?4:12,key=`${natural?'natural':'comic'}/${taps}/${quality.samples}`;
    if(!passes.has(key))passes.set(key,natural?createDesertPost(renderer,scene,camera,{samples:quality.samples,warmth:look.warmth}):createComicPost(renderer,scene,camera,{glowSamples:taps,samples:quality.samples}));
    stats.glowSamples=natural?0:taps;
    return passes.get(key);
  }
  const boost=await createBoost(renderer,scene,vehicle);
  const botFlame=createFlameMaterial(),botTrail=createFlameTrail(scene,botFlame.material,oil.botShip.config.exhausts);
  const botSettings={Activa:true,Longitud:2.7,Ancho:.7,Pulsación:.02,Turbulencia:1.3,Trama:'Dither'};
  return {
    boost,stats,look,get postEnabled(){return postEnabled;},
    setPostEnabled(value){if(import.meta.env.DEV)postEnabled=!!value;},
    setQuality(settings){quality={samples:settings.samples?4:0,lite:!!settings.lite};boost.setQuality(quality.lite);stats.glowSamples=quality.lite?4:12;stats.samples=quality.samples;},
    reset(){boost.clear();botTrail.clear();},
    async render({dt=0,state,phase,comic=true,reduced=false}={}){
      // The initial binding is explicit; it doesn't depend on a UI event.
      if(comic)look?.update({enabled:false});
      if(comic&&!materials)materials=createComicMaterials(scene,style);
      if(lastComic!==comic){materials?.setEnabled(comic);lastComic=comic;}materials?.sync();style.pixelRatio.value=renderer.getPixelRatio();renderer.getDrawingBufferSize(style.resolution.value);
      if(!comic)look?.update();
      const running=phase==='flying'||phase==='countdown';
      const mode=state.boosting?'Turbo':state.speed>1?'Aceleración':'Reposo';
      await boost.update(running?dt:0,mode,!reduced);
      scene.updateMatrixWorld(true);
      botFlame.update(oil.sim.time,botSettings,false);botTrail.record(oil.sim.time,oil.botShip.root);
      botTrail.update(oil.sim.time,{...botSettings,Activa:oil.botShip.root.visible&&oil.botShip.root.parent.visible&&!reduced},.45,7.5,.8);
      const post=currentPost(comic);camera.updateMatrixWorld();boost.updateHeat(post.heat);if(post.comic)post.comic.value=Number(comic);
      if(postEnabled)await post.render();else await renderer.renderAsync(scene,camera);
    },
    dispose(){botTrail.dispose();botFlame.material.dispose();boost.dispose();materials?.dispose();look?.dispose();for(const post of passes.values())post.dispose();passes.clear();baseline.dispose();},
  };
}
