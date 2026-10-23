import * as THREE from 'three';
import { retro } from './retro-material.js';
import { createRetroLighting } from './retro-lighting.js';
import { createPrintPass } from './retro-print.js';

// A little 3D scene on the page, like the cloud and rotating objects in the
// video. The cake uses the room's actual material, including surface mottle.
export function createDreamScene() {
  const scene=new THREE.Scene();
  const camera=new THREE.OrthographicCamera(-1.5,1.5,1.3,-1.3,.1,20);
  camera.position.z=8;
  const cloud=new THREE.Group();cloud.position.set(.15,.35,0);scene.add(cloud);
  const paper=new THREE.MeshBasicMaterial({color:0xfffdf8});
  const face=new THREE.Mesh(new THREE.CircleGeometry(1,48),paper);
  face.scale.set(1.02,.67,1);face.position.z=-2;cloud.add(face);
  // Overlapping flat lobes form a puffy silhouette, with round scallops rather
  // than a speech-balloon outline. Same color and plane, so no visible seams.
  for(let i=0;i<11;i++) {
    const a=i/11*Math.PI*2;
    const lobe=new THREE.Mesh(new THREE.CircleGeometry(.25+(i%3)*.025,24),paper);
    lobe.position.set(Math.cos(a)*.94,Math.sin(a)*.55,-2);cloud.add(lobe);
  }
  const dots=[[-1.07,-1.07,.055],[-.91,-.88,.09],[-.69,-.63,.13]].map(([x,y,r])=>{
    const dot=new THREE.Mesh(new THREE.CircleGeometry(r,12),paper);
    dot.position.set(x,y,-2);scene.add(dot);return dot;
  });

  const cake=new THREE.Group();cloud.add(cake);
  const pivot=new THREE.Group();pivot.rotation.x=.36;cake.add(pivot);
  const turntable=new THREE.Group();pivot.add(turntable);
  const add=(geometry,material,x,y,z,parent=turntable)=>{
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;
  };
  // The bubble is its own canvas (another size and pixel ratio): its ink stays on the cake.
  const cakeMaterial=(color,options)=>retro(color,{space:'object',...options});
  const crust=cakeMaterial(0xbb8047,{mottle:.26}),cream=cakeMaterial(0xffe5ab),glaze=cakeMaterial(0xbd2947);
  const plate=add(new THREE.CylinderGeometry(.86,.8,.065,16),cakeMaterial(0xd4cbe0),0,-.39,0);
  plate.name='Plato de cerámica';
  // A proper wedge with a curved back and closed cut faces, in three layers.
  const slice=(height,radius)=>{
    const shape=new THREE.Shape();shape.moveTo(-.49,0);
    for(let i=0;i<=8;i++) {
      const a=-.7+i/8*1.4;
      shape.lineTo(-.49+Math.cos(a)*radius,Math.sin(a)*radius);
    }
    shape.closePath();
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,steps:1,curveSegments:8});
    geometry.rotateX(-Math.PI/2);return geometry;
  };
  add(slice(.105,1.1),crust,0,-.35,0);
  add(slice(.43,1.07),cream,0,-.245,0);
  add(slice(.065,1.085),glaze,0,.185,0);
  // A few berry drips, kept on the slice's curved back edge.
  for(const a of [-.52,.1,.46]) {
    const drip=add(new THREE.IcosahedronGeometry(.065,0),glaze,-.49+Math.cos(a)*1.075,.17,-Math.sin(a)*1.075);
    drip.scale.set(.48,1.6,.75);
  }
  const berry=new THREE.Group();berry.position.set(.18,.39,.02);berry.rotation.z=-.2;turntable.add(berry);
  const fruit=add(new THREE.IcosahedronGeometry(.18,1),cakeMaterial(0xdc3d46),0,0,0,berry);fruit.scale.set(.85,1.2,.85);
  const green=cakeMaterial(0x6f9848);
  for(let i=0;i<5;i++) {
    const a=i/5*Math.PI*2;
    const leaf=add(new THREE.OctahedronGeometry(.1,0),green,Math.cos(a)*.055,.16,Math.sin(a)*.055,berry);
    leaf.scale.set(1,.22,.45);leaf.rotation.y=-a;
  }
  const lighting=createRetroLighting(scene);
  lighting.bind(cake);

  const pop=(t,delay)=>{
    const p=THREE.MathUtils.clamp((t-delay)/.42,0,1);
    return p===1?1:1+2.2*(p-1)**3+1.2*(p-1)**2;
  };
  function update(elapsed,reducedMotion=false) {
    const t=reducedMotion?0:elapsed;
    lighting.update(t,{reducedMotion});
    dots.forEach((dot,i)=>dot.scale.setScalar(reducedMotion?1:Math.max(0,pop(elapsed,i*.16))*(1+Math.sin(t*2.2-i*.7)*.055)));
    cloud.scale.setScalar(reducedMotion?1:Math.max(0,pop(elapsed,.46))*(1+Math.sin(t*1.8)*.018));
    cloud.position.y=.35+Math.sin(t*1.8)*.04;
    cloud.rotation.z=Math.sin(t*1.15)*.018;
    cake.scale.setScalar(.7*(reducedMotion?1:Math.max(0,pop(elapsed,.72))));
    cake.position.y=Math.sin(t*1.8+.4)*.025;
    turntable.rotation.y=-.55+t*.48;
  }
  update(0);
  return {scene,camera,cloud,cake,turntable,dots,update};
}

export function createDreamBubble(element) {
  let renderer,model,print,elapsed=0,wasVisible=false;
  return {
    update({visible,dt,reducedMotion=false}) {
      element.hidden=!visible;
      if(!visible){elapsed=0;wasVisible=false;return;}
      // Allocate a context only the first time Zud dreams; reuse it thereafter.
      if(!renderer) {
        renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});
        renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.setSize(210,182,false);
        renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
        renderer.domElement.setAttribute('aria-hidden','true');element.append(renderer.domElement);
        model=createDreamScene();print=createPrintPass(renderer,{transparent:true});
      }
      elapsed=wasVisible?elapsed+dt:0;wasVisible=true;
      model.update(elapsed,reducedMotion);
      print.render(model.scene,model.camera);
    },
    dispose() {
      model?.scene.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});
      print?.dispose();renderer?.dispose();renderer?.domElement.remove();
    },
  };
}
