# Mr. Kerry Capija

Source: user-supplied `040_criatura_obsidiana_PAQUETE_COMPLETO.zip`,
`export/040_criatura_obsidiana_detallada.glb`, checked against the supplied
`040_criatura_obsidiana_detallada.blend`.

The model is a rigid sculpture with no skeleton or animation clips. Its original
geometry and six materials are retained; no external textures are required.

- 8,690 triangles; six material primitives (down from 126).
- Optimized with glTF Transform: `dedup`, `flatten`, `join`, `prune`, `join`, `prune`.
- Validation: finite vertex positions, unchanged triangle count and world bounds
  within 0.00001 of the source export.
- glTF orientation: +Y up, +Z forward.
- Runtime height: 3.2 standing, 2.5 seated; centered on X/Z with the base at Y=0.
- Bulldog seat offset: `[0, 1.55, -0.52]`, keeping the eyes visible and the wings
  above the bodywork. Other pilots retain their existing seat offset.

The flight portrait and preview are renders of this model. The lobby card keeps
the illustration previously supplied by the user.
