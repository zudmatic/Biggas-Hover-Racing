import * as THREE from 'three';
import {retro} from '../../../render/materials/retro-material';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {SURFACE_FAMILIES,SURFACE_REFERENCE,CHARACTER_SURFACE_SCALE,createSurfaceTexture} from '../../../render/materials/surface-library';

// All edited surfaces own their buffers, including copies of the shared print
// mesh. Smoothing welds positions before creating UVs, avoiding a seam in normals.
export function editableGeometry(source,smooth,scale=new THREE.Vector3(1,1,1)) {
  let geometry=source.clone();
  for(const key of Object.keys(geometry.attributes))if(key!=='position')geometry.deleteAttribute(key);
  if(smooth){const welded=mergeVertices(geometry);geometry.dispose();geometry=welded;}
  geometry.computeVertexNormals();
  // Per-triangle UVs can cross the cylindrical wrap without stretching a whole
  // image across the seam. Normals remain those of the welded geometry.
  if(geometry.index){const unindexed=geometry.toNonIndexed();geometry.dispose();geometry=unindexed;}
  geometry.computeBoundingBox();
  const {min,max}=geometry.boundingBox,cx=(min.x+max.x)/2,cz=(min.z+max.z)/2;
  const positions=geometry.attributes.position,uv=new Float32Array(positions.count*2);
  for(let i=0;i<positions.count;i++){
    uv[i*2]=Math.atan2(positions.getX(i)-cx,positions.getZ(i)-cz)/(Math.PI*2)+.5;
    uv[i*2+1]=(positions.getY(i)-min.y)/Math.max(.001,max.y-min.y);
  }
  for(let i=0;i<positions.count;i+=3){
    const us=[uv[i*2],uv[(i+1)*2],uv[(i+2)*2]];
    if(Math.max(...us)-Math.min(...us)>.5)for(let j=0;j<3;j++)if(uv[(i+j)*2]<.5)uv[(i+j)*2]+=1;
  }
  geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  // Channel 0 preserves old exports and custom images. Channel 1 measures the
  // physical surface so a stitch keeps its size on crown, cuff and pompom.
  const rx=(max.x-min.x)*scale.x/2,rz=(max.z-min.z)*scale.z/2;
  const circumference=2*Math.PI*Math.sqrt((rx*rx+rz*rz)/2)*CHARACTER_SURFACE_SCALE;
  const height=(max.y-min.y)*scale.y*CHARACTER_SURFACE_SCALE,physical=uv.slice();
  for(let i=0;i<positions.count;i++){physical[i*2]*=circumference;physical[i*2+1]*=height;}
  geometry.setAttribute('uv1',new THREE.BufferAttribute(physical,2));
  return geometry;
}

export function patternTexture(kind) {
  if(SURFACE_FAMILIES[kind])return createSurfaceTexture(kind);
  if(kind==='noise') {
    const pixels=new Uint8Array(128*128*4);
    for(let i=0;i<pixels.length;i+=4){const n=Math.sin(i*12.9898)*43758.5453;const v=180+Math.floor((n-Math.floor(n))*75);pixels[i]=pixels[i+1]=pixels[i+2]=v;pixels[i+3]=255;}
    const texture=new THREE.DataTexture(pixels,128,128);
    texture.flipY=true;texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
    return texture;
  }
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,128,128);
  if(kind==='checker'){
    ctx.fillStyle='#777777';ctx.fillRect(0,0,64,64);ctx.fillRect(64,64,64,64);
  } else if(kind==='knit'){
    ctx.fillStyle='#bbbbbb';ctx.fillRect(0,0,128,128);ctx.lineCap='round';
    for(let y=-16;y<144;y+=16)for(let x=0;x<128;x+=16){
      ctx.strokeStyle='#888888';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(x+2,y);ctx.lineTo(x+8,y+12);ctx.lineTo(x+14,y);ctx.stroke();
      ctx.strokeStyle='#eeeeee';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+3,y);ctx.lineTo(x+8,y+9);ctx.lineTo(x+13,y);ctx.stroke();
    }
  }
  return new THREE.CanvasTexture(canvas);
}

// Shared by the published character and the lab: the same settings produce
// identical surface colors, UVs and texture response in either scene.
export function createCharacterMaterials(settings,{comic=false}={}) {
  return Object.fromEntries(['skin','hat','eye','pupil'].map(part=>{
    const eyes=part==='eye'||part==='pupil';
    const Material=eyes?THREE.MeshBasicMaterial:settings.material==='toon'?THREE.MeshToonMaterial:settings.material==='normal'?THREE.MeshNormalMaterial:THREE.MeshStandardMaterial;
    const material=comic&&!eyes?retro(settings[`${part}Color`],{mottle:.08,facetVariation:.1}):new Material(eyes?{side:THREE.DoubleSide}:{});
    // Keep the sclera's chosen color under the room's warm/cool lights and
    // in shadow. Its shape and pupil clipping still come from the 3D mesh.
    if(part==='eye'){material.toneMapped=false;material.userData.characterEyeSurface=true;}
    material.addEventListener('dispose',()=>disposeMaterialMaps(material));
    return [part,material];
  }));
}

function disposeMaterialMaps(material) {
  const owned=material.userData.characterMaps;
  if(owned){new Set([owned.map,owned.bumpMap]).forEach(texture=>texture?.dispose());delete material.userData.characterMaps;}
}

export function updateCharacterMaterials(materials,settings,maps) {
  for(const [part,material] of Object.entries(materials)) {
    if(material.color)material.color.set(settings[`${part}Color`]);
    if(part==='eye'||part==='pupil')continue;
    const texture=maps.get(settings[`${part}Texture`])??null;
    const family=texture?.userData.surfaceFamily,preset=SURFACE_FAMILIES[family];
    let owned=material.userData.characterMaps;
    const changed=material.flatShading!==(settings.shading==='flat')||owned?.source!==texture;
    if(owned?.source!==texture) {
      disposeMaterialMaps(material);
      const map=texture?.clone()??null,bumpMap=preset?createSurfaceTexture(family,{heightMap:true}):map;
      if(map)map.channel=preset?1:0;if(bumpMap)bumpMap.channel=preset?1:0;
      owned=material.userData.characterMaps={source:texture,map,bumpMap};
    }
    const repeat=preset?preset.density*settings.textureScale/SURFACE_REFERENCE.repeat:settings.textureScale;
    owned.map?.repeat.setScalar(repeat);owned.bumpMap?.repeat.setScalar(repeat);
    material.userData.surfaceFamily=family??null;
    material.flatShading=settings.shading==='flat';material.wireframe=settings.wireframe;
    if('map' in material)material.map=owned.map;
    if('roughness' in material){material.roughness=settings.roughness;material.metalness=settings.metalness;}
    if('bumpMap' in material){material.bumpMap=owned.bumpMap;material.bumpScale=preset?preset.bump*settings.bump/SURFACE_REFERENCE.bump:settings.bump;}
    if(changed)material.needsUpdate=true;
  }
}
