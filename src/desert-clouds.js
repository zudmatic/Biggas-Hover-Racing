import * as THREE from 'three';

// A seamless, reusable cloud strip on one open cylinder. No lights, shadow
// maps, volumetric raymarch or per-frame geometry updates.
export function createDesertClouds(){
  const width=1024,height=256,bytes=new Uint8Array(width*height*4);
  let seed=1729;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const lobes=[];
  for(let i=0;i<8;i++){
    const x=i/8*width+random()*38,y=80+random()*90,w=35+random()*30;
    for(let j=0;j<7;j++)lobes.push({x:x+(j-3)*w*.23,y:y-Math.sin(j/6*Math.PI)*32+random()*10,rx:w*(.23+random()*.12),ry:16+random()*22});
  }
  const lattice=Array.from({length:64*32},random);
  const noise=(x,y,scale)=>{
    x/=scale;y/=scale;const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
    const at=(a,b)=>lattice[((b%32+32)%32)*64+(a%64+64)%64];
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(at(ix,iy),at(ix+1,iy),sx),THREE.MathUtils.lerp(at(ix,iy+1),at(ix+1,iy+1),sx),sy);
  };
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    let density=0;
    for(const lobe of lobes){let dx=Math.abs(x-lobe.x);dx=Math.min(dx,width-dx);const r=(dx/lobe.rx)**2+((y-lobe.y)/lobe.ry)**2;if(r<3)density+=Math.exp(-r*2.2);}
    const detail=noise(x,y,16)*.65+noise(x,y,4)*.35;
    const a=THREE.MathUtils.smoothstep(density+detail*.25,.28,.78)*.88;
    const shade=THREE.MathUtils.clamp(.83+(128-y)*.0015+detail*.08,.76,1),i=((height-1-y)*width+x)*4;
    bytes[i]=Math.round(255*shade);bytes[i+1]=Math.round(252*shade);bytes[i+2]=Math.round(243*shade);bytes[i+3]=Math.round(a*255);
  }
  const texture=new THREE.DataTexture(bytes,width,height,THREE.RGBAFormat);
  texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=THREE.RepeatWrapping;texture.wrapT=THREE.ClampToEdgeWrapping;
  texture.repeat.x=2;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:THREE.BackSide,fog:false});
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(2200,2200,1200,64,1,true),material);
  mesh.name='Desert · tiled cloud horizon';mesh.renderOrder=-940;mesh.frustumCulled=false;
  const day=new THREE.Color(0xfff4df),night=new THREE.Color(0x526681);
  return {mesh,update(camera,time,blend,reduced){
    mesh.position.copy(camera.position);mesh.position.y+=700;
    texture.offset.x=reduced?0:time*.00035;material.color.copy(day).lerp(night,blend);
  },dispose(){texture.dispose();material.dispose();mesh.geometry.dispose();mesh.removeFromParent();}};
}
