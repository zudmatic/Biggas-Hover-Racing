export const CIRCUIT_MAPS={
  ruins:{description:'Circuito de ruinas entre islas y agua',summary:'0,80 KM · ISLAS',id:'ruins',name:'Ruinas',number:'034',folder:'circuit034',model:'034_ruins_circuit_v01.glb',collider:'034_ruins_circuit_COLLIDERS.glb',surface:'COL_TRACK_RACE_SURFACE_12m',record:'zud.hover.v2.ruins034',overview:[175,145,205],lookAt:[-28,15,24]},
  nexus:{description:'Circuito urbano de Nexus',summary:'1,21 KM · CIUDAD',physicalBoundaries:true,id:'nexus',name:'Nexus',number:'035',folder:'circuit035',model:'035_nexus_circuit_v03.glb',collider:'035_nexus_circuit_COLLIDERS.glb',surface:'COL_TRACK_RACE_SURFACE_18m',record:'zud.hover.v1.nexus035',overview:[260,210,290],lookAt:[0,25,0]},
  'mario-raceway':{id:'mario-raceway',name:'Mario Raceway',number:'N64',description:'Mario Raceway de Nintendo 64, entre colinas, gradas y la gran tubería',summary:'1,50 KM · CLÁSICO',folder:'mario-raceway',model:'mario-raceway.glb',collider:'mario-raceway-colliders.glb',surface:'COL_TRACK_RACE_SURFACE',physicalBoundaries:true,record:'zud.hover.v1.mario-raceway',overview:[380,360,450],lookAt:[0,8,0]},
  'biggas-city':{defaultComic:false,id:'biggas-city',name:'Biggas Forest',number:'039',description:'Bosque, caminos de tierra y una cueva detrás de la cascada',summary:'3,64 KM · BOSQUE Y CUEVA',folder:'biggas-city',models:['Core','Forest_LOD1','Cascade'].map(part=>`Biggas_City_039_v02_${part}.glb`),collider:'Biggas_City_039_v02_Collision.glb',surface:'COL_ROAD',physicalBoundaries:true,record:'zud.hover.v1.biggas-forest039',overview:[1000,900,1100],lookAt:[-40,25,0]},
};
export const circuitMap=id=>CIRCUIT_MAPS[id]??CIRCUIT_MAPS.ruins;

export const circuitComic=(id,value=null)=>value===null?circuitMap(id).defaultComic!==false:value!=='0';
