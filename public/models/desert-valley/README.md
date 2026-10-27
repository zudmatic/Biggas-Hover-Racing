# Desert Valley runtime assets

The game loads `desert-valley-static-game.glb`, `freight-train-40-game.glb`,
`driving-guides.json`, `railway.json` and `gameplay.json` from this folder.

The two GLBs and current guides/railway metadata are unchanged copies from
the optimized `biggas_optimized_20261027_011806` export. They retain Draco
compression, embedded JPEGs, GPU instancing, baked ground color and vertex
colors. `gameplay.json` is the legacy spawn/checkpoint template; the runtime
adapter scales and projects it onto the current guides.

- Map: 875 × 875 m; main lap 2293.53 m; shortcut lap 2177.01 m.
- Scene: 116384 triangles including 747 instances; water is a two-triangle quad.
- Train: locomotive and 40 wagons, 44940 vehicle triangles, shared geometry.
- The 480-triangle static coupling preview is hidden; runtime adds 40 links
  totaling 480 triangles between the supplied coupling endpoints.
- Old scene exports and Blender stage files remain in the original local
  workspace; they are not required for this runtime or included in this PR.

No tests, build, lint, typecheck or browser/gameplay QA were run for this change,
as requested. Geometry counts come from GLB accessor metadata.
