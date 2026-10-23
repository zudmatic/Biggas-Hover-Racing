import * as THREE from 'three';

// Keep authored objects for animation, picking and lighting. Only their draw
// submissions move into batches; the editor continues using the original graph.
export const ROOM_SOURCE_LAYER=31;
const version=attribute=>attribute.isInterleavedBufferAttribute?attribute.data.version:attribute.version;
export function createRoomBatches(root,{enabled=true,exclude=[]}={}) {
  const batches=[],records=[];
  const excluded=new Set();for(const object of exclude)object.traverse(child=>excluded.add(child));
  if(enabled){
    const parents=[];root.traverse(parent=>parents.push(parent));
    for(const parent of parents){
      const groups=new Map();
      for(const mesh of parent.children){
        const geometry=mesh.geometry,material=mesh.material;
        if(excluded.has(mesh)||!mesh.isMesh||mesh.isSkinnedMesh||mesh.isInstancedMesh||mesh.isBatchedMesh||mesh.morphTargetInfluences||
          !geometry||Array.isArray(material)||!material.visible||material.transparent||material.isShaderMaterial||
          mesh.layers.mask!==1||mesh.userData.hitArea||geometry.drawRange.start||geometry.drawRange.count!==Infinity||
          mesh.onBeforeRender!==THREE.Object3D.prototype.onBeforeRender)continue;
        mesh.updateMatrix();if(mesh.matrix.determinant()<0)continue;
        const format=Object.entries(geometry.attributes).sort().map(([name,a])=>`${name}:${a.itemSize}:${a.normalized}:${a.array?.constructor.name??a.data.array.constructor.name}`).join('|');
        const key=`${material.uuid}/${mesh.castShadow}/${mesh.receiveShadow}/${mesh.renderOrder}/${Boolean(geometry.index)}/${format}`;
        if(!groups.has(key))groups.set(key,[]);groups.get(key).push(mesh);
      }
      for(const meshes of groups.values()){
        if(meshes.length<3)continue;
        const geometries=[...new Set(meshes.map(mesh=>mesh.geometry))];
        const batch=new THREE.BatchedMesh(meshes.length,geometries.reduce((n,g)=>n+g.attributes.position.count,0),
          geometries.reduce((n,g)=>n+(g.index?.count??0),0),meshes[0].material);
        batch.name='Piezas agrupadas';batch.userData.roomBatch=true;
        batch.castShadow=meshes[0].castShadow;batch.receiveShadow=meshes[0].receiveShadow;batch.renderOrder=meshes[0].renderOrder;
        // Individual entries still cull against each camera (including shadows).
        // Bounds and ray queries use the authored meshes, not a second copy.
        batch.frustumCulled=false;batch.boundingBox=new THREE.Box3();batch.raycast=()=>{};
        const ids=new Map(geometries.map(geometry=>[geometry,batch.addGeometry(geometry)]));
        for(const mesh of meshes){
          mesh.updateMatrix();const id=batch.addInstance(ids.get(mesh.geometry));batch.setMatrixAt(id,mesh.matrix);batch.setVisibleAt(id,mesh.visible);
          const attributes=[...Object.entries(mesh.geometry.attributes),...(mesh.geometry.index?[[null,mesh.geometry.index]]:[])]
            .map(([name,attribute])=>({name,attribute,version:version(attribute)}));
          records.push({mesh,batch,id,parent,geometry:mesh.geometry,attributes,matrix:mesh.matrix.clone(),layers:mesh.layers.mask,active:true});
          mesh.layers.set(ROOM_SOURCE_LAYER);
        }
        parent.add(batch);batches.push(batch);
      }
    }
  }
  function release(record){record.batch.setVisibleAt(record.id,false);record.mesh.layers.mask=record.layers;record.active=false;}
  function update(){
    for(const record of records){
      if(!record.active)continue;
      const {mesh,batch,id}=record;
      // Deforming cloth, changing UVs or a newly painted material falls back
      // immediately to its authored draw, with no stale copy left on screen.
      if(mesh.parent!==record.parent||mesh.geometry!==record.geometry||mesh.material!==batch.material||mesh.material.transparent||
        mesh.castShadow!==batch.castShadow||mesh.receiveShadow!==batch.receiveShadow||mesh.renderOrder!==batch.renderOrder||
        record.attributes.some(item=>(item.name?mesh.geometry.attributes[item.name]:mesh.geometry.index)!==item.attribute||version(item.attribute)!==item.version)){release(record);continue;}
      if(mesh.matrixAutoUpdate)mesh.updateMatrix();
      if(!record.matrix.equals(mesh.matrix)){
        if(mesh.matrix.determinant()<0){release(record);continue;}
        record.matrix.copy(mesh.matrix);batch.setMatrixAt(id,mesh.matrix);
      }
      batch.setVisibleAt(id,mesh.visible);
    }
  }
  return {batches,sourceCount:records.length,update,dispose(){for(const record of records)if(record.active)release(record);for(const batch of batches){batch.removeFromParent();batch.dispose();}}};
}
