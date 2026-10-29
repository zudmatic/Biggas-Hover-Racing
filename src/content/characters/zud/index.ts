import type {CharacterDefinition} from '../character';

export const zud: CharacterDefinition = {
  id: 'zud',
  name: 'Zud',
  portrait: 'zud-face',
  preview: 'zud',
  customization: {hats: true, palettes: false},
  voice: {pitch: 1.2, formant: 1.1, speed: 1.05, volume: 0.65},
  create: (options) => import('./zud-character').then(({ZudCharacter}) => ZudCharacter.create(zud, options)),
};
