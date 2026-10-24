import * as THREE from 'three';
import {wizardCrown,kasaOuterShell} from './hat-geometry.js';
import {fitAccessories,fitKasaCord} from './hat-attachments.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Tailored proportions, in the source character's coordinates. The seat stays
// close to the temples while the crown can have its own height and silhouette.
export const HAT_FITS={
  samurai_kasa:    {width:1,depth:.96,height:1.03,seat:.80,drop:.10,brow:.015},
  cloud_chef:     {width:.97,depth:.94,height:.85,seat:.71,drop:.02,brow:.035},
  crescent_wizard:{width:.99,depth:.95,height:.91,seat:.71,drop:.02,brow:.04},
};
const smoothPart=name=>/crown|cloud_lobes/i.test(name)&&!/seam|stitch|bead|welt|edge|hem|panel_joint|reinforcement/i.test(name);
const roundPart=name=>/Raised_band/i.test(name);
const kasaCord=name=>/chin|cord|knot|tied|tail|fastening/i.test(name);

// Widen the outward-facing parts, not the opening that already fits Zud.
// Seams, rolled edges and fasteners use the same deformation as their brim.
function shapeBrim(v,id,name) {
  if(id==='samurai_kasa') {
    if(!kasaCord(name)&&name!=='Raised_band'){v.x*=1.25;v.z*=1.25;}
    return;
  }
  if(id!=='crescent_wizard'||!/brim/i.test(name))return;
  const radius=Math.hypot(v.x,v.z/.98);
  if(radius<=1.015)return;
  const extra=(radius-1.015)*1.35;
  v.x*=1+extra/radius;v.z*=1+extra/radius;
  v.y+=extra*.13*Math.sin(Math.atan2(v.x,v.z)*2+.6);
}

function surfaceKind(material,name,id) {
  const label=`${material.name} ${name}`.toLowerCase();
  if(/gold|metal|brass|buckle|rivet|gear|clock_bezel|clock_toothed|chain_link|winding_key|eyelet/.test(label))return 'metal';
  if(/leather|belt|seal|cord|strap|binding|band_edge/.test(label))return 'leather';
  if(id==='samurai_kasa'||/wood/.test(label))return 'straw';
  return 'fabric';
}
function grainTexture(kind) {
  const size=64,pixels=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const i=(y*size+x)*4,n=Math.sin(x*127.1+y*311.7)*43758.5453;
    const weave=kind==='fabric'?Math.sin(x*Math.PI/2)*Math.cos(y*Math.PI/2)*16:kind==='straw'?Math.sin(x*.8)*24:0;
    const value=Math.round(128+(n-Math.floor(n)-.5)*30+weave);
    pixels[i]=pixels[i+1]=pixels[i+2]=value;pixels[i+3]=255;
  }
  const texture=new THREE.DataTexture(pixels,size,size);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.repeat.set(24,12);texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.needsUpdate=true;
  return texture;
}

// Subdivide long faces before fitting, including the crown (which can move
// toward the head when tilted). This keeps a triangle
// chord from cutting through the head even when its three corners are outside.
function subdivide(source,round,maxEdge=.24) {
  const positions=[],p=source.attributes.position;
  const midpoint=(a,b)=>{
    const v=a.clone().add(b).multiplyScalar(.5);
    if(round){const radius=(Math.hypot(a.x,a.z)+Math.hypot(b.x,b.z))*.5,r=Math.hypot(v.x,v.z);if(r>1e-6){v.x*=radius/r;v.z*=radius/r;}}
    return v;
  };
  function triangle(a,b,c,depth=0) {
    if(b.clone().sub(a).cross(c.clone().sub(a)).lengthSq()<1e-18)return;
    if(depth<4&&Math.max(a.distanceToSquared(b),b.distanceToSquared(c),c.distanceToSquared(a))>maxEdge**2) {
      const ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);
      triangle(a,ab,ca,depth+1);triangle(ab,b,bc,depth+1);triangle(ca,bc,c,depth+1);triangle(ab,bc,ca,depth+1);
    } else positions.push(...a.toArray(),...b.toArray(),...c.toArray());
  }
  for(let i=0;i<p.count;i+=3)triangle(new THREE.Vector3().fromBufferAttribute(p,i),new THREE.Vector3().fromBufferAttribute(p,i+1),new THREE.Vector3().fromBufferAttribute(p,i+2));
  return new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
}

function shapePoint(v,fit,id,name) {
  shapeBrim(v,id,name);
  if(id==='cloud_chef'&&/spoon/i.test(name))v.y=.89+(v.y-.89)*.76;
  const originalY=v.y,front=v.z/Math.max(.01,Math.hypot(v.x,v.z));
  v.x*=fit.width;v.z*=fit.depth;
  v.y=fit.seat+(v.y-fit.seat)*(v.y>fit.seat?fit.height:1)-fit.drop;
  v.y+=fit.brow*front*Math.max(0,1-Math.abs(originalY-fit.seat)/.8);
  return v;
}
function smoothTogether(geometries) {
  if(!geometries.length)return;
  const combined=mergeGeometries(geometries),p=combined.attributes.position;
  const faces=[],vertices=new Map(),keys=[],a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  const keyAt=i=>`${Math.round(p.getX(i)*1e5)},${Math.round(p.getY(i)*1e5)},${Math.round(p.getZ(i)*1e5)}`;
  for(let i=0;i<p.count;i+=3) {
    a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);
    const area=c.sub(b).cross(a.sub(b)),face={area:area.clone(),normal:area.clone().normalize()};faces.push(face);
    for(let j=0;j<3;j++){const key=keyAt(i+j);keys.push(key);if(!vertices.has(key))vertices.set(key,[]);vertices.get(key).push(face);}
  }
  const normals=new Float32Array(p.count*3),sum=new THREE.Vector3();
  for(let i=0;i<p.count;i++) {
    sum.set(0,0,0);const normal=faces[Math.floor(i/3)].normal;
    for(const neighbor of vertices.get(keys[i]))if(normal.dot(neighbor.normal)>.5)sum.add(neighbor.area);
    sum.normalize().toArray(normals,i*3);
  }
  // Area weighting avoids scalloped shading where finely tessellated triangles
  // meet larger panels. Tight welding keeps stitches separate from the crown.
  let offset=0;
  for(const geometry of geometries){const count=geometry.attributes.position.count;geometry.setAttribute('normal',new THREE.BufferAttribute(normals.slice(offset*3,(offset+count)*3),3));offset+=count;}
  combined.dispose();
}

export function refineHat(source,id) {
  const fit=HAT_FITS[id],parts=[],ownedMaterials=new Map(),textures=new Map(),root=new THREE.Group();
  root.name=source.name;root.userData.hatId=id;source.updateMatrixWorld(true);
  const materialFor=(original,kind)=>{
    const key=`${original.uuid}:${kind}`;
    if(!ownedMaterials.has(key)) {
      const material=original.clone();
      const finish={fabric:[.94,0,.009],straw:[.88,0,.012],leather:[.73,0,.006],metal:[.34,.48,0],enamel:[.4,.12,0]}[kind];
      material.roughness=finish[0];material.metalness=finish[1];material.flatShading=false;
      if(id==='samurai_kasa'&&kind==='leather')material.color.set('#93623c');
      if(finish[2]){if(!textures.has(kind))textures.set(kind,grainTexture(kind));material.bumpMap=textures.get(kind);material.bumpScale=finish[2];}
      material.userData.hatSurface=kind;ownedMaterials.set(key,material);
    }
    return ownedMaterials.get(key);
  };
  source.traverse(mesh=>{
    if(!mesh.isMesh)return;
    if(id==='samurai_kasa'&&(kasaCord(mesh.name)||mesh.name==='Raised_band'))return;
    if(id==='crescent_wizard'&&/bent_crown|crown.*seam|crown.*stitch|stitch.*crown/i.test(mesh.name))return;
    if(id==='cloud_chef'&&/gathered_crown_seam/i.test(mesh.name))return;
    let baked=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();baked.applyMatrix4(mesh.matrixWorld);
    const kasaShell=id==='samurai_kasa'&&mesh.name.startsWith('Sixteen_panel_conical_kasa');
    if(kasaShell){const outer=kasaOuterShell(baked);baked.dispose();baked=outer;}
    const geometry=subdivide(baked,roundPart(mesh.name));baked.dispose();
    geometry.deleteAttribute('uv');
    const p=geometry.attributes.position,v=new THREE.Vector3();
    for(let i=0;i<p.count;i++){shapePoint(v.fromBufferAttribute(p,i),fit,id,mesh.name);p.setXYZ(i,v.x,v.y,v.z);}
    geometry.computeVertexNormals();
    const smooth=smoothPart(mesh.name),material=materialFor(mesh.material,surfaceKind(mesh.material,mesh.name,id));
    if(kasaShell)material.side=THREE.DoubleSide;
    const role=kasaShell?'shell':id==='cloud_chef'&&/spoon|pocket/i.test(mesh.name)?'chefAccessory':id==='cloud_chef'&&/pleat_fabric_band/.test(mesh.name)?'shell':id==='crescent_wizard'&&/crescent_relief/.test(mesh.name)?'emblem':'detail';
    parts.push({geometry,material,smooth,role});
  });
  const original=name=>{let found;source.traverse(m=>{if(m.isMesh&&m.material.name===name)found=m.material;});return found;};
  const add=(geometry,name,materialName,role='detail',smooth=true)=>{
    geometry.deleteAttribute('uv');
    const p=geometry.attributes.position,v=new THREE.Vector3();
    for(let i=0;i<p.count;i++){shapePoint(v.fromBufferAttribute(p,i),fit,id,name);p.setXYZ(i,v.x,v.y,v.z);}
    geometry.computeVertexNormals();const material=materialFor(original(materialName),'fabric');material.side=THREE.DoubleSide;
    parts.push({geometry,material,smooth,role});
  };
  if(id==='samurai_kasa'){const indexed=new THREE.SphereGeometry(.092,24,8);indexed.scale(1,.38,.98);indexed.translate(0,1.952,0);const cap=indexed.toNonIndexed();indexed.dispose();add(cap,'Kasa_tip_cap','d1b27d');}
  if(id==='crescent_wizard')add(wizardCrown(),'Continuous_crown','wizard_fabric','shell');
  // The source support rings sat across the forehead after lowering the hats.
  // The actual crown/brim now provide the opening, without an extra visible ring.
  smoothTogether(parts.filter(part=>part.smooth).map(part=>part.geometry));
  // Hundreds of tiny stitches become a handful of material batches. Geometry
  // and palette remain intact, with far fewer draw calls in the room and mirror.
  const batches=new Map();
  for(const part of parts){const key=`${part.material.uuid}:${part.smooth}:${part.role}`;if(!batches.has(key))batches.set(key,[]);batches.get(key).push(part);}
  for(const batch of batches.values()) {
    const geometry=mergeGeometries(batch.map(part=>part.geometry)),p=geometry.attributes.position,uv=[];
    for(let i=0;i<p.count;i++)uv.push(p.getX(i)*.5+.5,p.getY(i)*.5+p.getZ(i)*.15);
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,batch[0].material);mesh.name=`${batch[0].material.name} · ${batch[0].smooth?'copa':'detalle'}`;
    mesh.userData.hatRestPositions=p.array.slice();mesh.userData.hatRestNormals=geometry.attributes.normal.array.slice();
    mesh.userData.hatSmooth=batch[0].smooth;mesh.userData.hatRole=batch[0].role;root.add(mesh);
  }
  parts.forEach(part=>part.geometry.dispose());
  if(id==='samurai_kasa'){
    const material=new THREE.MeshStandardMaterial({name:'Cordón de cuero',color:'#93623c',roughness:.85});material.userData.hatSurface='leather';
    const mesh=new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([],3)),material);
    mesh.name='Cordón ajustado al mentón';mesh.userData.hatDynamic=true;root.add(mesh);
  }
  root.userData.hatFit=fit;return root;
}

// Fit in the anchor's coordinates, so head scaling/reparenting in the editor
// cannot change the clearance calculation. Each edit starts from rest geometry.
export function fitHatToHead(root,mount,anchor,head,{autoFit=true,crownHeight=1}={}) {
  anchor.updateWorldMatrix(true,false);head.updateWorldMatrix(true,false);mount.updateMatrix();
  const headToAnchor=anchor.matrixWorld.clone().invert().multiply(head.matrixWorld);
  head.geometry.computeBoundingBox();
  const center=head.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(headToAnchor);
  const radii=head.geometry.boundingBox.getSize(new THREE.Vector3()).multiplyScalar(.5).multiply(new THREE.Vector3().setFromMatrixScale(headToAnchor));
  // Bounding-box radii alone can underestimate a faceted/jittered head along
  // diagonals. Enclose its actual vertices before adding the contact clearance.
  const headPoint=new THREE.Vector3(),headPositions=head.geometry.attributes.position;
  let envelope=1;
  for(let i=0;i<headPositions.count;i++)envelope=Math.max(envelope,headPoint.fromBufferAttribute(headPositions,i).applyMatrix4(headToAnchor).sub(center).divide(radii).length());
  radii.multiplyScalar(envelope);
  // Small clearance also covers the sag of the tessellated faces between vertices.
  radii.addScalar(.015);
  const inverse=mount.matrix.clone().invert(),v=new THREE.Vector3(),q=new THREE.Vector3();
  root.traverse(mesh=>{
    if(!mesh.isMesh||mesh.userData.hatDynamic)return;
    const p=mesh.geometry.attributes.position,rest=mesh.userData.hatRestPositions;
    for(let i=0;i<p.count;i++) {
      v.fromArray(rest,i*3);const seat=root.userData.hatFit.seat;
      if(v.y>seat)v.y=seat+(v.y-seat)*crownHeight;
      v.applyMatrix4(mount.matrix);
      if(autoFit){q.copy(v).sub(center).divide(radii);const length=q.length();if(length<1&&length>1e-6)v.copy(q.divideScalar(length).multiply(radii).add(center));}
      v.applyMatrix4(inverse);p.setXYZ(i,v.x,v.y,v.z);
    }
    p.needsUpdate=true;
  });
  fitAccessories(root);
  if(root.userData.hatId==='samurai_kasa')fitKasaCord(root,mount.matrix,inverse,center,radii);
  if(autoFit)clearTriangleChords(root,mount.matrix,inverse,center,radii);
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    if(autoFit||crownHeight!==1){if(!mesh.userData.hatSmooth)mesh.geometry.computeVertexNormals();}
    else if(mesh.userData.hatRestNormals)mesh.geometry.attributes.normal.copyArray(mesh.userData.hatRestNormals);
    mesh.geometry.attributes.normal.needsUpdate=true;mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();
  });
  if(autoFit||crownHeight!==1)smoothTogether(root.children.filter(mesh=>mesh.userData.hatSmooth).map(mesh=>mesh.geometry));
}

// A vertex-only projection still lets triangle interiors cut through a curved
// head. Correct whole faces, sharing corrections at welded vertices so seams
// remain closed. This operates only when the user changes the fit, never per frame.
function clearTriangleChords(root,matrix,inverse,center,radii) {
  const vertices=[],lookup=new Map(),faces=[],v=new THREE.Vector3();
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const p=mesh.geometry.attributes.position,indices=[];
    for(let i=0;i<p.count;i++) {
      v.fromBufferAttribute(p,i).applyMatrix4(matrix).sub(center).divide(radii);
      const key=`${Math.round(v.x*1e5)},${Math.round(v.y*1e5)},${Math.round(v.z*1e5)}`;
      let index=lookup.get(key);
      if(index===undefined){index=vertices.length;vertices.push({point:v.clone(),refs:[]});lookup.set(key,index);}
      vertices[index].refs.push([p,i]);indices.push(index);
    }
    for(let i=0;i<indices.length;i+=3)faces.push(indices.slice(i,i+3));
  });
  const triangle=new THREE.Triangle(),origin=new THREE.Vector3(),nearest=new THREE.Vector3(),edge=new THREE.Line3(),candidate=new THREE.Vector3(),factors=new Float32Array(vertices.length);
  for(let pass=0;pass<6;pass++) {
    factors.fill(1);let changed=false;
    for(const face of faces) {
      triangle.set(...face.map(i=>vertices[i].point));triangle.closestPointToPoint(origin,nearest);
      let distance=nearest.length();
      // Extreme projection can collapse an embroidery triangle to an edge.
      // Three's triangle query is undefined there; its segments still need
      // clearance so the fit remains finite and safe to undo.
      if(!Number.isFinite(distance)){
        distance=Infinity;
        for(const [a,b] of [[triangle.a,triangle.b],[triangle.b,triangle.c],[triangle.c,triangle.a]]){
          if(a.distanceToSquared(b)<1e-20)candidate.copy(a);
          else edge.set(a,b).closestPointToPoint(origin,true,candidate);
          distance=Math.min(distance,candidate.length());
        }
      }
      if(distance<1.0005&&distance>1e-5){const factor=1.002/Math.max(.1,distance);for(const i of face)factors[i]=Math.max(factors[i],factor);changed=true;}
    }
    if(!changed)break;
    vertices.forEach((vertex,i)=>vertex.point.multiplyScalar(factors[i]));
  }
  for(const vertex of vertices){v.copy(vertex.point).multiply(radii).add(center).applyMatrix4(inverse);for(const [p,i] of vertex.refs)p.setXYZ(i,v.x,v.y,v.z);}
}
