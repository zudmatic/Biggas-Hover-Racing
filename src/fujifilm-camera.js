import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {retro} from './retro-material.js';

// A small faceted prop, modeled from the supplied front/back/side reference.
// Local +Z is the lens direction; the base rests at Y=0.
export function createFujifilmCamera() {
  const camera=new THREE.Group();camera.name='Fujifilm X-T30 III';
  const silver=retro(0xbfc0bd,{mottle:.025}),edge=retro(0x777d7c,{mottle:.025});
  const leather=retro(0x202222,{mottle:.11}),rubber=retro(0x121617,{mottle:.035});
  const grooves=retro(0x303536,{mottle:.025}),glass=retro(0x163c3c,{mottle:0});
  const screen=retro(0x252e34,{mottle:0}),ink=retro(0x090d10,{mottle:0});
  const add=(geometry,material,x,y,z,name)=>{
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);
    mesh.castShadow=true;mesh.receiveShadow=true;mesh.name=name??'';camera.add(mesh);return mesh;
  };
  const box=(w,h,d,material,x,y,z,name)=>add(new RoundedBoxGeometry(w,h,d,1,Math.min(.025,w/5,h/5,d/5)),material,x,y,z,name);
  const cylinder=(radius,height,material,x,y,z,front=false,segments=24)=>{
    const mesh=add(new THREE.CylinderGeometry(radius,radius,height,segments),material,x,y,z);
    if(front)mesh.rotation.x=Math.PI/2;return mesh;
  };
  const decal=(canvas,w,h,x,y,z)=>{
    const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;
    const mesh=add(new THREE.PlaneGeometry(w,h),retro(0xffffff,{map,transparent:true,depthWrite:false,mottle:0}),x,y,z);
    mesh.castShadow=false;return mesh;
  };
  const label=(text,w,h,x,y,z,{color='#111516',back=false}={})=>{
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;
    const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.font='bold 68px Arial';ctx.textAlign='center';ctx.textBaseline='middle';
    const width=ctx.measureText(text).width;ctx.save();ctx.translate(256,50);ctx.scale(470/width,1);ctx.fillText(text,0,0);ctx.restore();
    const mesh=decal(canvas,w,h,x,y,z);if(back)mesh.rotation.y=Math.PI;return mesh;
  };

  box(1.22,.575,.37,leather,0,.321,0,'Cuerpo de cuero negro');
  box(1.23,.048,.38,silver,0,.024,0,'Base plateada');
  box(1.23,.192,.39,silver,0,.596,0,'Placa superior plateada');
  box(.18,.457,.07,leather,-.505,.276,.194,'Empuñadura');
  // Three rectangular sections form the actual sloping prism housing: its
  // roof recedes toward the rear, above a short, upright front logo panel.
  const lensX=.075,lensY=.32;
  const sections=[{y:.588,w:.49,front:.251,back:-.212},{y:.681,w:.455,front:.251,back:-.212},{y:.839,w:.242,front:.037,back:-.17}];
  const vertices=[];
  for(const {y,w,front,back} of sections)vertices.push(lensX-w/2,y,front,lensX+w/2,y,front,lensX+w/2,y,back,lensX-w/2,y,back);
  const indices=[];
  for(let row=0;row<2;row++)for(let side=0;side<4;side++){
    const a=row*4+side,b=row*4+(side+1)%4,c=b+4,d=a+4;indices.push(a,b,d,b,c,d);
  }
  indices.push(8,9,10,8,10,11,0,3,2,0,2,1);
  const prism=new THREE.BufferGeometry();prism.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));prism.setIndex(indices);
  const housing=prism.toNonIndexed();housing.computeVertexNormals();prism.dispose();
  add(housing,silver,0,0,0,'Visor elevado');
  box(.21,.016,.175,edge,lensX,.847,-.06,'Zapata');
  for(const x of [-.092,.092])box(.022,.032,.17,silver,lensX+x,.869,-.06);
  box(.135,.01,.13,ink,lensX,.86,-.06);
  label('FUJIFILM',.267,.064,lensX,.636,.255);
  label('X-T30',.169,.042,.465,.577,.199);
  cylinder(.027,.011,ink,-.228,.582,.203,true,12);
  cylinder(.016,.014,retro(0xc6d750,{mottle:0}),-.228,.582,.209,true,10);
  box(.122,.035,.025,rubber,-.382,.582,.2);

  // Top dials have individual knurled ridges, batched into a single draw call.
  const dialSpecs=[[-.49,.735,.006,.09,.074],[-.211,.746,-.037,.104,.084],[.444,.736,.014,.105,.076]];
  const ridges=new THREE.InstancedMesh(new THREE.BoxGeometry(.003,.057,.005),edge,144);
  const transform=new THREE.Object3D();let index=0;
  for(const [x,y,z,r,h] of dialSpecs){
    cylinder(r*.85,.018,edge,x,.7,z);cylinder(r,h,grooves,x,y,z);cylinder(r*.97,.013,silver,x,y+h/2,z);
    for(let i=0;i<48;i++){
      const angle=i*Math.PI/24;transform.position.set(x+Math.sin(angle)*r,y,z+Math.cos(angle)*r);
      transform.rotation.set(0,angle,0);transform.updateMatrix();ridges.setMatrixAt(index++,transform.matrix);
    }
  }
  ridges.castShadow=true;ridges.receiveShadow=true;camera.add(ridges);
  cylinder(.047,.029,grooves,-.364,.708,.12);cylinder(.039,.017,silver,-.364,.731,.12);cylinder(.019,.007,ink,-.364,.743,.12);

  // Short kit-lens barrel: fine grip ribs, a wide engraved ring and glass
  // recessed inside a beveled inner rim, rather than a large flat front disc.
  cylinder(.282,.06,edge,lensX,lensY,.217,true);
  cylinder(.277,.24,rubber,lensX,lensY,.343,true);
  cylinder(.289,.06,grooves,lensX,lensY,.286,true,48);
  cylinder(.301,.083,grooves,lensX,lensY,.422,true,48);
  cylinder(.288,.086,rubber,lensX,lensY,.49,true,32);
  const barrelRidges=new THREE.InstancedMesh(new THREE.BoxGeometry(.003,.005,.052),edge,128);
  index=0;
  for(const [z,r] of [[.286,.29],[.422,.302]])for(let i=0;i<64;i++){
    const angle=i*Math.PI/32;transform.position.set(lensX+Math.sin(angle)*r,lensY+Math.cos(angle)*r,z);
    transform.rotation.set(0,0,-angle);transform.updateMatrix();barrelRidges.setMatrixAt(index++,transform.matrix);
  }
  barrelRidges.castShadow=true;barrelRidges.receiveShadow=true;camera.add(barrelRidges);
  cylinder(.207,.017,ink,lensX,lensY,.508,true);
  const lensGeometry=new THREE.IcosahedronGeometry(1,1),positions=lensGeometry.attributes.position;
  const colors=[],facet=new THREE.Vector3(),color=new THREE.Color();
  for(let i=0;i<positions.count;i+=3){
    facet.set(0,0,0);
    for(let j=0;j<3;j++)facet.add(new THREE.Vector3().fromBufferAttribute(positions,i+j));
    // A restrained blue-green coating gives the glass readable facets even
    // inside the barrel's shadow, without adding a light source to the room.
    facet.normalize();
    const reflection=Math.max(0,-facet.x*.65+facet.y*.65+facet.z*.15);
    const palette=[0x09191b,0x163432,0x284942,0x3c6258,0x688f80];
    const intensity=THREE.MathUtils.clamp(Math.floor(reflection*5)+(i/3%3===0?1:0),0,4);
    color.setHex(palette[intensity]);
    for(let j=0;j<3;j++)colors.push(color.r,color.g,color.b);
  }
  lensGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));lensGeometry.scale(.173,.173,.054);
  add(lensGeometry,retro(0xffffff,{vertexColors:true,mottle:0}),lensX,lensY,.532,'Cristal facetado del objetivo');
  const innerRim=add(new THREE.CylinderGeometry(.198,.176,.035,32,1,true),grooves,lensX,lensY,.571);innerRim.rotation.x=Math.PI/2;
  add(new THREE.RingGeometry(.196,.287,32),rubber,lensX,lensY,.591,'Aro frontal del objetivo');
  add(new THREE.TorusGeometry(.288,.006,4,32),grooves,lensX,lensY,.586);
  const engraving=document.createElement('canvas');engraving.width=engraving.height=1024;
  const ctx=engraving.getContext('2d');ctx.translate(512,512);ctx.fillStyle='#d5d7ce';ctx.font='44px Arial';ctx.textAlign='center';ctx.textBaseline='middle';
  const arcText=(text,start,end)=>{
    [...text].forEach((letter,i)=>{
      const angle=start+(end-start)*i/(text.length-1);ctx.save();ctx.rotate(angle);ctx.fillText(letter,0,-407);ctx.restore();
    });
  };
  arcText('FUJINON ASPHERICAL LENS',-1.4,1.4);
  arcText('SUPER EBC XC 13-33mm 1:3.5-6.3 OIS Ø49',1.65,4.62);
  decal(engraving,.596,.596,lensX,lensY,.594).name='Inscripciones del objetivo';
  cylinder(.057,.026,grooves,.469,.174,.207,true,10);
  box(.012,.03,.008,silver,.469,.195,.224);
  label('M C S',.10,.025,.469,.248,.208,{color:'#c9cdc8'});
  for(const side of [-1,1])add(new THREE.TorusGeometry(.039,.012,4,8),silver,side*.643,.535,0,'Anclaje de correa');

  // Rear LCD, eyecup and controls remain modeled when the room is rotated.
  box(.83,.445,.04,rubber,-.11,.306,-.202,'Marco de pantalla');
  box(.746,.365,.013,screen,-.11,.306,-.23,'Pantalla trasera');
  box(.295,.208,.067,rubber,lensX,.704,-.23,'Ocular');
  box(.186,.123,.018,glass,lensX,.707,-.271);
  for(const [x,y,r] of [[.451,.29,.082],[.435,.105,.031],[.55,.108,.028],[-.46,.607,.03],[.38,.61,.032],[.54,.61,.032]])
    cylinder(r,.023,rubber,x,y,-.211,true,12);
  label('MENU',.067,.022,.451,.306,-.225,{color:'#bfc3c3',back:true});
  label('OK',.032,.019,.451,.279,-.225,{color:'#bfc3c3',back:true});
  label('AEL',.043,.021,.38,.61,-.225,{color:'#bfc3c3',back:true});
  label('AFL',.043,.021,.54,.61,-.225,{color:'#bfc3c3',back:true});
  label('Q',.025,.026,.55,.108,-.225,{color:'#bfc3c3',back:true});
  // Keep the room's diffuse/print shading, with quieter ink on the small
  // machined-metal prop so it does not obscure the reference's fine details.
  camera.traverse(mesh=>{if(mesh.isMesh)mesh.material.uniforms.retroHalftoneStrength.value=.14;});
  return camera;
}
