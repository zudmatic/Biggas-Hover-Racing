import type {TrackDefinition} from '../track-definition';

export const tokyoHighway: TrackDefinition = {
  id: 'tokyo-highway',
  name: 'Tokyo Highway',
  number: '040',
  description: 'Circuito elevado con puente, espiral y rutas alternativas por túnel y callejón',
  summary: '3,28 KM · NOCHE · PRUEBA',
  folder: 'tokyo-highway',
  model: 'tokyo-highway.glb',
  physicalBoundaries: true,
  look: 'natural',
  night: true,
  authoredSky: false,
  music: 'desert',
  record: 'zud.hover.v2.tokyo-elevated',
  overview: [580, 370, 620],
  lookAt: [0, 15, 0],
  async load(options) {
    const {TokyoHighwayTrack} = await import('./tokyo-highway-track');
    return TokyoHighwayTrack.load(tokyoHighway, options);
  },
};
