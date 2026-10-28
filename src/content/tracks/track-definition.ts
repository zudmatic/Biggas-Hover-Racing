import type {Vec3Tuple} from '@/core/types';
import type {ProgressCallback} from '@/core/assets/asset-loader';
import type {DriftFx} from '@/fx/drift/drift-fx';
import type {Track} from './track';

/** Default rendering look of a track. `natural` is the sunlit PBR look. */
export type TrackLook = 'comic' | 'natural';

/** Builds the drift smoke/spark material; the WebGPU path supplies a node material. */
export type FxMaterialFactory = NonNullable<Parameters<typeof DriftFx.load>[1]>['materialFactory'];

export interface TrackLoadOptions {
  mobile: boolean;
  anisotropy: number;
  /** Whether the selected vehicle has an underglow light (affects some details). */
  underglow?: boolean;
  onProgress?: ProgressCallback;
  fxMaterialFactory?: FxMaterialFactory;
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
  /** Visual GLB inside the folder. */
  readonly model: string;
  /** Collision GLB inside the folder (generic circuits). */
  readonly collider?: string;
  /** Driveable surface mesh inside the collision GLB (generic circuits). */
  readonly surface?: string;
  /** Collision meshes bound the track: no virtual walls from the route width. */
  readonly physicalBoundaries: boolean;
  readonly look: TrackLook;
  /** Music cue id from audio/catalog. */
  readonly music: string;
  /** localStorage key for best times. */
  readonly record: string;
  /** Lobby map-card camera. */
  readonly overview: Vec3Tuple;
  readonly lookAt: Vec3Tuple;
  /** Loads the runtime track. Heavy modules are imported on demand, so menus stay light. */
  load(options: TrackLoadOptions): Promise<Track>;
}

/** Path of a file inside the track's folder, relative to `public/`. */
export const trackFile = (definition: Pick<TrackDefinition, 'folder'>, file: string): string => `models/${definition.folder}/${file}`;
