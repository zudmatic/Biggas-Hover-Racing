import * as THREE from 'three';
import { retro } from './retro-material.js';
import {createRoomSurfaces} from './room-surfaces.js';
import {CHARACTER_SURFACE_SCALE,ROOM_SURFACE_COLORS as colors,setRoomSurfaceUV,SURFACE_FAMILIES} from './surface-library.js';
export { retro } from './retro-material.js';
import {createDeskClock} from './room-clock.js';
import {createWindowView} from './window-view.js';
import {dayCycle,wrapMinutes} from './day-cycle.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createPixelGlasses, createCigarette } from './accessories.js';
import {createFujifilmCamera} from './fujifilm-camera.js';
import {createWallMirror} from './wall-mirror.js';
import {createIndoorPlant} from './indoor-plant.js';
import {createBedBlanketGeometry} from './bed-blanket.js';

// Zud's room for Retro Print 3D, modeled after the reference: an isometric
// cutaway with thick plaster walls on a wooden base, plank floor, a low wooden
// bed along the left wall with a nightstand at its foot (holding Zud's dance
// glasses), a poster, a round logo rug, a corner plant, and a desk under a wide
// sunny window with laptop, lamp, a book and an interactive clock.
// It shares the character's render language: every surface is triangulated
// with slightly uneven facets, each facet varies a little in tone, a faint
// printed mottle sits on the surface, and colored light does the rest (warm
// sun through the window, violet shadows).

// Walkable layout for this room (see home-layout.js).
// Inner half-size of the room: compact, so the furniture fills it as in the
// reference. The floor runs from the back walls (-R) to the open edge (EDGE).
const R=2.35,EDGE=R+.22;
const NIGHTSTAND_Z=1.11;
// The folded beanie is 1.15 model units in radius; include walking lean and sway.
const WALK_RADIUS=1.15*CHARACTER_SURFACE_SCALE+.054;

// Walkable layout for this room (see home-layout.js).
export const RETRO_SPOTS={
  home:new THREE.Vector3(.25,.12,.5),
  // Zud walks up beside the chair (never through its backrest), hops sideways
  // onto the seat, and gets off the same way.
  chair:new THREE.Vector3(.2,.12,-.80),
  stand:new THREE.Vector3(.2,.12,-.80),
  seated:new THREE.Vector3(1.2,.73,-.85),
  aisle:new THREE.Vector3(.2,.12,.1),
  idleHeading:Math.PI/4,sitHeading:Math.PI,sitArc:.55,radius:WALK_RADIUS,limit:EDGE-WALK_RADIUS,
  bounds:{left:-R+WALK_RADIUS,right:EDGE-WALK_RADIUS,back:-R+WALK_RADIUS,front:EDGE-WALK_RADIUS},
  // How far (in Zud's own units) the chair rolls him in to type: this desk is
  // close to the chair, so only a little, keeping his belly at the desk edge.
  deskReach:.5,
  // Getting into bed: step up from the side and lie on the blanket, head on the pillow.
  bed:{side:new THREE.Vector3(-.16,.12,-.6),lie:new THREE.Vector3(-1.59,.93,-1.22),sideHeading:-Math.PI/2},
  obstacles:[
    [-R,-.73,-R,.67], // bed
    [-R,-1.44,NIGHTSTAND_Z-.38,NIGHTSTAND_Z+.38], // nightstand
    [-.72,.02,-R,-1.6], // plant
    [.1,2.5,-R,-1.4], // desk
    [.8,1.6,-1.45,-.20], // chair, including back posts and its rolled-in position
    [-R,-R+.10,1.79,EDGE], // mirror frame
  ],
};

// Zud's scale inside the room.
export const ROOM_SCALE=CHARACTER_SURFACE_SCALE;

const FLOOR=.09;
let seed=1;
const random=()=>{const x=Math.sin(seed++*127.1+311.7)*43758.5453;return x-Math.floor(x);};

// A box whose faces are split into triangles and dented slightly inward, so
// flat surfaces read as low-poly facets instead of clean digital planes.
function facetBox(w,h,d,{cell=.42,dent=.012,puff=0,openFaces=[]}={}) {
  const geometry=new THREE.BoxGeometry(w,h,d,Math.max(1,Math.round(w/cell)),Math.max(1,Math.round(h/cell)),Math.max(1,Math.round(d/cell)));
  // Box face order: +X, -X, +Y, -Y, +Z, -Z. Joined walls have no internal caps.
  if(openFaces.length){
    const indices=[];
    for(const group of geometry.groups)if(!openFaces.includes(group.materialIndex))
      for(let i=group.start;i<group.start+group.count;i++)indices.push(geometry.index.getX(i));
    geometry.setIndex(indices);geometry.clearGroups();
  }
  geometry.deleteAttribute('normal');geometry.deleteAttribute('uv');
  const merged=mergeVertices(geometry),position=merged.attributes.position,half=[w/2,h/2,d/2];
  for(let i=0;i<position.count;i++) {
    const v=[position.getX(i),position.getY(i),position.getZ(i)];
    const onFace=v.map((c,axis)=>Math.abs(Math.abs(c)-half[axis])<1e-5);
    if(onFace.filter(Boolean).length===1) {
      const axis=onFace.indexOf(true);
      v[axis]-=Math.sign(v[axis])*random()*dent;
      if(puff)v[axis]+=Math.sign(v[axis])*puff*Math.cos(v[(axis+1)%3]/half[(axis+1)%3]*1.3)*Math.cos(v[(axis+2)%3]/half[(axis+2)%3]*1.3);
      position.setXYZ(i,...v);
    }
  }
  geometry.dispose();
  const flat=merged.toNonIndexed();merged.dispose();flat.computeVertexNormals();
  return flat;
}

export function createRetroRoom({bindLighting=()=>{},deferExterior=false}={}) {
  seed=1;
  const room=new THREE.Group();room.name='Cuarto retro de Zud';
  const add=(geometry,material,x,y,z,parent=room)=> {
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);
    mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  };
  const box=(w,h,d,material,x,y,z,options,parent)=>add(facetBox(w,h,d,options),material,x,y,z,parent);
  const cylinder=(top,bottom,height,material,x,y,z,segments=7,parent)=>add(new THREE.CylinderGeometry(top,bottom,height,segments),material,x,y,z,parent);

  const surfaces=createRoomSurfaces(),surface=surfaces.material;
  const plaster=surface('plaster',colors.plaster),plasterTop=surface('plaster',colors.plasterTop);
  const wood=surface('wood',colors.wood),woodDark=surface('wood',colors.woodDark);
  const planks=colors.planks.map(color=>surface('wood',color));
  const navy=surface('fabric',colors.blanket),linen=surface('fabric',colors.linen),rug=retro(colors.rug,{mottle:SURFACE_FAMILIES.fabric.mottle});
  const black=retro(0x282035),steel=surface('metal',colors.steel),concrete=surface('plaster',0xcfc6b6),soil=retro(0x3a2a22);

  // Wooden base and plank floor.
  const T=.38,H=3.2,span=R+T+EDGE,mid=(EDGE-R-T)/2;
  box(span,.42,span,woodDark,mid,-.21,mid,{cell:.6});
  // The floor finish stops at the inside walls. Extending it under the plaster
  // made its exposed end cap overlap the wall's cap along the open room edge.
  const floorSpan=R+EDGE,floorMid=(EDGE-R)/2;
  const floorFinish=box(floorSpan,.05,floorSpan,wood,floorMid,.025,floorMid,{cell:.6,openFaces:[1,5]});
  floorFinish.name='Acabado del piso';
  const rows=22,rowWidth=(R+EDGE)/rows;
  for(let row=0;row<rows;row++) {
    const z=-R+row*rowWidth+rowWidth/2;
    let x=-R;
    while(x<EDGE-.02) {
      const length=Math.min(EDGE-x,.8+random()*1.0);
      box(length-.012,.04,rowWidth-.012,planks[Math.floor(random()*planks.length)],x+length/2,FLOOR-.02,z,{cell:.5,dent:.006});
      x+=length;
    }
  }

  // Thick plaster walls; the back wall is built around a wide window opening.
  const inner=-R,wallC=inner-T/2,wallMid=(EDGE+inner)/2,wallLength=EDGE-inner;
  const walls=new THREE.Group();walls.name='Paredes';room.add(walls);
  // Plaster is a continuous plane. Dented triangles and per-block texture
  // origins made the window surrounds look patched with triangular tone changes.
  // Bake positions into room space so UVs, grain and printed ink all meet at
  // the joints, including the top trim. Furniture keeps its faceted geometry.
  const wallBox=(w,h,d,material,x,y,z,options)=>{
    const mesh=box(w,h,d,material,x,y,z,{...options,dent:0},walls);
    mesh.geometry.translate(x,y,z);mesh.position.set(0,0,0);return mesh;
  };
  wallBox(T,H,wallLength,plaster,wallC,H/2,wallMid,{cell:.45,openFaces:[5]});
  wallBox(T+.02,.05,wallLength+T,plasterTop,wallC,H+.025,wallMid-T/2,{cell:.5});
  const win={left:.15,right:2.25,bottom:1.5,top:2.85};
  const xs=[inner-T,inner,win.left,win.right,EDGE],ys=[0,win.bottom,win.top,H];
  const solid=(x,y)=>x>=0&&x<4&&y>=0&&y<3&&!(x===2&&y===1);
  for(let x=0;x<4;x++)for(let y=0;y<3;y++)if(solid(x,y)){
    const openFaces=[];
    for(const [face,dx,dy] of [[0,1,0],[1,-1,0],[2,0,1],[3,0,-1]])
      if(solid(x+dx,y+dy))openFaces.push(face);
    if(x===0)openFaces.push(4); // The side wall continues forward from this corner.
    wallBox(xs[x+1]-xs[x],ys[y+1]-ys[y],T,plaster,(xs[x+1]+xs[x])/2,(ys[y+1]+ys[y])/2,wallC,{cell:.45,openFaces});
  }
  wallBox(EDGE-inner,.05,T+.02,plasterTop,(inner+EDGE+.02)/2,H+.025,wallC,{cell:.5});

  // Window: dark frame, sill, a rolled blind on top, and a sunny view outside.
  const cx=(win.left+win.right)/2,cy=(win.bottom+win.top)/2,ww=win.right-win.left,wh=win.top-win.bottom;
  const windowControl=new THREE.Group();windowControl.name='Ventana';windowControl.position.set(cx,cy,inner+.16);room.add(windowControl);
  const windowArea=new THREE.Mesh(new THREE.PlaneGeometry(ww,wh),new THREE.MeshBasicMaterial({visible:false,side:THREE.DoubleSide}));
  windowArea.userData.hitArea=true;windowControl.add(windowArea);
  for(const [w,h,x,y] of [[ww+.1,.08,cx,win.top],[ww+.1,.08,cx,win.bottom],[.08,wh,win.left,cy],[.08,wh,win.right,cy],[.045,wh,cx+.3,cy]]) {
    box(w,h,.12,black,x,y,inner+.02,{cell:.5,dent:.003});
  }
  box(ww+.22,.07,.16,plasterTop,cx,win.bottom-.06,inner+.05,{cell:.5});
  const blind=box(ww+.3,.18,.2,black,cx,win.top+.17,inner+.11,{cell:.5});blind.name='Persiana';
  const blindCloth=box(ww+.02,1,.035,surface('fabric',colors.blind),cx,win.top-.1,inner+.11,{cell:.32,dent:.003});
  blindCloth.name='Tela de la persiana';
  const blindHem=box(ww+.07,.04,.05,black,cx,win.top-.2,inner+.13,{cell:1});
  let blindsClosed=false,blindAmount=0;
  const windowItem={object:windowControl,action:'blinds',label:'Lower the blind',lift:1,
    activate(){blindsClosed=!blindsClosed;windowItem.label=blindsClosed?'Raise the blind':'Lower the blind';}};
  const outside=createWindowView({width:ww+.18,height:wh+.18,deferLoad:deferExterior});
  const view=outside.view;
  view.name='Paisaje de la ventana';view.position.set(cx,cy,inner-.08);room.add(view);
  // A shallow niche behind the glass so the view never shows over the wall.
  for(const [w,h,d,x,y,z] of [[ww+.5,.06,.4,cx,win.top+.2,wallC-T/2-.05],[ww+.5,.06,.4,cx,win.bottom-.2,wallC-T/2-.05],[.06,wh+.5,.4,win.left-.2,cy,wallC-T/2-.05],[.06,wh+.5,.4,win.right+.2,cy,wallC-T/2-.05]]) {
    const cap=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),plaster);cap.position.set(x,y,z);room.add(cap);
  }

  // Low wooden bed along the left wall, navy blanket and a plump pillow.
  const bx=inner+.76,bz=inner+1.72;
  const bed=new THREE.Group();bed.name='Cama';bed.position.set(bx,0,bz);room.add(bed);
  // Trim 35 cm from the foot, keeping the headboard and sleeping pose fixed.
  box(1.52,.42,2.85,wood,0,FLOOR+.21,-.175,{cell:.42},bed);
  box(1.62,.12,2.95,woodDark,0,FLOOR+.43,-.175,{cell:.45,dent:.006},bed);
  box(1.62,.95,.16,wood,0,FLOOR+.62,-1.66,{cell:.4},bed);
  box(1.32,.26,2.65,linen,0,FLOOR+.62,-.175,{cell:.36,dent:.02},bed);
  const bedBlanket=createBedBlanketGeometry();
  const blanket=add(bedBlanket.geometry,navy,0,0,0,bed);blanket.name='Manta';
  navy.flatShading=false;
  box(.08,.42,1.75,navy,.72,FLOOR+.58,.305,{cell:.3,dent:.02},bed);
  // The blanket turns down over the foot as well, hiding the mattress end.
  box(1.52,.47,.08,navy,0,FLOOR+.605,1.18,{cell:.3,dent:.012},bed);
  const pillow=box(1.02,.24,.62,linen,0,FLOOR+.86,-1.18,{cell:.2,dent:.03,puff:.06},bed);
  const pillowRestY=pillow.position.y;
  let bedCover=0;

  // Zud & Ajo Adventures poster, taped to the wall, in the image's own 4:5 format.
  // Settles once the room textures finish loading (or fail), for /house's fade in.
  const manager=new THREE.LoadingManager(),texturesReady=new Promise(resolve=>{manager.onLoad=resolve;});
  const loader=new THREE.TextureLoader(manager),texture=url=>{const map=loader.load(url);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;return map;};
  const posterGroup=new THREE.Group();room.add(posterGroup);
  const posterZ=inner+1.45;
  const poster=new THREE.Mesh(new THREE.PlaneGeometry(1.2,1.5),retro(0xffffff,{map:texture(`${import.meta.env.BASE_URL}textures/zud-poster.png`)}));
  // Keep the artwork readable with slightly softer ink than the room (full strength: .42).
  poster.material.uniforms.retroHalftoneStrength.value=.32;
  poster.rotation.y=Math.PI/2;poster.position.set(inner+.012,2.15,posterZ);poster.receiveShadow=true;posterGroup.add(poster);
  for(const [y,z] of [[.72,-.57],[.72,.57],[-.72,-.57],[-.72,.57]])box(.02,.07,.07,black,inner+.02,2.15+y,posterZ+z,{cell:1},posterGroup);

  // Nightstand at the foot of the bed, with the dance glasses on top.
  const stand=new THREE.Group();stand.position.set(inner+.46,FLOOR,NIGHTSTAND_Z);room.add(stand);
  box(.8,.74,.7,wood,0,.37,0,{cell:.3,dent:.012},stand);
  box(.86,.06,.76,woodDark,0,.77,0,{cell:.3,dent:.006},stand);
  box(.02,.26,.56,woodDark,.41,.5,0,{cell:.3,dent:.004},stand);
  box(.03,.05,.14,black,.43,.5,0,{cell:1},stand);
  box(.02,.2,.56,woodDark,.41,.2,0,{cell:.3,dent:.004},stand);
  const glasses=createPixelGlasses();glasses.scale.setScalar(.3);
  glasses.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=true;mesh.receiveShadow=true;}});
  // Resting on its temples, lenses toward the room.
  glasses.rotation.set(-.12,Math.PI/2-.35,0);glasses.position.set(.02,.8+.265*.3,-.02);stand.add(glasses);
  // The cigarette rests beside them, unlit.
  const cigar=createCigarette(new THREE.Vector3(0,0,1));cigar.userData.ember.emissiveIntensity=0;
  cigar.scale.setScalar(.3);cigar.rotation.y=.5;cigar.position.set(.12,.8+.061*.3,.1);stand.add(cigar);
  cigar.traverse(mesh=>{if(mesh.isMesh)mesh.castShadow=true;});

  // A wall shelf above the nightstand, clear of its accessories and the poster.
  const shelf=new THREE.Group();shelf.name='Estante de madera';
  shelf.position.set(inner+.36,1.88,NIGHTSTAND_Z);room.add(shelf);
  box(.72,.10,1.26,wood,0,0,0,{cell:.35,dent:0},shelf);
  // Two wooden brackets support the shelf from the plaster wall.
  for(const z of [-.43,.43]){
    box(.055,.30,.065,woodDark,-.325,-.19,z,{cell:1,dent:0},shelf);
    const brace=box(.36,.055,.065,woodDark,-.18,-.18,z,{cell:1,dent:0},shelf);
    brace.rotation.z=.65;
  }
  const cameraProp=createFujifilmCamera();cameraProp.scale.setScalar(.45);
  cameraProp.rotation.y=Math.PI*.34;
  cameraProp.position.set(-.07,.05,0);shelf.add(cameraProp);

  // Full-height wall mirror in the free strip beside the nightstand and shelf.
  // The frame starts at z=1.79, leaving .05 clear of the shelf's z=1.74 edge.
  const mirrorWidth=.68,mirrorHeight=2.30,mirrorY=1.48,mirrorZ=2.18;
  const mirrorGroup=new THREE.Group();room.add(mirrorGroup);
  const mirror=createWallMirror(mirrorWidth,mirrorHeight);
  mirror.rotation.y=Math.PI/2;mirror.position.set(inner+.075,mirrorY,mirrorZ);mirrorGroup.add(mirror);
  for(const z of [mirrorZ-mirrorWidth/2-.025,mirrorZ+mirrorWidth/2+.025])
    box(.09,mirrorHeight+.10,.05,woodDark,inner+.05,mirrorY,z,{cell:.4,dent:.002},mirrorGroup);
  for(const y of [mirrorY-mirrorHeight/2-.025,mirrorY+mirrorHeight/2+.025])
    box(.09,.05,mirrorWidth,woodDark,inner+.05,y,mirrorZ,{cell:.4,dent:.002},mirrorGroup);

  // Corner plant: the garden's textured foliage in the original concrete pot.
  const plant=new THREE.Group();plant.position.set(-.35,FLOOR,inner+.42);room.add(plant);
  box(.62,.6,.62,concrete,0,.3,0,{cell:.3,dent:.02},plant);
  box(.52,.05,.52,soil,0,.58,0,{cell:.3},plant);
  const indoorPlant=createIndoorPlant(),{foliage}=indoorPlant;plant.add(foliage);
  const drySoil=soil.color.clone(),wetSoil=soil.color.clone().multiplyScalar(.55);

  // Desk under the window.
  const desk=new THREE.Group();room.add(desk);
  const deskZ=inner+.47,deskX=1.3,deskW=2.4;
  box(deskW,.1,.95,wood,deskX,1.13,deskZ,{cell:.35},desk);
  for(const x of [deskX-deskW/2+.08,deskX+deskW/2-.08])for(const z of [deskZ-.4,deskZ+.4])box(.1,1.05,.1,woodDark,x,FLOOR+.52,z,{cell:.5},desk);
  box(deskW-.2,.22,.06,woodDark,deskX,1.0,deskZ-.42,{cell:.4},desk);
  // Five Rings lies face-up beside the laptop, with the supplied cover art.
  const book=new THREE.Group();book.name='Five Rings · Miyamoto Musashi';
  book.position.set(.43,1.18,deskZ-.06);book.rotation.y=-.10;room.add(book);
  const bookRed=retro(0x9e2327),pages=retro(0xe8ddbf);
  box(.42,.009,.57,bookRed,0,.0045,0,{cell:1,dent:0},book);
  box(.392,.044,.542,pages,.004,.031,0,{cell:1,dent:0},book);
  box(.42,.009,.57,bookRed,0,.0575,0,{cell:1,dent:0},book);
  box(.014,.053,.57,bookRed,-.203,.031,0,{cell:1,dent:0},book);
  const bookCover=add(new THREE.PlaneGeometry(.42,.57),retro(0xffffff,{map:texture(`${import.meta.env.BASE_URL}textures/five-rings-cover.png`)}),0,.0625,0,book);
  bookCover.name='Tapa de Five Rings';bookCover.rotation.x=-Math.PI/2;
  // Yellow alarm clock and an articulated lamp.
  const clock=createDeskClock(),clockScale=.80;
  // Keep the feet on the desktop as the clock shrinks away from the lamp.
  clock.object.scale.setScalar(clockScale);clock.object.position.set(2.04,1.18+.31*clockScale,deskZ+.27);clock.object.rotation.y=.15;room.add(clock.object);
  let timeOfDay=610;
  clock.update(timeOfDay);
  // Angled toward the desk front, so its head stays clear of the wall.
  const lamp=new THREE.Group();lamp.position.set(2.3,1.18,deskZ-.22);lamp.rotation.y=.9;room.add(lamp);
  cylinder(.17,.19,.05,black,0,.025,0,8,lamp);
  const arm1=box(.045,.62,.045,black,0,.32,0,{cell:1},lamp);arm1.rotation.z=.35;arm1.position.set(-.1,.3,0);
  const arm2=box(.04,.55,.04,black,-.33,.72,0,{cell:1},lamp);arm2.rotation.z=-1.05;
  const head=cylinder(.05,.17,.26,black,-.58,.72,0,7,lamp);head.rotation.z=-.9;

  const bulb=cylinder(.12,.12,.015,retro(0xffd2a0,{emissive:0xffb46b,emissiveIntensity:0}),-.63,.61,0,7,lamp);
  bulb.rotation.z=-.9;bulb.castShadow=false;
  const lampLight=new THREE.PointLight(0xffbc79,0,4,2);lampLight.name='Luz de la lámpara';
  lampLight.position.set(-.68,.56,0);lamp.add(lampLight);

  // The interactive laptop, facing the chair.
  // Clear of the wall and the sill; the chair rolls Zud in to reach it.
  const laptopZ=inner+.72;
  const computer=new THREE.Group();computer.position.set(1.2,1.2,laptopZ);room.add(computer);
  box(.9,.045,.62,steel,0,0,0,{cell:.3,dent:.004},computer);
  box(.78,.01,.34,retro(0x5b5e66),0,.027,-.05,{cell:.3,dent:.002},computer);
  const lid=new THREE.Group();lid.position.set(0,.02,-.3);lid.rotation.x=-.16;computer.add(lid);
  box(.9,.58,.04,steel,0,.29,0,{cell:.3,dent:.004},lid);
  const display=retro(0x202039,{emissive:0x6979cf,emissiveIntensity:.4});
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(.78,.46),display);screen.position.set(0,.3,.022);lid.add(screen);
  const screenLight=new THREE.PointLight(0x9b9fff,.12,1.6,2);
  screenLight.position.set(0,.3,.15);lid.add(screenLight);
  const cursor=new THREE.Mesh(new THREE.PlaneGeometry(.03,.04),new THREE.MeshBasicMaterial({color:0xdfe8ff}));cursor.position.set(-.28,.18,.025);lid.add(cursor);

  // Wooden chair in front of the desk; its back faces the room.
  const chairZ=RETRO_SPOTS.seated.z;
  const chair=new THREE.Group();chair.position.set(RETRO_SPOTS.seated.x,0,chairZ);room.add(chair);
  // The backrest sits behind Zud's beanie and head when he rolls in to type, so
  // the seat runs deeper to the back and the back posts follow it.
  box(.8,.09,.96,wood,0,.73,.1,{cell:.3},chair);
  for(const x of [-.34,.34])for(const z of [-.32,.52])box(.075,.7,.075,woodDark,x,.37,z,{cell:1},chair);
  box(.8,.62,.08,wood,0,1.1,.56,{cell:.3},chair);
  for(const x of [-.34,.34])box(.075,.5,.075,woodDark,x,1.0,.61,{cell:1},chair);

  // Round logo rug.
  const rugTop=retro(0xffffff,{map:texture(`${import.meta.env.BASE_URL}textures/zud-rug.png`),mottle:.22});
  const rugMesh=new THREE.Mesh(new THREE.CylinderGeometry(1.3,1.3,.035,40),[rug,rugTop,rug]);
  rugMesh.position.set(.25,FLOOR+.018,.5);rugMesh.rotation.y=-Math.PI*.25;rugMesh.receiveShadow=true;room.add(rugMesh);

  // Clickable objects: the laptop starts work; the glasses and the cigarette
  // make Zud walk to the nightstand (facing it) and pick them up.
  // Picks them up facing the nightstand, then turns to the room to use them.
  const bedside={position:new THREE.Vector3(-.86,.12,NIGHTSTAND_Z+.16),heading:-Math.PI/2};
  const interactables=[
    windowItem,
    {object:clock.object,action:'clock',label:'Change the time',lift:1.02,activate(){room.userData.openClock?.();}},
    {object:computer,action:'work',label:'Work'},
    {object:glasses,action:'disco',label:'Put on glasses',visit:bedside},
    {object:cigar,action:'smoke',label:'Smoke',visit:bedside},
    // The bed is big: it only lifts a touch on hover.
    {object:bed,action:'sleep',label:'Sleep',bed:true,lift:1.02},
    {object:plant,action:'water',label:'Water the plant',// Beside the pot rather than in front of it, so from the room camera Zud's
    // head doesn't hide the pot; the stream arcs over to the soil.
    visit:{position:new THREE.Vector3(-.16,.12,-.78),heading:Math.PI+.1,stay:true}},
  ];
  let wet=0,plantGrowth=0,plantWatered=false;
  // Where the water lands: the middle of the pot's soil, in room space.
  const soilPoint=new THREE.Vector3(0,.61,0).add(plant.position);
  // Surface samples for real-time, single-bounce diffuse color transport.
  // They reference the actual live material, including soil changes and screen emission.
  const patch=(position,normal,area,material)=>({object:room,position:new THREE.Vector3(...position),normal:new THREE.Vector3(...normal),area,material});
  const bouncePatches=[
    patch([.9,.10,1.65],[0,1,0],2.2,wood),
    {object:foliage,position:new THREE.Vector3(0,.4,0),normal:new THREE.Vector3(0,1,0),omni:true,area:.55,material:()=>indoorPlant.material,color:new THREE.Color(0x86b443)},
    patch([-2.33,1.65,-.3],[1,0,0],2.6,plaster),
    patch([-1.0,1.8,-2.33],[0,0,1],2.2,plaster),
    patch([-1.59,.96,-.2],[0,1,0],1.4,navy),
    patch([1.3,1.185,-1.88],[0,1,0],1.5,wood),
    {object:screen,position:new THREE.Vector3(0,0,.03),normal:new THREE.Vector3(0,0,1),area:.35,material:display},
  ];
  const bounceBlockers=[];room.traverse(object=>{
    if(object.isMesh&&object.material.userData?.surfaceFamily)setRoomSurfaceUV(object.geometry,object.scale);
    if(object.isMesh&&object.castShadow)bounceBlockers.push(object);
  });
  const plantReady=indoorPlant.ready.then(()=>{
    bindLighting(foliage);
    foliage.traverse(mesh=>{if(mesh.isMesh){mesh.receiveShadow=false;if(mesh.castShadow)bounceBlockers.push(mesh);}});
  }).catch(error=>console.warn('[plant] The indoor foliage could not be loaded:',error));
  const criticalReady=Promise.all([texturesReady,plantReady]);
  const ready=Promise.all([criticalReady,outside.ready]);
  for(const [group,pivot] of [[desk,[deskX,FLOOR,deskZ]],[posterGroup,[inner+.012,2.15,posterZ]],[mirrorGroup,[inner+.075,mirrorY,mirrorZ]]]) {
    group.position.set(...pivot);
    for(const child of group.children)child.position.sub(group.position);
  }
  // Stable IDs keep saved scenes independent of Three.js UUIDs and mesh ordering.
  const editableObjects=[
    ['bed','Cama',bed,0],['nightstand','Mesita de luz',stand,1],
    ['plant','Planta',plant,2],['desk','Escritorio',desk,3],['chair','Silla de madera',chair,4],
    ['mirror','Espejo',mirrorGroup,5],['shelf','Estante de madera',shelf],
    ['poster','Póster',posterGroup],['rug','Alfombra',rugMesh],['book','Five Rings',book],
    ['clock','Despertador',clock.object],['lamp','Lámpara de escritorio',lamp],['laptop','Laptop',computer],
    ['glasses','Anteojos',glasses],['cigarette','Cigarro',cigar],['camera','Cámara Fujifilm',cameraProp],
  ].map(([id,label,object,obstacle])=>({id,label,object,obstacle}));
  return {room,ready,criticalReady,editableObjects,mirror,outside,clock,surfaces,interactables,soilPoint,bouncePatches,bounceBlockers,lights:[lampLight,screenLight],
    get plantGrowth(){return plantGrowth;},
    get blindsClosed(){return blindsClosed;},get blindAmount(){return blindAmount;},get daylight(){return dayCycle(timeOfDay).daylight*(1-blindAmount);},
    get timeOfDay(){return timeOfDay;},
    get cycle(){return dayCycle(timeOfDay);},
    get lampOn(){return lampLight.intensity>.08;},
    setTime(minutes){if(!Number.isFinite(minutes))return;timeOfDay=wrapMinutes(minutes);clock.update(timeOfDay);outside.update(timeOfDay);},
    update(typing,time,zudDesk=0,{glasses:wearing=false,cigarette:smoking=false,watering=false,dt=1/60,reducedMotion=false,editing=false,lying=0}={}) {
    const coverTarget=editing?0:THREE.MathUtils.smoothstep(lying,.65,1);
    const nextCover=reducedMotion?coverTarget:THREE.MathUtils.damp(bedCover,coverTarget,9,dt);
    if(Math.abs(nextCover-bedCover)>.00001){
      bedCover=nextCover;
      bedBlanket.update(bedCover);
    }
    pillow.position.y=pillowRestY-.06*lying;
    pillow.scale.y=THREE.MathUtils.lerp(1,.50,lying);
    blindAmount=reducedMotion?Number(blindsClosed):THREE.MathUtils.damp(blindAmount,Number(blindsClosed),6,dt);
    if(Math.abs(blindAmount-Number(blindsClosed))<.001)blindAmount=Number(blindsClosed);
    const blindHeight=THREE.MathUtils.lerp(.18,wh+.06,blindAmount);
    if(blindCloth.scale.y!==blindHeight){blindCloth.scale.y=blindHeight;setRoomSurfaceUV(blindCloth.geometry,blindCloth.scale);}
    blindCloth.position.y=win.top+.02-blindHeight/2;
    blindHem.position.y=win.top+.02-blindHeight;
    const darkness=1-dayCycle(timeOfDay).daylight*(1-blindAmount);
    bulb.material.emissiveIntensity=darkness*2.2;
    lampLight.intensity=darkness*2.8;
    // The first watering grows the foliage from its roots to the original size.
    // Keep that growth even after the soil dries; later watering cannot oversize it.
    plantWatered ||= watering;
    if(plantWatered){
      plantGrowth=reducedMotion?1:Math.min(1,plantGrowth+dt/2.4);
    }
    // Watering: the soil darkens (and slowly dries) and the leaves bob happily.
    wet=watering?Math.min(1,wet+.012):Math.max(0,wet-.0015);
    soil.color.copy(drySoil).lerp(wetSoil,wet);
    indoorPlant.update(plantGrowth,{watering,time,reducedMotion});
    // While Zud has them on or in hand, they're off the nightstand.
    if(!editing)glasses.visible=(glasses.userData.sceneVisible??true)&&!wearing;
    if(!editing)cigar.visible=(cigar.userData.sceneVisible??true)&&!smoking;
    // Zud rolls in toward the desk; the chair follows, the laptop meets him.
    if(!editing&&!chair.userData.sceneEdited)chair.position.z=chairZ-zudDesk*RETRO_SPOTS.deskReach*.44;
    cursor.visible=typing&&Math.sin(time*5)>0;
    display.emissiveIntensity=typing?1.1:.35;
    screenLight.intensity=typing?.26:.08;
  }};
}
