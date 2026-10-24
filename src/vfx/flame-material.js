import * as THREE from 'three/webgpu';
import {mix,uniform,uv,float,sin,smoothstep,abs} from 'three/tsl';
import {createDither} from './dither.js';
export function createFlameMaterial(){
  const hot=uniform(new THREE.Color('#fff1bc')),fire=uniform(new THREE.Color('#ff6b16'));
  // Crossed, advected flame sheets keep combustion attached to each nozzle.
  const clock=uniform(0),roughness=uniform(2),frequency=uniform(1.2),flowSpeed=uniform(1),brightness=uniform(1.5),opacity=uniform(.7),taper=uniform(.65);
  const fireDither=createDither();
  const flameMaterial=new THREE.MeshBasicNodeMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
  // The translated plane starts at UV.y = 0 at the nozzle and ends at 1.
  const t=uv().y,x=uv().x.sub(.5).mul(2);
  const flow=t.mul(18).sub(clock.mul(24).mul(flowSpeed));
  const noise=sin(flow.add(x.mul(5))).mul(.5).add(sin(flow.mul(1.73).add(x.mul(11))).mul(.3)).add(sin(flow.mul(2.91).sub(x.mul(17))).mul(.2));
  const bend=sin(t.mul(9).mul(frequency).sub(clock.mul(10).mul(flowSpeed))).mul(t).mul(.16).mul(roughness);
  const width=float(1).sub(t).pow(taper).mul(.68).add(noise.mul(.13).mul(t)).max(.015);
  const edge=abs(x.add(bend)).div(width);
  const mask=smoothstep(float(1),float(.45),edge).mul(smoothstep(float(1),float(.72),t));
  const core=smoothstep(float(.7),float(.05),edge.add(t.mul(.7)));
  flameMaterial.colorNode=mix(fire,hot,core).mul(brightness);
  flameMaterial.opacityNode=fireDither.alpha(mask.mul(opacity));
  fireDither.configure({Fuego:'Dither','Fuego intensidad':.6,'Fuego tamaño':2,'Niveles escena':6},'Fuego');
  return {material:flameMaterial,update(time,v,blue){
    clock.value=time;roughness.value=v.Turbulencia;frequency.value=.8;flowSpeed.value=1.95;brightness.value=1.75;opacity.value=v['Densidad llama']??.82;taper.value=.7;
    fire.value.set(blue?'#42a4ff':'#ff6b16');hot.value.set(blue?'#9e8c00':'#fff1bc');
    fireDither.configure({Fuego:v.Trama,'Fuego intensidad':.6,'Fuego tamaño':2,'Niveles escena':6},'Fuego');
  }};
}
