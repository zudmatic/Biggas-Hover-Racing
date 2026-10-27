import {createDialKit} from '@/core/debug/dials';

export function createFlightFovControls(){
  const settings={};
  const kit=createDialKit('Nitro · lente y FOV',{
    'FOV base':[65,45,80,1],
    'FOV por velocidad':[12,0,20,1],
    'FOV extra nitro':[16,0,30,1],
    'Rapidez entrada':[9,1,20,.5],
    'Rapidez salida':[3.5,1,12,.5],
    Restablecer:{type:'action',label:'Restablecer lente'},
  },{id:'flight-nitro-lens',persist:false,defaultCollapsed:false,onAction:()=>kit.resetValues()});
  const unsubscribe=kit.subscribe(v=>Object.assign(settings,{base:v['FOV base'],speed:v['FOV por velocidad'],boost:v['FOV extra nitro'],attack:v['Rapidez entrada'],release:v['Rapidez salida']}));
  return {settings,dispose(){unsubscribe();kit.destroy();}};
}
