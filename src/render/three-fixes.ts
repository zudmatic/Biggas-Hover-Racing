import {DynamicDrawUsage, InstancedInterleavedBuffer, type Material, type Scene} from 'three';
import {InstanceNode} from 'three/webgpu';
import {instancedBufferAttribute, instancedDynamicBufferAttribute, mat4} from 'three/tsl';
import type {NodeFrame, PassNode, WebGPURenderer} from 'three/webgpu';
import {isWebGPUBackend} from './game-renderer';

// Workarounds for three r182 issues. Each one documents why it is safe and
// when to remove it; re-check them on every three upgrade.

type ShadowPassMaterial = Material & {isShadowPassMaterial: true};

const isShadowPassMaterial = (material: Material | null): material is ShadowPassMaterial =>
  material !== null && (material as Partial<ShadowPassMaterial>).isShadowPassMaterial === true;

/** Shadow override materials patched per scene. */
const shadowOverrides = new WeakMap<Scene, Set<Material>>();

/**
 * Stops the shadow pass from bumping its override material's `version` once
 * per alpha-tested caster.
 *
 * Problem: `Renderer.renderObject()` copies every caster's `alphaTest` onto the
 * light's shared shadow material (`scene.overrideMaterial`, flagged
 * `isShadowPassMaterial`), and `Material.alphaTest`'s setter bumps `version`
 * whenever the value crosses 0. Desert Valley mixes alpha-tested vegetation
 * with opaque casters, so the override's version changes several times per
 * shadow pass and every shadow render object then recomputes
 * `RenderObject.getMaterialCacheKey()` (a regex over all material keys) on
 * every frame: ~8% of a Desert Valley frame's CPU time.
 *
 * Fix: the first time a shadow pass material is assigned to the scene's
 * override slot, that instance gets its own `alphaTest` accessor that stores
 * the value without bumping `version`. It's non-enumerable, so the material's
 * cache-key property list (own enumerable keys plus prototype getters) is unchanged.
 *
 * Why it's safe:
 * - Render objects are cached per (object, material, render context, lights).
 *   In a shadow pass the material is the light's override, so every caster
 *   has its own shadow render object.
 * - That render object's cache key and pipeline are built when it is created,
 *   right after `renderObject()` copied this caster's alphaTest onto the
 *   override. They capture its alpha test on/off state (alphaTest > 0 is a
 *   compile-time switch in `NodeMaterial.setupDiffuseColor`).
 * - A caster's own alphaTest doesn't change at runtime (glTF MASK materials
 *   set it at load), so that captured on/off state stays correct.
 * - The threshold itself is a uniform (`materialAlphaTest`) read from the
 *   override at draw time, after the per-caster copy; `alphaTest` is in the
 *   node material observer's refresh list, so it updates per render object.
 * If a caster ever toggles alphaTest across 0 at runtime, call
 * `refreshShadowCasters(scene)` once so the shadow render objects re-key.
 *
 * Remove when three stops copying `alphaTest` through the version-bumping
 * setter for shadow passes: without this patch,
 * `node .context/scripts/instrument.mjs` should then report ~0 `versionBumps`
 * for `NodeMaterial:ShadowMaterial` (772 per 240 frames on r182).
 */
export function preventShadowVersionChurn(scene: Scene): void {
  if (shadowOverrides.has(scene)) return;
  const patched = new Set<Material>();
  shadowOverrides.set(scene, patched);
  const patch = (material: Material | null) => {
    if (!isShadowPassMaterial(material) || patched.has(material)) return;
    patched.add(material);
    let alphaTest = material.alphaTest;
    Object.defineProperty(material, 'alphaTest', {
      configurable: true,
      enumerable: false,
      get: () => alphaTest,
      set: (value: number) => {
        alphaTest = value;
      },
    });
  };
  let override = scene.overrideMaterial;
  patch(override);
  Object.defineProperty(scene, 'overrideMaterial', {
    configurable: true,
    enumerable: true,
    get: () => override,
    set: (material: Material | null) => {
      patch(material);
      override = material;
    },
  });
}

/** Makes every shadow render object of `scene` re-check its cache key once (see preventShadowVersionChurn). */
export function refreshShadowCasters(scene: Scene): void {
  for (const material of shadowOverrides.get(scene) ?? []) material.needsUpdate = true;
}

interface GPUTextureLike {
  readonly width: number;
  readonly height: number;
  readonly mipLevelCount: number;
  createView(descriptor: {aspect: 'depth-only'; dimension: '2d'; mipLevelCount: number; baseMipLevel: number}): unknown;
}

interface BackendTextureData {
  texture?: GPUTextureLike;
  [view: string]: unknown;
}

interface BackendResources {
  get(object: object): BackendTextureData;
}

/**
 * Three 0.182's binding cache creates combined depth/stencil sample views
 * with aspect "all", which WebGPU rejects. Cache a depth-only sample view
 * after this pass creates/resizes its attachment. The render attachment
 * still uses both aspects. Remove when Three's binding utility handles it.
 */
export function useDepthOnlySampleView(renderer: WebGPURenderer, scenePass: PassNode): void {
  if (!isWebGPUBackend(renderer)) return;
  // @types/three doesn't declare the backend's resource map (Backend.get).
  const backend = renderer.backend as unknown as BackendResources;
  const renderPass = scenePass.updateBefore;
  let lastTexture: GPUTextureLike | undefined;
  scenePass.updateBefore = function (this: PassNode, frame: NodeFrame) {
    renderPass.call(this, frame);
    const depthTexture = this.renderTarget.depthTexture;
    if (!depthTexture) return;
    const data = backend.get(depthTexture);
    const gpu = data.texture;
    if (gpu && gpu !== lastTexture) {
      data[`view-${gpu.width}-${gpu.height}-${gpu.mipLevelCount}-0`] = gpu.createView({
        aspect: 'depth-only',
        dimension: '2d',
        mipLevelCount: gpu.mipLevelCount,
        baseMipLevel: 0,
      });
      lastTexture = gpu;
    }
  };
}

let instanceBuffersPatched = false;

/**
 * r182 assumes 64 KiB uniform blocks for <=1000 instance matrices, while
 * WebGL2 only guarantees 16 KiB (256 mat4s). Use Three's own attribute path
 * for larger blocks on that backend. Remove when InstanceNode checks limits.
 * The shared interleaved buffer keeps the original array and update lifecycle.
 */
export function usePortableInstanceBuffers(): void {
  if (instanceBuffersPatched) return;
  instanceBuffersPatched = true;
  const setup = InstanceNode.prototype.setup;
  InstanceNode.prototype.setup = function (builder) {
    const {instanceMatrix} = this;
    if (this.instanceMatrixNode === null && instanceMatrix.count > 256 && instanceMatrix.count <= 1000 && !builder.isAvailable('storageBuffer')) {
      const interleaved = new InstancedInterleavedBuffer(instanceMatrix.array, 16, 1);
      (this as InstanceNode & {buffer: InstancedInterleavedBuffer}).buffer = interleaved;
      const attribute = instanceMatrix.usage === DynamicDrawUsage ? instancedDynamicBufferAttribute : instancedBufferAttribute;
      this.instanceMatrixNode = mat4(
        attribute(interleaved, 'vec4', 16, 0),
        attribute(interleaved, 'vec4', 16, 4),
        attribute(interleaved, 'vec4', 16, 8),
        attribute(interleaved, 'vec4', 16, 12),
      );
    }
    return setup.call(this, builder);
  };
}
