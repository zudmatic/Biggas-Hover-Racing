import type {VehiclePart} from './vehicle-definition';

/** Hangar groups of the shared parts table. */
export type ShipPartId = 'cockpit' | 'engines' | 'mast' | 'hull' | 'cooling' | 'landing' | 'guards' | 'lights';

type ShipPart = VehiclePart & {id: ShipPartId};

// Names and dimensions come from the supplied 033 GLB and its authoring manifest.
// Coordinates are authoring units, not meters. +Y up, +Z forward.
export const SHIP_PARTS: ShipPart[] = [
  {id: 'cockpit', name: 'Cabina monoplaza', tag: '01', anchor: [0, 1.8, 0.15], offset: [0, 0.75, 0], view: [4.9, 7.4, 7.4]},
  {id: 'engines', name: 'Propulsores gemelos', tag: '02', anchor: [0.72, 0.8, -2.15], offset: [0, 0, -1.15], view: [4, 3.2, -7]},
  {id: 'mast', name: 'Mástil dorsal', tag: '03', anchor: [0, 3.5, -2], offset: [0, 1.05, -0.3], view: [6.3, 3.7, 3]},
  {id: 'hull', name: 'Casco y blindaje', tag: '04', anchor: [-1.2, 1.1, 0.9], offset: [0, 0, 0], view: [-5.8, 3.6, 6.5]},
  {
    id: 'cooling',
    name: 'Radiadores laterales',
    tag: '05',
    anchor: [1.48, 0.9, -0.45],
    offset: [0.8, 0.1, 0],
    split: true,
    view: [7, 2.7, 3.3],
  },
  {id: 'landing', name: 'Tren de apoyo', tag: '06', anchor: [0.9, 0.22, 1.6], offset: [0, -0.45, 0.15], view: [5, 2, 6]},
  {id: 'guards', name: 'Asas y defensas', tag: '07', anchor: [-0.83, 1.84, -0.9], offset: [0.5, 0.35, 0], split: true, view: [-5, 4, 5.5]},
  {id: 'lights', name: 'Frente e iluminación', tag: '08', anchor: [0, 1, 2.1], offset: [0, 0.05, 0.9], view: [2, 2.5, 7.5]},
];

export type PartOverrides = Partial<Record<ShipPartId, Partial<Omit<VehiclePart, 'id'>>>>;

/**
 * A vehicle's parts table: the shared groups (all, or the ids listed in `only`)
 * with per-group overrides, after `defaults` that apply to every group.
 */
export function shipParts(
  overrides: PartOverrides,
  {only, defaults = {}}: {only?: readonly ShipPartId[]; defaults?: Partial<Omit<VehiclePart, 'id'>>} = {},
): VehiclePart[] {
  const base = only ? SHIP_PARTS.filter((part) => only.includes(part.id)) : SHIP_PARTS;
  return base.map((part) => ({...part, ...defaults, ...overrides[part.id]}));
}

/** GLTFLoader turns spaces into underscores; matching ignores case, accents and underscores. */
export const normalizePartName = (name: string): string => name.replaceAll('_', ' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const FLIGHT_DURATION = 18;

export type FlightPhase = 'Encendido' | 'Despegue' | 'Vuelo estacionario' | 'Aterrizaje' | 'En hangar';

/** The hangar's scripted take-off, hover and landing. */
export interface FlightPose {
  altitude: number;
  power: number;
  roll: number;
  pitch: number;
  bob: number;
  phase: FlightPhase;
}

const smooth = (a: number, b: number, x: number): number => {
  const u = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

export function flightPose(time: number): FlightPose {
  const t = Math.max(0, Math.min(FLIGHT_DURATION, time));
  const altitude = 1.15 * smooth(2, 6, t) * (1 - smooth(13, 17, t));
  const flight = smooth(5, 7, t) * (1 - smooth(11, 14, t));
  const power = smooth(0, 2, t) * (1 - smooth(15, 18, t));
  return {
    altitude,
    power,
    roll: Math.sin(t * 1.15) * 0.045 * flight,
    pitch: Math.sin(t * 0.7) * 0.035 * flight,
    bob: Math.sin(t * 2) * 0.045 * flight,
    phase: t < 2 ? 'Encendido' : t < 6 ? 'Despegue' : t < 13 ? 'Vuelo estacionario' : t < 17 ? 'Aterrizaje' : 'En hangar',
  };
}
