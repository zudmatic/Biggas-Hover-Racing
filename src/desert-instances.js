import * as THREE from 'three';

// r182 puts small instance arrays in uniform blocks. Some WebGL2 devices
// allow only 16 KB per block, so keep batches below that limit. Spatial cells
// also let the renderer cull vegetation without changing any placement.
export function partitionDesertInstances(root,{cellSize=200,maxInstances=128}={}){
  root.updateMatrixWorld(true);
  const sources=[];root.traverse(o=>{if(o.isInstancedMesh)sources.push(o);});
  const local=new THREE.Matrix4(),world=new THREE.Matrix4(),color=new THREE.Color();
  for(const source of sources){
    const cells=new Map();
    for(let i=0;i<source.count;i++){
      source.getMatrixAt(i,local);world.multiplyMatrices(source.matrixWorld,local);
      const key=`${Math.floor(world.elements[12]/cellSize)},${Math.floor(world.elements[14]/cellSize)}`;
      if(!cells.has(key))cells.set(key,[]);cells.get(key).push(i);
    }
    for(const [key,indices] of cells)for(let start=0;start<indices.length;start+=maxInstances){
      const count=Math.min(maxInstances,indices.length-start);
      const batch=new THREE.InstancedMesh(source.geometry,source.material,count);
      batch.name=`${source.name}_${key}_${start}`;
      batch.matrix.copy(source.matrix);batch.matrixAutoUpdate=false;
      for(let i=0;i<count;i++){
        source.getMatrixAt(indices[start+i],local);batch.setMatrixAt(i,local);
        if(source.instanceColor){source.getColorAt(indices[start+i],color);batch.setColorAt(i,color);}
      }
      batch.instanceMatrix.needsUpdate=true;
      if(batch.instanceColor)batch.instanceColor.needsUpdate=true;
      batch.computeBoundingBox();batch.computeBoundingSphere();source.parent.add(batch);
    }
    source.removeFromParent();source.dispose();
  }
  root.updateMatrixWorld(true);
}
