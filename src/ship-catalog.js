import {SHIP_PARTS,classifyShipPart} from './spaceship-parts.js';
import {lightToonSurfaces} from './toon-surfaces.js';

const olivaParts=SHIP_PARTS.map(part=>({...part,...({
  cockpit:{name:'Cabina abierta',anchor:[0,1.8,0]},
  engines:{name:'Tres propulsores',anchor:[1.24,.86,-2.64]},
  mast:{name:'Alerón posterior',anchor:[0,2.9,-1.9]},
  hull:{anchor:[-1.8,1.3,.9]},
  cooling:{name:'Conductos y ventilación',anchor:[1.83,1,-1.5]},
  landing:{anchor:[1.25,.45,1.5]},
  guards:{anchor:[-1.2,1.83,-.95]},
  lights:{name:'Proa y faro frontal',anchor:[0,1.29,2.77]},
})[part.id]}));
function classifyOliva(name,inCanopy=false){
  const n=name.replaceAll('_',' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(inCanopy||/cabina|asiento|mando|consola|instrumentos|reposabrazos|pedal/.test(n))return 'cockpit';
  if(/tobera|reactor|nucleo|rejilla central/.test(n))return 'engines';
  if(/aleron|montante/.test(n))return 'mast';
  if(/conducto|ventilacion|respiradero|rejilla/.test(n))return 'cooling';
  if(/patin|amortiguador|piston|suspension|apoyo/.test(n))return 'landing';
  if(/\basa\b|barra protectora|anclaje barra/.test(n))return 'guards';
  if(/faro|toma frontal/.test(n))return 'lights';
  return 'hull';
}
const nomadaParts=SHIP_PARTS.map(part=>({...part,...({
  cockpit:{name:'Sillín y manillar',anchor:[0,1.5,.1]},
  engines:{name:'Reactor único',anchor:[0,.74,-2.82]},
  mast:{name:'Asta y bandera',anchor:[0,2.8,-1.8]},
  hull:{anchor:[-.3,.8,1.7]},
  cooling:{name:'Depósitos y tuberías',anchor:[.55,.65,.7]},
  landing:{name:'Estribos',anchor:[.72,.28,.65]},
  guards:{name:'Bastidor y refuerzos',anchor:[-.28,1.6,-1.1]},
  lights:{name:'Faro ámbar',anchor:[0,1.31,1.38]},
})[part.id]}));
function classifyNomada(name){
  const n=name.replaceAll('_',' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(/bastidor|refuerzo|soporte respaldo/.test(n))return 'guards';
  if(/asiento|respaldo|cuero|cojin|manillar|empunadura|cable freno/.test(n))return 'cockpit';
  if(/reactor|propulsor|turbina/.test(n))return 'engines';
  if(/asta|bandera|lona|hilo borde roto/.test(n))return 'mast';
  if(/deposito|escape|tuberia|cincha|tapon/.test(n))return 'cooling';
  if(/estribo/.test(n))return 'landing';
  if(/faro/.test(n))return 'lights';
  return 'hull';
}
// LOD0 exports eight rigid groups plus both eyes; the hangar inspects groups.
const bulldogParts=SHIP_PARTS.map(part=>({...part,split:false,...({
  cockpit:{name:'Monocasco y cabina',anchor:[0,2.25,-.6]},
  engines:{name:'Turbina y escapes',anchor:[.72,1.23,-2.9],view:[4.5,3,-7.4]},
  mast:{name:'Alerón trasero',anchor:[0,2.87,-2.37],view:[6,4.6,-4.4]},
  hull:{name:'Rieles y servicio',anchor:[-1.45,1.3,-.4]},
  cooling:{name:'Blindaje lateral y tomas',anchor:[1.42,.9,1.25],offset:[0,.1,0]},
  landing:{name:'Patines y alerones',anchor:[.88,.2,.9]},
  guards:{name:'Orejas',anchor:[-1.21,2.95,1.11],offset:[0,.55,0]},
  lights:{name:'Cara y ojos',anchor:[0,1.72,2.3],view:[2.2,2.6,8]},
})[part.id]}));
const bulldogGroups={'01':'cockpit','02':'lights','03':'guards','04':'cooling','05':'landing','06':'engines','07':'mast','09':'hull'};
// GLTFLoader names each primitive "LOD0_<group>_…_<n>"; the face rig (lenses,
// lids, tongue) keeps its Blender names.
function classifyBulldog(name){
  if(/eye_lens|^Lid|^LidCaps|tongue/i.test(name))return 'lights';
  return bulldogGroups[name.match(/^LOD0_(\d\d)/)?.[1]]??'hull';
}

export const SHIPS={
  bluleet:{id:'bluleet',name:'Bluleet',title:'Bluleet Hover Kart',image:'bluleet',file:'bluleet-car-web.glb',modelScale:5,defaultPilot:'bluleet',pilotFit:'bluleet',pilotOffsets:{bluleet:[0,0,0]},parts:SHIP_PARTS.filter(p=>['hull','cockpit','engines'].includes(p.id)).map(p=>({...p,...(p.id==='engines'?{name:'Propulsor central',anchor:[0,1.3,-2.5]}:{})})),classify:()=> 'hull',pilotOffset:[0,-.32,.08],hull:{halfWidth:1.78,halfLength:2.51,capsuleRadius:1.5,capsuleSpacing:1,capsuleBottom:.15,capsuleTop:1.8},exhausts:[[0,1.3,-2.5,.3]],lampName:/$^/,headlights:[[-1.1,.75,2.4],[1.1,.75,2.4]]},
  '033':{id:'033',name:'Nave 033',title:'Nave de Zud',image:'033',file:'zud-033.glb',parts:SHIP_PARTS,classify:classifyShipPart,canopyName:'033_CANOPY_ocultar_para_ver_piloto',removeCanopyInFlight:true,pilotOffset:[0,0,0],exhausts:[[-.68,.62,-2.14,.24],[.68,.62,-2.14,.24]],lampName:/^033[_ ]faro[_ ]hielo/,headlights:[[-.8,1.05,1.7],[.8,1.05,1.7]]},
  '037':{id:'037',name:'Oliva 037',title:'Nave Oliva',image:'037',file:'oliva-037.glb',parts:olivaParts,classify:classifyOliva,windshield:true,hull:{halfWidth:1.86,halfLength:2.79,capsuleRadius:1.55,capsuleSpacing:1.2,capsuleBottom:1.5,capsuleTop:1.6},pilotOffset:[0,.12,-.12],exhausts:[[-1.24,.86,-2.68,.31],[0,1,-2.72,.28],[1.24,.86,-2.68,.31]],lampName:/^Faro_principal$|^Faro principal$/,headlights:[[0,1.29,2.79]]},
  '038':{id:'038',name:'Nómada 038',title:'Nave Nómada',image:'038',file:'nomada-038.glb',parts:nomadaParts,classify:classifyNomada,modelYaw:-Math.PI/2,pilotOffset:[0,0,0],pilotFit:'nomada',clothName:/^Bandera[_ ]lona|^Hilo[_ ]borde[_ ]roto/,hull:{halfWidth:.8,halfLength:2.84,capsuleRadius:.95,capsuleSpacing:1.85,capsuleBottom:.9,capsuleTop:1.4},exhausts:[[0,.74,-2.85,.17]],lampName:/^Cristal[_ ]faro$/,headlights:[[0,1.31,1.39]]},
  '039':{id:'039',name:'Bulldog 039',title:'Nave Bulldog',image:'039',file:'bulldog-039.glb',parts:bulldogParts,classify:classifyBulldog,hull:{halfWidth:1.7,halfLength:2.82,capsuleRadius:1.4,capsuleSpacing:1.3,capsuleBottom:1.45,capsuleTop:1.9},pilotOffset:[0,.66,-.52],exhausts:[[-.88,.66,-2.8,.15],[0,1.23,-3.14,.44],[.88,.66,-2.8,.15]],headlights:[[-.81,1.72,2.08],[.81,1.72,2.08]],eyes:{impact:3},liveNodes:/^(CTRL_Eye_[LR]|Lid_[LR]|Candidate_thin_curved_tongue|Soft_tapered_tongue_groove_tone)$/,toonSurfaces:true},
};
// The supplied GLB faces +X; both render paths use +Z forward.
export function prepareShipModel(model,config){
  if(config.toonSurfaces)lightToonSurfaces(model);
  model.rotation.y+=config.modelYaw??0;model.scale.multiplyScalar(config.modelScale??1);model.updateMatrixWorld(true);return model;
}
export const shipConfig=id=>SHIPS[id]??SHIPS['033'];
export const shipUrl=(id,base=import.meta.env.BASE_URL)=>`${base}models/spaceship/${shipConfig(id).file}`;

// The Oliva is an open cockpit: only its windshield moves, not its seat or hull.
export function shipCanopy(model,config){
  if(config.canopyName)return model.getObjectByName(config.canopyName);
  if(!config.windshield)return null;
  const group=model.clone(false);group.name='037_PARABRISAS';group.clear();model.add(group);
  const pieces=[];model.traverse(mesh=>{if(mesh.isMesh&&/parabrisas/i.test(mesh.name))pieces.push(mesh);});
  pieces.forEach(mesh=>group.attach(mesh));return group;
}
