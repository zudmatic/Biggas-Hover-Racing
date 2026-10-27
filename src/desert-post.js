import {createScenePass} from './scene-pass.js';
import {createDualFilterBloom} from './dual-filter-bloom.js';
import {Vector2,Vector3,MathUtils,AgXToneMapping,SRGBColorSpace} from 'three';
import {PostProcessing} from 'three/webgpu';
import {uniform,float,vec2,vec3,vec4,mix,smoothstep,screenUV,toneMapping,workingToColorSpace} from 'three/tsl';
import {createHeatField} from './vfx/heat-field.js';
import {createLensWarp} from './vfx/singularity-lens.js';

// Portfolio's small HDR bloom buffers feed the existing color-grade composite.
// Tone mapping and the display transform are each applied once, after glow.
export function createDesertPost(renderer,scene,camera,{samples=4,lens=null}={}){
  const scenePass=createScenePass(renderer,scene,camera,samples),source=scenePass.getTextureNode(),depth=scenePass.getTextureNode('depth');
  const bloom=createDualFilterBloom(source);bloom.strength.value=.09;
  const post=new PostProcessing(renderer);post.outputColorTransform=false;
  const exposure=uniform(renderer.toneMappingExposure),near=uniform(camera.near),far=uniform(camera.far),resolution=uniform(new Vector2());
  const sun=scene.getObjectByName('Sol y luna'),projected=new Vector3(),viewSun=new Vector3(),sunUV=uniform(new Vector2(.5,.5)),flareGain=uniform(0);
  const viewDepth=q=>near.mul(far).div(far.sub(depth.sample(q).r.mul(far.sub(near))));
  const heat=createHeatField(renderer,camera,viewDepth);
  const warp=lens?createLensWarp(lens,{uv:heat.uv,aspect:resolution.x.div(resolution.y),viewDepth,far}):null;
  const sampleUV=warp?.uv??heat.uv;
  const sample=source.sample(sampleUV).rgb.add(bloom.sample(sampleUV));
  const hdr=warp?sample.mul(float(1).sub(warp.dark)).add(warp.emission):sample;
  const mapped=workingToColorSpace(vec4(toneMapping(AgXToneMapping,exposure,hdr.rgb).rgb,1),SRGBColorSpace).rgb.toVar();
  const luma=mapped.dot(vec3(.2126,.7152,.0722));
  const grade=mix(vec3(luma),mapped,1.28).sub(.5).mul(1.035).add(.5);
  const balance=mix(vec3(.975,1.005,1.025),vec3(1.012,1.004,.99),smoothstep(.15,.85,luma));
  // Small lens ghosts only while the sun is on screen and unobstructed.
  // Reuse scene color/depth; no light-occlusion render or extra composite.
  const aspect=vec2(resolution.x.div(resolution.y),1);
  const clear=depth.sample(sunUV).r.greaterThan(.99999).toFloat();
  const visibleSun=source.sample(sunUV).rgb.dot(vec3(.2126,.7152,.0722)).smoothstep(2,4);
  const halo=screenUV.sub(sunUV).mul(aspect).length().smoothstep(.015,.13).oneMinus().pow(3).mul(.09);
  const ghost=screenUV.sub(vec2(.5).sub(sunUV.sub(.5).mul(.65))).mul(aspect).length().smoothstep(.01,.055).oneMinus().pow(2).mul(.025);
  const flare=vec3(1,.68,.3).mul(halo).add(vec3(.3,.85,1).mul(ghost)).mul(clear).mul(visibleSun).mul(flareGain);
  post.outputNode=vec4(grade.mul(balance).add(flare).clamp(),1);
  return {heat,lens,bloom,async render(){
    bloom.resize(renderer);renderer.getDrawingBufferSize(resolution.value);exposure.value=renderer.toneMappingExposure;near.value=camera.near;far.value=camera.far;
    flareGain.value=0;
    if(sun){sun.getWorldPosition(projected);viewSun.copy(projected).applyMatrix4(camera.matrixWorldInverse);projected.project(camera);sunUV.value.set(projected.x*.5+.5,.5-projected.y*.5);const edge=Math.min(sunUV.value.x,1-sunUV.value.x,sunUV.value.y,1-sunUV.value.y);flareGain.value=viewSun.z<0?MathUtils.smoothstep(edge,0,.08):0;sunUV.value.clampScalar(.001,.999);}
    await post.renderAsync();
  },dispose(){post.dispose();bloom.dispose();scenePass.dispose();}};
}
