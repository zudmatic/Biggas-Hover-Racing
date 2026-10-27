import * as THREE from 'three/webgpu';
import {attribute,float,uv,uniform,vec2,sin,fract,floor,mix} from 'three/tsl';
import {createDither} from '../vfx/dither.js';

// Thruster grain and drift-style seeded silhouettes; water is non-emissive.
export function createWaterFxMaterial(kind,wetMask){
  const material=new THREE.MeshBasicNodeMaterial({name:`Water ${kind}`,transparent:true,
    depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true});
  const data=attribute('waterFxData','vec3'),p=uv(),q=p.sub(.5).mul(2),seed=data.y;
  const grain=fract(sin(floor(p.mul(36)).dot(vec2(12.9898,78.233)).add(seed.mul(17))).mul(43758.5453));
  const ragged=sin(q.y.mul(11).add(seed)).mul(.09).add(sin(q.x.mul(9).sub(seed.mul(2))).mul(.07));
  let mask;
  if(kind==='foam'){
    const rim=q.length().add(ragged).smoothstep(.42,.98).oneMinus();
    const holes=grain.add(sin(q.x.mul(14).add(q.y.mul(9)).add(seed)).mul(.13)).smoothstep(.12,.4);
    mask=rim.mul(holes);
  }else if(kind==='splash'){
    const width=p.y.mul(.7).add(.18);
    const edge=q.x.abs().div(width).add(ragged).smoothstep(.55,1).oneMinus();
    const fingers=sin(q.x.mul(19).add(seed)).mul(.5).add(.5).smoothstep(.12,.45);
    mask=edge.mul(fingers).mul(p.y.smoothstep(0,.12)).mul(p.y.smoothstep(.55,1).oneMinus());
  }else{
    mask=q.length().add(ragged.mul(.35)).smoothstep(.5,1).oneMinus();
  }
  const tint=uniform(new THREE.Color('#d9ece5')),dither=createDither();
  material.colorNode=mix(tint.mul(.82),tint,grain.smoothstep(.15,.65));
  material.opacityNode=dither.alpha(data.x.mul(mask)).mul(wetMask);
  material.alphaTestNode=float(.012);
  return {material,configure(night,amount){
    tint.value.set(night?'#759fa6':'#d9ece5');
    dither.configure({Fuego:'Dither','Fuego intensidad':amount,'Fuego tamaño':1,'Niveles escena':6},'Fuego');
  }};
}
