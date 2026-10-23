import {SHIP_PARTS,classifyShipPart} from './spaceship-parts.js';

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
export const SHIPS={
  '033':{id:'033',name:'Nave 033',title:'Nave de Zud',image:'033',file:'zud-033.glb',parts:SHIP_PARTS,classify:classifyShipPart,canopyName:'033_CANOPY_ocultar_para_ver_piloto',removeCanopyInFlight:true,pilotOffset:[0,0,0],exhausts:[[-.68,.62,-2.14,.24],[.68,.62,-2.14,.24]],lampName:/^033[_ ]faro[_ ]hielo/,headlights:[[-.8,1.05,1.7],[.8,1.05,1.7]]},
  '037':{id:'037',name:'Oliva 037',title:'Nave Oliva',image:'037',file:'oliva-037.glb',parts:olivaParts,classify:classifyOliva,windshield:true,hull:{halfWidth:1.86,halfLength:2.79,capsuleRadius:1.55,capsuleSpacing:1.2,capsuleBottom:1.5,capsuleTop:1.6},pilotOffset:[0,.12,-.12],exhausts:[[-1.24,.86,-2.68,.31],[0,1,-2.72,.28],[1.24,.86,-2.68,.31]],lampName:/^Faro_principal$|^Faro principal$/,headlights:[[0,1.29,2.79]]},
};
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
