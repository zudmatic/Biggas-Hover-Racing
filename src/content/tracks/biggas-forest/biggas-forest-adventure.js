import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {routeRibbon,clipRoadOverlap} from './biggas-city-routes.js';
import {createBiggasJump} from './biggas-city-jump.js';
import {isForestDirt} from './biggas-forest.js';

// A swept, irregular rock shell with open portals. Inner wall, outer mass and
// portal rims share vertices; no stacked pillars, floating roof or box arches.
export function forestCaveGeometry(branch){
  const samples=branch.samples.filter(p=>p.station>=branch.length*.21&&p.station<=branch.length*.76).filter((_,i)=>i%2===0),sides=14,positions=[],colors=[],indices=[];
  const ring=sides+1,layer=samples.length*ring;
  const opening=(i,j)=>(i>=23&&i<=30||i>=45&&i<=52)&&j>=10&&j<=13;
  for(let outer=0;outer<2;outer++)samples.forEach((p,i)=>{
    const mouth=Math.min(i,samples.length-1-i),shade=outer?.9:T.MathUtils.lerp(.68,.98,1-T.MathUtils.smoothstep(mouth,0,14));
    for(let j=0;j<=sides;j++){
      const a=j/sides*Math.PI,noise=Math.sin(i*.89+j*1.71)*.42+Math.sin(i*.31-j*2.6)*.3;
      const radius=p.width/2+2.4+outer*(4+Math.sin(i*.27)*1.5)+noise,lateral=Math.cos(a)*radius,h=-.8+Math.sin(a)*(10.6+outer*(4+Math.sin(i*.33)*2)+noise);
      positions.push(p.x-p.nz*lateral,p.y+h,p.z+p.nx*lateral);
      const tint=shade*(.91+.09*Math.sin(i*.8+j));colors.push(tint*.92,tint,tint*.94);
      if(i&&j&&!opening(i,j)){const b=outer*layer+i*ring+j,a=b-ring;if(outer)indices.push(a-1,b-1,a,a,b-1,b);else indices.push(a-1,a,b-1,a,b,b-1);}
    }
  });
  // Join the inner and outer lips of the irregular daylight openings.
  for(let i=1;i<samples.length;i++)for(let j=1;j<=sides;j++)if(opening(i,j)){
    const a=i*ring+j,b=a-ring;
    for(const [x,y,edge] of [[b-1,b,!opening(i-1,j)],[a,a-1,!opening(i+1,j)],[a-1,b-1,!opening(i,j-1)],[b,a,!opening(i,j+1)]])if(edge)indices.push(x,y,x+layer,y,y+layer,x+layer);
  }
  for(const i of [0,samples.length-1])for(let j=0;j<sides;j++){const a=i*ring+j,b=a+layer;indices.push(a,b,a+1,a+1,b,b+1);}
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  return {geometry,samples};
}

export function createBiggasForestAdventure(root,colliders,landscape,routes,textures,forest,{mobile=false,soil}={}){
  const group=new T.Group();group.name='Bosque · senderos y cueva';root.add(group);
  const rock=new T.MeshStandardMaterial({name:'Rock cave basalt',color:0x829184,emissive:0x263b33,emissiveIntensity:.18,roughness:.98,vertexColors:true,side:T.DoubleSide});
  const wood=new T.MeshStandardMaterial({name:'Bark forest roots',color:0x65503b,roughness:1});
  const palette={wood,metal:wood,paint:wood,cream:wood,lens:wood};
  const solids=[],batches=new Map(),transform=new T.Object3D(),boxGeometry=new T.BoxGeometry(),cylinder=new T.CylinderGeometry(1,1,1,8),stone=new T.IcosahedronGeometry(1,1);
  function add(geometry,material,position=new T.Vector3(),scale=new T.Vector3(1,1,1),rotation=new T.Euler(),solid=false){
    transform.position.copy(position);transform.scale.copy(scale);transform.rotation.copy(rotation);transform.updateMatrix();
    let g=geometry.clone().applyMatrix4(transform.matrix);if(g.index){const indexed=g;g=g.toNonIndexed();indexed.dispose();}
    // Flat props have no baked occlusion; match the rock shell's attribute layout.
    if(material.vertexColors&&!g.attributes.color)g.setAttribute('color',new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count*3).fill(.9),3));
    for(const name of Object.keys(g.attributes))if(!['position','normal','color'].includes(name))g.deleteAttribute(name);
    if(!batches.has(material))batches.set(material,[]);batches.get(material).push(g);
    if(solid)solids.push(g.clone());
  }
  const box=(p,size,mat=wood,yaw=0,solid=false)=>add(boxGeometry,mat,p,new T.Vector3(...size),new T.Euler(0,yaw,0),solid);
  const beam=(a,b,radius,mat=wood,solid=false)=>{const d=b.clone().sub(a),q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),d.clone().normalize());add(cylinder,mat,a.clone().add(b).multiplyScalar(.5),new T.Vector3(radius,d.length(),radius),new T.Euler().setFromQuaternion(q),solid);};
  for(const branch of routes.branches){
    for(const p of branch.samples){p.routeName=branch.name;p.surface=branch.id==='falls'?'stone':'dirt';}
    const mat=branch.id==='falls'?new T.MeshStandardMaterial({name:'Rock cave damp floor',color:0x59685b,roughness:.72}):soil;
    const geometry=routeRibbon(branch,{mainRoadAt:routes.mainRoadAt}),mesh=new T.Mesh(geometry,mat);mesh.name=`Senda · ${branch.name}`;mesh.receiveShadow=true;group.add(mesh);textures.apply(mesh);
    const collider=new T.Mesh(geometry.clone(),new T.MeshBasicMaterial());collider.name=`COL_ROUTE_${branch.id}`;colliders.add(collider);
    // Earth shoulders under the entire trail prevent an exposed floating ribbon.
    for(const side of [-1,1]){
      const positions=[],indices=[];
      branch.samples.forEach((p,i)=>{for(const outer of [0,1]){const offset=side*(p.width/2+outer*4),x=p.x-p.nz*offset,z=p.z+p.nx*offset;positions.push(x,outer?Math.min(p.y-.35,forest.height(x,z)??p.y-2):p.y-.025+(p.bank??0)*offset,z);}if(i){const a=(i-1)*2,b=i*2;indices.push(a,a+1,b,a+1,b+1,b);}});
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();const clipped=clipRoadOverlap(g,routes.mainRoadAt,{snap:false});g.dispose();const skirt=new T.Mesh(clipped,mat);skirt.material.side=T.DoubleSide;skirt.name='Talud natural del sendero';skirt.receiveShadow=true;group.add(skirt);
    }
  }
  const falls=routes.branches.find(b=>b.id==='falls'),cave=forestCaveGeometry(falls);
  const shell=new T.Mesh(cave.geometry,rock);shell.name='Cueva natural de la cascada';shell.castShadow=true;shell.receiveShadow=true;group.add(shell);solids.push(cave.geometry.clone());
  for(const side of [-1,1]){const caveFloor=routeRibbon({...falls,samples:cave.samples},{width:3.5,edge:side,offset:side*1.75,height:-.03,mainRoadAt:routes.mainRoadAt});
  const caveGround=new T.Mesh(caveFloor,new T.MeshStandardMaterial({name:'Rock cave floor',color:0x59685b,roughness:.85}));caveGround.name='Suelo continuo de la cueva';caveGround.receiveShadow=true;group.add(caveGround);}
  // Merge the upper silhouette into the escarpment with uneven rock masses.
  cave.samples.forEach((p,i)=>{if(i%9)return;add(stone,rock,new T.Vector3(p.x,p.y+13.5,p.z),new T.Vector3(5.5,3+Math.sin(i)*1.2,6),new T.Euler(.2,i*.4,.25));});
  // Rock formations stay outside a full 11m-wide, 6m-high driving envelope.
  cave.samples.forEach((p,i)=>{if(i%7)return;for(const side of [-1,1]){
    const offset=side*(p.width/2+2),v=new T.Vector3(p.x-p.nz*offset,p.y+.6,p.z+p.nx*offset);
    add(stone,rock,v,new T.Vector3(1.9,2.1+Math.sin(i)*.4,2.8),new T.Euler(.2,i*.72,.1),true);
    const tip=new T.ConeGeometry(.65,2.3,6).rotateX(Math.PI);add(tip,rock,new T.Vector3(v.x,p.y+8.2,v.z),undefined,undefined,true);tip.dispose();
  }});
  // Bulk rock ties the tunnel into the cliff, especially around its portals.
  // The central seaward face stays open to the falling curtain.
  cave.samples.forEach((p,i)=>{if(i%8)return;for(const side of [-1,1]){
    if(side===-1&&p.x< -400&&p.x> -505)continue;
    const offset=side*15,v=new T.Vector3(p.x-p.nz*offset,p.y-2,p.z+p.nx*offset);
    add(stone,rock,v,new T.Vector3(7.3,14+Math.sin(i*.7)*2,10),new T.Euler(0,Math.atan2(p.nx,p.nz),0),true);
  }});
  for(const obstacle of forest.obstacles){
    // Simple trunk collision matches the visible stem; canopy remains decorative.
    const g=new T.CylinderGeometry(obstacle.radius,obstacle.radius,6,10).translate(obstacle.x,obstacle.y+3,obstacle.z);solids.push(g);
  }
  const jump=createBiggasJump({group,colliders,landscape,add,box,beam,palette});
  jump.deck.material=soil;jump.deck.name='Salto del bosque · loma de tierra';
  for(const [mat,parts] of batches){const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());const mesh=new T.Mesh(geometry,mat);mesh.name=`Bosque · ${mat.name}`;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}
  const collisionParts=solids.map(g=>{const result=new T.BufferGeometry();result.setAttribute('position',g.attributes.position.clone());if(g.index)result.setIndex(g.index.clone());const plain=result.index?result.toNonIndexed():result;if(plain!==result)result.dispose();g.dispose();return plain;});
  const collision=new T.Mesh(mergeGeometries(collisionParts),new T.MeshBasicMaterial({side:T.DoubleSide}));collision.name='COL_FOREST_SOLIDS';colliders.add(collision);collisionParts.forEach(g=>g.dispose());boxGeometry.dispose();cylinder.dispose();stone.dispose();
  const count=mobile?45:90,positions=new Float32Array(count*3).fill(-999),geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage));
  const dust=new T.Points(geometry,new T.PointsMaterial({name:'Polvo de tierra',color:0xbda781,size:.5,transparent:true,opacity:.22,depthWrite:false}));dust.name='Polvo del bosque';dust.frustumCulled=false;group.add(dust);
  const particles=Array.from({length:count},()=>({life:0}));let cursor=0,time=0,lastTick=-1;
  function windAt(x,z,t=time){const force=.25+.15*Math.sin(t*.7+x*.001+z*.001);return {x:force*.8,z:-force*.6,strength:force};}
  function ambienceAt(state){const r=routes.nearest(state.x,state.z),d=Math.hypot(state.x+445,state.z+227);return {falls:Math.max(0,1-d/220)**2,wind:.55,train:0,trainApproach:0,gallery:r?.routeId==='falls'&&r.distanceToRoad<r.width/2&&r.station>falls.length*.21&&r.station<falls.length*.76?1:0};}
  function step(state,dt){time+=dt;const road=landscape.roadAt(state.x,state.z);state.routeId=road.routeId??'';state.routeName=road.routeName??'';state.routeHint='';state.wetSurface=false;state.waterSpray=ambienceAt(state).falls*.3;state.windStrength=.25;state.onDirt=road.surface==='dirt'||(!road.routeId&&isForestDirt(road.distance));
    // Mild soil resistance keeps slides controllable without limiting turbo or jumps.
    if(state.onDirt&&!state.airborne){const lateral=state.vx*-road.nz+state.vz*road.nx,loss=1-Math.exp(-dt*.16);state.vx+=road.nz*lateral*loss;state.vz-=road.nx*lateral*loss;state.speed=Math.hypot(state.vx,state.vz);}
  }
  function update(t,reduced,{phase,state,dt=0}={}){
    dust.visible=!reduced;if(phase==='paused'||Math.floor(t*24)===lastTick)return;lastTick=Math.floor(t*24);
    const elapsed=Math.min(.1,dt||1/24);
    if(!reduced&&state?.onDirt&&!state.airborne&&state.speed>8&&phase==='flying')for(let i=0;i<2;i++){const p=particles[cursor++%count],side=(cursor%2?1:-1)*.8;Object.assign(p,{life:.8,x:state.x-Math.sin(state.yaw)*2+Math.cos(state.yaw)*side,y:state.y-.2,z:state.z-Math.cos(state.yaw)*2-Math.sin(state.yaw)*side});}
    particles.forEach((p,i)=>{if(p.life>0){p.life-=elapsed;p.y+=elapsed*.55;}positions.set(!reduced&&p.life>0?[p.x,p.y,p.z]:[-999,-999,-999],i*3);});geometry.attributes.position.needsUpdate=true;
  }
  function reset(){particles.forEach(p=>p.life=0);positions.fill(-999);geometry.attributes.position.needsUpdate=true;time=0;lastTick=-1;}
  textures.applyRoot(group);
  return {group,routes,jump,cave:{...cave,mesh:shell},forest,dust,windAt,ambienceAt,step,update,reset,detailCount:group.children.length,dispose(){jump.dispose();}};
}
