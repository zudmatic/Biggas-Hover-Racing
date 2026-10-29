# Biggas Hover Racing

Carreras hover en 3D con cinco personajes, seis vehículos y cuatro circuitos: Ruinas, Nexus, Mario Raceway y Desert Valley. TypeScript estricto, Vite y Three.js; WebGPU con fallback WebGL2, materiales TSL y UI sin framework.

## Ejecutar

```sh
npm ci
npm run dev
```

Abrir la URL que imprime Vite. `npm run build` genera `dist/`; `npm run preview` sirve esa compilación. `npm run typecheck` revisa el juego, la configuración y los scripts TypeScript. `npm run check` ejecuta typecheck y build.

## Páginas

| Ruta | Uso |
| --- | --- |
| `/` | Selección de personaje, vehículo y circuito |
| `/?selection=map&map=desert-valley` | Acceso directo a la selección de Desert Valley |
| `/spaceship.html` | Hangar e inspección de vehículos |
| `/playground/` | Pruebas reproducibles de conducción, cámaras y efectos |
| `/webgpu-preview.html` | Comparación WebGPU, WebGL2 y referencia GLSL |
| `/chubee-studio.html` | Pose y acabado de Bluleet |

`simulator.html` y `propulsor-studio.html` conservan sus redirecciones. El enlace anterior `/?view=spaceship` sigue abriendo el hangar.

Parámetros compartidos: `vehicle=037|038|039|bluleet|040`, `pilot=zud|zudmatic|ajo|bluleet|lomi`, `map=ruins|nexus|mario-raceway|desert-valley`, `comic=0|1`, `renderer=webgl2`. La selección de Zud admite `hat=beanie|samurai_kasa|cloud_chef|crescent_wizard`; Zudmatic conserva sus paletas. Zudoneta 037 es la nave predeterminada (incluidos los enlaces antiguos con `vehicle=033`) y admite `livery=original|cobalto|carmesi|turquesa|violeta`, independiente de la paleta del piloto.

## Controles

W/S: acelerar/reducir velocidad. A/D o flechas izquierda/derecha: dirección. Shift: turbo. Espacio: freno. E: derrape. Q: aceite. R: recuperar vehículo. C: cámara. F: luces. M: sonido. Escape: pausa. Los controles en pantalla muestran las acciones restantes y permiten jugar en dispositivos táctiles. El menú de pausa permite cambiar la calidad, reiniciar y volver a la selección.

La calidad inicial es **Automático**; las preferencias guardadas se conservan. La resolución del mundo se adapta al rendimiento, manteniendo nítida la UI. El audio comparte un contexto y buses de música, voces y efectos. La selección deliberada de un personaje reproduce su voz procedural.

## Organización

- `src/core/`: assets, preferencias, recursos, eventos y registros.
- `src/content/`: definiciones de personajes, vehículos y pistas.
- `src/sim/`: física, colisiones y simulaciones sin DOM.
- `src/game/`: sesión, loop fijo, input, cámaras, HUD e ítems.
- `src/render/`, `src/fx/`, `src/audio/`: presentación y sonido.
- `src/ui/`, `src/tools/`: selección y herramientas.
- `public/`: modelos, texturas, imágenes y audio.

Ver [arquitectura](docs/architecture.md), [agregar contenido](docs/adding-content.md), [Desert Valley](docs/tracks/desert-valley.md) y [validación y rendimiento](docs/performance-refactor.md). Las notas de entregas previas se conservan en [historial de integraciones](docs/gameplay-history.md).

## Assets

```sh
npm run assets:inspect
npm run assets:optimize -- --dry --geometry meshopt --textures ktx2 public/models/boost-pad/boost-pad.glb
```

Los assets existentes se conservan sin recomprimir en este refactor. `--dry` informa tamaños sin escribir. Omitirlo reemplaza los archivos indicados. El optimizador conserva jerarquías, nombres y animaciones; no reduce polígonos. Desert Valley se excluye por defecto porque su export tiene instancias y datos de LOD ajustados manualmente. Verificar siempre apariencia y animaciones al comprimir.

## Validación

```sh
npm run check
BENCH_URL=http://127.0.0.1:5173 npm run bench:desert -- webgpu
```

El benchmark abre Chromium con GPU real, fija la calidad y mide las mismas posiciones con LOD completo y adaptativo. No comparar FPS de WebGPU nativo con WebGL por software. Guardar informes bajo `.context/` u `output/`.

Los tests y capturas locales no se versionan. La API de desarrollo `window.__game` expone el estado y las mediciones; `window.__desertBenchmark` conserva el contrato del benchmark. Antes de integrar, validar selección, todos los mapas/vehículos, pausa/reinicio, cámaras, audio, movimiento reducido y ambos backends. Los paneles DialKit y las APIs de debug no se activan en producción.

El laboratorio independiente `experiments/vfx-lab` conserva su propio `package.json` y dependencias. Ejecutar `npm ci` allí y `npx vite --host 127.0.0.1` para iniciarlo.
