import * as THREE from 'three';
import {Octree} from 'three/addons/math/Octree.js';
import {Capsule} from 'three/addons/math/Capsule.js';
import {MIN_HOVER_HEIGHT,MAX_HOVER_HEIGHT} from './circuit-physics.js';

// Ignore collider materials and embedded albedo images: only geometry is needed.
export const collisionMaterials=parser=>({name:'collision-materials',loadMaterial(index){return Promise.resolve(new THREE.MeshBasicMaterial({name:parser.json.materials?.[index]?.name??'Collider'}));}});

// Indexed triangle heights retain sidewalks and terrain under the road, but
// exclude architecture: a bridge roof must never become the driving surface.
export function createSurfaceIndex(meshes){
  const list=Array.isArray(meshes)?meshes:[meshes],grid=new Map(),cell=12;
  const count=list.reduce((n,m)=>n+(m.geometry.index?.count??m.geometry.attributes.position.count)/3,0),data=new Float64Array(count*10);
  const p=new THREE.Vector3();let used=0;
  for(const mesh of list){mesh.updateWorldMatrix(true,false);const g=mesh.geometry,pos=g.attributes.position,idx=g.index,n=idx?.count??pos.count;
    for(let i=0;i<n;i+=3){const at=used*10;
      for(let k=0;k<3;k++){p.fromBufferAttribute(pos,idx?idx.getX(i+k):i+k).applyMatrix4(mesh.matrixWorld);data[at+k*3]=p.x;data[at+k*3+1]=p.y;data[at+k*3+2]=p.z;}
      const ax=data[at],az=data[at+2],bx=data[at+3],bz=data[at+5],cx=data[at+6],cz=data[at+8],den=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);if(Math.abs(den)<1e-9)continue;data[at+9]=den;
      for(let x=Math.floor(Math.min(ax,bx,cx)/cell);x<=Math.floor(Math.max(ax,bx,cx)/cell);x++)for(let z=Math.floor(Math.min(az,bz,cz)/cell);z<=Math.floor(Math.max(az,bz,cz)/cell);z++){
        const key=`${x},${z}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(at);
      }used++;
    }
  }
  return (x,z)=>{let height=-Infinity;
    for(const i of grid.get(`${Math.floor(x/cell)},${Math.floor(z/cell)}`)??[]){
      const ax=data[i],az=data[i+2],bx=data[i+3],bz=data[i+5],cx=data[i+6],cz=data[i+8];
      const u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/data[i+9],v=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/data[i+9];
      if(u>=-1e-5&&v>=-1e-5&&u+v<=1.00001)height=Math.max(height,u*data[i+1]+v*data[i+4]+(1-u-v)*data[i+7]);
    }return Number.isFinite(height)?height:null;
  };
}

export function createCityCollision(root,{isFloor=mesh=>/COL_TRACK|COL_STREET_CURB|COL_CITY_SIDEWALK|COL_ENV_TERRAIN_(CITY|DISTANT)/.test(mesh.name),isSolid=()=>true,exploration=false,surfaceHeightOverride=null}={}){
  const floor=[],solids=new THREE.Group();root.updateMatrixWorld(true);
  root.traverse(mesh=>{if(!mesh.isMesh)return;
    if(isFloor(mesh))floor.push(mesh);
    else if(isSolid(mesh)){const proxy=new THREE.Mesh(mesh.geometry,mesh.material);proxy.matrix.copy(mesh.matrixWorld);proxy.matrixAutoUpdate=false;solids.add(proxy);}
  });
  const surfaceHeight=surfaceHeightOverride??createSurfaceIndex(floor),octree=new Octree().fromGraphNode(solids),hull=new Capsule(),normal=new THREE.Vector3();
  function step(state,dt,landscape,previous){
    // Three vertical capsules approximate the hull. Fixed 60 Hz steps travel at
    // most 1.2 m, less than the capsule diameter, preventing thin-wall tunnelling.
    state.wallHit=false;const fx=Math.sin(state.yaw),fz=Math.cos(state.yaw);
    const shape=state.hull,spacing=shape?.capsuleSpacing??.9;
    for(let pass=0;pass<2;pass++)for(const offset of [-spacing,0,spacing]){
      hull.start.set(state.x+fx*offset,state.y+(shape?.capsuleBottom??1.2),state.z+fz*offset);hull.end.set(hull.start.x,state.y+(shape?.capsuleTop??2.45),hull.start.z);hull.radius=shape?.capsuleRadius??1.25;
      const hit=octree.capsuleIntersect(hull);if(!hit)continue;
      normal.copy(hit.normal);state.x+=normal.x*hit.depth;state.z+=normal.z*hit.depth;
      if(normal.y<-.8&&previous){
        state.x=previous.x;state.z=previous.z;state.wallHit=true;
        if(state.speed>1.5){state.impact=Math.min(14,state.speed);state.impactSerial++;state.impactX=state.x+fx*2;state.impactZ=state.z+fz*2;}
        state.vx*= -.1;state.vz*= -.1;state.throttle=Math.min(state.throttle,5);continue;
      }
      if(Math.abs(normal.y)>.8)continue;
      state.wallHit=true;const inward=state.vx*normal.x+state.vz*normal.z;
      if(inward<0){state.vx-=inward*1.18*normal.x;state.vz-=inward*1.18*normal.z;state.vx*=.92;state.vz*=.92;state.throttle=Math.min(state.throttle,Math.hypot(state.vx,state.vz)+3);
        if(inward< -1.5){state.impact=Math.min(14,-inward);state.impactSerial++;state.impactX=state.x-normal.x*1.3;state.impactZ=state.z-normal.z*1.3;state.hoverVelocity+=Math.min(.4,-inward*.025);}
      }
    }
    const road=landscape.roadAt(state.x,state.z),offRoad=road.distanceToRoad>road.width/2+1;
    if(offRoad&&!exploration){const drag=Math.exp(-dt*.65);state.vx*=drag;state.vz*=drag;}
    state.offTrackTime=offRoad?(state.offTrackTime??0)+dt:0;
    const floorY=surfaceHeight(state.x,state.z);
    if(floorY!==null&&!state.airborne){
      // A lateral collision can move the ship onto a different surface height.
      // Preserve suspension momentum; only correct unsafe clearance.
      state.hover=THREE.MathUtils.clamp(state.y-floorY,MIN_HOVER_HEIGHT,MAX_HOVER_HEIGHT);
      if(state.y<floorY+MIN_HOVER_HEIGHT)state.hoverVelocity=Math.max(0,state.hoverVelocity);
      if(state.y>floorY+MAX_HOVER_HEIGHT)state.hoverVelocity=Math.min(0,state.hoverVelocity);
      state.y=floorY+state.hover;
    }
    state.recoverNeeded=floorY===null||(!exploration&&(road.distanceToRoad>70||state.offTrackTime>10));
    state.speed=Math.hypot(state.vx,state.vz);
  }
  const cameraRay=new THREE.Ray(),cameraDelta=new THREE.Vector3();
  function clipCamera(from,to){cameraDelta.subVectors(to,from);const distance=cameraDelta.length();cameraRay.set(from,cameraDelta.normalize());const hit=octree.rayIntersect(cameraRay);if(hit&&hit.distance<distance)to.copy(from).addScaledVector(cameraDelta,Math.max(.5,hit.distance-.4));}
  return {surfaceHeight,step,clipCamera,dispose(){octree.clear();}};
}
