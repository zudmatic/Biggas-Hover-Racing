import {createCharacterHats} from '../hats/character-hats';
import {hatDefaults,zudHat} from '../hats/hat-catalog';

// One controller per actor: late loads cannot replace a more recent choice.
export function equipZudWardrobe(actor){
  let state={state:'ready',active:'beanie'},requested='beanie',pending=null,disposed=false;
  const hats=createCharacterHats(actor,{onChange:next=>{state=next;actor.root.userData.hat=next.active;}});
  actor.root.userData.hat='beanie';
  actor.setHat=function(id){
    const choice=zudHat(id).id;
    if(disposed)return Promise.resolve();
    if(choice===requested&&pending)return pending;
    const retry=choice===requested&&state.state==='error';requested=choice;
    pending=(retry?hats.retry():hats.update({...hatDefaults(choice),showPompom:true,wireframe:false})).then(()=>{
      if(!disposed&&requested===choice&&state.state==='error'){pending=null;throw state.error;}
      if(!disposed)hats.anchor.traverse(mesh=>{if(mesh.isMesh)mesh.userData.system='cockpit';});
    });
    return pending;
  };
  const dispose=actor.dispose;
  actor.dispose=()=>{disposed=true;hats.dispose();dispose();};
  return actor;
}
