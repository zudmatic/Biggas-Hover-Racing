import * as THREE from 'three';
import {createBiggasWater} from './biggas-water.js';
import {createBiggasVisibility} from './biggas-city-visibility.js';
import {createBiggasLightingBatches,collectBiggasStaticLighting,createBiggasBuildingLights} from './biggas-city-lighting.js';

const randomSource=()=>{let seed=39039;return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};};

export function createBiggasCityDetails(root,landscape,{waters,fixtures,instances=[],lightingMeshes=[]},{mobile=false,windAt}={}){
  const random=randomSource(),group=new THREE.Group();group.name='Biggas City · ambiente';root.add(group);
  const transform=new THREE.Object3D();let lastTick=-1;
  // Leaves are distributed along authored forest sectors, close enough to the
  // road to read from the cockpit, without filling the city with particles.
  const forest=landscape.samples.filter(sample=>sample.sector==='FOREST'),count=mobile?140:240;
  const leafGeometry=new THREE.BufferGeometry();
  leafGeometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,-.32,-.13,0,0,0,.045,.3,.13,0,0,0,.05,0],3));
  leafGeometry.setIndex([0,1,4,1,2,4,2,3,4,3,0,4]);leafGeometry.computeVertexNormals();
  const leafMaterial=new THREE.MeshStandardMaterial({name:'Forest airborne leaves',color:0xffffff,roughness:.9,side:THREE.DoubleSide});
  const leaves=new THREE.InstancedMesh(leafGeometry,leafMaterial,forest.length?count:0);leaves.name='Hojas del bosque';leaves.frustumCulled=false;leaves.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(leaves);
  const leafSeeds=Array.from({length:leaves.count},(_,i)=>{
    const branch=landscape.branches?.find(b=>b.id==='roots'),local=branch&&i%3===0?branch.samples[Math.floor(i/leaves.count*branch.samples.length)]:null;
    const sample=forest[Math.floor(i/leaves.count*forest.length)],[x,y,z]=local?[local.x,local.y,local.z]:sample.position,[nx,,nz]=local?[local.nx,0,local.nz]:sample.forward,side=(random()-.5)*((local?.width??sample.width_m)+10);
    leaves.setColorAt(i,new THREE.Color([0x82964a,0xb1aa4b,0xc28638,0x527f49][i%4]));
    return {x:x-nz*side,y,z:z+nx*side,phase:random(),speed:.05+random()*.035,size:.65+random()*.8};
  });
  const visibility=createBiggasVisibility(instances);
  const water=createBiggasWater(group,waters,{mobile,random});
  // Every authored fixture owns a permanent light. Finite light ranges describe
  // physical falloff; neither the ship position nor day/night relocates a light.
  const pointPool=[],spotPool=[];
  for(const fixture of fixtures){
    const light=fixture.spot
      ?new THREE.SpotLight(fixture.color,Math.min(fixture.intensity,1800),110,fixture.angle,fixture.penumbra,2)
      :new THREE.PointLight(fixture.color,Math.min(fixture.intensity,420),38,2);
    light.position.copy(fixture.position);group.add(light);
    if(fixture.spot){light.target.position.copy(fixture.target);group.add(light.target);spotPool.push(light);}
    else pointPool.push(light);
  }
  root.traverse(mesh=>{if(mesh.isMesh&&mesh.material.emissive?.getHex())mesh.material.emissiveIntensity=Math.min(mesh.material.emissiveIntensity,3);});
  const lightingBatches=createBiggasLightingBatches(collectBiggasStaticLighting(root,lightingMeshes),[...pointPool,...spotPool]);
  const buildingLights=createBiggasBuildingLights(root);
  landscape.configureLighting=lightingBatches.setGlobalLights;
  function update(time,reduced,{phase,camera,shadowLight,state,night=false}={}){
    buildingLights.update(night);
    visibility.update(camera,shadowLight);
    water.update(time,reduced,phase,camera);leaves.visible=!reduced;
    const t=reduced?0:time,tick=Math.floor(t*30);if(phase==='paused'||tick===lastTick)return;lastTick=tick;
    leafSeeds.forEach((seed,i)=>{
      const cycle=(seed.phase+t*seed.speed)%1,angle=t*.8+seed.phase*Math.PI*2;
      transform.position.set(seed.x+Math.sin(angle*.7)*3+cycle*5,seed.y+1+(1-cycle)*8+Math.sin(angle)*.45,seed.z+Math.cos(angle*.6)*3);
      if(!reduced&&state){
        const dx=transform.position.x-state.x,dz=transform.position.z-state.z,d=Math.hypot(dx,dz),wake=Math.max(0,1-d/12)*Math.min(1,state.speed/35);
        transform.position.x+=dx/Math.max(1,d)*wake*3;transform.position.z+=dz/Math.max(1,d)*wake*3;transform.position.y+=wake*2;
      }
      if(!reduced&&windAt){const wind=windAt(seed.x,seed.z,t);transform.position.x+=wind.x*cycle*4;transform.position.z+=wind.z*cycle*4;}
      transform.rotation.set(angle*1.7,angle*.8,Math.sin(angle)*.9);transform.scale.setScalar(seed.size);transform.updateMatrix();leaves.setMatrixAt(i,transform.matrix);
    });leaves.instanceMatrix.needsUpdate=true;
  }
  update(0,false);
  return {update,visibility,lightingBatches,buildingLights,detailCount:leaves.count+water.detailCount,leaves,spray:water.spray,waters,pointPool,spotPool,dispose(){delete landscape.configureLighting;water.dispose();for(const light of [...pointPool,...spotPool])light.dispose();}};
}
