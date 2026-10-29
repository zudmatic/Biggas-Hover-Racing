import baseDocument from './character-base.json' with {type: 'json'};
import {EYE_DEFAULTS, type EyeSettings} from './eye-settings';

/** Mesh resolution of Zud's shells; 'original' is the faceted print remodel. */
export type ZudDetail = 'original' | 'low' | 'medium' | 'high';
export type ZudShading = 'flat' | 'smooth';

type BaseSettings = typeof baseDocument.settings;

/** The approved appearance document plus the derived mesh detail and shading. */
export interface CharacterSettings extends EyeSettings, Omit<BaseSettings, 'detail' | 'shading'> {
  detail: ZudDetail;
  shading: ZudShading;
}

// Approved pilot appearance shared by the selection preview and both ships.
const meshQuality = baseDocument.settings.meshQuality;
export const CHARACTER_DEFAULTS: Readonly<CharacterSettings> = Object.freeze({
  ...EYE_DEFAULTS,
  ...baseDocument.settings,
  detail: meshQuality < 25 ? 'low' : meshQuality < 50 ? 'original' : meshQuality < 75 ? 'medium' : 'high',
  shading: meshQuality < 40 ? 'flat' : 'smooth',
});
