import type {Camera, DirectionalLight, InstancedMesh, Light, Object3D, Vector3} from 'three';
import type {Disposable} from '@/core/disposable';
import type {GamePhase} from '@/core/types';
import type {DriftFx} from '@/fx/drift/drift-fx';
import type {Landscape} from '@/sim/landscape';
import type {HoverState, Position3} from '@/sim/hover-state';
import type {SurfaceHeight} from '@/sim/hover-physics';
import type {TrackDefinition} from './track-definition';
import type {DesertLod} from './desert-valley/desert-lod';
import type {DesertTrain} from './desert-valley/desert-train';
import type {Water} from './desert-valley/water/water';
import {isInstancedMesh} from './scene-utils';

/** Drift smoke, sparks and hover marks shared by every track. */
export type FlightFx = DriftFx;

/** Driving-surface height under (x, z), or null off the map. Bound: safe to pass around. */
export type TrackSurfaceHeight = SurfaceHeight;

/** Pulls a chase-camera point in front of the first wall between `from` and `to`. */
export type ClipCamera = (from: Vector3, to: Vector3) => void;

export interface TrackUpdateContext {
  state: HoverState;
  phase: GamePhase;
  night?: boolean;
  camera?: Camera;
  shadowLight?: DirectionalLight;
  /** Vehicle model scale. */
  scale?: number;
  /** Seconds since the previous frame while driving; 0 when frozen. */
  dt?: number;
}

/** `TrackUpdateContext` plus the reduced-motion flag, as the shared effects expect it. */
export interface EffectsFrame extends TrackUpdateContext {
  reduced: boolean;
}

/** Fills a reusable effects frame (no per-frame allocation). */
export function effectsFrame(target: EffectsFrame | null, context: TrackUpdateContext, reduced: boolean): EffectsFrame {
  const frame = target ?? {state: context.state, phase: context.phase, reduced};
  frame.state = context.state;
  frame.phase = context.phase;
  frame.night = context.night;
  frame.camera = context.camera;
  frame.scale = context.scale;
  frame.dt = context.dt;
  frame.reduced = reduced;
  return frame;
}

/** Procedural tiling textures; `applyRoot` dresses extra objects (lighting props) with them. */
export interface TrackTextures {
  readonly count: number;
  applyRoot(root: Object3D): void;
}

export interface WaterStats {
  surfaceTriangles: number;
  effectTriangles: number;
}

export interface TrackWarmupOptions {
  /**
   * Draws one frame through the real pipeline (post-processing pass, shadow
   * map). Node/pipeline state is keyed by render target, so a compile against
   * the canvas alone does not warm the post-processed frame.
   */
  render: () => unknown;
  /**
   * Objects to uncull for that frame. Pass the whole scene so off-screen
   * objects of other systems compile too and shadow-casting lights refresh
   * their maps. Defaults to the track root.
   */
  scene?: Object3D;
}

/**
 * A loaded track: scenery, collision, route and track-specific life (details,
 * water, train). Created by `TrackDefinition.load`; the race owns it until
 * `dispose()`.
 */
export abstract class Track implements Disposable {
  abstract readonly definition: TrackDefinition;
  abstract readonly root: Object3D;
  abstract readonly landscape: Landscape;
  abstract readonly textures: TrackTextures;
  abstract readonly fx: FlightFx;
  /** Decorative objects on the track (telemetry only). */
  abstract readonly detailCount: number;
  abstract readonly surfaceHeight: TrackSurfaceHeight;
  readonly clipCamera?: ClipCamera;

  // Optional features. Desert Valley implements all of them.
  readonly lod?: DesertLod;
  readonly train?: DesertTrain;
  readonly instanceCount?: number;
  /** Animated water surface, once `initWater` has run. */
  get water(): Water | null {
    return null;
  }
  get waterStats(): WaterStats | null {
    return null;
  }
  /** Builds the animated water; it shares the sun's shadow map. */
  initWater?(sun: DirectionalLight): Promise<void>;
  resetWaterFx?(): void;

  /** Fixed-step collision against the track (60 Hz). `previous` is the pose before the step. */
  abstract step(state: HoverState, dt: number, previous?: Position3): void;
  /** Per-frame cosmetic update. */
  abstract update(time: number, reducedMotion: boolean, context: TrackUpdateContext): void;
  abstract reset(): void;
  abstract dispose(): void;

  /**
   * Compiles everything this track can show later: every LOD level and cell,
   * train cars, water effects and off-screen scenery, in both the camera and
   * the shadow pass. Call once while the loading screen still covers the
   * canvas, after the materials of the final look are bound. Without it, the
   * first appearance of each object builds its shaders mid-race (hitches).
   */
  async warmup({render, scene = this.root}: TrackWarmupOptions): Promise<void> {
    const restore = this.prepareWarmup();
    const unculled: Object3D[] = [];
    scene.traverse((object) => {
      if (object.frustumCulled) {
        object.frustumCulled = false;
        unculled.push(object);
      }
      const light = object as Light;
      if (light.isLight && light.castShadow && light.shadow) light.shadow.needsUpdate = true;
    });
    try {
      await render();
    } finally {
      for (const object of unculled) object.frustumCulled = true;
      restore();
    }
  }

  /**
   * Shows every lazily visible object of the track (hidden groups, empty
   * instance pools) for the warm-up frame; returns a function restoring the
   * previous state. Subclasses first fill their own pools with real content.
   */
  protected prepareWarmup(): () => void {
    const hidden: Object3D[] = [];
    const empty: InstancedMesh[] = [];
    const unallocated: Object3D[] = [];
    this.root.traverse((object) => {
      // A zero-capacity pool cannot contribute a shader variant: rendering it
      // creates an empty uniform buffer on WebGPU. Keep these pools hidden.
      if (isInstancedMesh(object) && object.instanceMatrix.count === 0) {
        if (object.visible) unallocated.push(object);
        object.visible = false;
        return;
      }
      if (!object.visible) {
        object.visible = true;
        hidden.push(object);
      }
      if (isInstancedMesh(object) && object.count === 0 && object.instanceMatrix.count > 0) {
        object.count = 1;
        empty.push(object);
      }
    });
    return () => {
      for (const mesh of empty) mesh.count = 0;
      for (const object of hidden) object.visible = false;
      for (const object of unallocated) object.visible = true;
    };
  }
}
