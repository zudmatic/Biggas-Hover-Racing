import type {CharacterDefinition} from '../character';

export const mrKerryCapija: CharacterDefinition = {
  id: 'mr-kerry-capija',
  name: 'Mr. Kerry Capija',
  portrait: 'mr-kerry-capija-face',
  preview: 'mr-kerry-capija',
  paperImages: false,
  customization: {hats: false, palettes: false},
  create: options => import('./kerry-model').then(({KerryCharacter}) => KerryCharacter.load(mrKerryCapija, options)),
};
