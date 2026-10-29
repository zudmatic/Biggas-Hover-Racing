import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {routeRibbon,clipRoadOverlap} from './biggas-city-routes.js';
import {addBiggasWayfinding} from './biggas-city-wayfinding.js';
import {createBiggasJump} from './biggas-city-jump.js';
import {createBiggasSignage} from './biggas-city-signage.js';
import {createBiggasTrain} from './biggas-city-train.js';
import {createBiggasCityLife} from './biggas-city-life.js';
import {createBiggasAds,addBiggasAds} from './biggas-city-ads.js';

const clamp=THREE.MathUtils.clamp;
const xyz=p=>new THREE.Vector3(p.x,p.y,p.z);
const sidePoint=(p,offset,height=0)=>new THREE.Vector3(p.x-p.nz*offset,p.y+height+(p.bank??0)*offset,p.z+p.nx*offset);
export function createBiggasAdventure(root,colliders,landscape,routes,textures,{mobile=false,adTexture,adFacades=[]}={}){
  const signage=createBiggasSignage(),group=new THREE.Group();group.name='Biggas City · rutas y encuentros';root.add(group);
  const ads=createBiggasAds(adTexture);
  const material=(name,color,options={})=>new THREE.MeshStandardMaterial({name,color,roughness:.8,...options});
  const palette={road:material('Asphalt market route',0x414b45),soil:material('Moss roots trail',0x6b6942),wet:material('Wet stone gallery',0x476f6c),stone:material('Rock gallery basalt',0x526765),wood:material('Bark old roots',0x675038),metal:material('Metal station teal',0x284c49),paint:material('Paint ochre station',0xd49a43),cream:material('Paint ivory',0xe3d5ac),cloth:material('Cloth market rust',0xb95b3c,{side:THREE.DoubleSide}),green:material('Foliage roof moss',0x697d44),lens:new THREE.MeshBasicMaterial({name:'Gallery light lenses',color:0x9be8dc})};
  const batches=new Map(),solidParts=[],transform=new THREE.Object3D(),unitBox=new THREE.BoxGeometry(1,1,1),unitCylinder=new THREE.CylinderGeometry(1,1,1,mobile?8:12),unitSphere=new THREE.IcosahedronGeometry(1,1);
  let zone='market',time=0,lastTick=-1;
  function add(geometry,mat,position=new THREE.Vector3(),scale=new THREE.Vector3(1,1,1),rotation=new THREE.Euler(),solid=false){
    transform.position.copy(position);transform.scale.copy(scale);transform.rotation.copy(rotation);transform.updateMatrix();
    let g=geometry.clone().applyMatrix4(transform.matrix);if(g.index){const old=g;g=g.toNonIndexed();old.dispose();}
    if(!g.attributes.uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
    const key=`${zone}:${mat.uuid}`;if(!batches.has(key))batches.set(key,{mat,parts:[]});batches.get(key).parts.push(g);if(solid)solidParts.push(g.clone());
  }
  const bevels=new Map();
  function box(p,size,mat=palette.metal,yaw=0,solid=false){
    // Spend geometry on nearby counters, pillars and rails; signs, paving and
    // roofs stay planar. Collision keeps the original conservative box.
    const bevel=!mobile&&Math.min(...size)>.25&&Math.max(...size)<20&&[palette.wood,palette.metal,palette.paint,palette.stone].includes(mat),rotation=new THREE.Euler(0,yaw,0);
    if(!bevel){add(unitBox,mat,p,new THREE.Vector3(...size),rotation,solid);return;}
    const key=size.join(',');if(!bevels.has(key))bevels.set(key,new RoundedBoxGeometry(...size,1,Math.min(.12,Math.min(...size)*.18)));
    add(bevels.get(key),mat,p,undefined,rotation);
    if(solid){transform.position.copy(p);transform.rotation.copy(rotation);transform.scale.set(...size);transform.updateMatrix();solidParts.push(unitBox.clone().applyMatrix4(transform.matrix));}
  }
  function beam(a,b,radius,mat=palette.wood,solid=false){
    const d=b.clone().sub(a),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.clone().normalize());
    add(unitCylinder,mat,a.clone().add(b).multiplyScalar(.5),new THREE.Vector3(radius,d.length(),radius),new THREE.Euler().setFromQuaternion(q),solid);
  }
  const ribbons=[];
  for(const [index,branch] of routes.branches.entries()){
    zone=branch.id;const mat=index===0?palette.road:index===1?palette.soil:palette.wet,geometry=routeRibbon(branch,{mainRoadAt:routes.mainRoadAt});
    const floor=new THREE.Mesh(geometry,mat);floor.name=`Ruta · ${branch.name}`;floor.receiveShadow=true;group.add(floor);textures.apply(floor);
    const collider=new THREE.Mesh(geometry.clone(),new THREE.MeshBasicMaterial());collider.name=`COL_ROUTE_${branch.id}`;colliders.add(collider);
    for(const side of [-1,1]){
      const edge=routeRibbon(branch,{offset:-side*.22,edge:side,width:.17,height:.04,mainRoadAt:routes.mainRoadAt});add(edge,index===1?palette.cream:palette.lens);edge.dispose();
    }
    for(let i=2;i<branch.samples.length-2;i+=3){
      const a=branch.samples[i],b=branch.samples[Math.min(i+3,branch.samples.length-1)],m=routes.mainRoadAt(a.x,a.z);
      if(m.distanceToRoad<m.width/2+branch.width/2+2)continue;
      for(const side of [-1,1]){
        beam(sidePoint(a,side*(a.width/2+.25),.85),sidePoint(b,side*(b.width/2+.25),.85),.18,index===1?palette.wood:palette.metal,true);
        if(i%9===2)beam(sidePoint(a,side*(a.width/2+.25),-.7),sidePoint(a,side*(a.width/2+.25),1.1),.14,index===1?palette.wood:palette.metal,true);
      }
    }
    for(let f=.1;f<.95;f+=.17){const p=routes.onBranch(branch,f);for(const s of [-1,1])box(sidePoint(p,s*(p.width/2-.1),.2),[.3,.16,1.8],palette.lens,Math.atan2(p.nx,p.nz));}
    for(let i=0;i<4;i++){
      const p=routes.onBranch(branch,.18+i*.19),pole=sidePoint(p,branch.width/2+1.5);beam(pole,pole.clone().add(new THREE.Vector3(0,4.5,0)),.07,palette.metal);
      const geometry=new THREE.PlaneGeometry(2.5,.2,8,1).translate(1.25,0,0),mesh=new THREE.Mesh(geometry,palette.cloth);mesh.position.copy(pole).y+=4.2;mesh.rotation.y=Math.atan2(p.nx,p.nz);mesh.castShadow=false;mesh.userData.biggasLightMargin=1;group.add(mesh);ribbons.push({mesh,base:geometry.attributes.position.array.slice(),phase:i+index*4});
    }
  }
  palette.wet.roughness=.27;palette.wet.bumpScale=.035;
  const market=routes.branches[0],roots=routes.branches[1],falls=routes.branches[2];
  zone='market';
  for(let i=0;i<12;i++){
    const p=routes.onBranch(market,.26+i*.038),side=i%2?1:-1,yaw=Math.atan2(p.nx,p.nz),center=sidePoint(p,side*10,0);
    box(center.clone().add(new THREE.Vector3(0,.65,0)),[4,1.3,5],i%3?palette.wood:palette.paint,yaw,true);
    for(const x of [-1.8,1.8])for(const z of [-2.2,2.2]){const v=new THREE.Vector3(x,0,z).applyAxisAngle(new THREE.Vector3(0,1,0),yaw).add(center);beam(v,v.clone().add(new THREE.Vector3(0,5.5,0)),.09,palette.metal);}
    box(center.clone().add(new THREE.Vector3(0,5.6,0)),[5.5,.16,6],i%2?palette.cloth:palette.cream,yaw);
    for(let j=0;j<3;j++)box(center.clone().add(new THREE.Vector3((j-1)*.8,1.5,0)),[.65,.45,.7],palette.green,yaw);
  }
  const train=createBiggasTrain({group,colliders,landscape,routes,signage,ads});
  zone='roots';
  for(let i=0;i<6;i++){
    const p=routes.onBranch(roots,.18+i*.115),a=sidePoint(p,-9,-1),b=sidePoint(p,9,-1),top=sidePoint(p,i%2?2:-2,15);
    const curve=new THREE.QuadraticBezierCurve3(a,top,b),g=new THREE.TubeGeometry(curve,18,.7,6,false);add(g,palette.wood,undefined,undefined,undefined,true);g.dispose();
    for(const side of [-1,1]){
      const root=sidePoint(p,side*8,-.15);add(unitSphere,palette.green,root,new THREE.Vector3(3,.7,2.5));
      if(i%2===0){const foot=sidePoint(p,side*11,-.5),crown=sidePoint(p,side*12,13);beam(foot,crown,1.2,palette.wood,true);for(let j=0;j<3;j++)add(unitSphere,palette.green,crown.clone().add(new THREE.Vector3(Math.sin(j*2)*3,2+j,Math.cos(j*2)*3)),new THREE.Vector3(5,3.5,4));}
      const end=sidePoint(p,side*4.7,.35);beam(root,end,.45,palette.wood,true);
    }
    const stump=sidePoint(p,(i%2?1:-1)*4.25,.6);add(unitCylinder,palette.wood,stump,new THREE.Vector3(.65,1.2,.65),undefined,true);
  }
  for(const f of [.29,.63]){const p=routes.onBranch(roots,f);beam(sidePoint(p,-12,5.8),sidePoint(p,12,6.7),.95,palette.wood,true);}
  zone='falls';
  // Open-sided basalt gallery: the original falling water is visible through
  // its seaward arches. The roof and wet ledge form a real navigable tunnel.
  for(let i=0;i<9;i++){
    const p=routes.onBranch(falls,.28+i*.043),yaw=Math.atan2(p.nx,p.nz);
    for(const s of [-1,1])box(sidePoint(p,s*7.2,4.5),[1.2,9,1.8],palette.stone,yaw,true);
    box(sidePoint(p,0,9),[15.6,1.6,3.1],palette.stone,yaw,true);
    for(const s of [-1,1])box(sidePoint(p,s*6.65,4.3),[.12,.15,1.2],palette.lens,yaw);
  }
  const roofBranch={...falls,samples:falls.samples.filter(p=>p.station>falls.length*.26&&p.station<falls.length*.66)};
  const roof=routeRibbon(roofBranch,{width:15.4,height:9.2}),roofMesh=new THREE.Mesh(roof,palette.stone);roofMesh.material.side=THREE.DoubleSide;group.add(roofMesh);solidParts.push(roof.clone());
  // Follow every height sample: flat boxes would poke through the roadway
  // on the steep approach and visually bury the vehicle.
  for(const side of [-1,1]){
    const positions=[],indices=[],uv=[];
    falls.samples.forEach((p,i)=>{for(const depth of [.08,1.2]){const v=sidePoint(p,side*p.width/2,-depth);positions.push(v.x,v.y,v.z);uv.push(p.station/8,depth);}if(i){const a=(i-1)*2,b=i*2;indices.push(a,b,a+1,a+1,b,b+1);}});
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();const clipped=clipRoadOverlap(g,routes.mainRoadAt,{snap:false});add(clipped,palette.stone);clipped.dispose();g.dispose();
  }
  const underside=routeRibbon(falls,{height:-1.2,mainRoadAt:routes.mainRoadAt});add(underside,palette.stone);underside.dispose();
  const wayfinding=addBiggasWayfinding({routes,add,box,beam,palette,signage,setZone:value=>{zone=value;}});
  const advertising=addBiggasAds({atlas:ads,root,landscape,routes,train,facades:adFacades,add,box,beam,palette,setZone:value=>{zone=value;}});
  ads.supports=advertising.supports;
  zone='roots';const jump=createBiggasJump({group,colliders,landscape,add,box,beam,palette});
  zone='market';const cityLife=createBiggasCityLife({group,routes,box,beam,palette,mobile});
  for(const {mat,parts} of batches.values()){
    const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());const mesh=new THREE.Mesh(geometry,mat);mesh.name=`Encuentros · ${mat.name}`;mesh.castShadow=!mat.isMeshBasicMaterial;mesh.receiveShadow=true;group.add(mesh);textures.apply(mesh);
  }
  if(solidParts.length){const parts=solidParts.map(g=>{if(g.index){const copy=g.toNonIndexed();g.dispose();return copy;}return g;}),geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.name='COL_ENCOUNTER_SOLIDS';colliders.add(mesh);}

  bevels.forEach(g=>g.dispose());unitBox.dispose();unitCylinder.dispose();unitSphere.dispose();

  const windZones=[routes.onBranch(roots,.5),landscape.atDistance(1740)];
  function windAt(x,z,t=time){
    let vx=0,vz=0,strength=0;
    for(const p of windZones){const d=Math.hypot(x-p.x,z-p.z),envelope=Math.max(0,1-d/65)**2,force=envelope*(1.9+.65*Math.sin(t*1.1));vx-=p.nz*force;vz+=p.nx*force;strength+=force;}
    return {x:vx,z:vz,strength};
  }
  const capacity=mobile?64:128,particles=Array.from({length:capacity},()=>({life:0})),positions=new Float32Array(capacity*3).fill(-999),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
  const splash=new THREE.Points(geometry,new THREE.PointsMaterial({name:'Salpicaduras de paso',color:0xc2f2ef,size:.18,transparent:true,opacity:.8,depthWrite:false}));splash.name='Salpicaduras de la cascada';splash.frustumCulled=false;group.add(splash);let cursor=0;
  const mistPositions=new Float32Array((mobile?24:48)*3),mistGeometry=new THREE.BufferGeometry();mistGeometry.setAttribute('position',new THREE.BufferAttribute(mistPositions,3).setUsage(THREE.DynamicDrawUsage));
  const softData=new Uint8Array(32*32*4);for(let y=0;y<32;y++)for(let x=0;x<32;x++){const r=Math.hypot((x-15.5)/16,(y-15.5)/16);softData.set([255,255,255,Math.round(255*Math.max(0,1-r*r)**3)],(y*32+x)*4);}
  const softTexture=new THREE.DataTexture(softData,32,32);softTexture.needsUpdate=true;softTexture.magFilter=THREE.LinearFilter;
  const mist=new THREE.Points(mistGeometry,new THREE.PointsMaterial({map:softTexture,color:0xb4dbd6,size:2.6,transparent:true,opacity:.25,depthWrite:false}));mist.name='Velo interior de la galería';mist.frustumCulled=false;group.add(mist);
  function ambienceAt(state,t=time,reduced=false){
    const dx=Math.max(0,Math.abs(state.x+445)-35),distance=Math.hypot(dx,state.z+227,(state.y-43)*.5),forest=landscape.atDistance(1750),forestDistance=Math.hypot(state.x-forest.x,state.z-forest.z),r=routes.nearest(state.x,state.z);
    return {falls:Math.max(0,1-distance/190)**2,wind:Math.max(0,1-forestDistance/330)*(.65+.15*Math.sin(t*.6)),...train.ambienceAt(state,t,reduced),gallery:r?.routeId==='falls'&&r.distanceToRoad<r.width/2&&r.station>r.branch.length*.26&&r.station<r.branch.length*.66?1:0};
  }
  function navigationAt(){return '';}
  const stats={wind:0,spray:0};let sprayCooldown=0;
  function emitSpray(state,count){for(let j=0;j<count;j++){const p=particles[cursor++%capacity],angle=cursor*2.3998;Object.assign(p,{life:.65,x:state.x+Math.sin(angle)*1.5,y:state.y+1+Math.cos(angle)*.6,z:state.z+Math.cos(angle)*1.5,vx:-state.vx*.16+Math.sin(angle)*2.5,vy:1.2,vz:-state.vz*.16+Math.cos(angle)*2.5});stats.spray++;}}

  function step(state,dt){
    time+=dt;const road=landscape.roadAt(state.x,state.z);state.routeId=road.routeId??'';state.routeName=road.routeName??'';state.routeHint=navigationAt(state,road);
    const wind=windAt(state.x,state.z);state.vx+=wind.x*dt;state.vz+=wind.z*dt;state.speed=Math.hypot(state.vx,state.vz);const bankForce=(road.bank??0)*5;state.vx+=road.nz*bankForce*dt;state.vz-=road.nx*bankForce*dt;state.speed=Math.hypot(state.vx,state.vz);state.windStrength=wind.strength;stats.wind=wind.strength;
    sprayCooldown=Math.max(0,sprayCooldown-dt);const curtain=Math.max(0,1-Math.abs(state.z+227)/14)*Math.max(0,1-Math.max(0,Math.abs(state.x+445)-22)/24);
    state.waterSpray=curtain;if(curtain>.12&&state.speed>8&&sprayCooldown===0&&Math.abs(state.y-43)<10){emitSpray(state,mobile?8:16);sprayCooldown=.28;}
    state.wetSurface=false;
    for(const p of particles)if(p.life>0){p.life-=dt;p.x+=p.vx*dt;p.z+=p.vz*dt;p.y+=p.vy*dt;p.vy-=9*dt;}
  }
  function update(t,reduced,{phase,state,camera}={}){
    cityLife.update(t,reduced,{phase,state,camera});train.update(t,reduced,{phase});
    const tick=Math.floor(t*24);splash.visible=!reduced;mist.visible=!reduced&&(!camera||camera.position.distanceTo(new THREE.Vector3(-450,45,-239))<180);
    if(phase==='paused'||tick===lastTick)return;lastTick=tick;
    const animationTime=reduced?0:t;
    for(const {mesh,base,phase} of ribbons){
      const close=state?Math.max(0,1-Math.hypot(state.x-mesh.position.x,state.z-mesh.position.z)/12)*Math.min(1,state.speed/35):0,wind=windAt(mesh.position.x,mesh.position.z,animationTime).strength,p=mesh.geometry.attributes.position;
      for(let i=0;i<p.count;i++){const x=base[i*3];p.setZ(i,reduced?0:Math.sin(animationTime*(4+wind)+x*2+phase)*x*(.08+close*.28+wind*.05));}p.needsUpdate=true;
    }
    particles.forEach((p,i)=>positions.set(p.life>0?[p.x,p.y,p.z]:[-999,-999,-999],i*3));geometry.attributes.position.needsUpdate=true;
    if(mist.visible){for(let i=0;i<mistPositions.length/3;i++){const life=(i*.618+t*.08)%1;mistPositions.set([-489+(i*.381%1)*92,42+life*6,-232+Math.sin(i+t*.4)*1.5],i*3);}mistGeometry.attributes.position.needsUpdate=true;}
  }
  function reset(){cityLife.reset();train.reset();time=0;sprayCooldown=0;stats.spray=0;lastTick=-1;for(const p of particles)p.life=0;positions.fill(-999);geometry.attributes.position.needsUpdate=true;stats.wind=0;}
  update(0,false,{});
  return {group,routes,jump,cityLife,windAt,ambienceAt,navigationAt,wayfinding,ads,ribbons,train,splash,mist,stats,step,update,reset,detailCount:group.children.length,dispose(){jump.dispose();train.dispose();softTexture.dispose();signage.dispose();ads.dispose();}};
}
