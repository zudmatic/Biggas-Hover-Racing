import * as THREE from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {SimplifyModifier} from 'three/addons/modifiers/SimplifyModifier.js';

// All resolutions start from the approved shell, never the older procedural
// crown/cuff profiles. Cached buffers have the same lifetime as the base shell.
const variants=new WeakMap();
const curves=new WeakMap();

// Loop subdivision smooths the approved topology, including the authored
// triangulation on the limbs. Both targets share triangle order, so the last
// quarter of the slider can morph the high-poly shell into real curves.
function loopSubdivision(source) {
  const points=Array.from({length:source.attributes.position.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(source.attributes.position,i));
  const triangles=source.index.array,neighbors=points.map(()=>new Set()),edges=new Map();
  const edgeKey=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;
  for(let i=0;i<triangles.length;i+=3) {
    const [a,b,c]=triangles.slice(i,i+3);
    for(const [u,v,opposite] of [[a,b,c],[b,c,a],[c,a,b]]) {
      neighbors[u].add(v);neighbors[v].add(u);
      const key=edgeKey(u,v);
      if(!edges.has(key))edges.set(key,{a:u,b:v,opposites:[]});
      edges.get(key).opposites.push(opposite);
    }
  }
  const boundary=points.map(()=>[]);
  for(const edge of edges.values())if(edge.opposites.length===1){boundary[edge.a].push(edge.b);boundary[edge.b].push(edge.a);}
  const smooth=points.map((point,i)=>{
    if(boundary[i].length===2)return point.clone().multiplyScalar(.75).addScaledVector(points[boundary[i][0]],.125).addScaledVector(points[boundary[i][1]],.125);
    const n=neighbors[i].size;if(n<3)return point.clone();
    const beta=n===3?3/16:3/(8*n),result=point.clone().multiplyScalar(1-n*beta);
    for(const neighbor of neighbors[i])result.addScaledVector(points[neighbor],beta);
    return result;
  });
  for(const edge of edges.values()) {
    const point=points[edge.a].clone().add(points[edge.b]);
    if(edge.opposites.length===2)point.multiplyScalar(3/8).addScaledVector(points[edge.opposites[0]],1/8).addScaledVector(points[edge.opposites[1]],1/8);
    else point.multiplyScalar(.5);
    edge.index=smooth.length;smooth.push(point);
  }
  const indices=[];
  for(let i=0;i<triangles.length;i+=3) {
    const [a,b,c]=triangles.slice(i,i+3),ab=edges.get(edgeKey(a,b)).index,bc=edges.get(edgeKey(b,c)).index,ca=edges.get(edgeKey(c,a)).index;
    indices.push(a,ab,ca,ab,b,bc,ca,bc,c,ab,bc,ca);
  }
  const result=new THREE.BufferGeometry();result.setAttribute('position',new THREE.Float32BufferAttribute(smooth.flatMap(p=>p.toArray()),3));result.setIndex(indices);return result;
}

export function curvedGeometry(source,amount) {
  const high=baseGeometryVariant(source,'high');
  let target=curves.get(source);
  if(!target) {
    const positions=new THREE.BufferGeometry();positions.setAttribute('position',source.attributes.position.clone());
    const welded=mergeVertices(positions);positions.dispose();
    const first=loopSubdivision(welded),second=loopSubdivision(first),smooth=second.toNonIndexed();
    welded.dispose();first.dispose();second.dispose();
    // Keep the dimensions and placement of every authored part while rounding.
    source.computeBoundingBox();smooth.computeBoundingBox();
    const baseSize=source.boundingBox.getSize(new THREE.Vector3()),smoothSize=smooth.boundingBox.getSize(new THREE.Vector3());
    const baseCenter=source.boundingBox.getCenter(new THREE.Vector3()),smoothCenter=smooth.boundingBox.getCenter(new THREE.Vector3()),point=new THREE.Vector3();
    target=smooth.attributes.position.clone();
    for(let i=0;i<target.count;i++) {
      point.fromBufferAttribute(target,i).sub(smoothCenter);
      for(const axis of ['x','y','z'])point[axis]*=smoothSize[axis]>1e-6?baseSize[axis]/smoothSize[axis]:1;
      point.add(baseCenter);target.setXYZ(i,point.x,point.y,point.z);
    }
    smooth.dispose();curves.set(source,target);
  }
  const geometry=high.clone(),position=geometry.attributes.position;
  for(let i=0;i<position.array.length;i++)position.array[i]=THREE.MathUtils.lerp(position.array[i],target.array[i],amount);
  geometry.computeVertexNormals();return geometry;
}

function subdivide(source) {
  const geometry=new THREE.BufferGeometry();
  const indices=source.index?.array;
  const count=indices?.length??source.attributes.position.count;
  for(const [name,attribute] of Object.entries(source.attributes)) {
    const size=attribute.itemSize,values=new Float32Array(count*4*size);
    let offset=0;
    for(let triangle=0;triangle<count;triangle+=3) {
      const a=indices?.[triangle]??triangle,b=indices?.[triangle+1]??triangle+1,c=indices?.[triangle+2]??triangle+2;
      // Split in the plane of each base face. No rounding, projection onto a
      // new primitive, or shift of the brim and crown's shared silhouette.
      for(const [i,j] of [[a,a],[a,b],[c,a],[a,b],[b,b],[b,c],[c,a],[b,c],[c,c],[a,b],[b,c],[c,a]]) {
        for(let component=0;component<size;component++)values[offset++]=(attribute.getComponent(i,component)+attribute.getComponent(j,component))*.5;
      }
    }
    geometry.setAttribute(name,new THREE.BufferAttribute(values,size));
  }
  return geometry;
}

function simplify(source) {
  const positions=new THREE.BufferGeometry();positions.setAttribute('position',source.attributes.position.clone());
  if(source.index)positions.setIndex(source.index.clone());
  const welded=mergeVertices(positions);positions.dispose();
  const indexed=new SimplifyModifier().modify(welded,Math.floor(welded.attributes.position.count*.35));welded.dispose();
  const geometry=indexed.toNonIndexed();indexed.dispose();geometry.computeVertexNormals();
  // Preserve the base's baked attributes at retained vertices. Simplification
  // collapses onto existing vertices rather than inventing a second shape.
  const sourcePosition=source.attributes.position,lookup=new Map();
  const key=(attribute,index)=>[0,1,2].map(axis=>attribute.getComponent(index,axis).toFixed(5)).join(',');
  for(let i=0;i<sourcePosition.count;i++)lookup.set(key(sourcePosition,i),i);
  for(const name of ['ao','bounce']) {
    const attribute=source.getAttribute(name);if(!attribute)continue;
    const values=new Float32Array(geometry.attributes.position.count);
    for(let i=0;i<values.length;i++)values[i]=attribute.getX(lookup.get(key(geometry.attributes.position,i))??0);
    geometry.setAttribute(name,new THREE.BufferAttribute(values,1));
  }
  return geometry;
}

export function baseGeometryVariant(source,detail,{hat=false}={}) {
  // The base beanie is already faceted. Keep its exact low-poly mesh so edge
  // collapse cannot open the crown/cuff seam or redesign the folded band.
  if(detail==='original'||detail==='low'&&hat)return source;
  let cached=variants.get(source);
  if(!cached){cached=new Map();variants.set(source,cached);}
  if(!cached.has(detail)) {
    if(detail==='low')cached.set(detail,simplify(source));
    else if(detail==='medium')cached.set(detail,subdivide(source));
    else if(detail==='high')cached.set(detail,subdivide(baseGeometryVariant(source,'medium')));
    else throw new Error('Unknown Zud detail');
  }
  return cached.get(detail);
}
