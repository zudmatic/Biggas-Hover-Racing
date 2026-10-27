import {spiralShapeGLSL} from './spiral-shape.js';
import {inkShadingGLSL} from './ink-shader.js';
import {createPrintMaterial,createCharacterOutlines} from './character-finish.js';
import * as T from 'three';

// Última versión: cuello corregido y pesos en los dedos (blender/bluleet/: pintados en una copia del maestro y
// pasados al GLB cambiando solo pesos de skin). bluleet-motionlab.glb (sin dedos) y bluleet-comic.glb quedan como anteriores.
export const BLULEET_MODEL = './models/bluleet-motionlab-dedos.glb';
// Mismo rig con el trote; solo se usa su clip.
export const BLULEET_JOG = './models/animations/bluleet-jog.glb';
// El trote avanza en root: para comparar en el lugar se descarta esa traslación.
export const inPlaceClip = clip => new T.AnimationClip(clip.name, clip.duration, clip.tracks.filter(track => track.name !== 'root.position'));
// The two eye surfaces share this UV island in the supplied comic atlas.
// Replace only its painted iris at render time; keep the source atlas intact.
export const BLULEET_EYE = Object.freeze({
  center: [.936, .636], radius: [.049, .046], pupilRadius: .68,
  // Inverse UV-to-face XY fit, for a .025-unit glance. Each eye island is
  // rotated as well as mirrored; flipping U alone would make the eyes diverge.
  gazeMatrices: { L: [-.05445, -.17493, .20227, -.05965], R: [.05445, -.17493, -.20227, -.05965] },
  // Centro de frente, en las mismas unidades de la mirada. Por la curvatura de las UV, la pupila en el centro UV
  // caía .0095 hacia afuera de su disco (se veía bizco): el disco va al centroide del ojo y la pupila al centro del disco.
  centerOffsets: { L: { disc: [-.067, .116], pupil: [-.374, .079] }, R: { disc: [.067, .116], pupil: [.374, .079] } },
  // Recorrido máximo de la pupila desde el centro del disco, para que nunca se salga del ojo.
  maxTravel: .29,
});
// Desplazamiento en unidades del ojo (radio 1) para una mirada en la cara.
export const eyeShift = (side, [x, y]) => { const [a, b, c, d] = BLULEET_EYE.gazeMatrices[side]; return [a * x + b * y, c * x + d * y]; };

function eyeMaterial(source, side, state) {
  const [a, b, c, d] = BLULEET_EYE.gazeMatrices[side];
  const glsl = v => `vec2(${v.map(n => n.toFixed(5)).join(', ')})`;
  const disc = glsl(eyeShift(side, BLULEET_EYE.centerOffsets[side].disc)), pupilCenter = glsl(eyeShift(side, BLULEET_EYE.centerOffsets[side].pupil));
  const material = new T.MeshBasicMaterial({ map: source.map, color: source.color, side: source.side, toneMapped: false });
  material.name = `Bluleet eye ${side}`;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, state);
    shader.vertexShader = 'varying vec3 vEyePrintPoint;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvEyePrintPoint = position;');
    shader.fragmentShader = inkShadingGLSL + spiralShapeGLSL + `varying vec3 vEyePrintPoint; uniform float uInk; uniform vec2 uGaze; uniform float uPhase; uniform float uLife; uniform float uSpiral; uniform vec3 uEyeWhite; uniform vec3 uEyeInk; uniform float uSpiralWidth; uniform float uIrisScale;\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
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
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', '#include <opaque_fragment>\nif (uInk > .5) gl_FragColor.rgb = shadeFlatPrintInk(gl_FragColor.rgb, vEyePrintPoint);');
  };
  material.customProgramCacheKey = () => `bluleet-eyes-v7-iris-${side}`;
  return material;
}

function separateEyeMaterials(mesh, state) {
  const geometry = mesh.geometry.clone(), { position, uv, skinIndex, skinWeight } = geometry.attributes;
  const head = mesh.skeleton.bones.findIndex(bone => bone.name === 'Head');
  if (head < 0 || !uv || !geometry.index) throw new Error('Bluleet: falta la malla con UV y hueso Head.');
  const isEyeVertex = i => {
    const rigidHead = [0, 1, 2, 3].some(k => skinIndex.array[i * 4 + k] === head && skinWeight.array[i * 4 + k] > .99);
    return rigidHead && position.getZ(i) > .30 && position.getY(i) > 1.45 && uv.getX(i) > .87 && uv.getY(i) > .56 && uv.getY(i) < .72;
  };
  const groups = [[], [], []];
  for (let i = 0; i < geometry.index.count; i += 3) {
    const triangle = [0, 1, 2].map(k => geometry.index.getX(i + k));
    const side = triangle.every(isEyeVertex) ? (position.getX(triangle[0]) > 0 ? 1 : 2) : 0;
    groups[side].push(...triangle);
  }
  if (!groups[1].length || !groups[2].length) throw new Error('Bluleet: no se pudieron aislar ambos ojos.');
  geometry.clearGroups();
  let start = 0;
  groups.forEach((indices, material) => { geometry.addGroup(start, indices.length, material); start += indices.length; });
  geometry.setIndex(groups.flat());
  const source = mesh.material;
  mesh.geometry = geometry;
  const { uTexturePixels, uTextureLevels, uSkin, uSkinMix } = state;
  mesh.material = [createPrintMaterial(source, state.uInk, false, true, { uTexturePixels, uTextureLevels, uSkin, uSkinMix }),eyeMaterial(source, 'L', state), eyeMaterial(source, 'R', state)];
  return { left: groups[1].length / 3, right: groups[2].length / 3 };
}

export function createBluleet(asset, ink = { value: 1 }) {
  const root = new T.Group(); root.name = 'Bluleet · comparación';
  root.add(asset.scene);
  // Relax the supplied bind pose for the side-by-side comparison. This is a
  // runtime pose, not a new animation or a modification to the source skeleton.
  asset.scene.updateMatrixWorld(true);
  const bones = [];
  asset.scene.traverse(bone => { if (bone.isBone) bones.push({ bone, position: bone.position.clone(), quaternion: bone.quaternion.clone(), scale: bone.scale.clone() }); });
  for (const [side, sign] of [['l', 1], ['r', -1]]) {
    const arm = asset.scene.getObjectByName(`upperarm_${side}`);
    if (!arm?.isBone) continue;
    const world = arm.getWorldQuaternion(new T.Quaternion());
    const turn = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), -sign * .87);
    arm.quaternion.copy(arm.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(turn.multiply(world)));
    arm.updateMatrixWorld(true);
  }
  const relaxed = bones.map(({ bone }) => bone.quaternion.clone());
  const mixer = new T.AnimationMixer(asset.scene);
  let pose = 'relaxed';
  // 'relaxed' (brazos bajos), 'tpose' (pose de bind tal como viene) o un clip del mismo rig.
  const setPose = (name, clip = null) => {
    mixer.stopAllAction();
    bones.forEach(({ bone, position, quaternion, scale }, i) => { bone.position.copy(position); bone.quaternion.copy(name === 'relaxed' ? relaxed[i] : quaternion); bone.scale.copy(scale); });
    pose = clip ? 'clip' : name;
    if (clip) { mixer.clipAction(clip).reset().play(); mixer.update(0); }
  };
  const state = { uInk: ink, uGaze: { value: new T.Vector2() }, uPhase: { value: 0 }, uLife: { value: 0 }, uSpiral: { value: 1 },
    // Atlas y ojos tal como vienen, salvo que el estudio pida pixelado, tonos o la paleta de Chubee.
    uTexturePixels: { value: 0 }, uTextureLevels: { value: 0 }, uSkin: { value: new T.Color() }, uSkinMix: { value: 0 },
    uEyeWhite: { value: new T.Color(.96, .96, .96) }, uEyeInk: { value: new T.Color(.005, .005, .005) }, uSpiralWidth: { value: 1 },
    // Tamaño del iris (espiral o punto): 1 = el de siempre; el laboratorio lo agranda.
    uIrisScale: { value: 1 } };
  let eyes;
  asset.scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    mesh.castShadow = true; mesh.receiveShadow = true;
    if (mesh.isSkinnedMesh && mesh.name === 'Bluleet') eyes = separateEyeMaterials(mesh, state);
  });
  if (!eyes) throw new Error('Bluleet: no se encontró el personaje.');
  asset.scene.updateMatrixWorld(true);
  const bounds = new T.Box3().setFromObject(asset.scene, true), size = bounds.getSize(new T.Vector3());
  // Center and ground the model without changing its rig, UVs or original file.
  asset.scene.position.set(-(bounds.min.x + bounds.max.x) / 2, -bounds.min.y, -(bounds.min.z + bounds.max.z) / 2);
  asset.scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      material.stencilWrite = true; material.stencilRef = 1;
      material.stencilFunc = T.AlwaysStencilFunc;
      material.stencilFail = material.stencilZFail = T.KeepStencilOp;
      material.stencilZPass = T.ReplaceStencilOp;
    }
  });
  const outlines = createCharacterOutlines(asset.scene, mesh => mesh.isSkinnedMesh && mesh.name === 'Bluleet');
  root.position.set(1.4, .018, 2.5); root.rotation.y = -.08;
  let time = 0;
  const settings = { visible: true, height: 1.75, gaze: true, lookX: 0, lookY: 0, spiral: true, speed: 1.5, iris: 1 };
  const set = options => {
    Object.assign(settings, options);
    root.visible = settings.visible;
    root.scale.setScalar(T.MathUtils.clamp(settings.height, .8, 3) / size.y);
    state.uSpiral.value = settings.spiral ? 1 : 0;
    // Hasta 1,4: más grande, la espiral ya no entra en el ojo aunque mire al centro.
    state.uIrisScale.value = T.MathUtils.clamp(settings.iris, .6, 1.4);
  };
  set(settings);
  return {
    root, eyes, state, outlines, sourceHeight: size.y, set, setPose, get pose() { return pose; },
    // poseDt permite animar el rig a pasos (estilo PS1) mientras ojos y espirales siguen suaves.
    update(dt, animate = true, poseDt = dt) {
      if (animate) { time += dt; state.uLife.value = time; state.uPhase.value += dt * settings.speed; if (pose === 'clip' && poseDt) mixer.update(poseDt); }
      // Held glances with gentle transitions, plus manual adjustment for comparison.
      const x = settings.gaze ? .7 * Math.tanh(3 * Math.sin(time * .45)) : 0;
      const y = settings.gaze ? .25 * Math.sin(time * .63) : 0;
      state.uGaze.value.set(T.MathUtils.clamp(x + settings.lookX, -1, 1), T.MathUtils.clamp(y + settings.lookY, -1, 1));
    },
  };
}
