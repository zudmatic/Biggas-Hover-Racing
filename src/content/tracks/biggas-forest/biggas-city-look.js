import {Vector2,MeshStandardMaterial,MeshPhysicalMaterial} from 'three';
import {MeshStandardNodeMaterial,MeshPhysicalNodeMaterial} from 'three/webgpu';
import {uniform,vec4,mix} from 'three/tsl';

// Adapted from Desert Valley's desert-look/post on origin/main (82cf702).
// Native PBR with the same 368px grid, blended gently for the city's fine
// facade geometry. The HUD stays at native resolution.
function snapProjection(material,clip){
  const projected=clip.toVar(),grid=material.cityGrid;
  const snapped=projected.xy.div(projected.w).mul(grid).round().div(grid).mul(projected.w);
  return vec4(mix(projected.xy,snapped,material.cityJitter),projected.zw);
}
class CityJitterMaterial extends MeshStandardNodeMaterial{
  setupModelViewProjection(builder){return snapProjection(this,super.setupModelViewProjection(builder));}
}
class CityJitterPhysicalMaterial extends MeshPhysicalNodeMaterial{
  setupModelViewProjection(builder){return snapProjection(this,super.setupModelViewProjection(builder));}
}
export function createBiggasCityLook(scene,renderer){
  const warmth=uniform(.18),jitter=uniform(0),grid=uniform(new Vector2(184,103.5)),size=new Vector2(),bindings=[],cache=new Map();let active=false,override=null;
  scene.traverse(mesh=>{if(mesh.isMesh)bindings.push({mesh,source:mesh.material});});
  function convert(source){
    // Preserve the continuous animated river/veil and custom engine shaders.
    if(source.isNodeMaterial||!source.isMeshStandardMaterial||source.userData.cityStableProjection||/water|foam/.test(source.userData.circuitSurface??''))return source;
    if(cache.has(source))return cache.get(source);
    const physical=source.isMeshPhysicalMaterial,m=physical?new CityJitterPhysicalMaterial():new CityJitterMaterial();
    (physical?MeshPhysicalMaterial:MeshStandardMaterial).prototype.copy.call(m,source);
    m.name=`PSX · ${source.name}`;m.cityGrid=grid;m.cityJitter=jitter;
    // Keep the city's bounded light groups, including moving vehicle lights.
    m.lightsNode=source.lightsNode??null;m.color=source.color;m.emissive=source.emissive;
    cache.set(source,m);return m;
  }
  return {warmth,jitter,grid,
    get settings(){return {enabled:override!=='base',warmth:.18,jitter:.22,resolution:368};},
    setOverride(mode){override=mode;},
    update({enabled=true,reducedMotion=false}={}){
      enabled=enabled&&override!=='base';const next=enabled;warmth.value=enabled?.18:0;jitter.value=enabled&&!reducedMotion?.22:0;
      renderer.getDrawingBufferSize(size);grid.value.set(184,184*size.y/Math.max(1,size.x));
      if(next!==active){for(const b of bindings)b.mesh.material=next?(Array.isArray(b.source)?b.source.map(convert):convert(b.source)):b.source;active=next;}
      for(const [source,material] of cache)material.emissiveIntensity=source.emissiveIntensity;
    },
    dispose(){for(const b of bindings)b.mesh.material=b.source;for(const material of cache.values())material.dispose();},
  };
}
