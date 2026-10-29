import {Vector2} from 'three';
import type {Node} from 'three/webgpu';
import {float, max, mix, pass, smoothstep, uniform, vec2, vec3, vec4} from 'three/tsl';
import {HeatField} from '@/fx/heat/heat-field';
import {createLensWarp} from '@/fx/singularity/singularity-lens';
import {acesFilmic, luma709, toSRGB} from '@/render/shaders/color';
import {viewDepthSampler} from '@/render/shaders/depth';
import {PostChain, RenderPipeline, type PipelineContext, type PipelineQuality} from '@/render/post/render-pipeline';

/** Forest-only anime finish: clean colour and restrained ink on nearby silhouettes.
 * Four neighbour depth reads in the existing output pass, no extra scene/normal pass.
 */
export class ForestAnimePipeline extends RenderPipeline {
  readonly look = 'forest-anime';
  private readonly exposure;
  private readonly near;
  private readonly far;
  private readonly aspect;
  private readonly pixel = uniform(new Vector2(1, 1));
  private readonly drawingSize = new Vector2();

  constructor(context: PipelineContext, quality: PipelineQuality) {
    super(context, quality);
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
    this.renderer.getDrawingBufferSize(this.drawingSize);
    this.pixel.value.set(1 / this.drawingSize.x, 1 / this.drawingSize.y);
    this.chain.render();
  }
  protected override qualityKey({samples}: PipelineQuality): string {return String(samples);}
  protected createChain({samples}: PipelineQuality): PostChain {
    const {renderer, scene, camera, lens, exposure, near, far, aspect, pixel} = this;
    const scenePass = pass(scene, camera, {samples});
    const source = scenePass.getTextureNode(), depth = scenePass.getTextureNode('depth');
    const viewDepth = viewDepthSampler(depth, near, far);
    const heat = new HeatField(renderer, camera, viewDepth);
    const warp = lens ? createLensWarp(lens, {uv: heat.uv, aspect, viewDepth, far}) : null;
    const sampleUV = warp?.uv ?? heat.uv;
    const hdr = source.sample(sampleUV).rgb;
    const radiance = warp ? hdr.mul(vec3(1).sub(warp.dark)).add(warp.emission) : hdr;
    const mapped = toSRGB(acesFilmic(exposure, radiance)).toVar();
    const luma = luma709(mapped);
    const grade = mix(vec3(luma), mapped, 1.08).sub(.5).mul(1.035).add(.5);
    // One-sided ink stays on the foreground surface, never on the sky/panorama.
    const center = viewDepth(sampleUV);
    let edge: Node = float(0);
    for (const offset of [vec2(pixel.x, 0), vec2(pixel.x.negate(), 0), vec2(0, pixel.y), vec2(0, pixel.y.negate())]) {
      edge = max(edge, viewDepth(sampleUV.add(offset)).sub(center).div(center.max(2)));
    }
    const ink = smoothstep(.025, .10, edge).mul(smoothstep(90, 260, center).oneMinus()).mul(.20);
    const color = mix(grade, grade.mul(vec3(.32, .43, .48)), ink).clamp();
    return new PostChain(renderer, scenePass, heat, vec4(color, 1));
  }
}
