import type {TrackDefinition} from '../track-definition';

export const tokyoHighway: TrackDefinition = {
  id: 'tokyo-highway',
  name: 'Tokyo Highway',
  number: '040',
  description: 'Autopista nocturna, túnel y puente bajo las luces de Tokyo Tower',
  summary: '2,73 KM · NOCHE · PRUEBA',
  folder: 'tokyo-highway',
  model: 'tokyo-highway.glb',
  physicalBoundaries: true,
  look: 'natural',
  night: true,
  authoredSky: true,
  music: 'desert',
  record: 'zud.hover.v1.tokyo-highway',
  overview: [580, 370, 620],
  lookAt: [20, 45, -20],
  async load(options) {
    const {TokyoHighwayTrack} = await import('./tokyo-highway-track');
    return TokyoHighwayTrack.load(tokyoHighway, options);
  },
};
