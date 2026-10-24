// Convert the supplied FBX (embedded textures) into runtime GLBs and race data.
// Run from the repository root: node scripts/build-mario-raceway.mjs
import fs from 'node:fs';
import * as THREE from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {createSurfaceIndex} from '../src/circuit-collision.js';
const out='public/models/mario-raceway';fs.mkdirSync(out,{recursive:true});
globalThis.window={URL:globalThis.URL};
THREE.TextureLoader.prototype.load=function(url){const texture=new THREE.Texture();texture.userData.url=url;return texture;};
const bytes=fs.readFileSync('assets/maps/mario-raceway/marioraceway.fbx');
const source=new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');source.updateMatrixWorld(true);
const transform=new THREE.Matrix4().makeTranslation(-186.3,8,-35.325).multiply(new THREE.Matrix4().makeScale(.0015,.0015,.0015));
const meshes=[];
source.traverse(mesh=>{if(!mesh.isMesh)return;const geometry=mesh.geometry.clone().applyMatrix4(transform.clone().multiply(mesh.matrixWorld));meshes.push({id:mesh.name.slice(-3),geometry,material:mesh.material});});
const names={'009':'Asphalt road','010':'Start grid','011':'Terrain hills','012':'Terrain sand','013':'Terrain grass','014':'Terrain verge','023':'Paint outer wall','024':'Brick inner wall','031':'Pipe','032':'Trees'};
async function glb(path,items,{collider=false}={}){
 const doc={asset:{version:'2.0',generator:'Mario Raceway importer'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials:[],accessors:[],bufferViews:[],buffers:[],textures:[],images:[],samplers:[{magFilter:9728,minFilter:9987,wrapS:10497,wrapT:10497}]},chunks=[];let offset=0;
 function view(buffer){const data=Buffer.from(buffer);const index=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:offset,byteLength:data.length});const pad=Buffer.alloc((4-data.length%4)%4);chunks.push(data,pad);offset+=data.length+pad.length;return index;}
 function attribute(array,size){const data=new Float32Array(array),index=doc.accessors.length;const a={bufferView:view(Buffer.from(data.buffer)),componentType:5126,count:data.length/size,type:`VEC${size}`};if(size===3){a.min=[0,1,2].map(k=>Math.min(...array.filter((_,i)=>i%3===k)));a.max=[0,1,2].map(k=>Math.max(...array.filter((_,i)=>i%3===k)));}doc.accessors.push(a);return index;}
 for(const {id,geometry,material} of items){
  const attributes={POSITION:attribute(Array.from(geometry.attributes.position.array),3)};
  if(!collider){attributes.NORMAL=attribute(Array.from(geometry.attributes.normal.array),3);const uv=Array.from(geometry.attributes.uv.array,(v,i)=>i%2?1-v:v);attributes.TEXCOORD_0=attribute(uv,2);if(geometry.attributes.color)attributes.COLOR_0=attribute(Array.from(geometry.attributes.color.array),3);}
  const mat={name:collider?id:names[id]??`Raceway ${id}`,pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:.9},doubleSided:true};
  if(!collider){const data=await (await fetch(material.map.userData.url)).arrayBuffer();const image=doc.images.length;doc.images.push({bufferView:view(data),mimeType:'image/png'});doc.textures.push({source:image,sampler:0});mat.pbrMetallicRoughness.baseColorTexture={index:image};if(material.transparent){mat.alphaMode='MASK';mat.alphaCutoff=.5;}}
  const index=doc.meshes.length;doc.materials.push(mat);doc.meshes.push({primitives:[{attributes,material:index}]});doc.nodes.push({name:collider?id:mat.name,mesh:index});doc.scenes[0].nodes.push(index);
 }
 doc.buffers.push({byteLength:offset});const json=Buffer.from(JSON.stringify(doc));const jsonPad=Buffer.alloc((4-json.length%4)%4,32),bin=Buffer.concat(chunks);const header=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+jsonPad.length+bin.length,8);jh.writeUInt32LE(json.length+jsonPad.length);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(bin.length);bh.writeUInt32LE(0x004e4942,4);fs.writeFileSync(path,Buffer.concat([header,jh,json,jsonPad,bh,bin]));
}
await glb(`${out}/mario-raceway.glb`,meshes);
const floorIDs=['009','010','011','012','013','014'];
const solidIDs=['023','024','026','027','028','029','030','031'];
await glb(`${out}/mario-raceway-colliders.glb`,meshes.filter(m=>floorIDs.includes(m.id)||solidIDs.includes(m.id)).map(m=>({...m,id:m.id==='009'?'COL_TRACK_RACE_SURFACE':floorIDs.includes(m.id)?`COL_ENV_TERRAIN_CITY_${m.id}`:`COL_RACE_SOLID_${m.id}`})),{collider:true});
// Recover the two road boundaries from the original triangles, then project
// the inner boundary onto the outer one to obtain the lane's medial route.
const roads=meshes.filter(m=>['009','010'].includes(m.id)),edges=new Map(),points=new Map();
const key=p=>p.map(v=>v.toFixed(3)).join(',');
for(const {geometry} of roads){const a=geometry.attributes.position;for(let i=0;i<a.count;i+=3){const keys=[0,1,2].map(k=>{const p=[a.getX(i+k),a.getY(i+k),a.getZ(i+k)],id=key(p);points.set(id,new THREE.Vector3(...p));return id;});for(let k=0;k<3;k++){const pair=[keys[k],keys[(k+1)%3]].sort(),id=pair.join('|');const e=edges.get(id)??{pair,count:0};e.count++;edges.set(id,e);}}}
const adj=new Map();for(const {pair,count} of edges.values())if(count===1)for(let i=0;i<2;i++){if(!adj.has(pair[i]))adj.set(pair[i],[]);adj.get(pair[i]).push(pair[1-i]);}
const unseen=new Set(adj.keys()),loops=[];while(unseen.size){const start=unseen.values().next().value,loop=[];let previous=null,current=start;do{loop.push(points.get(current));unseen.delete(current);const next=adj.get(current).find(p=>p!==previous);previous=current;current=next;}while(current!==start);loops.push(loop);}
const area=loop=>Math.abs(loop.reduce((sum,p,i)=>{const q=loop[(i+1)%loop.length];return sum+p.x*q.z-q.x*p.z;},0));loops.sort((a,b)=>area(a)-area(b));if(loops.length!==2)throw new Error('Expected two closed road boundaries');
const [inner,outer]=loops,medial=[];
for(let i=0;i<inner.length;i++){const a=inner[i],b=inner[(i+1)%inner.length],n=Math.ceil(a.distanceTo(b)/.6);for(let j=0;j<n;j++){const p=a.clone().lerp(b,j/n);let best=Infinity,nearest;for(let k=0;k<outer.length;k++){const u=outer[k],v=outer[(k+1)%outer.length],d=v.clone().sub(u),t=THREE.MathUtils.clamp(p.clone().sub(u).dot(d)/d.lengthSq(),0,1),q=u.clone().addScaledVector(d,t),distance=p.distanceToSquared(q);if(distance<best){best=distance;nearest=q;}}medial.push(p.add(nearest).multiplyScalar(.5));}}
// Smooth the medial corners before uniform sampling; ground every sample on
// the actual asphalt so height changes and the pipe underpass stay accurate.
const smooth=medial.map((_,i)=>{const p=new THREE.Vector3();for(let k=-4;k<=4;k++)p.add(medial[(i+k+medial.length)%medial.length]);return p.multiplyScalar(1/9);});
let curve=new THREE.CatmullRomCurve3(smooth,true,'centripetal');curve.arcLengthDivisions=5000;
let routePoints=curve.getSpacedPoints(Math.ceil(curve.getLength()/1.5)).slice(0,-1);
const start=new THREE.Vector3(-186.3,8,-70.725);let startIndex=routePoints.reduce((best,p,i)=>p.distanceToSquared(start)<routePoints[best].distanceToSquared(start)?i:best,0);routePoints=[...routePoints.slice(startIndex),...routePoints.slice(0,startIndex)];if(routePoints[1].z>routePoints[0].z)routePoints=[routePoints[0],...routePoints.slice(1).reverse()];
const surface=createSurfaceIndex(roads.map(({geometry})=>new THREE.Mesh(geometry)));
for(const p of routePoints){const y=surface(p.x,p.z);if(y===null)throw new Error('Route leaves asphalt');p.y=y;}
let length=0;const samples=routePoints.map((p,i)=>{const forward=routePoints[(i+1)%routePoints.length].clone().sub(p).normalize();const sample={index:i,distance_m:length,position:p.toArray(),forward:forward.toArray(),width_m:15};length+=p.distanceTo(routePoints[(i+1)%routePoints.length]);return sample;});
const checkpoints=Array.from({length:16},(_,order)=>{const index=samples.findIndex(s=>s.distance_m>=length*order/16),sample=samples[index];return {order,route_index:index,position_gltf:sample.position,forward_gltf:sample.forward,width_m:15,height_m:8};});
const spawn=samples.at(-8);fs.writeFileSync(`${out}/route_gltf.json`,JSON.stringify({length_m:length,samples}));fs.writeFileSync(`${out}/gameplay.json`,JSON.stringify({road_width_m:15,spawn_positions:[{position_gltf:spawn.position,forward_gltf:spawn.forward}],checkpoints}));
console.log(`Mario Raceway: ${length.toFixed(2)} m, ${samples.length} route samples, ${meshes.length} meshes`);
