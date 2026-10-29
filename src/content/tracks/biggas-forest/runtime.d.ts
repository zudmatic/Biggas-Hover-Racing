import type {TrackDefinition,TrackLoadOptions} from '../track-definition';
import type {Track,TrackUpdateContext} from '../track';
import type {Position3} from '@/sim/hover-state';
export interface ForestRuntime extends Pick<Track,'root'|'landscape'|'textures'|'fx'|'surfaceHeight'|'clipCamera'|'detailCount'|'step'|'reset'|'dispose'> {
  update(time:number,reduced:boolean,context:TrackUpdateContext):void;
  adventure:{ambienceAt(state:Position3):{falls:number;wind:number;gallery:number;train:number}};
}
export function loadForestRuntime(definition:TrackDefinition,options:TrackLoadOptions):Promise<ForestRuntime>;
