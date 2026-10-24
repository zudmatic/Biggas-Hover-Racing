import {createDialKit} from './dev-dials.js';

export function createExhaustControls(exhaust,heat,{collapsed=true}={}){
  const kit=createDialKit('Propulsor · A · Chorro',{
    Longitud:[1,.3,2.5,.05],Ancho:[1,.3,2,.05],Intensidad:[1,.1,1,.05],Variacion:[.2,0,.5,.025],
    Turbulencia:[.55,0,1.5,.05],'Escala ruido':[2.2,.5,5,.1],'Velocidad flujo':[1.4,.1,3,.1],
    'Distorsión calor':[.45,0,1.5,.05],
    'Color fuego':{type:'color',default:'#ff791f'},'Color núcleo':{type:'color',default:'#fff1bc'},
  },{id:'flight-exhaust-fire',persist:true,defaultCollapsed:collapsed});
  const unsubscribe=kit.subscribe(v=>{heat?.configure(v['Distorsión calor']);exhaust.configure({length:v.Longitud,width:v.Ancho,intensity:v.Intensidad,variation:v.Variacion,turbulence:v.Turbulencia,noiseScale:v['Escala ruido'],flow:v['Velocidad flujo'],fire:v['Color fuego'],core:v['Color núcleo']});});
  return {dispose(){unsubscribe();kit.destroy();}};
}
