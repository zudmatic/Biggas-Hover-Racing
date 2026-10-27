import {ACESFilmicToneMapping,SRGBColorSpace} from 'three';
import {PostProcessing} from 'three/webgpu';
import {pass,uniform,vec3,vec4,mix,smoothstep,toneMapping,workingToColorSpace} from 'three/tsl';
import {createHeatField} from './vfx/heat-field.js';

// One scene sample and a small color grade. No paper, outlines, halftone,
// registration, grain or multi-tap comic glow in the natural desert path.
export function createDesertPost(renderer,scene,camera,{samples=4,warmth=uniform(0)}={}){
  const scenePass=pass(scene,camera,{samples}),source=scenePass.getTextureNode(),depth=scenePass.getTextureNode('depth');
  const post=new PostProcessing(renderer);post.outputColorTransform=false;
  const exposure=uniform(renderer.toneMappingExposure),near=uniform(camera.near),far=uniform(camera.far);
  const heat=createHeatField(renderer,camera,q=>near.mul(far).div(far.sub(depth.sample(q).r.mul(far.sub(near)))));
  const hdr=source.sample(heat.uv);
  const mapped=workingToColorSpace(vec4(toneMapping(ACESFilmicToneMapping,exposure,hdr.rgb).rgb,1),SRGBColorSpace).rgb.toVar();
  const luma=mapped.dot(vec3(.2126,.7152,.0722));
  const grade=mix(vec3(luma),mapped,1.12).sub(.5).mul(1.045).add(.5);
  const balance=mix(vec3(.97,1.006,1.025),vec3(1.025,1.008,.975),smoothstep(.15,.85,luma));
  // A slight warm bias, with the existing saturation/contrast left intact.
  const desertWarmth=mix(vec3(1),vec3(1.035,1.016,.925),warmth);
  post.outputNode=vec4(grade.mul(balance).mul(desertWarmth).clamp(),1);
  return {heat,async render(){exposure.value=renderer.toneMappingExposure;near.value=camera.near;far.value=camera.far;await post.renderAsync();},dispose(){post.dispose();scenePass.dispose();}};
}
