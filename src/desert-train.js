import * as THREE from 'three';

// Distances are metres and speed is metres/second. Intervals are measured from
// one locomotive departure to the next; a new pass also waits for the last car.
export const TRAIN_SETTINGS=Object.freeze({
  speedMps:60, // 216 km/h
  initialDelaySeconds:8,
  minIntervalSeconds:45,
  maxIntervalSeconds:60,
  endpointMarginM:1,
  couplingThicknessM:.16,
});

const clamp=THREE.MathUtils.clamp;
const up=new THREE.Vector3(0,1,0);

// The runtime owns only the generated couplers. The world owns the loaded GLB
// meshes/materials, so shared wagon geometry is never cloned or disposed here.
export function createDesertTrain({root,railway}){
  const path=railway.path,pathLength=railway.path_length_m;
  if(!Array.isArray(path)||path.length<2)throw new Error('Desert Valley: invalid railway path.');
  const settings=TRAIN_SETTINGS,formation=railway.units_in_formation;
  const staticCouplings=root.getObjectByName('TRAIN_StaticCouplingPreview');
  if(staticCouplings)staticCouplings.visible=false;
  root.updateMatrixWorld(true);
  const inverse=new THREE.Matrix4(),relative=new THREE.Matrix4(),box=new THREE.Box3();
  const units=formation.map(info=>{
    const node=root.getObjectByName(info.node);
    if(!node)throw new Error(`Desert Valley: missing train vehicle ${info.node}.`);
    // All authored pivots use local +X forward and wheel contact at local Y=0.
    // Keep multi-material child meshes and their shared geometry intact.
    root.attach(node);node.updateMatrixWorld(true);
    inverse.copy(node.matrixWorld).invert();const bounds=new THREE.Box3();
    node.traverse(mesh=>{
      if(!mesh.isMesh)return;
      mesh.geometry.computeBoundingBox();
      relative.multiplyMatrices(inverse,mesh.matrixWorld);
      box.copy(mesh.geometry.boundingBox).applyMatrix4(relative);bounds.union(box);
      mesh.castShadow=true;mesh.receiveShadow=true;
    });
    const scale=node.scale;
    return {node,info,bounds,worldBounds:new THREE.Box3(),position:new THREE.Vector3(),previous:new THREE.Vector3(),
      forward:new THREE.Vector3(1,0,0),front:new THREE.Vector3(),back:new THREE.Vector3(),
      halfLength:Math.max(Math.abs(bounds.min.x),Math.abs(bounds.max.x))*Math.abs(scale.x),
      halfWidth:Math.max(Math.abs(bounds.min.z),Math.abs(bounds.max.z))*Math.abs(scale.z),
      previousMinY:0,previousMaxY:0,visible:false,wasVisible:false};
  });
  const couplingGeometry=new THREE.BoxGeometry(1,1,1);
  const couplingMaterial=new THREE.MeshStandardMaterial({color:0x34302b,roughness:.82,metalness:.45});
  const couplings=new THREE.InstancedMesh(couplingGeometry,couplingMaterial,Math.max(0,units.length-1));
  couplings.name='TRAIN_DynamicCouplings';couplings.castShadow=true;couplings.receiveShadow=true;
  // Forty short bars span a long moving formation. Bounds change every tick.
  couplings.frustumCulled=false;root.add(couplings);
  const front=new THREE.Vector3(),back=new THREE.Vector3(),axisX=new THREE.Vector3(),axisY=new THREE.Vector3(),axisZ=new THREE.Vector3();
  const basis=new THREE.Matrix4(),dummy=new THREE.Object3D(),delta=new THREE.Vector3();
  let active=false,wait=settings.initialDelaySeconds,direction=railway.current_direction===1?1:-1;
  let nextDirection=direction,headTravel=0,passElapsed=0,interval=0,passId=0,disposed=false;
  const last=units[units.length-1],loco=units[0];
  const clearTravel=pathLength+last.info.distance_from_locomotive_m+last.halfLength+settings.endpointMarginM;

  function sample(distance,target){
    // Extrapolate outside either mouth so vehicles enter in formation; no
    // wrapping or bunching at clamped rail endpoints.
    let a=0,b=path.length-1;
    if(distance<=0)b=1;
    else if(distance>=pathLength)a=b-1;
    else{
      while(b-a>1){const middle=(a+b)>>1;if(path[middle].distance_m<=distance)a=middle;else b=middle;}
    }
    const first=path[a],second=path[b],t=(distance-first.distance_m)/(second.distance_m-first.distance_m);
    return target.fromArray(first.position).lerp(delta.fromArray(second.position),t);
  }

  function placeUnits(){
    for(const unit of units){
      unit.previous.copy(unit.position);unit.previousMinY=unit.worldBounds.min.y;unit.previousMaxY=unit.worldBounds.max.y;unit.wasVisible=unit.visible;
      const travel=headTravel-unit.info.distance_from_locomotive_m;
      const distance=direction===1?travel:pathLength-travel;
      const bogies=unit.info.bogie_centers_local_gltf;
      sample(distance+direction*bogies[0][0],front);sample(distance+direction*bogies[1][0],back);
      axisX.subVectors(front,back).normalize();axisZ.crossVectors(axisX,up).normalize();axisY.crossVectors(axisZ,axisX).normalize();
      basis.makeBasis(axisX,axisY,axisZ);
      unit.node.quaternion.setFromRotationMatrix(basis);
      unit.node.position.addVectors(front,back).multiplyScalar(.5);
      unit.node.position.y+=railway.rail_top_offset_m??.13;
      // Per-vehicle visibility makes the formation emerge/leave progressively.
      // The tunnel hides the inner mouth; the other endpoint is off the map.
      unit.visible=active&&travel+unit.halfLength>=0&&travel-unit.halfLength<=pathLength;
      unit.node.visible=unit.visible;unit.node.updateMatrix();
      unit.front.fromArray(unit.info.coupler_local_gltf[0]).applyMatrix4(unit.node.matrix);
      unit.back.fromArray(unit.info.coupler_local_gltf[1]).applyMatrix4(unit.node.matrix);
    }
    root.updateMatrixWorld(true);
    for(const unit of units){
      unit.position.setFromMatrixPosition(unit.node.matrixWorld);
      unit.forward.setFromMatrixColumn(unit.node.matrixWorld,0);unit.forward.y=0;unit.forward.normalize();
      unit.worldBounds.copy(unit.bounds).applyMatrix4(unit.node.matrixWorld);
      if(!unit.wasVisible){unit.previous.copy(unit.position);unit.previousMinY=unit.worldBounds.min.y;unit.previousMaxY=unit.worldBounds.max.y;}
    }
    for(let i=0;i<units.length-1;i++){
      const leading=units[i],trailing=units[i+1];
      dummy.position.addVectors(leading.back,trailing.front).multiplyScalar(.5);
      delta.subVectors(trailing.front,leading.back);const length=delta.length();
      if(leading.visible&&trailing.visible&&length>1e-5){
        dummy.quaternion.setFromUnitVectors(up,delta.multiplyScalar(1/length));
        dummy.scale.set(settings.couplingThicknessM,length,settings.couplingThicknessM);
      }else dummy.scale.setScalar(0);
      dummy.updateMatrix();couplings.setMatrixAt(i,dummy.matrix);
    }
    couplings.instanceMatrix.needsUpdate=true;couplings.visible=active;
  }

  function beginPass(){
    direction=nextDirection;nextDirection=-direction;active=true;passElapsed=0;passId++;
    headTravel=-loco.halfLength-settings.endpointMarginM;
    interval=settings.minIntervalSeconds+Math.random()*(settings.maxIntervalSeconds-settings.minIntervalSeconds);
  }

  // Swept point against a rectangle expanded by the ship capsule radius. Work
  // in the moving car frame so neither a fast train nor a fast ship can pass
  // through a thin side between simulation ticks.
  function sweep(x0,z0,x1,z1,hx,hz){
    let entry=0,exit=1,nx=0,nz=0;
    for(const axis of [0,1]){
      const start=axis===0?x0:z0,end=axis===0?x1:z1,extent=axis===0?hx:hz,velocity=end-start;
      if(Math.abs(velocity)<1e-8){if(Math.abs(start)>extent)return null;continue;}
      let near=(-extent-start)/velocity,far=(extent-start)/velocity,sign=-1;
      if(near>far){[near,far]=[far,near];sign=1;}
      if(near>entry){entry=near;nx=axis===0?sign:0;nz=axis===1?sign:0;}
      exit=Math.min(exit,far);if(entry>exit)return null;
    }
    if(exit<0||entry>1)return null;
    if(nx===0&&nz===0){
      if(Math.abs(x1)>hx||Math.abs(z1)>hz)return null;
      if(hx-Math.abs(x1)<hz-Math.abs(z1))nx=Math.sign(x1)||1;
      else nz=Math.sign(z1)||1;
    }
    const depth=nx!==0?hx-nx*x1:hz-nz*z1;
    return depth>0?{nx,nz,depth,t:clamp(entry,0,1)}:null;
  }

  function collide(state,dt,previous){
    if(!active||disposed||dt<=0)return;
    const shape=state.hull,spacing=shape?.capsuleSpacing??.9,radius=shape?.capsuleRadius??1.25;
    const shipX=Math.sin(state.yaw),shipZ=Math.cos(state.yaw),before=previous??state;
    let strongest=0,impactNX=0,impactNZ=0;
    for(const unit of units){
      if(!unit.visible)continue;
      const fx=unit.forward.x,fz=unit.forward.z,rx=-fz,rz=fx;
      const trainVX=(unit.position.x-unit.previous.x)/dt,trainVZ=(unit.position.z-unit.previous.z)/dt;
      const reach=unit.halfLength+spacing+radius+Math.hypot(state.vx-trainVX,state.vz-trainVZ)*dt+2;
      if((state.x-unit.position.x)**2+(state.z-unit.position.z)**2>reach*reach)continue;
      for(const offset of [-spacing,0,spacing]){
        const dx=state.x+shipX*offset-unit.position.x,dz=state.z+shipZ*offset-unit.position.z;
        const previousDX=before.x+shipX*offset-unit.previous.x,previousDZ=before.z+shipZ*offset-unit.previous.z;
        const hit=sweep(previousDX*fx+previousDZ*fz,previousDX*rx+previousDZ*rz,dx*fx+dz*fz,dx*rx+dz*rz,unit.halfLength+radius,unit.halfWidth+radius);
        if(!hit)continue;
        const shipY=before.y+(state.y-before.y)*hit.t;
        const minimumY=unit.previousMinY+(unit.worldBounds.min.y-unit.previousMinY)*hit.t;
        const maximumY=unit.previousMaxY+(unit.worldBounds.max.y-unit.previousMaxY)*hit.t;
        // Include the capsule hemispheres. A ship above the roof can jump over
        // the train; trackside elevation alone never triggers a collision.
        if(shipY+(shape?.capsuleBottom??1.2)-radius>maximumY||shipY+(shape?.capsuleTop??2.45)+radius<minimumY)continue;
        const nx=hit.nx*fx+hit.nz*rx,nz=hit.nx*fz+hit.nz*rz;
        state.x+=nx*(hit.depth+.02);state.z+=nz*(hit.depth+.02);state.wallHit=true;
        const incoming=(state.vx-trainVX)*nx+(state.vz-trainVZ)*nz;
        if(incoming<0){
          const impulse=Math.min(85,-incoming*1.08);
          state.vx+=nx*impulse;state.vz+=nz*impulse;state.throttle=Math.min(state.throttle,8);
          if(-incoming>strongest){strongest=-incoming;impactNX=nx;impactNZ=nz;}
        }
      }
    }
    if(strongest>1.5){state.impact=Math.min(14,strongest);state.impactSerial++;state.impactX=state.x-impactNX*radius;state.impactZ=state.z-impactNZ*radius;}
    state.speed=Math.hypot(state.vx,state.vz);
  }

  const audiblePoint=new THREE.Vector3(),candidate=new THREE.Vector3();
  function audioState(listenerPosition){
    let nearest=Infinity,anyVisible=false;
    if(active)for(const unit of units){
      if(!unit.visible)continue;anyVisible=true;
      // One rolling source follows the closest portion of the long formation,
      // so the last wagons still clack when the locomotive is far away.
      const along=clamp((listenerPosition.x-unit.position.x)*unit.forward.x+(listenerPosition.z-unit.position.z)*unit.forward.z,-unit.halfLength,unit.halfLength);
      candidate.copy(unit.position).addScaledVector(unit.forward,along);candidate.y+=.7;
      const distance=candidate.distanceToSquared(listenerPosition);
      if(distance<nearest){nearest=distance;audiblePoint.copy(candidate);}
    }
    return {active:active&&anyVisible,passId,locomotive:loco.position,locomotiveVisible:loco.visible,rolling:audiblePoint,speedMps:settings.speedMps};
  }

  function reset(){
    active=false;wait=settings.initialDelaySeconds;nextDirection=railway.current_direction===1?1:-1;
    headTravel=-loco.halfLength-settings.endpointMarginM;placeUnits();
  }
  reset();
  return {
    root,settings,get active(){return active;},get passId(){return passId;},
    step(dt){
      if(disposed||dt<=0)return;
      if(!active){wait-=dt;if(wait>0)return;beginPass();}
      passElapsed+=dt;headTravel+=settings.speedMps*dt;
      if(headTravel>clearTravel){active=false;wait=Math.max(0,interval-passElapsed);}
      placeUnits();
    },
    collide,audioState,reset,
    dispose(){if(disposed)return;disposed=true;active=false;couplings.removeFromParent();couplings.dispose();couplingGeometry.dispose();couplingMaterial.dispose();},
  };
}
