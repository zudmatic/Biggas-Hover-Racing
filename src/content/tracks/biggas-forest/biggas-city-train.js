import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {createBiggasSignage} from './biggas-city-signage.js';
import {createSurfaceIndex} from './circuit-collision.js';

const wrap=(d,length)=>((d%length)+length)%length;

// One shared ring per sample: curves and slopes join edge-to-edge instead of
// overlapping rotated boxes. End caps are only needed for the station pieces.
export function createRailwaySection(frames,profile,{caps=false}={}){
  const vertices=[],uv=[],indices=[],n=profile.length,side=new T.Vector3();
  for(const [i,{position:p,direction:d}] of frames.entries()){
    side.set(d.z,0,-d.x).normalize();
    profile.forEach(([l,h],j)=>{vertices.push(p.x+side.x*l,p.y+h,p.z+side.z*l);uv.push(j/n,i*.5);});
    if(i)for(let j=0;j<n;j++){const a=(i-1)*n+j,b=i*n+j,c=(j+1)%n;indices.push(a,(i-1)*n+c,b,(i-1)*n+c,i*n+c,b);}
  }
  if(caps)for(let j=1;j<n-1;j++){const end=(frames.length-1)*n;indices.push(0,j+1,j,end,end+j,end+j+1);}
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

// The railway uses the clear boulevard/market corridors and returns along the
// northern edge of town, climbing gently above the existing trees. Arc-length
// samples keep every carriage at equal speed.
export function createBiggasRailRoute(landscape,routes){
  const market=routes.branches[0],controls=[],push=p=>controls.push(new T.Vector3(p.x,p.y+24,p.z));
  for(let f=.5;f<1;f+=.04)push(routes.onBranch(market,f));push(landscape.atDistance(market.end));
  for(let d=market.end+24;d<1080;d+=24)push(landscape.atDistance(d));push(landscape.atDistance(1080));
  for(const p of [[518,45,45],[490,48,-5],[410,51,-12],[250,54,-12],[0,56,-12],[-250,50,-12],[-410,44,-10],[-495,40,15],[-540,40,65]])controls.push(new T.Vector3(...p));
  for(let d=3330;d<landscape.length+market.start;d+=24)push(landscape.atDistance(d));push(landscape.atDistance(market.start));
  for(let f=.04;f<.5;f+=.04)push(routes.onBranch(market,f));
  const curve=new T.CatmullRomCurve3(controls,true,'centripetal');curve.arcLengthDivisions=4096;curve.updateArcLengths();
  const points=curve.getSpacedPoints(Math.ceil(curve.getLength()/2)),count=points.length-1,distances=new Float64Array(points.length);
  for(let i=1;i<points.length;i++)distances[i]=distances[i-1]+points[i].distanceTo(points[i-1]);
  const length=distances[count];
  const tangents=points.slice(0,-1).map((p,i)=>points[(i+1)%count].clone().sub(points[(i+count-1)%count]).normalize());
  function at(distance,position=new T.Vector3(),direction=new T.Vector3()){
    const d=wrap(distance,length);let low=0,high=count;
    while(low+1<high){const mid=(low+high)>>>1;if(distances[mid]<=d)low=mid;else high=mid;}
    const i=low,t=(d-distances[i])/(distances[i+1]-distances[i]);
    position.copy(points[i]).lerp(points[(i+1)%count],t);direction.copy(tangents[i]).lerp(tangents[(i+1)%count],t).normalize();return {position,direction};
  }
  return {length,points,tangents,at,bounds:new T.Box3().setFromPoints(points)};
}

export function createBiggasTrain({group,colliders,landscape,routes,signage:sharedSignage,ads}){
  const signage=sharedSignage??createBiggasSignage();
  const route=createBiggasRailRoute(landscape,routes),root=new T.Group(),moving=new T.Group();root.name='Ferrocarril urbano · circuito completo';moving.name='Tren Biggas City · cuatro vagones';moving.userData.prewarmDecoration=true;root.add(moving);group.add(root);
  const material=(name,color,roughness=.65)=>new T.MeshStandardMaterial({name,color,roughness});
  const steel=material('Steel railway',0x536767,.48),concrete=material('Concrete elevated railway',0x899388,.9),trim=material('Paint station trim',0xd2a85b,.65);
  // Subpixel rails and long, thin deck faces must keep their shared edges on
  // screen. The city's palette/lighting still apply, without vertex snapping.
  for(const mat of [steel,concrete,trim])mat.userData.cityStableProjection=true;
  const unit=new T.BoxGeometry(1,1,1),cylinder=new T.CylinderGeometry(1,1,1,10),transform=new T.Object3D(),batches=new Map(),solidParts=[],center=new T.Vector3();
  function staticPart(g,mat,solid=false){
    let part=g;if(part.index){part=g.toNonIndexed();g.dispose();}part.computeBoundingBox();part.boundingBox.getCenter(center);
    const key=`${mat.uuid}:${Math.floor(center.x/240)},${Math.floor(center.z/240)}`;if(!batches.has(key))batches.set(key,{mat,parts:[]});batches.get(key).parts.push(part);if(solid)solidParts.push(part.clone());
  }
  function box(p,size,mat,yaw=0,solid=false,pitch=0){transform.position.copy(p);transform.rotation.set(pitch,yaw,0,'YXZ');transform.scale.set(...size);transform.updateMatrix();staticPart(unit.clone().applyMatrix4(transform.matrix),mat,solid);}
  function beam(a,b,radius,mat,solid=false){const delta=b.clone().sub(a);transform.position.copy(a).add(b).multiplyScalar(.5);transform.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.clone().normalize());transform.scale.set(radius,delta.length(),radius);transform.updateMatrix();staticPart(cylinder.clone().applyMatrix4(transform.matrix),mat,solid);}
  function section(from,to,profile,mat){
    const frames=[];for(let i=from;i<=to;i++)frames.push({position:route.points[i],direction:route.tangents[i%route.tangents.length]});
    staticPart(createRailwaySection(frames,profile),mat);
  }
  // Continuous deck and rails are spatially batched; sleepers remain inexpensive boxes.
  for(let i=0;i<route.points.length-1;i+=80){const end=Math.min(i+80,route.points.length-1);
    section(i,end,[[-2.3,-.9],[2.3,-.9],[2.3,-.25],[-2.3,-.25]],concrete);
    for(const s of [-1,1])section(i,end,[[s*1.25-.1,-.1],[s*1.25+.1,-.1],[s*1.25+.1,.15],[s*1.25-.1,.15]],steel);
  }
  const position=new T.Vector3(),direction=new T.Vector3();
  // Distribute evenly around the closed loop, including its final seam.
  const sleeperCount=Math.round(route.length/4);
  for(let i=0;i<sleeperCount;i++){route.at(i*route.length/sleeperCount,position,direction);box(position.clone().add(new T.Vector3(0,-.19,0)),[3.9,.18,.38],steel,Math.atan2(direction.x,direction.z),false,-Math.asin(direction.y));}
  const floors=[],groundMaterials=new Set(['Vegetacion terreno','Urban plaza paving','Hormigon claro','Asfalto grafito']);
  // Sample the rendered ground as well as road colliders: the northern return
  // crosses sculpted parkland where the nearest racing road has another height.
  (group.parent??group).traverse(m=>{if(m.isMesh&&groundMaterials.has(m.material?.name))floors.push(m);});
  colliders.traverse(m=>{if(m.isMesh&&/COL_ROAD|COL_ROUTE_|COL_CITY_SIDEWALK|COL_ENV_TERRAIN_/.test(m.name))floors.push(m);});
  const heightAt=createSurfaceIndex(floors),supports=[];
  for(let d=35;d<route.length;d+=72){
    route.at(d,position,direction);const road=landscape.roadAt(position.x,position.z),near=road.distanceToRoad<road.width/2+5;
    const side=new T.Vector3(direction.z,0,-direction.x).normalize(),reach=near?road.width/2+4:0;
    for(const s of near?[-1,1]:[0]){
      const foot=position.clone().addScaledVector(side,s*reach),other=landscape.roadAt(foot.x,foot.z);if(other.distanceToRoad<other.width/2+2.4)continue;
      const ground=heightAt(foot.x,foot.z)??other.y,top=position.y-1.2;if(top-ground<3)continue;
      foot.y=ground;box(foot.clone().setY((top+ground)/2),[1.25,top-ground,1.25],concrete,0,true);box(foot.clone().setY(ground+.35),[2.3,.7,2.3],concrete,0,true);
      if(near)beam(foot.clone().setY(top),position.clone().setY(top),.32,steel,true);supports.push({position:foot.clone(),top});
    }
  }
  // A single swept platform and canopy, with no coplanar overlaps at bends.
  const stationFrames=Array.from({length:35},(_,i)=>route.at(-53+i*2));
  staticPart(createRailwaySection(stationFrames,[[2.4,1.075],[5.8,1.075],[5.8,1.425],[2.4,1.425]],{caps:true}),concrete);
  staticPart(createRailwaySection(stationFrames,[[1.95,6.38],[6.25,6.38],[6.25,6.62],[1.95,6.62]],{caps:true}),trim);
  for(let d=-51;d<=13;d+=16){route.at(d,position,direction);const side=new T.Vector3(direction.z,0,-direction.x).normalize();
    beam(position.clone().addScaledVector(side,5.4).add(new T.Vector3(0,1.4,0)),position.clone().addScaledVector(side,5.4).add(new T.Vector3(0,6.4,0)),.09,steel);
  }
  for(const {mat,parts} of batches.values()){
    const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());const mesh=new T.Mesh(geometry,mat);mesh.name='Vía elevada · tramo urbano';mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
  }
  if(solidParts.length){const geometry=mergeGeometries(solidParts);solidParts.forEach(g=>g.dispose());const mesh=new T.Mesh(geometry,new T.MeshBasicMaterial());mesh.name='COL_TRAIN_SUPPORTS';colliders.add(mesh);}
  unit.dispose();cylinder.dispose();

  const carParts=[[],[],[]];
  function colored(g,color,bucket=0){const c=new T.Color(color),values=new Float32Array(g.attributes.position.count*3);for(let i=0;i<values.length;i+=3)c.toArray(values,i);g.setAttribute('color',new T.BufferAttribute(values,3));carParts[bucket].push(g);}
  function part(size,p,color,bucket=0,radius=.08){const geometry=Math.min(...size)>=.2?new RoundedBoxGeometry(...size,1,Math.min(radius,Math.min(...size)*.25)):new T.BoxGeometry(...size);colored(geometry.translate(...p),color,bucket);}
  part([3.6,3.15,12.6],[0,2.85,0],0xd6b05c,0,.42);part([3.7,.32,12.5],[0,4.5,0],0xe4d9b7,0,.12);
  part([3.25,.42,11.8],[0,1.05,0],0x294948);part([3.65,.2,11.6],[0,1.65,0],0x6ca79b);
  for(const s of [-1,1]){
    for(const z of [-4.8,-2.85,2.85,4.8]){part([.08,1.35,1.68],[s*1.81,3.3,z],0xe3d9b8);part([.09,1.12,1.42],[s*1.86,3.3,z],0x28525c,1);}
    part([.09,2.6,1.9],[s*1.82,2.67,0],0x4d7972);part([.1,2.4,.045],[s*1.88,2.67,0],0x182c2d);
    for(const z of [-.47,.47]){part([.1,1,.67],[s*1.9,3.32,z],0x28525c,1);part([.11,.25,.05],[s*1.92,2.38,z*.3],0xe5d7ae);}
    part([.38,.18,1.85],[s*1.88,1.32,0],0x394a48);
    part([2.7,1.12,.11],[0,3.35,s*6.31],0x28525c,1);part([2.8,.14,.14],[0,2.7,s*6.33],0xe3d9b8);
    for(const x of [-1.13,1.13])part([.32,.28,.16],[x,2.13,s*6.32],s===1?0xffedbb:0xe5654a,2);
    part([1.3,.27,.7],[0,.9,s*6.56],0x243737);part([2.8,.22,.2],[0,1.47,s*6.28],0x314b49);
    part([2.3,.6,2.3],[0,.73,s*3.9],0x35413f);
    for(const z of [s*3.12,s*4.68])for(const x of [-1.26,1.26])colored(new T.CylinderGeometry(.49,.49,.24,12).rotateZ(Math.PI/2).translate(x,.64,z),0x202d2d);
    part([1.8,.35,1.65],[0,4.83,s*2.5],0x4b625f);
    for(let i=-3;i<=3;i++)part([1.5,.035,.07],[0,5.02,s*2.5+i*.18],0x243c39);
  }
  const bodyMaterial=new T.MeshStandardMaterial({name:'Tren · carrocería y mecánica',vertexColors:true,roughness:.5,metalness:.22}),glassMaterial=new T.MeshStandardMaterial({name:'Tren · ventanas',vertexColors:true,roughness:.19,metalness:.3}),lensMaterial=new T.MeshBasicMaterial({name:'Tren · faros',vertexColors:true});
  for(const m of [bodyMaterial,glassMaterial,lensMaterial])m.userData.circuitUntextured=true;
  bodyMaterial.userData.cityTextured='paint';glassMaterial.userData.cityTextured='glass';
  const meshes=carParts.map((parts,i)=>{
    const expanded=parts.map(g=>g.index?g.toNonIndexed():g),merged=mergeGeometries(expanded),geometry=mergeVertices(merged,1e-6);new Set([...parts,...expanded,merged]).forEach(g=>g.dispose());
    const mesh=new T.InstancedMesh(geometry,[bodyMaterial,glassMaterial,lensMaterial][i],4);mesh.name=['Vagones detallados','Ventanas y puertas','Faros del tren'][i];mesh.castShadow=i===0;mesh.receiveShadow=true;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);moving.add(mesh);return mesh;
  });
  const displayMaterial=signage.material,displayGeometry=signage.panel(5,2.5,.4).translate(0,4.05,6.32);
  const displays=new T.InstancedMesh(displayGeometry,displayMaterial,4);displays.name='Destino B39';displays.instanceMatrix.setUsage(T.DynamicDrawUsage);moving.add(displays);meshes.push(displays);
  if(ads){
    const panels=[];
    for(const side of [-1,1])for(const z of [-3.75,3.75])panels.push(ads.panel(10,3.4).rotateY(side*Math.PI/2).translate(side*1.87,2.08,z));
    const geometry=mergeGeometries(panels);panels.forEach(g=>g.dispose());
    const livery=new T.InstancedMesh(geometry,ads.material,4);livery.name='B39 City Loop · publicidad en vagones';livery.instanceMatrix.setUsage(T.DynamicDrawUsage);moving.add(livery);meshes.push(livery);
    ads.placements.push({id:10,title:'B39 CITY LOOP',location:'laterales de los cuatro vagones',mesh:livery,width:3.4,height:3.4/3});
  }
  const boardGeometry=signage.panel(4,10,2.5,{twoSided:true});
  route.at(-18,position,direction);const board=new T.Mesh(boardGeometry,displayMaterial);board.name='Estación Central';board.position.copy(position).add(new T.Vector3(direction.z*5.4,4.95,-direction.x*5.4));board.rotation.y=Math.atan2(direction.x,direction.z)-Math.PI/2;root.add(board);
  const speed=20,spacing=14.2,carPoses=Array.from({length:4},()=>({position:new T.Vector3(),direction:new T.Vector3()}));let lastTime=0,uploads=0;
  function pose(t){
    for(let i=0;i<4;i++){
      const pose=route.at(t*speed-i*spacing,carPoses[i].position,carPoses[i].direction);transform.position.copy(pose.position);transform.rotation.set(-Math.asin(pose.direction.y),Math.atan2(pose.direction.x,pose.direction.z),0,'YXZ');transform.scale.setScalar(1);transform.updateMatrix();for(const mesh of meshes)mesh.setMatrixAt(i,transform.matrix);
    }
    for(const mesh of meshes){mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();}uploads++;
  }
  function update(t,reduced,{phase}={}){
    if(phase==='paused')return;
    if(reduced||t===lastTime)return;lastTime=t;pose(t);
  }
  function ambienceAt(state,t=lastTime,reduced=false){
    if(reduced)return {train:0,trainApproach:0};route.at(t*speed-spacing*1.5,position,direction);
    const dx=state.x-position.x,dy=state.y-position.y,dz=state.z-position.z,distance=Math.hypot(dx,dy,dz),approach=(direction.x*dx+direction.z*dz)/Math.max(1,Math.hypot(dx,dz));
    return {train:Math.max(0,1-distance/155)**2,trainApproach:approach};
  }
  function reset(){lastTime=0;pose(0);uploads=0;}
  reset();return {root,moving,route,meshes,carPoses,supports,speed,spacing,update,ambienceAt,reset,get uploads(){return uploads;},dispose(){if(!sharedSignage)signage.dispose();}};
}
