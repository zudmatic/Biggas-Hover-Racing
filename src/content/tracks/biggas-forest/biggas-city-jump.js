import * as THREE from 'three';
import {createSurfaceIndex} from './circuit-collision.js';

// A half-width ramp on the inside of the forest curve. Its low-speed roll-off and
// the full-width road below the flight arc make every approach recoverable.
export function createBiggasJump({group,colliders,landscape,add,box,beam,palette}){
  const start=1520,lip=1538,end=1548,offset=-4.8,width=8,height=2.8;
  const originalFloor=[];colliders.traverse(m=>{if(m.isMesh&&m.name==='COL_ROAD')originalFloor.push(m);});
  const floor=createSurfaceIndex(originalFloor),sample=(distance,lateral=offset,lift=0)=>{
    const p=landscape.atDistance(distance),x=p.x-p.nz*lateral,z=p.z+p.nx*lateral;
    return {...p,x,z,y:(floor(x,z)??p.y)+lift};
  };
  const positions=[],uv=[],indices=[],columns=[-4,-3.55,0,3.55,4];
  for(let d=start;d<=end;d++){
    const rise=d<=lip?height*((d-start)/(lip-start))**1.35:height*(end-d)/(end-lip),row=d-start;
    columns.forEach((l,c)=>{const p=sample(d,offset+l,rise*(c===0||c===4?.78:1)+.015);positions.push(p.x,p.y,p.z);uv.push((l+width/2)/width,(d-start)/6);});
    if(row)for(let c=0;c<4;c++){const a=(row-1)*5+c,b=row*5+c;indices.push(a,a+1,b,a+1,b+1,b);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  const deck=new THREE.Mesh(geometry,palette.wood);deck.name='Salto del bosque · rampa opcional';deck.receiveShadow=true;group.add(deck);
  const collider=new THREE.Mesh(geometry.clone(),new THREE.MeshBasicMaterial());collider.name='COL_ROUTE_FOREST_JUMP';colliders.add(collider);const rampHeight=createSurfaceIndex(collider);
  const tip=sample(lip),v=p=>new THREE.Vector3(p.x,p.y,p.z);
  const sides=[];
  for(const lateral of [offset-width/2,offset+width/2])for(let d=start;d<end;d++){
    const a=sample(d,lateral),b=sample(d+1,lateral),topA={...a,y:rampHeight(a.x,a.z)??a.y},topB={...b,y:rampHeight(b.x,b.z)??b.y};
    for(const p of [a,topA,b,topA,topB,b])sides.push(p.x,p.y,p.z);
  }
  const skirt=new THREE.BufferGeometry();skirt.setAttribute('position',new THREE.Float32BufferAttribute(sides,3));skirt.computeVertexNormals();
  const skirtMaterial=palette.wood.clone();skirtMaterial.side=THREE.DoubleSide;add(skirt,skirtMaterial);skirt.dispose();
  // Thin cross-slats and amber edge markers reveal the ramp's curved profile.
  for(let d=start+2;d<lip;d+=2){const p=sample(d);p.y=rampHeight(p.x,p.z)+.025;box(v(p),[width-1.2,.045,.15],palette.paint,Math.atan2(p.nx,p.nz));}
  for(const lateral of [offset-width/2+.2,offset+width/2-.2])for(let d=start;d<end;d++){
    const a=sample(d,lateral),b=sample(d+1,lateral);a.y=rampHeight(a.x,a.z)+.035;b.y=rampHeight(b.x,b.z)+.035;beam(v(a),v(b),.055,palette.cream);
  }
  for(const d of [1555,1568,1581,1594,1607])for(const side of [-1,1]){
    const p=sample(d,side*9,.04);box(v(p),[.25,.05,2.4],palette.paint,Math.atan2(p.nx,p.nz));
  }
  function launchAt(previous,state){
    const before=(previous.x-tip.x)*tip.nx+(previous.z-tip.z)*tip.nz,after=(state.x-tip.x)*tip.nx+(state.z-tip.z)*tip.nz;
    if(before>0||after<=0||after-before<1e-6)return null;
    const t=-before/(after-before),x=previous.x+(state.x-previous.x)*t,z=previous.z+(state.z-previous.z)*t,lateral=(x-tip.x)*-tip.nz+(z-tip.z)*tip.nx;
    const speed=state.vx*tip.nx+state.vz*tip.nz;
    const deckHeight=rampHeight(x,z);if(deckHeight===null)return null;
    // Use the actual height under the previous pose, including beveled edges,
    // rather than a narrow height/lane gate that misses real ramp contacts.
    const previousDeck=rampHeight(previous.x,previous.z);
    if(Math.abs(lateral)>width/2-.15||speed<12||speed<state.speed*.65||previousDeck===null||Math.abs(previous.y-previousDeck-state.hover)>.45)return null;
    // Clear separation from the road, with bounded airtime even at boost speed.
    const lift=THREE.MathUtils.lerp(7.4,6.8,THREE.MathUtils.smoothstep(speed,45,72));
    return {height:deckHeight,velocity:tip.grade*speed+lift};
  }
  landscape.launchAt=launchAt;
  const surfaceGradeAt=(x,z,yaw)=>{
    if(rampHeight(x,z)===null)return undefined;
    const dx=Math.sin(yaw)*.35,dz=Math.cos(yaw)*.35,a=rampHeight(x-dx,z-dz),b=rampHeight(x+dx,z+dz);
    return a!==null&&b!==null?(b-a)/.7:undefined;
  };
  landscape.surfaceGradeAt=surfaceGradeAt;
  return {start,lip,end,offset,width,height,tip,sample,deck,launchAt,landingStart:1555,landingEnd:1607,
    dispose(){if(landscape.launchAt===launchAt)delete landscape.launchAt;if(landscape.surfaceGradeAt===surfaceGradeAt)delete landscape.surfaceGradeAt;}};
}
