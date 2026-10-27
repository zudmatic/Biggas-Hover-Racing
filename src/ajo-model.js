import {createMannequinPilot,meshCentroid} from './mannequin-pilot.js';

const AJO={
  id:'ajo',name:'Ajo',url:'models/ajo/ajo.glb',idle:'Ajo Relaxed Idle',
  castShadow:mesh=>!mesh.name.includes('Face'),
  // The roster matches his body to Zudmatic's height; the tall ears sit above it.
  standingHeight:mesh=>!mesh.name.includes('Ear'),
  // Match Zudmatic's visible head/body size in the cockpit and on the Nómada.
  scale:{cockpit:.96,nomada:1.34},
  // Nómada footrest contact below the ankle joint, in model units.
  sole:{down:.04,forward:.06},
  // Mesh L/R names are opposite to the skeleton's L/R in this export.
  palm:({meshes},side)=>meshCentroid(meshes.find(mesh=>mesh.name.includes(side==='l'?'HandR':'HandL'))),
};

export const createAjoModel=options=>createMannequinPilot(AJO,options);
