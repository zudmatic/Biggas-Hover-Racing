# Original Figma shader runtime

The seven runtime source files in this directory are copied verbatim from
Figma MCP `file://shader-runtime-index.json/` and `file:///shader-runtime/{filename}`.
Retrieved on 2026-10-30 for design `FcnXlQypVFMawz3CtH9lAq`, node `1375:11526`.
They are retained with the authored WGSL shader as the original design reference.

The landing uses `../../landing-shader.ts`, `../../landing-paint.ts`, and
`../../landing-lens.ts` instead: standard Canvas 2D paints the original local SVGs
and measured layout, then WebGL applies the same radial distortion, lateral RGB
aberration, triangular 16-tap kernel with the original four spatial samples. This avoids the
original runtime's experimental HTML-in-Canvas dependency entirely.

A Canvas 2D software lens (six weighted taps per channel, reduced
resolution) preserves distortion when WebGL is unavailable or its context is
lost. Both paths retain native DOM controls, responsive hit areas and the
animated exit snapshot. WebGL renders at native device pixel density, bounded only by GPU texture and
viewport limits. Grid vectors are drawn at that resolution rather than cached as
a fixed-size bitmap. The landing renders at up to 30 fps (8 fps in software) for pointer parallax and
slow grid drift. It stops when hidden or outside the landing; reduced-motion
users receive a static composition. The native Start hit area follows the same
lens mapping on each rendered frame.

Current Figma parameters: distortion 0.34, aberration 0.04, lateral mode, center 50%/50%, quality 0. Effect plane: 2110.848 × 1465.867 over the 1440 × 1000 frame.
