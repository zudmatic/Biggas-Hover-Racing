import * as THREE from 'three';

// An exact any-hit query: reject world-space bounds first, then stop at the
// first real triangle hit. Unlike intersectObjects, no full hit list is sorted.
export function createOcclusionQuery() {
  const entries=new Map(),active=[],hits=[],cache=new Map(),boundsVersions=new WeakMap();
  const raycaster=new THREE.Raycaster();
  const stats={rays:0,triangleQueries:0,cacheHits:0};
  const visible=object=>{for(let node=object;node;node=node.parent)if(!node.visible)return false;return true;};
  function sync(objects){
    let changed=false;active.length=0;
    const present=new Set(objects);
    for(const object of entries.keys())if(!present.has(object)){entries.delete(object);changed=true;}
    for(const object of objects){
      const shown=visible(object),geometry=object.geometry;
      let entry=entries.get(object);
      if(!entry){entry={object,matrix:new THREE.Matrix4(),box:new THREE.Box3()};entries.set(object,entry);changed=true;}
      const version=geometry?.attributes.position?.version;
      if(entry.geometry!==geometry||entry.version!==version||!entry.matrix.equals(object.matrixWorld)||entry.shown!==shown||entry.material!==object.material||entry.side!==object.material?.side){
        changed=true;entry.geometry=geometry;entry.version=version;entry.shown=shown;
        entry.material=object.material;entry.side=object.material?.side;entry.matrix.copy(object.matrixWorld);
        // Skinned/instanced meshes keep their exact raycast path: their bounds
        // depend on more than the object's matrix and position attribute.
        entry.simple=Boolean(geometry)&&!object.isSkinnedMesh&&!object.isInstancedMesh&&!object.morphTargetInfluences;
        if(entry.simple){
          if(!geometry.boundingBox||boundsVersions.get(geometry)!==version){geometry.computeBoundingBox();boundsVersions.set(geometry,version);}
          entry.box.copy(geometry.boundingBox).applyMatrix4(object.matrixWorld);
        }
      }
      if(shown)active.push(entry);
      if(!entry.simple)changed=true;
    }
    if(changed)cache.clear();
  }
  function unblocked(origin,direction,distance){
    stats.rays++;
    const key=`${origin.x},${origin.y},${origin.z}/${direction.x},${direction.y},${direction.z}/${distance}`;
    if(cache.has(key)){stats.cacheHits++;return cache.get(key);}
    raycaster.set(origin,direction);raycaster.near=.035;raycaster.far=distance;
    let clear=true;
    for(const entry of active){
      if(entry.simple&&!raycaster.ray.intersectsBox(entry.box))continue;
      hits.length=0;stats.triangleQueries++;entry.object.raycast(raycaster,hits);
      if(hits.length){clear=false;break;}
    }
    // Camera-independent sun/lamp rays normally repeat. Bound the cache when
    // the sun moves continuously or an editor drags a source through the room.
    if(cache.size>=2048)cache.clear();cache.set(key,clear);return clear;
  }
  return {sync,unblocked,stats};
}
