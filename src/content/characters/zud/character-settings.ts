import baseDocument from './character-base.json' with {type:'json'};
import {EYE_DEFAULTS} from './eye-settings';

// Approved pilot appearance shared by the selection preview and both ships.
const meshQuality=baseDocument.settings.meshQuality;
export const CHARACTER_DEFAULTS=Object.freeze({
  ...EYE_DEFAULTS,
  ...baseDocument.settings,
  detail:meshQuality<25?'low':meshQuality<50?'original':meshQuality<75?'medium':'high',
  shading:meshQuality<40?'flat':'smooth',
});
