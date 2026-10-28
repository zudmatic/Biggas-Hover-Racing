import {
  AddEquation,
  Box3,
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  DoubleSide,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  OneFactor,
  PointLight,
  Quaternion,
  Vector2,
  Vector3,
  Vector4,
  ZeroFactor,
  type InterleavedBufferAttribute,
  type Matrix4,
  type Object3D,
} from 'three';
import {MeshBasicNodeMaterial, type Node} from 'three/webgpu';
import {
  Fn,
  If,
  abs,
  atan,
  attribute,
  cameraPosition,
  cameraProjectionMatrix,
  cameraViewMatrix,
  clamp,
  cos,
  cross,
  dot,
  exp,
  floor,
  fract,
  fwidth,
  length,
  max,
  min,
  mix,
  modelScale,
  modelWorldMatrix,
  modelWorldMatrixInverse,
  normalGeometry,
  normalize,
  float,
  pow,
  positionLocal,
  select,
  sin,
  smoothstep,
  sqrt,
  texture,
  uniform,
  varying,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type {Disposable} from '@/core/disposable';
import {BOOST_RATIO, PLASMA, PLASMA_QUALITY, type DriveRange, type PlasmaQuality} from './lomi-constants';
import {sampleTexture, tiled, type EnergyTextures, type PlasmaSignals} from './lomi-energy';

const TAU = 6.2831853;

type PositionAttribute = BufferAttribute | InterleavedBufferAttribute;

/** A shard's flow frame: axis, orbit basis and extent along the flow. */
export interface ShardFrame {
  flow: Vector3;
  up: Vector3;
  side: Vector3;
  center: Vector3;
  fore: number;
  span: number;
}

/** A hard edge of a crystal, where plasma tongues may anchor. */
export interface CreaseEdge {
  from: Vector3;
  to: Vector3;
  normal: Vector3;
}

export interface BakedShard {
  mesh: Mesh;
  geometry: BufferGeometry;
  frame: ShardFrame;
  edges: CreaseEdge[];
}

export interface TongueAnchor {
  origin: Vector3;
  normal: Vector3;
  along: number;
  angle: number;
  score: number;
  seed: number;
  scale: number;
}

const isMesh = (object: Object3D): object is Mesh => (object as Mesh).isMesh === true;

// Shard bake: per-vertex crease barycentrics, distance along the flow and the
// orbit angle around the shard's axis.
const key = (position: PositionAttribute, index: number): string =>
  [position.getX(index), position.getY(index), position.getZ(index)].map((value) => Math.round(value * 1e4)).join(',');

function frameOf(position: PositionAttribute, flow: Vector3): ShardFrame {
  const point = new Vector3();
  const box = new Box3();
  let fore = Infinity;
  let aft = -Infinity;
  for (let index = 0; index < position.count; index++) {
    box.expandByPoint(point.fromBufferAttribute(position, index));
    const projection = point.dot(flow);
    fore = Math.min(fore, projection);
    aft = Math.max(aft, projection);
  }
  const up = new Vector3(0, 1, 0).addScaledVector(flow, -flow.y).normalize();
  return {
    flow,
    up,
    side: new Vector3().crossVectors(flow, up),
    center: box.getCenter(new Vector3()),
    fore,
    span: Math.max(aft - fore, 1e-4),
  };
}

const alongOf = (frame: ShardFrame, point: Vector3): number => point.dot(frame.flow) - frame.fore;

function angleOf(frame: ShardFrame, point: Vector3): number {
  const offset = point.clone().sub(frame.center);
  return Math.atan2(offset.dot(frame.up), offset.dot(frame.side)) / TAU + 0.5;
}

function creases(position: PositionAttribute, normal: PositionAttribute): {barycentric: BufferAttribute; edges: CreaseEdge[]} {
  const faces = position.count / 3;
  const normals = Array.from({length: faces}, (_, face) => new Vector3().fromBufferAttribute(normal, face * 3).normalize());
  const edgeKey = (face: number, corner: number): string => {
    const from = key(position, face * 3 + ((corner + 1) % 3));
    const to = key(position, face * 3 + ((corner + 2) % 3));
    return from < to ? `${from}|${to}` : `${to}|${from}`;
  };
  // Faces sharing each edge.
  const shared = new Map<string, number[]>();
  for (let face = 0; face < faces; face++) {
    for (let corner = 0; corner < 3; corner++) {
      const edge = edgeKey(face, corner);
      const list = shared.get(edge);
      if (list) list.push(face);
      else shared.set(edge, [face]);
    }
  }
  const neighboursOf = (face: number, corner: number): number[] => shared.get(edgeKey(face, corner)) ?? [];
  const isCrease = (face: number, corner: number): boolean => {
    const neighbours = neighboursOf(face, corner);
    return neighbours.length < 2 || neighbours.some((other) => normals[other].dot(normals[face]) < PLASMA.edge.crease);
  };
  const barycentric = new Float32Array(position.count * 3);
  const edges = new Map<string, CreaseEdge>();
  for (let face = 0; face < faces; face++) {
    for (let corner = 0; corner < 3; corner++) {
      const crease = isCrease(face, corner);
      for (let vertex = 0; vertex < 3; vertex++)
        barycentric[(face * 3 + vertex) * 3 + corner] = Number(corner === vertex) + Number(!crease);
      if (!crease || edges.has(edgeKey(face, corner))) continue;
      edges.set(edgeKey(face, corner), {
        from: new Vector3().fromBufferAttribute(position, face * 3 + ((corner + 1) % 3)),
        to: new Vector3().fromBufferAttribute(position, face * 3 + ((corner + 2) % 3)),
        normal: neighboursOf(face, corner)
          .reduce((sum, other) => sum.add(normals[other]), new Vector3())
          .normalize(),
      });
    }
  }
  return {barycentric: new BufferAttribute(barycentric, 3), edges: [...edges.values()]};
}

export function bakeShard(mesh: Mesh, flow: Vector3): BakedShard {
  const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  const position = geometry.getAttribute('position');
  const frame = frameOf(position, flow);
  const {barycentric, edges} = creases(position, geometry.getAttribute('normal'));
  const point = new Vector3();
  const along = new Float32Array(position.count);
  const orbit = new Float32Array(position.count * 2);
  for (let index = 0; index < position.count; index++) {
    point.fromBufferAttribute(position, index);
    along[index] = alongOf(frame, point);
    point.sub(frame.center);
    orbit[index * 2] = point.dot(frame.side);
    orbit[index * 2 + 1] = point.dot(frame.up);
  }
  geometry.setAttribute('aEdge', barycentric);
  geometry.setAttribute('aAlong', new BufferAttribute(along, 1));
  geometry.setAttribute('aOrbit', new BufferAttribute(orbit, 2));
  return {mesh, geometry, frame, edges};
}

export function meshToRoot(root: Object3D, mesh: Object3D): Matrix4 {
  root.updateWorldMatrix(true, false);
  mesh.updateWorldMatrix(true, false);
  return root.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
}

const STOPS = [0.3, 0.55, 0.8];

function candidates(root: Object3D, {mesh, frame, edges}: BakedShard): Omit<TongueAnchor, 'seed' | 'scale'>[] {
  const toRoot = meshToRoot(root, mesh);
  return edges.flatMap(({from, to, normal}) =>
    STOPS.map((stop) => {
      const point = from.clone().lerp(to, stop);
      const outward = normal.clone().transformDirection(toRoot);
      const rear = alongOf(frame, point) / frame.span;
      const exposure = 0.3 + Math.max(0, outward.y) + 0.5 * Math.abs(outward.x);
      return {
        origin: point.clone().applyMatrix4(toRoot),
        normal: outward,
        along: alongOf(frame, point),
        angle: angleOf(frame, point),
        score: from.distanceTo(to) * (0.3 + rear) * exposure,
      };
    }),
  );
}

export function pickTongueAnchors(root: Object3D, shards: readonly BakedShard[], count: number): TongueAnchor[] {
  const ranked = shards.flatMap((shard) => candidates(root, shard)).sort((a, b) => b.score - a.score);
  const picked: TongueAnchor[] = [];
  for (const candidate of ranked) {
    if (picked.length === count) break;
    if (picked.some(({origin}) => origin.distanceTo(candidate.origin) < PLASMA.tongues.spacing)) continue;
    const seed = (picked.length * 0.618034) % 1;
    picked.push({...candidate, seed, scale: 0.7 + 0.3 * ((seed * 7.31) % 1)});
  }
  return picked;
}

export function createTongueGeometry(anchors: readonly TongueAnchor[], segments: number): BufferGeometry {
  const rows = segments + 1;
  const count = anchors.length * rows * 2;
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const ribbon = new Float32Array(count * 2);
  const anchor = new Float32Array(count * 4);
  const index: number[] = [];
  anchors.forEach(({origin, normal: outward, along, angle, seed, scale}, tongue) => {
    for (let row = 0; row < rows; row++) {
      for (let side = 0; side < 2; side++) {
        const vertex = (tongue * rows + row) * 2 + side;
        origin.toArray(position, vertex * 3);
        outward.toArray(normal, vertex * 3);
        ribbon.set([row / segments, side * 2 - 1], vertex * 2);
        anchor.set([along, angle, seed, scale], vertex * 4);
      }
      if (row === segments) continue;
      const base = (tongue * rows + row) * 2;
      index.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  });
  const geometry = ribbonGeometry(position);
  geometry.setAttribute('aNormal', new BufferAttribute(normal, 3));
  geometry.setAttribute('aRibbon', new BufferAttribute(ribbon, 2));
  geometry.setAttribute('aAnchor', new BufferAttribute(anchor, 4));
  geometry.setIndex(index);
  return geometry;
}

// The node material reads a normal attribute even when the shader ignores it.
function ribbonGeometry(position: Float32Array): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(position.length), 3));
  return geometry;
}

export function createCoilGeometry(root: Object3D, exhausts: readonly Object3D[], strands: number, segments: number): BufferGeometry {
  const rows = segments + 1;
  const count = exhausts.length * strands * rows * 2;
  const position = new Float32Array(count * 3);
  const axis = new Float32Array(count * 3);
  const side = new Float32Array(count * 3);
  const coil = new Float32Array(count * 4);
  const index: number[] = [];
  const origin = new Vector3();
  const aft = new Vector3();
  const across = new Vector3();
  exhausts.forEach((exhaust, engine) => {
    const toRoot = meshToRoot(root, exhaust);
    origin.setFromMatrixPosition(toRoot);
    aft.setFromMatrixColumn(toRoot, 1).normalize();
    across.setFromMatrixColumn(toRoot, 0).normalize();
    const spin = engine % 2 ? 1 : -1;
    for (let strand = 0; strand < strands; strand++) {
      const ribbon = engine * strands + strand;
      for (let row = 0; row < rows; row++) {
        for (let edge = 0; edge < 2; edge++) {
          const vertex = (ribbon * rows + row) * 2 + edge;
          origin.toArray(position, vertex * 3);
          aft.toArray(axis, vertex * 3);
          across.toArray(side, vertex * 3);
          coil.set([row / segments, edge * 2 - 1, strand / strands + engine * 0.17, spin], vertex * 4);
        }
        if (row === segments) continue;
        const base = (ribbon * rows + row) * 2;
        index.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }
  });
  const geometry = ribbonGeometry(position);
  geometry.setAttribute('aAxis', new BufferAttribute(axis, 3));
  geometry.setAttribute('aSide', new BufferAttribute(side, 3));
  geometry.setAttribute('aCoil', new BufferAttribute(coil, 4));
  geometry.setIndex(index);
  return geometry;
}

export function createPlasmaUniforms(textures: EnergyTextures) {
  const {colors, flow, filaments, edge, hotspots, tongues, burst, coils} = PLASMA;
  return {
    noise: texture(textures.noise),
    flowMap: texture(textures.flow),
    time: uniform(0),
    phase: uniform(0),
    flow: uniform(new Vector2(flow.cycles, flow.scale)),
    turbulence: uniform(0),
    density: uniform(0),
    emission: uniform(0),
    bloom: uniform(PLASMA.bloom),
    shard: uniform(colors.shard),
    base: uniform(colors.base),
    hot: uniform(colors.hot),
    spectrum: colors.burst.map((color) => uniform(color)),
    burst: uniform(0),
    burstShape: uniform(new Vector4(burst.flicker, burst.rate, burst.drift, burst.heat)),
    filament: uniform(new Vector2(filaments.width, filaments.coverage)),
    edge: uniform(new Vector3(edge.emission, edge.width, edge.reach)),
    hotspots: uniform(new Vector2(hotspots.gain, hotspots.sharpness)),
    aft: uniform(flow.direction.clone().normalize()),
    bend: uniform(new Vector3()),
    tongue: uniform(new Vector4(0, tongues.width, tongues.lift, tongues.bend)),
    sweep: uniform(0),
    coil: uniform(new Vector4(coils.start, coils.length, coils.radius, coils.inner)),
    coilTwist: uniform(new Vector4(coils.turns, coils.spin, coils.width, coils.wobble)),
  };
}
export type PlasmaUniforms = ReturnType<typeof createPlasmaUniforms>;

interface PlasmaField {
  flowUv(along: Node, angle: Node): Node;
  warpUv(uv: Node): Node;
  plasma(energy: Node, tint: Node): Node;
}

function createField(u: PlasmaUniforms): PlasmaField {
  const flowUv = (along: Node, angle: Node): Node => vec2(angle.mul(u.flow.x), along.mul(u.flow.y));
  const warpUv = (uv: Node): Node => uv.mul(vec2(1, 0.6)).add(vec2(0, u.time.mul(0.03).sub(u.phase.mul(0.4))));
  const spectrum = Fn(([t0]: [Node]) => {
    const t = fract(t0).mul(3).toVar();
    const color = vec3(0).toVar();
    If(t.lessThan(1), () => {
      color.assign(mix(u.spectrum[0], u.spectrum[1], t));
    })
      .ElseIf(t.lessThan(2), () => {
        color.assign(mix(u.spectrum[1], u.spectrum[2], t.sub(1)));
      })
      .Else(() => {
        color.assign(mix(u.spectrum[2], u.spectrum[0], t.sub(2)));
      });
    return color;
  });
  const plasmaFn = Fn(([energy0, tint]: [Node, Node]) => {
    const shift = tint.add(u.phase.mul(u.burstShape.z)).toVar();
    const energy = energy0.mul(float(1).add(u.burst.mul(u.burstShape.x).mul(sin(u.time.mul(u.burstShape.y).add(shift.mul(TAU)))))).toVar();
    const base = mix(u.base, spectrum(shift), u.burst);
    const hot = mix(u.hot, spectrum(shift.add(0.33)).add(0.5), u.burst.mul(u.burstShape.w));
    return base.mul(energy).add(hot.mul(energy).mul(energy).mul(u.bloom));
  });
  return {flowUv, warpUv, plasma: (energy, tint) => plasmaFn(energy, tint)};
}

const hash21 = Fn(([p]: [Node]) => {
  const p3 = fract(vec3(p.x, p.y, p.x).mul(0.1031)).toVar();
  p3.addAssign(dot(p3, p3.yzx.add(33.33)));
  return fract(p3.x.add(p3.y).mul(p3.z));
});

// Additive colour with the destination alpha kept: the comic post divides by
// scene alpha, and plain AdditiveBlending also sums alpha in the HDR target.
const ribbonMaterial = (): MeshBasicNodeMaterial =>
  new MeshBasicNodeMaterial({
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: OneFactor,
    blendDst: OneFactor,
    blendSrcAlpha: ZeroFactor,
    blendDstAlpha: OneFactor,
  });

export function createShardMaterial(u: PlasmaUniforms, detail: boolean): MeshBasicNodeMaterial {
  const {flowUv, warpUv, plasma} = createField(u);
  const material = new MeshBasicNodeMaterial({side: DoubleSide});
  const aEdge = attribute('aEdge', 'vec3');
  const aAlong = attribute('aAlong', 'float');
  const aOrbit = attribute('aOrbit', 'vec2');
  const camObj = varying(modelWorldMatrixInverse.mul(vec4(cameraPosition, 1)).xyz);
  material.colorNode = Fn(() => {
    const vObj = positionLocal;
    const n0 = normalize(normalGeometry).toVar();
    const v = normalize(vObj.sub(camObj)).toVar();
    const n = select(dot(v, n0).greaterThan(0), n0.negate(), n0).toVar();
    const facing = clamp(dot(v.negate(), n), 0, 1).toVar();
    const facet = hash21(floor(n.xy.mul(37)).add(floor(n.z.mul(19))));
    const body = u.shard
      .mul(facet.mul(0.8).add(0.6))
      .mul(facing.mul(0.6).add(0.4))
      .add(u.base.mul(pow(float(1).sub(facing), 5)).mul(0.05));
    const period = u.flow.x;
    const uv = flowUv(aAlong, atan(aOrbit.y, aOrbit.x).div(TAU).add(0.5)).toVar();
    const warp = tiled(u.flowMap, warpUv(uv), period).rg.sub(0.5).toVar();
    const q = uv.add(warp.mul(u.turbulence)).sub(vec2(0, u.phase)).toVar();
    const stream = tiled(u.noise, q.mul(vec2(1, 0.5)), period).r.toVar();
    const evolve = tiled(
      u.noise,
      uv
        .mul(vec2(2, 0.35))
        .add(vec2(u.time.mul(0.04), u.phase.mul(-0.7)))
        .add(warp.mul(0.3)),
      period.mul(2),
    ).g.toVar();
    const region = tiled(u.noise, uv.mul(vec2(1, 0.3)).add(vec2(0.41, u.phase.mul(-0.55).add(0.17))), period).r.toVar();
    const pulse = tiled(u.noise, uv.mul(vec2(1, 0.2)).add(vec2(0.73, u.phase.mul(-0.8).add(0.29))), period).r.toVar();
    const meter = max(length(fwidth(vObj)).mul(0.7), 1e-5).toVar();
    const contour = stream.mul(u.density).add(evolve.mul(0.9)).toVar();
    const distance = abs(fract(contour).sub(0.5))
      .mul(meter)
      .div(max(fwidth(contour), 1e-5));
    const thickness = u.filament.x.mul(mix(0.2, 1.6, evolve)).toVar();
    const filament = float(1)
      .sub(smoothstep(thickness, thickness.add(meter), distance))
      .mul(clamp(thickness.mul(2).div(meter), 0, 1))
      .toVar();
    if (detail) filament.mulAssign(tiled(u.noise, q.mul(3), period.mul(3)).g.add(0.5));
    const coverage = smoothstep(float(1).sub(u.filament.y), float(1.2).sub(u.filament.y), region);
    const pixels = aEdge.div(max(fwidth(aEdge), vec3(1e-5))).toVar();
    const edgePixels = min(min(pixels.x, pixels.y), pixels.z).toVar();
    const near = exp(edgePixels.negate().mul(meter).div(u.edge.z));
    const line = float(1).sub(smoothstep(0, u.edge.y, edgePixels));
    const edge = line.mul(smoothstep(0.45, 0.7, pulse)).mul(u.edge.x);
    const knot = float(1).add(pow(clamp(stream.mul(region).mul(1.9), 0, 1), u.hotspots.y).mul(u.hotspots.x));
    const energy = filament
      .mul(coverage)
      .mul(mix(0.15, 1, near))
      .add(edge)
      .mul(knot)
      .mul(u.emission);
    // The comic post's ACES bleaches channels above 1 to white; capping the brightest keeps the hue.
    const color = body.add(plasma(energy, stream.add(evolve.mul(0.5)).add(aAlong.mul(0.3)))).toVar();
    return color.div(max(float(1), max(color.r, max(color.g, color.b))));
  })();
  return material;
}

// Ribbon width is in authoring units, so it follows modelScale.
function ribbonClip(point: Node, ahead: Node, width: Node): Node {
  const across = normalize(cross(ahead.sub(point.xyz), cameraPosition.sub(point.xyz)));
  return cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(point.xyz.add(across.mul(width).mul(modelScale.x)), 1));
}

export function createTongueMaterial(u: PlasmaUniforms, detail: boolean): MeshBasicNodeMaterial {
  const {flowUv, warpUv, plasma} = createField(u);
  const material = ribbonMaterial();
  const aNormal = attribute('aNormal', 'vec3');
  const aRibbon = attribute('aRibbon', 'vec2');
  const aAnchor = attribute('aAnchor', 'vec4');
  const s = aRibbon.x;
  const reach = u.tongue.x.mul(aAnchor.w);
  const tongue = (at: Node): Node => {
    const side = normalize(cross(u.aft, aNormal));
    const sway = sampleTexture(u.flowMap, warpUv(flowUv(aAnchor.x.add(at.mul(reach).mul(0.35)), aAnchor.y)).add(aAnchor.z))
      .level(float(0))
      .rg.sub(0.5)
      .mul(u.turbulence)
      .mul(1.2);
    const rise = u.tongue.z.mul(float(1).sub(float(1).sub(at).mul(float(1).sub(at)))).mul(float(1).sub(u.sweep.mul(0.6)));
    const trail = mix(at.mul(at).mul(0.35), at, u.sweep);
    return positionLocal
      .add(
        aNormal
          .mul(rise)
          .add(u.aft.mul(trail))
          .add(side.mul(sway.x).add(aNormal.mul(sway.y)).mul(at).mul(at))
          .mul(reach),
      )
      .add(u.bend.mul(u.tongue.w).mul(at).mul(at));
  };
  material.vertexNode = Fn(() => {
    const point = modelWorldMatrix.mul(vec4(tongue(s), 1)).toVar();
    const ahead = modelWorldMatrix.mul(vec4(tongue(s.add(0.03)), 1)).xyz;
    const width = u.tongue.y
      .mul(aAnchor.w)
      .mul(mix(0.3, 1, smoothstep(0, 0.3, s)))
      .mul(pow(float(1).sub(s), 0.7))
      .mul(aRibbon.y);
    return ribbonClip(point, ahead, width);
  })();
  const vUv = varying(flowUv(aAnchor.x.add(s.mul(reach)), aAnchor.y));
  const vRibbon = varying(aRibbon);
  material.colorNode = Fn(() => {
    const t = vRibbon.x;
    const core = float(1).sub(abs(vRibbon.y));
    const q = vUv.add(vec2(vRibbon.y.mul(0.06), u.phase.negate())).toVar();
    const stream = u.noise.sample(q.mul(vec2(1, 0.5))).r.toVar();
    if (detail) stream.addAssign(u.noise.sample(q.mul(3)).g.sub(0.5).mul(0.3));
    const lick = smoothstep(0.3, 0.7, stream.add(float(1).sub(t).mul(0.4)).sub(0.25));
    const fade = smoothstep(0, 0.08, t).mul(pow(float(1).sub(t), 1.1));
    return plasma(core.mul(core).mul(lick).mul(fade).mul(u.emission).mul(3), stream.add(t.mul(0.5)));
  })();
  return material;
}

export function createCoilMaterial(u: PlasmaUniforms, detail: boolean): MeshBasicNodeMaterial {
  const {plasma} = createField(u);
  const material = ribbonMaterial();
  const aAxis = attribute('aAxis', 'vec3');
  const aSide = attribute('aSide', 'vec3');
  const aCoil = attribute('aCoil', 'vec4');
  const s = aCoil.x;
  const coil = (at: Node): Node => {
    const theta = aCoil.z.add(at.mul(u.coilTwist.x)).mul(TAU).sub(u.phase.mul(u.coilTwist.y));
    const sway = sampleTexture(u.flowMap, vec2(theta.div(TAU), at.mul(0.5).sub(u.time.mul(0.1))).add(aCoil.z))
      .level(float(0))
      .rg.sub(0.5);
    const radius = mix(u.coil.z, u.coil.w, smoothstep(0.35, 1, at)).mul(float(1).add(sway.x.mul(u.turbulence).mul(u.coilTwist.w)));
    const up = cross(aAxis, aSide).mul(aCoil.w);
    return positionLocal.add(aAxis.mul(u.coil.x.add(at.mul(u.coil.y)).add(sway.y.mul(u.turbulence).mul(0.1)))).add(
      aSide
        .mul(cos(theta))
        .add(up.mul(sin(theta)))
        .mul(radius),
    );
  };
  material.vertexNode = Fn(() => {
    const point = modelWorldMatrix.mul(vec4(coil(s), 1)).toVar();
    const ahead = modelWorldMatrix.mul(vec4(coil(s.add(0.02)), 1)).xyz;
    return ribbonClip(point, ahead, u.coilTwist.z.mul(sqrt(sin(s.mul(3.1415926)))).mul(aCoil.y));
  })();
  const vCoil = varying(aCoil.xy);
  const vUv = varying(vec2(aCoil.z.mul(3), s.mul(u.coilTwist.x)));
  material.colorNode = Fn(() => {
    const t = vCoil.x;
    const core = float(1).sub(abs(vCoil.y));
    const stream = u.noise.sample(vUv.add(vec2(0, u.phase.mul(-1.4)))).r.toVar();
    if (detail)
      stream.addAssign(
        u.noise
          .sample(vUv.mul(3).sub(vec2(0, u.phase.mul(2))))
          .g.sub(0.5)
          .mul(0.3),
      );
    const strand = smoothstep(0.35, 0.65, stream);
    const fade = smoothstep(0, 0.15, t).mul(smoothstep(1, 0.8, t));
    return plasma(core.mul(core).mul(strand).mul(fade).mul(u.emission).mul(2.5), stream.add(t));
  })();
  return material;
}

type DriveKey = keyof typeof PLASMA.drive;
const DRIVE_KEYS = Object.keys(PLASMA.drive) as DriveKey[];

// Turbo barely exceeds cruise speed, so held turbo (signals.boost) also boils the plasma over.
export class PlasmaDrive {
  phase = 0;
  speed = 0;
  length = 0;
  sweep = 0;
  turbulence = 0;
  density = 0;
  emission = 0;
  burst = 0;

  step({level, speed, surge, boost: held}: PlasmaSignals, dt: number): void {
    const cruise = Math.max(level, MathUtils.clamp(speed, 0, 1));
    const boost = Math.max(MathUtils.clamp((speed - 1) / (BOOST_RATIO - 1), 0, 1), held);
    const sample = (range: DriveRange): number =>
      (MathUtils.lerp(range.idle, range.cruise, cruise) + (range.boost - range.cruise) * boost) * (1 + range.surge * surge);
    for (const key of DRIVE_KEYS) this[key] = sample(PLASMA.drive[key]);
    this.phase += this.speed * dt;
  }
}

function dorsalLightPositions(root: Object3D, shards: readonly BakedShard[]): Vector3[] {
  return [-1, 1].map((side) => {
    const [dorsal] = shards
      .map(({mesh, geometry}) => {
        geometry.computeBoundingBox();
        const box = (geometry.boundingBox ?? new Box3()).clone().applyMatrix4(meshToRoot(root, mesh));
        return {center: box.getCenter(new Vector3()), length: box.getSize(new Vector3()).z};
      })
      .filter(({center}) => Math.sign(center.x) === side)
      .sort((a, b) => b.length - a.length);
    return dorsal.center.setY(dorsal.center.y + PLASMA.light.lift);
  });
}

export interface LomiPlasmaOptions {
  /** Crystal meshes the plasma flows over (tagged lomi_ship_crystal). */
  crystals: readonly Object3D[];
  /** Thrust anchors the coils wrap around. */
  exhausts: readonly Object3D[];
  /** Thrust meshes, blacked out behind the plasma. */
  nozzles: readonly Object3D[];
  /** Model scale; the plasma works in authoring units. */
  scale: number;
  textures: EnergyTextures;
  quality?: PlasmaQuality;
}

/** Lomi's crystal plasma: shard surface, flame tongues, exhaust coils and dorsal lights. */
export class LomiPlasma implements Disposable {
  /** The authoring-unit space every plasma part lives in. */
  readonly root: Group;
  readonly uniforms: PlasmaUniforms;
  readonly tongues: Mesh<BufferGeometry, MeshBasicNodeMaterial>;
  readonly coils: Mesh<BufferGeometry, MeshBasicNodeMaterial>;
  readonly lights: PointLight[];
  /** Set while an engine drives the plasma; viewers then skip `idle()`. */
  driven = false;

  private readonly surface: MeshBasicNodeMaterial;
  private readonly black = new MeshBasicMaterial({color: 0});
  private readonly drive = new PlasmaDrive();
  private readonly idleSignals: PlasmaSignals = {level: 0, surge: 0, speed: 0, boost: 0, bend: new Vector3(), time: 0};
  private readonly turn = new Quaternion();
  private readonly worldScale = new Vector3();
  private lastTime = 0;

  // Scaled to authoring units so every constant above applies unchanged.
  constructor(
    private readonly ship: Object3D,
    {crystals, exhausts, nozzles, scale, textures, quality = PLASMA_QUALITY[PLASMA.quality]}: LomiPlasmaOptions,
  ) {
    const space = new Group();
    space.name = 'Plasma de Lomi';
    space.scale.setScalar(scale);
    ship.add(space);
    space.updateWorldMatrix(true, false);
    this.root = space;
    const shards = crystals
      .filter(isMesh)
      .map((mesh) => bakeShard(mesh, PLASMA.flow.direction.clone().transformDirection(meshToRoot(space, mesh).invert())));
    this.uniforms = createPlasmaUniforms(textures);
    this.surface = createShardMaterial(this.uniforms, quality.detail);
    for (const {mesh, geometry} of shards) {
      mesh.geometry.dispose();
      mesh.geometry = geometry;
      mesh.material = this.surface;
    }
    const ribbon = (geometry: BufferGeometry, material: MeshBasicNodeMaterial): Mesh<BufferGeometry, MeshBasicNodeMaterial> => {
      const mesh = new Mesh(geometry, material);
      mesh.frustumCulled = false;
      mesh.renderOrder = 1;
      space.add(mesh);
      return mesh;
    };
    this.tongues = ribbon(
      createTongueGeometry(pickTongueAnchors(space, shards, quality.tongues), quality.segments),
      createTongueMaterial(this.uniforms, quality.detail),
    );
    this.coils = ribbon(
      createCoilGeometry(space, exhausts, PLASMA.coils.strands, quality.coils),
      createCoilMaterial(this.uniforms, quality.detail),
    );
    this.lights = dorsalLightPositions(space, shards).map((position) => {
      const light = new PointLight(PLASMA.colors.base, 0, 1, PLASMA.light.decay);
      light.position.copy(position);
      space.add(light);
      return light;
    });
    for (const mesh of nozzles) if (isMesh(mesh)) mesh.material = this.black;
    this.update(this.idleSignals, 0);
  }

  update(signals: PlasmaSignals, dt: number): void {
    const {drive, uniforms, tongues, coils} = this;
    drive.step(signals, dt);
    const emission = drive.emission * PLASMA.intensity;
    const unit = this.root.getWorldScale(this.worldScale).x;
    uniforms.time.value = signals.time;
    uniforms.phase.value = drive.phase;
    uniforms.turbulence.value = drive.turbulence;
    uniforms.density.value = drive.density;
    uniforms.emission.value = emission;
    uniforms.sweep.value = drive.sweep;
    uniforms.burst.value = Math.min(drive.burst, 1);
    uniforms.tongue.value.x = drive.length;
    uniforms.bend.value.copy(signals.bend).applyQuaternion(this.ship.getWorldQuaternion(this.turn).invert());
    tongues.visible = coils.visible = emission > 0;
    // Point lights live in world units: scale distance and the inverse-square intensity with the ship.
    for (const light of this.lights) {
      light.intensity = PLASMA.light.intensity * emission * unit * unit;
      light.distance = PLASMA.light.distance * unit;
      light.color.lerpColors(PLASMA.colors.base, PLASMA.colors.burst[0], uniforms.burst.value);
    }
  }

  /** Viewer animation: `time` in seconds; reduced motion freezes it. */
  idle(time: number, reduced: boolean): void {
    const dt = reduced ? 0 : MathUtils.clamp(time - this.lastTime, 0, 0.1);
    this.lastTime = time;
    this.idleSignals.time = reduced ? 0 : time;
    this.update(this.idleSignals, dt);
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const mesh of [this.tongues, this.coils]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.surface.dispose();
    this.black.dispose();
  }
}
