import {Registry} from '@/core/registry';
import type {TrackDefinition} from './track-definition';
import {desertValley} from './desert-valley';
import {ruins} from './ruins';
import {nexus} from './nexus';
import {marioRaceway} from './mario-raceway';

export type {TrackDefinition, TrackLoadOptions, TrackLook, FxMaterialFactory} from './track-definition';
export {Track} from './track';
export type {TrackUpdateContext, TrackTextures, TrackWarmupOptions, WaterStats, FlightFx} from './track';

/** Every track, in menu order. Unknown ids fall back to Ruins. */
export const tracks = new Registry<TrackDefinition>('Pista', 'ruins');
tracks.register(desertValley);
tracks.register(ruins);
tracks.register(nexus);
tracks.register(marioRaceway);
