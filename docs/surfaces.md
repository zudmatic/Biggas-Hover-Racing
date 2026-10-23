# Superficies del piloto

`src/surface-library.js` genera texturas procedurales deterministas para los materiales. `src/character-surfaces.js` aplica las recetas a Zud, cuyo aspecto aprobado se guarda en `src/character-base.json` y se combina con los valores de los ojos en `src/character-settings.js`.

El cuerpo usa piel mate (`#302727`), el gorro tejido (`#d95326`), los ojos blanco cálido (`#fffefa`) y las pupilas oscuras (`#251e1d`). El mismo modelo aparece en la selección de personaje y como piloto de ambas naves.

Cada receta controla densidad, contraste, relieve, moteado y variación entre caras. Las texturas se generan en gris; el material aporta el color. Los mapas de color usan sRGB y los mapas de relieve son lineales. El UV de superficies del personaje contempla la escala de las piezas para mantener una densidad consistente.

Las naves conservan sus materiales y UV originales de los GLB. Los circuitos tienen su propia biblioteca en `src/circuit-textures.js`.
