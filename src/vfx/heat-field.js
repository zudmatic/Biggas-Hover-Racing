import * as THREE from 'three';
import {screenUV,uniform,float,vec2,sin,mix,smoothstep} from 'three/tsl';

// Depth-aware screen distortion shared by the map composite.
export function createHeatField(renderer,camera,depthAt){
  const clock=uniform(0),strength=uniform(0),turbulence=uniform(2);
  const aspect=uniform(1),pixel=uniform(new THREE.Vector2());
  let nozzles=[[-.68,.62,-2.14,.24],[.68,.62,-2.14,.24]];
  const segments=[0,1,2].map(()=>({a:uniform(new THREE.Vector3()),b:uniform(new THREE.Vector3()),radius:uniform(.04),visible:uniform(0)}));
  const padSegments=[0,1,2].map(()=>({a:uniform(new THREE.Vector3()),b:uniform(new THREE.Vector3()),radius:uniform(.04),visible:uniform(0)}));
  function mask(sample,sources=segments){
  const p=sample.mul(vec2(aspect,1));
  let coverage=float(0);
  for(const segment of sources){
    const a=segment.a.xy.mul(vec2(aspect,1)),b=segment.b.xy.mul(vec2(aspect,1));
    const ab=b.sub(a),local=p.sub(a);
    const along=local.dot(ab).div(ab.dot(ab).max(.00001)).clamp(0,1);
    const distance=local.sub(ab.mul(along)).length();
    const radius=segment.radius.mul(mix(float(.55),float(1.3),along));
    const envelope=float(1).sub(smoothstep(radius.mul(.25),radius,distance))
      .mul(smoothstep(float(0),float(.1),along))
      .mul(float(1).sub(smoothstep(float(.65),float(1),along)));
    // Foreground objects (including the ship) must not shimmer with the background.
    const depth=mix(segment.a.z,segment.b.z,along);
    const unoccluded=smoothstep(depth.add(.04),depth.add(.35),depthAt(sample));
    coverage=coverage.max(envelope.mul(unoccluded).mul(segment.visible));
  }
  return coverage;
  }
  const coverage=mask(screenUV);
  const q=screenUV.mul(vec2(aspect,1)).mul(65);
  const phase=clock.mul(3.5);
  const warp=sin(q.y.mul(.7).sub(phase)).add(sin(q.x.mul(.9).add(phase.mul(.73))));
  const dx=sin(q.y.mul(1.7).sub(phase.mul(2)).add(warp)).add(sin(q.x.mul(2.9).add(phase)).mul(.35));
  const dy=sin(q.x.mul(1.3).add(phase.mul(1.6)).add(warp)).mul(.65);
  const offset=vec2(dx,dy).mul(pixel).mul(strength).mul(coverage).mul(turbulence.mul(.06).add(.6)).mul(3);
  // Check the displaced sample as well: otherwise background pixels pull the
  // ship silhouette into the plume at high strength. Fade across depth edges.
  const destination=screenUV.add(offset).clamp(.001,.999);
  const padOffset=vec2(dx,dy).mul(pixel).mul(mask(screenUV,padSegments)).mul(1.35);
  const padDestination=screenUV.add(padOffset).clamp(.001,.999);
  const sampleUV=screenUV.add(offset.mul(mask(destination))).add(padOffset.mul(mask(padDestination,padSegments).min(1))).clamp(.001,.999);
  const world=new THREE.Vector3(),view=new THREE.Vector3(),size=new THREE.Vector2();
  function project(x,y,z,out,ship){
    world.set(x,y,z).applyMatrix4(ship.matrixWorld);
    view.copy(world).applyMatrix4(camera.matrixWorldInverse);
    world.project(camera);
    out.set(world.x*.5+.5,.5-world.y*.5,-view.z);
  }
  return {
    setNozzles(value){nozzles=value;},
    update(ship,time,power,intensity,length,noise,width=1){
      camera.updateMatrixWorld();clock.value=time;strength.value=intensity*power;turbulence.value=noise;
      renderer.getDrawingBufferSize(size);pixel.value.set(1/size.x,1/size.y);aspect.value=size.x/size.y;
      segments.forEach((segment,i)=>{
        if(!nozzles[i]){segment.visible.value=0;return;}
        const [x,y,z,radius]=nozzles[i];
        project(x,y,z,segment.a.value,ship);
        project(x,y+.28,z-Math.max(.1,length*power*1.5),segment.b.value,ship);
        segment.visible.value=segment.a.value.z>camera.near&&segment.b.value.z>camera.near?1:0;
        segment.radius.value=.65*width*(radius/.24)/(Math.max(1,segment.a.value.z)*Math.tan(THREE.MathUtils.degToRad(camera.fov*.5))*2);
      });
    },
    updatePadFields(fields){
      // Bounded work: only nearby active plates, with foreground depth protection.
      const nearby=fields.filter(p=>p.intensity>.001&&Math.hypot(p.x-camera.position.x,p.z-camera.position.z)<80)
        .sort((a,b)=>Math.hypot(a.x-camera.position.x,a.z-camera.position.z)-Math.hypot(b.x-camera.position.x,b.z-camera.position.z)).slice(0,3);
      const projectWorld=(x,y,z,out)=>{world.set(x,y,z);view.copy(world).applyMatrix4(camera.matrixWorldInverse);world.project(camera);out.set(world.x*.5+.5,.5-world.y*.5,-view.z);};
      padSegments.forEach((s,i)=>{
        const p=nearby[i];if(!p){s.visible.value=0;return;}
        projectWorld(p.x-p.nx*3,p.y+.16+p.height*.35,p.z-p.nz*3,s.a.value);
        projectWorld(p.x+p.nx*3,p.y+.16+p.height*.35,p.z+p.nz*3,s.b.value);
        s.visible.value=s.a.value.z>camera.near&&s.b.value.z>camera.near?p.intensity:0;
        s.radius.value=(1.5+p.height*.25)/(Math.max(1,Math.min(s.a.value.z,s.b.value.z))*Math.tan(THREE.MathUtils.degToRad(camera.fov*.5))*2);
      });
    },
    uv:sampleUV,
  };
}
