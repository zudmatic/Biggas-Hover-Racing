import * as THREE from 'three';

// One visual scale for the room and the enlarged model in the lab. Values are
// in room units; the lab keeps the character's authored size for inspection.
export const CHARACTER_SURFACE_SCALE=.44;
export const SURFACE_REFERENCE=Object.freeze({repeat:3,bump:.1});
const family=(label,density,contrast,bump,mottle,facets)=>Object.freeze({label,density,contrast,bump,mottle,facets});
export const SURFACE_FAMILIES=Object.freeze({
  skin:family('Piel mate',3.6,.045,.0025,0,.10),
  fabric:family('Tejido suave',6,.10,.002,.015,.12),
  wood:family('Madera',1.6,.14,.018,.02,.14),
  plaster:family('Yeso',2.8,.065,.005,.02,.10),
  metal:family('Metal satinado',3,.035,.0015,0,.06),
});
// Keep the approved warm palette in one place. Textures are neutral and never
// bake a second tint into these dyes.
export const ROOM_SURFACE_COLORS=Object.freeze({
  plaster:0xf0dcb9,plasterTop:0xfaf6f0,wood:0xc0834f,woodDark:0x9a6238,
  planks:Object.freeze([0xbf8350,0xb07446,0xc98f5a,0xa56a3e]),
  blanket:0x565d86,linen:0xf4f1ec,rug:0x1f1d22,blind:0xc9b391,steel:0xa5a0b5,
});

const SIZE=128,TAU=Math.PI*2;
const hash=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const fade=x=>x*x*(3-2*x);
// Periodic bilinear noise: all presets tile seamlessly, including their height
// maps. Fixed seeds make the room and lab deterministic across reloads.
function noise(u,v,cells=16) {
  const x=u*cells,y=v*cells,ix=Math.floor(x),iy=Math.floor(y),fx=fade(x-ix),fy=fade(y-iy);
  const at=(dx,dy)=>hash((ix+dx)%cells,(iy+dy)%cells);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(at(0,0),at(1,0),fx),THREE.MathUtils.lerp(at(0,1),at(1,1),fx),fy);
}
function height(kind,u,v) {
  if(kind==='fabric') {
    // Four repeating V-shaped stitches per tile, softened for the small room.
    const x=(u*4)%1,y=(v*4)%1;
    const stitch=Math.cos(TAU*(y-Math.abs(x-.5)*1.15));
    return .5+.38*stitch+.06*(noise(u,v,32)-.5);
  }
  if(kind==='wood')return .5+.30*Math.sin(TAU*(v*8+.24*Math.sin(TAU*u)+.12*Math.sin(TAU*u*3)))+.12*(noise(u,v,32)-.5);
  if(kind==='metal')return .5+.15*Math.sin(TAU*v*32)+.02*Math.sin(TAU*u*2)*Math.sin(TAU*v*16);
  return .15+.7*noise(u,v,kind==='skin'?48:24);
}
export function createSurfaceTexture(kind,{heightMap=false}={}) {
  const preset=SURFACE_FAMILIES[kind];if(!preset)throw new Error(`Unknown surface family: ${kind}`);
  const pixels=new Uint8Array(SIZE*SIZE*4);
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++) {
    const value=THREE.MathUtils.clamp(height(kind,x/SIZE,y/SIZE),0,1);
    const gray=Math.round(255*(heightMap?value:1-preset.contrast*(1-value))),i=(y*SIZE+x)*4;
    pixels[i]=pixels[i+1]=pixels[i+2]=gray;pixels[i+3]=255;
  }
  const texture=new THREE.DataTexture(pixels,SIZE,SIZE);
  texture.name=`${preset.label} · ${heightMap?'relieve':'color'}`;
  texture.colorSpace=heightMap?THREE.NoColorSpace:THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.setScalar(preset.density);
  texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
  texture.anisotropy=8;texture.needsUpdate=true;texture.userData.surfaceFamily=kind;
  return texture;
}

// Box-like room surfaces use physical coordinates instead of stretching one
// tile over every object. Logos and photographic maps keep their authored UVs.
export function setRoomSurfaceUV(geometry,scale=new THREE.Vector3(1,1,1)) {
  const p=geometry.attributes.position,n=geometry.attributes.normal,uv=new Float32Array(p.count*2);
  for(let i=0;i<p.count;i++) {
    const x=Math.abs(n.getX(i)),y=Math.abs(n.getY(i)),z=Math.abs(n.getZ(i));
    const a=y>=x&&y>=z?p.getX(i)*scale.x:x>=z?p.getZ(i)*scale.z:p.getX(i)*scale.x;
    const b=y>=x&&y>=z?p.getZ(i)*scale.z:p.getY(i)*scale.y;
    uv[i*2]=a;uv[i*2+1]=b;
  }
  const current=geometry.getAttribute('uv');
  if(current&&current.array.length===uv.length){current.array.set(uv);current.needsUpdate=true;}
  else geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  return geometry;
}
