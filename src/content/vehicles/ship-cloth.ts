import * as THREE from 'three';

// Deform the actual cloth (including its frayed threads), so PBR, comic ink,
// silhouettes and shadows all see the same flag. The mast edge stays pinned.
export function createShipCloth(mesh,toShip=new THREE.Matrix4()){
  const geometry=mesh.geometry,position=geometry.attributes.position;
  const rest=position.array.slice(),normals=geometry.attributes.normal.array.slice();
  const shipPositions=new Float32Array(rest.length),weights=new Float32Array(position.count);
  const inverse=toShip.clone().invert(),point=new THREE.Vector3();
  for(let i=0;i<position.count;i++){
    point.fromBufferAttribute(position,i).applyMatrix4(toShip);point.toArray(shipPositions,i*3);
    const distance=Math.abs(point.x);weights[i]=THREE.MathUtils.smoothstep(distance,.025,.55);
  }
  position.setUsage(THREE.DynamicDrawUsage);geometry.attributes.normal.setUsage(THREE.DynamicDrawUsage);
  geometry.computeBoundingBox();geometry.boundingBox.expandByScalar(.4);
  geometry.computeBoundingSphere();geometry.boundingSphere.radius+=.4;
  mesh.userData.cloth=true;let lastFrame,lastFlow,lastReduced;
  function update(time=0,speed=0,boost=false,reduced=false){
    const frame=Math.floor(time*24),flow=THREE.MathUtils.clamp(speed/52,0,1)+(boost?.45:0);
    if(frame===lastFrame&&flow===lastFlow&&reduced===lastReduced)return;
    lastFrame=frame;lastFlow=flow;lastReduced=reduced;
    if(reduced){position.array.set(rest);geometry.attributes.normal.array.set(normals);geometry.attributes.normal.needsUpdate=true;}
    else{
      const t=frame/24,amplitude=.075+flow*.12,frequency=3.5+flow*4;
      for(let i=0;i<position.count;i++){
        const k=i*3,x=shipPositions[k],y=shipPositions[k+1],z=shipPositions[k+2],weight=weights[i];
        const phase=t*frequency+z*8+y*5;
        const ripple=Math.sin(phase)+.32*Math.sin(phase*1.9-t*2.1);
        point.set(x+weight*amplitude*ripple,y+weight*.025*Math.sin(phase+1.2),z-weight*(flow*.06+.018*Math.cos(phase)));
        point.applyMatrix4(inverse);position.setXYZ(i,point.x,point.y,point.z);
      }
      geometry.computeVertexNormals();
    }
    position.needsUpdate=true;
  }
  return {update};
}
