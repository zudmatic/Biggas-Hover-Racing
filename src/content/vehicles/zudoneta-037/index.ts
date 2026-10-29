import {ZUDONETA_PAINT} from './liveries';
import {normalizePartName, shipParts} from '../parts';
import type {VehicleDefinition} from '../vehicle-definition';

const zudonetaParts = shipParts({
  cockpit: {name: 'Cabina abierta', anchor: [0, 1.8, 0]},
  engines: {name: 'Tres propulsores', anchor: [1.24, 0.86, -2.64]},
  mast: {name: 'Alerón posterior', anchor: [0, 2.9, -1.9]},
  hull: {anchor: [-1.8, 1.3, 0.9]},
  cooling: {name: 'Conductos y ventilación', anchor: [1.83, 1, -1.5]},
  landing: {anchor: [1.25, 0.45, 1.5]},
  guards: {anchor: [-1.2, 1.83, -0.95]},
  lights: {name: 'Proa y faro frontal', anchor: [0, 1.29, 2.77]},
});

export function classifyZudonetaPart(name: string, inCanopy = false): string {
  const n = normalizePartName(name);
  if (inCanopy || /cabina|asiento|mando|consola|instrumentos|reposabrazos|pedal|yoke|volante|arnes/.test(n)) return 'cockpit';
  if (/tobera|reactor|nucleo|rejilla central|rotor|alabe/.test(n)) return 'engines';
  if (/aleron|montante/.test(n)) return 'mast';
  if (/conducto|ventilacion|respiradero|rejilla/.test(n)) return 'cooling';
  if (/patin|amortiguador|piston|suspension|apoyo/.test(n)) return 'landing';
  if (/\basa\b|barra protectora|anclaje barra/.test(n)) return 'guards';
  if (/faro|toma frontal/.test(n)) return 'lights';
  return 'hull';
}

/** Zudoneta: an open cockpit with three engines; only the windshield opens. */
export const zudoneta037: VehicleDefinition = {
  id: '037',
  name: 'Zudoneta',
  title: 'Zudoneta',
  image: '037',
  paint: ZUDONETA_PAINT,
  model: 'models/spaceship/zudoneta-037-v07.glb',
  hull: {halfWidth: 1.86, halfLength: 2.79, capsuleRadius: 1.55, capsuleSpacing: 1.2, capsuleBottom: 1.5, capsuleTop: 1.6},
  seat: {fit: 'cockpit', offset: [0, 0.12, -0.12]},
  engine: {
    kind: 'flame',
    exhausts: [
      [-1.24, 0.86, -2.68, 0.31],
      [0, 1, -2.72, 0.28],
      [1.24, 0.86, -2.68, 0.31],
    ],
  },
  lights: {
    headlights: [[0, 1.29, 2.79]],
    underglow: true,
    lampLens: /^Faro_principal$|^Faro principal$/,
  },
  hangar: {parts: zudonetaParts, classify: classifyZudonetaPart},
  canopy: {kind: 'windshield', meshes: /parabrisas/i, group: '037_PARABRISAS'},
};
