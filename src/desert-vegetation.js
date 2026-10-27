import {Float32BufferAttribute,Vector3} from 'three';
import {MeshStandardNodeMaterial} from 'three/webgpu';
import {attribute,materialColor,normalWorld,positionLocal,uniform,uv,vec3} from 'three/tsl';
import {DESERT_SUN,DESERT_LIGHT} from './desert-look.js';

// One shared material across all species/LODs. The atlas and authored wind
// weights survive export; motion stays in the vertex shader, including shadows.
export function prepareDesertVegetation(root){
  const phase=uniform(0),daylight=uniform(1),direction=uniform(new Vector3(...DESERT_SUN).normalize());
  const replacements=new Map();
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    mesh.material=[].concat(mesh.material).map(source=>{
      if(!source.name.includes('DesertVegetation'))return source;
      if(!mesh.geometry.hasAttribute('color_1'))mesh.geometry.setAttribute('color_1',new Float32BufferAttribute(new Float32Array(mesh.geometry.attributes.position.count*4),4));
      if(!replacements.has(source)){
        const material=new MeshStandardNodeMaterial();
        // Copy standard properties without overwriting node-material defaults.
        for(const key of ['name','map','color','vertexColors','side','roughness','metalness','transparent','opacity','alphaTest'])material[key]=source[key]?.clone&&key==='color'?source[key].clone():source[key];
        material.name+=' · afternoon foliage';
        const weight=attribute('color_1','vec4').r;
        // positionLocal already includes the instance transform in Three r182.
        // This makes adjacent plants move out of phase while LOD changes agree.
        const gust=positionLocal.x.mul(.19).add(positionLocal.z.mul(.13)).add(phase.mul(1.25));
        const sway=gust.sin().mul(.11).add(gust.mul(2.3).add(phase).sin().mul(.025)).mul(weight);
        material.positionNode=positionLocal.add(vec3(sway,sway.mul(.15),sway.mul(.55)));
        // Green leaves occupy the bottom-left atlas quadrant after glTF's UV
        // flip. Keep bark, dry fronds and cactus skin out of the transmission.
        const leaf=uv().x.lessThan(.5).and(uv().y.greaterThan(.5)).toFloat();
        const backlight=normalWorld.dot(direction).negate().max(0).pow(1.4);
        const tint=materialColor.rgb.mul(attribute('color','vec3'));
        material.emissiveNode=tint.mul(vec3(1.12,1.08,.82)).mul(backlight.mul(.48).add(.08)).mul(leaf).mul(daylight);
        replacements.set(source,material);
      }
      return replacements.get(source);
    });
    if(mesh.material.length===1)mesh.material=mesh.material[0];
  });
  for(const source of replacements.keys())source.dispose();
  return {update(dt,{paused=false,reduced=false,sun=null}={}){
    if(!paused&&!reduced)phase.value+=Math.min(dt,.05);
    if(sun){direction.value.subVectors(sun.position,sun.target.position).normalize();daylight.value=Math.max(0,(sun.intensity-.7)/(DESERT_LIGHT.sun-.7));}
  }};
}
