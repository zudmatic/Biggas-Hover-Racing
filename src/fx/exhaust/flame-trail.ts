import {
  BufferAttribute,
  DynamicDrawUsage,
  MathUtils,
  Mesh,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type Material,
  type Matrix4,
  type Object3D,
  type Scene,
} from 'three/webgpu';
import type {ExhaustMount} from '@/content/vehicles/vehicle-definition';
import type {Effect} from '../effect';
import {DEFAULT_NOZZLES, type NozzleMouth} from './nozzle-mouth';

/** Ribbon shape per frame. Keys mirror the propulsor dials the values come from. */
export interface FlameTrailSettings {
  Activa: boolean;
  /** Flame length at full power, ship units. */
  Longitud: number;
  Ancho: number;
  Pulsación: number;
  /** Measured exit of each nozzle; without it the flame roots on the mount. */
  Bocas?: readonly NozzleMouth[] | null;
  Separación?: number;
  /** Pilot length that keeps the idle flame attached to the mouth. */
  Mínima?: number;
  /** Seconds of hull rotation the tail lags behind. */
  Retraso?: number;
  /** Bend cap, degrees. */
  CurvaMáx?: number;
}

interface PoseSample {
  time: number;
  readonly position: Vector3;
  readonly rotation: Quaternion;
  readonly scale: Vector3;
}

interface Strip {
  readonly mesh: Mesh<PlaneGeometry, Material>;
  readonly nozzle: ExhaustMount;
  readonly index: number;
}

const SEGMENTS = 48;
/** Seconds of history the tail bend is measured over. */
const BEND_WINDOW = 0.1;
const HISTORY = 240;

// Each nozzle gets one ribbon that turns around the flame axis to face the camera, so it never goes edge-on
// (crossed fixed sheets collapse into hard-edged wedges when seen from behind, as in the racing camera).
// The flame is rigid along the nozzle axis; only its tail lags the hull's rotation, by the angle the axis
// turned over the last `Retraso` seconds, capped at `CurvaMáx` degrees and smoothed. It can bend, but it can
// never whip sideways, fold back or cross a neighbour, whatever the speed, impact or frame rate.
export class FlameTrail implements Effect {
  /** Effect-style driving: `update(dt)` samples `target` and draws with `settings` and `power`. */
  target: Object3D | null = null;
  settings: FlameTrailSettings = {Activa: true, Longitud: 4.6, Ancho: 1.22, Pulsación: 0.02};
  power = 0;

  private readonly history: PoseSample[] = [];
  private readonly strips: Strip[] = [];
  /** Ribbon centre line, root to tip. */
  private readonly rows = Array.from({length: SEGMENTS + 1}, () => new Vector3());
  /** Per vertex of the shared plane layout: its row, its across coordinate (uv.x) and its uv.y. */
  private readonly vertexRow: Uint8Array;
  private readonly vertexAcross: Float32Array;
  private readonly vertexAlong: Float32Array;
  private readonly cameraPosition = new Vector3();
  private hasCamera = false;
  private lastUpdate: number | null = null;
  private clock = 0;

  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly scale = new Vector3();
  private readonly axis = new Vector3();
  private readonly flameAxis = new Vector3();
  private readonly pastAxis = new Vector3();
  private readonly bendTarget = new Vector3();
  private readonly bend = new Vector3();
  private readonly bendWorld = new Vector3();
  private readonly inverse = new Quaternion();
  private readonly root = new Vector3();
  private readonly direction = new Vector3();
  private readonly tangent = new Vector3();
  private readonly right = new Vector3();
  private readonly toCamera = new Vector3();

  constructor(
    private readonly scene: Scene,
    material: Material,
    nozzles: readonly ExhaustMount[] = DEFAULT_NOZZLES,
  ) {
    for (const nozzle of nozzles) {
      const geometry = new PlaneGeometry(1, 1, 1, SEGMENTS);
      const position = geometry.attributes.position;
      if (position instanceof BufferAttribute) position.setUsage(DynamicDrawUsage);
      const mesh = new Mesh(geometry, material);
      mesh.frustumCulled = false;
      scene.add(mesh);
      // Camera pose lags one frame, which is invisible on a ribbon this soft.
      mesh.onBeforeRender = (_renderer, _scene, camera) => {
        camera.getWorldPosition(this.cameraPosition);
        this.hasCamera = true;
      };
      this.strips.push({mesh, nozzle, index: this.strips.length});
    }
    const layout = new PlaneGeometry(1, 1, 1, SEGMENTS);
    const uvs = layout.attributes.uv;
    this.vertexRow = new Uint8Array(uvs.count);
    this.vertexAcross = new Float32Array(uvs.count);
    this.vertexAlong = new Float32Array(uvs.count);
    for (let i = 0; i < uvs.count; i++) {
      this.vertexAlong[i] = uvs.getY(i);
      this.vertexAcross[i] = uvs.getX(i);
      this.vertexRow[i] = Math.round(this.vertexAlong[i] * SEGMENTS);
    }
    layout.dispose();
  }

  /** Samples the ship pose at `time` (refreshes its world matrices first). */
  record(time: number, ship: Object3D): void {
    ship.updateMatrixWorld(true);
    this.recordPose(time, ship.matrixWorld);
  }

  /** Samples a world matrix the caller already brought up to date. */
  recordPose(time: number, matrixWorld: Matrix4): void {
    const {history, position, rotation, scale} = this;
    matrixWorld.decompose(position, rotation, scale);
    const last = history.at(-1);
    if (last && time === last.time) return;
    if (last && (time < last.time || position.distanceTo(last.position) > 15)) history.length = 0;
    const sample = (history.length >= HISTORY ? history.shift() : undefined) ?? {
      time,
      position: new Vector3(),
      rotation: new Quaternion(),
      scale: new Vector3(),
    };
    sample.time = time;
    sample.position.copy(position);
    sample.rotation.copy(rotation);
    sample.scale.copy(scale);
    history.push(sample);
  }

  /** Rebuilds every ribbon for `time` from the recorded poses. */
  draw(time: number, settings: FlameTrailSettings, power: number): void {
    const latest = this.history.at(-1);
    if (!latest) return;
    const {
      rows,
      axis,
      flameAxis,
      pastAxis,
      bendTarget,
      bend,
      bendWorld,
      inverse,
      root,
      direction,
      tangent,
      right,
      toCamera,
      cameraPosition,
    } = this;
    const modelScale = Math.max(latest.scale.x, latest.scale.y, latest.scale.z);
    const pulse = 1 + settings.Pulsación * Math.sin(time * 31);
    const idleWidth = MathUtils.lerp(0.6, 1, MathUtils.smoothstep(power, 0.13, 0.45));
    // Tail lag in ship space: where the nozzle axis pointed `window` s ago, scaled to the lag time and capped.
    const lag = Math.max(0, settings.Retraso ?? 0.12);
    const maxBend = MathUtils.degToRad(settings['CurvaMáx'] ?? 14);
    inverse.copy(latest.rotation).invert();
    pastAxis
      .set(0, 0, -1)
      .applyQuaternion(this.rotationAt(time - BEND_WINDOW, this.rotation))
      .applyQuaternion(inverse);
    bendTarget.set(pastAxis.x, pastAxis.y, 0);
    const turned = Math.atan2(bendTarget.length(), -pastAxis.z);
    if (turned > 1e-6) bendTarget.setLength(Math.min(maxBend, (turned * lag) / BEND_WINDOW));
    else bendTarget.set(0, 0, 0);
    const dt = this.lastUpdate === null || time < this.lastUpdate ? Infinity : time - this.lastUpdate;
    this.lastUpdate = time;
    if (dt === Infinity) bend.copy(bendTarget);
    else bend.lerp(bendTarget, 1 - Math.exp(-dt / 0.08));
    bendWorld.copy(bend).applyQuaternion(latest.rotation);
    axis.set(0, 0, -1).applyQuaternion(latest.rotation);
    right.set(1, 0, 0).applyQuaternion(latest.rotation);

    for (const {mesh, nozzle, index} of this.strips) {
      mesh.visible = settings.Activa && power > 0.005;
      if (!mesh.visible) continue;
      // Root on the measured exit plane; a pilot length keeps the idle flame attached to the mouth.
      const mouth = settings.Bocas?.[index];
      const start = (mouth?.start ?? 0) + (settings.Separación ?? 0);
      const mouthRadius = mouth?.radius ?? Infinity;
      // The pilot floor fades with power below idle (.13), so a cut-off flame shrinks instead of popping.
      const length =
        Math.max(settings.Longitud * power, (((settings.Mínima ?? 0) * nozzle[3]) / 0.24) * Math.min(1, power / 0.13)) * modelScale * pulse;
      // The visible flame (~68% of the ribbon) is capped to the mouth for the first 5%, then opens up.
      const halfWidth = 0.5 * settings.Ancho * modelScale * (nozzle[3] / 0.24) * idleWidth;
      const squeeze = Math.min(1, (0.9 * mouthRadius * modelScale) / (0.68 * halfWidth));
      root
        .set(nozzle[0], nozzle[1], nozzle[2] - start)
        .multiply(latest.scale)
        .applyQuaternion(latest.rotation)
        .add(latest.position);
      // March along the curve: the heading turns linearly from the axis to the full bend at the tip.
      rows[0].copy(root);
      const step = length / SEGMENTS;
      const bendAngle = bendWorld.length();
      for (let j = 1; j <= SEGMENTS; j++) {
        const heading = (bendAngle * (j - 0.5)) / SEGMENTS;
        direction.copy(axis).multiplyScalar(Math.cos(heading));
        if (bendAngle > 0) direction.addScaledVector(bendWorld, Math.sin(heading) / bendAngle);
        rows[j].copy(rows[j - 1]).addScaledVector(direction, step);
      }
      const positions = mesh.geometry.attributes.position;
      const array = positions.array;
      // Both vertices of a row share its width axis: solve it once per row.
      let solvedRow = -1;
      let widen = 0;
      for (let i = 0; i < positions.count; i++) {
        const t = this.vertexAlong[i];
        const j = this.vertexRow[i];
        const center = rows[j];
        if (j !== solvedRow) {
          solvedRow = j;
          tangent.subVectors(rows[Math.min(SEGMENTS, j + 1)], rows[Math.max(0, j - 1)]).normalize();
          // Width axis ⟂ flame tangent and view ray; near head-on it is ill-defined, so blend back to the ship's right.
          toCamera.subVectors(cameraPosition, center);
          const sine = this.hasCamera ? flameAxis.crossVectors(tangent, toCamera).length() / Math.max(1e-6, toCamera.length()) : 0;
          if (sine > 1e-4) {
            flameAxis.divideScalar(sine * toCamera.length());
            if (flameAxis.dot(right) < 0) flameAxis.negate();
            flameAxis.lerp(right, 1 - MathUtils.smoothstep(sine, 0.04, 0.3)).normalize();
          } else flameAxis.copy(right);
          widen = MathUtils.lerp(squeeze, 1, MathUtils.smoothstep(t, 0.05, 0.35));
        }
        const offset = (this.vertexAcross[i] - 0.5) * 2 * halfWidth * widen;
        array[i * 3] = center.x + flameAxis.x * offset;
        array[i * 3 + 1] = center.y + flameAxis.y * offset;
        array[i * 3 + 2] = center.z + flameAxis.z * offset;
      }
      positions.needsUpdate = true;
    }
  }

  /** Effect step: advances its own clock, samples `target` and draws. */
  update(dt: number): void {
    this.clock += dt;
    if (this.target) this.record(this.clock, this.target);
    this.draw(this.clock, this.settings, this.power);
  }

  reset(): void {
    this.clear();
  }

  clear(): void {
    this.history.length = 0;
    this.lastUpdate = null;
    this.bend.set(0, 0, 0);
    for (const {mesh} of this.strips) mesh.visible = false;
  }

  dispose(): void {
    for (const {mesh} of this.strips) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.history.length = 0;
  }

  // Interpolated ship rotation at `when`, clamped to the recorded history.
  private rotationAt(when: number, out: Quaternion): Quaternion {
    const {history} = this;
    let lo = 0;
    let hi = history.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (history[mid].time <= when) lo = mid;
      else hi = mid - 1;
    }
    const a = history[lo];
    const b = history[Math.min(lo + 1, history.length - 1)];
    const blend = b.time > a.time ? MathUtils.clamp((when - a.time) / (b.time - a.time), 0, 1) : 0;
    return out.slerpQuaternions(a.rotation, b.rotation, blend);
  }
}

/** The pre-class surface: `update` draws with explicit settings and power. */
export interface FlameTrailHandle {
  record(time: number, ship: Object3D): void;
  update(time: number, settings: FlameTrailSettings, power: number, speed?: number, lift?: number): void;
  clear(): void;
  dispose(): void;
}
