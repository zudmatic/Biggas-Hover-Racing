import * as THREE from 'three';
import {natureAssets} from './nature-assets.js';
import {natureMaterial} from './nature-material.js';

export function createIndoorPlant() {
  const foliage=new THREE.Group();foliage.name='Follaje de la planta';
  foliage.position.y=.6;foliage.scale.setScalar(.58);
  const shoots=new THREE.Group();shoots.name='Brotes de la planta';foliage.add(shoots);
  let material=null;
  const ready=natureAssets.load('Bush_Common').then(({scene})=>{
    scene.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(scene),size=bounds.getSize(new THREE.Vector3());
    const center=bounds.getCenter(new THREE.Vector3()),model=new THREE.Group();
    // A slender houseplant that fits between the bed, desk and back wall.
    // Normalize under the growing shoots, so their roots remain on the soil.
    scene.position.set(-center.x,-bounds.min.y,-center.z);
    model.scale.set(.72/size.x,.95/size.y,.68/size.z);model.add(scene);shoots.add(model);
    scene.traverse(mesh=>{
      if(!mesh.isMesh)return;
      mesh.material=natureMaterial(mesh.material);material??=mesh.material;
      mesh.castShadow=true;mesh.receiveShadow=false;
    });
  });
  function update(growth,{watering=false,time=0,reducedMotion=false}={}) {
    const maturity=THREE.MathUtils.smoothstep(growth,0,1);
    foliage.scale.setScalar(THREE.MathUtils.lerp(.58,1,maturity));
    shoots.scale.set(THREE.MathUtils.lerp(.65,1,maturity),THREE.MathUtils.lerp(.85,1,maturity),THREE.MathUtils.lerp(.65,1,maturity));
    shoots.rotation.x=THREE.MathUtils.lerp(-.16,0,maturity)+(watering&&!reducedMotion?Math.sin(time*5)*.025:0);
  }
  update(0);
  return {foliage,ready,update,get material(){return material;}};
}
