import * as THREE from 'three';
import {sampleWaterHeight} from './waves';

export const RIVER_SURFACE=Object.freeze({
  segments:128,mobileSegments:80,coverageResolution:256,
  shoreDepthStart:.15,shoreDepthFull:2.5,maximumWaveHeight:.65,
});

// Runtime geometry only: the original GLB and authored two-triangle water stay
// intact. Dry cells are omitted and the displacement fades into shallow banks.
export function createDesertWaterSurface(surface,dryHeight,{mobile=false}={}){
  surface.updateWorldMatrix(true,false);
  const bounds=new THREE.Box3().setFromObject(surface),size=bounds.getSize(new THREE.Vector3());
  const waterLevel=(bounds.min.y+bounds.max.y)*.5,segments=mobile?RIVER_SURFACE.mobileSegments:RIVER_SURFACE.segments;
  const inside=(x,z)=>x>=bounds.min.x&&x<=bounds.max.x&&z>=bounds.min.z&&z<=bounds.max.z;
  function depthAt(x,z){if(!inside(x,z))return -Infinity;const floor=dryHeight(x,z);return floor===null?10:waterLevel-floor;}
  function shoreWeight(x,z){return THREE.MathUtils.smoothstep(depthAt(x,z),RIVER_SURFACE.shoreDepthStart,RIVER_SURFACE.shoreDepthFull);}
  function isWet(x,z){return depthAt(x,z)>0;}
  function heightAt(x,z,phase=0,height=0){return waterLevel+sampleWaterHeight(x,z,phase,height)*shoreWeight(x,z);}

  const geometry=new THREE.PlaneGeometry(size.x,size.z,segments,segments).rotateX(-Math.PI/2).translate((bounds.min.x+bounds.max.x)*.5,waterLevel,(bounds.min.z+bounds.max.z)*.5);
  const positions=geometry.attributes.position,weights=new Float32Array(positions.count),wet=new Uint8Array(positions.count);
  for(let i=0;i<positions.count;i++){
    const x=positions.getX(i),z=positions.getZ(i);
    weights[i]=shoreWeight(x,z);wet[i]=Number(isWet(x,z));
  }
  const indices=[],original=geometry.index;
  for(let i=0;i<original.count;i+=3){
    const a=original.getX(i),b=original.getX(i+1),c=original.getX(i+2);
    const x=(positions.getX(a)+positions.getX(b)+positions.getX(c))/3,z=(positions.getZ(a)+positions.getZ(b)+positions.getZ(c))/3;
    if(wet[a]||wet[b]||wet[c]||isWet(x,z))indices.push(a,b,c);
  }
  geometry.setIndex(indices);geometry.setAttribute('waterShore',new THREE.BufferAttribute(weights,1));
  geometry.applyMatrix4(surface.matrixWorld.clone().invert());
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  geometry.boundingBox.expandByScalar(RIVER_SURFACE.maximumWaveHeight);
  geometry.boundingSphere.radius+=RIVER_SURFACE.maximumWaveHeight;

  // A conservative mask clips all effect fragments on dry ground/roads. Only
  // cells with wet corners and a wet center participate; use nearest sampling.
  const n=RIVER_SURFACE.coverageResolution,mask=new Uint8Array(n*n),corners=new Uint8Array((n+1)*(n+1));
  for(let z=0;z<=n;z++)for(let x=0;x<=n;x++)corners[z*(n+1)+x]=Number(depthAt(bounds.min.x+x*size.x/n,bounds.min.z+z*size.z/n)>.1);
  for(let z=0;z<n;z++)for(let x=0;x<n;x++){
    const a=z*(n+1)+x;
    if(corners[a]&&corners[a+1]&&corners[a+n+1]&&corners[a+n+2]&&depthAt(bounds.min.x+(x+.5)*size.x/n,bounds.min.z+(z+.5)*size.z/n)>.1)mask[z*n+x]=255;
  }
  const coverage=new THREE.DataTexture(mask,n,n,THREE.RedFormat);
  coverage.name='Desert water effects coverage';coverage.flipY=false;coverage.generateMipmaps=false;
  coverage.minFilter=coverage.magFilter=THREE.NearestFilter;coverage.needsUpdate=true;
  return {geometry,coverage,bounds,waterLevel,isWet,shoreWeight,depthAt,heightAt,
    triangles:indices.length/3,coverageInfo:{minXZ:[bounds.min.x,bounds.min.z],sizeXZ:[size.x,size.z]},
    dispose(){coverage.dispose();},
  };
}
