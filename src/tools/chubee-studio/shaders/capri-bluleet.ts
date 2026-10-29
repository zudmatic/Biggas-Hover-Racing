import {
  AlwaysStencilFunc,
  AnimationClip,
  AnimationMixer,
  Box3,
  Color,
  Group,
  KeepStencilOp,
  MathUtils,
  MeshBasicMaterial,
  Quaternion,
  ReplaceStencilOp,
  Vector2,
  Vector3,
  type Bone,
  type IUniform,
  type Material,
  type Mesh,
  type SkinnedMesh,
} from 'three';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {spiralShapeGLSL} from './spiral-shape';
import {inkShadingGLSL} from './ink-shader';
import {createPrintMaterial, createCharacterOutlines, type CharacterOutlines} from './character-finish';
import {isBone, isMesh, isSkinnedMesh, materialsOf} from './object-guards';

type Vec2Tuple = readonly [number, number];
type Mat2Tuple = readonly [number, number, number, number];
export type EyeSide = 'L' | 'R';

export interface BluleetEyeLayout {
  center: Vec2Tuple;
  radius: Vec2Tuple;
  pupilRadius: number;
  gazeMatrices: Readonly<Record<EyeSide, Mat2Tuple>>;
  centerOffsets: Readonly<Record<EyeSide, {disc: Vec2Tuple; pupil: Vec2Tuple}>>;
  maxTravel: number;
}

// Última versión: cuello corregido y pesos en los dedos (blender/bluleet/: pintados en una copia del maestro y
// pasados al GLB cambiando solo pesos de skin). bluleet-motionlab.glb (sin dedos) y bluleet-comic.glb quedan como anteriores.
export const BLULEET_MODEL = './models/bluleet-motionlab-dedos.glb';
// Mismo rig con el trote; solo se usa su clip.
export const BLULEET_JOG = './models/animations/bluleet-jog.glb';
// El trote avanza en root: para comparar en el lugar se descarta esa traslación.
export const inPlaceClip = (clip: AnimationClip): AnimationClip =>
  new AnimationClip(
    clip.name,
    clip.duration,
    clip.tracks.filter((track) => track.name !== 'root.position'),
  );
// The two eye surfaces share this UV island in the supplied comic atlas.
// Replace only its painted iris at render time; keep the source atlas intact.
export const BLULEET_EYE: Readonly<BluleetEyeLayout> = Object.freeze<BluleetEyeLayout>({
  center: [0.936, 0.636],
  radius: [0.049, 0.046],
  pupilRadius: 0.68,
  // Inverse UV-to-face XY fit, for a .025-unit glance. Each eye island is
  // rotated as well as mirrored; flipping U alone would make the eyes diverge.
  gazeMatrices: {L: [-0.05445, -0.17493, 0.20227, -0.05965], R: [0.05445, -0.17493, -0.20227, -0.05965]},
  // Centro de frente, en las mismas unidades de la mirada. Por la curvatura de las UV, la pupila en el centro UV
  // caía .0095 hacia afuera de su disco (se veía bizco): el disco va al centroide del ojo y la pupila al centro del disco.
  centerOffsets: {L: {disc: [-0.067, 0.116], pupil: [-0.374, 0.079]}, R: {disc: [0.067, 0.116], pupil: [0.374, 0.079]}},
  // Recorrido máximo de la pupila desde el centro del disco, para que nunca se salga del ojo.
  maxTravel: 0.29,
});
// Desplazamiento en unidades del ojo (radio 1) para una mirada en la cara.
export const eyeShift = (side: EyeSide, [x, y]: Vec2Tuple): [number, number] => {
  const [a, b, c, d] = BLULEET_EYE.gazeMatrices[side];
  return [a * x + b * y, c * x + d * y];
};

/** Every uniform the Bluleet atlas and eye shaders read. */
export interface BluleetUniforms {
  uInk: IUniform<number>;
  uGaze: IUniform<Vector2>;
  uPhase: IUniform<number>;
  uLife: IUniform<number>;
  uSpiral: IUniform<number>;
  uTexturePixels: IUniform<number>;
  uTextureLevels: IUniform<number>;
  uSkin: IUniform<Color>;
  uSkinMix: IUniform<number>;
  uEyeWhite: IUniform<Color>;
  uEyeInk: IUniform<Color>;
  uSpiralWidth: IUniform<number>;
  uIrisScale: IUniform<number>;
}

/** Triangle count of each isolated eye. */
export interface BluleetEyes {
  left: number;
  right: number;
}

/** The atlas material GLTFLoader builds for the character (standard or unlit). */
type AtlasMaterial = Material & Pick<MeshBasicMaterial, 'map' | 'color'>;

function eyeMaterial(source: AtlasMaterial, side: EyeSide, state: BluleetUniforms): MeshBasicMaterial {
  const [a, b, c, d] = BLULEET_EYE.gazeMatrices[side];
  const glsl = (v: readonly number[]): string => `vec2(${v.map((n) => n.toFixed(5)).join(', ')})`;
  const disc = glsl(eyeShift(side, BLULEET_EYE.centerOffsets[side].disc)),
    pupilCenter = glsl(eyeShift(side, BLULEET_EYE.centerOffsets[side].pupil));
  const material = new MeshBasicMaterial({map: source.map, color: source.color, side: source.side, toneMapped: false});
  material.name = `Bluleet eye ${side}`;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, state);
    shader.vertexShader = 'varying vec3 vEyePrintPoint;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvEyePrintPoint = position;');
    shader.fragmentShader =
      inkShadingGLSL +
      spiralShapeGLSL +
      `varying vec3 vEyePrintPoint; uniform float uInk; uniform vec2 uGaze; uniform float uPhase; uniform float uLife; uniform float uSpiral; uniform vec3 uEyeWhite; uniform vec3 uEyeInk; uniform float uSpiralWidth; uniform float uIrisScale;\n` +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
      #include <map_fragment>
      vec2 eye = (vMapUv - vec2(.936, .636)) / vec2(.049, .046);
      float discRadius = length(eye - ${disc});
      float edgeAA = max(fwidth(discRadius), .008);
      float eyeMask = 1. - smoothstep(1. - edgeAA, 1. + edgeAA, discRadius);
      vec2 travel = ${pupilCenter} - ${disc} + vec2(dot(uGaze, vec2(${a}, ${b})), dot(uGaze, vec2(${c}, ${d})));
      // uIrisScale agranda la espiral (y el punto); el recorrido de la mirada se achica lo mismo para no salirse del ojo.
      float travelMax = max(0., ${BLULEET_EYE.maxTravel.toFixed(3)} - ${BLULEET_EYE.pupilRadius} * (uIrisScale - 1.));
      vec2 gaze = ${disc} + travel * min(1., travelMax / max(length(travel), 1e-5));
      vec2 q = (eye - gaze) / (${BLULEET_EYE.pupilRadius} * uIrisScale);
      float spiral = livingSpiral(q, uPhase, uLife, .6, uSpiralWidth);
      float dotRadius = length((eye - gaze) / (.57 * uIrisScale));
      float pupil = mix(1. - smoothstep(.42, .46, dotRadius), spiral, uSpiral);
      diffuseColor.rgb = mix(diffuseColor.rgb, mix(uEyeWhite, uEyeInk, pupil), eyeMask);
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      '#include <opaque_fragment>\nif (uInk > .5) gl_FragColor.rgb = shadeFlatPrintInk(gl_FragColor.rgb, vEyePrintPoint);',
    );
  };
  material.customProgramCacheKey = () => `bluleet-eyes-v7-iris-${side}`;
  return material;
}

function separateEyeMaterials(mesh: SkinnedMesh, state: BluleetUniforms): BluleetEyes {
  const geometry = mesh.geometry.clone(),
    {position, uv, skinIndex, skinWeight} = geometry.attributes;
  const index = geometry.index;
  const head = mesh.skeleton.bones.findIndex((bone) => bone.name === 'Head');
  if (head < 0 || !uv || !index) throw new Error('Bluleet: falta la malla con UV y hueso Head.');
  const isEyeVertex = (i: number): boolean => {
    const rigidHead = [0, 1, 2, 3].some((k) => skinIndex.array[i * 4 + k] === head && skinWeight.array[i * 4 + k] > 0.99);
    return rigidHead && position.getZ(i) > 0.3 && position.getY(i) > 1.45 && uv.getX(i) > 0.87 && uv.getY(i) > 0.56 && uv.getY(i) < 0.72;
  };
  const groups: number[][] = [[], [], []];
  for (let i = 0; i < index.count; i += 3) {
    const triangle = [0, 1, 2].map((k) => index.getX(i + k));
    const side = triangle.every(isEyeVertex) ? (position.getX(triangle[0]) > 0 ? 1 : 2) : 0;
    groups[side].push(...triangle);
  }
  if (!groups[1].length || !groups[2].length) throw new Error('Bluleet: no se pudieron aislar ambos ojos.');
  geometry.clearGroups();
  let start = 0;
  groups.forEach((indices, material) => {
    geometry.addGroup(start, indices.length, material);
    start += indices.length;
  });
  geometry.setIndex(groups.flat());
  // GLTFLoader gives the character a single atlas material.
  const source = mesh.material as AtlasMaterial;
  mesh.geometry = geometry;
  const {uTexturePixels, uTextureLevels, uSkin, uSkinMix} = state;
  mesh.material = [
    createPrintMaterial(source, state.uInk, false, true, {uTexturePixels, uTextureLevels, uSkin, uSkinMix}),
    eyeMaterial(source, 'L', state),
    eyeMaterial(source, 'R', state),
  ];
  return {left: groups[1].length / 3, right: groups[2].length / 3};
}

/** 'relaxed' (brazos bajos), 'tpose' (pose de bind tal como viene) o 'clip' (un clip del mismo rig). */
export type BluleetPose = 'relaxed' | 'tpose' | 'clip';

export interface BluleetSettings {
  visible: boolean;
  height: number;
  gaze: boolean;
  lookX: number;
  lookY: number;
  spiral: boolean;
  speed: number;
  iris: number;
}

interface BoneRest {
  bone: Bone;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
}

/** The Bluleet character with ink atlas, living-spiral eyes and red outlines, posed at runtime. */
export class BluleetActor {
  readonly root = new Group();
  readonly eyes: BluleetEyes;
  readonly state: BluleetUniforms;
  readonly outlines: CharacterOutlines;
  readonly sourceHeight: number;
  private readonly bones: BoneRest[] = [];
  private readonly relaxed: Quaternion[];
  private readonly mixer: AnimationMixer;
  private readonly size: Vector3;
  private readonly settings: BluleetSettings = {
    visible: true,
    height: 1.75,
    gaze: true,
    lookX: 0,
    lookY: 0,
    spiral: true,
    speed: 1.5,
    iris: 1,
  };
  private currentPose: BluleetPose = 'relaxed';
  private time = 0;

  constructor(asset: GLTF, ink: IUniform<number> = {value: 1}) {
    this.root.name = 'Bluleet · comparación';
    this.root.add(asset.scene);
    // Relax the supplied bind pose for the side-by-side comparison. This is a
    // runtime pose, not a new animation or a modification to the source skeleton.
    asset.scene.updateMatrixWorld(true);
    asset.scene.traverse((bone) => {
      if (isBone(bone))
        this.bones.push({bone, position: bone.position.clone(), quaternion: bone.quaternion.clone(), scale: bone.scale.clone()});
    });
    for (const [side, sign] of [
      ['l', 1],
      ['r', -1],
    ] as const) {
      const arm = asset.scene.getObjectByName(`upperarm_${side}`);
      if (!arm || !isBone(arm)) continue;
      const world = arm.getWorldQuaternion(new Quaternion());
      const turn = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -sign * 0.87);
      const parentWorld = arm.parent ? arm.parent.getWorldQuaternion(new Quaternion()) : new Quaternion();
      arm.quaternion.copy(parentWorld.invert().multiply(turn.multiply(world)));
      arm.updateMatrixWorld(true);
    }
    this.relaxed = this.bones.map(({bone}) => bone.quaternion.clone());
    this.mixer = new AnimationMixer(asset.scene);
    this.state = {
      uInk: ink,
      uGaze: {value: new Vector2()},
      uPhase: {value: 0},
      uLife: {value: 0},
      uSpiral: {value: 1},
      // Atlas y ojos tal como vienen, salvo que el estudio pida pixelado, tonos o la paleta de Chubee.
      uTexturePixels: {value: 0},
      uTextureLevels: {value: 0},
      uSkin: {value: new Color()},
      uSkinMix: {value: 0},
      uEyeWhite: {value: new Color(0.96, 0.96, 0.96)},
      uEyeInk: {value: new Color(0.005, 0.005, 0.005)},
      uSpiralWidth: {value: 1},
      // Tamaño del iris (espiral o punto): 1 = el de siempre; el laboratorio lo agranda.
      uIrisScale: {value: 1},
    };
    const meshes: Mesh[] = [];
    asset.scene.traverse((mesh) => {
      if (isMesh(mesh)) meshes.push(mesh);
    });
    let eyes: BluleetEyes | null = null;
    for (const mesh of meshes) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (isSkinnedMesh(mesh) && mesh.name === 'Bluleet') eyes = separateEyeMaterials(mesh, this.state);
    }
    if (!eyes) throw new Error('Bluleet: no se encontró el personaje.');
    this.eyes = eyes;
    asset.scene.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(asset.scene, true);
    this.size = bounds.getSize(new Vector3());
    this.sourceHeight = this.size.y;
    // Center and ground the model without changing its rig, UVs or original file.
    asset.scene.position.set(-(bounds.min.x + bounds.max.x) / 2, -bounds.min.y, -(bounds.min.z + bounds.max.z) / 2);
    for (const mesh of meshes) {
      for (const material of materialsOf(mesh)) {
        material.stencilWrite = true;
        material.stencilRef = 1;
        material.stencilFunc = AlwaysStencilFunc;
        material.stencilFail = material.stencilZFail = KeepStencilOp;
        material.stencilZPass = ReplaceStencilOp;
      }
    }
    this.outlines = createCharacterOutlines(asset.scene, (mesh) => isSkinnedMesh(mesh) && mesh.name === 'Bluleet');
    this.root.position.set(1.4, 0.018, 2.5);
    this.root.rotation.y = -0.08;
    this.set(this.settings);
  }

  get pose(): BluleetPose {
    return this.currentPose;
  }

  /** 'relaxed' (brazos bajos), 'tpose' (pose de bind tal como viene) o un clip del mismo rig. */
  setPose(name: BluleetPose, clip: AnimationClip | null = null): void {
    this.mixer.stopAllAction();
    this.bones.forEach(({bone, position, quaternion, scale}, i) => {
      bone.position.copy(position);
      bone.quaternion.copy(name === 'relaxed' ? this.relaxed[i] : quaternion);
      bone.scale.copy(scale);
    });
    this.currentPose = clip ? 'clip' : name;
    if (clip) {
      this.mixer.clipAction(clip).reset().play();
      this.mixer.update(0);
    }
  }

  set(options: Partial<BluleetSettings>): void {
    const settings = Object.assign(this.settings, options);
    this.root.visible = settings.visible;
    this.root.scale.setScalar(MathUtils.clamp(settings.height, 0.8, 3) / this.size.y);
    this.state.uSpiral.value = settings.spiral ? 1 : 0;
    // Hasta 1,4: más grande, la espiral ya no entra en el ojo aunque mire al centro.
    this.state.uIrisScale.value = MathUtils.clamp(settings.iris, 0.6, 1.4);
  }

  // poseDt permite animar el rig a pasos (estilo PS1) mientras ojos y espirales siguen suaves.
  update(dt: number, animate = true, poseDt = dt): void {
    const settings = this.settings;
    if (animate) {
      this.time += dt;
      this.state.uLife.value = this.time;
      this.state.uPhase.value += dt * settings.speed;
      if (this.currentPose === 'clip' && poseDt) this.mixer.update(poseDt);
    }
    // Held glances with gentle transitions, plus manual adjustment for comparison.
    const x = settings.gaze ? 0.7 * Math.tanh(3 * Math.sin(this.time * 0.45)) : 0;
    const y = settings.gaze ? 0.25 * Math.sin(this.time * 0.63) : 0;
    this.state.uGaze.value.set(MathUtils.clamp(x + settings.lookX, -1, 1), MathUtils.clamp(y + settings.lookY, -1, 1));
  }
}

export function createBluleet(asset: GLTF, ink: IUniform<number> = {value: 1}): BluleetActor {
  return new BluleetActor(asset, ink);
}
