import * as THREE from 'three';

// A one-time shoreline distance field, generated from the actual banks/terrain
// and rock collision proxies before visual LOD meshes replace them.
// triangles. R = shore distance; G stays white because there is no boat mask.
export function createDesertWaterContact(root,surface){
  const resolution=512,maxDistance=4,epsilon=1e-5;
  root.updateWorldMatrix(true,true);
  const bounds=new THREE.Box3().setFromObject(surface);
  const valid=!bounds.isEmpty()&&[bounds.min.x,bounds.min.y,bounds.min.z,bounds.max.x,bounds.max.y,bounds.max.z].every(Number.isFinite);
  const minX=valid?bounds.min.x-maxDistance:0,minZ=valid?bounds.min.z-maxDistance:0;
  const sizeX=valid?Math.max(.001,bounds.max.x-bounds.min.x)+maxDistance*2:1;
  const sizeZ=valid?Math.max(.001,bounds.max.z-bounds.min.z)+maxDistance*2:1;
  const waterLevel=valid?(bounds.min.y+bounds.max.y)*.5:0;
  const bytes=new Uint8Array(resolution*resolution*4).fill(255);
  const pixelX=sizeX/resolution,pixelZ=sizeZ/resolution;
  const vertices=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];
  const intersections=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];
  const intersection=new THREE.Vector3();

  function rasterize(a,b){
    const dx=b.x-a.x,dz=b.z-a.z,lengthSquared=dx*dx+dz*dz;
    if(lengthSquared<epsilon*epsilon)return;
    // Keep the outermost texels white: ClampToEdge must never repeat foam
    // outside this padded water footprint.
    const x0=Math.max(1,Math.floor((Math.min(a.x,b.x)-maxDistance-minX)/pixelX));
    const x1=Math.min(resolution-2,Math.ceil((Math.max(a.x,b.x)+maxDistance-minX)/pixelX));
    const z0=Math.max(1,Math.floor((Math.min(a.z,b.z)-maxDistance-minZ)/pixelZ));
    const z1=Math.min(resolution-2,Math.ceil((Math.max(a.z,b.z)+maxDistance-minZ)/pixelZ));
    for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){
      const px=minX+(x+.5)*pixelX-a.x,pz=minZ+(z+.5)*pixelZ-a.z;
      const t=Math.max(0,Math.min(1,(px*dx+pz*dz)/lengthSquared));
      const distance=Math.hypot(px-t*dx,pz-t*dz);
      if(distance>=maxDistance)continue;
      const offset=(z*resolution+x)*4;
      bytes[offset]=Math.min(bytes[offset],Math.round(distance/maxDistance*255));
    }
  }

  if(valid)root.traverse(mesh=>{
    if(!mesh.isMesh||mesh.isInstancedMesh||mesh===surface||!/S07_(TERRAIN|BANK|CLIFF|TALUS)|DirtPillar/.test(mesh.name))return;
    const meshBounds=new THREE.Box3().setFromObject(mesh);
    if(meshBounds.min.y>waterLevel+epsilon||meshBounds.max.y<waterLevel-epsilon||!meshBounds.intersectsBox(bounds))return;
    const geometry=mesh.geometry,position=geometry?.attributes.position,index=geometry?.index;
    if(!position)return;
    const count=index?.count??position.count;
    for(let i=0;i+2<count;i+=3){
      for(let k=0;k<3;k++)vertices[k].fromBufferAttribute(position,index?index.getX(i+k):i+k).applyMatrix4(mesh.matrixWorld);
      const heights=vertices.map(v=>v.y-waterLevel),low=Math.min(...heights),high=Math.max(...heights);
      if(low>epsilon||high< -epsilon||heights.every(h=>Math.abs(h)<=epsilon))continue;
      let found=0;
      function add(point){
        for(let j=0;j<found;j++)if(intersections[j].distanceToSquared(point)<epsilon*epsilon)return;
        if(found<3)intersections[found++].copy(point);
      }
      for(let edge=0;edge<3;edge++){
        const next=(edge+1)%3,a=vertices[edge],b=vertices[next],ha=heights[edge],hb=heights[next];
        if(Math.abs(ha)<=epsilon)add(a);
        if((ha< -epsilon&&hb>epsilon)||(ha>epsilon&&hb< -epsilon)){
          intersection.copy(a).lerp(b,ha/(ha-hb));add(intersection);
        }
      }
      if(found>=2)rasterize(intersections[0],intersections[1]);
    }
  });

  const texture=new THREE.DataTexture(bytes,resolution,resolution,THREE.RGBAFormat);
  texture.name='Desert Valley shoreline distance';
  texture.colorSpace=THREE.NoColorSpace;
  texture.flipY=false;
  texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;
  texture.minFilter=texture.magFilter=THREE.LinearFilter;
  texture.generateMipmaps=false;
  texture.needsUpdate=true;
  return {texture,info:{minXZ:[minX,minZ],sizeXZ:[sizeX,sizeZ],maxDistance,waterLevel}};
}
