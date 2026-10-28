import * as THREE from 'three';

// The source kasa has a thin inner lining as well as its outer cone. Fitting
// both sheets independently to the head can push the lining through the crown.
// Keep the authored outer panels and render their reverse side as the lining.
export function kasaOuterShell(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = source.attributes.position;
  const positions: number[] = [];
  const triangle = new THREE.Triangle();
  const normal = new THREE.Vector3();
  const center = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    triangle.a.fromBufferAttribute(p, i);
    triangle.b.fromBufferAttribute(p, i + 1);
    triangle.c.fromBufferAttribute(p, i + 2);
    triangle.getNormal(normal);
    triangle.getMidpoint(center);
    // Includes the outward-facing lower lip and the upward-facing tip.
    const radial = normal.x * center.x + normal.z * center.z;
    if (radial > 1e-6 || (Math.abs(radial) <= 1e-6 && normal.y > 0)) {
      for (const point of [triangle.a, triangle.b, triangle.c]) positions.push(point.x, point.y, point.z);
    }
  }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
}

// A single swept surface avoids the folded, intersecting tip of the source crown.
export function wizardCrown(): THREE.BufferGeometry {
  const points = (
    [
      [0, 0.7, 0],
      [0, 1.25, 0],
      [0.025, 1.7, 0],
      [0.14, 2.02, 0],
      [0.34, 2.16, 0],
      [0.6, 2.12, 0.008],
      [0.85, 2, 0.016],
    ] as const
  ).map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const curve = new THREE.CatmullRomCurve3(points);
  const radii = [1.045, 0.74, 0.45, 0.27, 0.18, 0.1, 0.008];
  const segments = 64;
  const sides = 48;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= segments; row++) {
    const t = row / segments;
    const center = curve.getPoint(t);
    const tangent = curve.getTangent(t).normalize();
    const x = new THREE.Vector3(tangent.y, -tangent.x, 0).normalize();
    const z = new THREE.Vector3().crossVectors(x, tangent).normalize();
    const section = t * (radii.length - 1);
    const a = Math.min(radii.length - 2, Math.floor(section));
    const r = THREE.MathUtils.lerp(radii[a], radii[a + 1], section - a);
    for (let col = 0; col <= sides; col++) {
      const angle = (col / sides) * Math.PI * 2;
      const p = center
        .clone()
        .addScaledVector(x, Math.cos(angle) * r)
        .addScaledVector(z, Math.sin(angle) * r * 0.98);
      positions.push(p.x, p.y, p.z);
      if (row < segments && col < sides) {
        const i = row * (sides + 1) + col;
        indices.push(i, i + sides + 1, i + 1, i + 1, i + sides + 1, i + sides + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)).setIndex(indices);
  const flat = g.toNonIndexed();
  g.dispose();
  return flat;
}
