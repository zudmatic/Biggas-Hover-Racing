import * as THREE from 'three/webgpu';

// Retain the emitter pose: old flame sections must not rotate with the ship.
// Each nozzle gets one ribbon that turns around the flame axis to face the camera, so it never goes edge-on
// (crossed fixed sheets collapse into hard-edged wedges when seen from behind, as in the racing camera).
// Every ribbon row is gas emitted `age` seconds ago: it carries the nozzle's average velocity since then
// (Herencia) plus the exhaust speed along the nozzle axis (Escape), and air drag (Arrastre, seconds) slows it.
// Averaging (not the velocity at emission) means a wall stop can't fling old gas past the nozzle.
// Near the mouth the flame therefore follows the nozzle axis even while drifting; only the tail falls behind
// along the path and lags the hull's rotation, like water from a swinging hose.
export function createFlameTrail(scene,material,nozzles=[[-.68,.62,-2.14,.24],[.68,.62,-2.14,.24]]){
  const history=[],strips=[],segments=48,raw=96,step=1/60;
  const position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();
  const local=new THREE.Vector3(),nozzleNow=new THREE.Vector3(),velocity=new THREE.Vector3(),exhaust=new THREE.Vector3();
  const center=new THREE.Vector3(),axis=new THREE.Vector3(),tangent=new THREE.Vector3();
  const cameraPosition=new THREE.Vector3(),toCamera=new THREE.Vector3();
  const path=Array.from({length:raw+1},()=>({point:new THREE.Vector3(),right:new THREE.Vector3(),along:0}));
  const rows=Array.from({length:segments+1},()=>({point:new THREE.Vector3(),right:new THREE.Vector3()}));
  let hasCamera=false;
  for(const nozzle of nozzles){
    const geometry=new THREE.PlaneGeometry(1,1,1,segments);
    geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;scene.add(mesh);
    // Camera pose lags one frame, which is invisible on a ribbon this soft.
    mesh.onBeforeRender=(_renderer,_scene,camera)=>{camera.getWorldPosition(cameraPosition);hasCamera=true;};
    strips.push({mesh,nozzle,index:strips.length});
  }
  // Interpolated ship pose at `when` (clamped to the recorded history) into position/rotation/scale.
  function pose(when){
    let lo=0,hi=history.length-1;
    while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(history[mid].time<=when)lo=mid;else hi=mid-1;}
    const a=history[lo],b=history[Math.min(lo+1,history.length-1)];
    const blend=b.time>a.time?THREE.MathUtils.clamp((when-a.time)/(b.time-a.time),0,1):0;
    position.lerpVectors(a.position,b.position,blend);rotation.slerpQuaternions(a.rotation,b.rotation,blend);scale.lerpVectors(a.scale,b.scale,blend);
  }
  return {
    record(time,ship){
      ship.updateMatrixWorld(true);
      ship.matrixWorld.decompose(position,rotation,scale);
      const last=history.at(-1);
      if(last&&time===last.time)return;
      if(last&&(time<last.time||position.distanceTo(last.position)>15))history.length=0;
      const sample=history.length>=240?history.shift():{position:new THREE.Vector3(),rotation:new THREE.Quaternion(),scale:new THREE.Vector3()};
      sample.time=time;sample.position.copy(position);sample.rotation.copy(rotation);sample.scale.copy(scale);history.push(sample);
    },
    update(time,settings,power,_speed,lift){
      if(!history.length)return;
      const latest=history.at(-1),modelScale=Math.max(latest.scale.x,latest.scale.y,latest.scale.z);
      const pulse=1+settings.Pulsación*Math.sin(time*31),idleWidth=THREE.MathUtils.lerp(.6,1,THREE.MathUtils.smoothstep(power,.13,.45));
      const escape=Math.max(.5,settings.Escape??24),drag=Math.max(.02,settings.Arrastre??.3),inherit=settings.Herencia??1;
      for(const {mesh,nozzle,index} of strips){
        mesh.visible=settings.Activa&&power>.005;
        if(!mesh.visible)continue;
        // Root on the measured exit plane; a pilot length keeps the idle flame attached to the mouth.
        const mouth=settings.Bocas?.[index],start=(mouth?.start??0)+(settings.Separación??0),mouthRadius=mouth?.radius??Infinity;
        // The pilot floor fades with power below idle (.13), so a cut-off flame shrinks instead of popping.
        const length=Math.max(settings.Longitud*power,(settings.Mínima??0)*nozzle[3]/.24*Math.min(1,power/.13))*modelScale*pulse;
        // The visible flame (~68% of the ribbon) is capped to the mouth for the first 5%, then opens up.
        const halfWidth=.5*settings.Ancho*modelScale*(nozzle[3]/.24)*idleWidth,squeeze=Math.min(1,.9*mouthRadius*modelScale/(.68*halfWidth));
        // Gas positions over a growing age window until the path is long enough (drag caps how far gas travels).
        pose(time);nozzleNow.set(nozzle[0],nozzle[1],nozzle[2]-start).multiply(scale).applyQuaternion(rotation).add(position);
        let span=1.5*length/escape,total=0;
        for(let attempt=0;attempt<5;attempt++){
          total=0;
          for(let j=0;j<=raw;j++){
            const age=span*j/raw,entry=path[j];
            pose(time-age);local.set(nozzle[0],nozzle[1],nozzle[2]-start).multiply(scale);
            entry.point.copy(local).applyQuaternion(rotation).add(position);entry.right.set(1,0,0).applyQuaternion(rotation);
            exhaust.set(0,0,-1).applyQuaternion(rotation);
            velocity.subVectors(nozzleNow,entry.point).divideScalar(Math.max(age,step));
            const travel=drag*(1-Math.exp(-age/drag));
            entry.point.addScaledVector(velocity,inherit*travel).addScaledVector(exhaust,escape*travel);entry.point.y+=.5*lift*age*age;
            // Never fold back toward the root (hard yaw kicks on impact): hold the point until gas moves outward again.
            if(j&&entry.point.distanceToSquared(path[0].point)<path[j-1].point.distanceToSquared(path[0].point))entry.point.copy(path[j-1].point);
            if(j)total+=entry.point.distanceTo(path[j-1].point);entry.along=total;
          }
          if(total>=length||span>=3)break;
          span*=2;
        }
        // Resample by arc length, so the ribbon is exactly `length` long along its curve and UV.y runs evenly.
        const reach=Math.min(length,total);
        for(let j=0,k=1;j<=segments;j++){
          const wanted=reach*j/segments;
          while(k<raw&&path[k].along<wanted)k++;
          const a=path[k-1],b=path[k],blend=b.along>a.along?(wanted-a.along)/(b.along-a.along):0;
          rows[j].point.lerpVectors(a.point,b.point,THREE.MathUtils.clamp(blend,0,1));rows[j].right.copy(a.right);
        }
        const positions=mesh.geometry.attributes.position,uvs=mesh.geometry.attributes.uv;
        for(let i=0;i<positions.count;i++){
          const t=uvs.getY(i),j=Math.round(t*segments),row=rows[j];
          tangent.subVectors(rows[Math.min(segments,j+1)].point,rows[Math.max(0,j-1)].point);
          if(tangent.lengthSq()<1e-12)tangent.set(0,0,-1).applyQuaternion(latest.rotation);
          tangent.normalize();center.copy(row.point);
          // Width axis ⟂ flame tangent and view ray; near head-on it is ill-defined, so blend back to the ship's right.
          toCamera.subVectors(cameraPosition,center);
          const sine=hasCamera?axis.crossVectors(tangent,toCamera).length()/Math.max(1e-6,toCamera.length()):0;
          if(sine>1e-4){axis.divideScalar(sine*toCamera.length());if(axis.dot(row.right)<0)axis.negate();axis.lerp(row.right,1-THREE.MathUtils.smoothstep(sine,.04,.3)).normalize();}
          else axis.copy(row.right);
          center.addScaledVector(axis,(uvs.getX(i)-.5)*2*halfWidth*THREE.MathUtils.lerp(squeeze,1,THREE.MathUtils.smoothstep(t,.05,.35)));
          positions.setXYZ(i,center.x,center.y,center.z);
        }
        positions.needsUpdate=true;
      }
    },
    clear(){history.length=0;for(const {mesh} of strips)mesh.visible=false;},
    dispose(){for(const {mesh} of strips){scene.remove(mesh);mesh.geometry.dispose();}history.length=0;}
  };
}
