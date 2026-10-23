import * as THREE from 'three';

// A single sewn sheet, including its underside and hem. Shared grid vertices
// keep the cloth continuous while it rises over the sleeping pose.
export function createBedBlanketGeometry() {
  const columns=40,rows=48,stride=columns+1,layerSize=stride*(rows+1);
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(layerSize*2*3),3));
  const indices=[];
  for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
    const a=row*stride+column,b=a+1,c=a+stride,d=c+1;
    indices.push(a,c,b,b,c,d);
    indices.push(a+layerSize,b+layerSize,c+layerSize,b+layerSize,d+layerSize,c+layerSize);
  }
  const perimeter=[];
  for(let c=0;c<=columns;c++)perimeter.push(c);
  for(let r=1;r<=rows;r++)perimeter.push(r*stride+columns);
  for(let c=columns-1;c>=0;c--)perimeter.push(rows*stride+c);
  for(let r=rows-1;r>0;r--)perimeter.push(r*stride);
  for(let i=0;i<perimeter.length;i++){
    const a=perimeter[i],b=perimeter[(i+1)%perimeter.length];
    indices.push(a,b,a+layerSize,b,b+layerSize,a+layerSize);
  }
  geometry.setIndex(indices);
  function update(amount) {
    const positions=geometry.attributes.position;
    for(let row=0;row<=rows;row++)for(let column=0;column<=columns;column++){
      const x=(column/columns-.5)*1.40,t=row/rows;
      // The curved neckline covers the shoulders without covering the face.
      const neck=.11*Math.exp(-Math.pow(x/.18,4));
      const z=THREE.MathUtils.lerp(-.57+neck*amount,1.18,t);
      const across=Math.pow(Math.max(0,1-Math.pow(Math.abs(x)/.70,4)),.6);
      const along=1-THREE.MathUtils.smoothstep(z,-.06,.85);
      const folds=.008*Math.sin(x*25+z*5)*Math.sin(t*Math.PI);
      const y=.93+.68*across*along*amount+folds;
      const i=row*stride+column;
      positions.setXYZ(i,x,y,z);positions.setXYZ(i+layerSize,x,y-.045,z);
    }
    positions.needsUpdate=true;
    geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  }
  update(0);
  return {geometry,update};
}
