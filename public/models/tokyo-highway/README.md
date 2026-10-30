# Tokyo elevated circuit — driving test

Replaces the old aesthetic-test map in PR #17. The highway centreline is 3,180.81 m (the racing guide uses the outer carriageway, approximately 3.28 km),
inside an 875 × 875 m area. The bridge retains its authored 300 m span.
The tunnel and narrow alley are optional routes; all five checkpoints are on
shared sections. Both alternatives appear on the minimap.

`tokyo-highway.glb` contains only visual meshes (147,111 triangles).
`tokyo-collision.glb` contains 50,457 triangles with explicit `collision_role`
extras and `COL_FLOOR_` / `COL_SOLID_` names. Collision is independent of textures.
The layered floor query keeps the vehicle on the correct spiral level. The
existing airborne physics is enabled for the alley entry.

The floor keeps the authored driving geometry. Narrow median strips bridge
40 cm seams for the point-based hover query. A continuous floor covers the
closed drawbridge's mechanical joints. The deliberate alley jump gap stays
open. Cosmetic light fittings, cables and guide arrows have no collision.
Structural collision was simplified; the maximum measured source-vertex
deviation is 0.145 m. This is a driving prototype, not a final optimized map.

The bridge is static and closed in this export. Bridge animation, boat timing,
final alley art and a jump at the alley return are not implemented in this pass.
The editable source retains its bridge rig, Geometry Nodes and manual curves.
Night lighting from the PR is retained, with 24 bridge and 44 tunnel fixtures.

## Re-export from Blender

Use the live `Tokyo_Editable` scene from `tokyo-circuit-editable.blend`.
Save a backup of the latest manual edits before running either script via
Blender MCP. Do not apply modifiers in the authoring file.

1. Execute `scripts/blender/tokyo-prepare-export.py` with `__file__` set to its
   absolute path and `TOKYO_EXPORT_DIR` set to the bundle output directory.
   It creates a separate static `Tokyo_Playtest_Export` scene and exports route
   metadata from the editable curves. It stops if that export scene already
   exists, so an earlier export cannot be silently overwritten.
2. Execute `scripts/blender/tokyo-finalize-export.py` with the same globals.
   It validates floor coverage, prepares collision seams, saves a standalone
   `tokyo-circuit-export.blend`, and exports separate visual/collision GLBs.
3. Inspect the export scene and validation report, then return to the editable
   file. Keep the static export scene out of the authoring file.
4. Import the bundle and check the actual runtime collision:

   ```sh
   npx tsx scripts/assets/prepare-tokyo.ts /absolute/path/to/bundle
   npx tsx scripts/assets/verify-tokyo.mjs
   npm run check
   ```

The local delivery includes `tokyo-before-cleanup.blend` (all historical scenes),
`tokyo-circuit-editable.blend` (only circuit and generator sources), and the
independent static export copy. Blender files are kept locally, not in the PR.

Development `testSpawn` values: `start`, `bridge`, `tunnel`, `alley`, `jump`,
`spiral`. The browser smoke test uses the development server on port 5174:
`node scripts/check-tokyo-browser.mjs`.
