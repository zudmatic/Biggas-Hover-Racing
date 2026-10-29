import type {TrackDefinition} from '../track-definition';

/** Ruins 034: ruined circuit between islands and water. */
export const ruins: TrackDefinition = {
  id: 'ruins',
  name: 'Ruinas',
  number: '034',
  description: 'Circuito de ruinas entre islas y agua',
  summary: '0,80 KM · ISLAS',
  folder: 'circuit034',
  model: '034_ruins_circuit_v01.glb',
  collider: '034_ruins_circuit_COLLIDERS.glb',
  surface: 'COL_TRACK_RACE_SURFACE_12m',
  physicalBoundaries: false,
  look: 'comic',
  music: 'race',
  record: 'zud.hover.v2.ruins034',
  overview: [175, 145, 205],
  lookAt: [-28, 15, 24],
  async load(options) {
    const {CircuitTrack} = await import('../circuit/circuit-track');
    return CircuitTrack.load(ruins, options, {islands: true});
  },
};
