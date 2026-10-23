import {retro} from './retro-material.js';

// Convert once, before templates are cached or color slots are collected, so
// restored scenes and newly added models share the room's live print settings.
export function applySceneMaterials(root) {
  const materials=new Map();
  function printed(source) {
    if(source.userData.retro)return source;
    if(!materials.has(source)){
      const options={};
      for(const key of ['map','alphaMap','alphaTest','transparent','opacity','side','vertexColors',
        'emissive','emissiveMap','emissiveIntensity','normalMap','normalMapType','normalScale',
        'bumpMap','bumpScale','aoMap','aoMapIntensity','lightMap','lightMapIntensity','depthWrite','depthTest']){
        if(source[key]!==undefined)options[key]=source[key]?.clone&& !source[key].isTexture?source[key].clone():source[key];
      }
      const material=retro(source.color?.clone()??0xffffff,options);
      material.name=source.name;
      material.userData={...source.userData,...material.userData};
      materials.set(source,material);
    }
    return materials.get(source);
  }
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    mesh.material=Array.isArray(mesh.material)?mesh.material.map(printed):printed(mesh.material);
  });
  // Texture resources remain shared by the converted materials.
  for(const source of materials.keys())source.dispose();
}
