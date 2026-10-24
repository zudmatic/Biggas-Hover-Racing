import {createComicStyle,createComicMaterials} from './comic-tsl-material.js';
import {createComicPost} from './comic-tsl-post.js';

// Preview actors, hats and palettes can arrive after the first frame. Bind new
// surfaces lazily and restore authored materials after rendering for the UI.
export function createComicView(renderer,scene,camera,options={}){
  const style=createComicStyle(),materials=createComicMaterials(scene,style);
  const post=createComicPost(renderer,scene,camera,options);
  return {heat:post.heat,
    async render(enabled=true,background){
      materials.refresh();materials.setEnabled(enabled);materials.sync();
      style.pixelRatio.value=renderer.getPixelRatio();renderer.getDrawingBufferSize(style.resolution.value);
      const hidden=[];scene.traverse(mesh=>{if(mesh.isMesh&&[].concat(mesh.material).some(m=>m.isShaderMaterial)){hidden.push([mesh,mesh.visible]);mesh.visible=false;}});
      post.comic.value=Number(enabled);
      try{await post.render(background);}finally{materials.setEnabled(false);for(const [mesh,visible] of hidden)mesh.visible=visible;}
    },
    dispose(){materials.dispose();post.dispose();}
  };
}
