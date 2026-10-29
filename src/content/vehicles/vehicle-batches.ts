import {BufferAttribute, BufferGeometry, Mesh, MeshStandardMaterial, type Group, type Material, type Object3D} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {materialsOf} from './resources';
import type {VehicleDefinition} from './vehicle-definition';
import {findCanopy, float32Attribute, isPlainFloat32} from './vehicle-model';

export interface VehicleBatches {
  /** Nodes kept live (`definition.liveNodes`), now children of the root. */
  liveNodes: Object3D[];
  /** Merged cloth meshes, indexed, in vehicle space. */
  clothMeshes: Mesh[];
  /** Lamp-lens source material → its switchable copy. */
  headlamps: Map<MeshStandardMaterial, MeshStandardMaterial>;
}

/**
 * Bakes a prepared model into `root`: static meshes merge into one indexed batch
 * per material, cloth meshes merge separately (they deform) and live nodes move
 * over untouched. Only position, normal and uv survive the bake. Source geometries
 * are released; the source keeps its materials.
 */
export function bakeVehicle(source: Object3D, root: Group, definition: VehicleDefinition): VehicleBatches {
  // Rigged parts (eye pivots, morphing lids and tongue) stay live; the rest is baked into batches.
  const liveNodes: Object3D[] = [];
  const livePattern = definition.liveNodes;
  if (livePattern) {
    source.traverse((node) => {
      if (livePattern.test(node.name)) liveNodes.push(node);
    });
  }
  const skipped = new Set<Object3D>();
  for (const node of liveNodes) node.traverse((part) => skipped.add(part));
  const canopy = findCanopy(source, definition);
  if (definition.canopy?.kind === 'node' && definition.canopy.removeInFlight) canopy?.traverse((part) => skipped.add(part));

  const batches = new Map<Material, BufferGeometry[]>();
  const clothBatches = new Map<Material, BufferGeometry[]>();
  const headlamps = new Map<MeshStandardMaterial, MeshStandardMaterial>();
  const {lampLens} = definition.lights;
  const clothPattern = definition.cloth?.meshes;
  source.traverse((mesh) => {
    if (!(mesh instanceof Mesh) || skipped.has(mesh)) return;
    let material = materialsOf(mesh)[0];
    // Front lamp lenses share their source material with cockpit instruments.
    // Separate only the lamps so switching F never darkens Zud's dashboard.
    if (lampLens?.test(mesh.name) && material instanceof MeshStandardMaterial) {
      let lamp = headlamps.get(material);
      if (!lamp) {
        lamp = material.clone();
        lamp.emissiveIntensity = 0;
        lamp.userData.headlight = true;
        headlamps.set(material, lamp);
      }
      material = lamp;
    }
    const target = clothPattern?.test(mesh.name) ? clothBatches : batches;
    let geometries = target.get(material);
    if (!geometries) target.set(material, (geometries = []));
    geometries.push(bakeGeometry(mesh));
  });

  for (const [material, geometries] of batches) addBatch(root, merge(geometries, definition), material);
  const clothMeshes = [...clothBatches].map(([material, geometries]) => {
    const mesh = addBatch(root, merge(geometries, definition), material);
    mesh.name = definition.cloth?.name ?? mesh.name;
    return mesh;
  });
  for (const node of liveNodes) {
    root.attach(node);
    node.traverse((part) => {
      if (!(part instanceof Mesh)) return;
      part.castShadow = true;
      part.receiveShadow = true;
    });
  }
  source.traverse((mesh) => {
    if (mesh instanceof Mesh) mesh.geometry.dispose();
  });
  return {liveNodes, clothMeshes, headlamps};
}

/**
 * The mesh in vehicle space with plain Float32 position, normal and uv (zeros when
 * missing, so every batch shares one layout). The index is kept: GPU memory and
 * vertex work stay at the source's shared-vertex count.
 */
function bakeGeometry(mesh: Mesh): BufferGeometry {
  const source = mesh.geometry;
  const geometry = new BufferGeometry();
  const position = source.getAttribute('position');
  geometry.setAttribute('position', float32Attribute(position));
  const normal = source.getAttribute('normal');
  if (normal) geometry.setAttribute('normal', float32Attribute(normal));
  const uv = source.getAttribute('uv');
  if (!uv) geometry.setAttribute('uv', new BufferAttribute(new Float32Array(position.count * 2), 2));
  else geometry.setAttribute('uv', isPlainFloat32(uv) ? uv : float32Attribute(uv));
  geometry.setIndex(source.index ?? sequentialIndex(position.count));
  geometry.applyMatrix4(mesh.matrixWorld);
  return geometry;
}

function sequentialIndex(count: number): BufferAttribute {
  const array = count > 65535 ? new Uint32Array(count) : new Uint16Array(count);
  for (let i = 0; i < count; i++) array[i] = i;
  return new BufferAttribute(array, 1);
}

function merge(geometries: BufferGeometry[], definition: VehicleDefinition): BufferGeometry {
  const merged = mergeGeometries(geometries);
  for (const geometry of geometries) geometry.dispose();
  if (!merged) throw new Error(`${definition.title}: no se pudieron unir las mallas.`);
  return merged;
}

function addBatch(root: Group, geometry: BufferGeometry, material: Material): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  return mesh;
}
