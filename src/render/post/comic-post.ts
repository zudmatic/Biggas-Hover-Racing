import {Color, DepthStencilFormat, UnsignedInt248Type, Vector2, type ColorRepresentation, type PerspectiveCamera, type Scene} from 'three';
import type {Node, UniformNode, WebGPURenderer} from 'three/webgpu';
import {float, mix, pass, smoothstep, uniform, vec2, vec3, vec4} from 'three/tsl';
import {HeatField} from '@/fx/heat/heat-field';
import {createLensWarp} from '@/fx/singularity/singularity-lens';
import {RETRO_DEFAULTS as p} from '../materials/retro-style';
import {acesFilmic, luma601, srgbConstant, toSRGB, unpremultiply} from '../shaders/color';
import {perspectiveViewDepth, viewDepthSampler} from '../shaders/depth';
import {coverageFade, dotMask, rotateToGrid} from '../shaders/halftone';
import {interleavedGradientNoise} from '../shaders/noise';
import {useDepthOnlySampleView} from '../three-fixes';
import {PostChain, RenderPipeline, paperSource, type LensUniforms, type PipelineContext, type PipelineQuality} from './render-pipeline';

/**
 * Opaque circuit counterpart of retro-print.ts: linear HDR -> ACES -> sRGB
 * grading, warm glow, colored depth outlines, registration and static ink grain.
 * `lens` is set only for singularity ships; without it the graph is unchanged.
 */
export class ComicPipeline extends RenderPipeline {
  readonly look = 'comic';
  /** Outline ink amount (the playground's Contornos toggle). */
  readonly outline = uniform(1);
  /** Comic grading amount (the playground's Color cómic toggle). */
  readonly grading = uniform(1);

  private readonly resolution = uniform(new Vector2());
  private readonly pixelRatio = uniform(1);
  private readonly near: UniformNode<number>;
  private readonly far: UniformNode<number>;
  /** World size of one pixel at unit view depth. */
  private readonly pixelWorld = uniform(1);
  private readonly exposure = uniform(1.05);
  private readonly paper = uniform(new Color());
  private readonly size = new Vector2();

  constructor(context: PipelineContext, quality: PipelineQuality) {
    super(context, quality);
    this.near = uniform(context.camera.near);
    this.far = uniform(context.camera.far);
  }

  render(background?: ColorRepresentation): void {
    const {renderer, camera, scene, size} = this;
    renderer.getDrawingBufferSize(size);
    this.resolution.value.copy(size);
    this.pixelRatio.value = renderer.getPixelRatio();
    this.near.value = camera.near;
    this.far.value = camera.far;
    this.pixelWorld.value = (2 * Math.tan((camera.fov * Math.PI) / 360)) / camera.zoom / size.y;
    this.exposure.value = renderer.toneMappingExposure;
    // The paper is the pass's own background; the scene renders over transparent black.
    const sceneBackground = scene.background;
    this.paper.value.set(paperSource(background, sceneBackground)).convertLinearToSRGB();
    scene.background = null;
    try {
      this.chain.render();
    } finally {
      scene.background = sceneBackground;
    }
  }

  protected createChain({samples, glowSamples}: PipelineQuality): PostChain {
    const {renderer, scene, camera, lens, resolution, pixelRatio, near, far, pixelWorld, exposure, paper, outline, grading, comic} = this;
    const scenePass = pass(scene, camera, {samples, stencilBuffer: true});
    const source = scenePass.getTextureNode();
    const depth = scenePass.getTextureNode('depth');
    // Bluleet's paper edge belongs outside his silhouette, never over his eyes
    // or jacket. A shared depth/stencil attachment supports that mask on both backends.
    const depthTexture = scenePass.renderTarget.depthTexture;
    if (depthTexture) {
      depthTexture.format = DepthStencilFormat;
      depthTexture.type = UnsignedInt248Type;
    }
    useDepthOnlySampleView(renderer, scenePass);

    const viewDepth = viewDepthSampler(depth, near, far);
    const heat = new HeatField(renderer, camera, viewDepth);
    const warp = lens ? createLensWarp(lens, {uv: heat.uv, aspect: resolution.x.div(resolution.y), viewDepth, far}) : null;
    const uv: Node = warp?.uv ?? heat.uv;
    const texel = vec2(1).div(resolution);
    const fragment = uv.mul(resolution);

    // 1. Outline: depth Laplacian over whole-texel taps, normalized by the tap
    // distance in world units (a dimensionless slope change, independent of dpr).
    const width = float(p.outlineWidth).mul(pixelRatio).add(0.5).floor().max(1);
    const printDepth = (q: Node) =>
      perspectiveViewDepth(depth.sample(q.clamp(0, 1)).r, near, far)
        .sub(near)
        .div(far.sub(near));
    const d0 = printDepth(uv);
    const left = printDepth(uv.sub(vec2(width, 0).mul(texel)));
    const right = printDepth(uv.add(vec2(width, 0).mul(texel)));
    const down = printDepth(uv.sub(vec2(0, width).mul(texel)));
    const up = printDepth(uv.add(vec2(0, width).mul(texel)));
    const worldPixel = pixelWorld.mul(near.add(d0.mul(far.sub(near))).max(near));
    const bend = d0.mul(4).sub(left).sub(right).sub(down).sub(up).abs().mul(far.sub(near)).div(width.mul(worldPixel).max(0.00001));
    const edge = smoothstep(p.outlineThreshold, p.outlineThreshold * 1.8, bend).mul(
      mix(float(p.outlineCrease), float(1), smoothstep(3, 10, bend)),
    );

    // The singularity's lens darkens and emits on top of the scene radiance.
    const absorb = warp ? float(1).sub(warp.dark) : null;
    const lensed = (hdr: Node): Node => (warp && absorb ? hdr.mul(absorb).add(warp.emission) : hdr);
    const rimPaper: Node = warp && absorb ? paper.mul(absorb).add(toSRGB(acesFilmic(exposure, warp.emission))) : paper;

    // 3. Develop: ACES, saturation x1.12, then comic grading and split tone, laid on the paper.
    const develop = (q: Node): Node => {
      const sample = source.sample(q.clamp(0, 1));
      let c: Node = toSRGB(acesFilmic(exposure, lensed(unpremultiply(sample))));
      c = mix(vec3(luma601(c)), c, 1.12).clamp();
      const l = luma601(c);
      let graded: Node = mix(vec3(l), c, p.gradeSaturation).sub(0.5).mul(p.gradeContrast).add(0.5);
      graded = graded
        .mul(mix(vec3(1), mix(srgbConstant(p.splitShadow), srgbConstant(p.splitLight), smoothstep(0.15, 0.85, l)), p.splitAmount))
        .clamp();
      return mix(rimPaper, mix(c, graded, grading), sample.a);
    };

    // 4. Glow: highlights spill warm light; the same taps measure open paper
    // (for the paper flare) and the silhouette's proximity (for the halo dots).
    let glow: Node = vec3(0);
    let open: Node = float(0);
    let proximity: Node = source.a;
    for (let i = 0; i < glowSamples; i++) {
      const angle = i * 2.3998;
      const axis = vec2(Math.cos(angle), Math.sin(angle));
      const sample = source.sample(
        uv
          .add(
            axis
              .mul(3 + (i * 13.2) / (glowSamples - 1))
              .mul(pixelRatio)
              .mul(texel),
          )
          .clamp(0, 1),
      );
      const toned = acesFilmic(exposure, unpremultiply(sample)).rgb;
      glow = glow.add(toned.sub(0.8).max(0).mul(sample.a));
      open = open.add(float(1).sub(sample.a));
      proximity = proximity.add(
        source.sample(
          uv
            .add(
              axis
                .mul((0.15 + (0.85 * i) / (glowSamples - 1)) * p.bgReach)
                .mul(pixelRatio)
                .mul(texel),
            )
            .clamp(0, 1),
        ).a,
      );
    }
    glow = toSRGB(glow.div(glowSamples))
      .mul(vec3(1, 0.86, 0.66))
      .mul(0.17);

    // 2. Misregistration: each channel developed off register, more at edges.
    const shift = edge.mul(p.misregEdge).add(p.misreg).mul(pixelRatio);
    let color: Node = vec3(
      develop(uv.add(vec2(1, 0.35).mul(shift).mul(texel))).r,
      develop(uv.add(vec2(-0.7, 0.5).mul(shift).mul(texel))).g,
      develop(uv.add(vec2(0.15, -1).mul(shift).mul(texel))).b,
    );
    color = mix(color, paper.mul(vec3(1, 0.97, 0.93)), open.div(glowSamples).mul(0.06))
      .add(glow)
      .min(1);

    // 5. Paper: halftone dots near the geometry, fading with its distance.
    const coverage = proximity
      .div(glowSamples + 1)
      .mul(2.2)
      .clamp()
      .pow(1.5)
      .mul(p.bgCoverage)
      .mul(float(1).sub(source.a));
    const cell = float(p.bgPitch).mul(pixelRatio);
    const radius = coverage.div(Math.PI).sqrt();
    const aa = float(1).div(cell).max(0.03);
    const dots = dotMask(rotateToGrid(fragment, p.bgAngle).div(cell), radius, aa).mul(coverageFade(coverage));
    color = mix(color, srgbConstant(p.bgInk), dots.mul(p.bgOpacity).mul(float(1).sub(source.a)));

    // 6. Outline ink. Pick the nearest depth tap for the hue of the outline, as the GLSL pass does.
    let nearest: Node = vec2(0);
    let nearestDepth: Node = d0;
    const taps: [Node, Node][] = [
      [left, vec2(width.negate(), 0)],
      [right, vec2(width, 0)],
      [down, vec2(0, width.negate())],
      [up, vec2(0, width)],
    ];
    for (const [tapDepth, offset] of taps) {
      nearest = mix(nearest, offset, tapDepth.lessThan(nearestDepth));
      nearestDepth = nearestDepth.min(tapDepth);
    }
    const raw = unpremultiply(source.sample(uv.add(nearest.mul(texel)).clamp(0, 1)));
    const picked = toSRGB(raw.div(raw.add(1)))
      .mul(1.5)
      .clamp();
    const ink = srgbConstant(p.outlineInk).mul(mix(vec3(1), picked, p.outlineTint));
    color = mix(color, ink, edge.mul(p.outlineOpacity).mul(outline));

    // 7. Static grain on the ink.
    const grain = interleavedGradientNoise(fragment).sub(0.5);
    color = color.mul(grain.mul(float(p.inkGrain).mul(source.a.max(edge))).add(1)).clamp();

    // `comic` 0 is the plain developed frame on the same paper.
    const base = source.sample(uv);
    const plain = mix(rimPaper, toSRGB(acesFilmic(exposure, lensed(unpremultiply(base)))), base.a);
    return new PostChain(renderer, scenePass, heat, vec4(mix(plain, color, comic), 1));
  }
}

export interface ComicPostOptions {
  glowSamples?: number;
  samples?: number;
  lens?: LensUniforms | null;
}
