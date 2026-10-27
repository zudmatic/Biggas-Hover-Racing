# Chubee shader snapshot

Source: the user's Chubee repository (`src/`), copied 2026-10-26 for the hover-kart studio.

The ink, eye spirals, brush outlines, yellow paper cutout and CMYK registration are the user's original modules. Imports use this project's Three.js dependency. `character-finish.js` additionally supports static meshes for the kart outlines; the skinned character path is unchanged. The source Chubee repository and GLB are unchanged.

`chubee-studio.html` deliberately uses WebGLRenderer: these GLSL/onBeforeCompile/stencil effects are not supported by the game's WebGPURenderer. This studio is isolated from the racing renderer. Character model: `public/models/bluleet/bluleet-motionlab-dedos.glb`, copied unchanged from Chubee. Driving pose is created at runtime by `bluleet-driving-pose.js`.

The selectable game pilot is loaded by `../bluleet-model.js`. Its default ink finish is implemented in `../bluleet-ink.js` using Three.js nodes, carrying across the original light threshold, grain, blue pigment, value posterization and living spiral formulas. Skinned yellow/red shells use a depth/stencil mask to keep the border outside the character. This works in WebGPU and the game's WebGL2 fallback. The vehicle retains its own textured materials. Passing `ink:false` to the actor loader preserves the original GLB materials for comparisons.
