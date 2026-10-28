import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  type Material,
  type Object3D,
  type Texture,
} from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {DisposableGroup, type Disposable} from '@/core/disposable';
import {retro} from '@/render/materials/retro-material';
import {isMesh} from '../shared/object-guards';
import {CHARACTER_DEFAULTS, type ZudDetail} from './character-settings';
import {
  createCharacterMaterials,
  editableGeometry,
  patternTexture,
  updateCharacterMaterials,
  type CharacterMaterials,
} from './character-surfaces';
import {ZudEyes, type EyePart, type HeadShape} from './zud-eyes';
import {baseGeometryVariant, curvedGeometry} from './zud-geometry-variants';
import {smoothHipNormals} from './zud-hip-normals';
import {createZudPrintVariant} from './zud-print-style';
import {ZudRig} from './zud-rig';

export const BEANIE_COLORS = [
  {name: 'Naranja', hex: CHARACTER_DEFAULTS.hatColor},
  {name: 'Amarillo', hex: '#f6c945'},
  {name: 'Lima', hex: '#b5f500'},
  {name: 'Azul', hex: '#315d95'},
  {name: 'Violeta', hex: '#b250ed'},
  {name: 'Rosa', hex: '#ee79bb'},
  {name: 'Rojo', hex: '#e95261'},
] as const;

// Nearly spherical head, with its chin still meeting the original shoulders.
// Eyes use these same radii so their projection follows the deeper profile.
const HEAD: HeadShape = {x: 1.035, y: 0.94, z: 0.97, centerY: 0.49};

const DETAILS: readonly ZudDetail[] = ['original', 'low', 'medium', 'high'];

/** One closed cross-section of a limb or torso. */
interface SectionRow {
  x: number;
  y: number;
  w: number;
  d: number;
  z?: number;
}

/** A ring of the beanie surface; `rise` scales the front/back arch. */
interface HatRow {
  radius: number;
  y: number;
  lean?: number;
  rise?: number;
  twist?: number;
}

// Closed polygonal cross sections keep the limbs chunky, with actual flat
// soles and chamfered corners instead of overlapping spheres or little shoes.
function sectionGeometry(rows: readonly SectionRow[], segments = 8): BufferGeometry {
  const positions: number[] = [];
  const point = (row: SectionRow, column: number): [number, number, number] => {
    const a = (column / segments + 0.5 / segments) * Math.PI * 2;
    return [row.x + Math.sin(a) * row.w, row.y, (row.z ?? 0) + Math.cos(a) * row.d];
  };
  for (let r = 0; r < rows.length - 1; r++) {
    for (let c = 0; c < segments; c++) {
      const corners = [point(rows[r], c), point(rows[r], c + 1), point(rows[r + 1], c + 1), point(rows[r + 1], c)];
      for (const index of [0, 1, 2, 0, 2, 3]) positions.push(...corners[index]);
    }
  }
  for (const [r, reverse] of [
    [0, true],
    [rows.length - 1, false],
  ] as const) {
    for (let c = 0; c < segments; c++) {
      const center = [rows[r].x, rows[r].y, rows[r].z ?? 0];
      const a = point(rows[r], c),
        b = point(rows[r], c + 1);
      positions.push(...center, ...(reverse ? b : a), ...(reverse ? a : b));
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// All parts share one dye: the folded edge gets its darker underside from
// its geometry and light, never from a separate black stripe or trim.
// The back has a shallower drop than the front arch. Every joining ring
// uses this same curve, so the crown tucks INSIDE the cuff all the way around.
const arch = (angle: number): number => {
  const facing = Math.cos(angle);
  return facing * (facing >= 0 ? 0.31 : 0.29);
};

function hatSurface(profile: readonly HatRow[]): BufferGeometry {
  const vertices: number[] = [],
    segments = 14;
  const point = (row: number, column: number): [number, number, number] => {
    const {radius, y, lean = 0, rise = 1, twist = 0} = profile[row];
    const angle = ((column + 0.5 + twist) / segments) * Math.PI * 2;
    return [Math.sin(angle) * radius + lean, y + rise * arch(angle), Math.cos(angle) * radius * 0.98];
  };
  for (let row = 0; row < profile.length - 1; row++) {
    for (let col = 0; col < segments; col++) {
      const corners = [point(row, col), point(row, col + 1), point(row + 1, col + 1), point(row + 1, col)];
      for (const index of [0, 1, 2, 0, 2, 3]) vertices.push(...corners[index]);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export interface ZudModelOptions {
  detail?: ZudDetail;
  /** 0..1 morph toward the loop-subdivided shell; replaces `detail` when > 0. */
  curve?: number;
  /** Applies the approved surface materials, textures and smooth shading. */
  appearance?: boolean;
  comic?: boolean;
}

/**
 * The approved pilot: the authored mesh and shared character surfaces, with
 * articulated arms/legs (ZudRig), projected eyes (ZudEyes) and a knit beanie.
 */
export class ZudModel implements Disposable {
  readonly root = new Group();
  readonly head: Mesh;
  /** The eye controller's root (both eyes). */
  readonly eyes: Group;
  readonly eyeController: ZudEyes;
  readonly feet: Group[];
  readonly arms: Group[];
  readonly rig: ZudRig;
  readonly laptop = new Group();
  readonly accessoryMount = new Group();
  private readonly hat = new Group();
  private readonly knit: MeshLambertMaterial;
  private baseMaterials: CharacterMaterials | null = null;
  private readonly ownedGeometries = new Set<BufferGeometry>();
  private readonly ownedMaterials = new Set<Material>();
  private readonly textures = new Map<string, Texture>();
  /** Add-ons released with the model (wardrobe, seat props…). */
  private readonly extras = new DisposableGroup();

  constructor(options: ZudModelOptions = {}) {
    const {
      detail = CHARACTER_DEFAULTS.detail,
      curve = options.detail === undefined ? Math.max(0, (CHARACTER_DEFAULTS.meshQuality - 75) / 25) : 0,
      appearance = true,
      comic = CHARACTER_DEFAULTS.comicShader,
    } = options;
    if (!DETAILS.includes(detail)) throw new Error('Unknown Zud detail');
    const {root, hat} = this;
    root.name = 'Zud';
    root.position.y = 1.34;
    const skin = new MeshStandardMaterial({color: 0x141414, roughness: 1, metalness: 0, flatShading: true});
    const faceMaterial = skin.clone();
    faceMaterial.flatShading = false;
    const eyeMaterial = new MeshBasicMaterial({color: 0xfffefa, side: DoubleSide});
    const pupilMaterial = new MeshBasicMaterial({color: 0x080809, side: DoubleSide});
    const box = (
      w: number,
      h: number,
      d: number,
      material: Material,
      x: number,
      y: number,
      z: number,
      parent: Object3D = root,
      r = 0.04,
    ): Mesh => {
      const mesh = new Mesh(new RoundedBoxGeometry(w, h, d, 1, r), material);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };
    const section = (rows: readonly SectionRow[], parent: Object3D = root): Mesh => {
      const mesh = new Mesh(sectionGeometry(rows, 8), skin);
      parent.add(mesh);
      return mesh;
    };

    // A broad round face with a polygonal silhouette, but a quiet, dark forehead.
    // The hat covers the upper half; the chin meets the shoulders without a neck.
    const headGeometry = new IcosahedronGeometry(1, 2);
    const roundedNormals = headGeometry.attributes.normal.clone();
    headGeometry.computeVertexNormals();
    const normals = headGeometry.attributes.normal;
    const normal = new Vector3(),
      rounded = new Vector3();
    for (let i = 0; i < normals.count; i++) {
      normal.fromBufferAttribute(normals, i).lerp(rounded.fromBufferAttribute(roundedNormals, i), 0.76).normalize();
      normals.setXYZ(i, normal.x, normal.y, normal.z);
    }
    const head = (this.head = new Mesh(headGeometry, faceMaterial));
    head.name = 'Cabeza de Zud';
    head.position.set(0, HEAD.centerY, 0);
    head.scale.set(HEAD.x, HEAD.y, HEAD.z);
    root.add(head);
    // Taper the lower pelvis into the broader thigh roots; the old deep
    // underside formed a projecting belly lip over two separate-looking legs.
    section([
      {x: 0, y: -1.025, w: 0.19, d: 0.19},
      {x: 0, y: -0.97, w: 0.44, d: 0.29},
      {x: 0, y: -0.8, w: 0.59, d: 0.39},
      {x: 0, y: -0.52, w: 0.5, d: 0.34},
      {x: 0, y: -0.36, w: 0.45, d: 0.3},
      {x: 0, y: -0.18, w: 0.31, d: 0.24},
    ]).name = 'Torso';
    const feet = (this.feet = [-1, 1].map((side) => {
      const pivot = new Group();
      pivot.position.set(side * 0.36, -1.1, 0.1);
      root.add(pivot);
      pivot.name = side < 0 ? 'Cadera derecha' : 'Cadera izquierda';
      const leg = section(
        [
          {x: side * 0.05, y: -0.24, w: 0.26, d: 0.29, z: 0.015},
          {x: side * 0.04, y: -0.205, w: 0.28, d: 0.305, z: 0.01},
          {x: 0, y: -0.065, w: 0.265, d: 0.285},
          {x: -side * 0.06, y: 0.12, w: 0.275, d: 0.295, z: -0.025},
          {x: -side * 0.09, y: 0.24, w: 0.225, d: 0.195, z: -0.065},
          {x: -side * 0.095, y: 0.28, w: 0.22, d: 0.19, z: -0.065},
          {x: -side * 0.095, y: 0.46, w: 0.13, d: 0.12, z: -0.065},
        ],
        pivot,
      );
      leg.name = 'Pierna';
      // Rotate at the hip, preserving the exact resting silhouette.
      const hip = new Vector3(side * 0.265, -0.82, 0.065);
      leg.position.copy(pivot.position).sub(hip);
      pivot.position.copy(hip);
      pivot.userData.restPosition = hip.clone();
      return pivot;
    }));
    const arms = (this.arms = [-1, 1].map((side) => {
      const pivot = new Group();
      pivot.position.set(side * 0.51, -0.42, 0.035);
      root.add(pivot);
      pivot.name = side < 0 ? 'Hombro derecho' : 'Hombro izquierdo';
      section(
        [
          {x: side * 0.16, y: -0.59, w: 0.13, d: 0.155},
          {x: side * 0.19, y: -0.49, w: 0.22, d: 0.23},
          {x: side * 0.12, y: -0.23, w: 0.205, d: 0.235},
          {x: 0, y: -0.04, w: 0.17, d: 0.19},
          {x: -side * 0.04, y: 0.12, w: 0.13, d: 0.15},
          {x: -side * 0.06, y: 0.2, w: 0.07, d: 0.09},
        ],
        pivot,
      ).name = 'Brazo';
      pivot.userData.restPosition = pivot.position.clone();
      return pivot;
    }));

    // Small internal joint cores cover extreme rotations without protruding
    // through the shoulder or thigh as separate visible knobs.
    for (const joint of [...arms, ...feet]) {
      const cap = new Mesh(new IcosahedronGeometry(0.105, 1), skin);
      cap.name = arms.includes(joint) ? 'Núcleo del hombro' : 'Núcleo de la cadera';
      cap.position.copy(joint.position);
      root.add(cap);
    }

    const eyeController = (this.eyeController = new ZudEyes(HEAD, {white: eyeMaterial, pupil: pupilMaterial}));
    const eyes = (this.eyes = eyeController.root);
    root.add(eyes);

    hat.name = 'Beanie de Zud';
    root.add(hat);
    const knit = (this.knit = new MeshLambertMaterial({color: 0x1b1b1e, flatShading: true, toneMapped: false}));
    const hatMesh = (geometry: BufferGeometry, name: string): void => {
      const mesh = new Mesh(geometry, knit);
      mesh.name = name;
      hat.add(mesh);
    };
    hatMesh(
      hatSurface([
        {radius: 1.035, y: 0.61},
        {radius: 1.035, y: 0.86, rise: 0.87},
        {radius: 0.92, y: 1.13, lean: -0.015, rise: 0.48, twist: 0.12},
        {radius: 0.65, y: 1.34, lean: -0.06, rise: 0.17, twist: -0.12},
        {radius: 0.31, y: 1.45, lean: -0.13, rise: 0},
        {radius: 0, y: 1.47, lean: -0.13, rise: 0},
      ]),
      'Copa',
    );
    hatMesh(
      hatSurface([
        {radius: 1.015, y: 0.23},
        {radius: 1.13, y: 0.27},
        {radius: 1.15, y: 0.33},
        {radius: 1.12, y: 0.78},
        {radius: 1.035, y: 0.84},
        {radius: 1.015, y: 0.78},
        {radius: 1.015, y: 0.23},
      ]),
      'Doblez',
    );
    const pompom = new Mesh(new IcosahedronGeometry(1, 1), knit);
    pompom.name = 'Pompón';
    pompom.position.set(-0.045, 1.64, -0.14);
    pompom.scale.set(0.46, 0.44, 0.45);
    pompom.rotation.set(0.12, 0.2, 0.15);
    hat.add(pompom);
    this.setBeanieColor(BEANIE_COLORS[0].hex);

    const bodyMeshes: Mesh[] = [];
    const sharedGeometries = new Set<BufferGeometry>();
    const bodyMaterials: Material[] = [skin, faceMaterial, knit];
    root.traverse((mesh) => {
      if (isMesh(mesh) && !Array.isArray(mesh.material) && bodyMaterials.includes(mesh.material)) bodyMeshes.push(mesh);
    });
    {
      const print = createZudPrintVariant({root, meshes: bodyMeshes, eyes, knit, knitGain: 1 / 0.65});
      const oldGeometries = new Set(bodyMeshes.map((mesh) => mesh.geometry));
      for (const [mesh, variant] of print) {
        mesh.geometry = variant.geometry;
        mesh.material = variant.material;
      }
      for (const mesh of bodyMeshes) {
        if (curve > 0) mesh.geometry = curvedGeometry(mesh.geometry, MathUtils.clamp(curve, 0, 1));
        else {
          mesh.geometry = baseGeometryVariant(mesh.geometry, detail, {hat: mesh.parent === hat});
          sharedGeometries.add(mesh.geometry);
        }
      }
      oldGeometries.forEach((geometry) => geometry.dispose());
      skin.dispose();
      faceMaterial.dispose();
      pupilMaterial.dispose();
    }
    root.userData.modelStyle = detail === 'original' ? 'print' : detail;

    const {laptop, accessoryMount} = this;
    root.add(laptop);
    const metal = retro(0xa5a0b5);
    box(1.15, 0.06, 0.65, metal, 0, -0.72, 0.94, laptop, 0.018);
    const lid = box(1.15, 0.76, 0.055, metal, 0, -0.36, 1.22, laptop, 0.02);
    lid.rotation.x = -0.15;
    box(0.105, 0.105, 0.006, eyeMaterial, 0, -0.36, 1.265, laptop, 0.009);
    laptop.visible = false;
    accessoryMount.position.set(0, 0.21, 0.235);
    root.add(accessoryMount);
    const {ownedGeometries, ownedMaterials, textures} = this;
    for (const material of [skin, faceMaterial, knit, eyeMaterial, pupilMaterial, metal]) ownedMaterials.add(material);
    root.traverse((mesh) => {
      if (!isMesh(mesh)) return;
      if (!sharedGeometries.has(mesh.geometry)) ownedGeometries.add(mesh.geometry);
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) ownedMaterials.add(material);
    });
    if (appearance) {
      for (const kind of new Set([CHARACTER_DEFAULTS.skinTexture, CHARACTER_DEFAULTS.hatTexture])) {
        if (kind === 'none') continue;
        const texture = patternTexture(kind);
        texture.colorSpace = SRGBColorSpace;
        texture.wrapS = texture.wrapT = RepeatWrapping;
        texture.repeat.setScalar(CHARACTER_DEFAULTS.textureScale);
        texture.anisotropy = 8;
        textures.set(kind, texture);
      }
      const baseMaterials = (this.baseMaterials = createCharacterMaterials(CHARACTER_DEFAULTS, {comic}));
      updateCharacterMaterials(baseMaterials, CHARACTER_DEFAULTS, textures);
      for (const material of Object.values(baseMaterials)) ownedMaterials.add(material);
      for (const mesh of bodyMeshes) {
        mesh.geometry = editableGeometry(mesh.geometry, CHARACTER_DEFAULTS.shading === 'smooth', mesh.scale);
        ownedGeometries.add(mesh.geometry);
        mesh.material = mesh.parent === hat ? baseMaterials.hat : baseMaterials.skin;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
      for (const eye of eyes.children) {
        for (const mesh of eye.children) {
          if (isMesh(mesh)) mesh.material = baseMaterials[mesh.userData.eyePart as EyePart];
        }
      }
      if (CHARACTER_DEFAULTS.shading === 'smooth') smoothHipNormals({root, feet});
      eyeController.setHeadSurface(head);
      root.userData.modelStyle = comic ? 'comic' : CHARACTER_DEFAULTS.material;
    }
    this.rig = new ZudRig({arms, feet});
  }

  setBeanieColor(hex: string): void {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
    // Compensate for the studio lights without ACES desaturating bright dyes.
    this.knit.color.set(hex).multiplyScalar(0.65);
    this.root.userData.beanieColor = hex.toLowerCase();
    const hatMaterial = this.baseMaterials?.hat;
    if (hatMaterial && 'color' in hatMaterial) hatMaterial.color.set(hex);
  }

  /** Registers an add-on (wardrobe, seat props…) to release with the model, before it. */
  own<T extends Disposable | (() => void)>(item: T): T {
    return this.extras.add(item);
  }

  dispose(): void {
    this.extras.dispose();
    this.rig.dispose();
    this.ownedGeometries.forEach((geometry) => geometry.dispose());
    this.ownedMaterials.forEach((material) => material.dispose());
    this.textures.forEach((texture) => texture.dispose());
  }
}
