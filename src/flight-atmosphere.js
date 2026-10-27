import * as THREE from 'three';
import {createDesertSky} from './desert-sky.js';

const clamp=THREE.MathUtils.clamp;
const randomSource=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};

export function createCircuitSky(scene,{mobile=false,map='ruins'}={}){
  if(map==='desert-valley')return createDesertSky(scene,{mobile});
  const random=randomSource(map==='nexus'?35035:34034),root=new THREE.Group();root.name='Cielo del circuito';scene.add(root);
  const domeGeometry=new THREE.SphereGeometry(4400,32,20),positions=domeGeometry.attributes.position;
  const colors=new Float32Array(positions.count*3);domeGeometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  const dome=new THREE.Mesh(domeGeometry,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.BackSide,depthWrite:false,fog:false}));dome.name='Gradiente del cielo';dome.renderOrder=-1000;dome.frustumCulled=false;root.add(dome);
  if(map==='desert-valley')dome.material.toneMapped=false;
  const cloudGeometry=new THREE.SphereGeometry(1,10,7),normals=cloudGeometry.attributes.normal,cloudColors=new Float32Array(normals.count*3);
  const shade=new THREE.Color(0x8eacc3),lit=new THREE.Color(0xfffbeb),color=new THREE.Color();
  for(let i=0;i<normals.count;i++){const light=clamp(.58+normals.getY(i)*.36-normals.getX(i)*.12,0,1);color.copy(shade).lerp(lit,light);color.toArray(cloudColors,i*3);}
  cloudGeometry.setAttribute('color',new THREE.BufferAttribute(cloudColors,3));
  const groups=mobile?18:30,puffs=7,cloudMaterial=new THREE.MeshBasicMaterial({vertexColors:true,fog:false});
  const clouds=new THREE.InstancedMesh(cloudGeometry,cloudMaterial,groups*puffs);clouds.name='Nubes volumétricas';clouds.frustumCulled=false;clouds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);root.add(clouds);
  const clusters=Array.from({length:groups},(_,i)=>{
    const angle=i/groups*Math.PI*2+random()*.2,layer=i%3,radius=layer===0?620+random()*180:1000+random()*950;
    const width=layer===0?65+random()*50:100+random()*100;
    const lobes=[[-.52,0,-.08],[-.28,.12,.08],[0,.25,0],[.26,.13,-.06],[.49,0,.1],[-.12,-.02,.24],[.2,-.03,-.25]];
    return {x:Math.cos(angle)*radius,z:Math.sin(angle)*radius,y:layer===0?175+random()*65:280+random()*170,width,angle:random()*Math.PI,speed:.65+random()*.6,puffs:lobes.map(([x,y,z])=>({x,y,z,sx:.32+random()*.13,sy:.2+random()*.1,sz:.29+random()*.13}))};
  });
  if(map==='desert-valley')clouds.visible=false;
  const transform=new THREE.Object3D(),sunDirection=(map==='desert-valley'?new THREE.Vector3(-160,220,-120):new THREE.Vector3(-.55,.42,.72)).normalize();let previousTick=-1,previousBlend=-1,blend=0;
  const sun=new THREE.Mesh(new THREE.SphereGeometry(38,20,12),new THREE.MeshBasicMaterial({color:0xffe4a2,fog:false,depthWrite:false}));sun.name='Sol y luna';sun.renderOrder=-900;root.add(sun);
  const starsGeometry=new THREE.BufferGeometry(),starPositions=[];
  for(let i=0;i<(mobile?90:180);i++){const angle=random()*Math.PI*2,y=.13+random()*.85,r=Math.sqrt(1-y*y);starPositions.push(Math.cos(angle)*r*3900,y*3900,Math.sin(angle)*r*3900);}
  starsGeometry.setAttribute('position',new THREE.Float32BufferAttribute(starPositions,3));
  const stars=new THREE.Points(starsGeometry,new THREE.PointsMaterial({color:0xd6e9ff,size:7,transparent:true,opacity:0,depthWrite:false,fog:false}));stars.name='Estrellas';stars.renderOrder=-950;root.add(stars);
  const dayTop=new THREE.Color(map==='nexus'?0x568eb9:0x509bd0),nightTop=new THREE.Color(0x071329),dayHorizon=new THREE.Color(0xc5dce0),nightHorizon=new THREE.Color(0x263c58),horizon=new THREE.Color(),zenith=new THREE.Color(),tint=new THREE.Color(0x829ac4),sunDay=new THREE.Color(0xffe4a2),moon=new THREE.Color(0xdcecff);
  if(map==='desert-valley'){dayTop.set(0x247db6);dayHorizon.set(0xbadbe4);}
  function update(camera,time,{night=false,dt=0,reducedMotion=false}={}){
    blend=reducedMotion?Number(night):THREE.MathUtils.damp(blend,Number(night),5,dt);
    dome.position.copy(camera.position);stars.position.copy(camera.position);sun.position.copy(camera.position).addScaledVector(sunDirection,3500);
    if(Math.abs(blend-previousBlend)>.0001){
      previousBlend=blend;horizon.copy(dayHorizon).lerp(nightHorizon,blend);zenith.copy(dayTop).lerp(nightTop,blend);
      for(let i=0;i<positions.count;i++){const height=clamp(positions.getY(i)/4400,0,1);color.copy(horizon).lerp(zenith,Math.pow(height,map==='desert-valley'?.35:.55));color.toArray(colors,i*3);}
      domeGeometry.attributes.color.needsUpdate=true;cloudMaterial.color.set(0xffffff).lerp(tint,blend);sun.material.color.copy(sunDay).lerp(moon,blend);stars.material.opacity=blend*.85;
    }
    const t=reducedMotion?0:time,tick=Math.floor(t*12);
    if(clouds.visible&&tick!==previousTick){
      previousTick=tick;
      clusters.forEach((cluster,i)=>cluster.puffs.forEach((puff,j)=>{
        // Bounded, slow drift keeps cloud coverage stable over long sessions.
        const drift=Math.sin(t*.006*cluster.speed+i)*45;
        transform.position.set(cluster.x+(puff.x*Math.cos(cluster.angle)+puff.z*Math.sin(cluster.angle))*cluster.width+drift,cluster.y+puff.y*cluster.width,cluster.z+(-puff.x*Math.sin(cluster.angle)+puff.z*Math.cos(cluster.angle))*cluster.width+Math.cos(t*.004+i)*22);
        transform.rotation.set(0,cluster.angle,0);transform.scale.set(cluster.width*puff.sx,cluster.width*puff.sy,cluster.width*puff.sz);transform.updateMatrix();clouds.setMatrixAt(i*puffs+j,transform.matrix);
      }));clouds.instanceMatrix.needsUpdate=true;
    }
  }
  return {root,clouds,dome,stars,sun,cloudCount:groups,update,dispose(){domeGeometry.dispose();dome.material.dispose();cloudGeometry.dispose();cloudMaterial.dispose();clouds.dispose();sun.geometry.dispose();sun.material.dispose();starsGeometry.dispose();stars.material.dispose();root.removeFromParent();}};
}

export function speedCameraProfile(state,{reducedMotion=false,cameraMode=0,lens={}}={}){
  const speed=clamp(state.speed/72,0,1),rush=reducedMotion?0:THREE.MathUtils.smoothstep(state.speed,8,60);
  return {fov:Math.min(110,(lens.base??62)+(reducedMotion?0:speed*speed*(lens.speed??12)+(state.boosting?(lens.boost??14):0))*(cameraMode===1?.7:1)),lens,distance:cameraMode===1?24:cameraMode===2?-1.7:10-rush*1.2,height:cameraMode===1?12:cameraMode===2?2.4:5.5-rush*.65,anticipation:reducedMotion?0:clamp((state.yawRate??0)*.13,-.22,.22)*rush};
}

export function createSpeedAtmosphere(scene,{mobile=false}={}){
  const count=mobile?24:42,random=randomSource(33033),seeds=Array.from({length:count},(_,i)=>({angle:i/count*Math.PI*2,phase:random(),length:.025+random()*.045}));
  const geometry=new THREE.BufferGeometry(),positions=new Float32Array(count*6);geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
  const material=new THREE.LineBasicMaterial({color:0xd5f4ff,transparent:true,opacity:0,depthTest:false,depthWrite:false,fog:false});
  const lines=new THREE.LineSegments(geometry,material);lines.name='Líneas de velocidad';lines.frustumCulled=false;lines.renderOrder=900;lines.visible=false;scene.add(lines);
  let intensity=0;
  return {lines,get intensity(){return intensity;},update(camera,state,time,{dt=0,phase='flying',reducedMotion=false}={}){
    if(reducedMotion||phase!=='flying'){intensity=0;lines.visible=false;material.opacity=0;return;}
    const target=THREE.MathUtils.smoothstep(state.speed,20,68)*(state.boosting?1:.65);
    intensity=THREE.MathUtils.damp(intensity,target,8,dt);lines.visible=intensity>.015;if(!lines.visible)return;
    material.opacity=intensity*.4;lines.position.copy(camera.position);lines.quaternion.copy(camera.quaternion);
    const height=Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*8,width=height*camera.aspect;
    seeds.forEach((seed,i)=>{
      const progress=(seed.phase+time*(.8+state.speed/45))%1,radius=.64+progress*.65,length=seed.length*(.5+intensity*2.8);
      for(let end=0;end<2;end++){const r=radius+end*length,offset=i*6+end*3;positions[offset]=Math.cos(seed.angle)*r*width;positions[offset+1]=Math.sin(seed.angle)*r*height;positions[offset+2]=-8;}
    });geometry.attributes.position.needsUpdate=true;
  },dispose(){geometry.dispose();material.dispose();lines.removeFromParent();}};
}
