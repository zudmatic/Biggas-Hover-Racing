import * as THREE from 'three/webgpu';

// Retain the emitter pose: old flame sections must not rotate with the ship.
// Each nozzle gets one ribbon that turns around the flame axis to face the camera, so it never goes edge-on
// (crossed fixed sheets collapse into hard-edged wedges when seen from behind, as in the racing camera).
export function createFlameTrail(scene,material,nozzles=[[-.68,.62,-2.14,.24],[.68,.62,-2.14,.24]]){
  const history=[],strips=[],segments=48;
  const position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();
  let motionSpeed=0;
  const anchor=new THREE.Vector3(),offset=new THREE.Vector3();
  const center=new THREE.Vector3(),axis=new THREE.Vector3(),forward=new THREE.Vector3();
  const cameraPosition=new THREE.Vector3(),toCamera=new THREE.Vector3(),shipRight=new THREE.Vector3();
  let hasCamera=false;
  for(const nozzle of nozzles){
    const geometry=new THREE.PlaneGeometry(1,1,1,segments);
    geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;scene.add(mesh);
    // Camera pose lags one frame, which is invisible on a ribbon this soft.
    mesh.onBeforeRender=(_renderer,_scene,camera)=>{camera.getWorldPosition(cameraPosition);hasCamera=true;};
    strips.push({mesh,nozzle,index:strips.length});
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
      const pulse=1+settings.Pulsación*Math.sin(time*31),idleWidth=THREE.MathUtils.lerp(.6,1,THREE.MathUtils.smoothstep(power,.13,.45));
      for(const {mesh,nozzle,index} of strips){
        mesh.visible=settings.Activa&&power>.005;
        if(!mesh.visible)continue;
        // Root on the measured exit plane; a pilot length keeps the idle flame attached to the mouth.
        const mouth=settings.Bocas?.[index],start=(mouth?.start??0)+(settings.Separación??0),mouthRadius=mouth?.radius??Infinity;
        // The pilot floor fades with power below idle (.13), so a cut-off flame shrinks instead of popping.
        const length=Math.max(settings.Longitud*power,(settings.Mínima??0)*nozzle[3]/.24*Math.min(1,power/.13))*modelScale*pulse;
        const travelTime=Math.min(3,length/Math.max(.1,speed+motionSpeed));
        // The visible flame (~68% of the ribbon) is capped to the mouth for the first 5%, then opens up.
        const halfWidth=.5*settings.Ancho*modelScale*(nozzle[3]/.24)*idleWidth,squeeze=Math.min(1,.9*mouthRadius*modelScale/(.68*halfWidth));
        anchor.set(nozzle[0],nozzle[1],nozzle[2]-start).multiply(latest.scale).applyQuaternion(latest.rotation).add(latest.position);
        const positions=mesh.geometry.attributes.position,uvs=mesh.geometry.attributes.uv;
        for(let i=0;i<positions.count;i++){
          const t=uvs.getY(i),age=t*travelTime,wanted=time-age;
          let lo=0,hi=history.length-1;
          while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(history[mid].time<=wanted)lo=mid;else hi=mid-1;}
          const a=history[lo],b=history[Math.min(lo+1,history.length-1)];
          const blend=b.time>a.time?THREE.MathUtils.clamp((wanted-a.time)/(b.time-a.time),0,1):0;
          position.lerpVectors(a.position,b.position,blend);rotation.slerpQuaternions(a.rotation,b.rotation,blend);scale.lerpVectors(a.scale,b.scale,blend);
          center.set(nozzle[0],nozzle[1],nozzle[2]-start).multiply(scale).applyQuaternion(rotation).add(position);
          forward.set(0,0,-1).applyQuaternion(rotation);
          center.addScaledVector(forward,speed*age);center.y+=.5*lift*age*age;
          offset.subVectors(center,anchor).clampLength(0,length);center.copy(anchor).add(offset);
          shipRight.set(1,0,0).applyQuaternion(rotation);
          // Width axis ⟂ flame axis and view ray; near head-on it is ill-defined, so blend back to the ship's right.
          toCamera.subVectors(cameraPosition,center);
          const sine=hasCamera?axis.crossVectors(forward,toCamera).length()/Math.max(1e-6,toCamera.length()):0;
          if(sine>1e-4){axis.divideScalar(sine*toCamera.length());if(axis.dot(shipRight)<0)axis.negate();axis.lerp(shipRight,1-THREE.MathUtils.smoothstep(sine,.04,.3)).normalize();}
          else axis.copy(shipRight);
          center.addScaledVector(axis,(uvs.getX(i)-.5)*2*halfWidth*THREE.MathUtils.lerp(squeeze,1,THREE.MathUtils.smoothstep(t,.05,.35)));
          positions.setXYZ(i,center.x,center.y,center.z);
        }
        positions.needsUpdate=true;
      }
    },
    clear(){history.length=0;motionSpeed=0;for(const {mesh} of strips)mesh.visible=false;},
    dispose(){for(const {mesh} of strips){scene.remove(mesh);mesh.geometry.dispose();}history.length=0;}
  };
}
