import {Color,DynamicDrawUsage,Vector3} from 'three';
import {lights} from 'three/tsl';

// Imported batches already have fixed bounds. Include the stationary runtime
// dressing as well (grass, market, viaduct and gallery), while moving trains,
// traffic, leaves, water and deforming pennants retain their dynamic lighting.
export function collectBiggasStaticLighting(root,authored=[]){
  const meshes=new Set(authored);
  root.traverse(mesh=>{
    if(!mesh.isMesh||mesh.isInstancedMesh||!mesh.material?.isMeshStandardMaterial||mesh.material.transparent||mesh.geometry.attributes.position?.usage===DynamicDrawUsage)return;
    for(let parent=mesh;parent;parent=parent.parent)if(parent.userData.dynamicLighting)return;
    meshes.add(mesh);
  });
  return [...meshes];
}

// Hold the source materials after light-group cloning. Both PSX and comic
// variants share their colors and synchronize emissiveIntensity from these.
export function createBiggasBuildingLights(root){
  const materials=new Set();let glass;
  root.traverse(mesh=>{for(const material of [].concat(mesh.material??[])){
    if(material.name==='039_TealGlass')glass=material.color;
    if(material.name==='039_WindowWarm'||material.name==='039_CyanAccent')materials.add(material);
  }});
  const daylightGlass=glass?.clone()??new Color().setRGB(.035,.13,.16);
  const entries=[...materials].map(material=>({material,color:material.color.clone(),intensity:material.emissiveIntensity,window:material.name==='039_WindowWarm'}));
  let current=null;
  function update(night=false){
    night=!!night;if(current===night)return;current=night;
    for(const entry of entries){
      entry.material.emissiveIntensity=night?entry.intensity:0;
      if(entry.window)entry.material.color.copy(night?entry.color:daylightGlass);
    }
  }
  update(false);return {update,get night(){return current;},count:entries.length};
}

// Permanent fixtures have finite ranges. A light outside a static batch's
// bounds contributes exactly zero, so omit it from that batch's shader. This
// does not switch lights on/off or depend on the vehicle/camera position.
export function createBiggasLightingBatches(meshes,fixtures){
  for(const light of fixtures)light.userData.biggasFixedLight=true;
  const groups=new Map(),variants=new Map(),bindings=[],point=new Vector3();
  let originalEvaluations=0,selectedEvaluations=0;
  for(const mesh of meshes){
    if(!mesh.material?.isMeshStandardMaterial||Array.isArray(mesh.material))continue;
    mesh.updateWorldMatrix(true,false);
    if(mesh.isInstancedMesh)mesh.computeBoundingBox();else mesh.geometry.computeBoundingBox();
    const bounds=(mesh.isInstancedMesh?mesh.boundingBox:mesh.geometry.boundingBox).clone().applyMatrix4(mesh.matrixWorld).expandByScalar(mesh.userData.biggasLightMargin??.1);
    const selected=fixtures.filter(light=>{
      if(!light.distance)return true;
      light.getWorldPosition(point);return bounds.distanceToPoint(point)<=light.distance;
    });
    const key=selected.map(light=>light.uuid).join(':');
    if(!groups.has(key))groups.set(key,{node:lights(selected),selected});
    const group=groups.get(key),source=mesh.material,materialKey=`${source.uuid}:${key}`;
    if(!variants.has(materialKey)){
      const material=source.clone();material.lightsNode=group.node;
      // Conventional materials are converted by WebGPURenderer. Unlike native
      // NodeMaterials, their default shader key does not include lightsNode.
      material.customProgramCacheKey=()=>`${source.customProgramCacheKey()}:biggas:${group.node.getCacheKey()}`;
      variants.set(materialKey,material);
    }
    mesh.material=variants.get(materialKey);bindings.push({mesh,bounds,selected});
    originalEvaluations+=fixtures.length;selectedEvaluations+=selected.length;
  }
  return {bindings,stats:{batches:bindings.length,groups:groups.size,originalEvaluations,selectedEvaluations},
    setGlobalLights(globalLights){for(const {node,selected} of groups.values())node.setLights([...globalLights,...selected]);},
  };
}
