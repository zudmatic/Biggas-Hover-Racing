import {Vector2,MeshStandardMaterial,MeshPhysicalMaterial,ACESFilmicToneMapping,SRGBColorSpace,NoToneMapping,ColorManagement} from 'three';
import {MeshStandardNodeMaterial,MeshPhysicalNodeMaterial,PostProcessing} from 'three/webgpu';
import {uniform,vec3,vec4,mix,smoothstep,pass,toneMapping,workingToColorSpace} from 'three/tsl';
import {createHeatField} from './vfx/heat-field.js';

// Adapted from Desert Valley's desert-look/post on origin/main (82cf702).
// Native PBR with the same 368px grid, blended gently for the city's fine
// facade geometry. The HUD stays at native resolution.
function snapProjection(material,clip){
  const projected=clip.toVar(),grid=material.cityGrid;
  const snapped=projected.xy.div(projected.w).mul(grid).round().div(grid).mul(projected.w);
  return vec4(mix(projected.xy,snapped,material.cityJitter),projected.zw);
}
class CityJitterMaterial extends MeshStandardNodeMaterial{
  setupModelViewProjection(builder){return snapProjection(this,super.setupModelViewProjection(builder));}
}
class CityJitterPhysicalMaterial extends MeshPhysicalNodeMaterial{
  setupModelViewProjection(builder){return snapProjection(this,super.setupModelViewProjection(builder));}
}
export function createBiggasCityLook(scene,renderer){
  const warmth=uniform(.18),jitter=uniform(0),grid=uniform(new Vector2(184,103.5)),size=new Vector2(),bindings=[],cache=new Map();let active=false;
  scene.traverse(mesh=>{if(mesh.isMesh)bindings.push({mesh,source:mesh.material});});
  function convert(source){
    // Preserve the continuous animated river/veil and custom engine shaders.
    if(source.isNodeMaterial||!source.isMeshStandardMaterial||source.userData.cityStableProjection||/water|foam/.test(source.userData.circuitSurface??''))return source;
    if(cache.has(source))return cache.get(source);
    const physical=source.isMeshPhysicalMaterial,m=physical?new CityJitterPhysicalMaterial():new CityJitterMaterial();
    (physical?MeshPhysicalMaterial:MeshStandardMaterial).prototype.copy.call(m,source);
    m.name=`PSX · ${source.name}`;m.cityGrid=grid;m.cityJitter=jitter;
    // Keep the city's bounded light groups, including moving vehicle lights.
    m.lightsNode=source.lightsNode??null;m.color=source.color;m.emissive=source.emissive;
    cache.set(source,m);return m;
  }
  return {warmth,jitter,grid,
    update({enabled=true,reducedMotion=false}={}){
      const next=enabled;warmth.value=enabled?.18:0;jitter.value=enabled&&!reducedMotion?.22:0;
      renderer.getDrawingBufferSize(size);grid.value.set(184,184*size.y/Math.max(1,size.x));
      if(next!==active){for(const b of bindings)b.mesh.material=next?(Array.isArray(b.source)?b.source.map(convert):convert(b.source)):b.source;active=next;}
      for(const [source,material] of cache)material.emissiveIntensity=source.emissiveIntensity;
    },
    dispose(){for(const b of bindings)b.mesh.material=b.source;for(const material of cache.values())material.dispose();},
  };
}

// Desert Valley's natural color treatment, one scene sample, retaining boost
// heat distortion. The comic pipeline remains a separate opt-in view.
export function createBiggasCityPost(renderer,scene,camera,{samples=4,warmth=uniform(.18)}={}){
  const scenePass=pass(scene,camera,{samples}),source=scenePass.getTextureNode(),depth=scenePass.getTextureNode('depth');
  const post=new PostProcessing(renderer);post.outputColorTransform=false;
  const exposure=uniform(renderer.toneMappingExposure),near=uniform(camera.near),far=uniform(camera.far);
  const heat=createHeatField(renderer,camera,q=>near.mul(far).div(far.sub(depth.sample(q).r.mul(far.sub(near)))));
  const mapped=workingToColorSpace(vec4(toneMapping(ACESFilmicToneMapping,exposure,source.sample(heat.uv).rgb).rgb,1),SRGBColorSpace).rgb.toVar();
  const luma=mapped.dot(vec3(.2126,.7152,.0722)),grade=mix(vec3(luma),mapped,1.12).sub(.5).mul(1.045).add(.5);
  const balance=mix(vec3(.97,1.006,1.025),vec3(1.025,1.008,.975),smoothstep(.15,.85,luma));
  post.outputNode=vec4(grade.mul(balance).mul(mix(vec3(1),vec3(1.035,1.016,.925),warmth)).clamp(),1);
  return {heat,
    async compile(){
      const tone=renderer.toneMapping,colorSpace=renderer.outputColorSpace,target=renderer.getRenderTarget(),mrt=renderer.getMRT();
      scenePass.renderTarget.samples=samples;scenePass.renderTarget.texture.type=renderer.getOutputBufferType();
      renderer.toneMapping=NoToneMapping;renderer.outputColorSpace=ColorManagement.workingColorSpace;
      try{await scenePass.compileAsync(renderer);}finally{renderer.setRenderTarget(target);renderer.setMRT(mrt);renderer.toneMapping=tone;renderer.outputColorSpace=colorSpace;}
    },
    async render(){exposure.value=renderer.toneMappingExposure;near.value=camera.near;far.value=camera.far;await post.renderAsync();},
    dispose(){post.dispose();scenePass.dispose();},
  };
}
