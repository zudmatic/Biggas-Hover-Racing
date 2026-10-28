import {normalizePartName, SHIP_PARTS} from '../parts';
import type {VehicleDefinition} from '../vehicle-definition';

export function classifyZudPart(name: string, inCanopy = false): string {
  const n = normalizePartName(name);
  if (inCanopy || /piloto|cabina|asiento|cojin|control|pedal|arnes|consola|interfaz|borda interior/.test(n)) return 'cockpit';
  if (/propulsor|tobera|aleta caliente|sombra bajo aleta|anillo interior/.test(n)) return 'engines';
  if (/mastil|vela/.test(n)) return 'mast';
  if (/radiador|disipadora|branquia/.test(n)) return 'cooling';
  if (/patin|apoyo trasero|suspension|amortiguador|piston|horquilla/.test(n)) return 'landing';
  if (/asa |barandilla|defensa|nervio naranja/.test(n)) return 'guards';
  if (/faro|toma frontal|boca oscura/.test(n)) return 'lights';
  return 'hull';
}

/** Zud's ship: a closed single-seat cockpit whose canopy is left out in flight. */
export const zud033: VehicleDefinition = {
  id: '033',
  name: 'Nave 033',
  title: 'Nave de Zud',
  image: '033',
  model: 'models/spaceship/zud-033.glb',
  seat: {fit: 'cockpit', offset: [0, 0, 0]},
  engine: {
    kind: 'flame',
    exhausts: [
      [-0.68, 0.62, -2.14, 0.24],
      [0.68, 0.62, -2.14, 0.24],
    ],
  },
  lights: {
    headlights: [
      [-0.8, 1.05, 1.7],
      [0.8, 1.05, 1.7],
    ],
    underglow: true,
    lampLens: /^033[_ ]faro[_ ]hielo/,
  },
  hangar: {parts: SHIP_PARTS, classify: classifyZudPart},
  canopy: {kind: 'node', node: '033_CANOPY_ocultar_para_ver_piloto', removeInFlight: true},
};
