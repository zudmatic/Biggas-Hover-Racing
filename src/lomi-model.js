import * as THREE from 'three';
import {createMannequinPilot} from './mannequin-pilot.js';

const LOMI={
  id:'lomi',name:'Lomi',url:'models/lomi/lomi.glb',
  // No calm idle clip: a still stance, left arm in model space, x mirrored for the right.
  stance:{arm:[.25,-1,-.2],forearm:[.16,-1,.25],hand:[.12,-1,.4]},
  // Seats were fitted from this clip's first frame, not the bind pose.
  seatFrom:'dance_loop_adjusted_fit',
  scale:{cockpit:1.05,nomada:1.45},sole:{down:.095,forward:.04},
  // The arms reach less than half as far as Ajo's, so the Nómada's grips extend to the palms.
  handlebarExtensions:true,
  // Lomi's hands are part of the body mesh: the palm sits between wrist and knuckles.
  palm:({bones},side)=>bones[`hand_${side}`].getWorldPosition(new THREE.Vector3()).lerp(bones[`middle_01_${side}`].getWorldPosition(new THREE.Vector3()),.5),
};

export const createLomiModel=options=>createMannequinPilot(LOMI,options);
