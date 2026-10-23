import {SURFACE_FAMILIES} from './surface-library.js';
import baseDocument from './character-base.json' with {type:'json'};
import {HAT_CATALOG,HAT_DEFAULTS,hatDefaults} from './hat-catalog.js';
import {EYE_DEFAULTS,EYE_RANGES} from './eye-settings.js';
import {ARM_CATALOG,ARM_DEFAULTS} from './arm-catalog.js';

// Portable, versioned settings. Only allow known keys and bounded values;
// imported JSON and localStorage never become arbitrary scene properties.
export const CHARACTER_STORAGE='zud-character-lab-v1';
export const CHARACTER_BASE_REVISION=2;
export function geometryFromQuality(value) {
  const meshQuality=Math.max(0,Math.min(100,Math.round(value)));
  return {meshQuality,detail:meshQuality<25?'low':meshQuality<50?'original':meshQuality<75?'medium':'high',shading:meshQuality<40?'flat':'smooth'};
}
export function qualityFromGeometry(value) {
  return value?.detail==='low'?0:value?.detail==='medium'?50:value?.detail==='high'?75:value?.shading==='smooth'?40:25;
}
export const CHARACTER_DEFAULTS=Object.freeze({...HAT_DEFAULTS,...ARM_DEFAULTS,...EYE_DEFAULTS,...baseDocument.settings,...geometryFromQuality(baseDocument.settings.meshQuality??qualityFromGeometry(baseDocument.settings))});
const choices={hatModel:['beanie','none',...HAT_CATALOG.map(hat=>hat.id)],detail:['original','low','medium','high'],shading:['flat','smooth'],material:['standard','toon','normal'],
  skinTexture:['none',...Object.keys(SURFACE_FAMILIES),'knit','noise','checker','custom'],hatTexture:['none',...Object.keys(SURFACE_FAMILIES),'knit','noise','checker','custom'],pose:['idle','walk','wave','jump','dance','sleep']};
for(const key of ['armLeft','armRight'])choices[key]=['none',...ARM_CATALOG.map(arm=>arm.id)];
const ranges={...EYE_RANGES,meshQuality:[0,100],roughness:[0,1],metalness:[0,1],textureScale:[1,16],bump:[0,.5],width:[.7,1.3],height:[.7,1.3],headSize:[.8,1.2],hatSize:[.75,1.4],light:[.5,6],
  hatOffsetX:[-.3,.3],hatOffsetY:[-.35,.35],hatOffsetZ:[-.3,.3],hatYaw:[-180,180],hatTilt:[-25,25],hatRoughness:[0,1],hatMetalness:[0,1],hatCrownHeight:[.8,1.2]};
export function normalizeCharacterSettings(value) {
  const result={...CHARACTER_DEFAULTS,...(value?.hatModel?hatDefaults(value.hatModel):{})};
  if(!value||typeof value!=='object'||Array.isArray(value))return result;
  for(const [key,fallback] of Object.entries(result)) {
    const input=value[key];
    if(choices[key]){if(choices[key].includes(input))result[key]=input;}
    else if(ranges[key]){if(typeof input==='number'&&Number.isFinite(input))result[key]=Math.min(ranges[key][1],Math.max(ranges[key][0],input));}
    else if(typeof fallback==='boolean'){if(typeof input==='boolean')result[key]=input;}
    else if(typeof input==='string'&&/^#[0-9a-f]{6}$/i.test(input))result[key]=input;
  }
  if(typeof value.meshQuality==='number'&&Number.isFinite(value.meshQuality))Object.assign(result,geometryFromQuality(value.meshQuality));
  else if(choices.detail.includes(value.detail)||choices.shading.includes(value.shading))result.meshQuality=qualityFromGeometry(result);
  return result;
}
export function readCharacterDocument(value) {
  if(!value||value.type||value.version!==1||!value.settings||typeof value.settings!=='object'||Array.isArray(value.settings))throw new Error('Formato no compatible. Usá un JSON exportado por Zud Lab.');
  const texture=value.texture??null;
  if(texture!==null&&(typeof texture!=='string'||texture.length>3000000||!/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(texture)))throw new Error('La textura del archivo no es válida.');
  const settings=normalizeCharacterSettings(value.settings);
  if(!texture)for(const key of ['skinTexture','hatTexture'])if(settings[key]==='custom')settings[key]='none';
  return {version:1,settings,texture};
}
