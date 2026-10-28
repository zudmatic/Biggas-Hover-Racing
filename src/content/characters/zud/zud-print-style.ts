import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  IcosahedronGeometry,
  MathUtils,
  Matrix3,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector3,
  type ColorRepresentation,
  type Material,
  type MeshLambertMaterial,
  type Object3D,
} from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {retro} from '@/render/materials/retro-material';
import {positionsOf} from '../shared/object-guards';

type RetroMaterial = ReturnType<typeof retro>;

export interface PrintMaterialOptions {
  gain?: number;
  bounceColor?: Color;
  bounceGain?: number;
}

/** Replacement geometry and material for one of Zud's meshes. */
export interface PrintVariant {
  geometry: BufferGeometry;
  material: Material;
}

export interface PrintVariantOptions {
  root: Object3D;
  /** Body meshes (skin, face and knit), in a stable order shared by every Zud. */
  meshes: Mesh[];
  /** Eye groups, each with [white, pupil, crease] mesh children. */
  eyes: Object3D;
  /** The live beanie dye. */
  knit: MeshLambertMaterial;
  knitGain: number;
}

type Proxy = Mesh<BufferGeometry, MeshBasicMaterial>;

const isMesh = (object: Object3D): object is Mesh => 'isMesh' in object && object.isMesh === true;

// Faceted shells retain their silhouettes and contact detail, while their
// diffuse materials now receive the same real scene lighting as the room.
export function printMaterial(color: ColorRepresentation, options: PrintMaterialOptions): RetroMaterial {
  return retro(color, {...options, vertexAO: true, mottle: 0.15});
}

const random = (seed: number): number => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const PROBE_OFFSETS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

// Rays exactly on a shared triangle edge can miss both triangles through
// floating-point rounding. Retry infinitesimally nearby; never collapse a
// missing sample into the middle of the character.
function shellDistance(ray: Raycaster, objects: Object3D[], origin: Vector3, direction: Vector3, outermost = true): number {
  const hitDistance = (dir: Vector3): number | null => {
    ray.set(origin, dir);
    const hits = ray.intersectObjects(objects, false);
    return hits.length ? (outermost ? hits[hits.length - 1] : hits[0]).distance : null;
  };
  const exact = hitDistance(direction);
  if (exact !== null) return exact;
  const nearby: number[] = [];
  for (const [x, y, z] of PROBE_OFFSETS) {
    const probe = direction
      .clone()
      .addScaledVector(new Vector3(x, y, z), 1e-5)
      .normalize();
    const distance = hitDistance(probe);
    if (distance !== null) nearby.push(distance);
  }
  if (!nearby.length) throw new Error('Cannot close the Retro Print shell');
  nearby.sort((a, b) => a - b);
  return nearby[Math.floor(nearby.length / 2)];
}

// Preserve authored joint cross-sections and their overlap. A radial sphere
// erodes flat hip/shoulder caps, making connected limbs look detached.
function jointSurface(mesh: Mesh): BufferGeometry {
  // Keep the regular ring topology. Insetting a triangle's center used to
  // introduce a valence-three dent that subdivision amplified into a wrinkle.
  const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  mesh.updateMatrix();
  geometry.applyMatrix4(mesh.matrix);
  return geometry;
}

/** A raycast stand-in for a mesh, fixed at the mesh's local transform. */
function proxyFor(mesh: Mesh, matrix = mesh.matrix): Proxy {
  const proxy = new Mesh(mesh.geometry, new MeshBasicMaterial({side: DoubleSide}));
  proxy.matrixAutoUpdate = false;
  proxy.matrix.copy(matrix);
  proxy.matrixWorld.copy(matrix);
  return proxy;
}

// Shrink-wrap an icosphere onto a part: cast from the part's center through
// each vertex and keep the outermost hit, so the new shell follows the old
// silhouette as one closed surface.
function remesh(group: Mesh[], detail: number, seed: number): BufferGeometry {
  const proxies = group.map((mesh) => {
    mesh.updateMatrix();
    return proxyFor(mesh);
  });
  const bounds = new Box3();
  proxies.forEach((proxy) => bounds.expandByObject(proxy));
  const center = bounds.getCenter(new Vector3());
  const half = bounds.getSize(new Vector3()).multiplyScalar(0.5);
  const sphere = new IcosahedronGeometry(1, detail);
  sphere.deleteAttribute('normal');
  sphere.deleteAttribute('uv');
  const shell = mergeVertices(sphere);
  const position = shell.attributes.position;
  const ray = new Raycaster();
  const direction = new Vector3();
  const point = new Vector3();
  for (let i = 0; i < position.count; i++) {
    direction.fromBufferAttribute(position, i).multiply(half).normalize();
    let distance = shellDistance(ray, proxies, center, direction);
    // Inward-only jitter: irregular facets without ever covering the eyes.
    distance *= 1 - random(seed + i * 1.7) * 0.016;
    point.copy(center).addScaledVector(direction, distance);
    position.setXYZ(i, point.x, point.y, point.z);
  }
  proxies.forEach((proxy) => proxy.material.dispose());
  sphere.dispose();
  const geometry = shell.toNonIndexed();
  shell.dispose();
  geometry.computeVertexNormals();
  return geometry;
}

// The crown is rebuilt as a clean faceted dome over the cuff (the source
// crown is wavy where it tucks into the band; the reference is a smooth dome).
function remeshDome(mesh: Mesh, detail: number, seed: number): BufferGeometry {
  mesh.updateMatrix();
  const bounds = new Box3().setFromBufferAttribute(positionsOf(mesh.geometry)).applyMatrix4(mesh.matrix);
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  center.y = bounds.min.y + size.y * 0.37;
  const radii = new Vector3(size.x / 2, bounds.max.y - center.y, size.z / 2);
  const sphere = new IcosahedronGeometry(1, detail);
  sphere.deleteAttribute('normal');
  sphere.deleteAttribute('uv');
  const shell = mergeVertices(sphere);
  const position = shell.attributes.position;
  const point = new Vector3();
  for (let i = 0; i < position.count; i++) {
    point
      .fromBufferAttribute(position, i)
      .multiply(radii)
      .multiplyScalar(1 - random(seed + i * 1.3) * 0.014)
      .add(center);
    position.setXYZ(i, point.x, point.y, point.z);
  }
  sphere.dispose();
  const geometry = shell.toNonIndexed();
  shell.dispose();
  geometry.computeVertexNormals();
  return geometry;
}

// The cuff is a ring, so it gets its own shell: around the band, cast from the
// tube's core outward in each direction of the cross-section.
function remeshRing(mesh: Mesh, around: number, across: number, level = 1, innerGeometry: BufferGeometry | null = null): BufferGeometry {
  mesh.updateMatrix();
  const proxy = proxyFor(mesh);
  const bounds = new Box3().expandByObject(proxy);
  const size = bounds.getSize(new Vector3());
  const middle = bounds.getCenter(new Vector3());
  const depth = size.z / size.x;
  const ray = new Raycaster();
  const points: Vector3[][] = [];
  const inner = innerGeometry ? new Mesh(innerGeometry, proxy.material) : null;
  // The band is arched, so its core follows the original cross-section at
  // each angle: the centroid of the source vertices in that sector.
  const source = mesh.geometry.attributes.position;
  const vertex = new Vector3();
  const core = (theta: number): {radius: number; height: number} => {
    let count = 0;
    let radius = 0;
    let height = 0;
    for (let k = 0; k < source.count; k++) {
      vertex.fromBufferAttribute(source, k).applyMatrix4(mesh.matrix).sub(middle);
      const angle = Math.atan2(vertex.x, vertex.z / depth);
      const delta = Math.atan2(Math.sin(angle - theta), Math.cos(angle - theta));
      // Weighted toward the sector's middle; wide enough to catch the source's
      // own, coarser segments.
      const weight = Math.max(0, 1 - Math.abs(delta) / 0.45);
      radius += Math.hypot(vertex.x, vertex.z / depth) * weight;
      height += vertex.y * weight;
      count += weight;
    }
    return count ? {radius: radius / count, height: height / count} : {radius: size.x * 0.46, height: 0};
  };
  // The source beanie is worn tipped back; the reference sits nearly level, so
  // each column is eased toward the band's mean height.
  const cores = Array.from({length: around}, (_, i) => core((i / around) * Math.PI * 2));
  const mean = cores.reduce((sum, {height}) => sum + height, 0) / around;
  for (let i = 0; i < around; i++) {
    const theta = (i / around) * Math.PI * 2;
    const {radius, height} = cores[i];
    const lift = mean + (height - mean) * level - height;
    const radial = new Vector3(Math.sin(theta), 0, Math.cos(theta) * depth).normalize();
    const origin = new Vector3(Math.sin(theta) * radius, height, Math.cos(theta) * radius * depth).add(middle);
    const row: Vector3[] = [];
    for (let j = 0; j < across; j++) {
      const phi = (j / across) * Math.PI * 2;
      const direction = radial
        .clone()
        .multiplyScalar(Math.cos(phi))
        .add(new Vector3(0, Math.sin(phi), 0))
        .normalize();
      ray.set(origin, direction);
      // Nearest wall: from inside the tube, farther hits belong to the other side of the ring.
      const hit = ray.intersectObject(proxy, false).at(0);
      const distance = hit ? hit.distance : 0.05;
      const point = origin
        .clone()
        .addScaledVector(direction, distance)
        .setY(origin.y + direction.y * distance + lift);
      // The rounded crown is narrower than the authored crown. Tuck the
      // cuff's inner wall into that actual surface, including its facets,
      // so the upper fold bridges the seam without widening the silhouette.
      if (inner && Math.cos(phi) < -1e-6) {
        const axis = new Vector3(middle.x, point.y, middle.z);
        ray.set(axis.clone().addScaledVector(radial, size.length()), radial.clone().negate());
        const crown = ray.intersectObject(inner, false).at(0);
        if (crown) {
          // Overlap also covers interpolation between the two different
          // triangulations, not just contact at the sampled vertices.
          const limit = Math.max(0, crown.point.clone().sub(axis).dot(radial) - 0.08);
          if (point.clone().sub(axis).dot(radial) > limit) point.copy(axis).addScaledVector(radial, limit);
        }
      }
      row.push(point);
    }
    points.push(row);
  }
  const positions: number[] = [];
  for (let i = 0; i < around; i++) {
    for (let j = 0; j < across; j++) {
      const a = points[i][j];
      const b = points[(i + 1) % around][j];
      const c = points[(i + 1) % around][(j + 1) % across];
      const d = points[i][(j + 1) % across];
      // A consistent diagonal gives every interior vertex the same valence.
      // Alternating diagonals produced pinched peaks along the smoothed hem.
      for (const p of [a, b, c, a, c, d]) positions.push(p.x, p.y, p.z);
    }
  }
  proxy.material.dispose();
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// Hemisphere samples, cosine-weighted, fixed so every build bakes the same.
function samples(count: number): Vector3[] {
  const result: Vector3[] = [];
  for (let i = 0; i < count; i++) {
    const u = (i + 0.5) / count;
    const v = (i * 0.618034) % 1;
    const r = Math.sqrt(u);
    const theta = v * Math.PI * 2;
    result.push(new Vector3(Math.cos(theta) * r, Math.sin(theta) * r, Math.sqrt(1 - u)));
  }
  return result;
}

// Per-vertex occlusion and beanie bounce, baked in the rest pose.
function bake(meshes: Mesh[], geometries: BufferGeometry[], knit: Material): void {
  // Occluders are the original low-poly parts: the same shapes, far fewer triangles.
  const occluders = meshes.map((mesh) => {
    const proxy = proxyFor(mesh, mesh.matrixWorld);
    proxy.userData.knit = mesh.material === knit;
    return proxy;
  });
  const directions = samples(14);
  const ray = new Raycaster();
  ray.far = 0.85;
  const tangent = new Vector3();
  const bitangent = new Vector3();
  const direction = new Vector3();
  meshes.forEach((mesh, index) => {
    const geometry = geometries[index];
    const position = geometry.attributes.position;
    const normals = geometry.attributes.normal;
    const ao = new Float32Array(position.count).fill(1);
    const bounce = new Float32Array(position.count);
    const cache = new Map<string, [ao: number, bounce: number]>();
    const normalMatrix = new Matrix3().getNormalMatrix(mesh.matrixWorld);
    const others = occluders.filter((_, other) => other !== index);
    for (let i = 0; i < position.count; i++) {
      const point = new Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      const normal = new Vector3().fromBufferAttribute(normals, i).applyMatrix3(normalMatrix).normalize();
      const id = `${point.x.toFixed(3)},${point.y.toFixed(3)},${point.z.toFixed(3)}`;
      let sample = cache.get(id);
      if (!sample) {
        tangent
          .set(Math.abs(normal.y) < 0.9 ? 0 : 1, Math.abs(normal.y) < 0.9 ? 1 : 0, 0)
          .cross(normal)
          .normalize();
        bitangent.crossVectors(normal, tangent);
        let blocked = 0;
        let warm = 0;
        for (const hemisphere of directions) {
          direction
            .copy(tangent)
            .multiplyScalar(hemisphere.x)
            .addScaledVector(bitangent, hemisphere.y)
            .addScaledVector(normal, hemisphere.z)
            .normalize();
          ray.set(point.clone().addScaledVector(normal, 0.012), direction);
          // A part never occludes itself: its source surface differs from its new shell.
          const hit = ray.intersectObjects(others, false).at(0);
          if (hit) {
            const weight = 1 - (hit.distance / ray.far) * 0.6;
            blocked += weight;
            if (hit.object.userData.knit === true) warm += weight;
          }
        }
        sample = [1 - Math.min(1, (blocked / directions.length) * 1.5), warm / directions.length];
        cache.set(id, sample);
      }
      ao[i] = sample[0];
      bounce[i] = sample[1];
    }
    geometry.setAttribute('ao', new BufferAttribute(ao, 1));
    geometry.setAttribute('bounce', new BufferAttribute(bounce, 1));
  });
  occluders.forEach((proxy) => proxy.material.dispose());
}

// The remodel is expensive, so it is built once and shared by every Zud.
let built: BufferGeometry[] | undefined;
function build(root: Object3D, meshes: Mesh[], knit: Material): BufferGeometry[] {
  root.updateMatrixWorld(true);
  const crownIndex = meshes.findIndex((mesh) => mesh.name === 'Copa');
  const crown = remeshDome(meshes[crownIndex], 4, crownIndex);
  const geometries = meshes.map((mesh, index) => {
    let shell: BufferGeometry;
    if (['Torso', 'Pierna', 'Brazo'].includes(mesh.name)) shell = jointSurface(mesh);
    else if (mesh.name === 'Doblez') shell = remeshRing(mesh, 22, 8, 0.45, crown);
    else if (mesh.name === 'Copa') shell = crown;
    else {
      const size = new Box3().setFromBufferAttribute(positionsOf(mesh.geometry)).getSize(new Vector3());
      const extent = Math.max(...size.toArray()) * Math.max(...mesh.scale.toArray());
      shell = remesh([mesh], Math.round(MathUtils.clamp(extent * 2.5, 2, 5)), index * 97);
    }
    // The shell was built in the parent's frame; bring it into the mesh's own.
    mesh.updateMatrix();
    shell.applyMatrix4(mesh.matrix.clone().invert());
    return shell;
  });
  bake(meshes, geometries, knit);
  return geometries;
}

export function createZudPrintVariant({root, meshes, eyes, knit, knitGain}: PrintVariantOptions): Map<Mesh, PrintVariant> {
  const geometries = (built ??= build(root, meshes, knit));
  const materials = new Map<Material | Material[], RetroMaterial>();
  const variant = new Map<Mesh, PrintVariant>();
  for (const [index, mesh] of meshes.entries()) {
    let material = materials.get(mesh.material);
    if (!material) {
      const isKnit = mesh.material === knit;
      // Skin is a deep plum-brown rather than neutral black, as in the reference;
      // the knit shares the live dye so the beanie still recolors.
      const color = isKnit ? knit.color : new Color(0x382a34);
      material = printMaterial(color, {gain: isKnit ? knitGain : 1.35, bounceColor: knit.color, bounceGain: knitGain});
      materials.set(mesh.material, material);
    }
    variant.set(mesh, {geometry: geometries[index], material});
  }
  // Flat, bright eyes with soft charcoal pupils, unaffected by the colored lights.
  // HDR white: after the filmic curve it lands on a clean, slightly warm white.
  const white = new MeshBasicMaterial({color: new Color().setRGB(2.1, 2.02, 1.9), side: DoubleSide});
  const pupil = new MeshBasicMaterial({color: 0x1c1519, side: DoubleSide});
  for (const eye of eyes.children) {
    const [whiteMesh, pupilMesh] = eye.children;
    if (whiteMesh && isMesh(whiteMesh)) variant.set(whiteMesh, {geometry: whiteMesh.geometry, material: white});
    if (pupilMesh && isMesh(pupilMesh)) variant.set(pupilMesh, {geometry: pupilMesh.geometry, material: pupil});
  }
  return variant;
}
