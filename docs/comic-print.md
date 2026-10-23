# Comic print look

The room is rendered as a printed comic: flat, posterized color in two tonal bands, halftone dots on the lit side, hatching in the shadows, a thin depth outline, color misregistration, grading, and a halftone halo on the paper. Everything is Three.js `0.180.0` with WebGL2 and plain shaders; nothing here adds a dependency.

| Where | What |
|---|---|
| `src/surface-halftone.js` | The ink GLSL (`retroPrint`), injected by `retro()` after lighting and before tonemapping |
| `src/retro-material.js` | `retro()`: Lambert + bounce + AO + the ink; defines and the shared uniforms |
| `src/retro-style.js` | Parameters, presets, shared uniforms, material registry (recompiles on a define switch) |
| `src/retro-print.js` | The whole-frame pass: outline, misregistration, grading, paper, grain |
| `src/paper.js` | `PAPER_COLOR`: the single constant to keep equal to the light page background (`--paper` in `style.css`) |
| `src/paper-theme.js` | The page's light/dark theme, driven by the scene's light (paper uniforms and CSS variables) |
| `src/twos.js` | The pose clock for animation on twos |
| `src/debug-gui.js` | The `?debug` panel (dev builds only) |

## The three looks

The page defaults to color comic. The half-filled circle in the navigation toggles between color comic and black & white; the URL follows the toggle. `?look=normal|comic|mono` still selects the initial look, including legacy Normal links.

| Look | What it is |
|---|---|
| **Normal** | The print as it was before the comic shader: the earlier material-space CMYK halftone and the plain developed frame (filmic curve, warm glow, paper). Verified against the original commit: the room is pixel-identical. No twos, no outline, no comic stage, whatever the parameters say |
| **Cómic** (default) | Everything below: bands, posterized base, dots, hatching, outline, misregistration, grade, halo, twos |
| **Cómic B/N** | The comic in black & white (see below) |

Looks are uniform switches: changing one compiles nothing. In Normal the material still runs through the same program (an early return), so only the frame's depth attachment and the larger program remain as small costs; animation on twos and the lite path are comic-look features. To start in another look, change `look` in `RETRO_DEFAULTS` (`src/retro-style.js`). The dream bubble's cake follows the look too.

## The page follows the light

The background (the paper the canvas prints, the page behind it and the UI colors) reacts to the scene's own light, in every look. Darkness is what the scene already computes, `night + (1 - night) * blind` (that is, `1 - daylight` with the blind in it): `night` comes from the clock and `blind` is how far the blind has come down. Closing the blind in daylight makes the page as dark as night; at night the blind adds nothing.

The transition follows its cause (`src/paper-theme.js`, `paperAt` in `src/retro-print.js`):

- **Closing blind**: a curtain of darkness lowers from the top edge of the page, tied to the blind's own progress, so the paper darkens as the cloth falls.
- **Nightfall**: night comes in from the top (the sky goes first and the horizon holds out longest), with a warm dusk tint riding its front. The clock's night is smoothed over `themeSpeed` seconds, so jumping the hands is a transition, not a cut.
- **Both edges are a halftone wipe**: dots grow until they close into solid dark (`themeDots`; off gives a smooth wipe).
- **The lamp** that turns on in the dark warms the paper around it (`themeGlow`), and the halo dots switch to their night ink.
- **The UI** (navigation, look toggle, hover hint, symbol, `body`) takes the dark colors from the same number, through the CSS variables `--paper`, `--ink`, `--muted`, `--panel`, `--edge`, `--hover`, `--pressed-bg`, `--pressed-ink`.
- Reduced motion snaps. Black & white keeps the dark paper neutral. By day with the blind up the paper is exactly `PAPER_COLOR`.

`?time=HH:MM` starts the clock at that hour (a page opened at night is dark from its first frame): `/?time=23:30`. `data-theme` (`light`/`dark`, with hysteresis) and `data-darkness` (0..1) are exposed on `#stage`. The theme's `meta theme-color` (the browser chrome on mobile) is not touched.

## Using it

- `npm run dev`, then open `/?debug`. The panel has one folder per layer, a view mode (lightness, band masks, each layer alone), a reset to the Day defaults, a time-of-day slider and **Copy all values** (JSON for pasting into a chat).
- `?resolution=fixed` freezes the adaptive resolution (for tests, and to judge the look at true dpr).
- The panel is `import()`ed only when `import.meta.env.DEV` and `?debug` are both true, so production builds contain neither it nor `lil-gui`.
- Switching **pattern space** recompiles the live materials once (a few programs share them). **Lite** is a uniform and never recompiles.

### State exposed to tests (`#stage` data attributes)

`data-print-space` (`object`/`screen`), `data-print-lite` (`on`/`off`), `data-twos` (`on`/`off`), `data-shown-x` (the displayed x of Zud; `data-position-x` is his journey at full rate), plus the existing ones. Engaging the lite path logs `[retro] lite print path on` (and the reason when it is automatic).

## Pipeline

Material, per fragment (`retroPrint`, linear HDR):

1. **Lightness** `L = sqrt(lum(lit) / paperWhite)`. `paperWhite` is the luminance a white surface gets from the current key and hemisphere, blended toward the full-daylight value by `nightKeep`.
2. **Bands**: shadow mask below `bandShadow`, highlight mask above `bandLight`, each with `bandSoft` smoothstep width. With a gap between the edges that zone is flat and has no ink; where they cross, both inks apply together.
3. **Flat base**: `L` is quantized to `posterSteps` levels; the lit color is rescaled by the luminance ratio, so hue and colored bounce survive. Shadow and light tints multiply by band.
4. **Highlight dots** (additive light ink, radius grows with `L`); **rim dots** on silhouettes share that grid (view direction is the constant `(0,0,1)` in view space under the ortho camera).
5. **Shadow hatching** (multiplied ink, thicker toward black); a crossing set only in the deepest shadow.
6. Every layer is zero-mean (coverage minus the printed shape), so it moves energy instead of adding it. Grain reuses the existing per-fragment noise.

Frame pass (`retro-print.js`, opaque canvas):

1. **Outline**: Laplacian of the render target's own depth texture (linear under the ortho camera, so planes give zero at any slope; silhouettes and creases do not). Taps are whole texels; the response is normalized by the tap distance in world units, so the threshold is a dimensionless slope change independent of dpr. Ink is tinted by the nearest surface.
2. **Misregistration**: each channel is developed from its own offset; the offset grows with the outline mask (independent of the outline's opacity).
3. **Develop**: ACES (renderer exposure), saturation x1.12, then grade (saturation, contrast, split tone), then the warm 12-tap glow.
4. **Paper**: blank paper is exactly `PAPER_COLOR`; optional halftone halo whose coverage follows the alpha around the pixel.
5. **Outline ink**, then static grain (on ink; on blank paper only if `paperGrain > 0`).

Without `comic` (the transparent dream bubble) only develop + glow run, as before.

## Parameters

All are keys of `retroStyle.params` (`RETRO_DEFAULTS` in `src/retro-style.js`); the panel edits them live. **Day** is the default set. Pitches are CSS px; in object space they are measured at the default room scale (~1440 px wide).

| Name | Range (panel) | Day | What it does |
|---|---|---|---|
| `strength` | 0–2 | 1.03 | Global ink strength (all material layers) |
| `grain` | 0–1.5 | 1.27 | Per-fragment noise jitter of the dot/line coverage |
| `look` | `normal` / `comic` / `mono` | `comic` | Which look the page shows (the nav toggle sets it); Day never changes it |
| `monoDetail` | 0–1 | 1 | 1: the Day render in grayscale, facets and light gradients kept; toward 0: a flat two-tone drawing like the highlight band view |
| `monoShadow` | 0–1 | 0.4 | Black & white: how far the shadow band sinks toward black (the lights keep their detail) |
| `monoPattern` | 0–1 | 0.6 | Two-tone mode only: strength of the black dots (on the light) and light hatching (on the dark) |
| `space` | `object` / `screen` | `object` | Ink attached to surfaces (triplanar) or fixed to the screen grid. Recompiles |
| `nightKeep` | 0–1 | 0.78 | 0: lightness normalized to the current light (night looks like day). 1: against full daylight (night falls into the shadow band) |
| `bandShadow` | 0–1 | 0.415 | Lightness edge below which the shadow band (hatching) applies |
| `bandLight` | 0–1.2 | 0.375 | Lightness edge above which the highlight band (dots) applies |
| `bandSoft` | 0.005–0.3 | 0.055 | Smoothstep half-width of both edges |
| `posterAmount` | 0–1 | 1 | Mix between the lit color and the posterized one |
| `posterSteps` | 2–12 | 12 | Quantization levels over lightness 0..1 |
| `posterSoft` | 0.01–0.5 | 0.5 | Softness of the step edges |
| `tintAmount` | 0–1 | 0.78 | How much the shadow/light tints apply |
| `shadowTint`, `lightTint` | color | `#b7ebf5`, `#ffdfb3` | Multipliers for the shadow and light bands |
| `hiOn` | bool | true | Highlight dots on/off |
| `hiPitch` | 1.5–24 | 4.5 | Dot pitch |
| `hiAngle` | 0–90 | 48 | Dot grid angle (degrees) |
| `hiOpacity` | 0–1.5 | 0.18 | Strength of the light ink |
| `hiCoverage` | 0–0.6 | 0.3 | Dot area at full highlight |
| `hiInk`, `hiGain` | color, 0–3 | `#ffeed1`, 0.94 | Light ink color and gain (HDR, additive) |
| `rimOn` | bool | false | Rim dots on silhouettes (same grid) |
| `rimCoverage`, `rimPower`, `rimStart` | 0–0.6, 0.5–6, 0–1 | 0.6, 1.25, 0.52 | Rim dot area, falloff and where it begins |
| `hatchOn` | bool | true | Shadow hatching on/off |
| `hatchPitch` | 1.5–20 | 3.8 | Line pitch |
| `hatchAngle` | 0–180 | 49 | Line angle (the crossing set is +90) |
| `hatchOpacity` | 0–1.5 | 0.66 | Ink strength |
| `hatchCoverage` | 0–0.7 | 0.23 | Line width as a fraction of the pitch at full shadow |
| `hatchSecond` | 0–1.5 | 0.6 | Strength of the crossing set (deepest shadow only) |
| `hatchTint` | color | `#5a4a9a` | Hatching ink (multiplied) |
| `outlineOn` | bool | true | Outline on/off (misregistration at edges is independent) |
| `outlineWidth` | 0.5–4 | 0.5 | CSS px; rounded to whole device texels, at least 1 |
| `outlineThreshold` | 0.05–1.5 | 1.5 | Slope change that counts as a crease; silhouettes always pass |
| `outlineCrease` | 0–1 | 0.24 | Strength of creases relative to silhouettes |
| `outlineOpacity` | 0–1 | 0.43 | Ink opacity |
| `outlineInk`, `outlineTint` | color, 0–1 | `#363636`, 0.19 | Ink color; how much the nearest surface's color tints it |
| `misreg` | 0–8 | 0 | Channel offset everywhere (CSS px) |
| `misregEdge` | 0–8 | 0.45 | Extra offset at outline edges (CSS px) |
| `gradeSaturation`, `gradeContrast` | 0.5–2, 0.6–1.6 | 1.27, 1.06 | Grade on top of the x1.12 saturation |
| `splitAmount`, `splitShadow`, `splitLight` | 0–1, colors | 0.25, `#b8aaff`, `#ffe8c8` | Split tone by luminance |
| `inkGrain`, `paperGrain` | 0–0.15 | 0.025, 0 | Static grain on ink / on blank paper |
| `paper` | color | `PAPER_COLOR` (`#ffffff`) | Paper color; keep equal to the page background |
| `bgOn` | bool | true | Halftone halo on the paper around the room |
| `bgPitch`, `bgAngle` | 2–24, 0–90 | 5.8, 46 | Halo dot grid |
| `bgReach` | 20–300 | 61 | Distance (CSS px) over which the halo fades |
| `bgCoverage`, `bgOpacity` | 0–0.7, 0–1 | 0.41, 0.22 | Halo dot area and opacity |
| `bgInk` | color | `#641b12` | Halo dot color |
| `themeOn` | bool | true | The page follows the scene's light |
| `paperDark` | color | `#15121f` | The paper in the dark (blind closed or night) |
| `themeDusk` | color | `#e29a78` | Tint riding the front of nightfall |
| `themeGlow`, `themeGlowStrength` | color, 0–0.6 | `#ffb36b`, 0.22 | The lamp's warmth on the paper, scaled by the darkness |
| `themeDots`, `themeDotPitch` | bool, 3–30 | true, 9 | Halftone wipe on/off and its dot pitch (CSS px) |
| `themeSpeed` | 0.1–5 | 1.2 | Seconds the clock's night takes to settle |
| `bgInkNight` | color | `#ffd2a0` | Halo dot color in the dark (blends from `bgInk`) |
| `twosOn`, `twosFps` | bool, 4–30 | true, 30 | Zud's pose, props and displayed position update at this rate |
| `view` | enum | `final` | Debug view: lightness, highlight/shadow band, highlight dots, hatching, rim |

### Compile-time defines (material)

| Define | When | Effect |
|---|---|---|
| `RETRO_VERTEX_AO` | Zud's shells (baked `ao`/`bounce` attributes) | Per-vertex occlusion and beanie bounce |
| `RETRO_OBJECT_SPACE` | `space: 'object'` (default), or a material pinned with `retro(color,{space})` | Triplanar ink on rest-pose position |

### Define (frame pass)

| Define | When | Effect |
|---|---|---|
| `COMIC` | Opaque full-frame pass | All the stages above (the dream bubble omits it) |

### Lite (uniforms `retroLite`, `uLite`)

A uniform switch, not a define: engaging it costs no shader compilation. (As a define it froze the page for 0.4 s plus 4.2 s in software rendering while the variants, including the mirror's, recompiled, exactly when the device is slowest.) The branches it skips are uniform, so they are skipped for the whole draw.

| Layer | Normal | Lite |
|---|---|---|
| Rim dots | on if `rimOn` | off |
| Hatching | main set + crossing set | main set only |
| Outline | Laplacian (silhouettes and creases), ink tinted by the nearest surface | silhouettes only, from two taps, fixed ink tint |
| Misregistration | per channel | off |
| Paper halo | on if `bgOn` | off |

### Uniforms worth knowing

| Name | Where | Meaning |
|---|---|---|
| `retroWhite` | per lighting set (`createRetroLighting`) | Paper-white luminance for the lightness (see `nightKeep`) |
| `retroMirror` | shared | 1 while the mirror renders: ink off, posterize and tints only |
| `retroClassic`, `uClassic` | shared | 1 in the Normal look: the earlier halftone and the plain frame |
| `retroMono`, `uMono` | shared | Black & white switch (material: on, detail, two-tone pattern strength; frame pass: on) |
| `retroPixelRatio` | shared | Drawing-buffer pixel ratio (screen-space pitch is in CSS px) |
| `retroHalftoneStrength` | per material | Ink scale; `0.42` is full print (the camera prop uses `0.14`) |
| `retroView` | shared | Debug view index |
| `uPixelWorld`, `uDepthRange` | frame pass | World units per device pixel and depth range of the ortho view |
| `uThemeA`, `uThemeB`, `uLampUv`, `uPaperDark`, `uPaperDusk`, `uPaperGlow` | frame pass | The paper's darkening (night, curtain edge, wipe pitch, lamp glow), written each frame by `paper-theme.js` |

## Black & white

The `mono` look prints the same frame in grays:

- With `monoDetail` 1 (default) it is the Day render in grayscale: the frame pass desaturates what it printed (luminance, after the filmic curve and the glow), so wall facets, floor planks, the sun's gradient and the hatching in the shadows all stay. The split tone, the glow's warmth and the channel offsets are dropped, and the outline and paper-halo inks use grays of their colors' luminance. The paper itself is untouched, so blank paper is still exactly `PAPER_COLOR`.
- `monoShadow` sinks the shadow band toward black without touching the lights; 0.4 matches the reference's overall brightness (mean gray and share of dark pixels).
- Lowering `monoDetail` blends the base toward the highlight band mask (white where lit, black elsewhere, with the band's soft edge). At 0 it is a flat two-tone drawing, and the inks reverse: black dots on the light and light hatching on the dark, with `monoPattern` as their strength.
- Everything else (bands, outline, dots, twos, lite, mirror) works as in color.

## Presets

There is one: **Day**, the defaults above, which is also what the page starts with. `setPreset('day')` (the panel's **Reset to Day**) restores every parameter but the pattern space (it recompiles shaders) and the look; both stay explicit choices. Night looks come from the clock plus `nightKeep`; try them with the time-of-day slider.

## Performance

Measured only in software rendering (swiftshader), not on a real GPU, so these are counts, not times.

- **Material (object space, the default)**: dots and hatching are evaluated on three projections each: highlight dots 3, hatching 3 (+3 for the crossing set), against 12 dot evaluations plus derivatives before. Lite drops the crossing set (6). In screen space it is 1 + 1 (+1), and the dot fade is computed from uniforms with no derivatives.
- **Frame pass fetches** (was ~14: alpha, 12 bloom taps, the developed sample): about 20 with the outline on (5 depth taps, 1 for the nearest surface color, +2 more develop samples only on edge pixels that shift), 17 in lite. The paper halo adds 12 taps only on blank-paper pixels.
- **Depth texture**: it is the target's own depth attachment, so there is no extra pass. At dpr >= 1.5 (no MSAA) there is no resolve; with MSAA there is one depth resolve per frame. A 24-bit depth at dpr 2 and 1440x900 is about 21 MB.
- **Mirror**: it is a 1024x1024 render at <= 30 Hz (every frame while the camera moves), i.e. roughly 10% (dpr 2, still camera) to 80% (dpr 1, orbiting) of the main frame's fragment load, not a flat 2x. The ink is skipped there, so it pays only the posterized base and tints.
- **Adaptive resolution**: at its floor (0.75) with the median frame still over 22 ms, the print switches to the lite path once (log + `data-print-lite`) and keeps it for the session; the panel can undo it. The switch is a uniform, so there is no compile hitch.

## Limits and how to tune them

- **Object-space ink follows surfaces**: no swimming while orbiting, but dots change apparent size with surface orientation, and triplanar blending leaves soft seams where two projections mix. `space: screen` gives a fixed grid that does swim under camera motion (`?debug` toggles it live).
- **Pitch and dpr**: with the 4.5 / 3.8 px defaults, a dot is ~3 px across at dpr 1 and hatching lines are ~1 px wide. They read well at dpr 2; at dpr 1 they are near the aliasing limit (the shader fades layers whose cells fall below ~1-2 device px). Raise `hiPitch` / `hatchPitch` (7 / 5.5 stayed clean in every orbit extreme at dpr 1) if you see beating.
- **The outline is depth-based**: it cannot see a boundary with no depth step (the poster on its wall, the rug on the floor) and objects that do not write depth (contact shadow, click marker) get none. With MSAA the color is resolved but the depth is a single sample, so edges alias slightly at dpr < 1.5. Ortho only: `uPixelWorld` is derived from the camera's top/bottom.
- **Bands**: with `bandLight` below `bandShadow` (the Day values) the edges cross, and in the overlap (about L 0.32-0.47) dots and hatching are printed together. Raise `bandLight` above `bandShadow` to get an ink-free middle band instead.
- **Paper white** counts only the key and the hemisphere. Local lights (lamp, laptop, clock) are not in the reference, so surfaces near them can reach the highlight band at night; that is intended.
- **Twos**: Zud's pose, props and displayed position hold between ticks; his journey, the camera, lights, hover lift and clicks run at full rate. The floating symbol and the dream bubble follow the held pose, and so does the pick ray against Zud.
- **Misregistration** shifts the ink with the image, and at strong values exposes paper fringes at silhouettes. Edge-only misregistration (`misreg 0`, `misregEdge` > 0) keeps flat areas clean.

## Optional palette shift (not applied)

Day is the approved base. If the night, dawn and dusk should lean toward the complementary pink / cyan look, these are the values in `src/retro-lighting.js` (the cycle itself is in `src/day-cycle.js`) worth trying; each is independent:

| Light | Now | Try |
|---|---|---|
| Key at twilight (`cycle.twilight`) | `#ff9966` | `#ff6fae` (pink) |
| Key at night | `#94b5fa` | `#7f9bff` (cooler, more saturated) |
| Rim in daylight | `#ffb685` | `#7fd7ff` (cyan, against the warm key) |
| Rim at night | `#839be1` | `#4fd0ff` |
| Hemisphere sky at night | `#566db1` | `#4a5fc9` |
| Hemisphere ground at night | `#343049` | `#4a2a63` (violet) |

Because the bands are measured against the current light (`nightKeep`), these shift hue without moving the band edges.
