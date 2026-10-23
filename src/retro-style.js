import * as THREE from 'three';
import {PAPER_COLOR} from './paper.js';

// The "printed comic" look shared by every retro() material: one parameter set,
// one set of shared uniforms, and a registry of live materials so the compile-time
// switch (pattern space) can recompile them together. The shader
// side lives in surface-halftone.js; retro-material.js wires the two together.

// "Day" values, tuned by eye in the ?debug panel (object space); the presets
// below override a few of them.
export const RETRO_DEFAULTS={
  strength:1.03,
  // 0: lightness is normalized against the current light (night reads like day);
  // 1: against full daylight (night falls into the shadow band).
  nightKeep:.78,
  // Tonal bands on perceptual lightness (sqrt of lit luminance / paper white).
  // Two bands: shadow below bandShadow, highlight above bandLight. Where the edges
  // cross (bandLight < bandShadow) both inks apply together; with a gap between
  // them (bandLight > bandShadow) that middle zone is flat and carries no ink.
  bandShadow:.415,bandLight:.375,bandSoft:.055,
  posterAmount:1,posterSteps:12,posterSoft:.5,
  tintAmount:.78,shadowTint:'#b7ebf5',lightTint:'#ffdfb3',
  // Highlight dots (and rim dots, which share their grid): light ink, added.
  // Pitch is in CSS px; in object space it is measured at the default scene scale (~1440 px wide).
  hiOn:true,hiPitch:4.5,hiAngle:48,hiOpacity:.18,hiCoverage:.3,hiInk:'#ffeed1',hiGain:.94,
  rimOn:false,rimCoverage:.6,rimPower:1.25,rimStart:.52,
  // Shadow hatching; the second set crosses the first only in the deepest shadow.
  hatchOn:true,hatchPitch:2.5,hatchAngle:49,hatchOpacity:.64,hatchCoverage:.23,hatchSecond:.6,hatchTint:'#5a4a9a',
  grain:1.27,
  // Which look the page shows: 'normal' (the print as it was before the comic shader),
  // 'comic' (everything below) or 'mono' (the comic in black & white).
  look:'comic',
  // Black & white (look 'mono'): the finished frame in grays (the Day render, detail kept).
  // Lowering monoDetail toward 0 turns it into a flat two-tone drawing like the highlight
  // band view; monoPattern is the strength of that mode's black dots and light hatching,
  // and monoShadow sinks the shadow band toward black while the lights keep their detail.
  monoDetail:1,monoPattern:.6,monoShadow:.4,
  space:'object',
  // Post (retro-print.js). Outline: depth-based, thin, drawn in a colored ink.
  outlineOn:true,outlineWidth:.5,outlineThreshold:1.5,outlineCrease:.24,outlineOpacity:.43,outlineInk:'#363636',outlineTint:.19,
  // Color misregistration: each channel is sampled off register (CSS px), more at
  // edges. The edge part is independent of the outline's opacity.
  misreg:0,misregEdge:.45,
  // Comic grading on top of the filmic curve's x1.12 saturation, plus a split tone.
  gradeSaturation:1.27,gradeContrast:1.06,splitAmount:.25,splitShadow:'#b8aaff',splitLight:'#ffe8c8',
  inkGrain:.025,
  // Paper: blank paper is exactly PAPER_COLOR unless paperGrain or the dots are on.
  paper:PAPER_COLOR,paperGrain:0,
  bgOn:true,bgPitch:5.8,bgAngle:46,bgReach:61,bgCoverage:.41,bgInk:'#641b12',bgOpacity:.22,
  // Optional paper lighting parameters shared by the render pass:
  // Dark paper and warm lighting tints use sRGB; speed is the smoothing time
  // in seconds, and dot pitch is measured in CSS pixels.
  themeOn:true,paperDark:'#15121f',themeDusk:'#e29a78',themeGlow:'#ffb36b',themeGlowStrength:.22,
  themeDots:true,themeDotPitch:9,themeSpeed:1.2,bgInkNight:'#ffd2a0',
  // Animated on twos: Zud's pose and position update at twosFps; the camera,
  // lights, hover lift and every UI response stay at full rate.
  twosOn:true,twosFps:30,
};

// Day is the only preset: the defaults above. setPreset('day') restores them.
export const RETRO_PRESETS={
  day:{},
};

export const RETRO_LOOKS=['normal','comic','mono'];

export const RETRO_VIEWS=['final','lightness','highlight band','shadow band','highlight dots','hatching','rim'];

const state={params:{...RETRO_DEFAULTS},pixelRatio:1,lite:false,space:RETRO_DEFAULTS.space,look:RETRO_DEFAULTS.look};
const listeners=new Set();
// Live materials and whether each one pins its own pattern space.
const registry=new Map();

const vec4=()=>new THREE.Vector4(0,0,0,1);
const uniforms={
  retroStrength:{value:1},
  retroPixelRatio:{value:1},
  retroMirror:{value:0},
  retroLite:{value:0},
  retroClassic:{value:1},                     // 1: the Normal look's halftone and nothing else
  retroMono:{value:new THREE.Vector4()},      // on, detail (1 grayscale .. 0 two-tone), two-tone pattern strength, shadow depth
  retroView:{value:0},
  retroGrain:{value:0},
  retroBands:{value:new THREE.Vector4()},     // shadow edge, highlight edge, softness, posterize amount
  retroPoster:{value:new THREE.Vector4()},    // steps, step softness, tint amount
  retroShadowTint:{value:new THREE.Color()},
  retroLightTint:{value:new THREE.Color()},
  retroHiDots:{value:vec4()},                 // grid: cos, sin, aa, lod
  retroHiParams:{value:new THREE.Vector4()},  // opacity, highlight coverage, rim coverage
  retroHiInk:{value:new THREE.Color()},
  retroRim:{value:new THREE.Vector2()},       // power, start
  retroHatch:{value:vec4()},
  retroHatchB:{value:vec4()},
  retroHatchParams:{value:new THREE.Vector4()}, // opacity, coverage, second set opacity
  retroHatchTint:{value:new THREE.Color()},
};

// Uniforms of the whole-frame pass, shared with retro-print.js. Colors are
// plain sRGB values (the pass blends after the sRGB encode), sizes are CSS px.
const post={
  uOutline:{value:new THREE.Vector4()},       // width, threshold, crease strength, opacity
  uOutlineInk:{value:new THREE.Vector4()},    // ink rgb, tint by the nearest surface color
  uMisreg:{value:new THREE.Vector4()},        // base px, extra px at edges
  uGrade:{value:new THREE.Vector4()},         // saturation, contrast, split tone amount, ink grain
  uSplitShadow:{value:new THREE.Vector3()},
  uSplitLight:{value:new THREE.Vector3()},
  uBg:{value:new THREE.Vector4()},            // pitch px, angle (rad), reach px, coverage
  uBgInk:{value:new THREE.Vector4()},         // ink rgb, opacity
  uThemeA:{value:new THREE.Vector4()},        // night, blind curtain edge, unused, wipe dot pitch (px)
  uThemeB:{value:new THREE.Vector4()},        // dusk weight, lamp glow strength, glow radius, active
  uLampUv:{value:new THREE.Vector2(.5,.5)},
  uPaperDark:{value:new THREE.Vector3(.08,.07,.12)},
  uPaperDusk:{value:new THREE.Vector3()},
  uPaperGlow:{value:new THREE.Vector3()},
  uPaperGrain:{value:0},
  uLite:{value:0},
  uMono:{value:0},
  uClassic:{value:1},
};
const srgb=(target,hex)=>{const c=new THREE.Color(hex).convertLinearToSRGB();return target.set(c.r,c.g,c.b,target.w);};
const srgb3=(target,hex)=>{const c=new THREE.Color(hex).convertLinearToSRGB();return target.set(c.r,c.g,c.b);};

// One layer's grid: rotation and pitch in CSS px. The shader turns that into
// cells per device pixel (screen space) or per world unit (object space), so
// the same values serve materials in either space.
function grid(target,pitch,angle) {
  const a=angle*Math.PI/180;
  target.set(Math.cos(a),Math.sin(a),pitch,1);
}

function sync() {
  const p=state.params,u=uniforms;
  u.retroStrength.value=p.strength;
  u.retroPixelRatio.value=state.pixelRatio;
  u.retroView.value=Math.max(0,RETRO_VIEWS.indexOf(p.view??'final'));
  u.retroGrain.value=p.grain;
  u.retroBands.value.set(p.bandShadow,p.bandLight,p.bandSoft,p.posterAmount);
  u.retroPoster.value.set(p.posterSteps,p.posterSoft,p.tintAmount,0);
  u.retroShadowTint.value.set(p.shadowTint);
  u.retroLightTint.value.set(p.lightTint);
  grid(u.retroHiDots.value,p.hiPitch,p.hiAngle);
  u.retroHiParams.value.set(p.hiOpacity,p.hiOn?p.hiCoverage:0,p.rimOn?p.rimCoverage:0,0);
  u.retroHiInk.value.set(p.hiInk).multiplyScalar(p.hiGain);
  u.retroRim.value.set(p.rimPower,p.rimStart);
  grid(u.retroHatch.value,p.hatchPitch,p.hatchAngle);
  grid(u.retroHatchB.value,p.hatchPitch,p.hatchAngle+90);
  u.retroHatchParams.value.set(p.hatchOpacity,p.hatchOn?p.hatchCoverage:0,p.hatchSecond,0);
  u.retroHatchTint.value.set(p.hatchTint);
  const mono=p.look==='mono';
  u.retroClassic.value=post.uClassic.value=p.look==='normal'?1:0;
  u.retroMono.value.set(mono?1:0,p.monoDetail,p.monoPattern,p.monoShadow);
  post.uOutline.value.set(p.outlineWidth,p.outlineThreshold,p.outlineCrease,p.outlineOn?p.outlineOpacity:0);
  srgb(post.uOutlineInk.value,p.outlineInk).w=p.outlineTint;
  post.uMisreg.value.set(p.misreg,p.misregEdge,0,0);
  post.uGrade.value.set(p.gradeSaturation,p.gradeContrast,p.splitAmount,p.inkGrain);
  srgb3(post.uSplitShadow.value,p.splitShadow);srgb3(post.uSplitLight.value,p.splitLight);
  post.uBg.value.set(p.bgPitch,p.bgAngle*Math.PI/180,p.bgReach,p.bgOn?p.bgCoverage:0);
  srgb(post.uBgInk.value,p.bgInk).w=p.bgOpacity;
  post.uPaperGrain.value=p.paperGrain;
  // Black & white: the pass drops the split tone, the glow's warmth and the channel
  // offsets, and its inks become grays of the same luminance (the paper is untouched).
  post.uMono.value=mono?1:0;
  if(mono)for(const ink of [post.uOutlineInk.value,post.uBgInk.value]) {
    const luma=ink.x*.299+ink.y*.587+ink.z*.114;ink.set(luma,luma,luma,ink.w);
  }
}

function definesFor({vertexAO,space}) {
  const defines={};
  if(vertexAO)defines.RETRO_VERTEX_AO=1;
  if((space??state.space)==='object')defines.RETRO_OBJECT_SPACE=1;
  return defines;
}

function recompile() {
  for(const [material,options] of registry) {
    material.defines=definesFor(options);
    material.needsUpdate=true;
  }
}

const notify=()=>listeners.forEach(listener=>listener(retroStyle));

export const retroStyle={
  uniforms,
  post,
  get params(){return state.params;},
  get lite(){return state.lite;},
  get space(){return state.space;},
  get look(){return state.look;},
  // Re-reads params into the shared uniforms (the GUI calls this on every edit).
  sync() {
    if(state.params.space!==state.space)this.setSpace(state.params.space);
    state.look=RETRO_LOOKS.includes(state.params.look)?state.params.look:state.look;state.params.look=state.look;
    sync();notify();
  },
  // Replaces every parameter but the pattern space (it recompiles shaders) and the
  // look: both stay explicit choices (setSpace, setLook), never a side effect of a preset.
  setParams(values) {
    Object.assign(state.params,RETRO_DEFAULTS,values,{space:state.space,look:state.look});
    this.sync();
  },
  setPreset(name) {this.setParams(RETRO_PRESETS[name]??{});},
  // CSS px stay constant: the dot size follows the drawing buffer's pixel ratio.
  setPixelRatio(ratio) {
    if(ratio===state.pixelRatio)return;
    state.pixelRatio=ratio;sync();
  },
  // The look is a uniform switch: nothing recompiles when it changes.
  setLook(look) {
    if(!RETRO_LOOKS.includes(look)||look===state.look)return;
    state.look=state.params.look=look;
    sync();notify();
  },
  // 'screen' (authentic print, default) or 'object' (ink attached to surfaces).
  setSpace(space) {
    if(space===state.space)return;
    state.space=state.params.space=space;
    recompile();notify();
  },
  // Lite path for slow GPUs: no rim dots, one hatch set, a silhouette-only outline,
  // no misregistration and no paper halo. A uniform switch, so it never recompiles
  // (a recompile froze the page for a visible moment, exactly when it is slowest).
  setLite(on) {
    on=Boolean(on);
    if(on===state.lite)return;
    state.lite=on;
    uniforms.retroLite.value=post.uLite.value=on?1:0;
    console.info(`[retro] lite print path ${on?'on':'off'}`);
    notify();
  },
  // Materials register for compile-time switches; `space` pins a material's own.
  register(material,options) {
    registry.set(material,options);
    material.addEventListener('dispose',()=>registry.delete(material));
    material.defines=definesFor(options);
  },
  subscribe(listener) {listeners.add(listener);return ()=>listeners.delete(listener);},
};
sync();
