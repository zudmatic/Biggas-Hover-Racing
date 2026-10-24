import * as THREE from 'three';
import {createDetailInstances} from './detail-instances.js';

const randomFactory=()=>{let seed=34034;return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};};
export function createCircuitDetails(root,landscape,{mobile=false,city=false,islands=!city}={}){
  const random=randomFactory(),details=new THREE.Group();details.name='Circuito · ambiente vivo';root.add(details);
  const clay=new THREE.MeshStandardMaterial({color:0xba572e,roughness:.9}),ivory=new THREE.MeshStandardMaterial({color:0xe3dcc0,roughness:.85}),metal=new THREE.MeshStandardMaterial({color:0x314b47,roughness:.7}),green=new THREE.MeshStandardMaterial({color:0x6c874b,roughness:1}),ink=new THREE.MeshBasicMaterial({color:0x8ad8cc});
  clay.name='Paint · cones';ivory.name='Paint · ivory';metal.name='Metal';green.name='Foliage';ink.name='Light lens';
  const fabric=clay.clone(),fabricIvory=ivory.clone();fabric.name=fabricIvory.name='Cloth';
  const make=(geometry,material,parent=details)=>{const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;};
  const transforms=new THREE.Object3D(),flags=[],cones=[],drones=[],waves=[];
  const poles=createDetailInstances(details,new THREE.CylinderGeometry(.055,.085,4.7,6),metal,12,{name:'Postes de banderas'});
  const coneBases=createDetailInstances(details,new THREE.BoxGeometry(.48,.08,.48),metal,16,{name:'Bases de conos',dynamic:true});
  const coneBodies=createDetailInstances(details,new THREE.ConeGeometry(.2,.65,6),clay,16,{name:'Conos',dynamic:true});
  const coneStripes=createDetailInstances(details,new THREE.CylinderGeometry(.08,.12,.13,6),ivory,16,{name:'Franjas de conos',dynamic:true});
  const batches=[poles,coneBases,coneBodies,coneStripes];
  let detailCount=0,impactSerial=0,lastAnimation=-1;
  const registerWave=(mesh,amplitude)=>{waves.push({mesh,base:mesh.geometry.attributes.position.array.slice(),amplitude});mesh.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);};
  // Water retains the authored materials; moving vertices also work with the comic pass.
  root.children.filter(m=>m.isMesh&&/^ENV_water/.test(m.name)).forEach(m=>registerWave(m,.065));
  if(islands){const sea=make(new THREE.PlaneGeometry(6000,6000,mobile?40:70,mobile?40:70).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({color:0x145459,roughness:.48,metalness:.15,flatShading:true}));sea.name='Océano';sea.position.y=-6.2;sea.castShadow=false;registerWave(sea,.24);}
  function islandGeometry(radius,height){
    const positions=[],indices=[],levels=[0,.12,.34,.40,.65,.70,1],radii=[.92,1,.94,.77,.72,.5,.35],sides=9;
    const variation=Array.from({length:sides},()=>.8+random()*.35);
    levels.forEach((y,j)=>{for(let i=0;i<sides;i++){const a=i/sides*Math.PI*2,r=radius*radii[j]*variation[i];positions.push(Math.cos(a)*r+height*y*.12,y*height,Math.sin(a)*r*.7);}});
    for(let j=0;j<levels.length-1;j++)for(let i=0;i<sides;i++){const a=j*sides+i,b=j*sides+(i+1)%sides;indices.push(a,a+sides,b,b,a+sides,b+sides);}
    positions.push(height*.12,height,0);const top=positions.length/3-1;for(let i=0;i<sides;i++)indices.push(top,(levels.length-1)*sides+(i+1)%sides,(levels.length-1)*sides+i);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
  }
  for(let i=0;i<(islands?11:0);i++){
    const a=i/11*Math.PI*2,rad=340+random()*300,height=35+random()*85;
    const island=make(islandGeometry(45+random()*60,height),new THREE.MeshStandardMaterial({color:i%2?0x627568:0x4e6862,flatShading:true,roughness:1}));
    island.name='Island rock';island.position.set(Math.cos(a)*rad,-12,Math.sin(a)*rad);island.rotation.y=random()*6;detailCount++;
  }
  const lightGeometry=new THREE.BoxGeometry(.2,.13,.6),lights=new THREE.InstancedMesh(lightGeometry,ink,200);details.add(lights);
  for(let i=0;i<100;i++)for(let side=-1;side<=1;side+=2){const road=landscape.atDistance(i*landscape.length/100);transforms.position.set(road.x-road.nz*(road.width/2-.17)*side,road.y+.16,road.z+road.nx*(road.width/2-.17)*side);transforms.rotation.set(0,Math.atan2(road.nx,road.nz),0);transforms.scale.set(1,1,1);transforms.updateMatrix();lights.setMatrixAt(i*2+(side===1?1:0),transforms.matrix);}detailCount+=200;
  for(let i=0;i<12;i++){
    const road=landscape.atDistance(25+i*landscape.length/12),side=i%2?1:-1,group=new THREE.Group();group.position.set(road.x-road.nz*(road.width/2+.8)*side,road.y,road.z+road.nx*(road.width/2+.8)*side);group.rotation.y=Math.atan2(road.nx,road.nz);details.add(group);
    const pole=poles.add(group);pole.position.y=2.35;
    const cloth=make(new THREE.PlaneGeometry(2,1.05,8,3).translate(1,0,0),i%3===0?fabricIvory:fabric,group);cloth.name='Bandera';cloth.material.side=THREE.DoubleSide;cloth.position.y=3.95;cloth.castShadow=false;flags.push({mesh:cloth,base:cloth.geometry.attributes.position.array.slice(),phase:i*.6});
    detailCount+=2;
  }
  // Ferns and broken masonry are anchored to existing cliff surfaces, clear of the roadway.
  const terrain=root.children.filter(m=>m.isMesh&&/^ENV_/.test(m.name)&&/rock|moss|concrete/.test(m.name));
  const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0),locations=[];
  root.updateMatrixWorld(true);
  for(let i=0;i<(!islands?0:mobile?75:150);i++){
    const road=landscape.atDistance(random()*landscape.length),offset=(8+random()*12)*(random()>.5?1:-1),x=road.x-road.nz*offset,z=road.z+road.nx*offset;
    ray.set(new THREE.Vector3(x,90,z),down);const hit=ray.intersectObjects(terrain,false)[0];
    if(hit&&hit.point.y>0&&hit.point.y<road.y+7)locations.push(hit.point.clone());
  }
  const ferns=new THREE.InstancedMesh(new THREE.ConeGeometry(.25,1.1,4),green,locations.length*3);details.add(ferns);ferns.castShadow=true;
  locations.forEach((p,i)=>{for(let j=0;j<3;j++){transforms.position.set(p.x+(j-1)*.25,p.y+.4,p.z);transforms.rotation.set((random()-.5)*.4,random()*6,(j-1)*.5);transforms.scale.setScalar(.6+random()*.7);transforms.updateMatrix();ferns.setMatrixAt(i*3+j,transforms.matrix);}});detailCount+=locations.length*3;
  for(let i=0;i<16;i++){
    const road=landscape.atDistance(80+i*(landscape.length-100)/16),side=i%2?1:-1,group=new THREE.Group();group.position.set(road.x-road.nz*(road.width/2-.55)*side,road.y+.04,road.z+road.nx*(road.width/2-.55)*side);details.add(group);
    const base=coneBases.add(group);base.position.y=.04;
    const cone=coneBodies.add(group);cone.position.y=.39;
    const stripe=coneStripes.add(group);stripe.position.y=.45;
    group.name='Cono dinámico';cones.push({group,origin:group.position.clone(),velocity:new THREE.Vector3(),spin:0,age:0,active:false});detailCount+=3;
  }
  // Small maintenance drones patrol above the towers, safely outside the racing volume.
  for(let i=0;i<2;i++){
    const group=new THREE.Group();details.add(group);make(new THREE.BoxGeometry(1.3,.5,1.5),metal,group);
    const lens=make(new THREE.SphereGeometry(.17,8,6),ink,group);lens.position.set(0,0,.8);
    const rotorGroup=new THREE.Group();group.add(rotorGroup);
    for(const x of [-1,1])for(const z of [-.9,.9]){const motor=make(new THREE.CylinderGeometry(.2,.2,.15,6),clay,group);motor.position.set(x,.2,z);const rotor=make(new THREE.BoxGeometry(1.4,.03,.12),metal,rotorGroup);rotor.position.set(x,.32,z);}
    drones.push({group,rotors:rotorGroup.children,phase:i*Math.PI});detailCount+=10;
  }
  const mistCount=!islands?0:mobile?60:130,mistPositions=new Float32Array(mistCount*3),mistGeometry=new THREE.BufferGeometry();mistGeometry.setAttribute('position',new THREE.BufferAttribute(mistPositions,3));
  const mist=new THREE.Points(mistGeometry,new THREE.PointsMaterial({color:0xc9e4d4,size:.23,transparent:true,opacity:.65,depthWrite:false}));mist.frustumCulled=false;details.add(mist);
  const mistSeeds=Array.from({length:mistCount},()=>[random(),random(),random()]);
  const ripples=[];
  for(let i=0;i<(islands?14:0);i++){const ring=make(new THREE.TorusGeometry(.5,.018,3,16).rotateX(Math.PI/2),new THREE.MeshBasicMaterial({color:0xafdad0,transparent:true,opacity:.4,depthWrite:false}));ring.position.set((random()-.5)*11,1.64,-23-random()*3);ring.castShadow=false;ripples.push(ring);}detailCount+=mistCount+(islands?14:0);
  const poolSize=mobile?90:180,positions=new Float32Array(poolSize*3).fill(-999),colors=new Float32Array(poolSize*3),particles=Array.from({length:poolSize},()=>({life:0,x:0,y:0,z:0,vx:0,vy:0,vz:0}));let cursor=0;
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  const sparks=new THREE.Points(geometry,new THREE.PointsMaterial({size:.11,vertexColors:true,transparent:true,opacity:.85,depthWrite:false}));sparks.name='Estela y chispas';sparks.frustumCulled=false;details.add(sparks);
  const hover=make(new THREE.RingGeometry(.6,1.2,32).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0x64ddc7,transparent:true,opacity:.18,depthWrite:false,side:THREE.DoubleSide}));hover.castShadow=false;
  function emit(x,y,z,vx,vz,spark=false,drift=false){
    const index=cursor++%poolSize,p=particles[index];Object.assign(p,{x,y,z,vx:vx+(random()-.5)*(spark?5:.8),vy:random()*(spark?5:.45),vz:vz+(random()-.5)*(spark?5:.8),life:spark?.25+random()*.45:.35+random()*.4,spark});
    const c=spark?[1,.65,.15]:drift?[1,.62,.2]:[.42,.8,.73];colors.set(c,index*3);
  }
  function step(state,dt){
    for(const cone of cones){
      if(!cone.active&&Math.hypot(cone.group.position.x-state.x,cone.group.position.z-state.z)<1.85&&Math.abs(cone.group.position.y-state.y)<2&&state.speed>2){
        cone.active=true;cone.age=0;cone.velocity.set(state.vx*.55,2.2,state.vz*.55);cone.spin=(random()-.5)*10;state.vx*=.985;state.vz*=.985;state.speed=Math.hypot(state.vx,state.vz);
      }
      if(!cone.active)continue;cone.age+=dt;cone.velocity.y-=9.8*dt;cone.group.position.addScaledVector(cone.velocity,dt);cone.group.rotation.z+=cone.spin*dt;cone.group.rotation.x+=dt*2;
      const floor=landscape.roadAt(cone.group.position.x,cone.group.position.z);
      if(Math.abs(floor.offset)<floor.width/2&&cone.group.position.y<floor.y+.18){cone.group.position.y=floor.y+.18;cone.velocity.y=Math.abs(cone.velocity.y)*.22;cone.velocity.x*=Math.exp(-dt*4);cone.velocity.z*=Math.exp(-dt*4);cone.spin*=Math.exp(-dt*4);}
      if(cone.age>8){cone.group.position.copy(cone.origin);cone.group.rotation.set(0,0,0);cone.active=false;}
    }
  }
  function reset(){impactSerial=0;for(const c of cones){c.active=false;c.group.position.copy(c.origin);c.group.rotation.set(0,0,0);}particles.forEach(p=>p.life=0);batches.forEach(batch=>batch.update());}
  function update(time,reduced,{state,phase,dt=0}){
    const t=reduced?0:time,tick=Math.floor(t*18);
    if(tick!==lastAnimation){
      lastAnimation=tick;
      for(const {mesh,base,amplitude} of waves){const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++)p.array[i*3+1]=base[i*3+1]+Math.sin(base[i*3]*.24+base[i*3+2]*.18+t*1.6)*amplitude;p.needsUpdate=true;}
      for(const {mesh,base,phase} of flags){const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++){const x=base[i*3];p.array[i*3+2]=Math.sin(t*3.3+x*2.8+phase)*.16*x;p.array[i*3+1]=base[i*3+1]+Math.cos(t*2.6+x*2+phase)*.035*x;}p.needsUpdate=true;mesh.geometry.computeVertexNormals();}
      drones.forEach(({group,rotors,phase})=>{const a=t*.045+phase;group.position.set(Math.cos(a)*120,(city?115:65)+Math.sin(a*2)*4,Math.sin(a)*80);group.rotation.y=-a;rotors.forEach((r,i)=>r.rotation.y=t*35*(i%2?1:-1));});
      mistSeeds.forEach(([a,b,c],i)=>{const outer=i%3===0,top=outer?15:18,bottom=outer?-5.46:1.54,f=(b+t*.55)%1;mistPositions[i*3]=(outer?-72:0)+(a-.5)*(outer?7:9);mistPositions[i*3+1]=top-(top-bottom)*f;mistPositions[i*3+2]=(outer?73:-19)-f*4+c*.3;});mistGeometry.attributes.position.needsUpdate=true;
      ripples.forEach((r,i)=>{const life=(t*.4+i/14)%1;r.scale.setScalar(.5+life*3);r.material.opacity=(1-life)*.35;});
    }
    mist.visible=!reduced;sparks.visible=!reduced;
    hover.position.set(state.x,state.y-state.hover+.06,state.z);hover.scale.set(1.1+state.speed*.004,1,1.65);hover.rotation.y=state.yaw;hover.material.opacity=state.boosting||state.drifting?.32:.16;hover.material.color.setHex(state.drifting?0xffb24c:0x64ddc7);
    if(!reduced&&dt>0&&phase==='flying'){
      if(state.impactSerial!==impactSerial){impactSerial=state.impactSerial;if(state.impact>1)for(let i=0;i<18;i++)emit(state.impactX,state.y+.2,state.impactZ,-state.vx*.1,-state.vz*.1,true);}
    }
    particles.forEach((p,i)=>{if(dt>0){p.life-=dt;if(p.life>0){p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;if(p.spark)p.vy-=12*dt;}}positions[i*3]=p.life>0?p.x:-999;positions[i*3+1]=p.life>0?p.y:-999;positions[i*3+2]=p.life>0?p.z:-999;});geometry.attributes.position.needsUpdate=true;geometry.attributes.color.needsUpdate=true;
    batches.forEach(batch=>batch.update());
  }
  batches.forEach(batch=>batch.update());
  return {update,step,reset,detailCount};
}
