import {uniform,screenCoordinate,float,floor,mod,mix,step,vec4} from 'three/tsl';

// Fixed screen-space Bayer 4x4 pattern: no temporal noise or flicker.
export function createDither(){
  const mode=uniform(0),amount=uniform(.6),size=uniform(2),levels=uniform(6);
  const cell=floor(screenCoordinate.div(size));
  const bayer2=p=>mod(p.x.add(p.y),2).mul(2).add(mod(p.y,2));
  const threshold=bayer2(mod(cell,2)).mul(4).add(bayer2(mod(floor(cell.div(2)),2))).add(.5).div(16);
  const checker=mod(cell.x.add(cell.y),2);
  const enabled=mode.greaterThan(0).select(amount,float(0));
  return {
    alpha(alpha){
      const patterned=mode.lessThan(1.5).select(alpha.mul(checker),step(threshold,alpha));
      return mix(alpha,patterned,enabled);
    },
    scene(input){
      const perceptual=input.rgb.max(0).sqrt();
      const quantized=floor(perceptual.mul(levels).add(threshold)).div(levels).pow(2);
      const patterned=mode.lessThan(1.5).select(input.rgb.mul(checker.mul(.45).add(.55)),quantized);
      return vec4(mix(input.rgb,patterned,enabled),input.a);
    },
    configure(values,prefix){
      mode.value={'Apagado':0,'Damero':1,'Dither':2}[values[prefix]]??0;
      amount.value=values[`${prefix} intensidad`];size.value=values[`${prefix} tamaño`];levels.value=values['Niveles escena'];
    },
    get active(){return mode.value!==0&&amount.value>0;},
  };
}
