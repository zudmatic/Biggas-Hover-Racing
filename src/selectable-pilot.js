import {createSpaceshipPilot} from './spaceship-pilot.js';

export async function createSelectablePilot({pilot='zud',palette='Original',hat='beanie',offset=[0,0,0]}={}){
  if(pilot!=='zudmatic'){
    const driver=createSpaceshipPilot({offset});
    const {equipZudWardrobe}=await import('./zud-wardrobe.js');equipZudWardrobe(driver.actor);
    try{await driver.actor.setHat(hat);return driver;}catch(error){driver.dispose();throw error;}
  }
  const {createZudmaticModel}=await import('./zudmatic-model.js');
  const actor=await createZudmaticModel({palette,seated:true,offset});actor.root.visible=false;
  return {root:actor.root,actor,update:actor.update,dispose:actor.dispose};
}
