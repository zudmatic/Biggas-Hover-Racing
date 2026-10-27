import type {Vec3Tuple} from '@/core/types';
import type {ProgressCallback} from '@/core/assets/asset-loader';

/** Default rendering look of a track. `natural` is the sunlit PBR look. */
export type TrackLook = 'comic' | 'natural';

export interface TrackLoadOptions {
  mobile: boolean;
  anisotropy: number;
  /** Whether the selected vehicle has an underglow light (affects some details). */
  underglow?: boolean;
  onProgress?: ProgressCallback;
}

/**
 * A track as data. Add one by creating `content/tracks/<id>/index.ts` with a
 * definition and registering it; `load` returns the runtime world.
 */
export interface TrackDefinition {
  readonly id: string;
  readonly name: string;
  /** Catalog number shown in menus, e.g. "039". */
  readonly number: string;
  readonly description: string;
  readonly summary: string;
  /** Folder under public/models/. */
  readonly folder: string;
  readonly look: TrackLook;
  /** Music cue id from audio/catalog. */
  readonly music: string;
  /** localStorage key for best times. */
  readonly record: string;
  /** Lobby map-card camera. */
  readonly overview: Vec3Tuple;
  readonly lookAt: Vec3Tuple;
}
