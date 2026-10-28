import type {CharacterDefinition, CharacterOptions} from '../character';
import {MannequinCharacter, meshCentroid, type MannequinSpec} from '../shared/mannequin-pilot';

export const AJO: MannequinSpec = {
  url: 'models/ajo/ajo.glb',
  idle: 'Ajo Relaxed Idle',
  castShadow: (mesh) => !mesh.name.includes('Face'),
  // The roster matches his body to Zudmatic's height; the tall ears sit above it.
  standingHeight: (mesh) => !mesh.name.includes('Ear'),
  // Match Zudmatic's visible head/body size in the cockpit and on the Nómada.
  scale: {cockpit: 0.96, saddle: 1.34},
  // Nómada footrest contact below the ankle joint, in model units.
  sole: {down: 0.04, forward: 0.06},
  // Mesh L/R names are opposite to the skeleton's L/R in this export.
  palm: ({meshes}, side) => {
    const hand = meshes.find((mesh) => mesh.name.includes(side === 'l' ? 'HandR' : 'HandL'));
    if (!hand) throw new Error('Ajo: falta la malla de la mano');
    return meshCentroid(hand);
  },
};

export const createAjo = (definition: CharacterDefinition, options: CharacterOptions): Promise<MannequinCharacter> =>
  MannequinCharacter.load(AJO, definition, options);
