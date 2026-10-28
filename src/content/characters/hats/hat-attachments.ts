import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

/** Roles assigned by refineHat; accessories are refitted onto the 'shell'. */
export type HatRole = 'shell' | 'chefAccessory' | 'emblem' | 'detail';

export const isMesh = (object: THREE.Object3D): object is THREE.Mesh => (object as THREE.Mesh).isMesh === true;

/** The refined hat's own meshes (direct children of its root). */
export const hatMeshes = (root: THREE.Object3D): THREE.Mesh[] => root.children.filter(isMesh);

// Work in hat-local coordinates, after the crown has been fitted. Decorations
// follow the actual surface, including a lowered or compressed crown.
export function fitAccessories(root: THREE.Object3D): void {
  const meshes = hatMeshes(root);
  const shells = meshes.filter((mesh) => mesh.userData.hatRole === 'shell');
  if (!shells.length) return;
  const material = new THREE.MeshBasicMaterial({side: THREE.DoubleSide});
  const surfaces = shells.map((mesh) => {
    mesh.geometry.computeBoundingSphere();
    mesh.geometry.computeBoundingBox();
    return new THREE.Mesh(mesh.geometry, material);
  });
  const ray = new THREE.Raycaster();
  const direction = new THREE.Vector3();
  const offsets = new Map<HatRole, THREE.Vector3>();
  for (const role of ['chefAccessory', 'emblem'] as const) {
    const box = new THREE.Box3();
    for (const mesh of meshes) {
      if (mesh.userData.hatRole !== role) continue;
      mesh.geometry.computeBoundingBox();
      if (mesh.geometry.boundingBox) box.union(mesh.geometry.boundingBox);
    }
    if (box.isEmpty()) continue;
    const center = box.getCenter(new THREE.Vector3());
    direction.set(center.x, 0, center.z).normalize();
    ray.set(new THREE.Vector3(direction.x * 4, center.y, direction.z * 4), direction.clone().negate());
    const hit = ray.intersectObjects(surfaces, false)[0];
    if (hit)
      offsets.set(
        role,
        hit.point
          .clone()
          .addScaledVector(direction, role === 'chefAccessory' ? 0.04 : 0.025)
          .sub(center),
      );
  }
  for (const mesh of meshes) {
    const offset = offsets.get(mesh.userData.hatRole as HatRole);
    if (offset) mesh.geometry.translate(offset.x, offset.y, offset.z);
  }
  material.dispose();
}

export function fitKasaCord(
  root: THREE.Object3D,
  matrix: THREE.Matrix4,
  inverse: THREE.Matrix4,
  center: THREE.Vector3,
  headRadii: THREE.Vector3,
): void {
  const mesh = hatMeshes(root).find((m) => m.userData.hatDynamic);
  if (!mesh) return;
  const radii = headRadii.clone().addScalar(0.032);
  const shapes: THREE.BufferGeometry[] = [];
  const z = center.z + radii.z * 0.32;
  const ellipse = Math.sqrt(1 - 0.32 ** 2);
  const anchorAngle = -0.35;
  const point = (angle: number): THREE.Vector3 =>
    new THREE.Vector3(center.x + Math.cos(angle) * radii.x * ellipse, center.y - Math.sin(angle) * radii.y * ellipse, z);
  const tube = (points: THREE.Vector3[], radius: number, segments: number): void => {
    const curve = new THREE.CatmullRomCurve3(points);
    const indexed = new THREE.TubeGeometry(curve, segments, radius, 8, false);
    const g = indexed.toNonIndexed();
    indexed.dispose();
    shapes.push(g);
  };
  const points = Array.from({length: 49}, (_, i) => point(anchorAngle + ((Math.PI - 2 * anchorAngle) * i) / 48));
  // Continue each cheek strap upward to the underside of the fitted cone.
  // A vertical ray finds the real attachment point rather than a fixed ring.
  const surfaces = hatMeshes(root).filter((m) => !m.userData.hatDynamic);
  const ray = new THREE.Ray();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const hit = new THREE.Vector3();
  for (const index of [0, points.length - 1]) {
    const end = points[index];
    ray.set(end.clone(), new THREE.Vector3(0, 1, 0));
    let nearest = Infinity;
    for (const surface of surfaces) {
      const p = surface.geometry.attributes.position;
      for (let i = 0; i < p.count; i += 3) {
        a.fromBufferAttribute(p, i).applyMatrix4(matrix);
        b.fromBufferAttribute(p, i + 1).applyMatrix4(matrix);
        c.fromBufferAttribute(p, i + 2).applyMatrix4(matrix);
        if (ray.intersectTriangle(a, b, c, false, hit) && hit.y - end.y < nearest) nearest = hit.y - end.y;
      }
    }
    if (Number.isFinite(nearest)) end.y += nearest + 0.005;
  }
  tube(points, 0.016, 96);
  const knot = point(Math.PI / 2);
  knot.z += 0.014;
  tube(
    Array.from({length: 25}, (_, i) => {
      const t = (i / 24) * Math.PI * 2;
      return knot.clone().add(new THREE.Vector3(Math.cos(t) * 0.034, Math.sin(t) * 0.023, Math.sin(t * 2) * 0.009));
    }),
    0.012,
    32,
  );
  for (const side of [-1, 1]) {
    tube(
      [
        knot.clone().add(new THREE.Vector3(side * 0.012, -0.01, 0)),
        knot.clone().add(new THREE.Vector3(side * 0.03, -0.09, 0.008)),
        knot.clone().add(new THREE.Vector3(side * 0.045, -0.16, 0.016)),
      ],
      0.012,
      12,
    );
  }
  const geometry = mergeGeometries(shapes);
  shapes.forEach((g) => g.dispose());
  geometry.applyMatrix4(inverse);
  geometry.computeVertexNormals();
  mesh.geometry.dispose();
  mesh.geometry = geometry;
}
