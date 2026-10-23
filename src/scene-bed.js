import * as THREE from 'three';
import {TessellateModifier} from 'three/addons/modifiers/TessellateModifier.js';
import {layout} from './home-layout.js';
import {canStand,findWalkPath} from './home-movement.js';

// Fit the sleeping pose to the authored pillow and deform the supplied bedding,
// preserving its colors, stitched edges and throw rather than adding a new cover.
export function createSceneBed(entry) {
  const object=entry.object,pillowBounds=new THREE.Box3(),parts=[];
  object.updateWorldMatrix(true,true);
  const inverse=object.matrixWorld.clone().invert(),point=new THREE.Vector3();
  object.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const name=mesh.name.replaceAll('_',' ');
    const pillow=/single linen pillow/.test(name),bedding=/duvet|throw|fringe/.test(name);
    if(!pillow&&!bedding)return;
    // The cuff's original cap spans the whole mattress with a few triangles.
    // Give it enough vertices to bend with the duvet instead of cutting a
    // straight plane through the chest between its raised edges.
    mesh.geometry=/turned back cuff/.test(name)?new TessellateModifier(.06,8).modify(mesh.geometry):mesh.geometry.clone();
    const toBed=new THREE.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld),fromBed=toBed.clone().invert();
    const positions=mesh.geometry.attributes.position,rest=[];
    for(let i=0;i<positions.count;i++){
      point.fromBufferAttribute(positions,i).applyMatrix4(toBed);rest.push(point.clone());
      if(pillow)pillowBounds.expandByPoint(point);
    }
    parts.push({mesh,positions,rest,fromBed,pillow});
  });
  const pillowCenter=pillowBounds.getCenter(new THREE.Vector3()),scale=new THREE.Vector3();
  let cover=0,compression=0,retraction=0,lieLocal=new THREE.Vector3();
  function fit(origin) {
    object.updateWorldMatrix(true,true);object.getWorldScale(scale);
    // In the sleeping pose the head center is 0.21 behind the root and its
    // underside is 0.085 above it (world units, independent of furniture scale).
    lieLocal.set(pillowCenter.x,pillowCenter.y-.085/scale.y,pillowCenter.z+.21/scale.z);
    const lie=object.localToWorld(lieLocal.clone());
    const forward=new THREE.Vector3(0,0,1).transformDirection(object.matrixWorld);
    const heading=Math.atan2(forward.x,forward.z),candidates=[];
    const from=canStand(origin.x,origin.z)?origin:layout.stand;
    for(const sign of [-1,1])for(const offset of [0,.25,.5,.75])for(const gap of [.08,.24,.4]){
      const position=object.localToWorld(new THREE.Vector3(sign*(.56+(layout.radius+gap)/scale.x),0,lieLocal.z+offset/scale.z));
      position.y=layout.home.y;
      if(canStand(position.x,position.z))candidates.push(position);
    }
    candidates.sort((a,b)=>a.distanceToSquared(origin)-b.distanceToSquared(origin));
    const side=candidates.find(position=>findWalkPath(from,position).length);
    if(!side)return null;
    const sideHeading=Math.atan2(lie.x-side.x,lie.z-side.z);
    layout.bed={object,lie,side,heading,sideHeading,blanket:true};
    return {position:side,heading:sideHeading,stay:true};
  }
  const item={object,action:'sleep',label:'Sleep',bed:true,lift:1,getVisit:fit,
    targetPoint:()=>object.localToWorld(new THREE.Vector3(0,.65,.2))};
  return {item,update({lying=0,opening=0}={}){
    const target=THREE.MathUtils.smoothstep(lying,.65,1);
    if(cover===target&&compression===lying&&retraction===opening)return;
    // Journey phases provide the easing. An extra damp here lets the body
    // overtake the cloth during a climb or an interrupted exit.
    cover=target;compression=lying;retraction=opening;
    object.getWorldScale(scale);
    for(const {mesh,positions,rest,fromBed,pillow} of parts){
      rest.forEach((vertex,i)=>{
        point.copy(vertex);
        if(pillow)point.y-=.5*(point.y-pillowBounds.min.y)*lying;
        else {
          // Fold towards the foot before the body crosses onto the mattress;
          // unfold over the settled pose, with every trim following the sheet.
          const neckline=.05/scale.z*Math.exp(-Math.pow(point.x*scale.x/.18,4))*(1-THREE.MathUtils.smoothstep(point.z,-.38,-.08))*cover;
          point.z=THREE.MathUtils.lerp(point.z+neckline,.84+(point.z+.38)*.12,opening);
          const across=Math.pow(Math.max(0,1-Math.pow(Math.abs(point.x)/.535,4)),.6);
          const along=1-THREE.MathUtils.smoothstep((point.z-lieLocal.z)*scale.z,.5,1.4);
          point.y+=.68/scale.y*across*along*cover;
        }
        point.applyMatrix4(fromBed);positions.setXYZ(i,point.x,point.y,point.z);
      });
      positions.needsUpdate=true;
      mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();
    }
  }};
}
