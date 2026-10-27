import {Color,DoubleSide} from 'three';
import {MeshBasicNodeMaterial} from 'three/webgpu';
import {Fn,If,Discard,attribute,uv,uniform,texture,float,vec2,vec3,vec4,floor,fract,sin,cos,atan,mix,smoothstep,mod,screenCoordinate} from 'three/tsl';

// Same batch attributes and simulation as flight-fx; only the shader changes.
export function createSmokeMaterial(atlas,ground){
  const style=uniform(1),smokeColor=uniform(new Color('#bababa')),smokeDensity=uniform(1),screenGrain=uniform(1.5);
  const m=new MeshBasicNodeMaterial({side:DoubleSide,depthWrite:true,polygonOffset:ground,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  const fx=attribute('fx','vec3'),p=uv();
  const hash=q=>fract(sin(q.dot(vec2(12.9898,78.233))).mul(43758.5453));
  const bayer=q=>mod(q.x.mul(2).add(q.y.mul(3)),4);
  m.colorNode=Fn(()=>{
    const grain=hash(floor(p.mul(48))),color=vec3(0).toVar(),opacity=fx.x.toVar();
    if(ground){
      If(p.x.sub(.5).abs().mul(2).greaterThan(grain.mul(.35).add(.65)).or(grain.lessThan(.22)).or(mod(floor(p.x.mul(48)).add(floor(p.y.mul(6))),7).lessThan(1)),()=>Discard());
      color.assign(vec3(.027,.033,.038));If(grain.greaterThan(opacity),()=>Discard());
    }else{
      const local=floor(p.mul(32)).add(.5).div(32),q=local.sub(.5).mul(2),angle=atan(q.y,q.x),mask=float(1).toVar();
      If(fx.y.lessThan(0),()=>{
        const spike=cos(angle.mul(5)).max(0).pow(3).mul(.74).add(.17);If(q.length().greaterThan(spike),()=>Discard());
        color.assign(mix(vec3(.08,.95,.58),vec3(.96,.48,.1),fx.z));
      }).Else(()=>{
        If(style.lessThan(.5).or(style.greaterThan(1.5).and(fx.y.lessThan(1000))),()=>{
          const sector=floor(angle.add(Math.PI).mul(7/(Math.PI*2))),radius=hash(vec2(sector,fx.y)).mul(.33).add(.48);
          If(q.length().greaterThan(radius),()=>Discard());mask.assign(float(1).sub(smoothstep(radius.mul(.45),radius,q.length())));
          color.assign(smokeColor.mul(hash(vec2(fx.y,2)).mul(.16).add(.84)));
        }).Else(()=>{
          const cell=vec2(mod(floor(fx.y),2).add(1),3),sample=texture(atlas,cell.add(local.clamp(.025,.975)).mul(.25));
          If(sample.a.lessThan(.25),()=>Discard());mask.assign(smoothstep(.25,.9,sample.a).mul(hash(floor(local.mul(8)).add(fx.y)).mul(.3).add(.7)));
          color.assign(smokeColor.mul(sample.rgb.dot(vec3(.2126,.7152,.0722)).greaterThan(.45).select(float(1),float(.87))));
        });opacity.mulAssign(smokeDensity.mul(mask));
      });
      const pixel=floor(screenCoordinate.div(screenGrain.max(1))),coverage=bayer(mod(pixel,2)).mul(4).add(bayer(mod(floor(pixel.div(2)),2))).add(.5).div(16);
      If(coverage.greaterThan(opacity),()=>Discard());
    }
    return vec4(color,1);
  })();
  m.uniforms={style,smokeColor,smokeDensity,screenGrain};
  return m;
}
