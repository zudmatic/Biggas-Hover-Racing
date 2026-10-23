import {retro} from './retro-material.js';

// Indoor and outdoor foliage share the pack's textures and diffuse treatment.
export function natureMaterial(source) {
  const material=retro(source.color.clone(),{map:source.map,alphaTest:source.alphaTest,side:source.side,
    vertexColors:source.vertexColors,flatShading:false,mottle:.04,facetVariation:.05});
  material.name=`Naturaleza · ${source.name}`;
  return material;
}
