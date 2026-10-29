import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {wizardCrown, kasaOuterShell} from './hat-geometry';
import {fitAccessories, fitKasaCord, isMesh, type HatRole} from './hat-attachments';
import type {HatModelId} from './hat-catalog';

/** Tailored proportions of a hat, in the source character's coordinates. */
export interface HatFit {
  width: number;
  depth: number;
  height: number;
  seat: number;
  drop: number;
  brow: number;
}

type SurfaceKind = 'fabric' | 'straw' | 'leather' | 'metal' | 'enamel';

/** Authored material values a fitted hat tints from (see CharacterHats). */
export interface HatOriginalFinish {
  color: THREE.Color;
  roughness: number;
  metalness: number;
}

interface HatPart {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  smooth: boolean;
  role: HatRole;
}

interface Face {
  area: THREE.Vector3;
  normal: THREE.Vector3;
}

// Tailored proportions, in the source character's coordinates. The seat stays
// close to the temples while the crown can have its own height and silhouette.
export const HAT_FITS: Readonly<Record<HatModelId, HatFit>> = {
  samurai_kasa: {width: 1, depth: 0.96, height: 1.03, seat: 0.8, drop: 0.1, brow: 0.015},
  cloud_chef: {width: 0.97, depth: 0.94, height: 0.85, seat: 0.71, drop: 0.02, brow: 0.035},
  crescent_wizard: {width: 0.99, depth: 0.95, height: 0.91, seat: 0.71, drop: 0.02, brow: 0.04},
};

// [roughness, metalness, bump scale] per surface family.
const FINISHES: Readonly<Record<SurfaceKind, readonly [number, number, number]>> = {
  fabric: [0.94, 0, 0.009],
  straw: [0.88, 0, 0.012],
  leather: [0.73, 0, 0.006],
  metal: [0.34, 0.48, 0],
  enamel: [0.4, 0.12, 0],
};

const smoothPart = (name: string): boolean =>
  /crown|cloud_lobes/i.test(name) && !/seam|stitch|bead|welt|edge|hem|panel_joint|reinforcement/i.test(name);
const roundPart = (name: string): boolean => /Raised_band/i.test(name);
const kasaCord = (name: string): boolean => /chin|cord|knot|tied|tail|fastening/i.test(name);

/** GLB hat parts use glTF PBR materials. */
function standardMaterial(material: THREE.Material | THREE.Material[]): THREE.MeshStandardMaterial {
  if (Array.isArray(material) || !(material as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
    throw new Error('Sombrero: material no compatible');
  }
  return material as THREE.MeshStandardMaterial;
}

// Widen the outward-facing parts, not the opening that already fits Zud.
// Seams, rolled edges and fasteners use the same deformation as their brim.
function shapeBrim(v: THREE.Vector3, id: HatModelId, name: string): void {
  if (id === 'samurai_kasa') {
    if (!kasaCord(name) && name !== 'Raised_band') {
      v.x *= 1.25;
      v.z *= 1.25;
    }
    return;
  }
  if (id !== 'crescent_wizard' || !/brim/i.test(name)) return;
  const radius = Math.hypot(v.x, v.z / 0.98);
  if (radius <= 1.015) return;
  const extra = (radius - 1.015) * 1.35;
  v.x *= 1 + extra / radius;
  v.z *= 1 + extra / radius;
  v.y += extra * 0.13 * Math.sin(Math.atan2(v.x, v.z) * 2 + 0.6);
}

function surfaceKind(material: THREE.Material, name: string, id: HatModelId): SurfaceKind {
  const label = `${material.name} ${name}`.toLowerCase();
  if (/gold|metal|brass|buckle|rivet|gear|clock_bezel|clock_toothed|chain_link|winding_key|eyelet/.test(label)) return 'metal';
  if (/leather|belt|seal|cord|strap|binding|band_edge/.test(label)) return 'leather';
  if (id === 'samurai_kasa' || /wood/.test(label)) return 'straw';
  return 'fabric';
}

function grainTexture(kind: SurfaceKind): THREE.DataTexture {
  const size = 64;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      const weave =
        kind === 'fabric' ? Math.sin((x * Math.PI) / 2) * Math.cos((y * Math.PI) / 2) * 16 : kind === 'straw' ? Math.sin(x * 0.8) * 24 : 0;
      const value = Math.round(128 + (n - Math.floor(n) - 0.5) * 30 + weave);
      pixels[i] = pixels[i + 1] = pixels[i + 2] = value;
      pixels[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(24, 12);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.needsUpdate = true;
  return texture;
}

// Subdivide long faces before fitting, including the crown (which can move
// toward the head when tilted). This keeps a triangle
// chord from cutting through the head even when its three corners are outside.
function subdivide(source: THREE.BufferGeometry, round: boolean, maxEdge = 0.24): THREE.BufferGeometry {
  const positions: number[] = [];
  const p = source.attributes.position;
  const edge = new THREE.Vector3();
  const across = new THREE.Vector3();
  const midpoint = (a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 => {
    const v = a.clone().add(b).multiplyScalar(0.5);
    if (round) {
      const radius = (Math.hypot(a.x, a.z) + Math.hypot(b.x, b.z)) * 0.5;
      const r = Math.hypot(v.x, v.z);
      if (r > 1e-6) {
        v.x *= radius / r;
        v.z *= radius / r;
      }
    }
    return v;
  };
  function triangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, depth = 0): void {
    if (edge.subVectors(b, a).cross(across.subVectors(c, a)).lengthSq() < 1e-18) return;
    if (depth < 4 && Math.max(a.distanceToSquared(b), b.distanceToSquared(c), c.distanceToSquared(a)) > maxEdge ** 2) {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      triangle(a, ab, ca, depth + 1);
      triangle(ab, b, bc, depth + 1);
      triangle(ca, bc, c, depth + 1);
      triangle(ab, bc, ca, depth + 1);
    } else {
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    }
  }
  for (let i = 0; i < p.count; i += 3) {
    triangle(
      new THREE.Vector3().fromBufferAttribute(p, i),
      new THREE.Vector3().fromBufferAttribute(p, i + 1),
      new THREE.Vector3().fromBufferAttribute(p, i + 2),
    );
  }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
}

function shapePoint(v: THREE.Vector3, fit: HatFit, id: HatModelId, name: string): THREE.Vector3 {
  shapeBrim(v, id, name);
  if (id === 'cloud_chef' && /spoon/i.test(name)) v.y = 0.89 + (v.y - 0.89) * 0.76;
  const originalY = v.y;
  const front = v.z / Math.max(0.01, Math.hypot(v.x, v.z));
  v.x *= fit.width;
  v.z *= fit.depth;
  v.y = fit.seat + (v.y - fit.seat) * (v.y > fit.seat ? fit.height : 1) - fit.drop;
  v.y += fit.brow * front * Math.max(0, 1 - Math.abs(originalY - fit.seat) / 0.8);
  return v;
}

function smoothTogether(geometries: THREE.BufferGeometry[]): void {
  if (!geometries.length) return;
  const combined = mergeGeometries(geometries);
  const p = combined.attributes.position;
  const faces: Face[] = [];
  const vertices = new Map<string, Face[]>();
  const keys: string[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const keyAt = (i: number): string => `${Math.round(p.getX(i) * 1e5)},${Math.round(p.getY(i) * 1e5)},${Math.round(p.getZ(i) * 1e5)}`;
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    const area = c.sub(b).cross(a.sub(b));
    const face: Face = {area: area.clone(), normal: area.clone().normalize()};
    faces.push(face);
    for (let j = 0; j < 3; j++) {
      const key = keyAt(i + j);
      keys.push(key);
      let shared = vertices.get(key);
      if (!shared) vertices.set(key, (shared = []));
      shared.push(face);
    }
  }
  const normals = new Float32Array(p.count * 3);
  const sum = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    sum.set(0, 0, 0);
    const normal = faces[Math.floor(i / 3)].normal;
    for (const neighbor of vertices.get(keys[i]) ?? []) {
      if (normal.dot(neighbor.normal) > 0.5) sum.add(neighbor.area);
    }
    sum.normalize().toArray(normals, i * 3);
  }
  // Area weighting avoids scalloped shading where finely tessellated triangles
  // meet larger panels. Tight welding keeps stitches separate from the crown.
  let offset = 0;
  for (const geometry of geometries) {
    const count = geometry.attributes.position.count;
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals.slice(offset * 3, (offset + count) * 3), 3));
    offset += count;
  }
  combined.dispose();
}

export function refineHat(source: THREE.Object3D, id: HatModelId): THREE.Group {
  const fit = HAT_FITS[id];
  const parts: HatPart[] = [];
  const ownedMaterials = new Map<string, THREE.MeshStandardMaterial>();
  const textures = new Map<SurfaceKind, THREE.DataTexture>();
  const root = new THREE.Group();
  root.name = source.name;
  root.userData.hatId = id;
  source.updateMatrixWorld(true);
  const materialFor = (original: THREE.MeshStandardMaterial, kind: SurfaceKind): THREE.MeshStandardMaterial => {
    const key = `${original.uuid}:${kind}`;
    let material = ownedMaterials.get(key);
    if (!material) {
      material = original.clone();
      const finish = FINISHES[kind];
      material.roughness = finish[0];
      material.metalness = finish[1];
      material.flatShading = false;
      if (id === 'samurai_kasa' && kind === 'leather') material.color.set('#93623c');
      if (finish[2]) {
        let bumpMap = textures.get(kind);
        if (!bumpMap) textures.set(kind, (bumpMap = grainTexture(kind)));
        material.bumpMap = bumpMap;
        material.bumpScale = finish[2];
      }
      material.userData.hatSurface = kind;
      ownedMaterials.set(key, material);
    }
    return material;
  };
  source.traverse((mesh) => {
    if (!isMesh(mesh)) return;
    if (id === 'samurai_kasa' && (kasaCord(mesh.name) || mesh.name === 'Raised_band')) return;
    if (id === 'crescent_wizard' && /bent_crown|crown.*seam|crown.*stitch|stitch.*crown/i.test(mesh.name)) return;
    if (id === 'cloud_chef' && /gathered_crown_seam/i.test(mesh.name)) return;
    let baked = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    baked.applyMatrix4(mesh.matrixWorld);
    const kasaShell = id === 'samurai_kasa' && mesh.name.startsWith('Sixteen_panel_conical_kasa');
    if (kasaShell) {
      const outer = kasaOuterShell(baked);
      baked.dispose();
      baked = outer;
    }
    const geometry = subdivide(baked, roundPart(mesh.name));
    baked.dispose();
    geometry.deleteAttribute('uv');
    const p = geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      shapePoint(v.fromBufferAttribute(p, i), fit, id, mesh.name);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    geometry.computeVertexNormals();
    const authored = standardMaterial(mesh.material);
    const smooth = smoothPart(mesh.name);
    const material = materialFor(authored, surfaceKind(authored, mesh.name, id));
    if (kasaShell) material.side = THREE.DoubleSide;
    const role: HatRole = kasaShell
      ? 'shell'
      : id === 'cloud_chef' && /spoon|pocket/i.test(mesh.name)
        ? 'chefAccessory'
        : id === 'cloud_chef' && /pleat_fabric_band/.test(mesh.name)
          ? 'shell'
          : id === 'crescent_wizard' && /crescent_relief/.test(mesh.name)
            ? 'emblem'
            : 'detail';
    parts.push({geometry, material, smooth, role});
  });
  const original = (name: string): THREE.MeshStandardMaterial => {
    let found: THREE.Material | THREE.Material[] | undefined;
    source.traverse((m) => {
      if (isMesh(m) && !Array.isArray(m.material) && m.material.name === name) found = m.material;
    });
    if (!found) throw new Error(`Sombrero: falta el material ${name}`);
    return standardMaterial(found);
  };
  const add = (geometry: THREE.BufferGeometry, name: string, materialName: string, role: HatRole = 'detail', smooth = true): void => {
    geometry.deleteAttribute('uv');
    const p = geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      shapePoint(v.fromBufferAttribute(p, i), fit, id, name);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    geometry.computeVertexNormals();
    const material = materialFor(original(materialName), 'fabric');
    material.side = THREE.DoubleSide;
    parts.push({geometry, material, smooth, role});
  };
  if (id === 'samurai_kasa') {
    const indexed = new THREE.SphereGeometry(0.092, 24, 8);
    indexed.scale(1, 0.38, 0.98);
    indexed.translate(0, 1.952, 0);
    const cap = indexed.toNonIndexed();
    indexed.dispose();
    add(cap, 'Kasa_tip_cap', 'd1b27d');
  }
  if (id === 'crescent_wizard') add(wizardCrown(), 'Continuous_crown', 'wizard_fabric', 'shell');
  // The source support rings sat across the forehead after lowering the hats.
  // The actual crown/brim now provide the opening, without an extra visible ring.
  smoothTogether(parts.filter((part) => part.smooth).map((part) => part.geometry));
  // Hundreds of tiny stitches become a handful of material batches. Geometry
  // and palette remain intact, with far fewer draw calls in the room and mirror.
  const batches = new Map<string, HatPart[]>();
  for (const part of parts) {
    const key = `${part.material.uuid}:${part.smooth}:${part.role}`;
    let batch = batches.get(key);
    if (!batch) batches.set(key, (batch = []));
    batch.push(part);
  }
  for (const batch of batches.values()) {
    const geometry = mergeGeometries(batch.map((part) => part.geometry));
    const p = geometry.attributes.position;
    const uv: number[] = [];
    for (let i = 0; i < p.count; i++) uv.push(p.getX(i) * 0.5 + 0.5, p.getY(i) * 0.5 + p.getZ(i) * 0.15);
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const [first] = batch;
    const mesh = new THREE.Mesh(geometry, first.material);
    mesh.name = `${first.material.name} · ${first.smooth ? 'copa' : 'detalle'}`;
    mesh.userData.hatRestPositions = p.array.slice();
    mesh.userData.hatRestNormals = geometry.attributes.normal.array.slice();
    mesh.userData.hatSmooth = first.smooth;
    mesh.userData.hatRole = first.role;
    root.add(mesh);
  }
  parts.forEach((part) => part.geometry.dispose());
  if (id === 'samurai_kasa') {
    const material = new THREE.MeshStandardMaterial({name: 'Cordón de cuero', color: '#93623c', roughness: 0.85});
    material.userData.hatSurface = 'leather';
    const mesh = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([], 3)), material);
    mesh.name = 'Cordón ajustado al mentón';
    mesh.userData.hatDynamic = true;
    root.add(mesh);
  }
  root.userData.hatFit = fit;
  return root;
}

// Fit in the anchor's coordinates, so head scaling/reparenting in the editor
// cannot change the clearance calculation. Each edit starts from rest geometry.
export function fitHatToHead(
  root: THREE.Object3D,
  mount: THREE.Object3D,
  anchor: THREE.Object3D,
  head: THREE.Mesh,
  {autoFit = true, crownHeight = 1}: {autoFit?: boolean; crownHeight?: number} = {},
): void {
  anchor.updateWorldMatrix(true, false);
  head.updateWorldMatrix(true, false);
  mount.updateMatrix();
  const headToAnchor = anchor.matrixWorld.clone().invert().multiply(head.matrixWorld);
  head.geometry.computeBoundingBox();
  const headBounds = head.geometry.boundingBox ?? new THREE.Box3();
  const center = headBounds.getCenter(new THREE.Vector3()).applyMatrix4(headToAnchor);
  const radii = headBounds.getSize(new THREE.Vector3()).multiplyScalar(0.5).multiply(new THREE.Vector3().setFromMatrixScale(headToAnchor));
  // Bounding-box radii alone can underestimate a faceted/jittered head along
  // diagonals. Enclose its actual vertices before adding the contact clearance.
  const headPoint = new THREE.Vector3();
  const headPositions = head.geometry.attributes.position;
  let envelope = 1;
  for (let i = 0; i < headPositions.count; i++) {
    envelope = Math.max(
      envelope,
      headPoint.fromBufferAttribute(headPositions, i).applyMatrix4(headToAnchor).sub(center).divide(radii).length(),
    );
  }
  radii.multiplyScalar(envelope);
  // Small clearance also covers the sag of the tessellated faces between vertices.
  radii.addScalar(0.015);
  const inverse = mount.matrix.clone().invert();
  const v = new THREE.Vector3();
  const q = new THREE.Vector3();
  const seat = (root.userData.hatFit as HatFit).seat;
  root.traverse((mesh) => {
    if (!isMesh(mesh) || mesh.userData.hatDynamic) return;
    const p = mesh.geometry.attributes.position;
    const rest = mesh.userData.hatRestPositions as ArrayLike<number>;
    for (let i = 0; i < p.count; i++) {
      v.fromArray(rest, i * 3);
      if (v.y > seat) v.y = seat + (v.y - seat) * crownHeight;
      v.applyMatrix4(mount.matrix);
      if (autoFit) {
        q.copy(v).sub(center).divide(radii);
        const length = q.length();
        if (length < 1 && length > 1e-6) v.copy(q.divideScalar(length).multiply(radii).add(center));
      }
      v.applyMatrix4(inverse);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    p.needsUpdate = true;
  });
  fitAccessories(root);
  if (root.userData.hatId === 'samurai_kasa') fitKasaCord(root, mount.matrix, inverse, center, radii);
  if (autoFit) clearTriangleChords(root, mount.matrix, inverse, center, radii);
  root.traverse((mesh) => {
    if (!isMesh(mesh)) return;
    const normal = mesh.geometry.getAttribute('normal');
    if (autoFit || crownHeight !== 1) {
      if (!mesh.userData.hatSmooth) mesh.geometry.computeVertexNormals();
    } else if (mesh.userData.hatRestNormals && 'copyArray' in normal) {
      normal.copyArray(mesh.userData.hatRestNormals as ArrayLike<number>);
    }
    mesh.geometry.attributes.normal.needsUpdate = true;
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  });
  if (autoFit || crownHeight !== 1)
    smoothTogether(
      root.children
        .filter(isMesh)
        .filter((mesh) => mesh.userData.hatSmooth)
        .map((mesh) => mesh.geometry),
    );
}

// A vertex-only projection still lets triangle interiors cut through a curved
// head. Correct whole faces, sharing corrections at welded vertices so seams
// remain closed. This operates only when the user changes the fit, never per frame.
function clearTriangleChords(
  root: THREE.Object3D,
  matrix: THREE.Matrix4,
  inverse: THREE.Matrix4,
  center: THREE.Vector3,
  radii: THREE.Vector3,
): void {
  type Attribute = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
  const vertices: {point: THREE.Vector3; refs: [Attribute, number][]}[] = [];
  const lookup = new Map<string, number>();
  const faces: [number, number, number][] = [];
  const v = new THREE.Vector3();
  root.traverse((mesh) => {
    if (!isMesh(mesh)) return;
    const p = mesh.geometry.attributes.position;
    const indices: number[] = [];
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix).sub(center).divide(radii);
      const key = `${Math.round(v.x * 1e5)},${Math.round(v.y * 1e5)},${Math.round(v.z * 1e5)}`;
      let index = lookup.get(key);
      if (index === undefined) {
        index = vertices.length;
        vertices.push({point: v.clone(), refs: []});
        lookup.set(key, index);
      }
      vertices[index].refs.push([p, i]);
      indices.push(index);
    }
    for (let i = 0; i < indices.length; i += 3) faces.push([indices[i], indices[i + 1], indices[i + 2]]);
  });
  const triangle = new THREE.Triangle();
  const origin = new THREE.Vector3();
  const nearest = new THREE.Vector3();
  const edge = new THREE.Line3();
  const candidate = new THREE.Vector3();
  const factors = new Float32Array(vertices.length);
  for (let pass = 0; pass < 6; pass++) {
    factors.fill(1);
    let changed = false;
    for (const face of faces) {
      triangle.set(vertices[face[0]].point, vertices[face[1]].point, vertices[face[2]].point);
      triangle.closestPointToPoint(origin, nearest);
      let distance = nearest.length();
      // Extreme projection can collapse an embroidery triangle to an edge.
      // Three's triangle query is undefined there; its segments still need
      // clearance so the fit remains finite and safe to undo.
      if (!Number.isFinite(distance)) {
        distance = Infinity;
        for (const [a, b] of [
          [triangle.a, triangle.b],
          [triangle.b, triangle.c],
          [triangle.c, triangle.a],
        ]) {
          if (a.distanceToSquared(b) < 1e-20) candidate.copy(a);
          else edge.set(a, b).closestPointToPoint(origin, true, candidate);
          distance = Math.min(distance, candidate.length());
        }
      }
      if (distance < 1.0005 && distance > 1e-5) {
        const factor = 1.002 / Math.max(0.1, distance);
        for (const i of face) factors[i] = Math.max(factors[i], factor);
        changed = true;
      }
    }
    if (!changed) break;
    vertices.forEach((vertex, i) => vertex.point.multiplyScalar(factors[i]));
  }
  for (const vertex of vertices) {
    v.copy(vertex.point).multiply(radii).add(center).applyMatrix4(inverse);
    for (const [p, i] of vertex.refs) p.setXYZ(i, v.x, v.y, v.z);
  }
}
