import * as THREE from 'three';
import { retro } from './retro-material.js';
import { createZudPrintVariant } from './zud-print-style.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {CHARACTER_DEFAULTS} from './character-settings.js';
import {editableGeometry,patternTexture,createCharacterMaterials,updateCharacterMaterials} from './character-surfaces.js';
import {createZudEyes} from './zud-eyes.js';
import {smoothHipNormals} from './zud-hip-normals.js';
import {baseGeometryVariant,curvedGeometry} from './zud-geometry-variants.js';
import {createZudRig} from './zud-rig.js';

export const BEANIE_COLORS=[
  {name:'Naranja',hex:CHARACTER_DEFAULTS.hatColor}, {name:'Amarillo',hex:'#f6c945'},
  {name:'Lima',hex:'#b5f500'}, {name:'Azul',hex:'#315d95'},
  {name:'Violeta',hex:'#b250ed'}, {name:'Rosa',hex:'#ee79bb'},
  {name:'Rojo',hex:'#e95261'},
];

// Nearly spherical head, with its chin still meeting the original shoulders.
// Eyes use these same radii so their projection follows the deeper profile.
const HEAD={x:1.035,y:.94,z:.97,centerY:.49};

// Closed polygonal cross sections keep the limbs chunky, with actual flat
// soles and chamfered corners instead of overlapping spheres or little shoes.
function sectionGeometry(rows,segments=8) {
  const positions=[];
  const point=(row,column)=> {
    const a=(column/segments+.5/segments)*Math.PI*2;
    return [row.x+Math.sin(a)*row.w,row.y,(row.z??0)+Math.cos(a)*row.d];
  };
  for(let r=0;r<rows.length-1;r++)for(let c=0;c<segments;c++) {
    const corners=[point(rows[r],c),point(rows[r],c+1),point(rows[r+1],c+1),point(rows[r+1],c)];
    for(const index of [0,1,2,0,2,3])positions.push(...corners[index]);
  }
  for(const [r,reverse] of [[0,true],[rows.length-1,false]])for(let c=0;c<segments;c++) {
    const center=[rows[r].x,rows[r].y,rows[r].z??0];
    const a=point(rows[r],c),b=point(rows[r],c+1);
    positions.push(...center,...(reverse?b:a),...(reverse?a:b));
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.computeVertexNormals();return geometry;
}

// The approved base uses the authored mesh with the lab's shared surfaces.
// The lab requests raw surfaces while editing its own local variant.
export function createZudModel(options={}) {
  const {detail=CHARACTER_DEFAULTS.detail,curve=options.detail===undefined?Math.max(0,(CHARACTER_DEFAULTS.meshQuality-75)/25):0,appearance=true,comic=CHARACTER_DEFAULTS.comicShader}=options;
  let baseMaterials;
  if(!['original','low','medium','high'].includes(detail))throw new Error('Unknown Zud detail');
  const root=new THREE.Group();root.name='Zud';root.position.y=1.34;
  const skin=new THREE.MeshStandardMaterial({color:0x141414,roughness:1,metalness:0,flatShading:true});
  const faceMaterial=skin.clone();faceMaterial.flatShading=false;
  const eyeMaterial=new THREE.MeshBasicMaterial({color:0xfffefa,side:THREE.DoubleSide});
  const pupilMaterial=new THREE.MeshBasicMaterial({color:0x080809,side:THREE.DoubleSide});
  function box(w,h,d,material,x,y,z,parent=root,r=.04) {
    const mesh=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,1,r),material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;
  }
  function section(rows,parent=root) {
    const mesh=new THREE.Mesh(sectionGeometry(rows,8),skin);parent.add(mesh);return mesh;
  }
  // A broad round face with a polygonal silhouette, but a quiet, dark forehead.
  // The hat covers the upper half; the chin meets the shoulders without a neck.
  const headGeometry=new THREE.IcosahedronGeometry(1,2);
  const roundedNormals=headGeometry.attributes.normal.clone();
  headGeometry.computeVertexNormals();
  const normals=headGeometry.attributes.normal;
  for(let i=0;i<normals.count;i++) {
    const normal=new THREE.Vector3().fromBufferAttribute(normals,i)
      .lerp(new THREE.Vector3().fromBufferAttribute(roundedNormals,i),.76).normalize();
    normals.setXYZ(i,normal.x,normal.y,normal.z);
  }
  const head=new THREE.Mesh(headGeometry,faceMaterial);
  head.name='Cabeza de Zud';head.position.set(0,HEAD.centerY,0);head.scale.set(HEAD.x,HEAD.y,HEAD.z);root.add(head);
  // Taper the lower pelvis into the broader thigh roots; the old deep
  // underside formed a projecting belly lip over two separate-looking legs.
  section([
    {x:0,y:-1.025,w:.19,d:.19},
    {x:0,y:-.97,w:.44,d:.29},
    {x:0,y:-.80,w:.59,d:.39},
    {x:0,y:-.52,w:.50,d:.34},
    {x:0,y:-.36,w:.45,d:.30},
    {x:0,y:-.18,w:.31,d:.24},
  ]).name='Torso';
  const feet=[-1,1].map(side=> {
    const pivot=new THREE.Group();pivot.position.set(side*.36,-1.10,.10);root.add(pivot);
    pivot.name=side<0?'Cadera derecha':'Cadera izquierda';
    section([
      {x:side*.05,y:-.24,w:.26,d:.29,z:.015},
      {x:side*.04,y:-.205,w:.28,d:.305,z:.01},
      {x:0,y:-.065,w:.265,d:.285},
      {x:-side*.06,y:.12,w:.275,d:.295,z:-.025},
      {x:-side*.09,y:.24,w:.225,d:.195,z:-.065},
      {x:-side*.095,y:.28,w:.22,d:.19,z:-.065},
      {x:-side*.095,y:.46,w:.13,d:.12,z:-.065},
    ],pivot).name='Pierna';
    // Rotate at the hip, preserving the exact resting silhouette.
    const hip=new THREE.Vector3(side*.265,-.82,.065);
    pivot.children[0].position.copy(pivot.position).sub(hip);pivot.position.copy(hip);
    pivot.userData.restPosition=hip.clone();return pivot;
  });
  const arms=[-1,1].map(side=> {
    const pivot=new THREE.Group();pivot.position.set(side*.51,-.42,.035);root.add(pivot);
    pivot.name=side<0?'Hombro derecho':'Hombro izquierdo';
    section([
      {x:side*.16,y:-.59,w:.13,d:.155},
      {x:side*.19,y:-.49,w:.22,d:.23},
      {x:side*.12,y:-.23,w:.205,d:.235},
      {x:0,y:-.04,w:.17,d:.19},
      {x:-side*.04,y:.12,w:.13,d:.15},
      {x:-side*.06,y:.20,w:.07,d:.09},
    ],pivot).name='Brazo';
    pivot.userData.restPosition=pivot.position.clone();return pivot;
  });

  // Small internal joint cores cover extreme rotations without protruding
  // through the shoulder or thigh as separate visible knobs.
  for(const joint of [...arms,...feet]) {
    const cap=new THREE.Mesh(new THREE.IcosahedronGeometry(.105,1),skin);
    cap.name=arms.includes(joint)?'Núcleo del hombro':'Núcleo de la cadera';
    cap.position.copy(joint.position);root.add(cap);
  }

  const eyeController=createZudEyes(HEAD,{white:eyeMaterial,pupil:pupilMaterial});
  const eyes=eyeController.root;root.add(eyes);

  const hat=new THREE.Group();hat.name='Beanie de Zud';root.add(hat);
  const knit=new THREE.MeshLambertMaterial({color:0x1b1b1e,flatShading:true,toneMapped:false});
  // All parts share one dye: the folded edge gets its darker underside from
  // its geometry and light, never from a separate black stripe or trim.
  // The back has a shallower drop than the front arch. Every joining ring
  // uses this same curve, so the crown tucks INSIDE the cuff all the way around.
  const arch=angle=> {
    const facing=Math.cos(angle);
    return facing*(facing>=0?.31:.29);
  };
  function hatSurface(profile,name) {
    const vertices=[],segments=14;
    const point=(row,column)=> {
      const {radius,y,lean=0,rise=1,twist=0}=profile[row];
      const angle=(column+.5+twist)/segments*Math.PI*2;
      return [Math.sin(angle)*radius+lean,y+rise*arch(angle),Math.cos(angle)*radius*.98];
    };
    for(let row=0;row<profile.length-1;row++)for(let col=0;col<segments;col++) {
      const corners=[point(row,col),point(row,col+1),point(row+1,col+1),point(row+1,col)];
      for(const index of [0,1,2,0,2,3])vertices.push(...corners[index]);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,knit);mesh.name=name;hat.add(mesh);
  }
  hatSurface([
    {radius:1.035,y:.61},
    {radius:1.035,y:.86,rise:.87},
    {radius:.92,y:1.13,lean:-.015,rise:.48,twist:.12},
    {radius:.65,y:1.34,lean:-.06,rise:.17,twist:-.12},
    {radius:.31,y:1.45,lean:-.13,rise:0},
    {radius:0,y:1.47,lean:-.13,rise:0},
  ],'Copa');
  hatSurface([
    {radius:1.015,y:.23},
    {radius:1.13,y:.27},
    {radius:1.15,y:.33},
    {radius:1.12,y:.78},
    {radius:1.035,y:.84},
    {radius:1.015,y:.78},
    {radius:1.015,y:.23},
  ],'Doblez');
  const pompom=new THREE.Mesh(new THREE.IcosahedronGeometry(1,1),knit);
  pompom.name='Pompón';pompom.position.set(-.045,1.64,-.14);pompom.scale.set(.46,.44,.45);
  pompom.rotation.set(.12,.20,.15);hat.add(pompom);
  function setBeanieColor(hex) {
    if(!/^#[0-9a-f]{6}$/i.test(hex))return;
    // Compensate for the studio lights without ACES desaturating bright dyes.
    knit.color.set(hex).multiplyScalar(.65);root.userData.beanieColor=hex.toLowerCase();
    baseMaterials?.hat.color?.set(hex);
  }
  setBeanieColor(BEANIE_COLORS[0].hex);

  const bodyMeshes=[];
  const sharedGeometries=new Set();
  root.traverse(mesh=>{if(mesh.isMesh&&[skin,faceMaterial,knit].includes(mesh.material))bodyMeshes.push(mesh);});
  {
    const print=createZudPrintVariant({root,meshes:bodyMeshes,eyes,knit,knitGain:1/.65});
    const oldGeometries=new Set(bodyMeshes.map(mesh=>mesh.geometry));
    for(const [mesh,variant] of print){mesh.geometry=variant.geometry;mesh.material=variant.material;}
    for(const mesh of bodyMeshes){
      if(curve>0)mesh.geometry=curvedGeometry(mesh.geometry,THREE.MathUtils.clamp(curve,0,1));
      else {mesh.geometry=baseGeometryVariant(mesh.geometry,detail,{hat:mesh.parent===hat});sharedGeometries.add(mesh.geometry);}
    }
    oldGeometries.forEach(geometry=>geometry.dispose());
    skin.dispose();faceMaterial.dispose();pupilMaterial.dispose();
  }
  root.userData.modelStyle=detail==='original'?'print':detail;

  const laptop=new THREE.Group();root.add(laptop);
  const metal=retro(0xa5a0b5);
  box(1.15,.06,.65,metal,0,-.72,.94,laptop,.018);
  const lid=box(1.15,.76,.055,metal,0,-.36,1.22,laptop,.02);lid.rotation.x=-.15;
  box(.105,.105,.006,eyeMaterial,0,-.36,1.265,laptop,.009);
  laptop.visible=false;
  const accessoryMount=new THREE.Group();accessoryMount.position.set(0,.21,.235);root.add(accessoryMount);
  const ownedGeometries=new Set(),ownedMaterials=new Set([skin,faceMaterial,knit,eyeMaterial,pupilMaterial,metal]);
  root.traverse(mesh=>{if(mesh.isMesh){if(!sharedGeometries.has(mesh.geometry))ownedGeometries.add(mesh.geometry);ownedMaterials.add(mesh.material);}});
  const textures=new Map();
  if(appearance) {
    for(const kind of new Set([CHARACTER_DEFAULTS.skinTexture,CHARACTER_DEFAULTS.hatTexture])) {
      if(kind==='none')continue;
      const texture=patternTexture(kind);
      texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
      texture.repeat.setScalar(CHARACTER_DEFAULTS.textureScale);texture.anisotropy=8;textures.set(kind,texture);
    }
    baseMaterials=createCharacterMaterials(CHARACTER_DEFAULTS,{comic});
    updateCharacterMaterials(baseMaterials,CHARACTER_DEFAULTS,textures);
    for(const material of Object.values(baseMaterials))ownedMaterials.add(material);
    for(const mesh of bodyMeshes) {
      mesh.geometry=editableGeometry(mesh.geometry,CHARACTER_DEFAULTS.shading==='smooth',mesh.scale);ownedGeometries.add(mesh.geometry);
      mesh.material=mesh.parent===hat?baseMaterials.hat:baseMaterials.skin;
      mesh.castShadow=true;mesh.receiveShadow=true;
    }
    for(const eye of eyes.children)for(const mesh of eye.children)mesh.material=baseMaterials[mesh.userData.eyePart];
    if(CHARACTER_DEFAULTS.shading==='smooth')smoothHipNormals({root,feet});
    eyeController.setHeadSurface(head);
    root.userData.modelStyle=comic?'comic':CHARACTER_DEFAULTS.material;
  }
  const rig=createZudRig({arms,feet});
  const dispose=()=>{rig.dispose();ownedGeometries.forEach(geometry=>geometry.dispose());ownedMaterials.forEach(material=>material.dispose());textures.forEach(texture=>texture.dispose());};
  return {root,eyes,eyeController,feet,arms,rig,laptop,accessoryMount,setBeanieColor,dispose};
}
