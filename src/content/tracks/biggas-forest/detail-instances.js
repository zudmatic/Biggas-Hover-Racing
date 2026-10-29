import * as THREE from 'three';

// Rendering only: logical objects keep their own transforms and gameplay state.
// Opt in with identical geometry/material; never batch deforming or transparent meshes.
export function createDetailInstances(root,geometry,material,capacity,{name='Decoración agrupada',dynamic=false}={}){
  const mesh=new THREE.InstancedMesh(geometry,material,capacity),objects=[],matrices=[];
  mesh.name=name;mesh.count=0;mesh.castShadow=true;mesh.receiveShadow=true;
  if(dynamic)mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  root.add(mesh);
  const inverse=new THREE.Matrix4(),matrix=new THREE.Matrix4();
  let initialized=false;
  return {
    mesh,
    add(parent=root){
      if(objects.length>=capacity)throw new Error(`Too many instances: ${name}`);
      const object=new THREE.Object3D();parent.add(object);objects.push(object);matrices.push(new THREE.Matrix4());mesh.count=objects.length;initialized=false;
      return object;
    },
    update(){
      if(initialized&&!dynamic)return;
      root.updateWorldMatrix(true,false);inverse.copy(root.matrixWorld).invert();
      let changed=!initialized;
      objects.forEach((object,index)=>{
        object.updateWorldMatrix(true,false);matrix.multiplyMatrices(inverse,object.matrixWorld);
        if(!initialized||!matrix.equals(matrices[index])){mesh.setMatrixAt(index,matrix);matrices[index].copy(matrix);changed=true;}
      });
      if(changed){mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();}
      initialized=true;
    },
  };
}
