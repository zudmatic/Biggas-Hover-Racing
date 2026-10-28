import type {CharacterDefinition} from '../character';

export const ajo: CharacterDefinition = {
  id: 'ajo',
  name: 'Ajo',
  portrait: 'ajo-face',
  preview: 'ajo',
  customization: {hats: false, palettes: false},
  voice: {pitch: 1.4, formant: 1.2, speed: 1.12, volume: 0.65},
  create: (options) => import('./ajo-model').then(({createAjo}) => createAjo(ajo, options)),
};
