import {shipParts} from '../parts';
import type {VehicleDefinition} from '../vehicle-definition';

// LOD0 exports eight rigid groups plus both eyes; the hangar inspects groups.
const bulldogParts = shipParts(
  {
    cockpit: {name: 'Monocasco y cabina', anchor: [0, 2.25, -0.6]},
    engines: {name: 'Turbina y escapes', anchor: [0.72, 1.23, -2.9], view: [4.5, 3, -7.4]},
    mast: {name: 'Alerón trasero', anchor: [0, 2.87, -2.37], view: [6, 4.6, -4.4]},
    hull: {name: 'Rieles y servicio', anchor: [-1.45, 1.3, -0.4]},
    cooling: {name: 'Blindaje lateral y tomas', anchor: [1.42, 0.9, 1.25], offset: [0, 0.1, 0]},
    landing: {name: 'Patines y alerones', anchor: [0.88, 0.2, 0.9]},
    guards: {name: 'Orejas', anchor: [-1.21, 2.95, 1.11], offset: [0, 0.55, 0]},
    lights: {name: 'Cara y ojos', anchor: [0, 1.72, 2.3], view: [2.2, 2.6, 8]},
  },
  {defaults: {split: false}},
);

const BULLDOG_GROUPS: Readonly<Partial<Record<string, string>>> = {
  '01': 'cockpit',
  '02': 'lights',
  '03': 'guards',
  '04': 'cooling',
  '05': 'landing',
  '06': 'engines',
  '07': 'mast',
  '09': 'hull',
};

// GLTFLoader names each primitive "LOD0_<group>_…_<n>"; the face rig (lenses,
// lids, tongue) keeps its Blender names.
export function classifyBulldogPart(name: string): string {
  if (/eye_lens|^Lid|^LidCaps|tongue/i.test(name)) return 'lights';
  const group = /^LOD0_(\d\d)/.exec(name)?.[1];
  return (group === undefined ? undefined : BULLDOG_GROUPS[group]) ?? 'hull';
}

/** Bulldog: a toon-shaded racer with a live face rig and a cinematic intro. */
export const bulldog039: VehicleDefinition = {
  id: '039',
  name: 'Bulldog 039',
  title: 'Nave Bulldog',
  image: '039',
  model: 'models/spaceship/bulldog-039.glb',
  hull: {halfWidth: 1.7, halfLength: 2.82, capsuleRadius: 1.4, capsuleSpacing: 1.3, capsuleBottom: 1.45, capsuleTop: 1.9},
  seat: {fit: 'cockpit', offset: [0, 0.66, -0.52]},
  engine: {
    kind: 'flame',
    exhausts: [
      [-0.88, 0.66, -2.8, 0.15],
      [0, 1.23, -3.14, 0.44],
      [0.88, 0.66, -2.8, 0.15],
    ],
  },
  lights: {
    headlights: [
      [-0.81, 1.72, 2.08],
      [0.81, 1.72, 2.08],
    ],
    underglow: true,
  },
  intro: 'bulldog',
  hangar: {parts: bulldogParts, classify: classifyBulldogPart},
  // Rigged parts (eye pivots, morphing lids and tongue) stay live; the rest is baked into batches.
  liveNodes: /^(CTRL_Eye_[LR]|Lid_[LR]|Candidate_thin_curved_tongue|Soft_tapered_tongue_groove_tone)$/,
  eyes: {impactThreshold: 3},
  toonSurfaces: true,
};
