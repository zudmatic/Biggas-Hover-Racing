import {MathUtils, Vector2, Vector3, type Object3D, type PerspectiveCamera} from 'three';
import type {Node, Renderer, UniformNode} from 'three/webgpu';
import {float, mix, screenUV, sin, smoothstep, uniform, vec2} from 'three/tsl';
import type {ExhaustMount} from '@/content/vehicles/vehicle-definition';
import {DEFAULT_NOZZLES} from '../exhaust/nozzle-mouth';

/** A boost pad's heat plume, in world units. */
export interface PadHeatField {
  x: number;
  y: number;
  z: number;
  /** Pad direction (unit, xz). */
  nx: number;
  nz: number;
  height: number;
  intensity: number;
}

/** Linear view depth of the scene at a sampling coordinate. */
export type DepthSampler = (uv: Node) => Node;

/** A screen-space plume: endpoints as (u, v, view depth), width and on/off. */
interface HeatSegment {
  readonly a: UniformNode<Vector3>;
  readonly b: UniformNode<Vector3>;
  readonly radius: UniformNode<number>;
  readonly visible: UniformNode<number>;
}

const SEGMENTS = 3;
/** Pads beyond this distance from the camera add no shimmer. */
const PAD_RANGE = 80;

const createSegments = (): HeatSegment[] =>
  Array.from({length: SEGMENTS}, () => ({
    a: uniform(new Vector3()),
    b: uniform(new Vector3()),
    radius: uniform(0.04),
    visible: uniform(0),
  }));

/**
 * Depth-aware screen distortion shared by the map composite.
 *
 * GPU cost per pixel: 3 depth samples (here, at the pixel, the displaced
 * pixel and the pad-displaced pixel) and 12 segment distance tests, plus the
 * shimmer's 5 sines. It runs over the whole screen every frame; the pass that
 * consumes `uv` adds its own scene samples.
 */
export class HeatField {
  /** The distorted sampling coordinate for the composite. */
  readonly uv: Node;
  private nozzles: readonly ExhaustMount[] = DEFAULT_NOZZLES;
  private readonly clock = uniform(0);
  private readonly strength = uniform(0);
  private readonly turbulence = uniform(2);
  private readonly aspect = uniform(1);
  private readonly pixel = uniform(new Vector2());
  private readonly segments = createSegments();
  private readonly padSegments = createSegments();
  private readonly world = new Vector3();
  private readonly view = new Vector3();
  private readonly size = new Vector2();
  /** Nearest active pads this frame, closest first. */
  private readonly nearby: (PadHeatField | null)[] = Array.from({length: SEGMENTS}, () => null);
  private readonly nearbyDistance = new Float64Array(SEGMENTS);

  constructor(
    private readonly renderer: Renderer,
    private readonly camera: PerspectiveCamera,
    depthAt: DepthSampler,
  ) {
    const {clock, strength, turbulence, aspect, pixel, segments, padSegments} = this;
    // `depth` is the scene depth at `sample`; masks at one coordinate share one depth fetch.
    const mask = (sample: Node, sources: readonly HeatSegment[], depth: Node): Node => {
      const p = sample.mul(vec2(aspect, 1));
      let coverage: Node = float(0);
      for (const segment of sources) {
        const a = segment.a.xy.mul(vec2(aspect, 1));
        const b = segment.b.xy.mul(vec2(aspect, 1));
        const ab = b.sub(a);
        const local = p.sub(a);
        const along = local.dot(ab).div(ab.dot(ab).max(0.00001)).clamp(0, 1);
        const distance = local.sub(ab.mul(along)).length();
        const radius = segment.radius.mul(mix(float(0.55), float(1.3), along));
        const envelope = float(1)
          .sub(smoothstep(radius.mul(0.25), radius, distance))
          .mul(smoothstep(float(0), float(0.1), along))
          .mul(float(1).sub(smoothstep(float(0.65), float(1), along)));
        // Foreground objects (including the ship) must not shimmer with the background.
        const plumeDepth = mix(segment.a.z, segment.b.z, along);
        const unoccluded = smoothstep(plumeDepth.add(0.04), plumeDepth.add(0.35), depth);
        coverage = coverage.max(envelope.mul(unoccluded).mul(segment.visible));
      }
      return coverage;
    };
    const screenDepth = depthAt(screenUV);
    const coverage = mask(screenUV, segments, screenDepth);
    const q = screenUV.mul(vec2(aspect, 1)).mul(65);
    const phase = clock.mul(3.5);
    const warp = sin(q.y.mul(0.7).sub(phase)).add(sin(q.x.mul(0.9).add(phase.mul(0.73))));
    const dx = sin(q.y.mul(1.7).sub(phase.mul(2)).add(warp)).add(sin(q.x.mul(2.9).add(phase)).mul(0.35));
    const dy = sin(q.x.mul(1.3).add(phase.mul(1.6)).add(warp)).mul(0.65);
    const offset = vec2(dx, dy).mul(pixel).mul(strength).mul(coverage).mul(turbulence.mul(0.06).add(0.6)).mul(3);
    // Check the displaced sample as well: otherwise background pixels pull the
    // ship silhouette into the plume at high strength. Fade across depth edges.
    const destination = screenUV.add(offset).clamp(0.001, 0.999);
    const padOffset = vec2(dx, dy)
      .mul(pixel)
      .mul(mask(screenUV, padSegments, screenDepth))
      .mul(1.35);
    const padDestination = screenUV.add(padOffset).clamp(0.001, 0.999);
    this.uv = screenUV
      .add(offset.mul(mask(destination, segments, depthAt(destination))))
      .add(padOffset.mul(mask(padDestination, padSegments, depthAt(padDestination)).min(1)))
      .clamp(0.001, 0.999);
  }

  setNozzles(value: readonly ExhaustMount[]): void {
    this.nozzles = value;
  }

  /** Projects each nozzle's plume (ship space) to the screen. */
  update(ship: Object3D, time: number, power: number, intensity: number, length: number, noise: number, width = 1): void {
    const {camera, segments, size} = this;
    camera.updateMatrixWorld();
    this.clock.value = time;
    this.strength.value = intensity * power;
    this.turbulence.value = noise;
    this.renderer.getDrawingBufferSize(size);
    this.pixel.value.set(1 / size.x, 1 / size.y);
    this.aspect.value = size.x / size.y;
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const nozzle = this.nozzles[i];
      if (!nozzle) {
        segment.visible.value = 0;
        continue;
      }
      const [x, y, z, radius] = nozzle;
      this.world.set(x, y, z).applyMatrix4(ship.matrixWorld);
      this.projectWorld(segment.a.value);
      this.world.set(x, y + 0.28, z - Math.max(0.1, length * power * 1.5)).applyMatrix4(ship.matrixWorld);
      this.projectWorld(segment.b.value);
      segment.visible.value = segment.a.value.z > camera.near && segment.b.value.z > camera.near ? 1 : 0;
      segment.radius.value =
        (0.65 * width * (radius / 0.24)) / (Math.max(1, segment.a.value.z) * Math.tan(MathUtils.degToRad(camera.fov * 0.5)) * 2);
    }
  }

  updatePadFields(fields: readonly PadHeatField[]): void {
    const {camera, padSegments, nearby} = this;
    // Bounded work: only nearby active plates, with foreground depth protection.
    this.pickNearby(fields);
    for (let i = 0; i < padSegments.length; i++) {
      const s = padSegments[i];
      const p = nearby[i];
      if (!p) {
        s.visible.value = 0;
        continue;
      }
      this.world.set(p.x - p.nx * 3, p.y + 0.16 + p.height * 0.35, p.z - p.nz * 3);
      this.projectWorld(s.a.value);
      this.world.set(p.x + p.nx * 3, p.y + 0.16 + p.height * 0.35, p.z + p.nz * 3);
      this.projectWorld(s.b.value);
      s.visible.value = s.a.value.z > camera.near && s.b.value.z > camera.near ? p.intensity : 0;
      s.radius.value =
        (1.5 + p.height * 0.25) / (Math.max(1, Math.min(s.a.value.z, s.b.value.z)) * Math.tan(MathUtils.degToRad(camera.fov * 0.5)) * 2);
    }
  }

  // The three closest active pads within range, closest first; ties keep input order.
  private pickNearby(fields: readonly PadHeatField[]): void {
    const {camera, nearby, nearbyDistance} = this;
    nearby.fill(null);
    nearbyDistance.fill(Infinity);
    for (const field of fields) {
      if (!(field.intensity > 0.001)) continue;
      const distance = Math.hypot(field.x - camera.position.x, field.z - camera.position.z);
      if (!(distance < PAD_RANGE)) continue;
      let slot = 0;
      while (slot < SEGMENTS && nearbyDistance[slot] <= distance) slot++;
      if (slot === SEGMENTS) continue;
      for (let i = SEGMENTS - 1; i > slot; i--) {
        nearby[i] = nearby[i - 1];
        nearbyDistance[i] = nearbyDistance[i - 1];
      }
      nearby[slot] = field;
      nearbyDistance[slot] = distance;
    }
  }

  // `world` (already set) to (u, v, view depth).
  private projectWorld(out: Vector3): void {
    const {world, view, camera} = this;
    view.copy(world).applyMatrix4(camera.matrixWorldInverse);
    world.project(camera);
    out.set(world.x * 0.5 + 0.5, 0.5 - world.y * 0.5, -view.z);
  }
}
