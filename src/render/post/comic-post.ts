import {createHeatField} from '../../fx/heat/heat-field';
import {Color,Vector2,ACESFilmicToneMapping,SRGBColorSpace,DepthStencilFormat,UnsignedInt248Type} from 'three';
import {PostProcessing} from 'three/webgpu';
import {color as tslColor,pass,uniform,float,vec2,vec3,vec4,screenUV,mix,smoothstep,fract,toneMapping,workingToColorSpace} from 'three/tsl';
import {RETRO_DEFAULTS as p} from '../materials/retro-style';
import {createLensWarp} from '../../fx/singularity/singularity-lens';

// Opaque circuit counterpart of retro-print.js: linear HDR -> ACES -> sRGB
// grading, warm glow, colored depth outlines, registration and static ink grain.
// `lens` is set only for singularity ships; without it the graph is unchanged.
export function createComicPost(renderer,scene,camera,{glowSamples=12,samples=4,lens=null}={}){
  const scenePass=pass(scene,camera,{samples,stencilBuffer:true}),source=scenePass.getTextureNode(),depth=scenePass.getTextureNode('depth');
  // Bluleet's paper edge belongs outside his silhouette, never over his eyes
  // or jacket. A shared depth/stencil attachment supports that mask on both backends.
  scenePass.renderTarget.depthTexture.format=DepthStencilFormat;
  scenePass.renderTarget.depthTexture.type=UnsignedInt248Type;
  if(renderer.backend.isWebGPUBackend){
    // Three 0.182's binding cache creates combined depth/stencil sample views
    // with aspect "all", which WebGPU rejects. Cache a depth-only sample view
    // after this pass creates/resizes its attachment. The render attachment
    // still uses both aspects. Remove when Three's binding utility handles it.
    const renderPass=scenePass.updateBefore;let lastTexture;
    scenePass.updateBefore=function(frame){
      renderPass.call(this,frame);
      const data=renderer.backend.get(this.renderTarget.depthTexture),gpu=data.texture;
      if(gpu&&gpu!==lastTexture){
        data[`view-${gpu.width}-${gpu.height}-${gpu.mipLevelCount}-0`]=gpu.createView({aspect:'depth-only',dimension:'2d',mipLevelCount:gpu.mipLevelCount,baseMipLevel:0});lastTexture=gpu;
      }
    };
  }
  const post=new PostProcessing(renderer);post.outputColorTransform=false;
  const resolution=uniform(new Vector2()),pixelRatio=uniform(1),near=uniform(camera.near),far=uniform(camera.far),pixelWorld=uniform(1),exposure=uniform(1.05);
  const outline=uniform(1),grading=uniform(1),paper=uniform(new Color()),size=new Vector2();
  const viewDepth=q=>near.mul(far).div(far.sub(depth.sample(q).r.mul(far.sub(near))));
  const heat=createHeatField(renderer,camera,viewDepth),comic=uniform(1);
  const warp=lens?createLensWarp(lens,{uv:heat.uv,aspect:resolution.x.div(resolution.y),viewDepth,far}):null;
  const uv=warp?.uv??heat.uv,texel=vec2(1).div(resolution),fragment=uv.mul(resolution);
  const width=float(p.outlineWidth).mul(pixelRatio).add(.5).floor().max(1);
  const printDepth=q=>{
    const d=depth.sample(q.clamp(0,1)).r;
    return near.mul(far).div(far.sub(d.mul(far.sub(near)))).sub(near).div(far.sub(near));
  };
  const d0=printDepth(uv),left=printDepth(uv.sub(vec2(width,0).mul(texel))),right=printDepth(uv.add(vec2(width,0).mul(texel))),down=printDepth(uv.sub(vec2(0,width).mul(texel))),up=printDepth(uv.add(vec2(0,width).mul(texel)));
  const worldPixel=pixelWorld.mul(near.add(d0.mul(far.sub(near))).max(near));
  const bend=d0.mul(4).sub(left).sub(right).sub(down).sub(up).abs().mul(far.sub(near)).div(width.mul(worldPixel).max(.00001));
  const edge=smoothstep(p.outlineThreshold,p.outlineThreshold*1.8,bend).mul(mix(float(p.outlineCrease),float(1),smoothstep(3,10,bend)));
  const srgb=color=>workingToColorSpace(vec4(color.rgb,1),SRGBColorSpace).rgb;
  const absorb=warp?float(1).sub(warp.dark):null;
  const lensed=hdr=>warp?hdr.mul(absorb).add(warp.emission):hdr,rimPaper=warp?paper.mul(absorb).add(srgb(toneMapping(ACESFilmicToneMapping,exposure,warp.emission))):paper;
  const develop=q=>{
    const sample=source.sample(q.clamp(0,1));
    let c=srgb(toneMapping(ACESFilmicToneMapping,exposure,lensed(sample.rgb.div(sample.a.max(.001)))));
    c=mix(vec3(c.dot(vec3(.299,.587,.114))),c,1.12).clamp();
    const l=c.dot(vec3(.299,.587,.114));
    let graded=mix(vec3(l),c,p.gradeSaturation).sub(.5).mul(p.gradeContrast).add(.5);
    const shadow=new Color(p.splitShadow).convertLinearToSRGB(),light=new Color(p.splitLight).convertLinearToSRGB();
    graded=graded.mul(mix(vec3(1),mix(tslColor(shadow),tslColor(light),smoothstep(.15,.85,l)),p.splitAmount)).clamp();
    return mix(rimPaper,mix(c,graded,grading),sample.a);
  };
  let glow=vec3(0),open=float(0),proximity=source.a;
  for(let i=0;i<glowSamples;i++){
    const a=i*2.3998,axis=vec2(Math.cos(a),Math.sin(a));
    const sample=source.sample(uv.add(axis.mul(3+i*13.2/(glowSamples-1)).mul(pixelRatio).mul(texel)).clamp(0,1));
    const t=toneMapping(ACESFilmicToneMapping,exposure,sample.rgb.div(sample.a.max(.001))).rgb;
    glow=glow.add(t.sub(.8).max(0).mul(sample.a));open=open.add(float(1).sub(sample.a));
    proximity=proximity.add(source.sample(uv.add(axis.mul((.15+.85*i/(glowSamples-1))*p.bgReach).mul(pixelRatio).mul(texel)).clamp(0,1)).a);
  }
  glow=srgb(glow.div(glowSamples)).mul(vec3(1,.86,.66)).mul(.17);
  const shift=edge.mul(p.misregEdge).add(p.misreg).mul(pixelRatio);
  let color=vec3(develop(uv.add(vec2(1,.35).mul(shift).mul(texel))).r,develop(uv.add(vec2(-.7,.5).mul(shift).mul(texel))).g,develop(uv.add(vec2(.15,-1).mul(shift).mul(texel))).b);
  color=mix(color,paper.mul(vec3(1,.97,.93)),open.div(glowSamples).mul(.06)).add(glow).min(1);
  const coverage=proximity.div(glowSamples+1).mul(2.2).clamp().pow(1.5).mul(p.bgCoverage).mul(float(1).sub(source.a));
  const angle=p.bgAngle*Math.PI/180,cell=float(p.bgPitch).mul(pixelRatio),q=vec2(fragment.dot(vec2(Math.cos(angle),Math.sin(angle))),fragment.dot(vec2(-Math.sin(angle),Math.cos(angle)))).div(cell);
  const radius=coverage.div(Math.PI).sqrt(),aa=float(1).div(cell).max(.03);
  const dots=float(1).sub(smoothstep(radius.sub(aa.mul(.5)),radius.add(aa.mul(.5)),fract(q).sub(.5).length())).mul(smoothstep(.005,.04,coverage));
  color=mix(color,tslColor(new Color(p.bgInk).convertLinearToSRGB()),dots.mul(p.bgOpacity).mul(float(1).sub(source.a)));
  // Pick the nearest depth tap for the hue of the outline, as the GLSL pass does.
  let nearest=vec2(0),nearestDepth=d0;
  for(const [d,offset] of [[left,vec2(width.negate(),0)],[right,vec2(width,0)],[down,vec2(0,width.negate())],[up,vec2(0,width)]]){
    nearest=mix(nearest,offset,d.lessThan(nearestDepth));nearestDepth=nearestDepth.min(d);
  }
  const sample=source.sample(uv.add(nearest.mul(texel)).clamp(0,1)),raw=sample.rgb.div(sample.a.max(.001));
  const picked=srgb(raw.div(raw.add(1))).mul(1.5).clamp();
  const ink=tslColor(new Color(p.outlineInk).convertLinearToSRGB()).mul(mix(vec3(1),picked,p.outlineTint));
  color=mix(color,ink,edge.mul(p.outlineOpacity).mul(outline));
  const grain=fract(fract(fragment.dot(vec2(.06711056,.00583715))).mul(52.9829189)).sub(.5);
  color=color.mul(grain.mul(float(p.inkGrain).mul(source.a.max(edge))).add(1)).clamp();
  const baseSample=source.sample(uv);
  post.outputNode=vec4(mix(mix(rimPaper,srgb(toneMapping(ACESFilmicToneMapping,exposure,lensed(baseSample.rgb.div(baseSample.a.max(.001))))),baseSample.a),color,comic),1);
  return {outline,grading,heat,lens,comic,
    async render(backgroundColor){
      renderer.getDrawingBufferSize(size);resolution.value.copy(size);pixelRatio.value=renderer.getPixelRatio();near.value=camera.near;far.value=camera.far;
      pixelWorld.value=2*Math.tan(camera.fov*Math.PI/360)/camera.zoom/size.y;exposure.value=renderer.toneMappingExposure;
      const background=scene.background;paper.value.set(backgroundColor??background??0xffffff).convertLinearToSRGB();scene.background=null;
      try{await post.renderAsync();}finally{scene.background=background;}
    },dispose(){post.dispose();scenePass.dispose();},
  };
}
