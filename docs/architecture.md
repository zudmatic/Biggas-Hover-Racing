# Arquitectura

Biggas Hover Racing es TypeScript estricto sobre Vite 7 y three.js 0.182
(`WebGPURenderer` + TSL; WebGL2 como fallback del mismo renderer). No hay
framework de UI: el DOM se arma con clases pequeñas.

```
src/
  main.ts            Router de entrada (lobby u hangar).
  core/              Infraestructura sin dependencias del juego.
  content/           Contenido declarativo: personajes, vehículos, pistas.
  sim/               Simulación pura (física hover, colisiones, aceite, placas).
  game/              Sesión de carrera: loop, corredores, cámaras, HUD, features.
  render/            Renderer, calidad adaptativa, pipelines de post, materiales TSL, luces, cielo.
  fx/                Efectos visuales (propulsores, humo, aceite, calor, agua, plasma).
  audio/             Sistema de audio: buses, música, SFX, 3D, motor, voces.
  ui/                Lobby, menús, control de sonido, estilos.
  tools/             Herramientas internas (hangar, playground, estudios, revisión del desierto).
```

Las dependencias van en una sola dirección:

```
ui ─► game ─► content ─► fx / render / audio / sim ─► core
                └──────────────► sim
```

`sim/` no importa nada de render ni del DOM, así que el mismo código sirve para
el jugador, rivales IA y (más adelante) multijugador.

Alias de imports: `@/` = `src/`. Dentro de una carpeta se usan imports relativos.

## core/

| Módulo | Para qué |
| --- | --- |
| `registry.ts` | `Registry<T>`: catálogo ordenado por id con fallback (`resolve(id)`). Todo el contenido se registra acá. |
| `disposable.ts` | `Disposable` y `DisposableGroup` (recursos + listeners que se liberan juntos). |
| `emitter.ts` | Eventos tipados. |
| `settings.ts` | Preferencias persistidas (calidad, volúmenes, sonido). Mismas claves de `localStorage` de siempre. |
| `assets/asset-loader.ts` | Único punto de carga de GLB/JSON/binarios. Draco + meshopt + KTX2 configurados. |
| `debug/dials.ts` | Paneles DialKit (solo editables en desarrollo). |
| `types.ts` | Tipos compartidos: `GamePhase`, `SeatFit`, `RacerChoice`, `Vec3Tuple`. |

## Contenido declarativo

Cada personaje, vehículo y pista es una carpeta con un `index.ts` que exporta
una *definición* (datos) y se registra en el `index.ts` de su tipo. La
definición carga lo pesado con `import()` dinámico, así que los menús no bajan
modelos que no se usan. Ver [Agregar contenido](adding-content.md).

- `content/characters/` → `characters: Registry<CharacterDefinition>`; cada uno crea un `Character` (clase base con `root`, `update`, `dispose`).
- `content/vehicles/` → `vehicles: Registry<VehicleDefinition>`; `Vehicle` arma el modelo, sienta al piloto y suma componentes (tela, ojos, plasma…).
- `content/tracks/` → `tracks: Registry<TrackDefinition>`; `Track` (clase base) con `CircuitTrack` (GLB + colliders genéricos) y `DesertValleyTrack`.

Cualquier personaje puede ir en cualquier vehículo: el vehículo declara su
asiento (`seat.fit`: `cockpit`, `saddle` o `kart`) y offsets por personaje.

## Simulación (`sim/`)

- `Landscape`: ruta cerrada, `roadAt` (índice espacial), `atDistance`, gates, spawn.
- `HoverPhysics`: integrador determinista a 60 Hz. No guarda estado del vehículo: el `HoverState` es data plana (serializable para red).
- `TrackCollision` / `SurfaceIndex`: colisión con octree y altura de superficie.
- `OilSimulation`, `BoostPadSimulation`, `PadEnvelope`, `RenderInterpolator`.

## Sesión de carrera (`game/`)

`RaceSession` arma todo y es dueño del ciclo de vida:

- `FixedStepLoop`: simulación fija a 60 Hz + render interpolado. Nunca hace `await` dentro de un frame.
- `Racer`: estado + progreso de gates + interpolación + un `RacerController`.
- Controladores: `RaceInput` (teclado/touch del jugador), `AutopilotController` (sigue la ruta; base para rivales IA y la cinemática de la Bulldog). Un controlador de red implementa la misma interfaz.
- `CameraRig` (Klipp + cámara clásica + a bordo + FOV por velocidad), `Hud` + `Minimap`, `RaceScreen` (DOM).
- Features por pista/vehículo: aceite (`oil/`), placas turbo (`boost-pads/`), intros (`intro/`).
- `RaceDebug`: solo en desarrollo, expone `window.__game` / `window.__desertBenchmark`.

## Render (`render/`)

- `GameRenderer`: crea e inicializa `WebGPURenderer` (o WebGL2 con `?renderer=webgl2`).
- `QualityController`: modos `auto` / `high` / `performance`; en `auto` baja la resolución interna si el frame time sube.
- Pipelines de post (`RenderPipeline`): `comic` (tramas, contornos, glow) y `natural` (look soleado del desierto). Registrados por id de look; las pistas declaran su `look`.
- `render/shaders/`: bloques TSL reutilizables. `render/materials/`: materiales y estilos (cómic, retro print, halftone, toon).
- `render/three-fixes.ts`: workarounds documentados de three r182 (con condición de remoción).

## FX (`fx/`)

Contrato `Effect` (`update`, `reset`, `setQuality`, `dispose`) y `FxSystem`
que los agrupa. Los propulsores implementan `ExhaustEngine` y se registran por
`EngineKind` (`flame`, `singularity`): un vehículo nuevo elige su familia por id.

## Audio (`audio/`)

Un solo `AudioContext` (se crea en el primer gesto del usuario) y un árbol de buses:

```
destination ← master (sonido on/off)
                ├─ music   (volumen de música; se agacha bajo las voces)
                ├─ voice   (voces de personajes con @gitchad/babble)
                └─ compressor ← effects (volumen de efectos)
                                  ├─ engine  (motor procedural)
                                  ├─ world   (emisores 3D: tren, props…)
                                  ├─ cues    (impacto, cuenta regresiva…)
                                  └─ ui
```

- `audio/catalog.ts`: música (`musicCues`) y samples (`sounds`) registrados por id.
- `MusicPlayer`: una pista por escena con crossfade.
- `SpatialEmitter`: fuente HRTF con fade por distancia; `audio.createEmitter(position, options)`.
- `EngineSynth`: motor procedural con perfil configurable por vehículo.
- `VoiceSystem`: `audio.speak(texto, definicion.voice)`.

## Convenciones

- TypeScript estricto, sin `any`. `npm run typecheck` tiene que pasar.
- Clases para lo que tiene estado y ciclo de vida (`load`/`update`/`reset`/`dispose`); funciones para lo puro; `const` tipadas para datos.
- Nada de escribir en el DOM por frame salvo que el valor cambie. Nada de `dataset` como canal de tests.
- Tests: no se commitean (están en `.gitignore`). Usar la API de debug en desarrollo.
- Textos de UI en español; código y comentarios en inglés.
