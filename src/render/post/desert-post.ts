import type {PerspectiveCamera, Scene} from 'three';
import type {Node, UniformNode, WebGPURenderer} from 'three/webgpu';
import {mix, pass, smoothstep, uniform, vec3, vec4} from 'three/tsl';
import {HeatField} from '@/fx/heat/heat-field';
import {createLensWarp} from '@/fx/singularity/singularity-lens';
import {acesFilmic, luma709, toSRGB} from '../shaders/color';
import {viewDepthSampler} from '../shaders/depth';
import {PostChain, RenderPipeline, type LensUniforms, type PipelineContext, type PipelineQuality} from './render-pipeline';

/**
 * The natural desert look: one scene sample and a small color grade. No paper,
 * outlines, halftone, registration, grain or multi-tap comic glow.
 */
export class NaturalPipeline extends RenderPipeline {
  readonly look = 'natural';
  /** Warm bias, 0..1 (driven by the desert look's dial). */
  readonly warmth: UniformNode<number>;

  private readonly exposure: UniformNode<number>;
  private readonly near: UniformNode<number>;
  private readonly far: UniformNode<number>;
  private readonly aspect: UniformNode<number>;

  constructor(context: PipelineContext, quality: PipelineQuality) {
    super(context, quality);
    this.warmth = context.warmth ?? uniform(0);
    this.exposure = uniform(context.renderer.toneMappingExposure);
    this.near = uniform(context.camera.near);
    this.far = uniform(context.camera.far);
    this.aspect = uniform(context.camera.aspect);
  }

  render(): void {
    this.exposure.value = this.renderer.toneMappingExposure;
    this.near.value = this.camera.near;
    this.far.value = this.camera.far;
    this.aspect.value = this.camera.aspect;
    this.chain.render();
  }

  /** No glow taps here: only the MSAA samples change the graph. */
  protected override qualityKey({samples}: PipelineQuality): string {
    return String(samples);
  }

  protected createChain({samples}: PipelineQuality): PostChain {
    const {renderer, scene, camera, lens, exposure, near, far, aspect, warmth} = this;
    const scenePass = pass(scene, camera, {samples});
    const source = scenePass.getTextureNode();
    const depth = scenePass.getTextureNode('depth');
    const viewDepth = viewDepthSampler(depth, near, far);
    const heat = new HeatField(renderer, camera, viewDepth);
    const warp = lens ? createLensWarp(lens, {uv: heat.uv, aspect, viewDepth, far}) : null;
    const hdr = source.sample(warp?.uv ?? heat.uv).rgb;
    const radiance: Node = warp ? hdr.mul(vec3(1).sub(warp.dark)).add(warp.emission) : hdr;
    const mapped = toSRGB(acesFilmic(exposure, radiance)).toVar();
    const luma = luma709(mapped);
    const grade = mix(vec3(luma), mapped, 1.12).sub(0.5).mul(1.045).add(0.5);
    const balance = mix(vec3(0.97, 1.006, 1.025), vec3(1.025, 1.008, 0.975), smoothstep(0.15, 0.85, luma));
    // A slight warm bias, with the existing saturation/contrast left intact.
    const desertWarmth = mix(vec3(1), vec3(1.035, 1.016, 0.925), warmth);
    return new PostChain(renderer, scenePass, heat, vec4(grade.mul(balance).mul(desertWarmth).clamp(), 1));
  }
}

export interface DesertPostOptions {
  samples?: number;
  warmth?: UniformNode<number>;
  lens?: LensUniforms | null;
}
