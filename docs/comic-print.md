# Acabado cómic

El juego, el hangar y las vistas previas usan un acabado de impresión: color posterizado, puntos de semitono, tramas en las sombras, contornos, desregistro y grano de papel. Se implementa con Three.js, WebGL2 y shaders locales.

| Archivo | Responsabilidad |
| --- | --- |
| `src/character-comic.js` | Aplica el acabado a los materiales del piloto y las naves; conserva sus materiales originales para restaurarlos después del render. |
| `src/surface-halftone.js` | GLSL de tinta y semitono. |
| `src/retro-material.js` | Materiales con iluminación, oclusión y tinta. |
| `src/retro-style.js` | Parámetros, presets y uniformes compartidos. |
| `src/retro-print.js` | Pasada de pantalla: contorno, desregistro, color y papel. |
| `src/paper.js` | Color blanco de papel por defecto. |
| `src/racing-theme.css` | Paleta y textura de papel de la interfaz. |

En la selección de partida, **Papel** cambia las imágenes y el modelo de vista previa. La elección pasa al circuito mediante `comic=0|1`. En el hangar, **Cómic** cambia el renderizado de la nave. El enlace al simulador conserva esa preferencia.

El circuito utiliza sus propios materiales y luces, definidos en `circuit-textures.js` y `circuit-lighting.js`. La preferencia de movimiento reducido se respeta en vistas previas, transiciones y animaciones ambientales.
