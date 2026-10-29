# Current playable version: Biggas Forest

The existing `biggas-city` ID now selects **Biggas Forest**; URLs remain valid.
The lap record key is new because the obstacle layout has changed. The runtime
loads only Core, Forest_LOD1 and Cascade. Original City and Landmark GLBs remain
on disk as source assets, but buildings, train, market, monument and ads are
absent from the playable map.

`biggas-forest.js` changes the former urban paving to grass, splits the existing
main surface into asphalt and dirt (1250–2150m), and removes the dirt sector's
paint, urban drains and parapets. Collision uses the original road triangles.
Shared authored trees populate the former city and flank the trails. Eight
collidable trunks alternate sides at 1660–1863m, leaving a tested slalom line.
The original optional jump remains, with an earth surface.

`biggas-forest-adventure.js` supplies earth bypasses and a continuous, irregular
basalt cave behind the waterfall, with open portals, daylight apertures, physical
walls and extended floor edges. The cave uses fewer than 4,000 shell triangles;
rock props use shared materials and merged geometry. Water animation, mist and
river details remain in the original water system. Dirt emits local dust;
pause/reduced motion disable its movement as appropriate. No city fixture lights,
train audio or ad texture are loaded. Forest texture tiles stay at 256px desktop /
128px mobile; a dedicated earth tile adds gravel and shallow ruts.

The implementation lives in `src/content/tracks/biggas-forest/`. `ForestTrack`
implements the shared typed Track API; GLBs use the central AssetLoader, and the
scene uses main's natural/comic render pipelines, dynamic camera and audio buses.
Only this track opts into the authored ramp launch and forest collision behavior.
Waterfall/wind ambience and the cave engine echo follow the shared mute/pause state.

Run `npm run check` for TypeScript and production-build validation. Local-only
forest checks cover ground support, tree impacts, driven slalom, cave clearance,
dust lifecycle and takeoff/landing at 16–72 m/s. Tests are not committed, following
main's repository convention.
The original import and previous Blender refinement notes below describe source
assets, rather than the current scene composition.

## Anime horizon and materials

The forest now uses its own `ForestAnimeMaterial` and `ForestAnimePipeline`.
Three lighting bands preserve the shared painted textures, vertex AO, shadows
and emissive controls. A restrained rim light and foreground depth contours
run without extra scene passes. Projection is stable; the previous PSX jitter
is removed. Water, foam, glass and exhaust retain their animated materials.
The comic toggle still works; other tracks retain their existing looks.

One camera-following open cylinder replaces both distant mountain meshes:
128 triangles on desktop / 64 on mobile, one draw, no shadows or colliders.
The generated 2172×724 alpha WebP is 480 KiB. Mirrored horizontal sampling
joins both ends continuously, including the skyline mask. Lower-edge haze
and night tint blend the panorama into the existing sky. Asset provenance
and the generation prompt are in `public/textures/biggas-forest/README.md`.

# Biggas City 039 v02

Imported from the supplied `Biggas_City_039_v02_Game_Package.zip`. The final
`Biggas_City_039_v02.blend` is the native visual reference (Day and Dusk scenes).
The runtime loads Core, City, Forest_LOD1, Cascade and Landmark at their shared
origin, scale 1. Forest_LOD1 replaces the full forest; it is not an extra layer.

Reimport from the repository root:

```sh
python3 scripts/import-biggas-city.py /path/to/Biggas_City_039_v02_Game_Package.zip
```

The script converts route, spawn and checkpoint vectors from Blender `(x,y,z)`
to glTF `(x,z,-y)`, without scaling. All 1818 samples, 12 spawns and 32
checkpoints are retained. Collision uses COL_ROAD and both COL_BARRIER meshes;
the unrelated statue toe accidentally included in that export is ignored.
The same stray toe is ignored in visual collections other than Landmark.

The exporter omitted procedural base colors for asphalt, terrain and basalt.
The runtime restores the midpoints of their linear RGB Color Ramp stops from
the final native Blender file, using the game’s procedural surface textures.

Shared vegetation is instanced by prototype in spatial cells, with fixed buffer
capacities to share shader layouts. Each frame compacts those batches to the
instances intersecting the view or the sun shadow camera, preserving offscreen
shadow casters and the original bounds for camera turns. Opaque architecture is
merged by material in 320 m cells; transparent materials keep 160 m cells.
Static batches reuse matching position/normal/UV vertices through index buffers.
The full geometry, material textures and lighting remain unchanged. The existing sky, sun, hemisphere fill, shadows, vehicle
headlights, comic mode and day/night controls are reused. All 39 authored point
lights and four monument spotlights stay on at fixed positions, independently
of the ship position and day/night setting. Exported Blender light intensities
are capped for the game renderer; these fixtures do not add shadow maps.

Water vertices and flow-aligned UVs, accelerating foam streams following the
curved curtain, soft spray, impact rings and forest leaves animate in game time. Pause freezes animation; reduced motion makes water
static and hides airborne leaves, streams and spray. Leaves follow FOREST
route samples. Mobile uses fewer particles while retaining every light.
Hidden water skips CPU deformation and uploads; on re-entry it evaluates the
current absolute game time, so currents and foam remain in phase.

Short movements across unsupported road seams resolve against the last
supported edge and bounce. Normal impacts preserve tangential motion and a
brief backwards impulse, triggering the existing impact audio, sparks and
camera feedback. Genuine departures still request recovery after a short
unsupported-surface grace period or the existing off-road limits.

Generate selector previews from the actual scene with a running Vite server:

```sh
node scripts/render-biggas-city-previews.mjs http://127.0.0.1:5173
```

Reproduce render measurements (same six views, shadows, 960×640, normal/comic):

```sh
node scripts/benchmark-biggas-city.mjs http://127.0.0.1:5173 current
```

Results and screenshots are written to `.context/performance-current/`. The
benchmark uses the game's WebGL2 fallback with a completed GPU frame per sample;
its timings compare rendering cost, not the complete driving application's FPS.

## Blender refinement

The integrated forest and monument received a Blender 4.5.7 LTS pass using the
audit, optimization, vegetation and export workflow from
[Blender Skills](https://github.com/arjun988/blender-skills). Blender ran headless
with `bpy`; a Blender MCP connection is not required for this pass.

- Eight shared vegetation templates carry subtle grayscale vertex occlusion.
  The forest retains all 5,260 objects, 13 mesh prototypes and 3,517,995 placed
  triangles. The colors survive the game's instancing and PSX materials.
- Four dense bronze body forms were decimated, reducing the complete Landmark
  collection from 405,656 to 166,334 triangles. Eyes, facial ornaments, lettering
  and plaza props retain their geometry. Bidirectional vertex-to-surface checks
  measured a maximum deviation of 1.32 cm on the four edited forms; this is a
  sampled surface check, not a continuous Hausdorff-distance guarantee.
- The two GLBs together shrink from 10,016,308 to 5,625,984 bytes. No textures,
  materials or lights are added. Object transforms, bounds, material assignments
  and all four monument spotlights were checked after export. Blender gives the
  already duplicated `CAT_Medallion paw toe.002` a unique `.003` name; both retain
  their original placement. Runtime matching uses their unchanged prefix.
- Core, City, Cascade, collision meshes, routes and the supplied original blend
  are untouched by this pass. Before/after views were reviewed in the game's
  renderer, including a close view of the monument's face.

The report is `blender-refinement-report.json`. Reproduce against an **unrefined**
copy of the game-package GLBs (reimporting the ZIP overwrites this refinement):

```sh
blender --background --disable-autoexec --python scripts/refine-biggas-blender.py -- \
  --input-dir /path/to/unrefined-glbs --output-dir /path/to/staging
```

The script saves separate editable `Forest_LOD1_refined.blend` and
`Landmark_refined.blend` files, staged GLBs and a report. Review those exports
before replacing the two public assets; do not use the integrated assets as
input for repeated decimation. Workspace backups and editable results from this
pass are in `.context/blender-pass/` (gitignored).
