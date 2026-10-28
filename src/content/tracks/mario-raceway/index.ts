import type {TrackDefinition} from '../track-definition';

/** Mario Raceway (N64): hills, grandstands and the giant pipe. */
export const marioRaceway: TrackDefinition = {
  id: 'mario-raceway',
  name: 'Mario Raceway',
  number: 'N64',
  description: 'Mario Raceway de Nintendo 64, entre colinas, gradas y la gran tubería',
  summary: '1,50 KM · CLÁSICO',
  folder: 'mario-raceway',
  model: 'mario-raceway.glb',
  collider: 'mario-raceway-colliders.glb',
  surface: 'COL_TRACK_RACE_SURFACE',
  physicalBoundaries: true,
  look: 'comic',
  music: 'race',
  record: 'zud.hover.v1.mario-raceway',
  overview: [380, 360, 450],
  lookAt: [0, 8, 0],
  async load(options) {
    const {CircuitTrack} = await import('../circuit/circuit-track');
    return CircuitTrack.load(marioRaceway, options);
  },
};
