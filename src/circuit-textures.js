import * as THREE from 'three';
import {citySurface,cityTextureProfiles,paintCityTile} from './biggas-city-textures.js';

// Small, seamless, deterministic material tiles. UVs are measured in metres so
// merged scenery keeps the same grain scale across walls, ramps and cliff faces.
export function circuitSurface(name=''){
  if(/road|asphalt|asfalto|grid/i.test(name))return 'asphalt';
  if(/bark|wood/i.test(name))return 'bark';
  if(/grass|pasto|césped|vegetacion terreno/i.test(name))return 'grass';
  if(/pine|fern|foliage|leaf|vegetacion/i.test(name))return 'foliage';
  if(/moss|soil/i.test(name))return 'moss';
  if(/foam|espuma/i.test(name))return 'foam';
  if(/water|fall|océano|agua/i.test(name))return 'water';
  if(/rock|island|stone|basalto/i.test(name))return 'rock';
  if(/brick/i.test(name))return 'brick';
  if(/glazing|glass/i.test(name))return 'glass';
  if(/flag|bandera|cloth|awning/i.test(name))return 'fabric';
  if(/kerb|marking|paint|cone/i.test(name))return 'paint';
  if(/graphite|mechanism|metal|signage|farola|light|lens|steel|copper|cyan|amber/i.test(name))return 'metal';
  return 'concrete';
}
const profiles={brick:[3,.035,.92],asphalt:[4,.035,.97],concrete:[6,.065,.93],rock:[8,.13,.96],bark:[2,.09,.95],foliage:[1.4,.025,.94],grass:[4,.045,1],moss:[2.5,.055,1],water:[9,.045,.38],foam:[2,.015,.85],glass:[5,.005,.25],fabric:[1,.018,.95],paint:[2,.018,.8],metal:[2,.016,.58]};
const fract=x=>x-Math.floor(x),mix=(a,b,t)=>a+(b-a)*t;
const hash=(x,y)=>fract(Math.sin(x*127.1+y*311.7)*43758.5453);
function noise(u,v,n){const x=u*n,y=v*n,ix=Math.floor(x),iy=Math.floor(y),a=fract(x),b=fract(y),s=a*a*(3-2*a),t=b*b*(3-2*b),h=(i,j)=>hash((i+n)%n,(j+n)%n);return mix(mix(h(ix,iy),h(ix+1,iy),s),mix(h(ix,iy+1),h(ix+1,iy+1),s),t);}
// Broken cell edges form irregular, branching asphalt fissures rather than stripes.
function crackDistance(u,v){
  const cells=3,x=fract(u)*cells,y=fract(v)*cells,ix=Math.floor(x),iy=Math.floor(y);let first=Infinity,second=Infinity;
  for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){
    const cx=ix+a,cy=iy+b,hx=(cx+cells)%cells,hy=(cy+cells)%cells;
    const dx=cx+.15+hash(hx,hy)*.7-x,dy=cy+.15+hash(hx+19,hy+7)*.7-y,d=dx*dx+dy*dy;
    if(d<first){second=first;first=d;}else if(d<second)second=d;
  }
  return second-first;
}
export function createCircuitTextures({anisotropy=4,size=256,style='default'}={}){
  const cache=new Map(),city=style==='biggas-city',surfaceProfiles=city?{...profiles,...cityTextureProfiles}:profiles;
  function texture(data,label){const t=new THREE.DataTexture(data,size,size);t.name=`${city?'Biggas City':'Ruinas'} · ${label}`;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=anisotropy;t.needsUpdate=true;return t;}
  function tile(kind){
    if(cache.has(kind))return cache.get(kind);
    if(city&&cityTextureProfiles[kind]){
      const data=paintCityTile(kind,size),surface=texture(data.surface,`${kind} · relieve/rugosidad`);
      const maps={map:texture(data.color,`${kind} · color`),bumpMap:surface,roughnessMap:surface};cache.set(kind,maps);return maps;
    }
    const color=new Uint8Array(size*size*4),height=new Uint8Array(size*size*4),rough=new Uint8Array(size*size*4);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const u=x/size,v=y/size,n=noise(u,v,8),fine=noise(u,v,64),grain=hash(x,y),tau=Math.PI*2;
      let h=.5,value=.86;
      if(kind==='asphalt'){const crack=crackDistance(u+n*.025,v+n*.025)<.018&&fine<.67?1:0;h=.32+grain*.4-crack*.15;value=.73+grain*.24-crack*.15;}
      if(kind==='concrete'){const seam=fract(v*3)<.012||fract(u*2+(Math.floor(v*3)%2)*.5)<.01;h=seam?.1:.42+n*.22+fine*.09;value=seam?.48:.69+n*.25+(grain-.5)*.07;}
      if(kind==='rock'){const strata=Math.sin(tau*(v*9+n*.5));const crack=Math.abs(Math.sin(tau*(u*3+noise(u,v,4)*.6)))<.07;h=.25+n*.5+strata*.07-(crack?.2:0);value=.62+n*.3+strata*.07-(crack?.15:0);}
      if(kind==='brick'){const seam=fract(v*9)<.06||fract(u*5+(Math.floor(v*9)%2)*.5)<.035;h=seam?.15:.6+n*.12;value=seam?.48:.7+n*.23;}
      if(kind==='bark'){const grooves=Math.pow(Math.abs(Math.sin(tau*(u*12+noise(u,v,8)*.35))),.5);h=grooves*.65+n*.25;value=.5+grooves*.39+grain*.08;}
      if(kind==='foliage'){const needles=Math.pow(Math.abs(Math.sin(tau*(u*17+v*11))),10);h=.35+n*.35+needles*.15;value=.62+n*.28+needles*.12;}
      if(kind==='moss'){h=.2+n*.45+fine*.3;value=.55+n*.28+fine*.19;}
      if(kind==='grass'){h=.3+n*.18+fine*.25;value=.68+n*.14+fine*.13;}
      if(kind==='water'||kind==='foam'){const ripple=Math.sin(tau*(u*4+v*7+noise(u,v,4)*.55));h=.5+ripple*.22;value=kind==='foam'?.74+fine*.26:.72+ripple*.12+n*.12;}
      if(kind==='glass'){const streak=Math.pow(Math.abs(Math.sin(tau*(u*23+v))),20);h=.5;value=.91+streak*.07;}
      if(kind==='fabric'){const weave=((x%4<2)===(y%4<2))?1:0;h=.4+weave*.18;value=.78+weave*.11+n*.08;}
      if(kind==='paint'){const chip=grain>.93&&fine>.55;h=chip?.2:.65;value=chip?.42:.87+n*.1;}
      if(kind==='metal'){const seam=fract(u*2)<.012||fract(v*2)<.012,bolt=Math.hypot(fract(u*2)-.06,fract(v*2)-.06)<.018;h=seam?.15:bolt?.85:.5;value=seam?.48:bolt?.99:.79+noise(u,v,32)*.12;}
      const i=(y*size+x)*4,r=Math.round(THREE.MathUtils.clamp(value,0,1)*255),b=Math.round(THREE.MathUtils.clamp(h,0,1)*255);
      color.set([r,r,r,255],i);height.set([b,b,b,255],i);const roughness=Math.round((.78+fine*.22)*255);rough.set([roughness,roughness,roughness,255],i);
    }
    if(kind==='grass'){
      // Short, tapered, randomly oriented blades, with wrapped strokes at the
      // tile edges. No regular stripes or leaf pattern on the ground.
      for(let blade=0;blade<2300;blade++){
        const x=hash(blade,1)*size,y=hash(blade,2)*size,angle=hash(blade,3)*Math.PI*2,length=(.016+hash(blade,4)*.042)*size,dry=hash(blade,5)>.86;
        for(let step=0;step<=Math.ceil(length*2);step++){
          const t=step/Math.ceil(length*2),bend=Math.sin(t*Math.PI)*length*.18;
          const px=Math.round(x+Math.cos(angle)*length*t-Math.sin(angle)*bend),py=Math.round(y+Math.sin(angle)*length*t+Math.cos(angle)*bend),i=(((py%size+size)%size)*size+(px%size+size)%size)*4;
          const light=.68+hash(blade,6)*.2+t*.1;
          color.set([Math.round(light*255*(dry?1:.86)),Math.round(light*255),Math.round(light*255*(dry?.7:.73)),255],i);
          const h=Math.round((.48+t*.25)*255);height.set([h,h,h,255],i);
        }
      }
    }
    const maps={map:texture(color,`${kind} · color`),bumpMap:texture(height,`${kind} · relieve`),roughnessMap:texture(rough,`${kind} · rugosidad`)};cache.set(kind,maps);return maps;
  }
  function apply(mesh){
    if(!mesh.isMesh||Array.isArray(mesh.material)||mesh.material.transparent||(mesh.material.userData.circuitUntextured&&!(city&&mesh.material.userData.cityTextured)))return;
    const material=mesh.material,kind=material.userData.circuitSurface??(city?(material.userData.cityTextured??citySurface(material.name||mesh.name)):circuitSurface(material.name||mesh.name)),profile=surfaceProfiles[kind];
    if(material.map&&!material.userData.circuitSurface)return; // Preserve any authored textures.
    if(!material.userData.circuitSurface){
      const maps=tile(kind);material.map=maps.map;
      if(!material.isMeshBasicMaterial){material.bumpMap=maps.bumpMap;material.bumpScale=profile[1];material.roughnessMap=maps.roughnessMap;material.roughness=profile[2];}
      material.userData.circuitSurface=kind;material.needsUpdate=true;
    }
    const geometry=mesh.geometry;if(geometry.userData.circuitUV)return;
    const p=geometry.attributes.position,n=geometry.attributes.normal,uv=new Float32Array(p.count*2),scale=1/profile[0];
    for(let i=0;i<p.count;i++){
      // Non-indexed imported faces share one projection axis per triangle.
      const j=geometry.index?i:Math.floor(i/3)*3,flatGrass=kind==='grass'&&(!city||Math.abs(n?.getY(j)??1)>=.55);
      const nx=flatGrass?0:Math.abs(n?.getX(j)??0),ny=flatGrass?1:Math.abs(n?.getY(j)??1),nz=flatGrass?0:Math.abs(n?.getZ(j)??0);
      uv[i*2]=(nx>ny&&nx>nz?p.getZ(i):p.getX(i))*scale;uv[i*2+1]=(ny>=nx&&ny>=nz?p.getZ(i):p.getY(i))*scale;
    }
    geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));geometry.userData.circuitUV=true;
  }
  return {apply,applyRoot(root){root.traverse(apply);},get count(){return cache.size;},dispose(){for(const maps of cache.values())for(const texture of new Set(Object.values(maps)))texture.dispose();cache.clear();}};
}
