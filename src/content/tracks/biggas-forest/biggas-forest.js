import * as T from 'three';
import {createSurfaceIndex} from './circuit-collision.js';

export const FOREST_DIRT={start:1250,end:2150};
const hash=(x,z)=>{const n=Math.sin(x*127.1+z*311.7)*43758.5453;return n-Math.floor(n);};
export const isForestDirt=distance=>distance>=FOREST_DIRT.start&&distance<=FOREST_DIRT.end;

// Split existing triangles, never overlay a second floor. The physical road
// remains identical and source GLBs stay available for subsequent editing.
function splitDirt(mesh,roadAt,soil,removeDirt=false){
  const g=mesh.geometry,p=g.attributes.position,index=g.index,asphalt=[],dirt=[],v=new T.Vector3();
  mesh.updateWorldMatrix(true,false);
  for(let i=0;i<(index?.count??p.count);i+=3){
    const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k);v.set(0,0,0);
    for(const id of ids)v.add(new T.Vector3().fromBufferAttribute(p,id));v.multiplyScalar(1/3).applyMatrix4(mesh.matrixWorld);
    (isForestDirt(roadAt(v.x,v.z).distance)?dirt:asphalt).push(...ids);
  }
  const retained=g.clone();retained.setIndex(asphalt);mesh.geometry=retained;
  if(!removeDirt&&dirt.length){const surface=mesh.clone();surface.geometry=g.clone();surface.geometry.setIndex(dirt);surface.material=soil;surface.name='Forest_dirt_main_surface';mesh.parent.add(surface);}
  g.dispose();
}

export function prepareBiggasForest(assets,colliders,landscape,routes){
  landscape.woodland=true;
  const core=assets[0].scene,soil=new T.MeshStandardMaterial({name:'Dirt forest earth',color:0x8a6746,roughness:1});
  let grass;core.traverse(o=>{if(o.isMesh&&o.material.name==='Vegetacion terreno')grass=o.material;});
  const remove=[];core.traverse(o=>{
    if(!o.isMesh&&!o.isLight)return;
    if(o.isMesh&&o.material.name==='Urban plaza paving')o.material=grass;
    // Racing start/finish and essential road geometry remain; all urban clutter
    // and old CITY labels are removed before batching and light collection.
    if(o.isLight||/Sector_|____|Drainage_|Barrier_luminous|Subtle_braking|CAT_|A_U_R_E_L_I_A|Brake_distance|^(200|100|50)/.test(o.name)){remove.push(o);return;}
    if(/Road_driving_surface/.test(o.name))splitDirt(o,routes.mainRoadAt,soil);
    else if(/Integrated_paved_shoulder|Continuous_white_edge|Continuous_safety_parapet/.test(o.name))splitDirt(o,routes.mainRoadAt,soil,true);
    else if(/Lane_dash|Apex_striped/.test(o.name)){
      const center=new T.Box3().setFromObject(o).getCenter(new T.Vector3());if(isForestDirt(routes.mainRoadAt(center.x,center.z).distance))remove.push(o);
    }
  });remove.forEach(o=>o.removeFromParent());
  colliders.traverse(o=>{if(o.isMesh&&/COL_BARRIER/.test(o.name))splitDirt(o,routes.mainRoadAt,soil,true);});
  for(const branch of routes.branches)branch.name={market:'Senda de los cedros',roots:'Senda de las raíces',falls:'Cueva de la cascada'}[branch.id];
  for(const sample of landscape.samples)if(sample.sector==='CITY')sample.sector='FOREST';
  return {soil};
}

// Reuse the authored canopy prototypes, including baked vertex occlusion.
// Ground queries happen once, before batching; no per-frame scatter or raycasts.
export function populateBiggasForest(assets,landscape,routes,{mobile=false}={}){
  const terrain=[],templates=new Map(),occupied=new Set();
  for(const asset of assets){asset.scene.updateMatrixWorld(true);asset.scene.traverse(o=>{
    if(o.isMesh&&o.material?.name==='Vegetacion terreno')terrain.push(o);
    if(/^F039_(Oak|Cedar|Beech|Birch|AlpinePine|YoungPine)(?:\d|_|$)/.test(o.name)&&o.children.some(c=>c.isMesh)){
      const type=o.name.match(/^F039_([A-Za-z]+)/)[1];if(!templates.has(type))templates.set(type,o);
      const p=o.getWorldPosition(new T.Vector3());occupied.add(`${Math.floor(p.x/15)},${Math.floor(p.z/15)}`);
    }
  });}
  const height=createSurfaceIndex(terrain),prototypes=[...templates.values()],group=new T.Group();group.name='Bosque extendido';assets[1].scene.add(group);
  if(!prototypes.length)throw new Error('Faltan los prototipos de árboles del bosque.');
  const bases=prototypes.map(p=>{const b=new T.Box3();p.traverse(m=>{if(m.isMesh){m.geometry.computeBoundingBox();b.union(m.geometry.boundingBox);}});return b.min.y;});
  const trees=[];
  function plant(x,z,y,scale,seed,collision=false){
    const i=Math.floor(hash(seed,32)*prototypes.length),tree=prototypes[i].clone(true);tree.name=`Forest_tree_${trees.length}`;tree.position.set(x,y-bases[i]*scale,z);tree.rotation.set(0,hash(seed,33)*Math.PI*2,0);tree.scale.setScalar(scale);group.add(tree);trees.push({x,y,z,scale,collision,radius:scale*.65});return tree;
  }
  // Fill the former city and connect every sector, with gaps for water and roads.
  const cap=mobile?1000:1650,spacing=mobile?25:21,candidates=[];
  for(let z=-580;z<480;z+=spacing)for(let x=-720;x<640;x+=spacing){
    const px=x+(hash(x,z)-.5)*spacing*.7,pz=z+(hash(z,x)-.5)*spacing*.7;
    if(occupied.has(`${Math.floor(px/15)},${Math.floor(pz/15)}`))continue;
    const main=routes.mainRoadAt(px,pz),branch=routes.nearest(px,pz),y=height(px,pz);
    if(y===null||main.distanceToRoad<main.width/2+12||branch&&branch.distanceToRoad<branch.width/2+12)continue;
    if(px< -330&&px> -620&&pz< -160&&pz> -300)continue; // river, plunge pool and cave sightline
    const hx=height(px+2,pz),hz=height(px,pz+2);if(hx===null||hz===null||Math.hypot(hx-y,hz-y)>2.8)continue;
    candidates.push({x:px,z:pz,y,seed:x+z*19});
  }
  candidates.sort((a,b)=>hash(a.seed,91)-hash(b.seed,91));
  for(const p of candidates.slice(0,cap))plant(p.x,p.z,p.y,.8+hash(p.x,p.z+7)*.6,p.seed);
  // Close trees frame the trails, while leaving room for the complete vehicle.
  for(const branch of routes.branches)if(branch.id!=='falls')for(let i=18;i<branch.samples.length-18;i+=10){
    const p=branch.samples[i];for(const side of [-1,1]){const offset=side*(p.width/2+5),x=p.x-p.nz*offset,z=p.z+p.nx*offset,y=height(x,z),main=routes.mainRoadAt(x,z);if(y!==null&&main.distanceToRoad>main.width/2+8)plant(x,z,y,.9+hash(i,side)*.3,i+side*77);}
  }
  // Alternating trunks form a readable slalom on the mandatory dirt section.
  const obstacles=[];
  for(let i=0;i<8;i++){
    const distance=1660+i*29,p=landscape.atDistance(distance),offset=(i%2?1:-1)*2.1,x=p.x-p.nz*offset,z=p.z+p.nx*offset;
    plant(x,z,p.y,1.5,17000+i,true);obstacles.push({...trees.at(-1),distance,offset,safeOffset:-Math.sign(offset)*4.8});
  }
  group.updateMatrixWorld(true);
  return {trees,obstacles,added:trees.length,height};
}
