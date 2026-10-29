import * as THREE from 'three';

// Smooth shared organic templates once, across their material seams. Positions,
// topology and collision silhouettes are untouched: the forest gains no faces.
export function smoothOrganicNormals(geometries,{crease=Math.PI}={}){
  const buckets=new Map(),corners=[],a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),ab=new THREE.Vector3(),ac=new THREE.Vector3(),normal=new THREE.Vector3();
  const key=(p,i)=>`${Math.round(p.getX(i)*1e4)},${Math.round(p.getY(i)*1e4)},${Math.round(p.getZ(i)*1e4)}`;
  for(const geometry of geometries){
    const p=geometry.attributes.position,index=geometry.index,faces=index?.count??p.count,vertexCorners=Array.from({length:p.count},()=>[]);
    for(let i=0;i<faces;i+=3){
      const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k);a.fromBufferAttribute(p,ids[0]);b.fromBufferAttribute(p,ids[1]);c.fromBufferAttribute(p,ids[2]);normal.crossVectors(ab.subVectors(b,a),ac.subVectors(c,a)).normalize();
      if(normal.lengthSq()<.5)continue;
      const vertices=[a,b,c];
      for(let k=0;k<3;k++){
        const angle=ab.subVectors(vertices[(k+1)%3],vertices[k]).angleTo(ac.subVectors(vertices[(k+2)%3],vertices[k])),entry={normal:normal.clone(),weight:angle},bucket=key(p,ids[k]);
        if(!buckets.has(bucket))buckets.set(bucket,[]);buckets.get(bucket).push(entry);vertexCorners[ids[k]].push(entry);
      }
    }
    corners.push({geometry,vertexCorners});
  }
  const threshold=Math.cos(crease),sum=new THREE.Vector3(),reference=new THREE.Vector3();
  for(const {geometry,vertexCorners} of corners){
    const p=geometry.attributes.position,old=geometry.attributes.normal,n=new Float32Array(p.count*3);
    for(let i=0;i<p.count;i++){
      if(old)reference.fromBufferAttribute(old,i).normalize();else reference.copy(vertexCorners[i][0]?.normal??new THREE.Vector3(0,1,0));
      sum.set(0,0,0);for(const entry of buckets.get(key(p,i))??[])if(reference.dot(entry.normal)>threshold-1e-5)sum.addScaledVector(entry.normal,entry.weight);
      if(sum.lengthSq()<1e-10)sum.copy(reference);sum.normalize().toArray(n,i*3);
    }
    geometry.setAttribute('normal',new THREE.BufferAttribute(n,3));geometry.userData.biggasSmooth=true;
  }
}

export function polishBiggasForest(assets,textures){
  const seen=new Set();let templates=0;
  for(const asset of assets)asset.scene.traverse(parent=>{
    const meshes=parent.children.filter(o=>o.isMesh&&/^F039_(Leaf|Pine|Bark|Birch)/.test(o.material?.name??''));
    for(const foliage of [true,false]){
      const parts=meshes.filter(o=>/Leaf|Pine/.test(o.material.name)===foliage),key=parts.map(o=>o.geometry.uuid).sort().join(':');
      if(!parts.length||seen.has(key))continue;seen.add(key);
      for(const mesh of parts)textures?.apply(mesh);
      smoothOrganicNormals(parts.map(o=>o.geometry),{crease:foliage?Math.PI:Math.PI*.43});templates+=parts.length;
    }
  });
  return templates;
}
