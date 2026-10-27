import * as THREE from 'three/webgpu';

// Each nozzle gets one ribbon that turns around the flame axis to face the camera, so it never goes edge-on
// (crossed fixed sheets collapse into hard-edged wedges when seen from behind, as in the racing camera).
// The flame is rigid along the nozzle axis; only its tail lags the hull's rotation, by the angle the axis
// turned over the last `Retraso` seconds, capped at `CurvaMáx` degrees and smoothed. It can bend, but it can
// never whip sideways, fold back or cross a neighbour, whatever the speed, impact or frame rate.
export function createFlameTrail(scene,material,nozzles=[[-.68,.62,-2.14,.24],[.68,.62,-2.14,.24]]){
  const history=[],strips=[],segments=48,window=.1;
  const position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();
  const axis=new THREE.Vector3(),flameAxis=new THREE.Vector3(),pastAxis=new THREE.Vector3(),bendTarget=new THREE.Vector3(),bend=new THREE.Vector3(),bendWorld=new THREE.Vector3();
  const inverse=new THREE.Quaternion(),root=new THREE.Vector3(),direction=new THREE.Vector3(),center=new THREE.Vector3(),tangent=new THREE.Vector3(),right=new THREE.Vector3();
  const cameraPosition=new THREE.Vector3(),toCamera=new THREE.Vector3();
  const rows=Array.from({length:segments+1},()=>new THREE.Vector3());
  let hasCamera=false,lastUpdate=null;
  for(const nozzle of nozzles){
    const geometry=new THREE.PlaneGeometry(1,1,1,segments);
    geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;scene.add(mesh);
    // Camera pose lags one frame, which is invisible on a ribbon this soft.
    mesh.onBeforeRender=(_renderer,_scene,camera)=>{camera.getWorldPosition(cameraPosition);hasCamera=true;};
    strips.push({mesh,nozzle,index:strips.length});
  }
  // Interpolated ship rotation at `when`, clamped to the recorded history.
  function rotationAt(when,out){
    let lo=0,hi=history.length-1;
    while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(history[mid].time<=when)lo=mid;else hi=mid-1;}
    const a=history[lo],b=history[Math.min(lo+1,history.length-1)];
    const blend=b.time>a.time?THREE.MathUtils.clamp((when-a.time)/(b.time-a.time),0,1):0;
    return out.slerpQuaternions(a.rotation,b.rotation,blend);
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
    update(time,settings,power,_speed,_lift){
      if(!history.length)return;
      const latest=history.at(-1),modelScale=Math.max(latest.scale.x,latest.scale.y,latest.scale.z);
      const pulse=1+settings.Pulsación*Math.sin(time*31),idleWidth=THREE.MathUtils.lerp(.6,1,THREE.MathUtils.smoothstep(power,.13,.45));
      // Tail lag in ship space: where the nozzle axis pointed `window` s ago, scaled to the lag time and capped.
      const lag=Math.max(0,settings.Retraso??.12),maxBend=THREE.MathUtils.degToRad(settings['CurvaMáx']??14);
      inverse.copy(latest.rotation).invert();
      pastAxis.set(0,0,-1).applyQuaternion(rotationAt(time-window,rotation)).applyQuaternion(inverse);
      bendTarget.set(pastAxis.x,pastAxis.y,0);
      const turned=Math.atan2(bendTarget.length(),-pastAxis.z);
      if(turned>1e-6)bendTarget.setLength(Math.min(maxBend,turned*lag/window));else bendTarget.set(0,0,0);
      const dt=lastUpdate===null||time<lastUpdate?Infinity:time-lastUpdate;lastUpdate=time;
      if(dt===Infinity)bend.copy(bendTarget);else bend.lerp(bendTarget,1-Math.exp(-dt/.08));
      bendWorld.copy(bend).applyQuaternion(latest.rotation);axis.set(0,0,-1).applyQuaternion(latest.rotation);
      right.set(1,0,0).applyQuaternion(latest.rotation);
      for(const {mesh,nozzle,index} of strips){
        mesh.visible=settings.Activa&&power>.005;
        if(!mesh.visible)continue;
        // Root on the measured exit plane; a pilot length keeps the idle flame attached to the mouth.
        const mouth=settings.Bocas?.[index],start=(mouth?.start??0)+(settings.Separación??0),mouthRadius=mouth?.radius??Infinity;
        // The pilot floor fades with power below idle (.13), so a cut-off flame shrinks instead of popping.
        const length=Math.max(settings.Longitud*power,(settings.Mínima??0)*nozzle[3]/.24*Math.min(1,power/.13))*modelScale*pulse;
        // The visible flame (~68% of the ribbon) is capped to the mouth for the first 5%, then opens up.
        const halfWidth=.5*settings.Ancho*modelScale*(nozzle[3]/.24)*idleWidth,squeeze=Math.min(1,.9*mouthRadius*modelScale/(.68*halfWidth));
        root.set(nozzle[0],nozzle[1],nozzle[2]-start).multiply(latest.scale).applyQuaternion(latest.rotation).add(latest.position);
        // March along the curve: the heading turns linearly from the axis to the full bend at the tip.
        rows[0].copy(root);const step=length/segments,bendAngle=bendWorld.length();
        for(let j=1;j<=segments;j++){
          const heading=bendAngle*(j-.5)/segments;
          direction.copy(axis).multiplyScalar(Math.cos(heading));if(bendAngle>0)direction.addScaledVector(bendWorld,Math.sin(heading)/bendAngle);
          rows[j].copy(rows[j-1]).addScaledVector(direction,step);
        }
        const positions=mesh.geometry.attributes.position,uvs=mesh.geometry.attributes.uv;
        for(let i=0;i<positions.count;i++){
          const t=uvs.getY(i),j=Math.round(t*segments);
          tangent.subVectors(rows[Math.min(segments,j+1)],rows[Math.max(0,j-1)]).normalize();center.copy(rows[j]);
          // Width axis ⟂ flame tangent and view ray; near head-on it is ill-defined, so blend back to the ship's right.
          toCamera.subVectors(cameraPosition,center);
          const sine=hasCamera?flameAxis.crossVectors(tangent,toCamera).length()/Math.max(1e-6,toCamera.length()):0;
          if(sine>1e-4){flameAxis.divideScalar(sine*toCamera.length());if(flameAxis.dot(right)<0)flameAxis.negate();flameAxis.lerp(right,1-THREE.MathUtils.smoothstep(sine,.04,.3)).normalize();}
          else flameAxis.copy(right);
          center.addScaledVector(flameAxis,(uvs.getX(i)-.5)*2*halfWidth*THREE.MathUtils.lerp(squeeze,1,THREE.MathUtils.smoothstep(t,.05,.35)));
          positions.setXYZ(i,center.x,center.y,center.z);
        }
        positions.needsUpdate=true;
      }
    },
    clear(){history.length=0;lastUpdate=null;bend.set(0,0,0);for(const {mesh} of strips)mesh.visible=false;},
    dispose(){for(const {mesh} of strips){scene.remove(mesh);mesh.geometry.dispose();}history.length=0;}
  };
}
