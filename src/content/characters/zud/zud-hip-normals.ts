import * as THREE from 'three';

// The hips overlap to allow independent leg animation. Blend their surface
// normals in a narrow contact band, just as one welded skin would, so the
// buried pelvis edge does not read as a separate piece in smooth shading.
// Positions, shadows and articulated geometry remain real, closed surfaces.
export function smoothHipNormals(model) {
  const torso=model.root.getObjectByName('Torso');
  const meshes=[torso,...model.feet.map(hip=>hip.getObjectByName('Pierna'))];
  model.root.updateMatrixWorld(true);
  const inverse=model.root.matrixWorld.clone().invert();
  const surfaces=meshes.map(mesh=>{
    const transform=inverse.clone().multiply(mesh.matrixWorld),normalMatrix=new THREE.Matrix3().getNormalMatrix(transform);
    const position=mesh.geometry.attributes.position,normal=mesh.geometry.attributes.normal;
    const points=Array.from({length:position.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(transform));
    const normals=Array.from({length:normal.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(normal,i).applyMatrix3(normalMatrix).normalize());
    // The same rest frame also keeps comic hatching continuous at the hips.
    const offsets=new Float32Array(position.count*3),offset=new THREE.Vector3();
    points.forEach((point,i)=>{
      offset.fromBufferAttribute(position,i).sub(point).negate();offset.toArray(offsets,i*3);
    });
    mesh.geometry.setAttribute('retroPrintOffset',new THREE.BufferAttribute(offsets,3));
    const index=mesh.geometry.index,triangles=[];
    for(let i=0;i<(index?.count??position.count);i+=3) {
      const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j);
      const triangle=new THREE.Triangle(...ids.map(i=>points[i]));
      const bounds=new THREE.Box3().setFromPoints([triangle.a,triangle.b,triangle.c]);
      if(bounds.max.y< -1.17||bounds.min.y>-.73)continue;
      triangles.push({triangle,ids,bounds});
    }
    return {mesh,points,normals,triangles,inverseNormal:normalMatrix.clone().invert()};
  });
  const band=.11,closest=new THREE.Vector3(),barycentric=new THREE.Vector3(),otherNormal=new THREE.Vector3(),blended=new THREE.Vector3();
  for(const [surfaceIndex,surface] of surfaces.entries()) {
    const candidates=surfaceIndex===0?surfaces.slice(1):[surfaces[0]];
    const attribute=surface.mesh.geometry.attributes.normal;
    surface.points.forEach((point,i)=>{
      if(point.y< -1.17||point.y>-.73)return;
      let distance=band,nearest=null,neighbor=null;
      for(const other of candidates)for(const face of other.triangles) {
        if(face.bounds.distanceToPoint(point)>distance)continue;
        face.triangle.closestPointToPoint(point,closest);
        const next=point.distanceTo(closest);
        if(next>=distance)continue;
        distance=next;nearest=face;neighbor=other;
        face.triangle.getBarycoord(closest,barycentric);
        otherNormal.set(0,0,0);
        nearest.ids.forEach((id,j)=>otherNormal.addScaledVector(neighbor.normals[id],barycentric.getComponent(j)));
      }
      if(!nearest||otherNormal.lengthSq()<1e-8)return;
      otherNormal.normalize();
      // Opposite walls of the crotch are distinct surfaces, not a seam.
      if(surface.normals[i].dot(otherNormal)<-.35)return;
      const weight=.5*(1-THREE.MathUtils.smoothstep(distance,0,band));
      blended.copy(surface.normals[i]).lerp(otherNormal,weight).normalize().applyMatrix3(surface.inverseNormal).normalize();
      attribute.setXYZ(i,blended.x,blended.y,blended.z);
    });
    attribute.needsUpdate=true;
  }
}
