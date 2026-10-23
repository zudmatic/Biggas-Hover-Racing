# Stylized Nature MegaKit — garden subset

12 models from the user-supplied Standard pack by Quaternius, licensed CC0 (see `License_Standard.txt`). Only the glTF models used in `src/nature-garden.js` and their diffuse textures are included.

Textures are resized to at most 512 × 512 for the web. Unused normal maps are omitted because the scene uses its shared Lambert/Retro Print material. `Bush_Common` uses the pack's green `Leaves_NormalTree_C.png` instead of its original red leaves. Geometry and UVs are unchanged.

The garden loads each model once and instances repeated plants, flowers and rocks. Model heights and placement are configured in `src/nature-garden.js`.
