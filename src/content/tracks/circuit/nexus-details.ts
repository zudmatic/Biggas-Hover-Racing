import * as THREE from 'three';
import {createDetailInstances} from './detail-instances';

// City-specific life stays on rooftops, leaving the authored streets and
// architectural passage clear. Shared race effects live in circuit-details.
export function createNexusDetails(root,anchors,{mobile=false}={}){
  const group=new THREE.Group();group.name='Nexus · actividad urbana';root.add(group);
  const metal=new THREE.MeshStandardMaterial({name:'CITY_steel',color:0x4b656b,roughness:.6}),light=new THREE.MeshBasicMaterial({name:'Light lens',color:0x72e8ee});
  const fans=[],vents=[],signals=new Set();let detailCount=0;
  root.traverse(o=>{if(o.isMesh&&/^(CITY|INFILL)_(cyan|amber|glasslight|glass[0-9]?)$/.test(o.material?.name??''))signals.add(o.material);});
  const selected=anchors.filter(a=>/Factory|Utility|Research|Transit|Logistics/.test(a.name)).slice(0,mobile?6:10);
  const bases=createDetailInstances(group,new THREE.CylinderGeometry(1.4,1.55,.4,12),metal,selected.length,{name:'Bases de ventilación'});
  const blades=createDetailInstances(group,new THREE.BoxGeometry(2.45,.08,.32),metal,selected.length*3,{name:'Aspas de ventilación',dynamic:true});
  const lenses=createDetailInstances(group,new THREE.SphereGeometry(.2,8,6),light,selected.length,{name:'Luces de ventilación',dynamic:true});
  const beacons=createDetailInstances(group,new THREE.CylinderGeometry(.12,.12,1,6),light,selected.length,{name:'Balizas urbanas'});
  const batches=[bases,blades,lenses,beacons];
  selected.forEach(({box,position},i)=>{
    const center=box.getCenter(new THREE.Vector3()),base=new THREE.Group();base.position.copy(position??new THREE.Vector3(center.x,box.max.y,center.z));base.position.y+=.3;base.name='Ventilación urbana';group.add(base);vents.push(base.position.clone());
    bases.add(base);detailCount+=6;
    const rotor=new THREE.Group();rotor.position.y=.28;base.add(rotor);
    for(let j=0;j<3;j++){const blade=blades.add(rotor);blade.rotation.y=j*Math.PI/3;}
    lenses.add(rotor).position.y=.15;fans.push(rotor);
    const beacon=beacons.add(base);beacon.position.set(1.7,.5,0);
  });
  const count=vents.length*(mobile?8:14),positions=new Float32Array(count*3),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const steam=new THREE.Points(geometry,new THREE.PointsMaterial({color:0xc5dbd9,size:.7,transparent:true,opacity:.24,depthWrite:false}));steam.name='Vapor industrial';steam.frustumCulled=false;group.add(steam);detailCount+=count;
  let tick=-1;
  batches.forEach(batch=>batch.update());
  return {detailCount,update(time,reduced,{night=false}={}){
    const t=reduced?0:time,next=Math.floor(t*18);
    for(const material of signals){material.emissive.copy(material.color);material.emissiveIntensity=(night?.9:.08)*(reduced?1:.93+Math.sin(t*.7)*.07);}
    if(next!==tick){tick=next;fans.forEach((fan,i)=>fan.rotation.y=t*(2+i*.15));
      for(let i=0;i<count;i++){const origin=vents[i%vents.length],life=(t*.18+i*.137)%1,a=i*2.4+t*.2;positions[i*3]=origin.x+Math.sin(a)*life*2;positions[i*3+1]=origin.y+.6+life*7;positions[i*3+2]=origin.z+Math.cos(a)*life*2;}geometry.attributes.position.needsUpdate=true;
    }
    steam.visible=!reduced;batches.forEach(batch=>batch.update());
  }};
}
