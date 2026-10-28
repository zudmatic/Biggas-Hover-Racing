import {
  AlwaysStencilFunc,
  BackSide,
  Color,
  KeepStencilOp,
  NotEqualStencilFunc,
  ReplaceStencilOp,
  SkinnedMesh,
  type BufferGeometry,
  type MeshStandardMaterial,
} from 'three';
import {MeshBasicNodeMaterial, type Node, type UniformNode} from 'three/webgpu';
import {
  atan,
  color,
  cos,
  float,
  floor,
  fract,
  fwidth,
  mix,
  normalLocal,
  normalWorldGeometry,
  positionGeometry,
  positionLocal,
  sin,
  smoothstep,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import type {Disposable} from '@/core/disposable';
import {attributeOf} from '../shared/object-guards';

// Node equivalent of Chubee's ink-shader.js and spiral-shape.js. The game's
// WebGPU renderer and its WebGL2 fallback share this graph; no GLSL patches.
const hash = (p: Node): Node => fract(sin(p.dot(vec3(12.9898, 78.233, 43.156))).mul(43758.5453));

type InkSource = MeshStandardMaterial;
type EyeSide = 'l' | 'r';

function sourceMap(source: InkSource): NonNullable<InkSource['map']> {
  if (!source.map) throw new Error('Bluleet: el material no tiene textura');
  return source.map;
}

function inkBody(source: InkSource): MeshBasicNodeMaterial {
  const map = sourceMap(source);
  const material = new MeshBasicNodeMaterial({name: 'Bluleet · tinta', side: source.side, map});
  const texel = texture(map, uv()).rgb;
  const blueMask = smoothstep(0.3, 0.6, texel.b.sub(texel.r.max(texel.g)));
  const pigment = mix(texel, color(new Color('#2145ec')).mul(texel.b.div(0.87).clamp(0, 1.2)), blueMask);
  const tone = pigment.max(0).pow(1 / 2.2),
    value = tone.r.max(tone.g).max(tone.b);
  const poster = tone
    .mul(value.mul(4).add(0.5).floor().div(4).div(value.max(0.0001)))
    .pow(2.2)
    .mul(color(source.color));
  const p = positionGeometry,
    grain = hash(floor(p.mul(220)));
  const patch = sin(p.x.mul(28))
    .mul(sin(p.y.mul(31)))
    .mul(sin(p.z.mul(27)));
  const light = normalWorldGeometry.normalize().dot(vec3(-3, 6, 5).normalize());
  const shade = smoothstep(0.23, 0.3, light.add(grain.sub(0.5).mul(0.19)).add(patch.mul(0.055)));
  material.colorNode = mix(vec3(0.0015, 0.001, 0.003), poster, shade);
  material.userData.chubeeInk = true;
  return material;
}

function livingSpiral(point: Node, t: Node): Node {
  const q = point.add(
    vec2(sin(t.mul(1.3).add(point.y.mul(5))), cos(t.mul(1.1).add(point.x.mul(4))))
      .mul(0.6 * 0.035)
      .mul(float(1).sub(smoothstep(0.65, 1, point.length()))),
  );
  const a = atan(q.y, q.x).add(t.mul(1.5));
  const polygon = cos(
    a
      .add(Math.PI / 3)
      .mod(Math.PI / 3)
      .sub(Math.PI / 6),
  );
  const r = q.length().mul(mix(float(1), polygon, 0.65));
  const pulse = sin(t.mul(1.7))
    .mul(0.6 * 0.08)
    .add(1);
  const phase = a
    .sub(r.mul(17).mul(pulse))
    .add(sin(r.mul(10).sub(t.mul(2))).mul(0.6 * 0.55))
    .add(sin(a.mul(3).add(t)).mul(0.6 * 0.18));
  const line = sin(phase.mul(0.5)).abs(),
    width = sin(a.mul(2).sub(t.mul(1.8)).add(r.mul(5)))
      .mul(0.6 * 0.07)
      .add(0.4)
      .min(0.97),
    aa = fwidth(line).max(0.008);
  return float(1)
    .sub(smoothstep(width.sub(aa), width.add(aa), line))
    .mul(float(1).sub(smoothstep(0.9, 0.98, q.length())))
    .max(float(1).sub(smoothstep(0.025, 0.045, q.length())));
}

function inkEye(source: InkSource, side: EyeSide, t: Node): MeshBasicNodeMaterial {
  const map = sourceMap(source);
  const material = new MeshBasicNodeMaterial({name: `Bluleet · espiral ${side}`, map, side: source.side, toneMapped: false});
  const matrix = side === 'l' ? [-0.05445, -0.17493, 0.20227, -0.05965] : [0.05445, -0.17493, -0.20227, -0.05965];
  const shift = ([x, y]: [number, number]): Node => vec2(matrix[0] * x + matrix[1] * y, matrix[2] * x + matrix[3] * y);
  const sign = side === 'l' ? -1 : 1,
    disc = shift([sign * 0.067, 0.116]),
    pupil = shift([sign * 0.374, 0.079]);
  const eye = uv().sub(vec2(0.936, 0.636)).div(vec2(0.049, 0.046)),
    radius = eye.sub(disc).length(),
    aa = fwidth(radius).max(0.008);
  const mask = float(1).sub(smoothstep(float(1).sub(aa), float(1).add(aa), radius));
  const travel = pupil.sub(disc),
    gaze = disc.add(travel.mul(float(0.29).div(travel.length().max(0.00001)).min(1)));
  const spiral = livingSpiral(eye.sub(gaze).div(0.68), t);
  const base = mix(texture(map).rgb.mul(color(source.color)), mix(vec3(0.96), vec3(0.005), spiral), mask);
  const fleck = smoothstep(0.89, 0.97, hash(floor(positionGeometry.mul(220))));
  material.colorNode = mix(base, base.mul(0.35), fleck.mul(0.55));
  material.userData.chubeeInk = true;
  return material;
}

/**
 * Bluleet's ink finish: a posterized body, living spiral eyes and two
 * inverted skinned shells (yellow cutout, red edge). `update` advances the spiral.
 */
export class BluleetInk implements Disposable {
  private readonly tick: UniformNode<number> = uniform(0);
  private readonly geometry: BufferGeometry;
  private readonly shellGeometry: BufferGeometry;
  private readonly materials: MeshBasicNodeMaterial[];
  private readonly shells: SkinnedMesh<BufferGeometry, MeshBasicNodeMaterial>[] = [];

  constructor(mesh: SkinnedMesh) {
    const source = mesh.material as InkSource;
    const geometry = (this.geometry = mesh.geometry.clone());
    const position = attributeOf(geometry, 'position'),
      coords = attributeOf(geometry, 'uv');
    const skinIndex = attributeOf(geometry, 'skinIndex'),
      skinWeight = attributeOf(geometry, 'skinWeight');
    const index = geometry.index;
    if (!index) throw new Error('Bluleet: la malla no está indexada');
    const head = mesh.skeleton.bones.findIndex((bone) => bone.name === 'Head');
    const groups: number[][] = [[], [], []];
    const isEye = (i: number): boolean =>
      [0, 1, 2, 3].some((k) => skinIndex.array[i * 4 + k] === head && skinWeight.array[i * 4 + k] > 0.99) &&
      position.getZ(i) > 0.3 &&
      position.getY(i) > 1.45 &&
      coords.getX(i) > 0.87 &&
      coords.getY(i) > 0.56 &&
      coords.getY(i) < 0.72;
    for (let i = 0; i < index.count; i += 3) {
      const tri = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      groups[tri.every(isEye) ? (position.getX(tri[0]) > 0 ? 1 : 2) : 0].push(...tri);
    }
    if (!groups[1].length || !groups[2].length) throw new Error('Bluleet: no se encontraron ambos ojos para la tinta');
    geometry.clearGroups();
    let start = 0;
    groups.forEach((indices, i) => {
      geometry.addGroup(start, indices.length, i);
      start += indices.length;
    });
    geometry.setIndex(groups.flat());
    const materials = (this.materials = [inkBody(source), inkEye(source, 'l', this.tick), inkEye(source, 'r', this.tick)]);
    mesh.geometry = geometry;
    mesh.material = materials;
    for (const material of materials) {
      Object.assign(material, {
        stencilWrite: true,
        stencilRef: 1,
        stencilFunc: AlwaysStencilFunc,
        stencilFail: KeepStencilOp,
        stencilZFail: KeepStencilOp,
        stencilZPass: ReplaceStencilOp,
      });
    }
    // Inverted skinned shells keep the yellow cutout and red edge attached to the
    // rig. Real depth testing lets the cockpit occlude the seated legs and torso.
    const shellGeometry = (this.shellGeometry = geometry.clone());
    shellGeometry.clearGroups();
    const outlines = [
      ['Recorte amarillo', '#f2c14e', 0.045, 1],
      ['Borde rojo', '#ff152b', 0.013, 2],
    ] as const;
    for (const [name, hex, width, order] of outlines) {
      const material = new MeshBasicNodeMaterial({
        name,
        color: hex,
        side: BackSide,
        depthWrite: false,
        toneMapped: false,
        stencilWrite: true,
        stencilRef: 1,
        stencilFunc: NotEqualStencilFunc,
        stencilFail: KeepStencilOp,
        stencilZFail: KeepStencilOp,
        stencilZPass: KeepStencilOp,
      });
      const jag = hash(floor(positionGeometry.mul(8)))
        .mul(0.45)
        .add(0.8);
      material.positionNode = positionLocal.add(normalLocal.normalize().mul(jag).mul(width));
      material.userData.chubeeInk = true;
      const shell = new SkinnedMesh(shellGeometry, material);
      shell.name = name;
      shell.userData.system = 'cockpit';
      shell.renderOrder = order;
      shell.frustumCulled = false;
      shell.position.copy(mesh.position);
      shell.quaternion.copy(mesh.quaternion);
      shell.scale.copy(mesh.scale);
      shell.bindMode = mesh.bindMode;
      shell.bind(mesh.skeleton, mesh.bindMatrix);
      mesh.parent?.add(shell);
      this.shells.push(shell);
    }
  }

  update(time: number): void {
    this.tick.value = time;
  }

  dispose(): void {
    this.geometry.dispose();
    this.shellGeometry.dispose();
    this.materials.forEach((material) => material.dispose());
    for (const shell of this.shells) {
      shell.material.dispose();
      shell.removeFromParent();
    }
  }
}
