import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';

const side=(p,l,h=0)=>new THREE.Vector3(p.x-p.nz*l,p.y+h+(p.bank??0)*l,p.z+p.nx*l);
function coloredGeometry(g,position,color){
  g.translate(...position);const c=new THREE.Color(color),colors=new Float32Array(g.attributes.position.count*3);
  for(let i=0;i<colors.length;i+=3)c.toArray(colors,i);g.setAttribute('color',new THREE.BufferAttribute(colors,3));return g;
}
function coloredBox(size,position,color){return coloredGeometry(new RoundedBoxGeometry(...size,1,Math.min(...size)*.22),position,color);}
function merge(parts){const expanded=parts.map(p=>p.index?p.toNonIndexed():p),merged=mergeGeometries(expanded),g=mergeVertices(merged,1e-6);new Set([...parts,...expanded,merged]).forEach(p=>p.dispose());return g;}

// Pennants and distant traffic use fixed geometry and local 12 Hz animation.
export function createBiggasCityLife({group,routes,box,beam,palette,mobile=false}){
  const root=new THREE.Group();root.name='Vida del mercado';group.add(root);
  const material=new THREE.MeshStandardMaterial({name:'Tránsito · colores',vertexColors:true,roughness:.85});
  material.userData.circuitUntextured=true;
  material.userData.cityTextured='paint';
  const transform=new THREE.Object3D(),color=new THREE.Color(),zones=[],market=routes.branches[0];
  for(const [index,fraction] of [.19,.77].entries()){
    const p=routes.onBranch(market,fraction),s=index?-1:1,center=side(p,s*11),zone=new THREE.Group();zone.name='Banderines del mercado';zone.userData.prewarmDecoration=true;root.add(zone);
    // Colored pennants share one mesh and a cable across the road, high above hulls.
    const vertices=[],colors=[],flagBase=[];
    for(let j=0;j<15;j++){
      const l=-11+j*1.5,h=8.7-.8*(1-(l/11)**2),a=side(p,l,h),b=side(p,l+1.05,h),c=side(p,l+.52,h-1.25);color.setHex([0xd99943,0xb85740,0x74aa9b,0xe2d6ad][j%4]);
      for(const q of [a,b,c]){vertices.push(q.x,q.y,q.z);colors.push(color.r,color.g,color.b);}flagBase.push(...vertices.slice(-9));
    }
    const fg=new THREE.BufferGeometry();fg.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3).setUsage(THREE.DynamicDrawUsage));fg.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));fg.computeVertexNormals();
    const flags=new THREE.Mesh(fg,new THREE.MeshStandardMaterial({name:'Banderines del mercado',vertexColors:true,side:THREE.DoubleSide,roughness:1}));flags.frustumCulled=false;zone.add(flags);
    let last;for(let j=0;j<=24;j++){const l=-12+j,q=side(p,l,8.7-.8*Math.max(0,1-(l/11)**2));if(last)beam(last,q,.025,palette.metal);last=q;}
    for(const s of [-1,1]){const foot=side(p,s*12);beam(foot,foot.clone().add(new THREE.Vector3(0,8.7,0)),.1,palette.metal);}
    zones.push({group:zone,center,flags,flagBase,time:0,active:false,uploads:0});
  }
  const trafficPoint=routes.onBranch(market,.82),trafficCenter=side(trafficPoint,0,15),trafficYaw=Math.atan2(trafficPoint.nx,trafficPoint.nz),trafficRoot=new THREE.Group();trafficRoot.name='Tránsito distante del mercado';trafficRoot.userData.prewarmDecoration=true;trafficRoot.position.copy(trafficCenter);trafficRoot.rotation.y=trafficYaw;root.add(trafficRoot);
  const carGeometry=merge([coloredBox([4.2,1,1.65],[0,.7,0],0xcd9b59),coloredBox([2.1,.65,1.5],[-.15,1.48,0],0x315958),coloredBox([2.35,.12,1.7],[-.15,1.86,0],0xdacfb0),coloredBox([.12,.25,1.3],[2.12,.85,0],0xe9e9c1),coloredBox([.12,.18,1.25],[-2.12,.85,0],0xbe5341)]),cars=new THREE.InstancedMesh(carGeometry,material,mobile?3:6);cars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);cars.frustumCulled=false;trafficRoot.add(cars);
  box(trafficCenter.clone().add(new THREE.Vector3(0,-.4,0)),[180,.8,7],palette.stone,trafficYaw);
  for(const z of [-3.4,3.4]){
    const a=new THREE.Vector3(-90,.7,z).applyAxisAngle(new THREE.Vector3(0,1,0),trafficYaw).add(trafficCenter),b=new THREE.Vector3(90,.7,z).applyAxisAngle(new THREE.Vector3(0,1,0),trafficYaw).add(trafficCenter);beam(a,b,.14,palette.metal);
  }
  for(const l of [-30,30])box(side(trafficPoint,l,7.3),[1.5,14.5,2.2],palette.metal,trafficYaw,true);
  let tick=-1,lastTime=null,trafficTime=0,trafficUploads=0;
  function poseZone(zone,t){
    const pos=zone.flags.geometry.attributes.position,base=zone.flagBase;for(let i=0;i<pos.count;i++){const flap=i%3===2?Math.sin(t*4+i*.7)*.5:0;pos.setXYZ(i,base[i*3]+flap,base[i*3+1],base[i*3+2]+flap*.4);}pos.needsUpdate=true;zone.uploads++;
  }
  function poseTraffic(t){for(let i=0;i<cars.count;i++){const direction=i%2?1:-1,x=((i*173/cars.count+t*12)%173)-86.5;transform.position.set(x*direction,0,direction*1.65);transform.rotation.set(0,direction===1?0:Math.PI,0);transform.scale.setScalar(1);transform.updateMatrix();cars.setMatrixAt(i,transform.matrix);}cars.instanceMatrix.needsUpdate=true;trafficUploads++;}
  function update(t,reduced,{phase,state,camera}={}){
    if(phase==='paused'){lastTime=t;return;}const frame=Math.floor(t*12);if(frame===tick)return;
    const dt=lastTime===null?0:Math.min(.2,Math.max(0,t-lastTime));lastTime=t;tick=frame;
    const viewer=camera?.position??state;
    for(const zone of zones){const distance=viewer?Math.hypot(viewer.x-zone.center.x,viewer.z-zone.center.z):Infinity;zone.group.visible=distance<240;zone.active=distance<135&&!reduced;
      if(zone.active){zone.time+=dt;poseZone(zone,zone.time);}else if(reduced&&zone.time!==0){zone.time=0;poseZone(zone,0);}
    }
    const distance=viewer?Math.hypot(viewer.x-trafficCenter.x,viewer.z-trafficCenter.z):Infinity;trafficRoot.visible=distance<330;
    if(distance<230&&!reduced){trafficTime+=dt;poseTraffic(trafficTime);}
  }
  function reset(){tick=-1;lastTime=null;trafficTime=0;for(const z of zones){z.time=0;z.active=false;z.group.visible=false;poseZone(z,0);z.uploads=0;}poseTraffic(0);trafficUploads=0;trafficRoot.visible=false;}
  reset();return {root,zones,cars,trafficRoot,trafficCenter,update,reset,get trafficUploads(){return trafficUploads;}};
}
