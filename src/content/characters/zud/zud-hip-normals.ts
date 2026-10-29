import {Box3, BufferAttribute, MathUtils, Matrix3, Triangle, Vector3, type Mesh, type Object3D} from 'three';

interface HipFace {
  triangle: Triangle;
  ids: [number, number, number];
  bounds: Box3;
}

interface HipSurface {
  mesh: Mesh;
  points: Vector3[];
  normals: Vector3[];
  triangles: HipFace[];
  inverseNormal: Matrix3;
}

const isMesh = (object: Object3D): object is Mesh => 'isMesh' in object && object.isMesh === true;

function meshNamed(parent: Object3D, name: string): Mesh {
  const mesh = parent.getObjectByName(name);
  if (!mesh || !isMesh(mesh)) throw new Error(`Zud mesh "${name}" not found`);
  return mesh;
}

// The hips overlap to allow independent leg animation. Blend their surface
// normals in a narrow contact band, just as one welded skin would, so the
// buried pelvis edge does not read as a separate piece in smooth shading.
// Positions, shadows and articulated geometry remain real, closed surfaces.
export function smoothHipNormals(model: {root: Object3D; feet: readonly Object3D[]}): void {
  const torso = meshNamed(model.root, 'Torso');
  const meshes = [torso, ...model.feet.map((hip) => meshNamed(hip, 'Pierna'))];
  model.root.updateMatrixWorld(true);
  const inverse = model.root.matrixWorld.clone().invert();
  const surfaces = meshes.map((mesh): HipSurface => {
    const transform = inverse.clone().multiply(mesh.matrixWorld);
    const normalMatrix = new Matrix3().getNormalMatrix(transform);
    const position = mesh.geometry.attributes.position;
    const normal = mesh.geometry.attributes.normal;
    const points = Array.from({length: position.count}, (_, i) => new Vector3().fromBufferAttribute(position, i).applyMatrix4(transform));
    const normals = Array.from({length: normal.count}, (_, i) =>
      new Vector3().fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize(),
    );
    // The same rest frame also keeps comic hatching continuous at the hips.
    const offsets = new Float32Array(position.count * 3);
    const offset = new Vector3();
    points.forEach((point, i) => {
      offset.fromBufferAttribute(position, i).sub(point).negate();
      offset.toArray(offsets, i * 3);
    });
    mesh.geometry.setAttribute('retroPrintOffset', new BufferAttribute(offsets, 3));
    const index = mesh.geometry.index;
    const triangles: HipFace[] = [];
    const vertexAt = (i: number): number => (index ? index.getX(i) : i);
    for (let i = 0; i < (index?.count ?? position.count); i += 3) {
      const ids: [number, number, number] = [vertexAt(i), vertexAt(i + 1), vertexAt(i + 2)];
      const triangle = new Triangle(points[ids[0]], points[ids[1]], points[ids[2]]);
      const bounds = new Box3().setFromPoints([triangle.a, triangle.b, triangle.c]);
      if (bounds.max.y < -1.17 || bounds.min.y > -0.73) continue;
      triangles.push({triangle, ids, bounds});
    }
    return {mesh, points, normals, triangles, inverseNormal: normalMatrix.clone().invert()};
  });
  const band = 0.11;
  const closest = new Vector3();
  const barycentric = new Vector3();
  const otherNormal = new Vector3();
  const blended = new Vector3();
  for (const [surfaceIndex, surface] of surfaces.entries()) {
    const candidates = surfaceIndex === 0 ? surfaces.slice(1) : [surfaces[0]];
    const attribute = surface.mesh.geometry.attributes.normal;
    surface.points.forEach((point, i) => {
      if (point.y < -1.17 || point.y > -0.73) return;
      let distance = band;
      let nearest: HipFace | null = null;
      for (const other of candidates) {
        for (const face of other.triangles) {
          if (face.bounds.distanceToPoint(point) > distance) continue;
          face.triangle.closestPointToPoint(point, closest);
          const next = point.distanceTo(closest);
          if (next >= distance) continue;
          distance = next;
          nearest = face;
          face.triangle.getBarycoord(closest, barycentric);
          otherNormal.set(0, 0, 0);
          for (let j = 0; j < 3; j++) otherNormal.addScaledVector(other.normals[face.ids[j]], barycentric.getComponent(j));
        }
      }
      if (!nearest || otherNormal.lengthSq() < 1e-8) return;
      otherNormal.normalize();
      // Opposite walls of the crotch are distinct surfaces, not a seam.
      if (surface.normals[i].dot(otherNormal) < -0.35) return;
      const weight = 0.5 * (1 - MathUtils.smoothstep(distance, 0, band));
      blended.copy(surface.normals[i]).lerp(otherNormal, weight).normalize().applyMatrix3(surface.inverseNormal).normalize();
      attribute.setXYZ(i, blended.x, blended.y, blended.z);
    });
    attribute.needsUpdate = true;
  }
}
