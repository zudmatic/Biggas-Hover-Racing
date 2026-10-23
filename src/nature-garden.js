import * as THREE from 'three';
import {natureAssets} from './nature-assets.js';
import { retro } from './retro-material.js';
import {natureMaterial} from './nature-material.js';

export const GARDEN_GROUND=-.43;
const GROUND=GARDEN_GROUND;
const assets={
  CommonTree_1:[[-3.65,1.4,3.7,.35]],
  CommonTree_3:[[-1.8,-3.45,4.05,1.2]],
  CommonTree_5:[[3.15,-2.1,3.7,-.6]],
  Bush_Common:[[-3.22,1.95,.65,.2],[-3.55,-1.2,.78,2],[2.35,-3.05,.62,1],[3.45,-1.5,.62,3]],
  Bush_Common_Flowers:[[-2.7,2.85,.56,2],[3.23,.9,.65,1],[1.9,-3.3,.65,.4]],
  Fern_1:[[-3.4,2.6,.22,1],[-3.3,-2.6,.26,2],[3.4,-.25,.25,0],[2.95,2.55,.21,2],[-2.6,3.1,.2,.4]],
  Rock_Medium_1:[[-3.65,1.25,.47,.5],[3.35,1.85,.42,2],[-1.7,-3.5,.5,1]],
  Rock_Medium_2:[[-3.15,3,.28,1],[3.55,2.35,.23,2],[2.45,3.1,.25,.5],[-.95,3.25,.24,1]],
  Mushroom_Common:[[-3.1,1.7,.18,.5],[-3.3,1.85,.13,2],[-2.85,2,.15,1],[3.1,-2,.18,0]],
  Flower_3_Group:[],Flower_4_Group:[],Grass_Common_Short:[],
};

// Fixed clusters: loading order and frame rate never change the garden layout.
function placements() {
  const result=Object.fromEntries(Object.entries(assets).map(([name,items])=>[name,[...items]]));
  let seed=73;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(const [x,z,radius] of [[-2,3.15,.5],[1.65,3.2,.55],[3.3,.5,.45],[-3.35,-.55,.5],[.3,-3.2,.4]]) {
    for(let i=0;i<7;i++) {
      const angle=random()*Math.PI*2,r=Math.sqrt(random())*radius;
      result[i%2?'Flower_3_Group':'Flower_4_Group'].push([x+Math.cos(angle)*r,z+Math.sin(angle)*r,.24+random()*.19,random()*Math.PI*2]);
    }
  }
  for(let i=0;i<100;i++) {
    const x=(random()-.5)*8,z=(random()-.5)*8;
    // Outside the wooden foundation, inside the softly irregular lawn.
    if(Math.abs(x)<2.85&&Math.abs(z)<2.85||Math.hypot(x,z)>4.2)continue;
    // A small opening at the front keeps the cutaway's entrance readable.
    if(z>2.6&&Math.abs(x-.4)<.6)continue;
    result.Grass_Common_Short.push([x,z,.16+random()*.19,random()*Math.PI*2]);
  }
  return result;
}

export function createNatureGarden({bindLighting=()=>{},deferLoad=false}={}) {
  const garden=new THREE.Group();garden.name='Jardín de Zud';
  const breeze=[];
  const sway=new THREE.Matrix4(),pivot=new THREE.Matrix4(),rotation=new THREE.Euler();
  // Keep most of the garden still, with just two trees and a few flower clumps
  // catching the same breeze. Instance transforms also move their real shadows.
  const catchesBreeze=(name,index)=>name==='CommonTree_1'||name==='CommonTree_5'||
    (name==='Flower_3_Group'&&index%7===0)||(name==='Flower_4_Group'&&index%8===0);
  const outline=new THREE.CatmullRomCurve3(Array.from({length:16},(_,i)=>{
    const a=i/16*Math.PI*2,r=4.35+Math.sin(i*2.7)*.13;
    return new THREE.Vector3(Math.cos(a)*r,Math.sin(a)*r,0);
  }),true);
  const shape=new THREE.Shape(outline.getPoints(96).map(p=>new THREE.Vector2(p.x,p.y)));
  const lawn=retro(0x7d9956,{mottle:.09,facetVariation:.07});
  const earth=retro(0x716044,{mottle:.12,facetVariation:.1});
  const ground=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.22,bevelEnabled:true,bevelThickness:.05,bevelSize:.05,bevelSegments:1,steps:1}),[lawn,earth]);
  ground.name='Isla de césped';ground.rotation.x=-Math.PI/2;ground.position.y=GROUND-.27;
  garden.add(ground);bindLighting(garden);

  const layout=placements(),materials=new Map();
  const materialFor=source=>{
    if(materials.has(source))return materials.get(source);
    const material=natureMaterial(source);
    materials.set(source,material);return material;
  };
  // One load per model, instanced flowers/grass, shared maps and geometry.
  // A missing asset leaves the rest of the scene available.
  let resolveReady,started=false;
  const ready=new Promise(resolve=>{resolveReady=resolve;});
  function load(){
    if(started)return ready;started=true;
    Promise.allSettled(Object.entries(layout).map(async([name,items])=>{
      const {scene}=await natureAssets.load(name);
      scene.updateMatrixWorld(true);
      const bounds=new THREE.Box3().setFromObject(scene),size=bounds.getSize(new THREE.Vector3());
      const center=bounds.getCenter(new THREE.Vector3()),transform=new THREE.Object3D(),matrix=new THREE.Matrix4();
      const batch=new THREE.Group();batch.name=name;
      scene.traverse(object=>{
        if(!object.isMesh)return;
        const mesh=new THREE.InstancedMesh(object.geometry,materialFor(object.material),items.length);
        mesh.name=name;
        const moving=[];
        items.forEach(([x,z,height,yaw],i)=>{
          const scale=height/size.y;
          transform.position.set(x,GROUND,z);transform.rotation.set(0,yaw,0);transform.scale.setScalar(scale);transform.updateMatrix();
          matrix.makeTranslation(-center.x,-bounds.min.y,-center.z).multiply(object.matrixWorld);
          matrix.premultiply(transform.matrix);mesh.setMatrixAt(i,matrix);
          if(catchesBreeze(name,i))moving.push({index:i,x,z,base:matrix.clone(),
            amplitude:name.startsWith('CommonTree')?.01:.07,phase:x*.7+z*.45});
        });
        if(moving.length){mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);breeze.push({mesh,moving});}
        mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();
        // Allow for the small lean at the crown when the camera clips the garden.
        if(moving.length)mesh.boundingSphere.radius+=.12;
        batch.add(mesh);
      });
      garden.add(batch);bindLighting(batch);
      // Leaf cards cast a canopy shadow, but don't shadow one another into black.
      batch.traverse(object=>{if(object.isMesh&&object.material.name.includes('Leaves_'))object.receiveShadow=false;});
      // The thin grass doesn't need an extra shadow-map draw call per tuft.
      if(name==='Grass_Common_Short')batch.traverse(object=>{if(object.isMesh)object.castShadow=false;});
    })).then(results=>{
      const failed=results.filter(result=>result.status==='rejected');
      if(failed.length)console.warn('[garden] Some nature models could not be loaded:',failed.map(result=>result.reason));
      resolveReady({loaded:results.length-failed.length,total:results.length});
    });
    return ready;
  }
  if(!deferLoad)load();
  function update(time) {
    for(const {mesh,moving} of breeze){
      for(const {index,x,z,base,amplitude,phase} of moving){
        const gust=.65+.35*Math.sin(time*.23+phase*.3);
        const lean=amplitude*gust*(Math.sin(time*.85+phase)+.22*Math.sin(time*1.47+phase));
        rotation.set(lean*.35,0,-lean);
        sway.makeRotationFromEuler(rotation);
        pivot.makeTranslation(-x,-GROUND,-z);
        sway.multiply(pivot);pivot.makeTranslation(x,GROUND,z);
        sway.premultiply(pivot).multiply(base);mesh.setMatrixAt(index,sway);
      }
      mesh.instanceMatrix.needsUpdate=true;
    }
  }
  return {garden,ready,load,update};
}
