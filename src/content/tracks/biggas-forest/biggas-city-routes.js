import * as THREE from 'three';
import {createSurfaceIndex} from './circuit-collision.js';
import {refineBiggasTerrain} from './biggas-city-terrain.js';

const clamp=THREE.MathUtils.clamp;
const definitions=[
  {id:'market',name:'Estación del mercado',start:600,end:960,width:13,color:0xe4ac47,points:[[247,9,289],[277,10,264],[314,10.5,250],[345,11,230],[382,11.8,212]]},
  {id:'roots',name:'Senda de las raíces',start:1440,end:1920,width:11,color:0x96b870,points:[[315,48,-238],[240,54,-282],[175,59,-355],[103,64,-408]]},
  {id:'falls',name:'Galería de la cascada',start:2500,end:3040,width:13,color:0x73c6c4,points:[[-359,40,-211],[-400,41,-239],[-451,41,-240],[-505,41,-237],[-548,41,-216],[-577,40.5,-209],[-594,40,-192]]},
];
const point=r=>new THREE.Vector3(r.x,r.y,r.z);

// Branch distance is mapped to the original lap distance. Both paths cross the
// same ordered checkpoints; recovery always uses the safe original road.
export function createBiggasRoutes(landscape,{terrain=[]}={}){
  const terrainHeight=terrain.length?createSurfaceIndex(terrain):null;
  const branches=definitions.map(def=>{
    const curve=new THREE.CatmullRomCurve3([point(landscape.atDistance(def.start)),point(landscape.atDistance(def.start+18)),...def.points.map(p=>new THREE.Vector3(...p)),point(landscape.atDistance(def.end-18)),point(landscape.atDistance(def.end))],false,'centripetal');
    const length=curve.getLength(),points=curve.getSpacedPoints(Math.ceil(length/2)),samples=[];let travelled=0;
    if(def.id==='roots'&&terrainHeight){
      const heights=points.map((p,i)=>{const ground=terrainHeight(p.x,p.z),edge=Math.min(i,points.length-1-i)*2,blend=THREE.MathUtils.smoothstep(edge,10,48);return Math.max(p.y,p.y+((ground??p.y)+1-p.y)*blend);});
      points.forEach((p,i)=>{let sum=0,count=0;for(let k=Math.max(0,i-3);k<=Math.min(points.length-1,i+3);k++){sum+=heights[k];count++;}if(i>8&&i<points.length-9)p.y=sum/count;});
    }
    // Low rolling crests keep the forest rhythmic without launch ramps.
    if(def.id==='roots')points.forEach((p,i)=>{const f=i/(points.length-1);p.y+=.45*Math.sin(f*Math.PI*4)**2*Math.sin(f*Math.PI)**2;});
    // Match the height of the existing roadway across each fork, then ease
    // onto the branch. Otherwise the higher original floor creates a drop at
    // the end of the overlap (especially on the uphill cascade approach).
    points.forEach(p=>{const main=landscape.roadAt(p.x,p.z),blend=1-THREE.MathUtils.smoothstep(main.distanceToRoad,main.width/2+2,main.width/2+15);p.y=THREE.MathUtils.lerp(p.y,main.y,blend);});
    points.forEach((p,i)=>{if(i)travelled+=p.distanceTo(points[i-1]);const tangent=points[Math.min(points.length-1,i+1)].clone().sub(points[Math.max(0,i-1)]).normalize();samples.push({x:p.x,y:p.y,z:p.z,nx:tangent.x/Math.hypot(tangent.x,tangent.z),nz:tangent.z/Math.hypot(tangent.x,tangent.z),grade:tangent.y/Math.hypot(tangent.x,tangent.z),width:def.width,station:travelled,distance:def.start+(def.end-def.start)*i/(points.length-1),routeId:def.id,routeName:def.name});});
    for(let i=0;i<samples.length;i++){
      const p=samples[i],a=samples[Math.max(0,i-5)],b=samples[Math.min(samples.length-1,i+5)],theta=Math.atan2(b.nx,b.nz)-Math.atan2(a.nx,a.nz),curvature=Math.atan2(Math.sin(theta),Math.cos(theta))/Math.max(1,b.station-a.station),edge=Math.min(p.station,travelled-p.station),main=landscape.roadAt(p.x,p.z);
      const blend=THREE.MathUtils.smoothstep(edge,25,55)*THREE.MathUtils.smoothstep(main.distanceToRoad,main.width/2+def.width/2+1,main.width/2+def.width/2+12);
      p.bank=clamp(curvature*6,-.12,.12)*blend;
      const f=i/(samples.length-1),neck=def.id==='roots'?Math.sin(f*Math.PI*3)**4:def.id==='falls'?Math.exp(-(((f-.82)/.1)**2)):Math.exp(-(((f-.24)/.12)**2));
      p.width=def.width-(def.id==='roots'?1.2:1.5)*neck*blend;
    }
    const bounds=new THREE.Box3().setFromPoints(points).expandByScalar(35);
    return {...def,points:undefined,samples,length:travelled,bounds};
  });
  function onBranch(branch,fraction){
    const n=clamp(fraction,0,1)*(branch.samples.length-1),i=Math.min(branch.samples.length-2,Math.floor(n)),t=n-i,a=branch.samples[i],b=branch.samples[i+1];
    return {...a,bank:THREE.MathUtils.lerp(a.bank,b.bank,t),width:THREE.MathUtils.lerp(a.width,b.width,t),x:THREE.MathUtils.lerp(a.x,b.x,t),y:THREE.MathUtils.lerp(a.y,b.y,t),z:THREE.MathUtils.lerp(a.z,b.z,t),station:THREE.MathUtils.lerp(a.station,b.station,t),distance:THREE.MathUtils.lerp(a.distance,b.distance,t)};
  }
  function nearest(x,z,margin=0){
    let best=Infinity,selected=null,segment=0,fraction=0;
    for(const branch of branches){
      if(x<branch.bounds.min.x-margin||x>branch.bounds.max.x+margin||z<branch.bounds.min.z-margin||z>branch.bounds.max.z+margin)continue;
      const samples=branch.samples;
      for(let i=0;i<samples.length-1;i++){
        const a=samples[i],b=samples[i+1],dx=b.x-a.x,dz=b.z-a.z,l=dx*dx+dz*dz,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/l,0,1),d=(x-a.x-dx*t)**2+(z-a.z-dz*t)**2;
        if(d<best){best=d;selected=branch;segment=i;fraction=t;}
      }
    }
    if(!selected)return null;
    const a=selected.samples[segment],b=selected.samples[segment+1],t=fraction,dx=b.x-a.x,dz=b.z-a.z,h=Math.hypot(dx,dz),nx=dx/h,nz=dz/h,cx=a.x+dx*t,cz=a.z+dz*t;
    return {...a,bank:THREE.MathUtils.lerp(a.bank,b.bank,t),width:THREE.MathUtils.lerp(a.width,b.width,t),x:cx,y:a.y+(b.y-a.y)*t,z:cz,nx,nz,grade:(b.y-a.y)/h,offset:(x-cx)*-nz+(z-cz)*nx,distance:a.distance+(b.distance-a.distance)*t,station:a.station+(b.station-a.station)*t,distanceToRoad:Math.sqrt(best),branch:selected};
  }
  const mainRoadAt=landscape.roadAt.bind(landscape);landscape.mainRoadAt=mainRoadAt;
  landscape.roadAt=(x,z)=>{const main=mainRoadAt(x,z),alternate=nearest(x,z);return alternate&&alternate.distanceToRoad<alternate.width/2+5&&alternate.distanceToRoad<main.distanceToRoad?alternate:main;};
  landscape.height=(x,z)=>{const r=landscape.roadAt(x,z);return r.y+(r.bank??0)*(r.offset??0);};landscape.branches=branches;
  for(const gate of landscape.gates)for(const branch of branches)if(gate.distance>branch.start&&gate.distance<branch.end){
    const p=onBranch(branch,(gate.distance-branch.start)/(branch.end-branch.start));
    (gate.alternatives??=[]).push({x:p.x,y:p.y+.65,z:p.z,nx:p.nx,nz:p.nz,radius:p.width/2,routeId:branch.id});
  }
  return {branches,nearest,onBranch,mainRoadAt};
}

export function routeRibbon(branch,{offset=0,width=null,height=0,edge=0,mainRoadAt=null}={}){
  const positions=[],uv=[],indices=[],samples=branch.samples;
  samples.forEach((p,i)=>{
    for(const side of [-1,0,1]){const lateral=offset+edge*p.width/2+(width??p.width)/2*side;positions.push(p.x-p.nz*lateral,p.y+height+(p.bank??0)*lateral,p.z+p.nx*lateral);uv.push((side+1)/2,p.station/8);}
    if(i)for(let column=0;column<2;column++){const a=(i-1)*3+column,b=i*3+column;indices.push(a,a+1,b,a+1,b+1,b);}
  });
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();g.userData.circuitUV=true;
  if(!mainRoadAt)return g;
  const clipped=clipRoadOverlap(g,mainRoadAt,{height});g.dispose();return clipped;
}

// Trim the branch at the actual main-road boundary, including its edge paint.
// Rendering and collision use this same mesh, so a fork has only one surface.
export function clipRoadOverlap(geometry,mainRoadAt,{height=0,snap=true}={}){
  const p=geometry.attributes.position,uv=geometry.attributes.uv,index=geometry.index,positions=[],uvs=[];
  const clearance=v=>{const r=mainRoadAt(v[0],v[2]);return r.distanceToRoad-r.width/2;};
  const vertex=i=>[p.getX(i),p.getY(i),p.getZ(i),uv?.getX(i)??0,uv?.getY(i)??0];
  for(let i=0;i<(index?.count??p.count);i+=3){
    const triangle=[0,1,2].map(k=>vertex(index?index.getX(i+k):i+k)),polygon=[];
    for(let j=0;j<3;j++){
      const a=triangle[j],b=triangle[(j+1)%3],outside=clearance(a)>=0,next=clearance(b)>=0;
      if(outside)polygon.push(a);
      if(outside!==next){
        let lo=0,hi=1;for(let n=0;n<22;n++){const t=(lo+hi)/2,v=a.map((x,k)=>x+(b[k]-x)*t);if((clearance(v)>=0)===outside)lo=t;else hi=t;}
        const t=(lo+hi)/2,v=a.map((x,k)=>x+(b[k]-x)*t);if(snap)v[1]=mainRoadAt(v[0],v[2]).y+height;polygon.push(v);
      }
    }
    for(let j=1;j<polygon.length-1;j++)for(const v of [polygon[0],polygon[j],polygon[j+1]]){positions.push(...v.slice(0,3));uvs.push(...v.slice(3));}
  }
  const result=new THREE.BufferGeometry();result.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));result.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));result.computeVertexNormals();result.userData.circuitUV=true;return result;
}

// Open actual barrier portals and remove obstructing dressing before batching.
// Source GLBs are untouched. Terrain is lowered locally under the new roads.
export function openBiggasRoutes(assets,colliders,routes){
  const p=new THREE.Vector3(),center=new THREE.Vector3(),box=new THREE.Box3();
  function inCorridor(x,y,z,extra=0){const r=routes.nearest(x,z);return r&&r.distanceToRoad<r.width/2+extra&&y>r.y-2&&y<r.y+11;}
  function cutMesh(mesh,terrain=false,cliff=false){
    const original=mesh.geometry;let g=original.clone().applyMatrix4(mesh.matrixWorld);
    // Refine before excavating shoulders: coarse faces otherwise bridge back
    // over the lower side of a banked road even when their corners are clear.
    if(terrain&&mesh.material.name==='Vegetacion terreno'){const coarse=g;g=refineBiggasTerrain(coarse);coarse.dispose();}
    const pos=g.attributes.position;
    if(terrain){
      for(let i=0;i<pos.count;i++){
        const r=routes.nearest(pos.getX(i),pos.getZ(i));if(!r||r.station<=12||r.station>=r.branch.length-12)continue;
        const sculpted=/Continuous_sculpted_landscape/.test(mesh.name),blend=sculpted?1-THREE.MathUtils.smoothstep(r.distanceToRoad,r.width/2+7,r.width/2+22):Number(r.distanceToRoad<r.width/2+16);
        pos.setY(i,THREE.MathUtils.lerp(pos.getY(i),Math.min(pos.getY(i),r.y-.7-Math.abs(r.bank??0)*(r.width/2+3)),blend));
      }
    }else if(cliff){
      const old=g,index=g.index,uv=g.attributes.uv,positions=[],uvs=[];
      const clip=(polygon,y,above)=>{
        const out=[];
        for(let i=0;i<polygon.length;i++){
          const a=polygon[i],b=polygon[(i+1)%polygon.length],inside=above?a[1]>=y:a[1]<=y,next=above?b[1]>=y:b[1]<=y;
          if(inside)out.push(a);
          if(inside!==next){const t=(y-a[1])/(b[1]-a[1]);out.push(a.map((v,j)=>v+(b[j]-v)*t));}
        }return out;
      };
      const emit=poly=>{for(let k=1;k<poly.length-1;k++)for(const v of [poly[0],poly[k],poly[k+1]]){positions.push(...v.slice(0,3));uvs.push(...v.slice(3));}};
      for(let i=0;i<(index?.count??pos.count);i+=3){
        const poly=[0,1,2].map(k=>{const j=index?index.getX(i+k):i+k;return [pos.getX(j),pos.getY(j),pos.getZ(j),uv?.getX(j)??0,uv?.getY(j)??0];});
        const minX=Math.min(...poly.map(v=>v[0])),maxX=Math.max(...poly.map(v=>v[0])),minZ=Math.min(...poly.map(v=>v[2])),maxZ=Math.max(...poly.map(v=>v[2]));
        const crosses=routes.branches[2].samples.some(r=>r.x>=minX-14&&r.x<=maxX+14&&r.z>=minZ-14&&r.z<=maxZ+14);
        if(crosses){emit(clip(poly,39,false));emit(clip(poly,51,true));}else emit(poly);
      }
      g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.computeVertexNormals();old.dispose();
    }else{
      const index=g.index,kept=[],n=index?.count??pos.count;
      for(let i=0;i<n;i+=3){const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k);center.set(0,0,0);for(const id of ids)center.add(p.fromBufferAttribute(pos,id));center.multiplyScalar(1/3);
        const remove=ids.some(id=>inCorridor(pos.getX(id),pos.getY(id),pos.getZ(id),3))||inCorridor(center.x,center.y,center.z,3);
        if(!remove)kept.push(...ids);
      }g.setIndex(kept);
    }
    g.applyMatrix4(new THREE.Matrix4().copy(mesh.matrixWorld).invert());g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();mesh.geometry=g;original.dispose();
  }
  for(const asset of assets){asset.scene.updateMatrixWorld(true);const remove=new Set(),seen=new Set();
    asset.scene.traverse(mesh=>{
      if(!mesh.isMesh)return;
      if(/Continuous_sculpted_landscape|Urban_sidewalk|District_|Park_promenade|Urban_block_foundation/.test(mesh.name)){cutMesh(mesh,true);return;}
      if(/Continuous_safety_parapet|Continuous_white_edge|Integrated_paved_shoulder/.test(mesh.name)){cutMesh(mesh);return;}
      if(/Continuous_eroded_basalt_escarpment|Irregular_rocky_pool_shore/.test(mesh.name)){cutMesh(mesh,false,true);return;}
      if(!/Asset_|F039_|Shop_|Street_planter|Building_foundation|Barrier_luminous|Drainage_|Apex_striped/.test(mesh.name))return;
      const object=/Asset_|F039_/.test(mesh.parent?.name??'')?mesh.parent:mesh;
      if(seen.has(object))return;seen.add(object);box.setFromObject(object);
      for(const branch of routes.branches){if(!branch.bounds.intersectsBox(box))continue;
        const margin=branch.id==='roots'?17:3;
        if(branch.samples.some(r=>r.station>14&&r.station<branch.length-14&&(branch.id==='roots'||r.y+11>box.min.y)&&r.x>=box.min.x-r.width/2-margin&&r.x<=box.max.x+r.width/2+margin&&r.z>=box.min.z-r.width/2-margin&&r.z<=box.max.z+r.width/2+margin)){
          // Remove a whole prefab's geometry, including its high roof/canopy.
          // Keep light nodes at their authored transforms.
          object.traverse(child=>{if(child.isMesh)remove.add(child);});break;
        }
      }
    });remove.forEach(mesh=>mesh.removeFromParent());
  }
  colliders.updateMatrixWorld(true);colliders.traverse(mesh=>{if(mesh.isMesh&&/COL_BARRIER/.test(mesh.name))cutMesh(mesh);});
  // The authored CASCADE marker stood where the new gallery entrance runs.
  // Move the entire sign onto its outer shoulder after excavating the terrain,
  // keeping its lettering/frame aligned and embedding the post in the ground.
  const core=assets[0]?.scene,post=core?.getObjectByName('Sector_sign_post008');
  if(post){
    const bounds=new THREE.Box3().setFromObject(post),center=bounds.getCenter(new THREE.Vector3()),road=routes.nearest(center.x,center.z),terrain=[];
    for(const asset of assets)asset.scene.traverse(mesh=>{if(mesh.isMesh&&mesh.material.name==='Vegetacion terreno')terrain.push(mesh);});
    const heightAt=createSurfaceIndex(terrain),offset=road.width/2+5,x=road.x+road.nz*offset,z=road.z-road.nx*offset,ground=heightAt(x,z);
    if(ground!==null){
      const delta=new THREE.Vector3(x-center.x,ground-.04-bounds.min.y,z-center.z);
      for(const name of ['Sector_sign_post008','Sector_direction_panel008','09____CASCADE']){
        const object=core.getObjectByName(name);if(!object)continue;
        const position=object.getWorldPosition(new THREE.Vector3()).add(delta);
        object.position.copy(object.parent.worldToLocal(position));object.updateMatrixWorld(true);
      }
    }
  }
}
