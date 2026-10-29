import * as T from 'three';
import {createSurfaceIndex} from './circuit-collision.js';

// Pixel rectangles of the approved artwork. IDs and review-sheet captions are
// outside these UVs. Preserve each illustration's aspect instead of stretching.
export const biggasAds=[
  [1,'BIGGAS HOVER RACING',[24,61,399,253]],
  [2,'BIGDASH',[420,81,695,239]],
  [3,'ZUDMATIC WORKS',[716,78,963,248]],
  [4,'NÓMADA AERO',[987,43,1153,262]],
  [5,'OLIVA MOTORS',[1178,59,1512,259]],
  [6,'GRAV-0',[28,298,223,494]],
  [7,'APEX VISORS',[260,295,412,498]],
  [8,'VECTOR AERO',[439,349,845,459]],
  [9,'BIGGRIP GLOVES',[870,305,1068,496]],
  [10,'B39 CITY LOOP',[1092,337,1512,477]],
  [11,'BIGGAS EXPRESS',[25,568,359,704]],
  [12,'BIGGAS RACE TV',[380,542,692,718]],
  [13,'CAFÉ DEL ANDÉN',[718,515,881,731]],
  [14,'BIGBUN',[903,562,1346,717]],
  [15,'POLE POP',[1368,511,1512,730]],
  [16,'CASCADA 039',[40,757,209,989]],
  [17,'PISTA FRESCA',[267,805,658,969]],
  [18,'BOX 039 HOTEL',[743,766,834,991]],
  [19,'MERCADO 039',[917,779,1147,986]],
  [20,'BIGGAS NIGHT CUP',[1280,768,1499,992]],
].map(([id,title,rect])=>({id,title,rect,aspect:(rect[2]-rect[0])/(rect[3]-rect[1])}));

export async function loadBiggasAdTexture(url,anisotropy=4){
  const texture=await new T.TextureLoader().loadAsync(url);
  texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=anisotropy;
  return texture;
}

export function createBiggasAds(texture){
  // Headless geometry tests do not need a DOM/image decoder.
  if(!texture){texture=new T.DataTexture(new Uint8Array([255,255,255,255]),1,1);texture.needsUpdate=true;}
  const material=new T.MeshBasicMaterial({name:'Biggas · 20 anuncios aprobados',map:texture,toneMapped:false});
  material.userData.circuitUntextured=true;
  const placements=[];
  function panel(id,width){
    const ad=biggasAds.find(a=>a.id===id);if(!ad)throw new Error(`Unknown Biggas ad ${id}`);
    const g=new T.PlaneGeometry(width,width/ad.aspect),uv=g.attributes.uv,[x0,y0,x1,y1]=ad.rect;
    for(let i=0;i<uv.count;i++)uv.setXY(i,(x0+uv.getX(i)*(x1-x0))/1536,1-(y1-uv.getY(i)*(y1-y0))/1024);
    g.userData.circuitUV=true;return g;
  }
  return {texture,material,panel,placements,dispose(){material.dispose();texture.dispose();}};
}

// Capture local facade extents while authored object transforms are available,
// before their geometry is merged into spatial rendering batches.
export function captureBiggasAdFacades(assets){
  const facades=[];
  for(const asset of assets){asset.scene.updateMatrixWorld(true);asset.scene.traverse(o=>{
    if(!/^039_Asset_(hotel|apartment|office_tower)\d+$/.test(o.name)||!o.children.some(c=>c.isMesh))return;
    const inverse=o.matrixWorld.clone().invert(),bounds=new T.Box3();
    o.traverse(m=>{if(m.isMesh){m.geometry.computeBoundingBox();bounds.union(m.geometry.boundingBox.clone().applyMatrix4(inverse.clone().multiply(m.matrixWorld)));}});
    facades.push({name:o.name,matrix:o.matrixWorld.clone(),bounds});
  });}return facades;
}

export function addBiggasAds({atlas,root,landscape,routes,train,facades,add,box,beam,palette,setZone}){
  const up=new T.Vector3(0,1,0),floors=[];
  root.traverse(m=>{if(m.isMesh&&['Vegetacion terreno','Urban plaza paving','Hormigon claro','Asfalto grafito'].includes(m.material?.name))floors.push(m);});
  const heightAt=createSurfaceIndex(floors),supports=[];
  const sidePoint=(p,offset)=>new T.Vector3(p.x-p.nz*offset,p.y+(p.bank??0)*offset,p.z+p.nx*offset);
  function mount(id,center,normal,width,location){
    setZone(`ads:${Math.floor(center.x/240)}:${Math.floor(center.z/240)}`);
    const height=width/biggasAds[id-1].aspect,yaw=Math.atan2(normal.x,normal.z),right=new T.Vector3(normal.z,0,-normal.x);
    box(center,[width+.22,height+.22,.22],palette.metal,yaw);
    for(const s of [-1,1]){
      box(center.clone().addScaledVector(right,s*(width/2+.06)).addScaledVector(normal,.12),[.09,height+.22,.08],palette.cream,yaw);
      box(center.clone().addScaledVector(up,s*(height/2+.06)).addScaledVector(normal,.12),[width+.22,.09,.08],palette.cream,yaw);
    }
    const geometry=atlas.panel(id,width);add(geometry,atlas.material,center.clone().addScaledVector(normal,.17),undefined,new T.Euler(0,yaw,0));geometry.dispose();
    const placement={id,title:biggasAds[id-1].title,position:center.clone(),normal:normal.clone(),width,height,location};atlas.placements.push(placement);return placement;
  }
  function roadside(id,p,side,width,clearance,location){
    const height=width/biggasAds[id-1].aspect,offset=side*(p.width/2+5),center=sidePoint(p,offset),normal=new T.Vector3(p.nz*side,0,-p.nx*side),right=new T.Vector3(normal.z,0,-normal.x);
    center.y=(heightAt(center.x,center.z)??center.y)+clearance+height/2;
    const placement=mount(id,center,normal,width,location);
    for(const s of [-1,1]){
      const foot=center.clone().addScaledVector(right,s*width*.36);foot.y=heightAt(foot.x,foot.z)??p.y;
      const road=landscape.roadAt(foot.x,foot.z);if(road.distanceToRoad<road.width/2+1.5)throw new Error(`Ad ${id} support overlaps road`);
      beam(foot,foot.clone().setY(center.y-height/2),.12,palette.metal,true);supports.push(foot);
    }return placement;
  }
  // Retail posters replace the former repeating shop signs.
  const market=routes.branches[0];
  for(const [id,index] of [[3,0],[7,4],[9,8],[13,11]]){
    const p=routes.onBranch(market,.26+index*.038),side=index%2?1:-1,normal=new T.Vector3(p.nz*side,0,-p.nx*side),center=sidePoint(p,side*7.85);center.y+=3.6;
    mount(id,center,normal,Math.min(4.5,2.75*biggasAds[id-1].aspect),'comercio del mercado');
  }
  roadside(19,routes.onBranch(market,.22),1,4.2,2,'entrada del mercado');
  roadside(4,landscape.atDistance(1030),1,4.1,2.8,'avenida del bosque');
  roadside(8,landscape.atDistance(720),1,10,1.8,'curva urbana');
  roadside(16,routes.onBranch(routes.branches[2],.8),-1,3.2,1.6,'mirador de la cascada');
  roadside(17,landscape.atDistance(2220),1,7.2,3,'salida del bosque');

  // The start gantry fits below the elevated railway and above racers.
  const start=landscape.atDistance(65),direction=new T.Vector3(-start.nx,0,-start.nz),center=new T.Vector3(start.x,start.y+15,start.z),width=19;
  mount(1,center,direction,width,'pórtico de la recta principal');
  const right=new T.Vector3(direction.z,0,-direction.x),reach=start.width/2+4;
  const top=center.clone().setY(center.y+width/biggasAds[0].aspect/2+.35);
  beam(top.clone().addScaledVector(right,-reach),top.clone().addScaledVector(right,reach),.16,palette.metal);
  for(const s of [-1,1]){const bracket=top.clone().addScaledVector(right,s*width*.36);beam(bracket,bracket.clone().addScaledVector(up,-.35),.1,palette.metal);}
  for(const s of [-1,1]){const foot=top.clone().addScaledVector(right,s*reach);foot.y=heightAt(foot.x,foot.z)??start.y;beam(foot,foot.clone().setY(top.y),.2,palette.metal,true);supports.push(foot);}

  // Use real facade coordinates, including their authored yaw and scale.
  for(const [id,name,width,height] of [[2,'apartment003',15,12],[5,'office_tower007',22,32],[12,'office_tower005',22,15],[18,'hotel001',6.2,25],[20,'hotel006',10,15]]){
    const facade=facades.find(f=>f.name===`039_Asset_${name}`);if(!facade)throw new Error(`Missing advertising facade: ${name}`);
    const origin=new T.Vector3().setFromMatrixPosition(facade.matrix),road=landscape.mainRoadAt(origin.x,origin.z),toward=new T.Vector3(road.x,origin.y,road.z).applyMatrix4(facade.matrix.clone().invert()),side=toward.z>=0?1:-1;
    const center=new T.Vector3(0,facade.bounds.min.y+height,side>0?facade.bounds.max.z+.25:facade.bounds.min.z-.25).applyMatrix4(facade.matrix),normal=new T.Vector3(0,0,side).transformDirection(facade.matrix);
    mount(id,center,normal,width,'fachada de '+name);
  }
  // A viaduct fascia, suspended from the existing deck, clear of the roadway.
  const viaduct=landscape.atDistance(350),vn=new T.Vector3(-viaduct.nx,0,-viaduct.nz),vc=new T.Vector3(viaduct.x,viaduct.y+18,viaduct.z);
  mount(6,vc,vn,5.4,'frente del viaducto');
  for(const s of [-1,1]){const a=vc.clone().add(new T.Vector3(vn.z*s*2.3,2.8,-vn.x*s*2.3));beam(a,a.clone().setY(viaduct.y+23),.1,palette.metal);}

  // Station furniture stands on the actual elevated platform.
  const stationPose=train.route.at(-32),stationRight=new T.Vector3(stationPose.direction.z,0,-stationPose.direction.x).normalize(),station=stationPose.position;
  const loading=mount(11,station.clone().addScaledVector(stationRight,5.4).addScaledVector(up,3),stationRight,7.2,'zona de carga de la estación');
  for(const s of [-1,1]){const foot=loading.position.clone().addScaledVector(stationPose.direction,s*2.7).setY(station.y+1.425);beam(foot,foot.clone().setY(loading.position.y-loading.height/2),.08,palette.metal);}
  const vendingPose=train.route.at(7),vRight=new T.Vector3(vendingPose.direction.z,0,-vendingPose.direction.x).normalize(),vending=vendingPose.position.clone().addScaledVector(vRight,4.8).addScaledVector(up,2.8),vNormal=vRight.clone().negate(),vYaw=Math.atan2(vNormal.x,vNormal.z);
  setZone('ads:station');box(vending,[1.65,2.75,.85],palette.paint,vYaw);mount(15,vending.clone().addScaledVector(vNormal,.44),vNormal,1.38,'máquina de bebidas de la estación');
  box(vending.clone().addScaledVector(vNormal,.58).addScaledVector(up,-1.12),[1,.15,.2],palette.metal,vYaw);

  // Compact parked food trailer, with conservative collision outside the lane.
  const foodRoad=routes.onBranch(market,.84),food=sidePoint(foodRoad,12),foodNormal=new T.Vector3(foodRoad.nz,0,-foodRoad.nx),foodYaw=Math.atan2(foodNormal.x,foodNormal.z);
  const foodGround=heightAt(food.x,food.z)??food.y;food.y=Math.max(foodGround,foodRoad.y);setZone('ads:food');
  const baseHeight=food.y-foodGround+.15;
  box(food.clone().setY(foodGround+baseHeight/2),[6.6,baseHeight,3.7],palette.stone,foodYaw,true);
  box(food.clone().addScaledVector(up,1.8),[5.8,2.8,2.8],palette.paint,foodYaw,true);
  box(food.clone().addScaledVector(up,3.3),[6.2,.18,3.2],palette.cream,foodYaw);
  const foodRight=new T.Vector3(foodNormal.z,0,-foodNormal.x);
  for(const s of [-1,1])for(const front of [-1,1])box(food.clone().addScaledVector(foodRight,s*1.9).addScaledVector(foodNormal,front*1.35).addScaledVector(up,.5),[.65,.8,.32],palette.metal,foodYaw);
  mount(14,food.clone().addScaledVector(foodNormal,1.42).addScaledVector(up,2.1),foodNormal,5.3,'remolque gastronómico del mercado');
  return {supports};
}
