import {BufferAttribute, BufferGeometry, Float32BufferAttribute, MathUtils, Vector3, type InterleavedBufferAttribute} from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {SimplifyModifier} from 'three/addons/modifiers/SimplifyModifier.js';
import type {ZudDetail} from './character-settings';

type Attribute = BufferAttribute | InterleavedBufferAttribute;

interface Edge {
  a: number;
  b: number;
  opposites: number[];
  /** Index of the edge's new midpoint vertex. */
  index: number;
}

// All resolutions start from the approved shell, never the older procedural
// crown/cuff profiles. Cached buffers have the same lifetime as the base shell.
const variants = new WeakMap<BufferGeometry, Map<ZudDetail, BufferGeometry>>();
const curves = new WeakMap<BufferGeometry, Attribute>();

const AXES = ['x', 'y', 'z'] as const;

// Each base triangle (a, b, c) splits into four: corner pairs whose midpoints
// form the new vertices, in the original winding order.
const SPLIT: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, 1],
  [2, 0],
  [0, 1],
  [1, 1],
  [1, 2],
  [2, 0],
  [1, 2],
  [2, 2],
  [0, 1],
  [1, 2],
  [2, 0],
];

// Loop subdivision smooths the approved topology, including the authored
// triangulation on the limbs. Both targets share triangle order, so the last
// quarter of the slider can morph the high-poly shell into real curves.
function loopSubdivision(source: BufferGeometry): BufferGeometry {
  const position = source.attributes.position;
  const points = Array.from({length: position.count}, (_, i) => new Vector3().fromBufferAttribute(position, i));
  if (!source.index) throw new Error('loopSubdivision: indexed geometry required');
  const triangles = source.index.array;
  const neighbors = points.map(() => new Set<number>());
  const edges = new Map<string, Edge>();
  const edgeKey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);
  for (let i = 0; i < triangles.length; i += 3) {
    const a = triangles[i];
    const b = triangles[i + 1];
    const c = triangles[i + 2];
    for (const [u, v, opposite] of [
      [a, b, c],
      [b, c, a],
      [c, a, b],
    ]) {
      neighbors[u].add(v);
      neighbors[v].add(u);
      const key = edgeKey(u, v);
      let edge = edges.get(key);
      if (!edge) {
        edge = {a: u, b: v, opposites: [], index: -1};
        edges.set(key, edge);
      }
      edge.opposites.push(opposite);
    }
  }
  const boundary = points.map((): number[] => []);
  for (const edge of edges.values()) {
    if (edge.opposites.length === 1) {
      boundary[edge.a].push(edge.b);
      boundary[edge.b].push(edge.a);
    }
  }
  const smooth = points.map((point, i) => {
    if (boundary[i].length === 2) {
      return point
        .clone()
        .multiplyScalar(0.75)
        .addScaledVector(points[boundary[i][0]], 0.125)
        .addScaledVector(points[boundary[i][1]], 0.125);
    }
    const n = neighbors[i].size;
    if (n < 3) return point.clone();
    const beta = n === 3 ? 3 / 16 : 3 / (8 * n);
    const result = point.clone().multiplyScalar(1 - n * beta);
    for (const neighbor of neighbors[i]) result.addScaledVector(points[neighbor], beta);
    return result;
  });
  for (const edge of edges.values()) {
    const point = points[edge.a].clone().add(points[edge.b]);
    if (edge.opposites.length === 2) {
      point
        .multiplyScalar(3 / 8)
        .addScaledVector(points[edge.opposites[0]], 1 / 8)
        .addScaledVector(points[edge.opposites[1]], 1 / 8);
    } else {
      point.multiplyScalar(0.5);
    }
    edge.index = smooth.length;
    smooth.push(point);
  }
  const midpoint = (u: number, v: number): number => {
    const edge = edges.get(edgeKey(u, v));
    if (!edge) throw new Error('loopSubdivision: missing edge');
    return edge.index;
  };
  const indices: number[] = [];
  for (let i = 0; i < triangles.length; i += 3) {
    const a = triangles[i];
    const b = triangles[i + 1];
    const c = triangles[i + 2];
    const ab = midpoint(a, b);
    const bc = midpoint(b, c);
    const ca = midpoint(c, a);
    indices.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  const result = new BufferGeometry();
  result.setAttribute(
    'position',
    new Float32BufferAttribute(
      smooth.flatMap((p) => p.toArray()),
      3,
    ),
  );
  result.setIndex(indices);
  return result;
}

export function curvedGeometry(source: BufferGeometry, amount: number): BufferGeometry {
  const high = baseGeometryVariant(source, 'high');
  let target = curves.get(source);
  if (!target) {
    const positions = new BufferGeometry();
    positions.setAttribute('position', source.attributes.position.clone());
    const welded = mergeVertices(positions);
    positions.dispose();
    const first = loopSubdivision(welded);
    const second = loopSubdivision(first);
    const smooth = second.toNonIndexed();
    welded.dispose();
    first.dispose();
    second.dispose();
    // Keep the dimensions and placement of every authored part while rounding.
    source.computeBoundingBox();
    smooth.computeBoundingBox();
    const sourceBounds = source.boundingBox;
    const smoothBounds = smooth.boundingBox;
    if (!sourceBounds || !smoothBounds) throw new Error('curvedGeometry: missing bounding box');
    const baseSize = sourceBounds.getSize(new Vector3());
    const smoothSize = smoothBounds.getSize(new Vector3());
    const baseCenter = sourceBounds.getCenter(new Vector3());
    const smoothCenter = smoothBounds.getCenter(new Vector3());
    const point = new Vector3();
    target = smooth.attributes.position.clone();
    for (let i = 0; i < target.count; i++) {
      point.fromBufferAttribute(target, i).sub(smoothCenter);
      for (const axis of AXES) point[axis] *= smoothSize[axis] > 1e-6 ? baseSize[axis] / smoothSize[axis] : 1;
      point.add(baseCenter);
      target.setXYZ(i, point.x, point.y, point.z);
    }
    smooth.dispose();
    curves.set(source, target);
  }
  const geometry = high.clone();
  const position = geometry.attributes.position;
  for (let i = 0; i < position.array.length; i++) {
    position.array[i] = MathUtils.lerp(position.array[i], target.array[i], amount);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function subdivide(source: BufferGeometry): BufferGeometry {
  const geometry = new BufferGeometry();
  const indices = source.index?.array;
  const count = indices?.length ?? source.attributes.position.count;
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const size = attribute.itemSize;
    const values = new Float32Array(count * 4 * size);
    let offset = 0;
    for (let triangle = 0; triangle < count; triangle += 3) {
      const corners = indices ? [indices[triangle], indices[triangle + 1], indices[triangle + 2]] : [triangle, triangle + 1, triangle + 2];
      // Split in the plane of each base face. No rounding, projection onto a
      // new primitive, or shift of the brim and crown's shared silhouette.
      for (const [first, second] of SPLIT) {
        const i = corners[first];
        const j = corners[second];
        for (let component = 0; component < size; component++) {
          values[offset++] = (attribute.getComponent(i, component) + attribute.getComponent(j, component)) * 0.5;
        }
      }
    }
    geometry.setAttribute(name, new BufferAttribute(values, size));
  }
  return geometry;
}

function simplify(source: BufferGeometry): BufferGeometry {
  const positions = new BufferGeometry();
  positions.setAttribute('position', source.attributes.position.clone());
  if (source.index) positions.setIndex(source.index.clone());
  const welded = mergeVertices(positions);
  positions.dispose();
  const indexed = new SimplifyModifier().modify(welded, Math.floor(welded.attributes.position.count * 0.35));
  welded.dispose();
  const geometry = indexed.toNonIndexed();
  indexed.dispose();
  geometry.computeVertexNormals();
  // Preserve the base's baked attributes at retained vertices. Simplification
  // collapses onto existing vertices rather than inventing a second shape.
  const sourcePosition = source.attributes.position;
  const lookup = new Map<string, number>();
  const key = (attribute: Attribute, index: number): string =>
    [0, 1, 2].map((axis) => attribute.getComponent(index, axis).toFixed(5)).join(',');
  for (let i = 0; i < sourcePosition.count; i++) lookup.set(key(sourcePosition, i), i);
  for (const name of ['ao', 'bounce']) {
    const attribute = source.getAttribute(name);
    if (!attribute) continue;
    const values = new Float32Array(geometry.attributes.position.count);
    for (let i = 0; i < values.length; i++) values[i] = attribute.getX(lookup.get(key(geometry.attributes.position, i)) ?? 0);
    geometry.setAttribute(name, new BufferAttribute(values, 1));
  }
  return geometry;
}

function buildVariant(source: BufferGeometry, detail: ZudDetail): BufferGeometry {
  switch (detail) {
    case 'low':
      return simplify(source);
    case 'medium':
      return subdivide(source);
    case 'high':
      return subdivide(baseGeometryVariant(source, 'medium'));
    default:
      throw new Error('Unknown Zud detail');
  }
}

export function baseGeometryVariant(source: BufferGeometry, detail: ZudDetail, {hat = false}: {hat?: boolean} = {}): BufferGeometry {
  // The base beanie is already faceted. Keep its exact low-poly mesh so edge
  // collapse cannot open the crown/cuff seam or redesign the folded band.
  if (detail === 'original' || (detail === 'low' && hat)) return source;
  let cached = variants.get(source);
  if (!cached) {
    cached = new Map();
    variants.set(source, cached);
  }
  let variant = cached.get(detail);
  if (!variant) {
    variant = buildVariant(source, detail);
    cached.set(detail, variant);
  }
  return variant;
}
