import {Group} from 'three';
import type {WebGPURenderer} from 'three/webgpu';
import {VFXParticleSystem, needsRecreation, updateUniformsPartial, type VFXParticleSystemOptions} from 'core-vfx';

export {Appearance, Blending} from 'core-vfx';
export type ParticleOptions = VFXParticleSystemOptions;

/** Props that need a new curve texture, so a rebuilt system. */
const CURVE_KEYS = ['fadeSizeCurve', 'fadeOpacityCurve', 'velocityCurve', 'rotationSpeedCurve', 'curveTexturePath'] as const;

/**
 * GPU particle system holder, ported from vanilla-vfx's `VFXParticles` (whose
 * dist bundles a second copy of three.js). Same behaviour minus the debug
 * panel and auto-emission: owners spawn explicitly and step `system.update()`.
 */
export class VFXParticles {
  /** Holds the system's render object; add this to the scene. */
  readonly object3D = new Group();
  system: VFXParticleSystem | null = null;
  isEmitting = true;
  private config: ParticleOptions;
  private initialized = false;
  private generation = 0;

  constructor(
    private readonly renderer: WebGPURenderer,
    options: ParticleOptions = {},
  ) {
    this.config = {...options};
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await this.recreateSystem();
    this.initialized = this.system !== null;
  }

  dispose(): void {
    ++this.generation;
    if (this.system) {
      this.object3D.remove(this.system.renderObject);
      this.system.dispose();
      this.system = null;
    }
    this.initialized = false;
  }

  spawn(x = 0, y = 0, z = 0, count?: number, overrides?: Record<string, unknown> | null): void {
    if (!this.system) return;
    this.system.spawn(x, y, z, count ?? this.system.normalizedProps.emitCount, overrides ?? null);
  }

  start(): void {
    this.isEmitting = true;
    this.system?.start();
  }

  stop(): void {
    this.isEmitting = false;
    this.system?.stop();
  }

  clear(): void {
    this.system?.clear();
  }

  /** Live prop changes: uniforms when possible, a rebuilt system when the shader features change. */
  setProps(newValues: Partial<ParticleOptions>): void {
    this.config = {...this.config, ...newValues};
    if (this.system && needsRecreation(this.system.features, newValues, this.config)) {
      void this.recreateSystem();
      return;
    }
    if (CURVE_KEYS.some((key) => key in newValues)) {
      void this.recreateSystem();
      return;
    }
    this.applyUniformUpdates(newValues);
  }

  private async recreateSystem(): Promise<void> {
    const generation = ++this.generation;
    const old = this.system;
    this.system = null;
    if (old) {
      this.object3D.remove(old.renderObject);
      old.dispose();
    }
    const system = new VFXParticleSystem(this.renderer, this.config);
    await system.init();
    if (generation !== this.generation) {
      system.dispose();
      return;
    }
    this.system = system;
    this.object3D.add(system.renderObject);
  }

  private applyUniformUpdates(changes: Partial<ParticleOptions>): void {
    const {system} = this;
    if (!system) return;
    let values = changes;
    if ('colorStart' in values && values.colorStart && !this.config.colorEnd) values = {...values, colorEnd: null};
    if ('colorEnd' in values && !values.colorEnd)
      values = {...values, colorStart: values.colorStart ?? this.config.colorStart ?? ['#ffffff']};
    updateUniformsPartial(system.uniforms, values);
    if (values.position) system.setPosition(values.position);
    if ('delay' in values) system.setDelay(values.delay ?? 0);
    if ('emitCount' in values) system.setEmitCount(values.emitCount ?? 1);
    if ('sortParticles' in values) system.setSortEnabled(!!values.sortParticles);
    if ('sortFrameInterval' in values) system.setSortFrameInterval(values.sortFrameInterval ?? null);
    if (values.autoStart !== undefined) {
      this.isEmitting = values.autoStart;
      if (this.isEmitting) system.start();
      else system.stop();
    }
    if (system.material && values.blending !== undefined) {
      system.material.blending = values.blending;
      system.material.needsUpdate = true;
    }
  }
}
