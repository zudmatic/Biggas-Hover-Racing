import type {TrackDefinition} from '../track-definition';

/** Nexus 035: urban circuit; rooftop vents and beacons on the factories. */
export const nexus: TrackDefinition = {
  id: 'nexus',
  name: 'Nexus',
  number: '035',
  description: 'Circuito urbano de Nexus',
  summary: '1,21 KM · CIUDAD',
  folder: 'circuit035',
  model: '035_nexus_circuit_v03.glb',
  collider: '035_nexus_circuit_COLLIDERS.glb',
  surface: 'COL_TRACK_RACE_SURFACE_18m',
  physicalBoundaries: true,
  look: 'comic',
  music: 'race',
  record: 'zud.hover.v1.nexus035',
  overview: [260, 210, 290],
  lookAt: [0, 25, 0],
  async load(options) {
    const [{CircuitTrack}, {NexusDetails}] = await Promise.all([import('../circuit/circuit-track'), import('./nexus-details')]);
    return CircuitTrack.load(nexus, options, {
      city: true,
      createDetails: ({root, anchors, mobile}) => new NexusDetails(root, anchors, {mobile}),
    });
  },
};
