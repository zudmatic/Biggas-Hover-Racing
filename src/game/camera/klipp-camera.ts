import {Object3D, Vector3, type PerspectiveCamera} from 'three';
import {FollowBodyThree, KlippThree, RotationComposerAimThree, VirtualCameraThree} from '@pmndrs/klipp/three';
import {createDialKit} from '@/core/debug/dials';
import {DisposableGroup, type Disposable} from '@/core/disposable';
import type {HoverState} from '@/sim/hover-state';
import {smoothCameraFov, type LensResponse} from './camera-fov';
import {CameraMotion, CAMERA_MOTION} from './camera-motion';

/** What the camera needs from the track to stay above ground and outside walls. */
export interface CameraCollider {
  surfaceHeight(x: number, z: number): number | null | undefined;
  clipCamera?(from: Vector3, to: Vector3): void;
}

/** Per-frame lens/framing targets from the speed atmosphere. */
export interface CameraProfile {
  fov: number;
  distance: number;
  height: number;
  anticipation: number;
  lens?: Partial<LensResponse>;
}

export interface KlippUpdate {
  world: CameraCollider;
  profile: CameraProfile;
  snap?: boolean;
  reduced?: boolean;
  /** 0 near, 1 far, 2 onboard. */
  cameraMode?: number;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const UP = new Vector3(0, 1, 0);

function createCameraDials(enabled: boolean) {
  return createDialKit(
    'Cámara · seguimiento',
    {
      Sistema: {type: 'select', options: ['Actual', 'Klipp'], default: enabled ? 'Klipp' : 'Actual'},
      'Retorno detrás': [1.2, 0.1, 2, 0.05],
      'Espera mouse': [0.7, 0, 2, 0.1],
      Distancia: [CAMERA_MOTION.distance, 6, 30, 0.5],
      Altura: [4, 2, 15, 0.25],
      Lateral: [0, -5, 5, 0.1],
      'Distancia por velocidad': [CAMERA_MOTION.speedDistance, 0, 6, 0.25],
      'Distancia extra turbo': [CAMERA_MOTION.boostDistance, 0, 3, 0.25],
      'Acercamiento al frenar': [CAMERA_MOTION.brakeDistance, 0, 2, 0.1],
      'Suavizado distancia': [CAMERA_MOTION.distanceSmooth, 0.05, 1, 0.025],
      'Entrada frenada': [CAMERA_MOTION.brakeAttack, 0.025, 0.5, 0.005],
      'Salida frenada': [CAMERA_MOTION.brakeRelease, 0.05, 1, 0.025],
      'Límite giro': [15, 0, 25, 1],
      'Seguir derrape': [CAMERA_MOTION.driftFollow, 0, 0.5, 0.05],
      'Suavizado posición': [0.1, 0, 1, 0.025],
      'Suavizado giro': [CAMERA_MOTION.turnSmooth, 0, 1, 0.01],
      'Suavizado mirada': [0, 0, 1, 0.025],
      Anticipación: [0, 0, 0.5, 0.025],
    },
    {id: 'flight-klipp-camera-v1', persist: false, defaultCollapsed: false},
  );
}

/**
 * Chase camera built on @pmndrs/klipp: follows the ship with damping, lets the
 * mouse orbit while driving and returns behind after a pause. Tuned from the
 * "Cámara · seguimiento" DialKit panel.
 */
export class KlippCamera implements Disposable {
  private readonly target = new Object3D();
  private readonly anchor = new Vector3();
  private readonly safePosition = new Vector3();
  private readonly rearPosition = new Vector3();
  private readonly events = new DisposableGroup();
  private readonly motion = new CameraMotion();
  private readonly kit: ReturnType<typeof createCameraDials>;
  private klipp: KlippThree | null = null;
  private shot: VirtualCameraThree | null = null;
  private body: FollowBodyThree | null = null;
  private aim: RotationComposerAimThree | null = null;
  private wasActive = false;
  private fov = 62;
  private collisionWorld: CameraCollider | null = null;
  private heading = 0;
  private orbitYaw = 0;
  private orbitHeight = 0;
  private idle = 0;
  private pointer: number | null = null;
  private lastX = 0;
  private lastY = 0;

  constructor(
    private readonly camera: PerspectiveCamera,
    {
      enabled = true,
      element = null,
      canOrbit = () => true,
    }: {enabled?: boolean; element?: HTMLElement | null; canOrbit?: () => boolean} = {},
  ) {
    this.kit = createCameraDials(enabled);
    if (!element) return;
    const {events} = this;
    events.listen(element, 'contextmenu', (e) => e.preventDefault());
    events.listen(element, 'pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || !canOrbit() || !this.wasActive || !this.enabled || this.pointer !== null) return;
      this.pointer = e.pointerId;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.idle = 0;
      element.setPointerCapture(e.pointerId);
    });
    events.listen(element, 'pointermove', (e) => {
      if (e.pointerId !== this.pointer) return;
      this.orbitYaw = wrap(this.orbitYaw - (e.clientX - this.lastX) * 0.006);
      this.orbitHeight = Math.max(-1.5, Math.min(5, this.orbitHeight + (e.clientY - this.lastY) * 0.025));
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.idle = 0;
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      events.listen(element, type, (e) => {
        if (e.pointerId === this.pointer) {
          this.pointer = null;
          this.idle = 0;
        }
      });
    }
  }

  get enabled(): boolean {
    return this.kit.values.Sistema === 'Klipp';
  }

  suspend(): void {
    this.wasActive = false;
    this.pointer = null;
  }

  update(state: HoverState, dt: number, {world, profile, snap = false, reduced = false, cameraMode = 0}: KlippUpdate): void {
    const v = this.kit.values;
    const {target, camera} = this;
    target.position.set(state.x, state.y, state.z);
    target.rotation.set(0, state.yaw, 0);
    target.updateMatrixWorld(true);
    this.collisionWorld = world;
    this.fov = smoothCameraFov(this.fov, profile.fov, dt, snap || !this.wasActive || reduced, profile.lens);
    if (snap || !this.wasActive) {
      this.reset();
      snap = true;
    }
    const chase = this.motion.update(state, dt, {
      snap, reduced, cameraMode, distance: v.Distancia,
      speedDistance: v['Distancia por velocidad'], boostDistance: v['Distancia extra turbo'],
      brakeDistance: v['Acercamiento al frenar'], distanceSmooth: v['Suavizado distancia'],
      brakeAttack: v['Entrada frenada'], brakeRelease: v['Salida frenada'],
      turnSmooth: v['Suavizado giro'], maxTurnAngle: v['Límite giro'] * Math.PI / 180,
      driftFollow: v['Seguir derrape'],
    });
    this.heading = chase.heading;
    if (snap) {
      this.orbitYaw = this.orbitHeight = this.idle = 0;
    } else {
      if (this.pointer === null) {
        this.idle += dt;
        if ((state.speed ?? 0) > 1 && this.idle >= v['Espera mouse']) {
          const decay = Math.exp((-dt * 4) / v['Retorno detrás']);
          this.orbitYaw *= decay;
          this.orbitHeight *= decay;
        }
      }
    }
    this.wasActive = true;
    const {klipp, body, aim} = this;
    if (!klipp || !body || !aim) return;
    klipp.setSize(camera.aspect * 1000, 1000);
    const far = cameraMode === 1 ? 2 : 1;
    body.offset = [v.Lateral, v.Altura * far, -chase.distance];
    body.damping = snap || reduced ? 0 : v['Suavizado posición'];
    body.rotationDamping = snap || reduced ? 0 : v['Suavizado giro'];
    aim.damping = snap || reduced ? 0 : v['Suavizado mirada'];
    aim.lookaheadTime = reduced ? 0 : v.Anticipación;
    klipp.update(Math.min(dt, 0.1));
    camera.updateMatrixWorld();
  }

  dispose(): void {
    this.events.dispose();
    if (this.klipp && this.shot) this.klipp.remove(this.shot);
    this.kit.destroy();
  }

  private reset(): void {
    if (this.klipp && this.shot) this.klipp.remove(this.shot);
    const {target, safePosition, rearPosition, anchor} = this;
    const klipp = new KlippThree(this.camera);
    const shot = new VirtualCameraThree('race-follow');
    const body = new FollowBodyThree(target, {bindingMode: 'lockToTargetWithWorldUp'});
    // Frame the ship itself. A forward offset rotates around it during turns
    // and pushes it offscreen when collision shortens the camera distance.
    const aim = new RotationComposerAimThree(target, {
      targetOffset: new Vector3(0, 2, 0),
      radius: 0,
      lookaheadIgnoreY: true,
      screenPosition: [0, -0.15],
    });
    shot.body = body;
    shot.aim = aim;
    // Correct the position BEFORE aiming, inside Klipp's state. Moving the real
    // camera afterward leaves both the composer and Klipp's cached shot stale.
    shot.addExtension({
      applyAfter: 'body',
      update: (out: {position: number[]}) => {
        safePosition.fromArray(out.position);
        // Chase orientation is relative to the car, never its delayed world position.
        // Keep vertical damping, but remove sideways translation lag in long turns.
        rearPosition
          .set(body.offset[0], 0, body.offset[2])
          .applyAxisAngle(UP, this.heading + this.orbitYaw)
          .add(target.position);
        safePosition.x = rearPosition.x;
        safePosition.z = rearPosition.z;
        safePosition.y += this.orbitHeight;
        const world = this.collisionWorld;
        safePosition.y = Math.max(safePosition.y, (world?.surfaceHeight(safePosition.x, safePosition.z) ?? 0) + 3.5);
        anchor.copy(target.position);
        anchor.y += 2.3;
        world?.clipCamera?.(anchor, safePosition);
        safePosition.toArray(out.position);
      },
    });
    shot.addExtension({
      applyAfter: 'start',
      update: (out: {fov: number}) => {
        out.fov = this.fov;
      },
    });
    klipp.add(shot);
    Object.assign(this, {klipp, shot, body, aim});
  }
}
