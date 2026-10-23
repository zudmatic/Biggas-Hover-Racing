import * as THREE from 'three';
import {createBounceUniforms,bindRetroLighting,BOUNCE_COUNT} from './retro-material.js';
import {retroStyle} from './retro-style.js';
import {createOcclusionQuery} from './occlusion-query.js';

// Luminance a white diffuse surface gets from the key (at a typical 0.75 cosine)
// and the hemisphere (sky/ground average): the paper white the print's
// lightness is measured against. The same formula at full daylight is the
// reference the night can keep (retroStyle nightKeep).
const luminance=color=>color.r*.2126+color.g*.7152+color.b*.0722;
const whiteLevel=(keyColor,keyIntensity,sky,ground,hemisphereIntensity)=>
  (luminance(keyColor)*keyIntensity*.75+.5*(luminance(sky)+luminance(ground))*hemisphereIntensity)/Math.PI;
const WHITE_DAY=whiteLevel(new THREE.Color(0xffe3b0),5.8,new THREE.Color(0x939de0),new THREE.Color(0x765374),1.5);

// Small virtual area patches approximate one diffuse bounce. Each patch samples
// the CURRENT sun visibility, light energy and surface dye, then sends that color
// back into Lambert shading with distance and both surface normals. This is not
// path tracing/multi-bounce GI. Keeping it sparse makes it usable on mobile WebGL.
export function createRetroLighting(scene,{renderer=null}={}) {
  const hemisphere=new THREE.HemisphereLight(0x7c80ed,0x765374,1.25);
  const key=new THREE.DirectionalLight(0xffcf85,4.4);key.position.set(4,7,5);
  const rim=new THREE.DirectionalLight(0x9d8bea,1.5);rim.position.set(-4,3,-3);
  key.castShadow=true;key.shadow.mapSize.set(1024,1024);
  Object.assign(key.shadow.camera,{left:-5,right:5,top:6,bottom:-5,near:.1,far:25});
  key.shadow.normalBias=.025;key.shadow.bias=-.00015;key.shadow.radius=4;key.shadow.blurSamples=6;
  scene.add(hemisphere,key,rim);
  if(renderer){renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;}
  const uniforms=createBounceUniforms();
  const targetRadiance=Array.from({length:BOUNCE_COUNT},()=>new THREE.Color(0,0,0));
  let sources=[],occluders=[],localLights=[],lastBounce=-Infinity,cursor=0,budget=0,mode='',revision=0,lastDaylight=1,lastHour=null;
  const direction=new THREE.Vector3(),point=new THREE.Vector3(),normal=new THREE.Vector3(),toward=new THREE.Vector3(),lightPos=new THREE.Vector3();
  const occlusion=createOcclusionQuery(),incident=new THREE.Color(),energy=new THREE.Color();
  const tangent=new THREE.Vector3(),bitangent=new THREE.Vector3(),samplePoint=new THREE.Vector3(),sampleDirection=new THREE.Vector3();
  const visible=object=>{for(let node=object;node;node=node.parent)if(!node.visible)return false;return true;};
  function aimSun() {
    direction.copy(key.position).sub(key.target.getWorldPosition(lightPos)).normalize();
    uniforms.retroSun.value.copy(key.color).multiplyScalar(key.intensity);
  }
  function placePatch(i) {
    const source=sources[i],patch=uniforms.retroPatches.value[i];
    if(!source||!visible(source.object)){patch.w=0;targetRadiance[i].setRGB(0,0,0);return false;}
    point.copy(source.position);source.object.localToWorld(point);
    normal.copy(source.normal).transformDirection(source.object.matrixWorld);
    point.addScaledVector(normal,.035);
    patch.set(point.x,point.y,point.z,source.area);uniforms.retroNormals.value[i].copy(normal);
    if(source.omni)uniforms.retroNormals.value[i].set(0,0,0);
    return true;
  }
  function patchVisibility(source,light=null) {
    // A large floor/wall patch represents an area, not an on/off point light.
    // Sample a fixed 3×3 grid on its plane so a passing character can only
    // occlude part of its reflected energy. Fixed samples never add shimmer.
    const spread=source.area>1?Math.sqrt(source.area)/3:0;
    tangent.set(0,0,1);if(Math.abs(normal.z)>.9)tangent.set(1,0,0);
    tangent.cross(normal).normalize();bitangent.crossVectors(normal,tangent);
    let visibleSamples=0;
    const extent=spread?1:0;
    for(let u=-extent;u<=extent;u++)for(let v=-extent;v<=extent;v++){
      samplePoint.copy(point).addScaledVector(tangent,u*spread).addScaledVector(bitangent,v*spread);
      let distance=20;sampleDirection.copy(direction);
      if(light){sampleDirection.subVectors(light,samplePoint);distance=sampleDirection.length()-.04;sampleDirection.normalize();}
      if(occlusion.unblocked(samplePoint,sampleDirection,distance))visibleSamples++;
    }
    return visibleSamples/(spread?9:1);
  }
  function samplePatch(i) {
    if(!placePatch(i))return;
    const source=sources[i],radiance=targetRadiance[i];
    const cosine=Math.max(0,normal.dot(direction));
    const sun=cosine?cosine*patchVisibility(source):0;
    incident.copy(key.color).multiplyScalar(key.intensity*sun);
    incident.add(energy.copy(hemisphere.color).multiplyScalar(hemisphere.intensity*.18));
    for(const light of localLights){
      if(!visible(light)||light.intensity<=0)continue;
      light.getWorldPosition(lightPos);toward.copy(lightPos).sub(point);
      const distance=toward.length();toward.normalize();
      const cosine=Math.max(0,normal.dot(toward));
      if(cosine)incident.add(energy.copy(light.color).multiplyScalar(light.intensity*cosine*patchVisibility(source,lightPos)/Math.max(.15,distance*distance)));
    }
    const material=typeof source.material==='function'?source.material():source.material;
    radiance.copy(material?.color??source.color??energy.setRGB(.2,.12,.18)).multiply(incident).multiplyScalar(.8);
    if(material?.emissive)radiance.add(energy.copy(material.emissive).multiplyScalar(material.emissiveIntensity));
  }
  function sampleBounce() {
    scene.updateMatrixWorld(true);occlusion.sync(occluders);aimSun();
    for(let i=0;i<BOUNCE_COUNT;i++)samplePatch(i);
    for(let i=0;i<BOUNCE_COUNT;i++)uniforms.retroRadiance.value[i].copy(targetRadiance[i]);
    cursor=0;budget=0;revision++;
  }
  // Between full samples, refresh the patches one at a time at the same overall
  // rate (each about 8 times a second), so their raycasts never pile into one frame.
  function refreshPatches(dt) {
    budget=Math.min(BOUNCE_COUNT,budget+dt*BOUNCE_COUNT*8);
    if(budget>=1){
      // Raycasts need this frame's actor, chair and foliage transforms.
      scene.updateMatrixWorld(true);occlusion.sync(occluders);aimSun();
      for(;budget>=1;budget--){samplePatch(cursor);cursor=(cursor+1)%BOUNCE_COUNT;if(!cursor)revision++;}
    }
    const blend=1-Math.exp(-dt/.18);
    for(let i=0;i<BOUNCE_COUNT;i++){
      // Follow moving sources every frame; filter their sampled energy only.
      placePatch(i);
      uniforms.retroRadiance.value[i].lerp(targetRadiance[i],blend);
    }
  }
  return {
    key,hemisphere,rim,uniforms,occlusionStats:occlusion.stats,
    get revision(){return revision;},
    bind(root){bindRetroLighting(root,uniforms);},
    setEnvironment({patches=[],blockers=[],lights=[]}={}){sources=patches;occluders=blockers;localLights=lights;lastBounce=-Infinity;},
    update(time,{room=false,reducedMotion=false,force=false,daylight=1,cycle=null,cloudTime=time}={}){
      const day=room?THREE.MathUtils.clamp(daylight,0,1):1;
      const next=room?'room':'studio',changed=next!==mode||Math.abs(day-lastDaylight)>.005||(room&&cycle&&cycle.hour!==lastHour);mode=next;lastHour=cycle?.hour??null;
      if(changed)lastDaylight=day;
      const drift=reducedMotion?0:Math.sin(time*.045)*.55;
      key.position.set(room?3.4+drift:4+drift,room?6.6:7,room?-7.4:5);
      key.intensity=room?5.8*(.04+.96*day):4.8;key.color.setHex(0xffcf85);
      hemisphere.intensity=room?.42+1.08*day:1.75;
      hemisphere.color.setHex(0x7c80ed);hemisphere.groundColor.setHex(0x765374);
      rim.color.setHex(room?0xffb685:0x9d8bea);rim.intensity=room?.18+.67*day:2.0;
      if(room&&cycle){
        const arc=(cycle.hour-6)/12*Math.PI;
        key.position.set(Math.cos(arc)*5,2.4+Math.max(0,Math.sin(arc))*5,-7.4);
        key.color.setHex(0x94b5fa).lerp(new THREE.Color(0xffe3b0),cycle.daylight).lerp(new THREE.Color(0xff9966),cycle.twilight*.7);
        hemisphere.color.setHex(0x566db1).lerp(new THREE.Color(0x939de0),cycle.daylight);
        hemisphere.groundColor.setHex(0x343049).lerp(new THREE.Color(0x765374),cycle.daylight);
        rim.color.setHex(0x839be1).lerp(new THREE.Color(0xffb685),cycle.daylight);
      }
      rim.position.set(room?6:-4,room?5:3,room?7:-3);
      uniforms.retroCloudTime.value=cloudTime;
      uniforms.retroCloudStrength.value=room?.25*(cycle?.daylight??day):0;
      uniforms.retroFloor.value=room?.09:-100;
      uniforms.retroWhite.value=THREE.MathUtils.lerp(
        whiteLevel(key.color,key.intensity,hemisphere.color,hemisphere.groundColor,hemisphere.intensity),WHITE_DAY,retroStyle.params.nightKeep);
      // Sample transport at 8 Hz and ease its energy between samples.
      if(force||changed||!Number.isFinite(lastBounce))sampleBounce();
      else refreshPatches(Math.max(0,time-lastBounce));
      lastBounce=time;
      // Casters animate every frame, including with a stationary sun. A cached
      // depth map tests the current surface against its old pose, producing
      // crawling self-shadows. Refresh with each visible scene render; keep
      // autoUpdate off so the print pass does not request a second shadow pass.
      if(renderer?.shadowMap.enabled)renderer.shadowMap.needsUpdate=true;
    },
    sampleBounce,
    dispose(){for(const light of [key,hemisphere,rim]){light.removeFromParent();light.dispose();}},
  };
}
