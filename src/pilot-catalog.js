import {zudHat} from './hat-catalog.js';
import palettes from './zudmatic-palettes.json';

export const PILOTS={
  zud:{id:'zud',name:'Zud',image:'zud-face',preview:'zud'},
  zudmatic:{id:'zudmatic',name:'Zudmatic',image:'zudmatic-face',preview:'zudmatic'},
};
export const ZUDMATIC_PALETTES=palettes;
export const pilotConfig=id=>PILOTS[id]??PILOTS.zud;
export const pilotPalette=name=>palettes.find(p=>p.name===name)??palettes[0];
export function pilotChoice(query=new URLSearchParams(location.search)){
  return {pilot:pilotConfig(query.get('pilot')).id,palette:pilotPalette(query.get('palette')).name,hat:zudHat(query.get('hat')).id};
}
export function pilotQuery(choice){return `pilot=${pilotConfig(choice.pilot).id}&palette=${pilotPalette(choice.palette).name}&hat=${zudHat(choice.hat).id}`;}
