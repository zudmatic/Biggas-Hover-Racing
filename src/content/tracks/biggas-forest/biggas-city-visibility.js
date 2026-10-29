import {DynamicDrawUsage,Frustum,Matrix4,Sphere,Vector3} from 'three';

// Keep the original batches/materials, but submit only instances intersecting
// the view OR the sun's shadow camera. No distance LOD, tree removal or fading.
// The full batch bounds stay intact so a culled batch can re-enter the view.
export function createBiggasVisibility(meshes){
  const matrix=new Matrix4(),sphere=new Sphere(),view=new Frustum(),shadowView=new Frustum(),projection=new Matrix4(),target=new Vector3();
  let shadowCamera;
  const entries=meshes.map(mesh=>{
    if(!mesh.geometry.boundingSphere)mesh.geometry.computeBoundingSphere();
    if(!mesh.boundingSphere)mesh.computeBoundingSphere();
    const count=mesh.count,source=mesh.instanceMatrix.array.slice(0,count*16),bounds=new Float32Array(count*4),active=new Int32Array(count).fill(-1);
    for(let i=0;i<count;i++){
      matrix.fromArray(source,i*16);sphere.copy(mesh.geometry.boundingSphere).applyMatrix4(matrix);
      bounds.set([sphere.center.x,sphere.center.y,sphere.center.z,sphere.radius+.05],i*4);
    }
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    return {mesh,count,source,bounds,active};
  });
  const stats={total:entries.reduce((sum,e)=>sum+e.count,0),submitted:0};
  function update(camera,shadowLight){
    if(!camera)return;
    camera.updateMatrixWorld();projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    view.setFromProjectionMatrix(projection,camera.coordinateSystem,camera.reversedDepth);
    let shadowVisible=false;
    if(shadowLight?.castShadow){
      shadowLight.updateWorldMatrix(true,false);shadowLight.target.updateWorldMatrix(true,false);
      // Use a private camera: changing the real shadow matrix here would move
      // cached shadows on frames when the game's shadow update is throttled.
      shadowCamera??=shadowLight.shadow.camera.clone();shadowCamera.copy(shadowLight.shadow.camera,false);
      shadowCamera.coordinateSystem=camera.coordinateSystem;shadowCamera.updateProjectionMatrix();
      shadowCamera.position.setFromMatrixPosition(shadowLight.matrixWorld);target.setFromMatrixPosition(shadowLight.target.matrixWorld);
      shadowCamera.lookAt(target);shadowCamera.updateMatrixWorld();projection.multiplyMatrices(shadowCamera.projectionMatrix,shadowCamera.matrixWorldInverse);
      shadowView.setFromProjectionMatrix(projection,shadowCamera.coordinateSystem,shadowCamera.reversedDepth);shadowVisible=true;
    }
    stats.submitted=0;
    for(const {mesh,count,source,bounds,active} of entries){
      if(!view.intersectsSphere(mesh.boundingSphere)&&!(mesh.castShadow&&shadowVisible&&shadowView.intersectsSphere(mesh.boundingSphere))){mesh.count=0;continue;}
      let visible=0,changed=false;
      for(let i=0;i<count;i++){
        sphere.center.fromArray(bounds,i*4);sphere.radius=bounds[i*4+3];
        if(!view.intersectsSphere(sphere)&&!(mesh.castShadow&&shadowVisible&&shadowView.intersectsSphere(sphere)))continue;
        if(active[visible]!==i){
          active[visible]=i;mesh.instanceMatrix.array.set(source.subarray(i*16,i*16+16),visible*16);changed=true;
        }
        visible++;
      }
      mesh.count=visible;stats.submitted+=visible;if(changed)mesh.instanceMatrix.needsUpdate=true;
    }
  }
  return {update,stats};
}
