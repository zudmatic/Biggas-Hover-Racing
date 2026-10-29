import {Vector3} from 'three';
import type {CharacterDefinition, CharacterOptions} from '../character';
import {MannequinCharacter, type MannequinSpec} from '../shared/mannequin-pilot';

export const LOMI: MannequinSpec = {
  url: 'models/lomi/lomi.glb',
  // No calm idle clip: a still stance, left arm in model space, x mirrored for the right.
  stance: {arm: [0.25, -1, -0.2], forearm: [0.16, -1, 0.25], hand: [0.12, -1, 0.4]},
  // Seats were fitted from this clip's first frame, not the bind pose.
  seatFrom: 'dance_loop_adjusted_fit',
  scale: {cockpit: 1.05, saddle: 1.45},
  sole: {down: 0.095, forward: 0.04},
  // The arms reach less than half as far as Ajo's, so the Nómada's grips extend to the palms.
  handlebarExtensions: true,
  // Lomi's hands are part of the body mesh: the palm sits between wrist and knuckles.
  palm: ({bones}, side) =>
    bones
      .get(`hand_${side}`)
      .getWorldPosition(new Vector3())
      .lerp(bones.get(`middle_01_${side}`).getWorldPosition(new Vector3()), 0.5),
};

export const createLomi = (definition: CharacterDefinition, options: CharacterOptions): Promise<MannequinCharacter> =>
  MannequinCharacter.load(LOMI, definition, options);
