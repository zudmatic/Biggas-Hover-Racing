# ActionForge animations for Zud

Source: https://actionforge.app/ — downloaded 2026-10-22.
Animation author: Quaternius, https://quaternius.com/.
Animation licence: CC0 1.0 Universal, https://creativecommons.org/publicdomain/zero/1.0/.
ActionForge identifies the rig and animation as Quaternius / CC0 in its footer.
ActionForge application code is separately copyrighted by CGstuff and is not included.

`zud-clips.glb` is the animation-only GLB exported by ActionForge onto Zud's
own humanoid skeleton (Mixamo bone naming, T-pose). Export settings: GLB,
**In place**, **Include character mesh** off, one combined file. Clips:

- Idle Loop (2.5 s)
- Walk Loop (1.333 s)
- Jump Start (1.333 s)
- Jump Loop (2.5 s)
- Jump Land (1.267 s)
- Dance Loop (1 s)

To replace them, import Zud's rigged model in ActionForge, choose “Keep its
skeleton — map its bones”, finish the mapping, select these six clips and
export with the same settings. Keep the exported animation names unchanged.
Save the file here and run `node scripts/prepare-actionforge.mjs`.

The generated `src/animation-data/actionforge.json` contains only rotation
samples, at 30 fps, with closed loop endpoints. Runtime adaptation lives in
`src/actionforge-animation.js`: joint ranges are reduced for Zud's short
limbs; elbows/knees use hinge flexion; idle uses the captured variation
relative to its first frame. Source translations and ankle/wrist twist are
not applied to the live shell rig. Scene navigation and jump physics own
position, with sole contact correction in `src/zud-animation.js`.

Walk sampling follows actual travel distance. Jump Start/Loop/Land are
compressed into the existing 0.8-second gesture, or follow manual jump and
landing state. Dance Loop plays at its original one-second duration, including with the disco
music clock. It preserves captured shoulder, thigh and torso amplitudes;
elbows and knees respect the shell rig hinge limits. Sole support sets its
height, with no additional procedural bounce. The same
animator drives the scene and Character Lab. Desk, bed, prop interactions,
and reduced-motion behavior retain their existing controls.
