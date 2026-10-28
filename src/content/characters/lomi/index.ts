import type {CharacterDefinition} from '../character';

export const lomi: CharacterDefinition = {
  id: 'lomi',
  name: 'Lomi',
  portrait: 'lomi-face',
  preview: 'lomi',
  customization: {hats: false, palettes: false},
  voice: {pitch: 0.95, formant: 1.1, speed: 0.95, volume: 0.65},
  create: (options) => import('./lomi-model').then(({createLomi}) => createLomi(lomi, options)),
};
