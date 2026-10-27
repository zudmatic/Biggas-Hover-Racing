import {zudHat} from './hats/hat-catalog';
import palettes from './zudmatic/palettes.json';
import {shipConfig} from '../vehicles/catalog';

export const PILOTS={
  zud:{id:'zud',name:'Zud',image:'zud-face',preview:'zud',hats:true},
  zudmatic:{id:'zudmatic',name:'Zudmatic',image:'zudmatic-face',preview:'zudmatic',palettes:true,paperImages:false,load:options=>import('./zudmatic/zudmatic-model').then(m=>m.createZudmaticModel(options))},
  ajo:{id:'ajo',name:'Ajo',image:'ajo-face',preview:'ajo',load:options=>import('./ajo/ajo-model').then(m=>m.createAjoModel(options))},
  bluleet:{id:'bluleet',name:'Bluleet',image:'bluleet-pilot-face',preview:'bluleet-pilot',load:options=>import('./bluleet/bluleet-model').then(m=>m.createBluleetModel(options))},
  lomi:{id:'lomi',name:'Lomi',image:'lomi-face',preview:'lomi',load:options=>import('./lomi/lomi-model').then(m=>m.createLomiModel(options))},
};
export const ZUDMATIC_PALETTES=palettes;
export const pilotConfig=id=>PILOTS[id]??PILOTS.zud;
export const pilotPalette=name=>palettes.find(p=>p.name===name)??palettes[0];
export function pilotChoice(query=new URLSearchParams(location.search)){
  return {pilot:pilotConfig(query.get('pilot')??shipConfig(query.get('vehicle')).defaultPilot).id,palette:pilotPalette(query.get('palette')).name,hat:zudHat(query.get('hat')).id};
}
export function pilotQuery(choice){return `pilot=${pilotConfig(choice.pilot).id}&palette=${pilotPalette(choice.palette).name}&hat=${zudHat(choice.hat).id}`;}
