# Waterfront water shader

Reusable snapshot of Portfolio 27's existing **surface-water** shader, 26 October 2026. The original `src/water.ts`, `src/waves.ts` and packed textures are copied unchanged; hashes and source commit are in `provenance.json`.

This is TypeScript + Three.js TSL for **Three.js 0.184.0 / `WebGPURenderer`**. No React, Next.js, DialKit, Blender file or portfolio scene is needed. It is not a portable GLSL shader or a Unity/Godot material. The underwater minigame's separate volumetric rays, terrain caustics and color grade are outside this package.

## Try the standalone example

From this extracted folder:

```sh
npm install
npm run serve
```

Open **http://127.0.0.1:3034/**. The example JavaScript is already built. Use localhost or HTTPS rather than opening `index.html` as a file. Drag to orbit, scroll to zoom, and try Pause, Foam and Clarity. The stone cylinder has its own generated contact field; the orange buoy samples the same waves on the CPU.

After editing the example's TypeScript, run `bun run build` (Bun is only needed to rebuild the example). `npm run typecheck` checks the source. Runtime versions are pinned to those used in the project, including its r182 type definitions; the original shader includes the small r184 shadow-hook type assertion.

## Files to take into another app

| File | Purpose |
| --- | --- |
| `src/water.ts` | Original water surface, virtual refraction, caustic ribbons, glints, foam and opaque seabed |
| `src/waves.ts` | GPU wave constants and matching `sampleWaterHeight()` for buoyancy |
| `src/preset.ts` | Current saved waterfront settings; different from factory defaults in `createWater()` |
| `src/empty-contact.ts` | Neutral distance map for scenes without a shoreline bake |
| `assets/water-pattern.png` | Seamless 512×512 packed wave/caustic data |
| `assets/water-bed.png` | Seamless 512×512 packed submerged stone data |
| `example/main.ts` | Complete plain Three.js setup, animation, controls and cleanup |
| `reference/water-contact-dynamic.*` | Original harbor contact map + bounds; **reference only**, tied to that scene |
| `tools/generate-water-contact.py` | Original offline GLB contact baker; see constraints below |

Copy the two PNGs to a URL your app serves and the desired `src` modules to your source folder. Keep a single Three.js installation and import node materials/renderer from `three/webgpu`, and shader functions from `three/tsl`.

## Minimal integration

This goes in browser-side setup after you have a renderer, scene and camera. Initialize `WebGPURenderer` with `await renderer.init()`, enable `renderer.shadowMap.enabled`, and use `THREE.AgXToneMapping` with exposure `1.12` for the source's baseline display settings.

```ts
import * as THREE from "three/webgpu"
import { createWater } from "./water"
import { createEmptyWaterContact } from "./empty-contact"
import { applyWaterfrontPreset } from "./preset"

const loader = new THREE.TextureLoader()
const [pattern, bedPattern] = await Promise.all([
  loader.loadAsync("/water/water-pattern.png"),
  loader.loadAsync("/water/water-bed.png"),
])
const contact = createEmptyWaterContact(0) // world-space Y of flat water
const toSun = new THREE.Vector3(-0.620874, 0.500149, 0.603628).normalize()
const sun = new THREE.DirectionalLight(0xffffff, 9.1)
sun.position.copy(toSun).multiplyScalar(40)
sun.castShadow = true
// Fit sun.shadow.camera to your scene; see example/main.ts.
scene.add(sun, sun.target)

const sourceGeometry = new THREE.PlaneGeometry(40, 40, 64, 64)
  .rotateX(-Math.PI / 2)
const placeholder = new THREE.MeshBasicNodeMaterial()
const surface: THREE.Mesh = new THREE.Mesh(sourceGeometry, placeholder)
scene.add(surface)
const water = createWater(
  pattern, sun, toSun, contact.texture, contact.info, surface, bedPattern
)
surface.geometry = water.geometry
surface.material = water.material
surface.castShadow = false
surface.receiveShadow = true
scene.add(water.seabed)
sourceGeometry.dispose() // only if owned here; createWater clones it
placeholder.dispose()
const speed = applyWaterfrontPreset(water)

// In your existing render loop, with deltaSeconds in seconds:
water.phase.value += Math.min(deltaSeconds, 0.05) * speed
renderer.render(scene, camera)
```

The neutral mask also avoids the contact-darkening term; setting foam to zero alone does not remove that term from a real contact map. Pause by stopping phase advancement. Skip advancement while the page is hidden and clamp the first delta on return. The factory does not create its own animation loop.

## Coordinates, lighting and mesh requirements

- World space is **Y-up**, with water horizontal in XZ. Units in the original scene are approximately meters. `waterLevel` is the resting world Y. Apply parent transforms before calling `createWater()`; bounds and the world-up-to-local vector are captured once.
- Vertex waves need a subdivided mesh; one quad only moves its four corners. An authored adaptive mesh is fine: the factory clones and retains its topology. The example uses a uniform grid solely for portability.
- The returned seabed is a world-space axis-aligned rectangle covering the water mesh's initial bounds. Add it to an identity scene root. For irregular coastlines or an authored bottom, adapt or omit this demo-style bed; the water surface remains usable, but empty transparent areas will show the background.
- The factory changes the passed textures' sampling settings and assigns a shadow node to `sun.shadow.shadowNode`. Configure the sun to cast shadows and fit its shadow camera; do not assume changing directional-light intensity alone changes the custom water highlight. The separate `water.sunStrength.value` controls that lobe.
- `toSun` is normalized and points **from the surface toward the sun**. Update that Vector3 if the light direction changes. The shader uniform retains this object. The source sun intensity is 9.1, normalized against baked energy 7: preset `sunStrength = 9.1 / 7`.
- The bounding-volume padding assumes wave heights below about 0.2 world units. Expand bounds further or turn off frustum culling for much larger waves. Recreate the water if the surface geometry/transform changes.
- The source application adds a separate color grade and glow. This package reproduces water settings, not the complete scene's final graded appearance. No HDR environment map is required by this shader.

## Current saved settings

| Control | Value | Effect |
| --- | ---: | --- |
| speed | 2.85 | Phase multiplier applied by the render loop |
| scale | 1.85 | Pattern frequency in world space; higher = smaller cells |
| caustics | 0.77 | Pale submerged ribbons |
| glints | 1.5 | Sun sparkle intensity (`sunGlints` in the app's UI) |
| ripples | 1.46 | Texture-derived surface slopes |
| distantBlue / blueDistance | 1 / 66 | Distance-based deep-blue transition |
| foam / foamWidth | 1.5 / 0.88 | Contact foam amount / width in world units |
| waveHeight | 0.065 | Vertical wave amplitude |
| waterDepth | 1.5 | Virtual parallax depth and seabed offset |
| clarity | 0.2 | Transmission; higher reveals more submerged geometry |
| sunStrength | 1.3 | Custom highlight multiplier |

Set these through `water.<name>.value`. `speed` is not a shader uniform. Wave directions, speeds and weights live in `waves.ts`. The near/deep/foam color palette is expressed with `color("#…")` literals in `water.ts`.

## Packed textures: preserve the channels

Both PNGs are **data**, not sRGB color images. Keep `NoColorSpace` and all four channels. Do not convert to JPEG or strip/premultiply alpha: alpha stores variation, not transparency.

| Texture | R / G | B | A |
| --- | --- | --- | --- |
| water-pattern | Encoded slopes around 0.5 | Caustic ribbons / highlight breakup | Broad color variation |
| water-bed | Encoded facet slopes around 0.5 | Stone height variation | Stone tone variation |

The shader uses two surface-pattern samples, one bed-pattern sample and two contact-map samples, plus sun-shadow sampling. There are no reflection/refraction scene captures or procedural noise loops. Refraction is **view-dependent UV parallax**; scene geometry visible through the surface uses alpha blending, not physically refracted object silhouettes. Caustics here do not project onto other scene materials.

## Shoreline and boat foam in a new scene

The contact map encodes **unsigned distance to the resting water/solid intersections**. R = static shore, G = moving object's rest footprint, each `clamp(distance / maxDistance, 0, 1)`. B is unused. Use RGB/RGBA, not two-channel luminance/alpha. `contactInfo` supplies `minXZ`, `sizeXZ`, `maxDistance` and `waterLevel`. The factory sets `flipY = false`, clamp-to-edge, linear filtering and no mipmaps. Pixel row zero maps to minimum world Z; padded borders must contain the maximum distance (white) to prevent foam outside the field.

For a static scene, put all contacts in R and fill G with 255. Leave `water.boatContactFromWorld` as identity. Do not copy our `reference/` mask onto different geometry: its harbor bounds and contact shapes would create unrelated foam and shading.

The included Python baker needs NumPy and Pillow. Use a **single-scene uncompressed GLB** with ordinary triangle POSITION/index accessors; Draco, Meshopt, sparse accessors, skinning and GPU instancing are not decoded. Mark the water node with `extras.surfaceRole = "water"` (or the existing name heuristic `WATER single`). Mark non-solid nodes with the excluded roles `sky`, `foliage`, `glass` or `face`. Optional moving boat nodes use `extras.runtimeRole = "boat"`. These are glTF node extras, not material properties.

```sh
python3 -m pip install numpy pillow
python3 tools/generate-water-contact.py \
  --source /absolute/path/to/your-scene.glb \
  --output-dir ./my-contact \
  --moving-boat
```

Keep `--moving-boat` even for a static-only scene: it emits RGB with a white G channel when there is no boat, matching this shader. Always provide both paths; the original script's defaults refer to portfolio folders. The original project-name heuristics are retained and may need editing for your exporter. It raises an error if no solid geometry crosses the water plane. This handoff verifies the shipped shader/example, not the baker against your geometry.

For one rigid moving object, transform the current world sample back into its world-space rest pose:

```ts
water.boatContactFromWorld.value.copy(restMatrixWorld)
  .multiply(currentMatrixWorld.clone().invert())
```

Reuse a scratch matrix instead of allocating every frame. This is one rigid footprint channel, not a wake/fluid simulation; multiple independently moving contacts need an extension.

## Resource cleanup

`water.dispose()` disposes **only its shadow node**, following the original app's external resource ownership. Also dispose the returned surface geometry/material, seabed geometry/material and textures you own, remove meshes, and stop your animation loop. The complete demo does this on page exit. Do not dispose input resources shared with other materials.

If removing water while retaining the sun/renderer, save the previous `sun.shadow.shadowNode` before creation and restore it after disposal; the original factory overwrites that hook. Use one water instance per shared sun-shadow hookup unless you explicitly manage that ownership. `createWater()` leaves the input mesh's old geometry/material for the caller to dispose or retain.

## Reference documentation

- [Three.js WebGPURenderer](https://threejs.org/docs/pages/WebGPURenderer.html)
- [Three.js Shading Language](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language)

The package is pinned to r184 rather than assuming later TSL/shadow APIs are unchanged. The supported integration target is `WebGPURenderer`; legacy `WebGLRenderer` is not a drop-in replacement. Three.js documents a WebGL2 fallback backend, but this handoff's browser QA covers the default WebGPU path only.
