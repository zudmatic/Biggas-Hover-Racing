import {Color, DataTexture, Float32BufferAttribute, MeshStandardMaterial, RGBAFormat, Vector3, type Mesh, type Object3D} from 'three';
import {MeshStandardNodeMaterial} from 'three/webgpu';
import {attribute, color, fract, texture, uniform, uv} from 'three/tsl';
import {isMesh} from '../scene-utils';

/** Window-only emission on the two baked facade atlases. No per-window lights. */
export class TokyoWindows {
  readonly density = uniform(0.36);
  readonly intensity = uniform(1.6);
  private readonly bindings: {mesh: Mesh; geometry: Mesh['geometry']; material: Mesh['material']}[] = [];
  private readonly masks: DataTexture[] = [];

  constructor(root: Object3D) {
    root.updateMatrixWorld(true);
    root.traverse(object => {
      if (!isMesh(object) || Array.isArray(object.material)) return;
      const source = object.material as MeshStandardMaterial;
      const midrise = /TokyoMidrise_Cube_SharedAtlas/.test(source.name);
      const residential = /TokyoResidentialOffice_SharedAtlas/.test(source.name);
      if ((!midrise && !residential) || !source.map) return;
      this.bindings.push({mesh: object, geometry: object.geometry, material: source});
      object.geometry = object.geometry.clone();
      object.geometry.setAttribute('tokyoWindowSeed', buildingSeeds(object));
      const mask = windowMask(midrise);
      this.masks.push(mask);
      const sample = texture(mask, uv(source.map.channel));
      const albedo = texture(source.map, uv(source.map.channel));
      const on = fract(sample.r.add(attribute('tokyoWindowSeed', 'float'))).lessThan(this.density);
      // The atlas's blue glass survives; mullions, balconies and the wall do not glow.
      const glass = albedo.b.sub(albedo.r).smoothstep(0.003, 0.035);
      const material = new MeshStandardNodeMaterial();
      MeshStandardMaterial.prototype.copy.call(material, source);
      material.name = source.name;
      material.emissiveNode = color(new Color('#ffd18c')).mul(sample.g).mul(glass).mul(on).mul(this.intensity);
      object.material = material;
    });
  }

  dispose(): void {
    for (const {mesh, geometry, material} of this.bindings) {
      mesh.geometry.dispose();
      (mesh.material as MeshStandardNodeMaterial).dispose();
      mesh.geometry = geometry;
      mesh.material = material;
    }
    for (const mask of this.masks) mask.dispose();
  }
}

function windowMask(midrise: boolean): DataTexture {
  const size = 256, bytes = new Uint8Array(size * size * 4);
  const rectangles: number[][] = [];
  if (midrise) {
    for (let y = 0; y < 7; y++) for (let x = 0; x < 6; x++) rectangles.push([12 + x * 62, 20 + y * 61.5, 48, 30]);
  } else {
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 4; x++) rectangles.push([23 + x * 69, 27 + y * 58.2, 39, 20]);
      for (let x = 0; x < 3; x++) rectangles.push([305 + x * 69, 25 + y * 55.8, 53, 28]);
    }
  }
  rectangles.forEach(([x, y, w, h], index) => {
    const random = ((Math.imul(index + 17, 1664525) + 1013904223) >>> 0) % 251;
    for (let py = Math.ceil(y / 2); py < (y + h) / 2; py++) for (let px = Math.ceil(x / 2); px < (x + w) / 2; px++) {
      const at = (py * size + px) * 4;
      bytes[at] = random; bytes[at + 1] = 255; bytes[at + 3] = 255;
    }
  });
  const mask = new DataTexture(bytes, size, size, RGBAFormat);
  mask.needsUpdate = true;
  return mask;
}

/** One repeatable seed per disconnected building; UV/hard-normal seams are welded. */
function buildingSeeds(mesh: Mesh): Float32BufferAttribute {
  const p = mesh.geometry.attributes.position, indices = mesh.geometry.index;
  const parents = Array.from({length: p.count}, (_, i) => i);
  const find = (i: number): number => parents[i] === i ? i : (parents[i] = find(parents[i]));
  const join = (a: number, b: number) => { parents[find(a)] = find(b); };
  const welded = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(5)},${p.getY(i).toFixed(5)},${p.getZ(i).toFixed(5)}`;
    const previous = welded.get(key);
    if (previous !== undefined) join(i, previous); else welded.set(key, i);
  }
  const count = indices?.count ?? p.count;
  for (let i = 0; i < count; i += 3) {
    const a = indices ? indices.getX(i) : i;
    join(a, indices ? indices.getX(i + 1) : i + 1);
    join(a, indices ? indices.getX(i + 2) : i + 2);
  }
  const values = new Float32Array(p.count), seeds = new Map<number, number>(), point = new Vector3();
  for (let i = 0; i < p.count; i++) {
    const id = find(i);
    if (!seeds.has(id)) {
      point.fromBufferAttribute(p, id).applyMatrix4(mesh.matrixWorld);
      const hash = Math.sin(point.x * 12.9898 + point.z * 78.233) * 43758.5453;
      seeds.set(id, hash - Math.floor(hash));
    }
    values[i] = seeds.get(id)!;
  }
  return new Float32BufferAttribute(values, 1);
}
