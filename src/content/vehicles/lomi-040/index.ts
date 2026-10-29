import type {VehicleDefinition, VehiclePart} from '../vehicle-definition';

const lomiParts: VehiclePart[] = [
  {id: 'cockpit', name: 'Asiento y reposapiés', tag: '01', anchor: [0, 1.03, -0.4], offset: [0, 0.75, 0], view: [4.9, 7.4, 7.4]},
  {
    id: 'engines',
    name: 'Toberas y singularidades',
    tag: '02',
    anchor: [0.76, 0.61, -2.64],
    offset: [0.6, 0, -1.1],
    split: true,
    view: [4, 3.2, -7],
  },
  {
    id: 'mast',
    name: 'Cristales dorsales',
    tag: '03',
    anchor: [0.64, 1.5, -1.82],
    offset: [0.5, 1.05, -0.3],
    split: true,
    view: [6.3, 3.7, 3],
  },
  {id: 'hull', name: 'Casco de acero negro', tag: '04', anchor: [-1.2, 0.9, 1.2], offset: [0, 0, 0], view: [-5.8, 3.6, 6.5]},
  {id: 'cooling', name: 'Alas de cristal', tag: '05', anchor: [1.71, 0.75, -0.37], offset: [0.8, 0.1, 0], split: true, view: [7, 2.7, 3.3]},
];

export function classifyLomiPart(name: string): string {
  if (/^Lomi_Ship_(Seat|SeatBack|Footrest)$/.test(name)) return 'cockpit';
  if (/^Lomi_Ship_Thrust_[LR]$/.test(name)) return 'engines';
  if (/^Lomi_Ship_Crystals_[LR]$/.test(name)) return 'mast';
  if (/^Lomi_Ship_CrystalWing_[LR]$/.test(name)) return 'cooling';
  return 'hull';
}

/** Lomi's ship: a singularity drive whose crystals and nozzles carry live plasma. */
export const lomi040: VehicleDefinition = {
  id: '040',
  name: 'Lomi 040',
  title: 'Nave de Lomi',
  image: '040',
  model: 'models/spaceship/lomi-040.glb',
  // The GLB is 9.34 u long with its origin at mid-height; 0.6 × and a 1.55 lift put it on the game's grid.
  transform: {scale: 0.6, offset: [0, 1.55, 0]},
  hull: {halfWidth: 2.24, halfLength: 2.81, capsuleRadius: 1.1, capsuleSpacing: 1.4, capsuleBottom: 0.6, capsuleTop: 1.3},
  seat: {
    fit: 'cockpit',
    offset: [0, 0.22, 0.05],
    builtInPilot: {character: 'lomi', node: 'Lomi_Pilot_Rig', clip: 'Lomi_Pilot_LookAround'},
  },
  engine: {
    kind: 'singularity',
    exhausts: [
      [-0.77, 0.62, -2.76, 0.13],
      [0.77, 0.62, -2.76, 0.13],
    ],
  },
  lights: {
    headlights: [
      [-0.5, 0.93, 2.7],
      [0.5, 0.93, 2.7],
    ],
    underglow: false,
  },
  hangar: {parts: lomiParts, classify: classifyLomiPart},
  // Crystals, wings and nozzles carry the plasma; the exhaust empties anchor its coils.
  liveNodes: /^Lomi_Ship_(Crystals_[LR]|CrystalWing_[LR]|Thrust_[LR]|Exhaust_(Left|Right))$/,
};
