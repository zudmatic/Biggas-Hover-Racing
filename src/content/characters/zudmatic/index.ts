import type {CharacterDefinition} from '../character';

export const zudmatic: CharacterDefinition = {
  id: 'zudmatic',
  name: 'Zudmatic',
  portrait: 'zudmatic-face',
  preview: 'zudmatic',
  paperImages: false,
  customization: {hats: false, palettes: true},
  voice: {pitch: 0.86, formant: 0.9, speed: 1.0, volume: 0.65},
  create: (options) => import('./zudmatic-model').then(({ZudmaticCharacter}) => ZudmaticCharacter.load(zudmatic, options)),
};
