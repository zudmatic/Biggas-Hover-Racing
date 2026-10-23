import {retro} from './retro-material.js';
import {retroStyle} from './retro-style.js';
import {createPrintPass} from './retro-print.js';

// Preserve the original materials; preview the same surface ink and finishing
// pass used by the room, including asynchronously loaded wardrobe meshes.
export function createCharacterComic(renderer) {
  const pass=createPrintPass(renderer,{comic:true}),cache=new Map();
  function printed(source) {
    if(source.userData.characterEyeSurface||source.userData.retro||!source.color||source.isMeshBasicMaterial||source.isShadowMaterial)return source;
    let entry=cache.get(source);
    if(!entry) {
      const material=retro(source.color.clone(),{map:source.map,side:source.side,transparent:source.transparent,opacity:source.opacity,mottle:.08,facetVariation:.1});
      const release=()=>{material.dispose();cache.delete(source);source.removeEventListener('dispose',release);};
      source.addEventListener('dispose',release);entry={material,release};cache.set(source,entry);
    }
    const material=entry.material;
    if(material.map!==source.map||material.bumpMap!==source.bumpMap||material.flatShading!==source.flatShading||material.vertexColors!==source.vertexColors)material.needsUpdate=true;
    material.map=source.map;material.flatShading=source.flatShading;material.vertexColors=source.vertexColors;
    material.bumpMap=source.bumpMap;material.bumpScale=source.bumpScale??1;
    material.color.copy(source.color);material.wireframe=source.wireframe;
    material.emissive.copy(source.emissive);material.emissiveIntensity=source.emissiveIntensity;
    return material;
  }
  return {
    render(scene,camera,background) {
      retroStyle.setLook('comic');retroStyle.setPixelRatio(renderer.getPixelRatio());retroStyle.params.paper=background;
      const restored=[],originalBackground=scene.background;
      scene.traverseVisible(mesh=>{
        if(!mesh.isMesh)return;
        const source=mesh.material;
        restored.push([mesh,source]);mesh.material=Array.isArray(source)?source.map(printed):printed(source);
      });
      scene.background=null;
      try{pass.render(scene,camera);}
      finally{scene.background=originalBackground;for(const [mesh,material] of restored)mesh.material=material;}
    },
    dispose(){for(const entry of [...cache.values()])entry.release();pass.dispose();},
  };
}
