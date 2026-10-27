import * as THREE from 'three/webgpu';

// Measures where each nozzle's housing ends in the ship model, so the flame can start at the mouth.
// Root-local model units; nozzles fire toward -z. Each vertex belongs only to its nearest nozzle (by radius),
// so a big housing never claims a small neighbour; the inner radial cut skips hot cores, the axial window keeps
// unrelated hull geometry further back from pulling the exit plane. Subtrees flagged nozzleInsert (the engine
// core) are skipped: they report their own mouth analytically.
export function measureNozzleMouths(root,nozzles){
  root.updateMatrixWorld(true);
  const toRoot=root.matrixWorld.clone().invert(),matrix=new THREE.Matrix4(),point=new THREE.Vector3();
  const hits=nozzles.map(()=>[]);
  (function visit(object){
    if(object.userData.nozzleInsert)return;
    const position=object.isMesh?object.geometry?.attributes?.position:null;
    if(position){
      matrix.multiplyMatrices(toRoot,object.matrixWorld);
      for(let i=0;i<position.count;i++){
        point.fromBufferAttribute(position,i).applyMatrix4(matrix);
        let nearest=-1,best=Infinity,radial=0;
        nozzles.forEach(([x,y,,r],n)=>{const d=Math.hypot(point.x-x,point.y-y);if(d/r<best){best=d/r;nearest=n;radial=d;}});
        if(nearest<0)continue;
        const [,,z,r]=nozzles[nearest];
        if(radial>=.5*r&&radial<=2.5*r&&point.z>=z-6*r&&point.z<=z+r)hits[nearest].push(radial,point.z);
      }
    }
    for(const child of object.children)visit(child);
  })(root);
  return nozzles.map(([,,z,r],n)=>{
    const found=hits[n];
    if(!found.length)return {start:0,radius:1.1*r};
    let rear=Infinity,radius=Infinity;
    for(let i=1;i<found.length;i+=2)rear=Math.min(rear,found[i]);
    for(let i=0;i<found.length;i+=2)if(found[i+1]<=rear+.25*r)radius=Math.min(radius,found[i]);
    return {start:Math.max(0,z-rear),radius};
  });
}

// The flame roots at whichever exit is further back; while the engine insert is shown, its lip sets the width.
export function combineMouths(model,engine){
  return engine?model.map((mouth,i)=>({start:Math.max(mouth.start,engine[i].start),radius:engine[i].radius})):model;
}
