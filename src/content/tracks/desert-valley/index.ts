import type {TrackDefinition} from '../track-definition';

/** Desert Valley 039: sandstone mesas, ramps, a river and a freight train. */
export const desertValley: TrackDefinition = {
  id: 'desert-valley',
  name: 'Desert Valley',
  number: '039',
  description: 'Mesetas de arenisca, rampas y tren de carga en el valle',
  summary: '2,29 KM · DESIERTO',
  folder: 'desert-valley',
  model: 'desert-valley-map.glb',
  physicalBoundaries: true,
  look: 'natural',
  music: 'desert',
  record: 'zud.hover.v1.desert-valley',
  overview: [595, 525, 665],
  lookAt: [0, 24.5, 0],
  async load(options) {
    const {DesertValleyTrack} = await import('./desert-valley-track');
    return DesertValleyTrack.load(desertValley, options);
  },
};
