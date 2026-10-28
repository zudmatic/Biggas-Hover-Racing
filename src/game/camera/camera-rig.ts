import {Vector3, type PerspectiveCamera} from 'three';
import {speedCameraProfile} from '@/render/sky/atmosphere';
import type {Disposable} from '@/core/disposable';
import type {HoverState} from '@/sim/hover-state';
import {smoothCameraFov} from './camera-fov';
import {FovDials} from './fov-dials';
import {KlippCamera, type CameraCollider, type CameraProfile} from './klipp-camera';

/** Near chase, far chase, onboard. Mode 3 is a dev-only free camera. */
export type CameraMode = 0 | 1 | 2 | 3;
export const CAMERA_LABELS = ['Cercana', 'Lejana', 'A bordo'] as const;

export interface CameraRigOptions {
  element: HTMLElement;
  /** `?camera=actual` starts with the classic chase camera instead of Klipp. */
  klipp: boolean;
  canOrbit: () => boolean;
  /** True while the oil test asks to look backwards. */
  lookingBack: () => boolean;
}

export interface CameraUpdate {
  world: CameraCollider;
  snap?: boolean;
  reducedMotion: boolean;
  /** Simulation time, drives impact shake. */
  time: number;
}

/**
 * The player's race camera: Klipp chase camera by default, the classic
 * spring camera for the onboard view / look-back / when Klipp is disabled,
 * speed-dependent FOV and impact shake.
 */
export class CameraRig implements Disposable {
  mode: CameraMode = 0;
  readonly fov = new FovDials();
  readonly klipp: KlippCamera;
  /** Last camera system used, for debugging. */
  system: 'Klipp' | 'Actual' = 'Klipp';
  private readonly forward = new Vector3();
  private readonly anchor = new Vector3();
  private readonly followAnchor = new Vector3();
  private readonly point = new Vector3();
  private readonly look = new Vector3();
  private readonly desiredCamera = new Vector3();
  private readonly desiredLook = new Vector3();

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly options: CameraRigOptions,
  ) {
    this.klipp = new KlippCamera(camera, {enabled: options.klipp, element: options.element, canOrbit: options.canOrbit});
  }

  /** Cycles near → far → onboard. Returns the new label. */
  cycle(): string {
    const next = ((this.mode + 1) % 3) as 0 | 1 | 2;
    this.mode = next;
    return CAMERA_LABELS[next];
  }

  profile(state: HoverState, reducedMotion: boolean): CameraProfile {
    return speedCameraProfile(state, {reducedMotion, cameraMode: this.mode, lens: this.fov.settings}) as CameraProfile;
  }

  update(state: HoverState, dt: number, {world, snap = false, reducedMotion, time}: CameraUpdate): void {
    if (import.meta.env.DEV && this.mode === 3) return;
    const {camera, forward, point, look, followAnchor} = this;
    const mode = this.mode;
    forward.set(Math.sin(state.yaw), 0, Math.cos(state.yaw));
    const profile = this.profile(state, reducedMotion);
    const rear = this.options.lookingBack();
    const useKlipp = this.klipp.enabled && mode !== 2 && !rear;
    this.system = useKlipp ? 'Klipp' : 'Actual';
    if (useKlipp) {
      this.klipp.update(state, dt, {world, profile, snap, reduced: reducedMotion, cameraMode: mode});
      point.copy(camera.position);
      followAnchor.set(state.x, state.y, state.z);
      camera.getWorldDirection(look);
      look.multiplyScalar(12).add(camera.position);
      return;
    }
    this.klipp.suspend();
    if (!snap) {
      const dx = state.x - followAnchor.x;
      const dy = state.y - followAnchor.y;
      const dz = state.z - followAnchor.z;
      point.x += dx;
      point.y += dy;
      point.z += dz;
      look.x += dx;
      look.y += dy;
      look.z += dz;
    }
    followAnchor.set(state.x, state.y, state.z);
    const {distance, height: up} = profile;
    const desired = this.desiredCamera
      .set(state.x, state.y + (rear ? 5 : up), state.z)
      .addScaledVector(forward, rear ? Math.max(12, distance) : -distance);
    if (mode !== 2) {
      const side = 0.8;
      desired.x += Math.cos(state.yaw) * side;
      desired.z -= Math.sin(state.yaw) * side;
    }
    desired.y = Math.max(desired.y, (world.surfaceHeight(desired.x, desired.z) ?? 0) + 3.5);
    const lookDistance = rear ? -12 : mode === 2 ? 70 : 8;
    this.desiredLook.set(
      state.x + Math.sin(state.yaw + profile.anticipation) * lookDistance,
      state.y + (mode === 2 ? 2.4 : 2) + Math.sin(state.pitch) * (mode === 2 ? 70 : 4),
      state.z + Math.cos(state.yaw + profile.anticipation) * lookDistance,
    );
    const alpha = snap || reducedMotion ? 1 : 1 - Math.exp(-dt * 8);
    point.lerp(desired, alpha);
    this.anchor.set(state.x, state.y + 2.3, state.z);
    world.clipCamera?.(this.anchor, point);
    look.lerp(this.desiredLook, alpha);
    camera.position.copy(point);
    if (!reducedMotion && state.impact > 0) {
      camera.position.x += Math.sin(time * 48) * state.impact * 0.008;
      camera.position.y += Math.cos(time * 39) * state.impact * 0.006;
    }
    camera.lookAt(look);
    if (Math.abs(camera.fov - profile.fov) > 0.01) {
      camera.fov = smoothCameraFov(camera.fov, profile.fov, dt, snap || reducedMotion, profile.lens);
      camera.updateProjectionMatrix();
    }
  }

  dispose(): void {
    this.klipp.dispose();
    this.fov.dispose();
  }
}
