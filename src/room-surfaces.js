import {retro} from './retro-material.js';
import {SURFACE_FAMILIES,createSurfaceTexture} from './surface-library.js';

// Every family owns one color/height pair per room. Materials with different
// dyes reuse it; imported poster and rug artwork stay on their own maps.
export function createRoomSurfaces() {
  const maps=new Map(),materials=new Set();
  return {
    material(kind,color) {
      const preset=SURFACE_FAMILIES[kind];if(!preset)throw new Error(`Unknown surface family: ${kind}`);
      if(!maps.has(kind))maps.set(kind,{map:createSurfaceTexture(kind),bumpMap:createSurfaceTexture(kind,{heightMap:true})});
      const material=retro(color,{...maps.get(kind),bumpScale:preset.bump,mottle:preset.mottle,facetVariation:preset.facets});
      material.name=preset.label;material.userData.surfaceFamily=kind;materials.add(material);return material;
    },
    dispose(){materials.forEach(material=>material.dispose());maps.forEach(({map,bumpMap})=>{map.dispose();bumpMap.dispose();});materials.clear();maps.clear();},
  };
}
