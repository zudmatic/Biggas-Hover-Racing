import {Color,Vector2} from 'three';
import {MeshLambertNodeMaterial} from 'three/webgpu';
import {color as tslColor,Fn,float,vec2,vec3,vec4,uniform,materialColor,materialReference,positionGeometry,normalGeometry,screenCoordinate,mix,smoothstep,sin,fract,floor,dFdx,dFdy,fwidth} from 'three/tsl';
import {RETRO_DEFAULTS as defaults} from './retro-style';

// Colors must use tslColor: vec3(Color) reads x/y/z rather than r/g/b.
const luma=vec3(.2126,.7152,.0722);
const hash=Fn(([p])=>fract(sin(p.dot(vec3(12.9898,78.233,37.719))).mul(43758.5453)));
const noise=Fn(([p])=>{
  const i=floor(p),f=fract(p),s=f.mul(f).mul(float(3).sub(f.mul(2)));
  const plane=z=>mix(mix(hash(i.add(vec3(0,0,z))),hash(i.add(vec3(1,0,z))),s.x),mix(hash(i.add(vec3(0,1,z))),hash(i.add(vec3(1,1,z))),s.x),s.y);
  return mix(plane(0),plane(1),s.z);
});
const dotCell=(q,coverage,aa,lod)=>{
  const radius=coverage.max(0).div(Math.PI).sqrt();
  return float(1).sub(smoothstep(radius.sub(aa.mul(.5)),radius.add(aa.mul(.5)),fract(q).sub(.5).length())).sub(coverage).mul(lod).mul(smoothstep(.005,.04,coverage));
};
const lineCell=(q,coverage,aa,lod)=>{
  const edge=float(.5).sub(coverage.mul(.5));
  return smoothstep(edge.sub(aa.mul(.5)),edge.add(aa.mul(.5)),fract(q.y).sub(.5).abs()).sub(coverage).mul(lod).mul(smoothstep(.005,.04,coverage));
};
function grid(p,pitch,angle,density){
  const a=angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  return vec2(p.dot(vec2(c,s)),p.dot(vec2(-s,c))).mul(density).div(pitch);
}
function pattern(coverage,pitch,angle,dots,style){
  const cell=dots?dotCell:lineCell;
  const weights=normalGeometry.normalize().abs().pow(4),w=weights.div(weights.dot(vec3(1)).max(.0001));
  let object=float(0);
  for(const [plane,weight] of [[positionGeometry.yz,w.x],[positionGeometry.zx,w.y],[positionGeometry.xy,w.z]]){
    const q=grid(plane,pitch,angle,90),footprint=dots?dFdx(q).length().max(dFdy(q).length()):fwidth(q.y);
    object=object.add(cell(q,coverage,footprint.max(.03),float(1).sub(smoothstep(.42,.92,footprint))).mul(weight));
  }
  // WebGPU's framebuffer origin is top-left; flip Y to match GLSL screen ink.
  const pixel=vec2(screenCoordinate.x,style.resolution.y.sub(screenCoordinate.y));
  const perPixel=float(1).div(pitch.mul(style.pixelRatio));
  const screen=cell(grid(pixel,pitch,angle,float(1).div(style.pixelRatio)),coverage,perPixel.max(.03),float(1).sub(smoothstep(.42,.92,perPixel)));
  return mix(object,screen,style.screenSpace);
}
export function createComicStyle(){
  return {strength:uniform(defaults.strength),hatch:uniform(1),dots:uniform(1),screenSpace:uniform(0),pixelRatio:uniform(1),resolution:uniform(new Vector2(1,1)),white:uniform(1)};
}
function surfacePrint(lit,detail,ink,style){
  const p=defaults,L=lit.dot(luma).div(style.white.max(.001)).max(0).sqrt();
  const shadow=float(1).sub(smoothstep(p.bandShadow-p.bandSoft,p.bandShadow+p.bandSoft,L));
  const light=smoothstep(p.bandLight-p.bandSoft,p.bandLight+p.bandSoft,L);
  const s=L.div(detail.max(.0001).sqrt()).max(.001).mul(p.posterSteps);
  const level=floor(s).add(.5).add(smoothstep(1-p.posterSoft,1,fract(s)));
  let c=lit.mul(mix(float(1),level.mul(level).div(s.mul(s)).min(4),float(p.posterAmount)));
  c=c.mul(mix(vec3(1),tslColor(new Color(p.shadowTint)),shadow.mul(p.tintAmount)));
  c=c.mul(mix(vec3(1),tslColor(new Color(p.lightTint)),light.mul(p.tintAmount)));
  const grain=ink.mul(p.grain).add(1);
  const hiCoverage=light.mul(p.hiCoverage).mul(L.sub(p.bandLight).div(Math.max(1-p.bandLight,.05)).clamp().mul(.65).add(.35)).mul(grain);
  const hi=pattern(hiCoverage,float(p.hiPitch),p.hiAngle,true,style);
  c=c.add(tslColor(new Color(p.hiInk).multiplyScalar(p.hiGain)).mul(hi).mul(p.hiOpacity).mul(style.strength).mul(style.dots)).max(0);
  const coverage=shadow.mul(p.hatchCoverage).mul(float(1).sub(L.div(Math.max(p.bandShadow,.05)).clamp()).mul(.7).add(.3)).mul(grain);
  const deep=shadow.mul(float(1).sub(smoothstep(.3,.6,L.div(Math.max(p.bandShadow,.05)))));
  const lines=pattern(coverage,float(p.hatchPitch),p.hatchAngle,false,style).add(pattern(coverage.mul(deep),float(p.hatchPitch),p.hatchAngle+90,false,style).mul(p.hatchSecond));
  c=c.mul(vec3(1).add(tslColor(new Color(p.hatchTint)).sub(1).mul(lines).mul(p.hatchOpacity).mul(style.strength).mul(style.hatch))).max(0);
  return c;
}

// Run the print after Lambert illumination and before fog/tonemapping, as in
// retro-material.js. Skinning and instancing remain Three's native node paths.
class ComicMaterial extends MeshLambertNodeMaterial{
  setupLighting(builder){return surfacePrint(super.setupLighting(builder).toVar(),this.textureDetail,this.inkNoise,this.comicStyle);}
}
export function createComicMaterials(root,style){
  const cache=new Map(),bindings=[];
  // Share the node graph across surfaces. Per-material uniform nodes create a
  // different program key for every cloned hangar part, even for identical shaders.
  const albedo=materialColor.rgb.max(vec3(.012,.010,.017)).pow(.82);
  const textureDetail=albedo.dot(luma).div(materialReference('color','color').max(vec3(.012,.010,.017)).pow(.82).dot(luma).max(.0001));
  const inkNoise=noise(positionGeometry.mul(34)).sub(.5);
  const face=dFdx(positionGeometry).cross(dFdy(positionGeometry)).normalize().mul(48).add(.5).floor();
  const variation=hash(face).sub(.5).mul(.1).add(inkNoise.mul(.08)).add(noise(positionGeometry.mul(8)).sub(.5).mul(.08*.45)).add(1);
  const colorNode=vec4(albedo.mul(variation),materialColor.a);
  const known=new WeakSet();
  function refresh(){
  root.traverse(mesh=>{
    if(!mesh.isMesh||known.has(mesh))return;
    known.add(mesh);
    const source=mesh.material;
    function convert(src){
      if(src.isNodeMaterial||!src.color||src.isShaderMaterial||src.isMeshBasicMaterial||src.isShadowMaterial||src.userData.characterEyeSurface)return src;
      if(cache.has(src))return cache.get(src);
      const m=new ComicMaterial();m.comicStyle=style;
      for(const key of ['map','alphaMap','normalMap','bumpMap','bumpScale','normalScale','emissiveMap','emissiveIntensity','aoMap','aoMapIntensity','side','transparent','opacity','alphaTest','depthWrite','depthTest','vertexColors','flatShading','wireframe','polygonOffset','polygonOffsetFactor','polygonOffsetUnits'])if(src[key]!==undefined)m[key]=src[key];
      m.color=src.color;m.emissive=src.emissive??new Color();
      m.name=`TSL · ${src.name}`;
      m.textureDetail=textureDetail;m.inkNoise=inkNoise;m.colorNode=colorNode;cache.set(src,m);return m;
    }
    bindings.push({mesh,source,printed:Array.isArray(source)?source.map(convert):convert(source)});
  });
  }
  refresh();
  return {refresh,setEnabled(on){for(const b of bindings)b.mesh.material=on?b.printed:b.source;},sync(){for(const [src,m] of cache)m.emissiveIntensity=src.emissiveIntensity??1;},dispose(){for(const b of bindings)b.mesh.material=b.source;for(const m of cache.values())m.dispose();}};
}
