import {normalizePartName, shipParts} from '../parts';
import type {VehicleDefinition} from '../vehicle-definition';

const nomadaParts = shipParts({
  cockpit: {name: 'Sillín y manillar', anchor: [0, 1.5, 0.1]},
  engines: {name: 'Reactor único', anchor: [0, 0.74, -2.82]},
  mast: {name: 'Asta y bandera', anchor: [0, 2.8, -1.8]},
  hull: {anchor: [-0.3, 0.8, 1.7]},
  cooling: {name: 'Depósitos y tuberías', anchor: [0.55, 0.65, 0.7]},
  landing: {name: 'Estribos', anchor: [0.72, 0.28, 0.65]},
  guards: {name: 'Bastidor y refuerzos', anchor: [-0.28, 1.6, -1.1]},
  lights: {name: 'Faro ámbar', anchor: [0, 1.31, 1.38]},
});

export function classifyNomadaPart(name: string): string {
  const n = normalizePartName(name);
  if (/bastidor|refuerzo|soporte respaldo/.test(n)) return 'guards';
  if (/asiento|respaldo|cuero|cojin|manillar|empunadura|cable freno/.test(n)) return 'cockpit';
  if (/reactor|propulsor|turbina/.test(n)) return 'engines';
  if (/asta|bandera|lona|hilo borde roto/.test(n)) return 'mast';
  if (/deposito|escape|tuberia|cincha|tapon/.test(n)) return 'cooling';
  if (/estribo/.test(n)) return 'landing';
  if (/faro/.test(n)) return 'lights';
  return 'hull';
}

/** Nómada: a hover bike ridden in the saddle, with a torn flag on its mast. */
export const nomada038: VehicleDefinition = {
  id: '038',
  name: 'Nómada 038',
  title: 'Nave Nómada',
  image: '038',
  model: 'models/spaceship/nomada-038.glb',
  // The Nómada GLB faces +X; both render paths use +Z forward.
  transform: {yaw: -Math.PI / 2},
  hull: {halfWidth: 0.8, halfLength: 2.84, capsuleRadius: 0.95, capsuleSpacing: 1.85, capsuleBottom: 0.9, capsuleTop: 1.4},
  seat: {fit: 'saddle', offset: [0, 0, 0]},
  engine: {kind: 'flame', exhausts: [[0, 0.74, -2.85, 0.17]]},
  lights: {
    headlights: [[0, 1.31, 1.39]],
    underglow: true,
    lampLens: /^Cristal[_ ]faro$/,
  },
  hangar: {parts: nomadaParts, classify: classifyNomadaPart},
  cloth: {meshes: /^Bandera[_ ]lona|^Hilo[_ ]borde[_ ]roto/, name: 'Bandera y flecos'},
};
