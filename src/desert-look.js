import {NearestFilter,NearestMipmapLinearFilter,Vector2,MeshStandardMaterial,MeshPhysicalMaterial} from 'three';
import {MeshStandardNodeMaterial,MeshPhysicalNodeMaterial} from 'three/webgpu';
import {uniform,vec4,mix} from 'three/tsl';
import {createDialKit} from './dev-dials.js';

// Authored PS2 look: native PBR, original saturation and shadow model, with
// adjustable vertex snapping; no screen pixelation or affine UV warp.
function jitterProjection(material,clip){
  const projected=clip.toVar(),grid=material.desertGrid;
  const snapped=projected.xy.div(projected.w).mul(grid).round().div(grid).mul(projected.w);
  return vec4(mix(projected.xy,snapped,material.desertJitter),projected.zw);
}
class DesertJitterMaterial extends MeshStandardNodeMaterial{
  setupModelViewProjection(builder){return jitterProjection(this,super.setupModelViewProjection(builder));}
}
class DesertJitterPhysicalMaterial extends MeshPhysicalNodeMaterial{
  setupModelViewProjection(builder){return jitterProjection(this,super.setupModelViewProjection(builder));}
}
export function createDesertLook(scene,renderer){
  const warmth=uniform(.18),jitter=uniform(0),grid=uniform(new Vector2(240,135));
  const bindings=[],cache=new Map(),textures=new Map(),drawingSize=new Vector2();let previousJitter=false,previousSharp=false,override=null;
  scene.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const source=mesh.material;bindings.push({mesh,source});
    for(const material of [].concat(source))if(!material.isNodeMaterial&&material.map&&!textures.has(material.map))textures.set(material.map,{mag:material.map.magFilter,min:material.map.minFilter});
  });
  function convert(source){
    if(source.isNodeMaterial||!source.isMeshStandardMaterial)return source;
    if(cache.has(source))return cache.get(source);
    const physical=source.isMeshPhysicalMaterial,m=physical?new DesertJitterPhysicalMaterial():new DesertJitterMaterial();
    // Use the source's native property copy, retaining PBR extensions, maps,
    // alpha, normals and skinning/instancing through Three's standard path.
    (physical?MeshPhysicalMaterial:MeshStandardMaterial).prototype.copy.call(m,source);
    m.name=`PS2 · ${source.name}`;m.desertGrid=grid;m.desertJitter=jitter;cache.set(source,m);return m;
  }
  const defaults={Activo:true,'Calidez desierto':.18,'Textura nítida':false,Tembleque:true,'Intensidad tembleque':1,'Resolución tembleque':368};
  let values={...defaults};
  const kit=createDialKit('Desierto · PS2 y luz actual',{
    Activo:true,'Calidez desierto':[.18,0,.6,.01],'Textura nítida':false,
    Tembleque:true,'Intensidad tembleque':[1,0,1,.01],'Resolución tembleque':[368,160,960,16],
    Original:{type:'action',label:'Look anterior'},PS2:{type:'action',label:'PS2 estable'},
  },{id:'desert-ps2-look-v1',persist:true,onAction:action=>{
    if(action==='Original'){kit.setValue('Activo',false);kit.setValue('Tembleque',false);}
    if(action==='PS2')for(const [key,value]of Object.entries(defaults))kit.setValue(key,value);
  }});
  const unsubscribe=kit.subscribe(next=>{values={...next};});
  return {warmth,
    update({enabled=true}={}){
      const v=override??values,active=enabled&&v.Activo,on=active&&v.Tembleque,sharp=active&&v['Textura nítida'];
      warmth.value=active?v['Calidez desierto']:0;jitter.value=on?v['Intensidad tembleque']:0;
      const size=renderer.getDrawingBufferSize(drawingSize);grid.value.set(v['Resolución tembleque']*.5,v['Resolución tembleque']*.5*size.y/Math.max(size.x,1));
      if(on!==previousJitter){for(const b of bindings)b.mesh.material=on?(Array.isArray(b.source)?b.source.map(convert):convert(b.source)):b.source;previousJitter=on;}
      if(sharp!==previousSharp){for(const [texture,old]of textures){texture.magFilter=sharp?NearestFilter:old.mag;texture.minFilter=sharp?NearestMipmapLinearFilter:old.min;texture.needsUpdate=true;}previousSharp=sharp;}
    },
    setOverride(mode){override=mode==='base'?{...defaults,Activo:false}:mode==='jitter'?{...defaults,Tembleque:true}:mode==='ps2'?{...defaults}:null;},
    get settings(){return {...(override??values)};},
    dispose(){unsubscribe();kit.destroy();for(const b of bindings)b.mesh.material=b.source;for(const [texture,old]of textures){texture.magFilter=old.mag;texture.minFilter=old.min;}for(const material of cache.values())material.dispose();},
  };
}
