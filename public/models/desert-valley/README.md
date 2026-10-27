# Desert Valley runtime assets

The map remains 875 × 875 m, with the existing road layout, 2293.53 m main
route and 2177.01 m shortcut. The original static GLB remains the collision
source. Its authored water surface is still one quad; the existing runtime
water system builds its wave grid separately.

## Detail and distance LOD

`desert-detail-game.glb` and `desert-detail-manifest.json` contain 54 families,
162 mesh definitions and 333 placements: 277 plants, 18 small rocks and 38
large formations (mesas, talus and pillars). All 38 large formations have the
same editable erosion system in Blender and three exported LODs. Existing
placements are preserved. The manifest records exact triangle counts and
transforms. The runtime keeps 526 original rail instances, totaling 859
scenery placements plus the independently animated train.

All detail instances forced to one level total:

| Level | Triangles |
| --- | ---: |
| LOD0 | 693,240 |
| LOD1 | 336,869 |
| LOD2 | 120,259 |

These are detail geometry totals, **not** whole-frame counts. Actual rendering
also includes the base map, ship, train, water, effects and shadow passes.

LOD distances are measured from the ship, using distance to world bounds for
large formations. Thresholds have 12% hysteresis. Changes are evaluated at most
every 120 ms after 2 m of movement. Species are grouped into 96 m cells and
batches of at most 128 instances; existing buffers are reused. Only nearby
vegetation casts shadows. Formations never disappear; small vegetation and
rocks have species-specific distance culling.

| Family | LOD0 → LOD1 | LOD1 → LOD2 | Cull |
| --- | ---: | ---: | ---: |
| Palms | 55 m | 150 m | 600 m |
| Cacti | 35 m | 100 m | 360 m |
| Grass | 12 m | 32 m | 90 m |
| Shrubs / agave | 22 m | 60 m | 180 m |
| Small rocks | 35 m | 95 m | 280 m |
| Mesas / talus | 100 m | 260 m | never |
| Pillars | 45 m | 130 m | never |

This is resident geometry LOD: the package downloads once; distance controls
which meshes are drawn. It does not yet stream separate files over the network.

## Look and compression

The desert defaults to lit materials, a directional sun, hemisphere sky fill,
ACES tone mapping, modest saturation/contrast and turquoise river colors.
Its natural post pass omits paper, outlines and comic glow. The optional paper
toggle remains available. Other circuits retain their defaults. Heat effects,
Lomi's lens and Bluleet's stencil silhouette work in both looks.

The sandstone material is shared across the rocks. Its 2048 px tangent normal
combines approximate height from diffuse luminance with procedural microrelief;
it is not a scan or a high-poly sculpt bake. Geometric erosion supplies the
large relief on every formation. Vegetation uses one shared opaque atlas with
vertex colors. The detail GLB uses Draco geometry and WebP textures (quality 90):
36,865,064 bytes raw → 6,704,680 bytes compressed, an 81.8% reduction.

The base map stays at 4,849,004 bytes, already Draco-compressed. The train stays
byte-identical at 598,296 bytes, with 44,940 vehicle triangles plus 480 runtime
coupling triangles. SHA-256:
`a62d5e819001a6cf7d4d39428e4a3a8dbfbe3d41375176cf726742149a11c3c0`.

## Authoring and reproduction

Authoring stages are preserved locally outside this PR. The latest is
`assets/maps/desert-valley/all-rock-detail/desert-circuit-step27-all-rock-detail-v01.blend`.
The shared group is `GN_S23_Sandstone_Erosion_v01`; LOD0 retains its editable
modifier. LOD1/2 derive from the evaluated detailed surface. The preceding
Step 25/26 files and original meshes remain preserved.

Run `scripts/export-desert-detail.py` through Blender MCP with the authored
scene open. It reads the local vegetation kit manifest and the scene's rock
manifest, exports copies in a temporary scene, preserves glTF vertex colors,
and writes raw geometry plus placement metadata. Then run:

```sh
node scripts/compress-desert-detail.mjs
```

This pins glTF Transform 4.5.1, performs no additional mesh simplification and
does not touch the train or base map. The runtime requires only this directory's
assets, the Draco decoder and existing water textures, not the Blender files.

## Validation

`tests/desert-lod.spec.js` checks hysteresis, teleport transitions, empty-batch
recovery, transform preservation, population, source replacement and compressed
asset loading. `tests/desert-look.spec.js` checks map defaults, explicit paper
choices, camera-independent LOD and Lomi/Bluleet compatibility across looks.

```sh
TEST_PORT=5175 npx playwright test tests/desert-lod.spec.js
TEST_PORT=5175 NATIVE_GPU=1 npx playwright test tests/desert-look.spec.js
TEST_PORT=5175 NATIVE_GPU=1 TEST_RENDERER=webgl2 npx playwright test tests/desert-look.spec.js
BENCH_URL=http://127.0.0.1:5175 node scripts/benchmark-desert.mjs
```

The benchmark opens native Chromium at 1280 × 800, DPR 1 and high quality with
4× MSAA. It compares full/adaptive LOD at identical paused poses, then samples
driving separately. JSON reports and screenshots go to `output/desert-benchmark`.
Use a native GPU: headless software rendering is not a representative FPS test.

### Local measurement, 2026-10-27

Native Chromium 153, Apple Metal 3, 1280 × 800, DPR 1, high quality / 4× MSAA.
The final quick run used 1 s warmup + 1.5 s stationary samples, followed by
5 s driving samples. Raw results: `benchmark-2026-10-27.json`.

- WebGPU: about 120 FPS stationary (display-limited); 107.8 FPS driving,
  p95 frame time 9.0 ms.
- WebGL2: 78.7 FPS driving, p95 9.4 ms. Cold-use stalls lowered short stationary
  means to 37–120 FPS; this fallback still needs warmup/stutter optimization.
- Adaptive detail: 206,328 triangles at the station and 192,588 at the river,
  versus 693,240 with all LOD0: 70–72% fewer detail triangles.
- Whole-frame averages, including shadows: 598,518 → 395,686 triangles at the
  station and 351,459 → 303,419 at the river. Triangle savings are not an
  equivalent FPS gain. No browser errors in either benchmark run.

These short desktop measurements do not establish performance on mobile or
other GPUs. `BENCH_QUICK=1` selects the shorter benchmark; the default samples
four poses for 4 s each.
