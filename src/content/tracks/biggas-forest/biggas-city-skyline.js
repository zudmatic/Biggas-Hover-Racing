import * as THREE from 'three';

// Add real floors to a few existing towers. The entrance, footprint, windows
// and roof details keep their proportions; all original materials are reused.
const towers=new Map([
  ['039_Asset_office_tower001',2],['039_Asset_office_tower002',3],
  ['039_Asset_office_tower005',5],['039_Asset_office_tower007',4],
  ['039_Asset_office_tower009',3],
]);
const pitch=70/19,bandHeight=pitch*8,cut=33;
function extendFloors(source,blocks){
  const input=source.index?source.toNonIndexed():source,position=input.attributes.position,selected=[];
  for(let i=0;i<position.count;i+=3){
    const ys=[position.getY(i),position.getY(i+1),position.getY(i+2)];
    if(Math.min(...ys)>cut-bandHeight&&Math.max(...ys)<cut)selected.push(i,i+1,i+2);
  }
  const result=new THREE.BufferGeometry();
  for(const [name,attribute] of Object.entries(input.attributes)){
    const values=new attribute.array.constructor((attribute.count+selected.length*blocks)*attribute.itemSize);values.set(attribute.array);
    if(name==='position')for(let i=0;i<attribute.count;i++)if(values[i*3+1]>cut)values[i*3+1]+=blocks*bandHeight;
    for(let block=1;block<=blocks;block++)for(let i=0;i<selected.length;i++){
      const from=selected[i]*attribute.itemSize,to=(attribute.count+(block-1)*selected.length+i)*attribute.itemSize;
      for(let component=0;component<attribute.itemSize;component++)values[to+component]=attribute.array[from+component]+(name==='position'&&component===1?block*bandHeight:0);
    }
    result.setAttribute(name,new THREE.BufferAttribute(values,attribute.itemSize,attribute.normalized));
  }
  if(input!==source)input.dispose();result.computeBoundingBox();result.computeBoundingSphere();return result;
}

export function raiseBiggasSkyline(assets){
  const cache=new Map(),raised=[];
  for(const asset of assets){asset.scene.updateMatrixWorld(true);const selected=[];
    asset.scene.traverse(object=>{if(towers.has(object.name)&&!object.userData.biggasRaised&&object.children.some(c=>c.isMesh))selected.push(object);});
    for(const object of selected){
      const before=new THREE.Box3().setFromObject(object),blocks=towers.get(object.name);
      object.traverse(mesh=>{if(!mesh.isMesh)return;const key=`${mesh.geometry.uuid}:${blocks}`;if(!cache.has(key))cache.set(key,extendFloors(mesh.geometry,blocks));mesh.geometry=cache.get(key);});
      object.userData.biggasRaised=true;const after=new THREE.Box3().setFromObject(object);
      raised.push({name:object.name,addedFloors:blocks*8,before,after,height:after.max.y-after.min.y});
    }
  }
  return raised;
}
