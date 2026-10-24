import {vec2,vec3,vec4,float,mix,smoothstep,fract,floor,abs,step} from 'three/tsl';

// WebGPU preview of the game's Retro Print language (retro-style.js defaults).
// Screen-space adaptation, not the original object-space GLSL material.
export function comicFinish(original,source,depth,uv,pixel){
  const rgb=original.rgb.max(0).sqrt();
  const luma=rgb.dot(vec3(.299,.587,.114));
  const poster=floor(rgb.mul(12).add(.5)).div(12);
  let printed=mix(vec3(luma),poster,1.27).sub(.5).mul(1.06).add(.5).max(0);
  const light=smoothstep(float(.15),float(.85),luma);
  printed=printed.mul(mix(vec3(1),mix(vec3(.72,.63,1),vec3(1,.81,.57),light),.25));
  const fragment=uv.div(pixel);
  const rotated=vec2(fragment.x.mul(.656).add(fragment.y.mul(.755)),fragment.y.mul(.656).sub(fragment.x.mul(.755)));
  const hatch=step(fract(rotated.x.div(3.75)),float(.23));
  const shadow=float(1).sub(smoothstep(float(.1),float(.42),luma));
  const foreground=depth.sample(uv).r.lessThan(.99999);
  const dots=float(1).sub(smoothstep(float(.18),float(.3),fract(rotated.div(6.75)).sub(.5).length()));
  printed=mix(printed,printed.mul(vec3(.35,.29,.60)),hatch.mul(shadow).mul(.64).mul(foreground));
  printed=printed.add(vec3(1,.85,.64).mul(dots).mul(light).mul(.08).mul(foreground));
  const d=depth.sample(uv).r;
  let edges=float(0),colorEdges=float(0);
  for(const axis of [vec2(1,0),vec2(0,1)]){
    const delta=pixel.mul(axis);
    const a=depth.sample(uv.add(delta)).r,b=depth.sample(uv.sub(delta)).r;
    edges=edges.max(abs(d.mul(2).sub(a).sub(b)).div(float(1).sub(d).max(.0001)));
    // Transparent fire has no depth: use a faint color contour for those layers.
    const ca=source.sample(uv.add(delta)).rgb,cb=source.sample(uv.sub(delta)).rgb;
    colorEdges=colorEdges.max(ca.sub(cb).length());
  }
  const ink=smoothstep(float(.015),float(.08),edges).mul(.43).max(smoothstep(float(.6),float(1.8),colorEdges).mul(.15));
  printed=mix(printed,printed.mul(.19).add(vec3(.025)),ink);
  const grain=fract(fract(fragment.dot(vec2(.06711056,.00583715))).mul(52.9829189)).sub(.5).mul(.025);
  return vec4(printed.add(grain.mul(foreground)).max(0).pow(2),original.a);
}
