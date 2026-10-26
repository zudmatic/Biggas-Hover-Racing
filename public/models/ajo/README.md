# Ajo

`ajo.glb` is the unmodified `public/assets/cat/ajo-movement.glb` from the author's
[portfolio-27 PR #1](https://github.com/git-chad/portfolio-27/pull/1), at commit
`5466235a9d01e4745f55d0c5f69dd48618750182`.

Source SHA-256: `c1893d48aed54c3463acfd5613a0306124a0cb37089ae0a5786814fa59d24270`.

This is the combined bundle loaded by that PR's movement scene, including the
updated rig, denim and sneaker textures, face atlas, and relaxed idle. Selection
uses `Ajo Relaxed Idle`; the racing adapter poses the same rig for the cockpit
and the Nómada saddle without modifying the supplied file or body proportions.
His visible head/body size matches Zudmatic across the three vehicles. The roster
normalizes his body height without counting the tall ears. Scaling is uniform,
preserving the source proportions; the pose test compares his width and head
crown height directly with Zudmatic's rig.

Nómada is Ajo's signature vehicle. He sits back in the saddle, leans forward
from the hips, and keeps his head upright. His palms meet its original rubber
grips via a two-bone arm pose, with no handlebar extensions or stretched limbs.
The pose test measures contact against grip meshes in the actual bike GLB, including
after the vehicle rotates and scales. Raised footrests support his short legs.
The full source animation bundle is retained (7,217,624 bytes).

Regenerate the roster portraits and fallback images from the model with
`node scripts/render-pilot-previews.mjs ajo` while the local Vite server is running.
