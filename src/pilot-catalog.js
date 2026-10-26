import {zudHat} from './hat-catalog.js';
import palettes from './zudmatic-palettes.json';
import {shipConfig} from './ship-catalog.js';

export const PILOTS={
  zud:{id:'zud',name:'Zud',image:'zud-face',preview:'zud'},
  zudmatic:{id:'zudmatic',name:'Zudmatic',image:'zudmatic-face',preview:'zudmatic'},
  ajo:{id:'ajo',name:'Ajo',image:'ajo-face',preview:'ajo'},
  bluleet:{id:'bluleet',name:'Bluleet',image:'bluleet-pilot-face',preview:'bluleet-pilot'},
};
export const ZUDMATIC_PALETTES=palettes;
export const pilotConfig=id=>PILOTS[id]??PILOTS.zud;
export const pilotPalette=name=>palettes.find(p=>p.name===name)??palettes[0];
export function pilotChoice(query=new URLSearchParams(location.search)){
  return {pilot:pilotConfig(query.get('pilot')??shipConfig(query.get('vehicle')).defaultPilot).id,palette:pilotPalette(query.get('palette')).name,hat:zudHat(query.get('hat')).id};
}
export function pilotQuery(choice){return `pilot=${pilotConfig(choice.pilot).id}&palette=${pilotPalette(choice.palette).name}&hat=${zudHat(choice.hat).id}`;}
