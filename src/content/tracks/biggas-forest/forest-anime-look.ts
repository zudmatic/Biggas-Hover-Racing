import {DataTexture, NearestFilter, RGBAFormat, type Material, type Mesh, type Object3D, type MeshStandardMaterial} from 'three';
import {MeshToonNodeMaterial, type Node, type NodeBuilder} from 'three/webgpu';
import {diffuseColor, mix, normalView, positionViewDirection, smoothstep, uniform, vec3} from 'three/tsl';
import {isMesh} from '@/render/scene-utils';

/** Lighting is quantized before the painted maps, AO, shadows and emissive are composed. */
export class ForestAnimeMaterial extends MeshToonNodeMaterial {
  override setupLighting(builder: NodeBuilder): Node {
    const lit = super.setupLighting(builder).toVar();
    const albedo = diffuseColor.rgb.dot(vec3(.2126, .7152, .0722)).max(.025);
    const illumination = lit.dot(vec3(.2126, .7152, .0722)).div(albedo);
    const light = smoothstep(.5, 1.35, illumination);
    const tint = mix(vec3(.85, .92, 1.07), vec3(1.035, 1.018, .96), light);
    // A restrained painted edge light, scaled by existing illumination: no night glow.
    const rim = smoothstep(.72, .96, normalView.dot(positionViewDirection).abs().oneMinus());
    return lit.mul(tint).mul(rim.mul(.07).add(1));
  }
}

const COPIED = [
  'color', 'map', 'alphaMap', 'normalMap', 'normalScale', 'normalMapType', 'bumpMap', 'bumpScale',
  'emissive', 'emissiveMap', 'emissiveIntensity', 'aoMap', 'aoMapIntensity', 'lightMap', 'lightMapIntensity',
  'side', 'transparent', 'opacity', 'alphaTest', 'alphaToCoverage', 'depthWrite', 'depthTest',
  'vertexColors', 'flatShading', 'fog', 'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits',
  'lightsNode',
] as const;

export function createForestAnimeLook(scene: Object3D) {
  const shades = new Uint8Array(32 * 4);
  for (let i = 0; i < 32; i++) {
    const shade = i < 15 ? 62 : i < 25 ? 158 : 255;
    shades.set([shade, shade, shade, 255], i * 4);
  }
  const gradient = new DataTexture(shades, 32, 1, RGBAFormat);
  gradient.name = 'Forest anime · three light bands';
  gradient.minFilter = gradient.magFilter = NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  const bindings: {mesh: Mesh; source: Material | Material[]}[] = [];
  const cache = new Map<MeshStandardMaterial, ForestAnimeMaterial>();
  const warmth = uniform(.08);
  let active = false, override: 'base' | 'jitter' | 'ps2' | null = null;
  scene.traverse((object) => {if (isMesh(object)) bindings.push({mesh: object, source: object.material});});
  function convert(source: Material): Material {
    const standard = source as MeshStandardMaterial & {isNodeMaterial?: boolean};
    // Water, foam, exhaust and transparent glass retain their authored animated shaders.
    if (!standard.isMeshStandardMaterial || standard.isNodeMaterial || source.transparent || /water|foam/.test(source.userData.circuitSurface ?? '')) return source;
    const cached = cache.get(standard);
    if (cached) return cached;
    const material = new ForestAnimeMaterial();
    const target = material as unknown as Record<string, unknown>, origin = source as unknown as Record<string, unknown>;
    for (const key of COPIED) if (key in origin) target[key] = origin[key];
    material.gradientMap = gradient;
    material.name = `Forest anime · ${source.name}`;
    cache.set(standard, material);
    return material;
  }
  return {
    kind: 'forest-anime' as const, warmth,
    get settings() {return {enabled: override !== 'base', bands: 3, rim: .07};},
    setOverride(mode: typeof override) {override = mode;},
    update({enabled = true}: {enabled?: boolean; reducedMotion?: boolean} = {}) {
      const next = enabled && override !== 'base';
      warmth.value = next ? .08 : 0;
      if (next !== active) {
        for (const binding of bindings) binding.mesh.material = next
          ? Array.isArray(binding.source) ? binding.source.map(convert) : convert(binding.source)
          : binding.source;
        active = next;
      }
      for (const [source, material] of cache) material.emissiveIntensity = source.emissiveIntensity;
    },
    dispose() {
      for (const binding of bindings) binding.mesh.material = binding.source;
      for (const material of cache.values()) material.dispose();
      gradient.dispose();
    },
  };
}

export type ForestLook = ReturnType<typeof createForestAnimeLook>;
