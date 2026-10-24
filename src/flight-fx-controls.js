import {createDialKit} from './dev-dials.js';

export function createFlightFxControls(fx,onChange=()=>{}){
  const kit=createDialKit('Humo · comparación',{
    'Tamaño':[1.3,.5,2.5,.05],
    'Duración':[1.5,.5,3,.05],
    'Color humo':{type:'color',default:'#bababa'},
    'Densidad':[1,.15,1,.05],
    'Trama':[1.5,1,4,.25],
    'Cuatro ruedas':false,
    Procedural:{type:'action',label:'A · Fragmentos procedurales'},
    Hibrido:{type:'action',label:'B · Humo híbrido'},
    Mixto:{type:'action',label:'C · Mixto'},
  },{id:'flight-fx-comparison',persist:true,defaultCollapsed:false,onAction:key=>{const options={Procedural:['procedural','Humo A · fragmentos procedurales'],Hibrido:['hybrid','Humo B · híbrido'],Mixto:['mixed','Humo C · mixto']},option=options[key];if(option){fx.setStyle(option[0]);onChange(option[1]);}}});
  const unsubscribe=kit.subscribe(v=>fx.configure({size:v['Tamaño'],lifetime:v['Duración'],fourSupports:v['Cuatro ruedas'],color:v['Color humo'],density:v.Densidad,grain:v.Trama}));
  return {dispose(){unsubscribe();kit.destroy();}};
}
