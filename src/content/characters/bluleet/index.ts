import type {CharacterDefinition} from '../character';

export const bluleet: CharacterDefinition = {
  id: 'bluleet',
  name: 'Bluleet',
  portrait: 'bluleet-pilot-face',
  preview: 'bluleet-pilot',
  customization: {hats: false, palettes: false},
  voice: {pitch: 1.05, formant: 1.0, speed: 1.15, volume: 0.65},
  create: (options) => import('./bluleet-model').then(({createBluleet}) => createBluleet(bluleet, options)),
};
