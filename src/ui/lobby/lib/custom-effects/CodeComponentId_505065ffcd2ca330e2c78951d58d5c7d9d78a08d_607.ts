// @ts-nocheck

// Property metadata is only used in Figma Design, so this is a no-op.
function defineProperties(
  _component: unknown,
  _properties: unknown,
): void {}

export default function Effect() { }
function finiteNumber(value, fallback) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}
function numberParam(params, name, fallback) {
    return finiteNumber(params[name], fallback);
}
function pointParam(params, name, fallback) {
    const value = (params[name] || {});
    return [
        finiteNumber(value.x, fallback[0]),
        finiteNumber(value.y, fallback[1]),
    ];
}
function qualityParam(params) {
    return Math.max(0, Math.min(2, Math.round(numberParam(params, "quality", 1))));
}
function chromaticModeParam(params) {
    return Math.max(0, Math.min(2, Math.round(Number(params["chromaticMode"] ?? 0))));
}
function aberrationBucketForStrength(aberrationStrength) {
    if (aberrationStrength <= 0.001)
        return 0;
    if (aberrationStrength < 0.08)
        return 1;
    if (aberrationStrength < 0.18)
        return 2;
    if (aberrationStrength < 0.35)
        return 3;
    return 4;
}
function kernelScaleForAberrationBucket(aberrationBucket) {
    if (aberrationBucket <= 0)
        return 0.0;
    if (aberrationBucket === 1)
        return 0.25;
    if (aberrationBucket === 2)
        return 0.5;
    if (aberrationBucket === 3)
        return 0.75;
    return 1.0;
}
function kernelDataForQuality(quality, aberrationBucket) {
    const baseKernelSize = 64.0 / (quality + 1.0);
    const kernelScale = kernelScaleForAberrationBucket(aberrationBucket);
    const kernelSize = kernelScale === 0.0 ? 3.0 : Math.max(3.0, baseKernelSize * kernelScale);
    const kernelTaps = Math.ceil(kernelSize);
    const invKernelSize = 1.0 / Math.max(kernelSize - 1.0, 1.0);
    let weightSum = 0.0;
    for (let i = 0; i < kernelTaps; i += 1) {
        const fi = i * invKernelSize - 0.5;
        weightSum += 1.0 - Math.abs(fi * 2.0);
    }
    return { kernelTaps, invKernelSize, weightSum };
}
function shaderForMode(chromaticMode) {
    if (chromaticMode === 1) {
        return `
      // Longitudinal: same distortion amount, positional offset along radial direction.
      redSample   = sampleInputPremultLinearZero(lensDistort(tapPos + radialDir * (fi + 0.5) * chroma * u.radiusData.x * 0.15, amount));
      greenSample = sampleInputPremultLinearZero(lensDistort(tapPos + radialDir * fi * chroma * u.radiusData.x * 0.15, amount));
      blueSample  = sampleInputPremultLinearZero(lensDistort(tapPos + radialDir * (fi - 0.5) * chroma * u.radiusData.x * 0.15, amount));
`;
    }
    if (chromaticMode === 2) {
        return `
      // Anamorphic: chromatic tap offset along X axis only.
      redSample   = sampleInputPremultLinearZero(lensDistort(tapPos + vec2f((fi + 0.5) * chroma * u.frameData.y * 0.15, 0.0), amount));
      greenSample = sampleInputPremultLinearZero(lensDistort(tapPos + vec2f(fi * chroma * u.frameData.y * 0.15, 0.0), amount));
      blueSample  = sampleInputPremultLinearZero(lensDistort(tapPos + vec2f((fi - 0.5) * chroma * u.frameData.y * 0.15, 0.0), amount));
`;
    }
    return `
      // Lateral (default): chromatic split via distortion amount variation.
      redSample   = getDistortedTex2D(tapPos, amount + (fi + 0.5) * chroma);
      greenSample = getDistortedTex2D(tapPos, amount + fi * chroma);
      blueSample  = getDistortedTex2D(tapPos, amount + (fi - 0.5) * chroma);
`;
}
function buildShaderCode(quality, chromaticMode, aberrationBucket) {
    const kernel = kernelDataForQuality(quality, aberrationBucket);
    const radialSetup = chromaticMode === 1
        ? `
    let center = u.centerPos.xy;
    let radialVec = tapPos - center;
    let radialLen = length(radialVec);
    let radialDir = select(vec2f(1.0, 0.0), radialVec / radialLen, radialLen >= 0.001);
`
        : "";
    const radialPlaceholder = "    // __RADIAL_SETUP__\n";
    const modePlaceholder = `      // __SHADER_FOR_MODE_START__
      // Lateral defaults keep the static WGSL template valid before substitution.
      redSample   = getDistortedTex2D(tapPos, amount + (fi + 0.5) * chroma);
      greenSample = getDistortedTex2D(tapPos, amount + fi * chroma);
      blueSample  = getDistortedTex2D(tapPos, amount + (fi - 0.5) * chroma);
      // __SHADER_FOR_MODE_END__
`;
    const shader = `
diagnostic(off,derivative_uniformity);
struct Uniforms {
  frameData:  vec4f, // x=time, y=width, z=height, w=quality
  distortion: vec4f, // x=distortionStrength, y=aberrationStrength, z=chromaticMode(0=lateral,1=longitudinal,2=anamorphic), w=unused
  centerPos:  vec4f, // xy=centre in pixel space, zw=unused
  radiusData: vec4f, // x=radius (half-diagonal), yzw=unused
  spreadData: vec4f, // x=sampleSpread, y=sampleCount, zw=unused
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var inputTex: texture_2d<f32>;

const KERNEL_TAPS: i32 = 1;
const INV_KERNEL_SIZE: f32 = 1.000000000;
const KERNEL_WEIGHT_SUM: f32 = 1.000000000;
const ABERRATION_BUCKET: i32 = 0;
const SAMPLE_TAPS: i32 = 4;

// Halton(2,3)-derived 4-tap jitter offsets (normalized to [-0.5, 0.5])
const JITTER: array<vec2f, 4> = array<vec2f, 4>(
  vec2f( 0.0,       0.0      ),
  vec2f( 0.5,      -0.333333 ),
  vec2f(-0.25,      0.333333 ),
  vec2f( 0.25,     -0.111111 )  // was 0.777778 -> wrap to -0.111111
);

struct VsIn {
  @location(0) pos: vec2f,
  @location(1) uv: vec2f,
};
struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

fn sampleInputPremultLinearZero(localPos: vec2f) -> vec4f {
  let dims = u.frameData.yz;
  let uv = localPos / dims;
  let inBounds = uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0;
  let clamped = clamp(uv, vec2f(0.0), vec2f(1.0));
  let col = textureSampleLevel(inputTex, samp, clamped, 0.0);
  return select(vec4f(0.0), col, inBounds);
}

fn lensDistort(localPos: vec2f, amount: f32) -> vec2f {
  let center = u.centerPos.xy;
  let centeredPos = localPos - center;
  let normPos = centeredPos / u.radiusData.x;
  let dist2 = dot(normPos, normPos);
  let distortion = 1.0 + amount * (dist2 + dist2 * dist2);
  return centeredPos * distortion + center;
}

fn getDistortedTex2D(localPos: vec2f, amount: f32) -> vec4f {
  let p = lensDistort(localPos, amount);
  return sampleInputPremultLinearZero(p);
}

@vertex fn vs_main(in: VsIn) -> VsOut {
  var out: VsOut;
  out.position = vec4f(in.pos, 0.0, 1.0);
  out.uv = in.uv;
  return out;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let dims = max(u.frameData.yz, vec2f(1.0));
  let localPos = uv * dims;

  let amount = u.distortion.x;
  let chromaParam = u.distortion.y;
  let chroma = (1.0 + abs(amount)) * chromaParam;
  let spread = u.spreadData.x;

  if (ABERRATION_BUCKET == 0) {
    var fastAccumColor: vec4f = vec4f(0.0);

    for (var j: i32 = 0; j < SAMPLE_TAPS; j += 1) {
      let tapPos = localPos + JITTER[j] * spread;
      let sample = getDistortedTex2D(tapPos, amount);
      let r_s = select(1.0, sample.r / max(0.001, sample.a), sample.a > 0.01);
      let g_s = select(1.0, sample.g / max(0.001, sample.a), sample.a > 0.01);
      let b_s = select(1.0, sample.b / max(0.001, sample.a), sample.a > 0.01);
      fastAccumColor += vec4f(r_s * sample.a, g_s * sample.a, b_s * sample.a, sample.a);
    }

    return fastAccumColor / f32(SAMPLE_TAPS);
  }

  var accumColor: vec4f = vec4f(0.0);

  for (var j: i32 = 0; j < SAMPLE_TAPS; j += 1) {
    let tapPos = localPos + JITTER[j] * spread;
    // __RADIAL_SETUP__
    var tapColor = vec4f(0.0, 0.0, 0.0, 0.0);

    for (var i: i32 = 0; i < KERNEL_TAPS; i += 1) {
      let fi = f32(i) * INV_KERNEL_SIZE - 0.5;
      let window = 1.0 - abs(fi * 2.0);

      var redSample:   vec4f;
      var greenSample: vec4f;
      var blueSample:  vec4f;
      // __SHADER_FOR_MODE_START__
      // Lateral defaults keep the static WGSL template valid before substitution.
      redSample   = getDistortedTex2D(tapPos, amount + (fi + 0.5) * chroma);
      greenSample = getDistortedTex2D(tapPos, amount + fi * chroma);
      blueSample  = getDistortedTex2D(tapPos, amount + (fi - 0.5) * chroma);
      // __SHADER_FOR_MODE_END__
      let r_s = select(1.0, redSample.r   / max(0.001, redSample.a),   redSample.a   > 0.01);
      let g_s = select(1.0, greenSample.g / max(0.001, greenSample.a), greenSample.a > 0.01);
      let b_s = select(1.0, blueSample.b  / max(0.001, blueSample.a),  blueSample.a  > 0.01);
      let alpha = max(max(redSample.a, greenSample.a), blueSample.a);
      tapColor += vec4f(r_s * alpha, g_s * alpha, b_s * alpha, alpha) * window;
    }

    tapColor = tapColor / max(KERNEL_WEIGHT_SUM, 0.0001);
    accumColor += tapColor;
  }

  // Average premultiplied accumulation - output is premultiplied
  return accumColor / f32(SAMPLE_TAPS);
}
`;
    return shader
        .replace("const KERNEL_TAPS: i32 = 1;", `const KERNEL_TAPS: i32 = ${kernel.kernelTaps};`)
        .replace("const INV_KERNEL_SIZE: f32 = 1.000000000;", `const INV_KERNEL_SIZE: f32 = ${kernel.invKernelSize.toFixed(9)};`)
        .replace("const KERNEL_WEIGHT_SUM: f32 = 1.000000000;", `const KERNEL_WEIGHT_SUM: f32 = ${kernel.weightSum.toFixed(9)};`)
        .replace("const ABERRATION_BUCKET: i32 = 0;", `const ABERRATION_BUCKET: i32 = ${aberrationBucket};`)
        .replace(radialPlaceholder, radialSetup)
        .replace(modePlaceholder, shaderForMode(chromaticMode));
}
export function setup(device, frame) {
    frame.state.pipelineCache = {};
    frame.state.quad = device.createBuffer({
        size: 6 * 4 * 4,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true,
    });
    new Float32Array(frame.state.quad.getMappedRange()).set([
        -1, -1, 0, 1,
        1, -1, 1, 1,
        -1, 1, 0, 0,
        -1, 1, 0, 0,
        1, -1, 1, 1,
        1, 1, 1, 0,
    ]);
    frame.state.quad.unmap();
    frame.state.uniformBuf = device.createBuffer({
        size: 80,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    frame.state.sampler = device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
    });
    frame.state.placeholder = device.createTexture({
        size: [1, 1, 1],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture({ texture: frame.state.placeholder }, new Uint8Array([0, 0, 0, 0]), { bytesPerRow: 4 }, { width: 1, height: 1, depthOrArrayLayers: 1 });
}
export function render(device, frame) {
    const params = frame.params || {};
    const output = frame.output || {};
    const width = Math.max(1, finiteNumber(output.width, 1));
    const height = Math.max(1, finiteNumber(output.height, 1));
    const radius = Math.sqrt(width * width + height * height) * 0.5;
    const distortionStrength = numberParam(params, "distortionStrength", 0.5);
    const aberrationStrength = numberParam(params, "aberrationStrength", 0.2);
    const quality = qualityParam(params);
    const aberrationBucket = aberrationBucketForStrength(aberrationStrength);
    const centrePercent = pointParam(params, "centre", [50, 50]);
    const centreX = centrePercent[0] / 100.0 * width;
    const centreY = centrePercent[1] / 100.0 * height;
    const sampleSpread = 1.4;
    const sampleCount = 4;
    const chromaticModeIndex = chromaticModeParam(params);
    device.queue.writeBuffer(frame.state.uniformBuf, 0, new Float32Array([
        0, width, height, quality,
        distortionStrength, aberrationStrength, chromaticModeIndex, 0,
        centreX, centreY, 0, 0,
        radius, 0, 0, 0,
        sampleSpread, sampleCount, 0, 0,
    ]));
    const inputView = frame.input != null
        ? frame.input.createView()
        : frame.state.placeholder.createView();
    const outputFormat = frame.output.format;
    const pipelineKey = `${outputFormat}:q${quality}:mode${chromaticModeIndex}:ab${aberrationBucket}`;
    let cached = frame.state.pipelineCache[pipelineKey];
    if (cached == null) {
        const module = device.createShaderModule({
            code: buildShaderCode(quality, chromaticModeIndex, aberrationBucket),
        });
        cached = {
            module,
            pipeline: device.createRenderPipeline({
                layout: 'auto',
                vertex: {
                    module,
                    entryPoint: 'vs_main',
                    buffers: [{
                            arrayStride: 16,
                            attributes: [
                                { shaderLocation: 0, format: 'float32x2', offset: 0 },
                                { shaderLocation: 1, format: 'float32x2', offset: 8 },
                            ],
                        }],
                },
                fragment: {
                    module,
                    entryPoint: 'fs_main',
                    targets: [{ format: outputFormat }],
                },
                primitive: { topology: 'triangle-list' },
            }),
        };
        frame.state.pipelineCache[pipelineKey] = cached;
    }
    const bindGroup = device.createBindGroup({
        layout: cached.pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: frame.state.uniformBuf } },
            { binding: 1, resource: frame.state.sampler },
            { binding: 2, resource: inputView },
        ],
    });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
        colorAttachments: [{
                view: frame.output.createView(),
                loadOp: 'clear',
                clearValue: { r: 0, g: 0, b: 0, a: 0 },
                storeOp: 'store',
            }],
    });
    pass.setPipeline(cached.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, frame.state.quad);
    pass.draw(6);
    pass.end();
    device.queue.submit([encoder.finish()]);
}
defineProperties(Effect, {
    "distortionStrength": {
        type: "number",
        label: "Distortion",
        defaultValue: 0.5,
        control: "slider",
        min: 0,
        max: 1,
        step: 0.01,
    },
    "aberrationStrength": {
        type: "number",
        label: "Aberration",
        defaultValue: 0.2,
        control: "slider",
        min: 0,
        max: 1,
        step: 0.01,
    },
    "centre": {
        type: "point",
        label: "Center point",
        defaultValue: { x: 50, y: 50 },
        control: "point",
        mode: "canvas_and_ui",
        unit: "%",
    },
    "chromaticMode": {
        type: "number",
        label: "Mode",
        defaultValue: 0,
        control: "select",
        options: [
            { value: 0, label: "Lateral" },
            { value: 1, label: "Longitudinal" },
            { value: 2, label: "Anamorphic" },
        ],
    },
    "quality": {
        type: "number",
        label: "Quality",
        defaultValue: 1,
        control: "select",
        options: [
            { value: 2, label: "Low" },
            { value: 1, label: "Medium" },
            { value: 0, label: "High" },
        ],
    },
});

export const manifest = {
  "name": "Lens distortion",
  "version": 2,
  "isAnimated": false,
  "usesMouse": false
}
