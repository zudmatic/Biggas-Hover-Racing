import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Work in hat-local coordinates, after the crown has been fitted. Decorations
// follow the actual surface, including a lowered or compressed crown.
export function fitAccessories(root) {
  const shells=root.children.filter(m=>m.userData.hatRole==='shell');
  if(!shells.length)return;
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  const surfaces=shells.map(mesh=>{mesh.geometry.computeBoundingSphere();mesh.geometry.computeBoundingBox();return new THREE.Mesh(mesh.geometry,material);});
  const ray=new THREE.Raycaster(),direction=new THREE.Vector3();
  const offsets=new Map();
  for(const role of ['chefAccessory','emblem']){
    const box=new THREE.Box3();
    for(const mesh of root.children)if(mesh.userData.hatRole===role){mesh.geometry.computeBoundingBox();box.union(mesh.geometry.boundingBox);}
    if(box.isEmpty())continue;
    const center=box.getCenter(new THREE.Vector3());direction.set(center.x,0,center.z).normalize();
    ray.set(new THREE.Vector3(direction.x*4,center.y,direction.z*4),direction.clone().negate());
    const hit=ray.intersectObjects(surfaces,false)[0];
    if(hit)offsets.set(role,hit.point.clone().addScaledVector(direction,role==='chefAccessory'?.04:.025).sub(center));
  }
  for(const mesh of root.children){
    const offset=offsets.get(mesh.userData.hatRole);
    if(offset)mesh.geometry.translate(...offset.toArray());
  }
  material.dispose();
}

export function fitKasaCord(root,matrix,inverse,center,headRadii) {
  const mesh=root.children.find(m=>m.userData.hatDynamic),radii=headRadii.clone().addScalar(.032);
  const shapes=[],z=center.z+radii.z*.32;
  const ellipse=Math.sqrt(1-.32**2),anchorAngle=-.35;
  const point=angle=>new THREE.Vector3(center.x+Math.cos(angle)*radii.x*ellipse,center.y-Math.sin(angle)*radii.y*ellipse,z);
  const tube=(points,radius,segments)=>{const curve=new THREE.CatmullRomCurve3(points);const indexed=new THREE.TubeGeometry(curve,segments,radius,8,false),g=indexed.toNonIndexed();indexed.dispose();shapes.push(g);};
  const points=Array.from({length:49},(_,i)=>point(anchorAngle+(Math.PI-2*anchorAngle)*i/48));
  // Continue each cheek strap upward to the underside of the fitted cone.
  // A vertical ray finds the real attachment point rather than a fixed ring.
  const surfaces=root.children.filter(m=>m.isMesh&&!m.userData.hatDynamic);
  const ray=new THREE.Ray(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),hit=new THREE.Vector3();
  for(const index of [0,points.length-1]){
    const end=points[index];ray.set(end.clone(),new THREE.Vector3(0,1,0));let nearest=Infinity;
    for(const surface of surfaces){const p=surface.geometry.attributes.position;
      for(let i=0;i<p.count;i+=3){a.fromBufferAttribute(p,i).applyMatrix4(matrix);b.fromBufferAttribute(p,i+1).applyMatrix4(matrix);c.fromBufferAttribute(p,i+2).applyMatrix4(matrix);
        if(ray.intersectTriangle(a,b,c,false,hit)&&hit.y-end.y<nearest)nearest=hit.y-end.y;
      }
    }
    if(Number.isFinite(nearest))end.y+=nearest+.005;
  }
  tube(points,.016,96);
  const knot=point(Math.PI/2);knot.z+=.014;
  tube(Array.from({length:25},(_,i)=>{const t=i/24*Math.PI*2;return knot.clone().add(new THREE.Vector3(Math.cos(t)*.034,Math.sin(t)*.023,Math.sin(t*2)*.009));}),.012,32);
  for(const side of [-1,1])tube([knot.clone().add(new THREE.Vector3(side*.012,-.01,0)),knot.clone().add(new THREE.Vector3(side*.03,-.09,.008)),knot.clone().add(new THREE.Vector3(side*.045,-.16,.016))],.012,12);
  const geometry=mergeGeometries(shapes);shapes.forEach(g=>g.dispose());geometry.applyMatrix4(inverse);geometry.computeVertexNormals();
  mesh.geometry.dispose();mesh.geometry=geometry;
}
