import * as THREE from 'three';

// The source kasa has a thin inner lining as well as its outer cone. Fitting
// both sheets independently to the head can push the lining through the crown.
// Keep the authored outer panels and render their reverse side as the lining.
export function kasaOuterShell(source) {
  const p=source.attributes.position,positions=[],triangle=new THREE.Triangle(),normal=new THREE.Vector3(),center=new THREE.Vector3();
  for(let i=0;i<p.count;i+=3){
    [triangle.a,triangle.b,triangle.c].forEach((point,j)=>point.fromBufferAttribute(p,i+j));
    triangle.getNormal(normal);triangle.getMidpoint(center);
    // Includes the outward-facing lower lip and the upward-facing tip.
    const radial=normal.x*center.x+normal.z*center.z;
    if(radial>1e-6||(Math.abs(radial)<=1e-6&&normal.y>0))
      for(const point of [triangle.a,triangle.b,triangle.c])positions.push(...point.toArray());
  }
  return new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
}

// A single swept surface avoids the folded, intersecting tip of the source crown.
export function wizardCrown() {
  const points=[[0,.70,0],[0,1.25,0],[.025,1.70,0],[.14,2.02,0],[.34,2.16,0],[.60,2.12,.008],[.85,2,.016]].map(p=>new THREE.Vector3(...p));
  const curve=new THREE.CatmullRomCurve3(points),radii=[1.045,.74,.45,.27,.18,.10,.008];
  const segments=64,sides=48,positions=[],indices=[];
  for(let row=0;row<=segments;row++){
    const t=row/segments,center=curve.getPoint(t),tangent=curve.getTangent(t).normalize();
    const x=new THREE.Vector3(tangent.y,-tangent.x,0).normalize(),z=new THREE.Vector3().crossVectors(x,tangent).normalize();
    const section=t*(radii.length-1),a=Math.min(radii.length-2,Math.floor(section)),r=THREE.MathUtils.lerp(radii[a],radii[a+1],section-a);
    for(let col=0;col<=sides;col++){
      const angle=col/sides*Math.PI*2,p=center.clone().addScaledVector(x,Math.cos(angle)*r).addScaledVector(z,Math.sin(angle)*r*.98);positions.push(...p.toArray());
      if(row<segments&&col<sides){const i=row*(sides+1)+col;indices.push(i,i+sides+1,i+1,i+1,i+sides+1,i+sides+2);}
    }
  }
  const g=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3)).setIndex(indices);
  const flat=g.toNonIndexed();g.dispose();return flat;
}
