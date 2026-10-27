import * as THREE from 'three';

// Distances are measured from the ship, not the orbit/follow camera. Level 3
// means culled. Separate enter/exit thresholds prevent boundary oscillation.
export function selectDesertLod(distance,previous,distances,cullDistance,hysteresis=.12){
  const limits=[...distances,cullDistance??Infinity];
  if(previous<0)return distance<limits[0]?0:distance<limits[1]?1:distance<limits[2]?2:3;
  let level=previous;
  while(level<3&&distance>limits[level]*(1+hysteresis))level++;
  while(level>0&&distance<limits[level-1]*(1-hysteresis))level--;
  return level;
}

// Loaded once, drawn by distance. Each spatial/species batch has three reusable
// buffers; only level changes upload matrices. No per-plant Object3D traversal.
export function createDesertLod(root,asset,manifest,{cellSize=96,maxInstances=128,mode='adaptive'}={}){
  asset.updateMatrixWorld(true);
  const group=new THREE.Group();group.name='Desert detail · ship distance LOD';root.add(group);
  const batches=[],matrix=new THREE.Matrix4(),point=new THREE.Vector3(),anchor=new THREE.Vector3(Infinity,Infinity,Infinity);
  const stats={mode,instances:manifest.instanceCount,vegetation:manifest.vegetationCount,levels:[0,0,0],culled:0,triangles:0,fullTriangles:0,batches:0,switches:0,updates:0,updateMs:0};
  const removals=[];
  const replaced=new Set(manifest.replacements.map(x=>x.source));
  for(const family of manifest.families)if(family.replacesSource)replaced.add(family.replacesSource);
  root.traverse(o=>{
    if(o.userData.role==='vegetation'||replaced.has(o.userData.source_object))removals.push(o);
  });
  // Collision has already captured these geometries in its immutable octree.
  for(const o of removals)o.removeFromParent();
  const replacementMeshes=new Map();asset.traverse(o=>{if(o.userData.replaces_source)replacementMeshes.set(o.userData.replaces_source,o);});
  for(const replacement of manifest.replacements){
    const mesh=replacementMeshes.get(replacement.source);
    if(!mesh?.isMesh)throw new Error(`Missing desert replacement: ${replacement.node}`);
    mesh.userData.visualDetail=true;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  }
  for(const family of manifest.families){
    const prototypes=family.nodes.map(name=>{
      const mesh=asset.getObjectByName(name);
      if(!mesh?.isMesh)throw new Error(`Missing desert LOD: ${name}`);
      mesh.geometry.computeBoundingBox();return mesh;
    });
    // KHR_mesh_quantization may move dequantization into each prototype's
    // transform. Keep it after the authored placement, for every LOD level.
    const prototypeMatrices=prototypes.map(prototype=>prototype.matrixWorld.clone());
    const cells=new Map();
    for(const placement of family.placements){
      const a=placement.matrix,key=`${Math.floor(a[12]/cellSize)},${Math.floor(a[14]/cellSize)}`;
      if(!cells.has(key))cells.set(key,[]);cells.get(key).push(a);
    }
    for(const [cell,placements] of cells)for(let offset=0;offset<placements.length;offset+=maxInstances){
      const matrices=placements.slice(offset,offset+maxInstances),states=new Int8Array(matrices.length).fill(-1);
      const bounds=family.role==='mesa'?matrices.map(a=>prototypes[0].geometry.boundingBox.clone().applyMatrix4(matrix.fromArray(a).multiply(prototypeMatrices[0]))):null;
      const meshes=prototypes.map((prototype,level)=>{
        const mesh=new THREE.InstancedMesh(prototype.geometry,prototype.material,matrices.length);
        mesh.name=`LOD_${family.id}_${cell}_${offset}_${level}`;mesh.userData={detailFamily:family.id,lodLevel:level,visualDetail:true};
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        matrices.forEach((a,i)=>mesh.setMatrixAt(i,matrix.fromArray(a).multiply(prototypeMatrices[level])));
        // Bounds cover all candidate instances, including those currently at a
        // different LOD. Never cache an empty bound after count becomes zero.
        mesh.computeBoundingBox();mesh.computeBoundingSphere();mesh.count=0;mesh.visible=false;
        mesh.castShadow=family.role==='mesa'||level===0||(family.id.startsWith('Art28_')&&level===1);mesh.receiveShadow=true;group.add(mesh);return mesh;
      });
      batches.push({family,matrices,states,bounds,meshes,prototypeMatrices});
      stats.fullTriangles+=matrices.length*family.triangles[0];
    }
  }
  stats.batches=batches.length*3;
  let elapsed=Infinity,dirty=true;
  function update(state,dt=0,force=false){
    elapsed+=dt;point.set(state.x,state.y,state.z);
    if(!force&&!dirty&&(elapsed<.12||point.distanceToSquared(anchor)<4))return;
    const start=performance.now();anchor.copy(point);elapsed=0;stats.levels.fill(0);stats.culled=0;stats.triangles=0;
    for(const batch of batches){
      const {family,matrices,states,bounds,meshes,prototypeMatrices}=batch;let changed=dirty;
      for(let i=0;i<matrices.length;i++){
        const a=matrices[i],distance=bounds?bounds[i].distanceToPoint(point):Math.hypot(a[12]-point.x,a[13]-point.y,a[14]-point.z);
        const next=mode==='full'?0:selectDesertLod(distance,states[i],family.distances,family.cullDistance,manifest.hysteresis);
        if(next!==states[i]){if(states[i]>=0)stats.switches++;states[i]=next;changed=true;}
        if(next===3)stats.culled++;else{stats.levels[next]++;stats.triangles+=family.triangles[next];}
      }
      if(changed){
        const counts=[0,0,0];
        for(let i=0;i<matrices.length;i++)if(states[i]<3)meshes[states[i]].setMatrixAt(counts[states[i]]++,matrix.fromArray(matrices[i]).multiply(prototypeMatrices[states[i]]));
        meshes.forEach((mesh,level)=>{mesh.count=counts[level];mesh.visible=mesh.count>0;mesh.instanceMatrix.needsUpdate=true;});
      }
    }
    dirty=false;stats.updates++;stats.updateMs=performance.now()-start;
  }
  return {group,stats,update,
    setMode(value){mode=value==='full'?'full':'adaptive';stats.mode=mode;dirty=true;for(const b of batches)b.states.fill(-1);},
    dispose(){for(const b of batches)for(const m of b.meshes)m.dispose();group.removeFromParent();},
  };
}
