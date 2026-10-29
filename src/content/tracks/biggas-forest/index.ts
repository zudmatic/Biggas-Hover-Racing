import type {TrackDefinition} from '../track-definition';

/** Keep the previous map id so bookmarked race URLs continue to work. */
export const biggasForest: TrackDefinition = {
  id:'biggas-city', name:'Biggas Forest', number:'039',
  description:'Bosque, caminos de tierra y una cueva detrás de la cascada',
  summary:'3,64 KM · BOSQUE Y CUEVA', folder:'biggas-city',
  model:'Biggas_City_039_v02_Core.glb', collider:'Biggas_City_039_v02_Collision.glb',
  surface:'COL_ROAD', physicalBoundaries:true, look:'natural', music:'desert',
  record:'zud.hover.v1.biggas-forest039', overview:[1000,900,1100], lookAt:[-40,25,0],
  async load(options){const {ForestTrack}=await import('./forest-track');return ForestTrack.load(biggasForest,options);},
};
