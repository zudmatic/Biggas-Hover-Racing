import * as THREE from 'three';
import {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {polishBiggasForest} from './biggas-city-polish.js';
import {raiseBiggasSkyline} from './biggas-city-skyline.js';
import {refineBiggasTerrain} from './biggas-city-terrain.js';
import {captureBiggasAdFacades} from './biggas-city-ads.js';

// Restore procedural colors omitted by glTF. Grass has its own greener base
// under the blade texture and baked patches, separate from tree foliage.
const proceduralColors={'Asfalto grafito':[.05,.0625,.071],'Basalto estratificado':[.165,.205,.195],'Vegetacion terreno':[.18,.29,.095]};

// Keep shared forest geometry instanced; batch unique architecture by material
// and spatial cell. Water stays separate so its authored shapes can move.
export function prepareBiggasCity(assets,root,textures){
  const skyline=raiseBiggasSkyline(assets),smoothTemplates=polishBiggasForest(assets,textures);
  const adFacades=captureBiggasAdFacades(assets);
  const repeats=new Map(),batches=new Map(),originals=new Set(),waters=[],fixtures=[],instances=[],lightingMeshes=[];
  const center=new THREE.Vector3(),foamParts=[];
  for(const asset of assets){
    asset.scene.updateMatrixWorld(true);
    asset.scene.traverse(object=>{
      if(object.isLight){
        const position=object.getWorldPosition(new THREE.Vector3()),target=object.target?.getWorldPosition(new THREE.Vector3());
        fixtures.push({position,target,color:object.color.clone(),intensity:object.intensity,distance:object.distance,angle:object.angle,penumbra:object.penumbra,spot:!!object.isSpotLight});return;
      }
      if(!object.isMesh)return;
      // The export accidentally repeats one statue toe in every collection.
      if(object.name.startsWith('CAT_Medallion_paw_toe')&&!asset.scene.userData.landmark)return;
      originals.add(object.geometry);
      const palette=proceduralColors[object.material.name];
      if(palette&&object.material.color.getHex()===0xffffff)object.material.color.setRGB(...palette);
      const key=`${object.geometry.uuid}:${object.material.uuid}`;
      if(!repeats.has(key))repeats.set(key,[]);repeats.get(key).push(object);
    });
  }
  for(const objects of repeats.values()){
    const source=objects[0],material=source.material;
    if(objects.length>3){
      const prepared=source.geometry.clone();textures.apply(new THREE.Mesh(prepared,material));
      // The export repeats vertices for every triangle even on smooth trees.
      // Reuse identical attribute tuples without changing faces or silhouettes.
      const geometry=mergeVertices(prepared,1e-6);prepared.dispose();
      const cells=new Map(),capacity=256;
      for(const object of objects){center.setFromMatrixPosition(object.matrixWorld);const cell=`${Math.floor(center.x/640)},${Math.floor(center.z/640)}`;if(!cells.has(cell))cells.set(cell,[]);cells.get(cell).push(object);}
      for(const cell of cells.values())for(let offset=0;offset<cell.length;offset+=capacity){
        // Fixed buffer capacity shares shader layouts across cells, while count
        // draws only populated instances. Bounds keep distant forest culled.
        const items=cell.slice(offset,offset+capacity),mesh=new THREE.InstancedMesh(geometry,material,capacity);mesh.count=items.length;mesh.name=material.name;
        items.forEach((object,i)=>mesh.setMatrixAt(i,object.matrixWorld));mesh.computeBoundingSphere();mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);instances.push(mesh);lightingMeshes.push(mesh);
      }
      continue;
    }
    for(const object of objects){
      let geometry=object.geometry.clone().applyMatrix4(object.matrixWorld);
      if(material.name==='Vegetacion terreno'){
        if(!geometry.userData.biggasTerrain){const original=geometry;geometry=refineBiggasTerrain(original);original.dispose();}
        material.vertexColors=true;
      }
      if(geometry.index){const indexed=geometry;geometry=indexed.toNonIndexed();indexed.dispose();}
      for(const key of Object.keys(geometry.attributes))if(!['position','normal','uv','color'].includes(key))geometry.deleteAttribute(key);
      const mesh=new THREE.Mesh(geometry,material);mesh.name=object.name;textures.apply(mesh);
      if(!geometry.attributes.uv)geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));
      if(material.name==='Espuma'&&!/waterfall|cascade|streak/i.test(object.name)){foamParts.push({geometry,material});continue;}
      if(/Agua glacial|Espuma/.test(material.name)){
        const fall=/waterfall|cascade|streak/i.test(object.name);mesh.castShadow=false;mesh.receiveShadow=true;root.add(mesh);
        geometry.computeBoundingBox();waters.push({mesh,fall,foam:material.name==='Espuma',box:geometry.boundingBox.clone(),base:geometry.attributes.position.array.slice()});continue;
      }
      geometry.computeBoundingBox();geometry.boundingBox.getCenter(center);
      // Larger opaque batches reduce draw calls without changing geometry.
      // Keep transparent ordering at the original cell size.
      const cellSize=material.transparent?160:320;
      const key=`${material.uuid}:${Math.floor(center.x/cellSize)},${Math.floor(center.z/cellSize)}`;
      if(!batches.has(key))batches.set(key,{material,parts:[]});batches.get(key).parts.push(geometry);
    }
  }
  for(const {material,parts} of batches.values()){
    const merged=mergeGeometries(parts),geometry=mergeVertices(merged,1e-6);merged.dispose();
    geometry.userData.circuitUV=true;parts.forEach(g=>g.dispose());
    const mesh=new THREE.Mesh(geometry,material);mesh.name=material.name;mesh.castShadow=!/terreno|Glass/i.test(material.name);mesh.receiveShadow=true;root.add(mesh);lightingMeshes.push(mesh);
  }
  if(foamParts.length){
    const geometry=mergeGeometries(foamParts.map(p=>p.geometry));foamParts.forEach(p=>p.geometry.dispose());geometry.userData.circuitUV=true;geometry.computeBoundingBox();
    const mesh=new THREE.Mesh(geometry,foamParts[0].material);mesh.name='Espuma de impacto';mesh.receiveShadow=true;root.add(mesh);
    waters.push({mesh,fall:false,foam:true,box:geometry.boundingBox.clone(),base:geometry.attributes.position.array.slice()});
  }
  originals.forEach(g=>g.dispose());
  return {waters,fixtures,instances,smoothTemplates,skyline,adFacades,lightingMeshes};
}
