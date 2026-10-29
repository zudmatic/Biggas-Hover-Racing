import * as THREE from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';

const tau=Math.PI*2,clamp=THREE.MathUtils.clamp;
const curtainWave=(x,y,t,edge)=>(Math.sin(y*.62+t*8+x*.45)*.2+Math.sin(y*1.37+t*15-x*.8)*.075)*edge;

// Reconstruct cross-sections from the authored vertices. This keeps flowing
// highlights on the curved waterfall and follows the river through its bends.
function sections(base){
  const rows=new Map();
  for(let i=0;i<base.length;i+=3){
    const [x,y,z]=base.subarray(i,i+3),key=y.toFixed(3);
    if(!rows.has(key))rows.set(key,new Map());rows.get(key).set(`${x},${z}`,{x,y,z});
  }
  const result=[...rows.values()].map(points=>{
    const row=[...points.values()].sort((a,b)=>a.x-b.x),center=new THREE.Vector3();
    for(const p of row)center.add(new THREE.Vector3(p.x,p.y,p.z));center.divideScalar(row.length);
    return {points:row,center,distance:0};
  }).sort((a,b)=>b.center.y-a.center.y);
  for(let i=1;i<result.length;i++)result[i].distance=result[i-1].distance+result[i].center.distanceTo(result[i-1].center);
  return result;
}
function across(row,u){
  const p=row.points,x=THREE.MathUtils.lerp(p[0].x,p.at(-1).x,u);
  let i=1;while(i<p.length-1&&p[i].x<x)i++;
  const a=p[Math.max(0,i-1)],b=p[Math.min(i,p.length-1)],f=clamp((x-a.x)/Math.max(.0001,b.x-a.x),0,1);
  return {x,y:a.y,z:THREE.MathUtils.lerp(a.z,b.z,f)};
}
function onCurtain(rows,u,life){
  const y=THREE.MathUtils.lerp(rows[0].center.y,rows.at(-1).center.y,life);
  let i=1;while(i<rows.length-1&&rows[i].center.y>y)i++;
  const a=across(rows[i-1],u),b=across(rows[i],u),f=clamp((a.y-y)/Math.max(.0001,a.y-b.y),0,1);
  return {x:THREE.MathUtils.lerp(a.x,b.x,f),y,z:THREE.MathUtils.lerp(a.z,b.z,f)};
}
// Periodic value noise: the moving maps wrap without visible seams. Multiple
// scales break up the old evenly spaced stripes without per-frame noise work.
function noise(u,v,nx,ny){
  const x=u*nx,y=v*ny,ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
  const hash=(a,b)=>{const h=Math.sin(((a%nx+nx)%nx)*127.1+((b%ny+ny)%ny)*311.7)*43758.5453;return h-Math.floor(h);};
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix,iy),hash(ix+1,iy),sx),THREE.MathUtils.lerp(hash(ix,iy+1),hash(ix+1,iy+1),sx),sy);
}
function flowTexture(fall,mode='color',size=256){
  const data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size,v=y/size,warp=noise(u,v,4,4)-.5;
    const broad=noise(u+warp*.1,v,fall?22:8,fall?3:10),fine=noise(u+warp*.04,v,fall?53:24,fall?7:28),detail=noise(u,v,97,43);
    const crest=THREE.MathUtils.smoothstep(broad*.6+fine*.4,.48,.79),foam=crest*(.35+.65*noise(u,v,9,13));
    const value=mode==='bump'?.2+broad*.5+fine*.23+detail*.07:mode==='foam'?foam:mode==='alpha'?.48+crest*.52:.52+broad*.17+foam*.31;
    const c=Math.round(clamp(value,0,1)*255);data.set([c,c,c,255],(y*size+x)*4);
  }
  const texture=new THREE.DataTexture(data,size,size);texture.name=(fall?'Flujo vertical de cascada':'Corriente del río')+' · '+mode;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;return texture;
}
function impactTexture(){
  const size=128,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=(x+.5)/size,v=(y+.5)/size,r=Math.hypot(u*2-1,v*2-1),n=noise(u,v,12,12),edge=1-THREE.MathUtils.smoothstep(r,.35,.98);
    const alpha=edge*THREE.MathUtils.smoothstep(n*.7+noise(u,v,31,31)*.3,.23,.69);
    data.set([237,248,244,Math.round(alpha*255)],(y*size+x)*4);
  }
  const texture=new THREE.DataTexture(data,size,size);texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;return texture;
}
function mistTexture(){
  const size=32,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const r=Math.hypot((x+.5)/size*2-1,(y+.5)/size*2-1),alpha=Math.pow(Math.max(0,1-r*r),3);
    data.set([255,255,255,Math.round(alpha*255)],(y*size+x)*4);
  }
  const texture=new THREE.DataTexture(data,size,size);texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;return texture;
}

export function createBiggasWater(group,waters,{mobile=false,random=Math.random}={}){
  const size=mobile?128:256,textures=[flowTexture(true,'color',size),flowTexture(true,'bump',size),flowTexture(false,'color',size),flowTexture(false,'bump',size),mistTexture(),flowTexture(true,'alpha',size),flowTexture(true,'foam',size),impactTexture()];
  const flows=waters.map(w=>{
    const {mesh,fall,foam,base,box}=w,rows=sections(base),uv=mesh.geometry.attributes.uv;
    // UV animation is shared by normal and comic materials; it needs no custom
    // shader patch and does not change the textures of any other scenery.
    mesh.material=mesh.material.clone();mesh.material.transparent=true;mesh.material.depthWrite=false;
    mesh.material.metalness=0;mesh.material.flatShading=false;
    if(!foam){
      mesh.material.map=textures[fall?0:2];mesh.material.bumpMap=textures[fall?1:3];
      mesh.material.bumpScale=fall?.32:.2;mesh.material.roughness=fall?.26:.14;
      mesh.material.color.set(0xffffff);mesh.material.opacity=fall?.88:.91;
      mesh.material.alphaMap=fall?textures[5]:null;
    }else{
      mesh.material.color.set(0xe3f2ee);mesh.material.map=null;mesh.material.alphaMap=textures[6];
      mesh.material.opacity=fall?.64:.72;mesh.material.roughness=.65;
    }
    mesh.renderOrder=foam?3:1;
    const channel=!fall&&!foam&&box.max.y-box.min.y>.5;
    for(let i=0;i<uv.count;i++){
      const x=base[i*3],y=base[i*3+1],z=base[i*3+2];
      if(fall)uv.setXY(i,(x-box.min.x)/6,(box.max.y-y)/8);
      else if(channel){
        const row=rows.reduce((a,b)=>Math.abs(a.center.y-y)<Math.abs(b.center.y-y)?a:b),a=row.points[0],b=row.points.at(-1),dx=b.x-a.x,dz=b.z-a.z;
        uv.setXY(i,((x-a.x)*dx+(z-a.z)*dz)/Math.max(.001,dx*dx+dz*dz)*3,row.distance/10);
      }else uv.setXY(i,x/10,z/10);
    }
    if(!foam){
      const colors=new Float32Array(mesh.geometry.attributes.position.count*3),color=new THREE.Color(),deep=new THREE.Color(0x21636d),shallow=new THREE.Color(0x72a89d),white=new THREE.Color(0xc6dedc);
      for(let i=0;i<uv.count;i++){
        if(fall){const progress=clamp((box.max.y-base[i*3+1])/Math.max(1,box.max.y-box.min.y),0,1);color.set(0x82b3bd).lerp(white,.18+THREE.MathUtils.smoothstep(progress,.6,1)*.65);}
        else{const bank=channel?Math.abs(uv.getX(i)/3-.5)*2:.35+.2*Math.sin(base[i*3]*.035+base[i*3+2]*.04);color.copy(deep).lerp(shallow,clamp(bank*.7,0,1));}
        color.toArray(colors,i*3);
      }
      mesh.geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));mesh.material.vertexColors=true;
    }
    uv.needsUpdate=true;
    if(!foam){
      // Shared vertices let moving waves produce continuous normals instead of
      // lighting each exported triangle as a separate glass pane.
      mesh.geometry.deleteAttribute('normal');const indexed=mergeVertices(mesh.geometry,1e-4);
      mesh.geometry.copy(indexed);indexed.dispose();mesh.geometry.computeVertexNormals();
    }
    return {...w,rows,channel,base:mesh.geometry.attributes.position.array.slice(),baseUV:mesh.geometry.attributes.uv.array.slice()};
  });
  const falls=flows.filter(w=>w.fall&&!w.foam&&w.box.max.y-w.box.min.y>8);
  const transform=new THREE.Object3D();
  const streamSeeds=falls.flatMap(fall=>Array.from({length:mobile?24:50},()=>({fall,u:.02+random()*.96,phase:random(),speed:.3+random()*.18,width:.18+random()*.4})));
  const streams=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({name:'Espuma descendente',color:0xe0f5f0,map:textures[4],transparent:true,opacity:.42,depthWrite:false,side:THREE.DoubleSide}),streamSeeds.length);
  streams.name='Corrientes de cascada';streams.frustumCulled=false;streams.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(streams);
  const sprayCount=falls.length*(mobile?28:65),sprayPositions=new Float32Array(sprayCount*3),sprayGeometry=new THREE.BufferGeometry();
  sprayGeometry.setAttribute('position',new THREE.BufferAttribute(sprayPositions,3).setUsage(THREE.DynamicDrawUsage));
  const spray=new THREE.Points(sprayGeometry,new THREE.PointsMaterial({name:'Bruma suave',map:textures[4],color:0xe0f5f0,size:3.8,transparent:true,opacity:.2,depthWrite:false}));
  spray.name='Bruma de cascada';spray.frustumCulled=false;group.add(spray);
  const spraySeeds=Array.from({length:sprayCount},(_,i)=>({fall:falls[i%falls.length],u:random(),phase:random(),speed:.22+random()*.12,drift:random()-.5}));
  const impactSeeds=falls.flatMap(fall=>Array.from({length:mobile?12:24},(_,i)=>({fall,u:(i+.5)/(mobile?12:24),phase:random(),size:3+random()*4})));
  const impact=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({name:'Espuma turbulenta del impacto',map:textures[7],color:0xffffff,transparent:true,opacity:.62,depthWrite:false,side:THREE.DoubleSide}),impactSeeds.length);
  impact.name='Espuma turbulenta al pie de cascada';impact.renderOrder=4;impact.frustumCulled=false;impact.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(impact);
  const ripples=[];
  for(const fall of falls)for(let i=0;i<5;i++){
    const ring=new THREE.Mesh(new THREE.RingGeometry(.78,1,40).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0xc8eee7,map:textures[7],transparent:true,opacity:.16,depthWrite:false,side:THREE.DoubleSide}));
    const p=onCurtain(fall.rows,.5,1);ring.position.set(p.x,p.y+.13,p.z+2);ring.name='Ondas al pie de cascada';group.add(ring);ripples.push(ring);
  }
  const view=new THREE.Frustum(),projection=new THREE.Matrix4(),effectBox=new THREE.Box3();
  for(const flow of flows){flow.bounds=flow.box.getBoundingSphere(new THREE.Sphere());flow.bounds.radius+=.5;flow.lastTick=-1;}
  for(const fall of falls)effectBox.union(fall.box);effectBox.expandByScalar(15);
  let effectTick=-1;
  function update(time,reduced,phase,camera){
    if(camera){camera.updateMatrixWorld();projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);view.setFromProjectionMatrix(projection,camera.coordinateSystem,camera.reversedDepth);}
    const effectsVisible=!camera||view.intersectsBox(effectBox);
    streams.visible=spray.visible=impact.visible=!reduced&&effectsVisible;for(const ring of ripples)ring.visible=!reduced&&effectsVisible;
    const t=reduced?0:time,tick=Math.floor(t*30);if(phase==='paused')return;
    for(const flow of flows){
      // Animation is a function of absolute game time, so hidden water catches
      // up immediately on re-entry without simulating or uploading missed frames.
      if(flow.lastTick===tick||(camera&&!view.intersectsSphere(flow.bounds)))continue;
      flow.lastTick=tick;
      const {mesh,fall,foam,channel,base,box,baseUV}=flow;
      const {position,uv}=mesh.geometry.attributes,height=box.max.y-box.min.y;
      for(let i=0;i<position.count;i++){
        const x=base[i*3],y=base[i*3+1],z=base[i*3+2];
        if(fall){
          const edge=Math.sin(Math.PI*clamp((y-box.min.y)/Math.max(1,height),0,1));
          position.setZ(i,z+curtainWave(x,y,t,edge));
        }else{
          const bank=channel?.2+.8*Math.sin(Math.PI*clamp(baseUV[i*2]/3,0,1)):1;
          const wave=Math.sin(x*.25+z*.32-t*2.5)*.095+Math.sin(x*.51-z*.18-t*3.7)*.045;
          position.setY(i,y+wave*(foam?.6:1)*bank);
        }
        uv.setXY(i,baseUV[i*2]+(fall?Math.sin(t*.7)*.025:channel?0:t*.025),baseUV[i*2+1]-t*(fall?1.3:channel?.4:.12));
      }
      position.needsUpdate=true;uv.needsUpdate=true;mesh.geometry.computeVertexNormals();
    }
    if(!effectsVisible||tick===effectTick)return;effectTick=tick;
    streamSeeds.forEach(({fall,u,phase,speed,width},i)=>{
      const cycle=(phase+t*speed)%1,life=cycle*.35+cycle*cycle*.65,p=onCurtain(fall.rows,u,life),edge=Math.sin(Math.PI*life);
      transform.position.set(p.x,p.y,p.z+.14+curtainWave(p.x,p.y,t,edge));
      transform.rotation.set(-.15,0,0);transform.scale.set(width,Math.min(1,edge*5)*(1.4+life*4),1);transform.updateMatrix();streams.setMatrixAt(i,transform.matrix);
    });streams.instanceMatrix.needsUpdate=true;
    impactSeeds.forEach(({fall,u,phase,size},i)=>{
      const life=(phase+t*.27)%1,p=onCurtain(fall.rows,u,1),fade=Math.sin(life*Math.PI);
      transform.position.set(p.x+Math.sin(phase*tau+life*2)*1.2,p.y+.18,p.z+.6+life*7);
      transform.rotation.set(0,phase*tau+t*.06,0);transform.scale.set(size*(.7+life)*fade,1,size*(.4+life*.8)*fade);transform.updateMatrix();impact.setMatrixAt(i,transform.matrix);
    });impact.instanceMatrix.needsUpdate=true;
    spraySeeds.forEach(({fall,u,phase,speed,drift},i)=>{
      const life=(phase+t*speed)%1,p=onCurtain(fall.rows,u,1),lift=Math.sin(life*Math.PI);
      sprayPositions[i*3]=p.x+drift*life*9;sprayPositions[i*3+1]=p.y+.25+lift*(2.5+u*3.5);sprayPositions[i*3+2]=p.z+life*8;
    });sprayGeometry.attributes.position.needsUpdate=true;
    ripples.forEach((ring,i)=>{const life=(i/5+t*.3)%1;ring.scale.set(2+life*12,1,1+life*7);ring.material.opacity=Math.sin(life*Math.PI)*(1-life)*.16;});
  }
  return {update,spray,streams,impact,detailCount:sprayCount+streamSeeds.length+impactSeeds.length+ripples.length,dispose(){textures.forEach(texture=>texture.dispose());}};
}
