import * as THREE from 'three/webgpu';
import {uniform,normalLocal,float,smoothstep,mix} from 'three/tsl';

// A physical nozzle insert: bevelled metal lip, recessed hot chamber and curved core.
export function createEngineCore(ship,nozzles=[[-.68,.62,-2.14,.24],[.68,.62,-2.14,.24]]){
  const heat=uniform(0),intensity=uniform(1),edge=uniform(new THREE.Color('#ff5812')),center=uniform(new THREE.Color('#fff1b0'));
  const material=new THREE.MeshStandardNodeMaterial({roughness:.55,metalness:.25,color:'#77350f'});
  const facing=normalLocal.z.negate().max(0);
  material.emissiveNode=mix(edge,center,smoothstep(float(.25),float(.95),facing)).mul(heat).mul(intensity).mul(1.3);
  const rimMaterial=new THREE.MeshStandardNodeMaterial({color:'#6e3320',roughness:.65,metalness:.55});
  rimMaterial.emissiveNode=edge.mul(heat).mul(intensity).mul(.5);
  const metal=new THREE.MeshStandardNodeMaterial({color:'#303d43',roughness:.58,metalness:.65,flatShading:true});
  const chamberMaterial=new THREE.MeshStandardNodeMaterial({color:'#351b12',roughness:.8,metalness:.2,side:THREE.DoubleSide});
  chamberMaterial.emissiveNode=edge.mul(heat).mul(intensity).mul(.16);
  const profile=[[.30,-.09],[.32,-.01],[.31,.055],[.28,.08],[.245,.045],[.22,-.09]].map(([r,y])=>new THREE.Vector2(r,y));
  const lip=new THREE.LatheGeometry(profile,16);lip.rotateX(-Math.PI/2);
  const chamber=new THREE.CylinderGeometry(.245,.16,.18,16,1,true);chamber.rotateX(-Math.PI/2);
  const core=new THREE.SphereGeometry(.195,20,12);core.scale(1,1,.62);
  const ring=new THREE.TorusGeometry(.24,.018,6,16);
  const rib=new THREE.BoxGeometry(.036,.075,.1);
  const cores=[];
  for(const [x,y,z,radius] of nozzles){
    const group=new THREE.Group();group.position.set(x,y,z-.05);
    group.add(new THREE.Mesh(lip,metal));
    const bowl=new THREE.Mesh(chamber,chamberMaterial);bowl.position.z=.025;group.add(bowl);
    const bulb=new THREE.Mesh(core,material);bulb.position.z=.015;group.add(bulb);
    const hotRing=new THREE.Mesh(ring,rimMaterial);hotRing.position.z=-.045;group.add(hotRing);
    for(let i=0;i<8;i++){const angle=i*Math.PI/4,fin=new THREE.Mesh(rib,metal);fin.position.set(Math.sin(angle)*.285,Math.cos(angle)*.285,-.005);fin.rotation.z=-angle;group.add(fin);}
    ship.add(group);
    const light=new THREE.PointLight('#ff5812',0,1.8,2);light.position.set(x,y,z-.31);ship.add(light);
    cores.push({group,light,radius});
  }
  let temperature=0;
  return {
    update(dt,time,power,settings){
      const target=.05+power*.95;
      temperature+=(target-temperature)*(1-Math.exp(-dt/(target>temperature?.12:settings.Enfriamiento)));
      heat.value=temperature*(1+Math.sin(time*27)*settings.Pulsación);
      intensity.value=settings.Intensidad;edge.value.set(settings['Color borde']);center.value.set(settings['Color centro']);
      for(const {group,light,radius} of cores){
        group.visible=settings.Activo;group.scale.set(settings.Tamaño,settings.Tamaño,settings.Tamaño*settings.Profundidad).multiplyScalar(radius/.24);
        light.color.copy(edge.value);light.intensity=settings.Activo?temperature*settings['Luz cercana']:0;
      }
    },
    dispose(){for(const {group,light} of cores){ship.remove(group,light);light.dispose();}for(const resource of [lip,chamber,core,ring,rib,material,rimMaterial,metal,chamberMaterial])resource.dispose();}
  };
}
