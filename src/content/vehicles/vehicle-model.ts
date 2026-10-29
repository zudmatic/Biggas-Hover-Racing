import {BufferAttribute, Group, Mesh, type BufferGeometry, type InterleavedBufferAttribute, type Object3D} from 'three';
import {lightToonSurfaces} from '@/render/materials/toon-surfaces';
import type {VehicleDefinition} from './vehicle-definition';

/** Applies the definition's transform (and toon relighting) so the GLB sits on the game's grid. */
export function prepareVehicleModel<T extends Object3D>(model: T, definition: VehicleDefinition): T {
  if (definition.toonSurfaces) lightToonSurfaces(model);
  const {scale = 1, offset = [0, 0, 0], yaw = 0} = definition.transform ?? {};
  model.scale.setScalar(scale);
  model.position.fromArray(offset).multiplyScalar(scale);
  model.rotation.y += yaw;
  model.updateMatrixWorld(true);
  return model;
}

// The Oliva is an open cockpit: only its windshield moves, not its seat or hull.
/** The canopy node, or a group gathering the windshield meshes; null without a canopy. */
export function findCanopy(model: Object3D, definition: VehicleDefinition): Object3D | null {
  const canopy = definition.canopy;
  if (!canopy) return null;
  if (canopy.kind === 'node') return model.getObjectByName(canopy.node) ?? null;
  const group = new Group();
  group.name = canopy.group;
  model.add(group);
  const pieces: Mesh[] = [];
  model.traverse((object) => {
    if (object instanceof Mesh && canopy.meshes.test(object.name)) pieces.push(object);
  });
  for (const mesh of pieces) group.attach(mesh);
  return group;
}

/** A non-interleaved, non-normalized Float32 attribute: safe to transform or deform in place. */
export const isPlainFloat32 = (attribute: BufferAttribute | InterleavedBufferAttribute): attribute is BufferAttribute =>
  attribute instanceof BufferAttribute && attribute.array instanceof Float32Array && !attribute.normalized;

/**
 * A plain Float32 copy of an attribute. Quantized (meshopt / KHR_mesh_quantization)
 * or interleaved data can't be transformed or deformed in place.
 */
export function float32Attribute(attribute: BufferAttribute | InterleavedBufferAttribute): BufferAttribute {
  if (isPlainFloat32(attribute)) return attribute.clone();
  const {count, itemSize} = attribute;
  const array = new Float32Array(count * itemSize);
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < itemSize; c++) array[i * itemSize + c] = readComponent(attribute, i, c);
  }
  return new BufferAttribute(array, itemSize);
}

/** The getters denormalize and resolve interleaving. */
function readComponent(attribute: BufferAttribute | InterleavedBufferAttribute, index: number, component: number): number {
  switch (component) {
    case 0:
      return attribute.getX(index);
    case 1:
      return attribute.getY(index);
    case 2:
      return attribute.getZ(index);
    default:
      return attribute.getW(index);
  }
}

/** Replaces an attribute with a plain Float32 one when it's quantized or interleaved. */
export function ensureFloat32(geometry: BufferGeometry, name: string): BufferAttribute | null {
  const attribute = geometry.getAttribute(name);
  if (!attribute) return null;
  if (isPlainFloat32(attribute)) return attribute;
  const plain = float32Attribute(attribute);
  geometry.setAttribute(name, plain);
  return plain;
}
