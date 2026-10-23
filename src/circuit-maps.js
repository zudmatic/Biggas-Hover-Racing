export const CIRCUIT_MAPS={
  ruins:{id:'ruins',name:'Ruinas',number:'034',folder:'circuit034',model:'034_ruins_circuit_v01.glb',collider:'034_ruins_circuit_COLLIDERS.glb',surface:'COL_TRACK_RACE_SURFACE_12m',record:'zud.hover.v2.ruins034',overview:[175,145,205],lookAt:[-28,15,24]},
  nexus:{id:'nexus',name:'Nexus',number:'035',folder:'circuit035',model:'035_nexus_circuit_v03.glb',collider:'035_nexus_circuit_COLLIDERS.glb',surface:'COL_TRACK_RACE_SURFACE_18m',record:'zud.hover.v1.nexus035',overview:[260,210,290],lookAt:[0,25,0]},
};
export const circuitMap=id=>CIRCUIT_MAPS[id]??CIRCUIT_MAPS.ruins;
