import * as THREE from 'three';

// The stage-one baseline deliberately excludes custom GLSL. Keep maps, alpha,
// sides, emissive, skinning and the native lighting model on both backends.
export function createBaseMaterials(root){
  const replacements=new Map(),originals=[],hidden=[];
  const stats={meshes:0,textured:0,transparent:0,customExcluded:0};
  function base(source){
    if(source.isNodeMaterial||!source.userData.retro)return source;
    if(replacements.has(source))return replacements.get(source);
    const material=new THREE.MeshLambertMaterial();
    material.copy(source);material.userData={};material.defines={};
    replacements.set(source,material);return material;
  }
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const materials=[].concat(mesh.material);
    if(materials.some(m=>m.isShaderMaterial)){
      hidden.push([mesh,mesh.visible]);mesh.visible=false;stats.customExcluded++;return;
    }
    stats.meshes++;if(materials.some(m=>m.map))stats.textured++;if(materials.some(m=>m.transparent))stats.transparent++;
    originals.push([mesh,mesh.material]);
    mesh.material=Array.isArray(mesh.material)?materials.map(base):base(mesh.material);
  });
  return {stats,dispose(){for(const [mesh,material] of originals)mesh.material=material;for(const [mesh,visible] of hidden)mesh.visible=visible;for(const m of replacements.values())m.dispose();}};
}
