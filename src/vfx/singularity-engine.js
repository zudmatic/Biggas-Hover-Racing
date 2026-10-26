import * as THREE from 'three';
import {createEnergySignals,stepEnergySignals,loadEnergyTextures,IDLE_STATE} from './lomi-energy.js';
import {createSingularityLenses} from './singularity-lens.js';

// Same contract as createBoost; the ship owns the plasma, this drives it and the lenses.
export async function createSingularityEngine(renderer,scene,ship,{camera,lens}){
  lens.setTextures(await loadEnergyTextures());
  const signals=createEnergySignals(),lenses=createSingularityLenses(ship.anchors,signals,lens),size=new THREE.Vector2();
  const stats={power:0,palette:'Azul',emitted:0,capacity:0,particleLifetimes:[0,0,0],emittedByLayer:[0,0,0]};
  ship.plasma.driven=true;
  return {stats,
    clear(){Object.assign(signals,createEnergySignals(),{time:signals.time});},
    setQuality(){},
    async update(dt,mode,enabled,padBoost=false,state=IDLE_STATE){
      const step=enabled?dt:0;
      ship.root.updateMatrixWorld(true);
      stepEnergySignals(signals,ship.root,state,step);
      ship.plasma.update(signals,step);
      stats.power=signals.level;stats.palette=ship.plasma.uniforms.burst.value>.5?'Ráfaga':'Azul';
    },
    updatePost(post){
      // Keep the heat field's screen metrics current for boost pads; the ship adds no heat of its own.
      post.heat.update(ship.root,signals.time*3,0,0,.9,8,1.2);
      renderer.getDrawingBufferSize(size);
      lenses.sync(lenses.project(camera,size.x/Math.max(size.y,1)));
    },
    dispose(){ship.plasma.driven=false;lens.active.value=0;},
  };
}
