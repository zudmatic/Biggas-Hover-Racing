import * as THREE from 'three';

// Optimizers may remove identity-only grouping nodes. Recover their roles from
// the retained scene and mesh metadata, without changing authored transforms.
export function extractDesertRuntimeData(asset){
  const root=asset.scene,manifest=root.userData.desertDetailManifest;
  const runtime=asset.scenes.find(scene=>scene.userData.desertRuntimeData===true);
  root.updateMatrixWorld(true);runtime?.updateMatrixWorld(true);
  let details=runtime?.getObjectByName('DESERT_VISUAL_DETAILS')??root.getObjectByName('DESERT_VISUAL_DETAILS');
  let collisions=runtime?.getObjectByName('DESERT_COLLISION_REPLACEMENTS');
  let placed=root.getObjectByName('DESERT_PLACED_DETAILS');
  if(runtime&&manifest?.families){
    if(!details){
      details=new THREE.Group();details.name='DESERT_VISUAL_DETAILS';
      const names=new Set([...manifest.families.flatMap(f=>f.nodes),...manifest.replacements.map(r=>r.node)]),nodes=[];
      runtime.traverse(node=>{if(names.has(node.name))nodes.push(node);});
      for(const node of nodes)details.attach(node);
    }
    if(!collisions){
      collisions=new THREE.Group();collisions.name='DESERT_COLLISION_REPLACEMENTS';
      const sources=new Set([...manifest.families.map(f=>f.replacesSource),...manifest.replacements.map(r=>r.source)].filter(Boolean)),nodes=[];
      runtime.traverse(node=>{if(node.userData.role==='vegetation'||sources.has(node.userData.source_object))nodes.push(node);});
      for(const node of nodes)collisions.attach(node);
    }
    if(!placed){
      placed=new THREE.Group();placed.name='DESERT_PLACED_DETAILS';
      const nodes=[];root.traverse(node=>{if(node.userData.visualDetail&&node.userData.detailFamily)nodes.push(node);});
      for(const node of nodes)placed.attach(node);
    }
  }
  return {details,collisions,placed,manifest};
}
