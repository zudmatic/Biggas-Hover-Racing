import * as THREE from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {createSurfaceIndex} from './circuit-collision.js';

const clamp=THREE.MathUtils.clamp,fract=x=>x-Math.floor(x),hash=(x,z)=>fract(Math.sin(x*127.1+z*311.7)*43758.5453);
function patch(x,z){
  const ix=Math.floor(x),iz=Math.floor(z),u=fract(x),v=fract(z),a=u*u*(3-2*u),b=v*v*(3-2*v);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix,iz),hash(ix+1,iz),a),THREE.MathUtils.lerp(hash(ix,iz+1),hash(ix+1,iz+1),a),b);
}

// Weld the exported flat faces before refining the hillside. Shared edge
// midpoints keep the surface watertight; bounded Hermite heights round the
// silhouette while retaining every authored vertex and all scenery anchors.
export function refineBiggasTerrain(source){
  const positionsOnly=new THREE.BufferGeometry();positionsOnly.setAttribute('position',source.attributes.position.clone());if(source.index)positionsOnly.setIndex(source.index.clone());
  const welded=mergeVertices(positionsOnly,.0001);positionsOnly.dispose();welded.computeVertexNormals();
  const p=welded.attributes.position,n=welded.attributes.normal,positions=Array.from(p.array),indices=[],edges=new Map();
  function midpoint(a,b){
    const key=a<b?`${a}:${b}`:`${b}:${a}`;if(edges.has(key))return edges.get(key);
    const dx=p.getX(b)-p.getX(a),dz=p.getZ(b)-p.getZ(a),slope=i=>n.getY(i)>.25?-(n.getX(i)*dx+n.getZ(i)*dz)/n.getY(i):0;
    const correction=clamp((slope(a)-slope(b))/8,-.4,.4),id=positions.length/3;
    positions.push((p.getX(a)+p.getX(b))/2,(p.getY(a)+p.getY(b))/2+correction,(p.getZ(a)+p.getZ(b))/2);edges.set(key,id);return id;
  }
  for(let i=0;i<welded.index.count;i+=3){
    const a=welded.index.getX(i),b=welded.index.getX(i+1),c=welded.index.getX(i+2),ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);
    indices.push(a,ab,ca,ab,b,bc,ca,bc,c,ab,bc,ca);
  }
  welded.dispose();const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const normals=geometry.attributes.normal,colors=[];
  for(let i=0;i<positions.length;i+=3){
    const x=positions[i],z=positions[i+2],variation=patch(x/34,z/34),dry=patch(x/73+8,z/73-5),slope=1-THREE.MathUtils.smoothstep(normals.getY(i/3),.45,.85);
    colors.push(.78+variation*.2+dry*.1,.86+variation*.14-slope*.12,.72+variation*.18+slope*.15);
  }
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.userData.biggasTerrain=true;return geometry;
}

// Small opaque blade clusters live only along the natural sections. Baking
// them into spatial batches avoids alpha overdraw, shadows and per-frame work.
export function addBiggasGrass(root,landscape,{mobile=false}={}){
  const terrain=[];root.traverse(m=>{if(m.isMesh&&m.material?.name==='Vegetacion terreno')terrain.push(m);});
  if(!terrain.length)return {clumps:0,triangles:0,batches:0};
  const height=createSurfaceIndex(terrain),material=terrain[0].material,cells=new Map(),count=mobile?1000:2000;
  const trail=landscape.branches?.find(b=>b.id==='roots');
  let clumps=0;const dressing=new Map(),rock=new THREE.IcosahedronGeometry(1,0),rockP=rock.attributes.position;
  for(let i=0;i<count;i++){
    const cluster=Math.floor(i/20),seed=cluster+71,distance=landscape.woodland?hash(seed,10)*landscape.length:1100+hash(seed,10)*1730,road=trail&&cluster%3===0?trail.samples[Math.floor(hash(seed,10)*trail.samples.length)]:landscape.atDistance(distance),side=hash(seed,11)>.5?1:-1;
    const along=(hash(i,20)-.5)*8,offset=side*(road.width/2+5+hash(seed,12)**2*15)+(hash(i,21)-.5)*4;
    const x=road.x-road.nz*offset+road.nx*along,z=road.z+road.nx*offset+road.nz*along,y=height(x,z),nearest=landscape.roadAt(x,z);
    const main=(landscape.mainRoadAt??landscape.roadAt)(x,z);
    if(y===null||Math.abs(y-road.y)>9||nearest.distanceToRoad<nearest.width/2+2.3||main.distanceToRoad<main.width/2+2.3)continue;
    const hx=height(x+.5,z),hz=height(x,z+.5);if(hx===null||hz===null||Math.hypot(hx-y,hz-y)>.55)continue;
    const key=`${Math.floor(x/320)},${Math.floor(z/320)}`;if(!cells.has(key))cells.set(key,{positions:[],colors:[],uv:[]});const cell=cells.get(key);clumps++;
    if(!dressing.has(key))dressing.set(key,{positions:[],colors:[]});const detail=dressing.get(key);
    const triangle=(a,b,c,color)=>{detail.positions.push(...a,...b,...c);for(let j=0;j<3;j++)detail.colors.push(...color);};
    if(i%20===0){
      // Small irregular soil clearings follow the actual hill, not flat decals.
      const ring=[];for(let j=0;j<14;j++){const angle=j/14*Math.PI*2,r=1.4+hash(seed,j+80)*1.3,px=x+Math.cos(angle)*r,pz=z+Math.sin(angle)*r;ring.push([px,(height(px,pz)??y)+.018,pz]);}
      if(ring.every(v=>{const r=landscape.roadAt(v[0],v[2]);return r.distanceToRoad>r.width/2+1;}))for(let j=0;j<14;j++)triangle([x,y+.018,z],ring[(j+1)%14],ring[j],[.26,.19,.1]);
    }
    if(i%47===0){
      const r=.35+hash(i,82)*.5;for(let j=0;j<rockP.count;j+=3){const vertices=[];for(let k=0;k<3;k++)vertices.push([x+rockP.getX(j+k)*r,y-.12+rockP.getY(j+k)*r*.65,z+rockP.getZ(j+k)*r*.8]);triangle(...vertices,[.32,.34,.27]);}
    }
    if(i%23===0){
      for(let flower=0;flower<3;flower++){
        const fx=x+(flower-1)*.24,fz=z+Math.sin(flower*3)*.2,fy=height(fx,fz)??y,top=fy+.3+hash(i,flower)*.2;
        triangle([fx-.025,fy,fz],[fx+.025,fy,fz],[fx,top,fz],[.15,.26,.07]);
        for(let petal=0;petal<5;petal++){const a=petal*Math.PI*2/5,b=a+.8;triangle([fx,top,fz],[fx+Math.cos(b)*.12,top-.035,fz+Math.sin(b)*.12],[fx+Math.cos(a)*.12,top-.035,fz+Math.sin(a)*.12],i%2?[.72,.52,.13]:[.48,.24,.62]);}
      }
    }
    for(let blade=0;blade<6;blade++){
      const angle=hash(i,blade+30)*Math.PI*2,h=.18+hash(i,blade+40)*.4,w=.025+hash(i,blade+50)*.035,ox=x+Math.sin(angle)*.12,oz=z+Math.cos(angle)*.12,dx=Math.cos(angle),dz=-Math.sin(angle),lean=.12+hash(i,blade+60)*.22;
      const base=height(ox,oz)??y,left=[ox-dx*w,base-.025,oz-dz*w],right=[ox+dx*w,base-.025,oz+dz*w],ml=[ox-dx*w*.6-dz*lean*.4,base+h*.58,oz-dz*w*.6+dx*lean*.4],mr=[ox+dx*w*.6-dz*lean*.4,base+h*.58,oz+dz*w*.6+dx*lean*.4],tip=[ox-dz*lean,base+h,oz+dx*lean];
      for(const v of [left,right,ml,right,mr,ml,ml,mr,tip]){cell.positions.push(...v);const t=clamp((v[1]-base)/h,0,1);cell.colors.push(.73+t*.27,.8+t*.2,.55+t*.25);cell.uv.push(v[0]/4,v[2]/4);}
    }
  }
  // Share the grass shader and textures; double sided blades remain opaque.
  const bladeMaterial=material.clone();bladeMaterial.name='Pasto · matas';bladeMaterial.side=THREE.DoubleSide;
  for(const {positions,colors,uv} of cells.values()){
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();g.computeBoundingSphere();g.userData.circuitUV=true;
    const mesh=new THREE.Mesh(g,bladeMaterial);mesh.name='Pasto · borde natural';mesh.receiveShadow=true;root.add(mesh);
  }
  rock.dispose();const detailMaterial=new THREE.MeshStandardMaterial({name:'Soil clearings and wildflowers',vertexColors:true,roughness:1,side:THREE.DoubleSide});let detailTriangles=0;
  for(const {positions,colors} of dressing.values()){
    if(!positions.length)continue;const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();g.computeBoundingSphere();
    const mesh=new THREE.Mesh(g,detailMaterial);mesh.name='Manchones · tierra, flores y piedras';mesh.receiveShadow=true;root.add(mesh);detailTriangles+=positions.length/9;
  }
  if(!detailTriangles)detailMaterial.dispose();if(!cells.size)bladeMaterial.dispose();return {clumps,triangles:clumps*18,batches:cells.size,detailTriangles,patches:Math.ceil(count/20)};
}
