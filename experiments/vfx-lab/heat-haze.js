import {createDither} from './dither.js';
import {comicFinish} from './toon-look.js';
import * as THREE from 'three/webgpu';
import {pass,screenUV,uniform,float,vec2,sin,mix,smoothstep} from 'three/tsl';

// Refract the rendered scene only within the projected exhaust plumes.
export function createHeatHaze(renderer,scene,camera){
  const scenePass=pass(scene,camera);
  const source=scenePass.getTextureNode();
  const viewZ=scenePass.getViewZNode();
  const post=new THREE.PostProcessing(renderer);
  const toon=uniform(1),dither=createDither();
  const clock=uniform(0),strength=uniform(0),turbulence=uniform(2);
  const aspect=uniform(1),pixel=uniform(new THREE.Vector2());
  let nozzles=[[-.68,.62,-2.14,.24],[.68,.62,-2.14,.24]];
  const segments=Array.from({length:6},()=>({a:uniform(new THREE.Vector3()),b:uniform(new THREE.Vector3()),radius:uniform(.04),visible:uniform(0),gain:uniform(0)}));
  let fieldStrength=0;
  const p=screenUV.mul(vec2(aspect,1));
  let coverage=float(0);
  for(const [index,segment] of segments.entries()){
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
    const unoccluded=viewZ.negate().greaterThan(depth.sub(.08));
    const gain=index<3?segment.gain:segment.gain.mul(.45).div(turbulence.mul(.3).add(.6));
    coverage=coverage.max(envelope.mul(unoccluded).mul(segment.visible).mul(gain));
  }
  const q=screenUV.mul(vec2(aspect,1)).mul(65);
  const phase=clock.mul(3.5);
  const warp=sin(q.y.mul(.7).sub(phase)).add(sin(q.x.mul(.9).add(phase.mul(.73))));
  const dx=sin(q.y.mul(1.7).sub(phase.mul(2)).add(warp)).add(sin(q.x.mul(2.9).add(phase)).mul(.35));
  const dy=sin(q.x.mul(1.3).add(phase.mul(1.6)).add(warp)).mul(.65);
  const offset=vec2(dx,dy).mul(pixel).mul(coverage).mul(turbulence.mul(.3).add(.6)).mul(5);
  const sampleUV=screenUV.add(offset).clamp(.001,.999);
  const original=source.sample(sampleUV);
  post.outputNode=dither.scene(mix(original,comicFinish(original,source,scenePass.getTextureNode('depth'),sampleUV,pixel),toon));
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
      segments.slice(0,3).forEach((segment,i)=>{
        segment.gain.value=intensity*power;
        if(!nozzles[i]){segment.visible.value=0;return;}
        const [x,y,z,radius]=nozzles[i];
        project(x,y,z,segment.a.value,ship);
        project(x,y+.28,z-Math.max(.1,length*power*1.5),segment.b.value,ship);
        segment.visible.value=segment.a.value.z>camera.near&&segment.b.value.z>camera.near?1:0;
        segment.radius.value=.65*width*(radius/.24)/(Math.max(1,segment.a.value.z)*Math.tan(THREE.MathUtils.degToRad(camera.fov*.5))*2);
      });
    },
    updatePadField(fields){
      const pad=fields.find(p=>p.intensity>0);fieldStrength=pad?.intensity??0;
      const projectWorld=(x,y,z,out)=>{
        world.set(x,y,z);view.copy(world).applyMatrix4(camera.matrixWorldInverse);world.project(camera);
        out.set(world.x*.5+.5,.5-world.y*.5,-view.z);
      };
      segments.slice(3).forEach((segment,i)=>{
        if(!pad){segment.visible.value=0;segment.gain.value=0;return;}
        const across=(i-1)*1.1,x=pad.x+pad.nz*across,z=pad.z-pad.nx*across;
        projectWorld(x-pad.nx*3,pad.y+.3+pad.height*.45,z-pad.nz*3,segment.a.value);
        projectWorld(x+pad.nx*3,pad.y+.3+pad.height*.45,z+pad.nz*3,segment.b.value);
        segment.gain.value=pad.intensity;
        segment.visible.value=segment.a.value.z>camera.near&&segment.b.value.z>camera.near?1:0;
        segment.radius.value=Math.max(.25,pad.height*.65)/(Math.max(1,segment.a.value.z)*Math.tan(THREE.MathUtils.degToRad(camera.fov*.5))*2);
      });
    },
    configureDither(values){dither.configure(values,'Escena');},
    setToon(enabled){toon.value=enabled?1:0;},
    async render(){if(strength.value>.001||fieldStrength>.001||toon.value>0||dither.active)await post.renderAsync();else await renderer.renderAsync(scene,camera);},
    dispose(){post.dispose();scenePass.dispose();}
  };
}
