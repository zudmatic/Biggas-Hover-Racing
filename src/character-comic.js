import {retro} from './retro-material.js';
import {retroStyle} from './retro-style.js';
import {createPrintPass} from './retro-print.js';

// Preserve the original materials while applying the shared comic ink and
// finishing pass to the pilot and ships.
export function createCharacterComic(renderer,{samples=4,glowSamples=12,lite=false}={}) {
  const pass=createPrintPass(renderer,{comic:true}),cache=new Map();
  const restored=[],sources=[],arrays=new WeakMap(),synced=new Set();
  function printed(source) {
    if(source.userData.characterEyeSurface||source.userData.retro||!source.color||source.isMeshBasicMaterial||source.isShadowMaterial)return source;
    let entry=cache.get(source);
    if(!entry) {
      const material=retro(source.color.clone(),{map:source.map,side:source.side,transparent:source.transparent,opacity:source.opacity,alphaTest:source.alphaTest,mottle:.08,facetVariation:.1});
      const release=()=>{material.dispose();cache.delete(source);source.removeEventListener('dispose',release);};
      source.addEventListener('dispose',release);entry={material,release};cache.set(source,entry);
    }
    const material=entry.material;
    if(synced.has(source))return material;
    synced.add(source);
    if(material.map!==source.map||material.bumpMap!==source.bumpMap||material.flatShading!==source.flatShading||material.vertexColors!==source.vertexColors)material.needsUpdate=true;
    material.map=source.map;material.flatShading=source.flatShading;material.vertexColors=source.vertexColors;
    material.bumpMap=source.bumpMap;material.bumpScale=source.bumpScale??1;
    material.color.copy(source.color);material.wireframe=source.wireframe;
    material.emissive.copy(source.emissive);material.emissiveIntensity=source.emissiveIntensity;
    return material;
  }
  function apply(scene){
    synced.clear();
    scene.traverseVisible(mesh=>{
      if(!mesh.isMesh)return;
      const source=mesh.material;
      restored.push(mesh);sources.push(source);
      if(Array.isArray(source)){
        let materials=arrays.get(source);if(!materials){materials=[];arrays.set(source,materials);}
        materials.length=source.length;for(let i=0;i<source.length;i++)materials[i]=printed(source[i]);mesh.material=materials;
      }else mesh.material=printed(source);
    });
  }
  function restore(){for(let i=0;i<restored.length;i++)restored[i].material=sources[i];restored.length=sources.length=0;}
  return {
    get depthTexture(){return pass.material.uniforms.tDepth.value;},
    setQuality(options){samples=options.samples??samples;glowSamples=options.glowSamples??glowSamples;lite=options.lite??lite;},
    async prepare(scene,camera){
      retroStyle.setLook('comic');retroStyle.setLite(lite);apply(scene);
      try{await pass.prepare(scene,camera);}finally{restore();}
    },
    render(scene,camera,background) {
      retroStyle.setLook('comic');retroStyle.setLite(lite);retroStyle.setPixelRatio(renderer.getPixelRatio());retroStyle.params.paper=background;
      const originalBackground=scene.background;apply(scene);
      scene.background=null;
      try{pass.render(scene,camera,{samples,glowSamples});}
      finally{scene.background=originalBackground;restore();}
    },
    dispose(){for(const entry of [...cache.values()])entry.release();pass.dispose();},
  };
}
