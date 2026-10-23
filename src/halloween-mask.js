import * as THREE from 'three';
import { retro } from './retro-material.js';

// Trace the supplied white rabbit silhouette: long swept ears, rounded
// cheeks and one small nose opening. The face intentionally has no eyes.
export function createHalloweenMask() {
  const scale=.010;
  const point=(x,y)=>[(x-200)*scale,(235-y)*scale];
  const outline=new THREE.Shape();
  const move=(x,y)=>outline.moveTo(...point(x,y));
  const curve=(a,b,c,d,e,f)=>outline.bezierCurveTo(...point(a,b),...point(c,d),...point(e,f));
  move(78,69);
  curve(68,62,81,105,86,124);
  curve(92,147,112,163,126,184);
  curve(139,202,130,212,129,231);
  curve(126,254,129,275,141,291);
  curve(151,302,149,310,166,324);
  curve(180,337,190,332,200,329);
  curve(210,332,220,337,234,324);
  curve(251,310,249,302,259,291);
  curve(271,275,274,254,271,231);
  curve(270,212,261,202,274,184);
  curve(288,163,308,147,314,124);
  curve(319,105,332,62,322,69);
  curve(299,88,274,111,260,136);
  curve(247,159,238,173,218,174);
  curve(209,174,191,174,182,174);
  curve(162,173,153,159,140,136);
  curve(126,111,101,88,78,69);
  outline.closePath();
  const nose=new THREE.Path();nose.moveTo(...point(186,302));
  nose.bezierCurveTo(...point(196,307),...point(204,307),...point(214,302));
  nose.bezierCurveTo(...point(212,307),...point(207,311),...point(203,321));
  nose.bezierCurveTo(...point(201,326),...point(199,326),...point(197,321));
  nose.bezierCurveTo(...point(193,311),...point(188,307),...point(186,302));
  nose.closePath();outline.holes.push(nose);
  const geometry=new THREE.ExtrudeGeometry(outline,{depth:.075,bevelEnabled:true,bevelThickness:.013,bevelSize:.012,bevelSegments:1,curveSegments:10,steps:1});
  const vertices=geometry.attributes.position;
  for(let i=0;i<vertices.count;i++) {
    // Slight convexity makes the mask read as a wearable ceramic shell.
    const x=vertices.getX(i),y=vertices.getY(i);
    vertices.setZ(i,vertices.getZ(i)+.095*Math.max(0,1-(x/1.25)**2-((y-.1)/2)**2));
  }
  geometry.computeVertexNormals();
  const porcelain=retro(0xf9f8f3,{});
  const edge=retro(0xc9cbc9,{});
  const mask=new THREE.Group();mask.name='Máscara de conejo — Halloween';
  mask.add(new THREE.Mesh(geometry,[porcelain,edge]));
  // Dark elastic follows the sides of the head, behind the white shell.
  const strapMaterial=retro(0x262830,{});
  for(const side of [-1,1]) {
    const strap=new THREE.Mesh(new THREE.BoxGeometry(.055,.10,.56),strapMaterial);
    strap.position.set(side*.68,-.06,-.22);mask.add(strap);
  }
  mask.visible=false;
  return mask;
}
