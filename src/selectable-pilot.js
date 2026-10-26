import {createSpaceshipPilot} from './spaceship-pilot.js';
import {pilotConfig} from './pilot-catalog.js';

export async function createSelectablePilot({pilot='zud',palette='Original',hat='beanie',offset=[0,0,0],fit}={}){
  const {load}=pilotConfig(pilot);
  if(load){
    const actor=await load({palette,seated:true,offset,fit});actor.root.visible=false;
    return {root:actor.root,actor,update:actor.update,dispose:actor.dispose};
  }
  const driver=createSpaceshipPilot({offset,fit});
  const {equipZudWardrobe}=await import('./zud-wardrobe.js');equipZudWardrobe(driver.actor);
  try{await driver.actor.setHat(hat);return driver;}catch(error){driver.dispose();throw error;}
}
