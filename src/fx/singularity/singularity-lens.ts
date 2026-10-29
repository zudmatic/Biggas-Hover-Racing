import {
  DataTexture,
  LinearFilter,
  MathUtils,
  RepeatWrapping,
  Vector2,
  Vector3,
  Vector4,
  type Object3D,
  type PerspectiveCamera,
} from 'three';
import type {Node} from 'three/webgpu';
import {
  Fn,
  If,
  atan,
  clamp,
  distance,
  dot,
  float,
  length,
  log,
  max,
  min,
  mix,
  pow,
  select,
  sin,
  smoothstep,
  texture,
  uniform,
  vec2,
  vec4,
} from 'three/tsl';
import {tiled, type EnergySignals, type EnergyTextures} from '../lomi/lomi-energy';
import {SINGULARITY} from '../lomi/lomi-constants';

const TAU = 6.2831853;
const CORES = 2;

// Linear filtering keeps the sampler in the compiled pass until the real textures arrive.
function placeholder(): DataTexture {
  const map = new DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
  map.minFilter = map.magFilter = LinearFilter;
  map.wrapS = map.wrapT = RepeatWrapping;
  map.needsUpdate = true;
  return map;
}

// Shared by every cached comic pass; zero until a singularity engine projects into it.
export class LensUniforms {
  readonly active = uniform(0);
  readonly time = uniform(0);
  /** width, turbulence, hotspots, intensity */
  readonly glow = uniform(new Vector4());
  /** halo, dimming, streaks, spiral */
  readonly infall = uniform(new Vector4());
  readonly hot = uniform(SINGULARITY.glow.colors.hot.clone());
  /** Wake segment on screen: head xy, tail xy. */
  readonly waves = uniform(new Vector4());
  /** depth, width, amplitude, frequency */
  readonly wavesAux = uniform(new Vector4());
  readonly wavesSpeed = uniform(0);
  /** softness, absorption, wake absorption */
  readonly horizon = uniform(new Vector3());
  /** softness, edge */
  readonly depth = uniform(new Vector2());
  readonly cap = uniform(0);
  /** Per hole: screen xy, Einstein radius², horizon radius. */
  readonly core = Array.from({length: CORES}, () => uniform(new Vector4()));
  /** Per hole: depth, reach, spin, depth extent. */
  readonly coreAux = Array.from({length: CORES}, () => uniform(new Vector4()));
  readonly noise = texture(placeholder());
  readonly flow = texture(placeholder());

  setTextures(textures: EnergyTextures): void {
    this.noise.value = textures.noise;
    this.flow.value = textures.flow;
  }
}

export interface LensWarpInput {
  /** The pass's sampling coordinate (top-left origin). */
  uv: Node;
  aspect: Node;
  /** Linear view depth of the scene at a sampling coordinate. */
  viewDepth: (uv: Node) => Node;
  far: Node;
}

export interface LensWarp {
  uv: Node;
  dark: Node;
  emission: Node;
}

// uv is the comic pass's sampling coordinate (top-left origin); q is y-up.
export function createLensWarp(lens: LensUniforms, {uv, aspect, viewDepth, far}: LensWarpInput): LensWarp {
  const reachWindow = (r: Node, reach: Node): Node => float(1).sub(smoothstep(reach.mul(0.35), reach.add(1e-6), r));
  const nearestOnSegment = (p: Node, segment: Node): Node => {
    const span = segment.zw.sub(segment.xy);
    const t = clamp(dot(p.sub(segment.xy), span).div(max(dot(span, span), 1e-8)), 0, 1);
    return segment.xy.add(span.mul(t));
  };
  const rim = Fn(([rho, angle, seed]: [Node, Node, Node]) => {
    const warp = tiled(lens.flow, vec2(angle.mul(2).add(seed), rho.mul(0.55).add(lens.time.mul(0.22))), 2)
      .rg.sub(0.5)
      .toVar();
    const shape = tiled(lens.noise, vec2(angle.mul(3).add(seed), lens.time.mul(0.04)), 3)
      .r.sub(0.5)
      .toVar();
    const fine = tiled(
      lens.noise,
      vec2(angle.mul(4).add(rho.mul(lens.infall.w).mul(0.25)), rho.mul(1.1).add(lens.time.mul(0.55))).add(warp.mul(0.4)),
      4,
    ).g.toVar();
    const r = rho.add(shape.mul(2).add(warp.x).mul(lens.glow.y).mul(0.3));
    const band = smoothstep(0.8, 1, r)
      .mul(float(1).sub(smoothstep(1, float(1).add(lens.glow.x.mul(fine.mul(0.9).add(0.35))), r)))
      .toVar();
    const hot = pow(clamp(fine.mul(shape.add(0.5)).mul(1.6), 0, 1), 4)
      .mul(band)
      .mul(lens.glow.z);
    return band.mul(pow(fine, 1.8).mul(1.5).add(0.25)).add(hot);
  });
  const infall = Fn(([rho, angle, seed]: [Node, Node, Node]) => {
    const halo = float(1)
      .sub(smoothstep(1, lens.infall.x, rho))
      .toVar();
    const streak = tiled(
      lens.noise,
      vec2(angle.mul(5).add(rho.mul(lens.infall.w)).add(seed), log(max(rho, 1e-3)).mul(1.5).add(lens.time.mul(0.8))),
      5,
    ).r;
    return halo.mul(halo).mul(lens.infall.y.add(lens.infall.z.mul(smoothstep(0.45, 0.8, streak))));
  });
  const ripple = Fn(([q, depth, softness]: [Node, Node, Node]) => {
    const span = lens.waves.zw.sub(lens.waves.xy);
    const L = max(length(span), 1e-5);
    const e = span.div(L);
    const n = vec2(e.y.negate(), e.x);
    const d = q.sub(lens.waves.xy);
    const s = dot(d, e).div(L).toVar();
    const v = dot(d, n).div(max(lens.wavesAux.y, 1e-6)).toVar();
    const envelope = smoothstep(-0.05, 0.15, s)
      .mul(float(1).sub(smoothstep(0.6, 1, s)))
      .mul(float(1).sub(smoothstep(0.5, 1, v.abs())));
    const phase = s.mul(lens.wavesAux.w).mul(TAU).sub(lens.time.mul(lens.wavesSpeed)).toVar();
    const wave = sin(phase.add(v.mul(1.7))).add(sin(phase.mul(2.3).sub(v.mul(2.9)).add(1.3)).mul(0.5));
    const behind = smoothstep(0, softness, depth.sub(lens.wavesAux.x));
    return n.mul(wave).mul(lens.wavesAux.z).mul(s.add(0.3)).mul(envelope).mul(behind);
  });
  const warped = Fn(() => {
    const q = vec2(uv.x.sub(0.5), float(0.5).sub(uv.y)).mul(vec2(aspect, 1)).toVar();
    const source = uv.toVar();
    const dark = float(0).toVar();
    const glow = float(0).toVar();
    let covered: Node = lens.wavesAux.z.greaterThan(0).and(distance(q, nearestOnSegment(q, lens.waves)).lessThan(lens.wavesAux.y));
    for (let i = 0; i < CORES; i++) covered = covered.or(distance(q, lens.core[i].xy).lessThan(lens.coreAux[i].y));
    If(lens.active.greaterThan(0).and(covered), () => {
      const depth = viewDepth(uv).toVar();
      const softness = lens.depth.x;
      const alpha = vec2(0).toVar();
      const nearest = far.toVar();
      for (let i = 0; i < CORES; i++) {
        const core = lens.core[i];
        const aux = lens.coreAux[i];
        const delta = q.sub(core.xy).toVar();
        const r = length(delta).toVar();
        const behind = smoothstep(aux.w.negate(), softness.sub(aux.w), depth.sub(aux.x)).toVar();
        const weight = reachWindow(r, aux.y).mul(behind).toVar();
        alpha.addAssign(
          core.z
            .mul(delta.add(aux.z.mul(vec2(delta.y.negate(), delta.x))))
            .div(r.mul(r).add(1e-7))
            .mul(weight),
        );
        const h = core.w;
        dark.assign(
          max(
            dark,
            float(1)
              .sub(smoothstep(h.mul(float(1).sub(lens.horizon.x.mul(0.5))), h.mul(lens.horizon.x.add(1)).add(1e-6), r))
              .mul(behind)
              .mul(lens.horizon.y),
          ),
        );
        const rho = r.div(max(h, 1e-6)).toVar();
        const angle = atan(delta.y, delta.x.add(1e-9)).div(TAU).add(0.5).toVar();
        const seed = float(i * 0.37);
        dark.assign(max(dark, min(infall(rho, angle, seed), 1).mul(behind)));
        glow.addAssign(rim(rho, angle, seed).mul(behind));
        nearest.assign(select(weight.greaterThan(0), min(nearest, aux.x.sub(aux.w)), nearest));
      }
      If(lens.wavesAux.z.greaterThan(0), () => {
        const wave = ripple(q, depth, softness).toVar();
        alpha.addAssign(wave);
        nearest.assign(select(dot(wave, wave).greaterThan(0), min(nearest, lens.wavesAux.x), nearest));
      });
      const magnitude = length(alpha).toVar();
      alpha.assign(select(magnitude.greaterThan(lens.cap), alpha.mul(lens.cap.div(magnitude)), alpha));
      source.assign(uv.sub(vec2(alpha.x.div(aspect), alpha.y.negate())));
      const overshoot = max(source.negate(), source.sub(1)).toVar();
      source.assign(mix(uv, source, float(1).sub(smoothstep(0, lens.depth.y, max(overshoot.x, overshoot.y)))));
      source.assign(mix(uv, source, smoothstep(0, softness, viewDepth(source).sub(nearest))));
    });
    return vec4(source, dark, glow);
  })().toVar();
  const emission = warped.w.mul(lens.glow.w);
  return {uv: warped.xy, dark: warped.z, emission: lens.hot.mul(smoothstep(0.5, 2, emission)).mul(emission)};
}

interface ProjectedPoint {
  readonly q: Vector2;
  depth: number;
  scale: number;
}

const projected = (): ProjectedPoint => ({q: new Vector2(), depth: 0, scale: 0});
const view = new Vector3();

// Screen position (y-up, aspect-wide), view depth and pixels-per-unit of a world point; false behind the camera.
function project(point: Vector3, camera: PerspectiveCamera, aspect: number, out: ProjectedPoint): boolean {
  view.copy(point).applyMatrix4(camera.matrixWorldInverse);
  out.depth = -view.z;
  if (out.depth < camera.near) return false;
  view.applyMatrix4(camera.projectionMatrix);
  out.q.set(view.x * 0.5 * aspect, view.y * 0.5);
  out.scale = (camera.projectionMatrix.elements[5] * 0.5) / out.depth;
  return true;
}

const onScreen = ({q}: ProjectedPoint, aspect: number, margin: number): boolean =>
  Math.abs(q.x) < aspect * 0.5 + margin && Math.abs(q.y) < 0.5 + margin;

// Radii and offsets are authoring units times the anchor's world scale, so the
// holes follow the ship's game size.
export class SingularityLenses {
  private readonly hole = projected();
  private readonly head = projected();
  private readonly end = projected();
  private readonly axis = new Vector3();
  private readonly side = new Vector3();
  private readonly centre = new Vector3();
  private readonly middle = new Vector3();
  private readonly tail = new Vector3();
  private readonly bend = new Vector3();

  constructor(
    private readonly anchors: readonly Object3D[],
    private readonly signals: EnergySignals,
    private readonly lens: LensUniforms,
  ) {}

  /** Writes each hole and the wake into the lens uniforms; true when any of them is on screen. */
  project(camera: PerspectiveCamera, aspect: number): boolean {
    const {offset, surge, horizon, instability} = SINGULARITY;
    const {anchors, signals, axis, side, centre, middle} = this;
    const time = signals.time * instability.speed;
    const swell = 1 + surge * signals.surge;
    let visible = false;
    let unit = 1;
    middle.set(0, 0, 0);
    for (let index = 0; index < anchors.length; index++) {
      const anchor = anchors[index];
      const wobble = 1 + instability.amount * Math.sin(time + index * 2.3) * Math.sin(time * 0.53 + index);
      unit = axis.setFromMatrixColumn(anchor.matrixWorld, 1).length();
      axis.normalize();
      side.setFromMatrixColumn(anchor.matrixWorld, 0).normalize();
      const radius = MathUtils.lerp(horizon.radius.idle, horizon.radius.cruise, signals.level) * swell * wobble * unit;
      centre.setFromMatrixPosition(anchor.matrixWorld).addScaledVector(axis, offset * unit);
      middle.addScaledVector(centre, 1 / anchors.length);
      visible = this.projectCore(index, radius, camera, aspect) || visible;
    }
    this.bend.copy(signals.bend).multiplyScalar(unit);
    return this.projectWaves(camera, aspect, unit) || visible;
  }

  /** Copies the tuning and this frame's energy into the lens uniforms. */
  sync(visible: boolean): void {
    const {glow, infall, horizon, wake, depth, lensing, turbulence} = SINGULARITY;
    const {lens, signals} = this;
    const radial = turbulence.mode === 'waves' ? 0 : 1;
    lens.active.value = Number(visible);
    lens.time.value = signals.time * glow.speed;
    lens.glow.value.set(
      glow.width,
      glow.turbulence * radial,
      glow.hotspots,
      MathUtils.lerp(glow.intensity.idle, glow.intensity.cruise, signals.level) * (1 + signals.surge),
    );
    lens.infall.value.set(infall.halo, infall.dimming, infall.streaks * radial, infall.spiral);
    lens.wavesSpeed.value = turbulence.waves.speed;
    lens.horizon.value.set(horizon.softness, horizon.absorption, wake.absorption);
    lens.depth.value.set(depth.softness, depth.edge);
    lens.cap.value = lensing.cap;
  }

  private projectCore(index: number, radius: number, camera: PerspectiveCamera, aspect: number): boolean {
    const {strength, reach, spin} = SINGULARITY.lensing;
    const {lens, hole} = this;
    const visible = project(this.centre, camera, aspect, hole);
    const horizon = radius * hole.scale;
    const einstein = horizon * strength;
    const extent = einstein * reach;
    if (!visible || !onScreen(hole, aspect, extent)) {
      lens.core[index].value.setScalar(0);
      lens.coreAux[index].value.setScalar(0);
      return false;
    }
    lens.core[index].value.set(hole.q.x, hole.q.y, einstein * einstein, horizon);
    lens.coreAux[index].value.set(hole.depth, extent, index % 2 ? spin : -spin, radius * strength * reach);
    return true;
  }

  private projectWaves(camera: PerspectiveCamera, aspect: number, unit: number): boolean {
    const {mode, waves: shape} = SINGULARITY.turbulence;
    const {lens, head, end, tail, signals} = this;
    tail
      .copy(this.middle)
      .addScaledVector(this.axis, shape.length * unit)
      .add(this.bend);
    const ahead = project(this.middle, camera, aspect, head) && project(tail, camera, aspect, end);
    const scale = (head.scale + end.scale) * 0.5 * unit;
    const width = shape.width * scale;
    if (mode === 'radial' || shape.amplitude <= 0 || !ahead || !(onScreen(head, aspect, width) || onScreen(end, aspect, width))) {
      lens.waves.value.setScalar(0);
      lens.wavesAux.value.setScalar(0);
      return false;
    }
    const energy = (0.3 + 0.7 * signals.level) * (1 + SINGULARITY.surge * signals.surge);
    lens.waves.value.set(head.q.x, head.q.y, end.q.x, end.q.y);
    lens.wavesAux.value.set(Math.min(head.depth, end.depth) - shape.width * unit, width, shape.amplitude * scale * energy, shape.frequency);
    return true;
  }
}
