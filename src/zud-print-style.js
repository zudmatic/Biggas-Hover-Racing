import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

import { retro } from './retro-material.js';

// Faceted shells retain their silhouettes and contact detail, while their
// diffuse materials now receive the same real scene lighting as the room.
export function printMaterial(color,options) {
  return retro(color,{...options,vertexAO:true,mottle:.15});
}

const random=seed=>{const x=Math.sin(seed*127.1+311.7)*43758.5453;return x-Math.floor(x);};

// Rays exactly on a shared triangle edge can miss both triangles through
// floating-point rounding. Retry infinitesimally nearby; never collapse a
// missing sample into the middle of the character.
function shellDistance(ray,objects,origin,direction,outermost=true) {
  const hitDistance=dir=>{
    ray.set(origin,dir);
    const hits=ray.intersectObjects(objects,false);
    return hits.length?(outermost?hits.at(-1):hits[0]).distance:null;
  };
  const exact=hitDistance(direction);if(exact!==null)return exact;
  const nearby=[];
  for(const offset of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){
    const probe=direction.clone().addScaledVector(new THREE.Vector3(...offset),1e-5).normalize();
    const distance=hitDistance(probe);if(distance!==null)nearby.push(distance);
  }
  if(!nearby.length)throw new Error('Cannot close the Retro Print shell');
  nearby.sort((a,b)=>a-b);return nearby[Math.floor(nearby.length/2)];
}

// Preserve authored joint cross-sections and their overlap. A radial sphere
// erodes flat hip/shoulder caps, making connected limbs look detached.
function jointSurface(mesh){
  // Keep the regular ring topology. Insetting a triangle's center used to
  // introduce a valence-three dent that subdivision amplified into a wrinkle.
  const geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();
  mesh.updateMatrix();geometry.applyMatrix4(mesh.matrix);return geometry;
}

// Shrink-wrap an icosphere onto a part: cast from the part's center through
// each vertex and keep the outermost hit, so the new shell follows the old
// silhouette as one closed surface.
function remesh(group,detail,seed) {
  const proxies=group.map(mesh=> {
    mesh.updateMatrix();
    const proxy=new THREE.Mesh(mesh.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
    proxy.matrixAutoUpdate=false;proxy.matrix.copy(mesh.matrix);proxy.matrixWorld.copy(mesh.matrix);
    return proxy;
  });
  const bounds=new THREE.Box3();proxies.forEach(proxy=>bounds.expandByObject(proxy));
  const center=bounds.getCenter(new THREE.Vector3()),half=bounds.getSize(new THREE.Vector3()).multiplyScalar(.5);
  const sphere=new THREE.IcosahedronGeometry(1,detail);sphere.deleteAttribute('normal');sphere.deleteAttribute('uv');
  const shell=mergeVertices(sphere),position=shell.attributes.position;
  const ray=new THREE.Raycaster(),direction=new THREE.Vector3();
  for(let i=0;i<position.count;i++) {
    direction.fromBufferAttribute(position,i).multiply(half).normalize();
    let distance=shellDistance(ray,proxies,center,direction);
    // Inward-only jitter: irregular facets without ever covering the eyes.
    distance*=1-random(seed+i*1.7)*.016;
    position.setXYZ(i,...center.clone().addScaledVector(direction,distance).toArray());
  }
  proxies.forEach(proxy=>proxy.material.dispose());sphere.dispose();
  const geometry=shell.toNonIndexed();shell.dispose();
  geometry.computeVertexNormals();
  return geometry;
}

// The crown is rebuilt as a clean faceted dome over the cuff (the source
// crown is wavy where it tucks into the band; the reference is a smooth dome).
function remeshDome(mesh,detail,seed) {
  mesh.updateMatrix();
  const bounds=new THREE.Box3().setFromBufferAttribute(mesh.geometry.attributes.position).applyMatrix4(mesh.matrix);
  const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  center.y=bounds.min.y+size.y*.37;
  const radii=new THREE.Vector3(size.x/2,bounds.max.y-center.y,size.z/2);
  const sphere=new THREE.IcosahedronGeometry(1,detail);sphere.deleteAttribute('normal');sphere.deleteAttribute('uv');
  const shell=mergeVertices(sphere),position=shell.attributes.position,point=new THREE.Vector3();
  for(let i=0;i<position.count;i++) {
    point.fromBufferAttribute(position,i).multiply(radii).multiplyScalar(1-random(seed+i*1.3)*.014).add(center);
    position.setXYZ(i,point.x,point.y,point.z);
  }
  sphere.dispose();
  const geometry=shell.toNonIndexed();shell.dispose();geometry.computeVertexNormals();
  return geometry;
}

// The cuff is a ring, so it gets its own shell: around the band, cast from the
// tube's core outward in each direction of the cross-section.
function remeshRing(mesh,around,across,level=1,innerGeometry=null) {
  mesh.updateMatrix();
  const proxy=new THREE.Mesh(mesh.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  proxy.matrixAutoUpdate=false;proxy.matrix.copy(mesh.matrix);proxy.matrixWorld.copy(mesh.matrix);
  const bounds=new THREE.Box3().expandByObject(proxy),size=bounds.getSize(new THREE.Vector3()),middle=bounds.getCenter(new THREE.Vector3());
  const depth=size.z/size.x,ray=new THREE.Raycaster(),points=[];
  const inner=innerGeometry?new THREE.Mesh(innerGeometry,proxy.material):null;
  // The band is arched, so its core follows the original cross-section at
  // each angle: the centroid of the source vertices in that sector.
  const source=mesh.geometry.attributes.position,vertex=new THREE.Vector3();
  const core=theta=> {
    let count=0,radius=0,height=0;
    for(let k=0;k<source.count;k++) {
      vertex.fromBufferAttribute(source,k).applyMatrix4(mesh.matrix).sub(middle);
      const angle=Math.atan2(vertex.x,vertex.z/depth),delta=Math.atan2(Math.sin(angle-theta),Math.cos(angle-theta));
      // Weighted toward the sector's middle; wide enough to catch the source's
      // own, coarser segments.
      const weight=Math.max(0,1-Math.abs(delta)/.45);
      radius+=Math.hypot(vertex.x,vertex.z/depth)*weight;height+=vertex.y*weight;count+=weight;
    }
    return count?{radius:radius/count,height:height/count}:{radius:size.x*.46,height:0};
  };
  // The source beanie is worn tipped back; the reference sits nearly level, so
  // each column is eased toward the band's mean height.
  const cores=[...Array(around)].map((_,i)=>core(i/around*Math.PI*2));
  const mean=cores.reduce((sum,{height})=>sum+height,0)/around;
  for(let i=0;i<around;i++) {
    const theta=i/around*Math.PI*2,{radius,height}=cores[i],lift=(mean+(height-mean)*level)-height;
    const radial=new THREE.Vector3(Math.sin(theta),0,Math.cos(theta)*depth).normalize();
    const origin=new THREE.Vector3(Math.sin(theta)*radius,height,Math.cos(theta)*radius*depth).add(middle);
    const row=[];
    for(let j=0;j<across;j++) {
      const phi=j/across*Math.PI*2;
      const direction=radial.clone().multiplyScalar(Math.cos(phi)).add(new THREE.Vector3(0,Math.sin(phi),0)).normalize();
      ray.set(origin,direction);
      // Nearest wall: from inside the tube, farther hits belong to the other side of the ring.
      const hit=ray.intersectObject(proxy,false)[0];
      const distance=hit?hit.distance:.05;
      const point=origin.clone().addScaledVector(direction,distance).setY(origin.y+direction.y*distance+lift);
      // The rounded crown is narrower than the authored crown. Tuck the
      // cuff's inner wall into that actual surface, including its facets,
      // so the upper fold bridges the seam without widening the silhouette.
      if(inner&&Math.cos(phi)<-1e-6) {
        const axis=new THREE.Vector3(middle.x,point.y,middle.z);
        ray.set(axis.clone().addScaledVector(radial,size.length()),radial.clone().negate());
        const hit=ray.intersectObject(inner,false)[0];
        if(hit) {
          // Overlap also covers interpolation between the two different
          // triangulations, not just contact at the sampled vertices.
          const radius=Math.max(0,hit.point.clone().sub(axis).dot(radial)-.08);
          if(point.clone().sub(axis).dot(radial)>radius)point.copy(axis).addScaledVector(radial,radius);
        }
      }
      row.push(point);
    }
    points.push(row);
  }
  const positions=[];
  for(let i=0;i<around;i++)for(let j=0;j<across;j++) {
    const a=points[i][j],b=points[(i+1)%around][j],c=points[(i+1)%around][(j+1)%across],d=points[i][(j+1)%across];
    // A consistent diagonal gives every interior vertex the same valence.
    // Alternating diagonals produced pinched peaks along the smoothed hem.
    const quad=[a,b,c,a,c,d];
    quad.forEach(p=>positions.push(p.x,p.y,p.z));
  }
  proxy.material.dispose();
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.computeVertexNormals();
  return geometry;
}

// Hemisphere samples, cosine-weighted, fixed so every build bakes the same.
function samples(count) {
  const result=[];
  for(let i=0;i<count;i++) {
    const u=(i+.5)/count,v=(i*.618034)%1,r=Math.sqrt(u),theta=v*Math.PI*2;
    result.push(new THREE.Vector3(Math.cos(theta)*r,Math.sin(theta)*r,Math.sqrt(1-u)));
  }
  return result;
}

// Per-vertex occlusion and beanie bounce, baked in the rest pose.
function bake(meshes,geometries,knit) {
  // Occluders are the original low-poly parts: the same shapes, far fewer triangles.
  const occluders=meshes.map(mesh=> {
    const proxy=new THREE.Mesh(mesh.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
    proxy.matrixAutoUpdate=false;proxy.matrix.copy(mesh.matrixWorld);proxy.matrixWorld.copy(mesh.matrixWorld);
    proxy.userData.knit=mesh.material===knit;
    return proxy;
  });
  const directions=samples(14),ray=new THREE.Raycaster();ray.far=.85;
  const tangent=new THREE.Vector3(),bitangent=new THREE.Vector3(),direction=new THREE.Vector3();
  meshes.forEach((mesh,index)=> {
    const geometry=geometries[index],position=geometry.attributes.position,normals=geometry.attributes.normal;
    const ao=new Float32Array(position.count).fill(1),bounce=new Float32Array(position.count),cache=new Map();
    const normalMatrix=new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld),others=occluders.filter((_,other)=>other!==index);
    for(let i=0;i<position.count;i++) {
      const point=new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
      const normal=new THREE.Vector3().fromBufferAttribute(normals,i).applyMatrix3(normalMatrix).normalize();
      const id=`${point.x.toFixed(3)},${point.y.toFixed(3)},${point.z.toFixed(3)}`;
      if(!cache.has(id)) {
        tangent.set(Math.abs(normal.y)<.9?0:1,Math.abs(normal.y)<.9?1:0,0).cross(normal).normalize();
        bitangent.crossVectors(normal,tangent);
        let blocked=0,warm=0;
        for(const sample of directions) {
          direction.copy(tangent).multiplyScalar(sample.x).addScaledVector(bitangent,sample.y).addScaledVector(normal,sample.z).normalize();
          ray.set(point.clone().addScaledVector(normal,.012),direction);
          // A part never occludes itself: its source surface differs from its new shell.
          const hit=ray.intersectObjects(others,false)[0];
          if(hit){const weight=1-hit.distance/ray.far*.6;blocked+=weight;if(hit.object.userData.knit)warm+=weight;}
        }
        cache.set(id,[1-Math.min(1,blocked/directions.length*1.5),warm/directions.length]);
      }
      [ao[i],bounce[i]]=cache.get(id);
    }
    geometry.setAttribute('ao',new THREE.BufferAttribute(ao,1));
    geometry.setAttribute('bounce',new THREE.BufferAttribute(bounce,1));
  });
  occluders.forEach(proxy=>proxy.material.dispose());
}

// The remodel is expensive, so it is built once and shared by every Zud.
let built;
function build(root,meshes,knit) {
  root.updateMatrixWorld(true);
  const crownIndex=meshes.findIndex(mesh=>mesh.name==='Copa');
  const crown=remeshDome(meshes[crownIndex],4,crownIndex);
  const geometries=meshes.map((mesh,index)=> {
    let shell;
    if(['Torso','Pierna','Brazo'].includes(mesh.name))shell=jointSurface(mesh);
    else if(mesh.name==='Doblez')shell=remeshRing(mesh,22,8,.45,crown);
    else if(mesh.name==='Copa')shell=crown;
    else {
      const size=new THREE.Box3().setFromBufferAttribute(mesh.geometry.attributes.position).getSize(new THREE.Vector3());
      const extent=Math.max(...size.toArray())*Math.max(...mesh.scale.toArray());
      shell=remesh([mesh],Math.round(THREE.MathUtils.clamp(extent*2.5,2,5)),index*97);
    }
    // The shell was built in the parent's frame; bring it into the mesh's own.
    mesh.updateMatrix();shell.applyMatrix4(mesh.matrix.clone().invert());
    return shell;
  });
  bake(meshes,geometries,knit);
  return geometries;
}

export function createZudPrintVariant({root,meshes,eyes,knit,knitGain}) {
  built??=build(root,meshes,knit);
  const materials=new Map(),variant=new Map();
  for(const [index,mesh] of meshes.entries()) {
    if(!materials.has(mesh.material)) {
      const isKnit=mesh.material===knit;
      // Skin is a deep plum-brown rather than neutral black, as in the reference;
      // the knit shares the live dye so the beanie still recolors.
      const color=isKnit?knit.color:new THREE.Color(0x382a34);
      materials.set(mesh.material,printMaterial(color,{gain:isKnit?knitGain:1.35,bounceColor:knit.color,bounceGain:knitGain}));
    }
    variant.set(mesh,{geometry:built[index],material:materials.get(mesh.material)});
  }
  // Flat, bright eyes with soft charcoal pupils, unaffected by the colored lights.
  // HDR white: after the filmic curve it lands on a clean, slightly warm white.
  const white=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(2.1,2.02,1.9),side:THREE.DoubleSide});
  const pupil=new THREE.MeshBasicMaterial({color:0x1c1519,side:THREE.DoubleSide});
  for(const eye of eyes.children) {
    variant.set(eye.children[0],{geometry:eye.children[0].geometry,material:white});
    variant.set(eye.children[1],{geometry:eye.children[1].geometry,material:pupil});
  }
  return variant;
}
