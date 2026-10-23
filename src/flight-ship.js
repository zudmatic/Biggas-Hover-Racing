import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createSpaceshipPilot} from './spaceship-pilot.js';
import {shipConfig,shipUrl,shipCanopy} from './ship-catalog.js';

export async function createFlightShip(id='033'){
  const config=shipConfig(id);
  const source=(await new GLTFLoader().loadAsync(shipUrl(config.id))).scene;
  source.updateMatrixWorld(true);
  const canopy=shipCanopy(source,config),excluded=new Set();if(config.removeCanopyInFlight)canopy?.traverse(o=>excluded.add(o));
  const batches=new Map(),headlamps=new Map(),root=new THREE.Group();root.name=`${config.title} · vuelo`;root.userData.vehicle=config.id;
  source.traverse(mesh=>{
    if(!mesh.isMesh||excluded.has(mesh))return;
    let geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    if(geometry.index){const indexed=geometry;geometry=indexed.toNonIndexed();indexed.dispose();}
    for(const attribute of Object.keys(geometry.attributes))if(!['position','normal','uv'].includes(attribute))geometry.deleteAttribute(attribute);
    if(!geometry.attributes.uv)geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));
    let material=mesh.material;
    // Front lamp lenses share their source material with cockpit instruments.
    // Separate only the lamps so switching F never darkens Zud's dashboard.
    if(config.lampName.test(mesh.name)){
      if(!headlamps.has(material)){const lamp=material.clone();lamp.emissiveIntensity=0;lamp.userData.headlight=true;headlamps.set(material,lamp);}
      material=headlamps.get(material);
    }
    if(!batches.has(material))batches.set(material,[]);
    batches.get(material).push(geometry);
  });
  for(const [material,geometries] of batches){
    const geometry=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());
    const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
  }
  source.traverse(mesh=>{if(mesh.isMesh)mesh.geometry.dispose();});
  const pilot=createSpaceshipPilot({offset:config.pilotOffset});pilot.root.visible=true;root.add(pilot.root);
  const plumes=[];
  const glow=new THREE.MeshBasicMaterial({color:0xa6efff,transparent:true,opacity:.7,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
  for(const [x,y,z,radius] of config.exhausts){
    const plume=new THREE.Mesh(new THREE.ConeGeometry(radius,1,8,1,true),glow);plume.rotation.x=-Math.PI/2;plume.position.set(x,y,z-.5);plume.userData.outlet=z;root.add(plume);plumes.push(plume);
  }
  return {root,pilot,config,dispose(){
    pilot.dispose();const geometries=new Set(),materials=new Set(),textures=new Set();
    for(const tree of [source,root])tree.traverse(mesh=>{if(!mesh.isMesh)return;geometries.add(mesh.geometry);for(const material of [].concat(mesh.material)){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}});
    for(const material of headlamps.values())materials.add(material);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());root.removeFromParent();
  },setHeadlights(enabled){for(const [source,material] of headlamps)material.emissiveIntensity=enabled?source.emissiveIntensity:0;},update(time,speed,boost,reduced,state){
    pilot.update(Math.floor(time*24)/24,!reduced&&speed>1);
    const pulse=reduced?1:1+Math.sin(time*31)*.08;
    const length=(.35+speed*.012+(boost?1.3:0))*pulse;
    for(const plume of plumes){plume.scale.y=length;plume.position.z=plume.userData.outlet-length*.5;}
    glow.color.setHex(boost?0xc1f6ff:state?.braking?0xff7053:0xffa45b);glow.opacity=boost?.85:.6;
  }};
}
