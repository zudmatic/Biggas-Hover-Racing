# Agregar contenido

El contenido vive en registros tipados. Los ids son estables: se usan en URLs y preferencias. Las definiciones se importan al abrir el menú; los modelos y sistemas pesados se cargan dentro de `create` o `load` con `import()` dinámico.

## Personaje

1. Copiar el GLB a `public/models/<personaje>/` y las tarjetas a `public/images/flight/`.
2. Crear `src/content/characters/<personaje>/index.ts` con una `CharacterDefinition`. Ver `ajo/index.ts` o `bluleet/index.ts`.
3. Implementar una subclase de `Character` con `root`, `update(time, moving)` y `dispose()`. Para esqueletos compatibles se puede reutilizar `MannequinPilot`.
4. Registrar la definición en `src/content/characters/index.ts`.

Declarar `customization.hats`/`palettes` solo si el personaje implementa esas funciones. `voice` acepta el contrato `BabbleOptions` (pitch, formant, speed, intonation, volume…). Las voces se mezclan en el bus de voz y respetan mute/volumen. Verificar la pose en asientos `cockpit`, `saddle` y `kart`.

## Vehículo

1. Guardar el GLB y las tarjetas en `public/models/spaceship/` y `public/images/flight/`.
2. Crear una carpeta en `src/content/vehicles/` con una `VehicleDefinition`; usar una nave existente como referencia.
3. Definir modelo, transformaciones, asiento, colisión (`hull`), luces, escapes (`engine.exhausts`) y grupos del hangar.
4. Registrar en `src/content/vehicles/index.ts`.

`Vehicle.load()` prepara el modelo, sienta al piloto, agrupa las partes estáticas por material y conserva geometría indexada. Declarar en `liveNodes` las partes con rig o morph targets para no hornearlas. La tela, ojos y plasma son componentes con ciclo de vida propio. Un comportamiento adicional implementa `VehicleComponent` y se declara en `components`.

Las coordenadas son metros, +Y arriba y +Z adelante. La escala de presentación no debe hornearse otra vez en el GLB. Probar todas las combinaciones de personaje/asiento y los modos normal, turbo, derrape y pausa.

## Pista

1. Guardar modelo, colliders y datos de ruta en `public/models/<pista>/`.
2. Crear una `TrackDefinition` en `src/content/tracks/<pista>/index.ts` y registrarla en `src/content/tracks/index.ts`.
3. Para circuitos convencionales, cargar con `CircuitTrack.load`. Un mundo especial puede implementar la clase `Track`.

La definición incluye look, música y clave de récord. La pista expone ruta, altura de superficie, colisión, actualizaciones y liberación de recursos. `RaceSession` llama `warmup` después de crear el render definitivo, antes de revelar la pista, para preparar los objetos que pueden aparecer más adelante.

Desert Valley usa dos escenas GLTF: la escena visible y `DESERT_RUNTIME_DATA`. Conservar ambas, sus nombres, extras, instancias y prototipos LOD. No ejecutar el batcher genérico ni la compresión automática sobre ese export.

## Recursos y rendimiento

- Cargar GLB/JSON/binarios mediante `AssetLoader.shared`. El renderer configura Draco, meshopt y KTX2 antes de cargar texturas comprimidas.
- Registrar recursos y listeners con `DisposableGroup` o con el dueño del sistema. Liberar cada recurso una vez y contemplar errores/cancelación durante la carga.
- Simular a paso fijo; interpolar la presentación. Evitar `await`, consultas DOM y objetos temporales dentro del paso de física.
- Usar `npm run assets:inspect` para localizar modelos pesados. Probar primero `assets:optimize -- --dry`; verificar nombres, materiales, skinning, morphs y animaciones después de comprimir.
- `npm run check` debe pasar. Hacer verificaciones visuales y funcionales locales en WebGPU y WebGL2 antes de integrar.
