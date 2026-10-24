import * as THREE from 'three/webgpu';

// Retain the emitter pose: old flame sections must not rotate with the ship.
export function createFlameTrail(scene,material,nozzles=[[-.68,.62,-2.14,.24],[.68,.62,-2.14,.24]]){
  const history=[],strips=[],segments=48;
  const position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();
  let motionSpeed=0;
  const anchor=new THREE.Vector3(),offset=new THREE.Vector3();
  const center=new THREE.Vector3(),axis=new THREE.Vector3(),forward=new THREE.Vector3();
  for(const nozzle of nozzles)for(const vertical of [false,true]){
    const geometry=new THREE.PlaneGeometry(1,1,1,segments);
    geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;scene.add(mesh);
    strips.push({mesh,nozzle,vertical});
  }
  return {
    record(time,ship){
      ship.updateMatrixWorld(true);
      ship.matrixWorld.decompose(position,rotation,scale);
      const last=history.at(-1);
      if(last&&time===last.time)return;
      const dt=last?time-last.time:0;
      if(last&&(dt<0||position.distanceTo(last.position)>15)){history.length=0;motionSpeed=0;}
      else motionSpeed=dt>0?position.distanceTo(last.position)/dt:0;
      const sample=history.length>=240?history.shift():{position:new THREE.Vector3(),rotation:new THREE.Quaternion(),scale:new THREE.Vector3()};
      sample.time=time;sample.position.copy(position);sample.rotation.copy(rotation);sample.scale.copy(scale);history.push(sample);
    },
    update(time,settings,power,speed,lift){
      if(!history.length)return;
      const latest=history.at(-1),modelScale=Math.max(latest.scale.x,latest.scale.y,latest.scale.z);
      const length=settings.Longitud*power*modelScale*(1+settings.Pulsación*Math.sin(time*31));
      const travelTime=Math.min(3,length/Math.max(.1,speed+motionSpeed));
      for(const {mesh,nozzle,vertical} of strips){
        mesh.visible=settings.Activa&&power>.005;
        if(!mesh.visible)continue;
        anchor.set(nozzle[0],nozzle[1],nozzle[2]).multiply(latest.scale).applyQuaternion(latest.rotation).add(latest.position);
        const positions=mesh.geometry.attributes.position,uvs=mesh.geometry.attributes.uv;
        for(let i=0;i<positions.count;i++){
          const t=uvs.getY(i),age=t*travelTime,wanted=time-age;
          let lo=0,hi=history.length-1;
          while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(history[mid].time<=wanted)lo=mid;else hi=mid-1;}
          const a=history[lo],b=history[Math.min(lo+1,history.length-1)];
          const blend=b.time>a.time?THREE.MathUtils.clamp((wanted-a.time)/(b.time-a.time),0,1):0;
          position.lerpVectors(a.position,b.position,blend);rotation.slerpQuaternions(a.rotation,b.rotation,blend);scale.lerpVectors(a.scale,b.scale,blend);
          center.set(nozzle[0],nozzle[1],nozzle[2]).multiply(scale).applyQuaternion(rotation).add(position);
          forward.set(0,0,-1).applyQuaternion(rotation);
          center.addScaledVector(forward,speed*age);center.y+=.5*lift*age*age;
          offset.subVectors(center,anchor).clampLength(0,length);center.copy(anchor).add(offset);
          axis.set(vertical?0:1,vertical?1:0,0).applyQuaternion(rotation);
          center.addScaledVector(axis,(uvs.getX(i)-.5)*settings.Ancho*modelScale*(nozzle[3]/.24));
          positions.setXYZ(i,center.x,center.y,center.z);
        }
        positions.needsUpdate=true;
      }
    },
    clear(){history.length=0;motionSpeed=0;for(const {mesh} of strips)mesh.visible=false;},
    dispose(){for(const {mesh} of strips){scene.remove(mesh);mesh.geometry.dispose();}history.length=0;}
  };
}
