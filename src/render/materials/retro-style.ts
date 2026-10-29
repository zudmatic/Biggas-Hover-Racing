import {Color, Vector2, Vector3, Vector4, type ColorRepresentation, type IUniform, type Material} from 'three';
import {PAPER_COLOR} from './paper';

// The "printed comic" look shared by every retro() material: one parameter set,
// one set of shared uniforms, and a registry of live materials so the compile-time
// switch (pattern space) can recompile them together. The shader
// side lives in surface-halftone.ts; retro-material.ts wires the two together.

export const RETRO_LOOKS = ['normal', 'comic', 'mono'] as const;
export type RetroLook = (typeof RETRO_LOOKS)[number];

export const RETRO_VIEWS = ['final', 'lightness', 'highlight band', 'shadow band', 'highlight dots', 'hatching', 'rim'] as const;
export type RetroView = (typeof RETRO_VIEWS)[number];

/** Where the ink lives: the drawing buffer's pixels, or the surface (triplanar, rest pose). */
export type RetroSpace = 'screen' | 'object';

// "Day" values, tuned by eye in the ?debug panel (object space); the presets
// below override a few of them.
const DEFAULTS = {
  strength: 1.03,
  // 0: lightness is normalized against the current light (night reads like day);
  // 1: against full daylight (night falls into the shadow band).
  nightKeep: 0.78,
  // Tonal bands on perceptual lightness (sqrt of lit luminance / paper white).
  // Two bands: shadow below bandShadow, highlight above bandLight. Where the edges
  // cross (bandLight < bandShadow) both inks apply together; with a gap between
  // them (bandLight > bandShadow) that middle zone is flat and carries no ink.
  bandShadow: 0.415,
  bandLight: 0.375,
  bandSoft: 0.055,
  posterAmount: 1,
  posterSteps: 12,
  posterSoft: 0.5,
  tintAmount: 0.78,
  shadowTint: '#b7ebf5',
  lightTint: '#ffdfb3',
  // Highlight dots (and rim dots, which share their grid): light ink, added.
  // Pitch is in CSS px; in object space it is measured at the default scene scale (~1440 px wide).
  hiOn: true,
  hiPitch: 4.5,
  hiAngle: 48,
  hiOpacity: 0.18,
  hiCoverage: 0.3,
  hiInk: '#ffeed1',
  hiGain: 0.94,
  rimOn: false,
  rimCoverage: 0.6,
  rimPower: 1.25,
  rimStart: 0.52,
  // Shadow hatching; the second set crosses the first only in the deepest shadow.
  hatchOn: true,
  hatchPitch: 2.5,
  hatchAngle: 49,
  hatchOpacity: 0.64,
  hatchCoverage: 0.23,
  hatchSecond: 0.6,
  hatchTint: '#5a4a9a',
  grain: 1.27,
  // Which look the page shows: 'normal' (the print as it was before the comic shader),
  // 'comic' (everything below) or 'mono' (the comic in black & white).
  look: 'comic' as RetroLook,
  // Black & white (look 'mono'): the finished frame in grays (the Day render, detail kept).
  // Lowering monoDetail toward 0 turns it into a flat two-tone drawing like the highlight
  // band view; monoPattern is the strength of that mode's black dots and light hatching,
  // and monoShadow sinks the shadow band toward black while the lights keep their detail.
  monoDetail: 1,
  monoPattern: 0.6,
  monoShadow: 0.4,
  space: 'object' as RetroSpace,
  // Post (retro-print.ts). Outline: depth-based, thin, drawn in a colored ink.
  outlineOn: true,
  outlineWidth: 0.5,
  outlineThreshold: 1.5,
  outlineCrease: 0.24,
  outlineOpacity: 0.43,
  outlineInk: '#363636',
  outlineTint: 0.19,
  // Color misregistration: each channel is sampled off register (CSS px), more at
  // edges. The edge part is independent of the outline's opacity.
  misreg: 0,
  misregEdge: 0.45,
  // Comic grading on top of the filmic curve's x1.12 saturation, plus a split tone.
  gradeSaturation: 1.27,
  gradeContrast: 1.06,
  splitAmount: 0.25,
  splitShadow: '#b8aaff',
  splitLight: '#ffe8c8',
  inkGrain: 0.025,
  // Paper: blank paper is exactly PAPER_COLOR unless paperGrain or the dots are on.
  paper: PAPER_COLOR as ColorRepresentation,
  paperGrain: 0,
  bgOn: true,
  bgPitch: 5.8,
  bgAngle: 46,
  bgReach: 61,
  bgCoverage: 0.41,
  bgInk: '#641b12',
  bgOpacity: 0.22,
  // Optional paper lighting parameters shared by the render pass:
  // Dark paper and warm lighting tints use sRGB; speed is the smoothing time
  // in seconds, and dot pitch is measured in CSS pixels.
  themeOn: true,
  paperDark: '#15121f',
  themeDusk: '#e29a78',
  themeGlow: '#ffb36b',
  themeGlowStrength: 0.22,
  themeDots: true,
  themeDotPitch: 9,
  themeSpeed: 1.2,
  bgInkNight: '#ffd2a0',
  // Animated on twos: Zud's pose and position update at twosFps; the camera,
  // lights, hover lift and every UI response stay at full rate.
  twosOn: true,
  twosFps: 30,
};

export type RetroParams = typeof DEFAULTS & {
  /** Debug view (see RETRO_VIEWS); 'final' when unset. */
  view?: RetroView;
};

export const RETRO_DEFAULTS: Readonly<RetroParams> = DEFAULTS;

// Day is the only preset: the defaults above. setPreset('day') restores them.
export const RETRO_PRESETS: Readonly<Record<string, Partial<RetroParams>>> = {
  day: {},
};

/** Compile-time options a material registers with (see RetroStyle.register). */
export interface RetroMaterialOptions {
  /** Per-vertex `ao` and `bounce` attributes. */
  vertexAO?: boolean;
  /** Pins the material's own pattern space instead of following the style's. */
  space?: RetroSpace | null;
}

const vec4 = () => new Vector4(0, 0, 0, 1);

/** Material-side uniforms, shared by every retro() material. */
function createMaterialUniforms() {
  return {
    retroStrength: {value: 1},
    retroPixelRatio: {value: 1},
    retroMirror: {value: 0},
    retroLite: {value: 0},
    retroClassic: {value: 1}, // 1: the Normal look's halftone and nothing else
    retroMono: {value: new Vector4()}, // on, detail (1 grayscale .. 0 two-tone), two-tone pattern strength, shadow depth
    retroView: {value: 0},
    retroGrain: {value: 0},
    retroBands: {value: new Vector4()}, // shadow edge, highlight edge, softness, posterize amount
    retroPoster: {value: new Vector4()}, // steps, step softness, tint amount
    retroShadowTint: {value: new Color()},
    retroLightTint: {value: new Color()},
    retroHiDots: {value: vec4()}, // grid: cos, sin, aa, lod
    retroHiParams: {value: new Vector4()}, // opacity, highlight coverage, rim coverage
    retroHiInk: {value: new Color()},
    retroRim: {value: new Vector2()}, // power, start
    retroHatch: {value: vec4()},
    retroHatchB: {value: vec4()},
    retroHatchParams: {value: new Vector4()}, // opacity, coverage, second set opacity
    retroHatchTint: {value: new Color()},
  } satisfies Record<string, IUniform>;
}

// Uniforms of the whole-frame pass, shared with retro-print.ts. Colors are
// plain sRGB values (the pass blends after the sRGB encode), sizes are CSS px.
function createPostUniforms() {
  return {
    uOutline: {value: new Vector4()}, // width, threshold, crease strength, opacity
    uOutlineInk: {value: new Vector4()}, // ink rgb, tint by the nearest surface color
    uMisreg: {value: new Vector4()}, // base px, extra px at edges
    uGrade: {value: new Vector4()}, // saturation, contrast, split tone amount, ink grain
    uSplitShadow: {value: new Vector3()},
    uSplitLight: {value: new Vector3()},
    uBg: {value: new Vector4()}, // pitch px, angle (rad), reach px, coverage
    uBgInk: {value: new Vector4()}, // ink rgb, opacity
    uThemeA: {value: new Vector4()}, // night, blind curtain edge, unused, wipe dot pitch (px)
    uThemeB: {value: new Vector4()}, // dusk weight, lamp glow strength, glow radius, active
    uLampUv: {value: new Vector2(0.5, 0.5)},
    uPaperDark: {value: new Vector3(0.08, 0.07, 0.12)},
    uPaperDusk: {value: new Vector3()},
    uPaperGlow: {value: new Vector3()},
    uPaperGrain: {value: 0},
    uLite: {value: 0},
    uMono: {value: 0},
    uClassic: {value: 1},
  } satisfies Record<string, IUniform>;
}

export type RetroMaterialUniforms = ReturnType<typeof createMaterialUniforms>;
export type RetroPostUniforms = ReturnType<typeof createPostUniforms>;

function srgb<T extends Vector3 | Vector4>(target: T, hex: ColorRepresentation): T {
  const c = new Color(hex).convertLinearToSRGB();
  target.setX(c.r).setY(c.g).setZ(c.b);
  return target;
}

// One layer's grid: rotation and pitch in CSS px. The shader turns that into
// cells per device pixel (screen space) or per world unit (object space), so
// the same values serve materials in either space.
function grid(target: Vector4, pitch: number, angle: number): void {
  const a = (angle * Math.PI) / 180;
  target.set(Math.cos(a), Math.sin(a), pitch, 1);
}

/**
 * The shared print state: parameters, the uniforms every retro material and
 * the frame pass read, and the registry of live materials for compile-time switches.
 */
export class RetroStyle {
  readonly uniforms = createMaterialUniforms();
  readonly post = createPostUniforms();

  private readonly state: {params: RetroParams; pixelRatio: number; lite: boolean; space: RetroSpace; look: RetroLook} = {
    params: {...DEFAULTS},
    pixelRatio: 1,
    lite: false,
    space: DEFAULTS.space,
    look: DEFAULTS.look,
  };
  private readonly listeners = new Set<(style: RetroStyle) => void>();
  // Live materials and whether each one pins its own pattern space.
  private readonly registry = new Map<Material, RetroMaterialOptions>();

  constructor() {
    this.syncUniforms();
  }

  get params(): RetroParams {
    return this.state.params;
  }

  get lite(): boolean {
    return this.state.lite;
  }

  get space(): RetroSpace {
    return this.state.space;
  }

  get look(): RetroLook {
    return this.state.look;
  }

  // Re-reads params into the shared uniforms (the GUI calls this on every edit).
  sync(): void {
    const {state} = this;
    if (state.params.space !== state.space) this.setSpace(state.params.space);
    state.look = RETRO_LOOKS.includes(state.params.look) ? state.params.look : state.look;
    state.params.look = state.look;
    this.syncUniforms();
    this.notify();
  }

  // Replaces every parameter but the pattern space (it recompiles shaders) and the
  // look: both stay explicit choices (setSpace, setLook), never a side effect of a preset.
  setParams(values: Partial<RetroParams>): void {
    Object.assign(this.state.params, DEFAULTS, values, {space: this.state.space, look: this.state.look});
    this.sync();
  }

  setPreset(name: string): void {
    this.setParams(RETRO_PRESETS[name] ?? {});
  }

  // CSS px stay constant: the dot size follows the drawing buffer's pixel ratio.
  setPixelRatio(ratio: number): void {
    if (ratio === this.state.pixelRatio) return;
    this.state.pixelRatio = ratio;
    this.syncUniforms();
  }

  // The look is a uniform switch: nothing recompiles when it changes.
  setLook(look: RetroLook): void {
    if (!RETRO_LOOKS.includes(look) || look === this.state.look) return;
    this.state.look = this.state.params.look = look;
    this.syncUniforms();
    this.notify();
  }

  // 'screen' (authentic print, default) or 'object' (ink attached to surfaces).
  setSpace(space: RetroSpace): void {
    if (space === this.state.space) return;
    this.state.space = this.state.params.space = space;
    this.recompile();
    this.notify();
  }

  // Lite path for slow GPUs: no rim dots, one hatch set, a silhouette-only outline,
  // no misregistration and no paper halo. A uniform switch, so it never recompiles
  // (a recompile froze the page for a visible moment, exactly when it is slowest).
  setLite(on: boolean): void {
    on = Boolean(on);
    if (on === this.state.lite) return;
    this.state.lite = on;
    this.uniforms.retroLite.value = this.post.uLite.value = on ? 1 : 0;
    console.info(`[retro] lite print path ${on ? 'on' : 'off'}`);
    this.notify();
  }

  // Materials register for compile-time switches; `space` pins a material's own.
  register(material: Material, options: RetroMaterialOptions): void {
    this.registry.set(material, options);
    material.addEventListener('dispose', () => this.registry.delete(material));
    material.defines = this.definesFor(options);
  }

  subscribe(listener: (style: RetroStyle) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener(this));
  }

  private definesFor({vertexAO, space}: RetroMaterialOptions): Record<string, number> {
    const defines: Record<string, number> = {};
    if (vertexAO) defines.RETRO_VERTEX_AO = 1;
    if ((space ?? this.state.space) === 'object') defines.RETRO_OBJECT_SPACE = 1;
    return defines;
  }

  private recompile(): void {
    for (const [material, options] of this.registry) {
      material.defines = this.definesFor(options);
      material.needsUpdate = true;
    }
  }

  private syncUniforms(): void {
    const p = this.state.params;
    const u = this.uniforms;
    const post = this.post;
    u.retroStrength.value = p.strength;
    u.retroPixelRatio.value = this.state.pixelRatio;
    u.retroView.value = Math.max(0, RETRO_VIEWS.indexOf(p.view ?? 'final'));
    u.retroGrain.value = p.grain;
    u.retroBands.value.set(p.bandShadow, p.bandLight, p.bandSoft, p.posterAmount);
    u.retroPoster.value.set(p.posterSteps, p.posterSoft, p.tintAmount, 0);
    u.retroShadowTint.value.set(p.shadowTint);
    u.retroLightTint.value.set(p.lightTint);
    grid(u.retroHiDots.value, p.hiPitch, p.hiAngle);
    u.retroHiParams.value.set(p.hiOpacity, p.hiOn ? p.hiCoverage : 0, p.rimOn ? p.rimCoverage : 0, 0);
    u.retroHiInk.value.set(p.hiInk).multiplyScalar(p.hiGain);
    u.retroRim.value.set(p.rimPower, p.rimStart);
    grid(u.retroHatch.value, p.hatchPitch, p.hatchAngle);
    grid(u.retroHatchB.value, p.hatchPitch, p.hatchAngle + 90);
    u.retroHatchParams.value.set(p.hatchOpacity, p.hatchOn ? p.hatchCoverage : 0, p.hatchSecond, 0);
    u.retroHatchTint.value.set(p.hatchTint);
    const mono = p.look === 'mono';
    u.retroClassic.value = post.uClassic.value = p.look === 'normal' ? 1 : 0;
    u.retroMono.value.set(mono ? 1 : 0, p.monoDetail, p.monoPattern, p.monoShadow);
    post.uOutline.value.set(p.outlineWidth, p.outlineThreshold, p.outlineCrease, p.outlineOn ? p.outlineOpacity : 0);
    srgb(post.uOutlineInk.value, p.outlineInk).w = p.outlineTint;
    post.uMisreg.value.set(p.misreg, p.misregEdge, 0, 0);
    post.uGrade.value.set(p.gradeSaturation, p.gradeContrast, p.splitAmount, p.inkGrain);
    srgb(post.uSplitShadow.value, p.splitShadow);
    srgb(post.uSplitLight.value, p.splitLight);
    post.uBg.value.set(p.bgPitch, (p.bgAngle * Math.PI) / 180, p.bgReach, p.bgOn ? p.bgCoverage : 0);
    srgb(post.uBgInk.value, p.bgInk).w = p.bgOpacity;
    post.uPaperGrain.value = p.paperGrain;
    // Black & white: the pass drops the split tone, the glow's warmth and the channel
    // offsets, and its inks become grays of the same luminance (the paper is untouched).
    post.uMono.value = mono ? 1 : 0;
    if (mono) {
      for (const ink of [post.uOutlineInk.value, post.uBgInk.value]) {
        const luma = ink.x * 0.299 + ink.y * 0.587 + ink.z * 0.114;
        ink.set(luma, luma, luma, ink.w);
      }
    }
  }
}

export const retroStyle = new RetroStyle();
