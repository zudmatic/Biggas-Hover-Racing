# Desert Valley

Desert Valley está disponible en `http://localhost:5173/?selection=map&map=desert-valley`.
La escena actual mide 875 × 875 m; la vuelta principal mide 2.293,53 m y la
vuelta por el atajo 2.177,01 m. Carga `desert-valley-map.glb` y adapta
`driving-guides.json` al contrato de conducción. Conserva los assets anteriores,
el asfalto/arena horneado, los colores de vértice y las 747 instancias del export
actual, repartidas en celdas de 200 m y lotes de hasta 128. Las seis rampas son
superficies conducibles; la inclinación de la nave sigue su pendiente.

El mapa completo está en `public/models/desert-valley/desert-valley-map.glb`:
terreno, circuito, montañas bajas con normal compartida, vegetación, torre y proa.
Sus materiales, texturas, instancias y datos de LOD están incluidos. El único GLB
separado que carga el circuito es `freight-train-40-game.glb`, para el tren articulado.
El mapa activo usa el archivo comprimido entregado por el usuario: 3.078.744 bytes,
con Draco y `KHR_mesh_quantization`; las texturas mantienen sus resoluciones de juego.
El original sin comprimir está en `output/user-compressed-map-20261027/desert-valley-map-before-user-compression.glb`.
Al volver a comprimir se deben
conservar nombres de nodos, `extras` de escena y `EXT_mesh_gpu_instancing`.
La escena predeterminada `Desert Valley Map` muestra una sola representación por
colocación. La segunda escena, `DESERT_RUNTIME_DATA`, contiene únicamente datos
de colisión y prototipos LOD para el juego: no debe activarse junto a la escena
visible. Al comprimir, conservar ambas escenas; el loader las administra.
Los antiguos GLB por componentes quedan como respaldos y ya no se cargan.

La largada está sobre la calzada frente a la estación de servicio, mirando hacia
la bifurcación del camino con obstáculos. La ruta comienza allí; los checkpoints
siguen ese orden y están en tramos comunes para permitir tanto el atajo como el
desvío de asfalto. Cruzar la largada por primera vez no completa una vuelta.

Los saltos usan ajustes exclusivos de Desert Valley: gravedad de 19 m/s² al
subir y 30 m/s² al caer, impulso vertical limitado a 14 m/s y un rebote de
aterrizaje amortiguado durante 0,42 s. El resto de circuitos conserva su manejo.
La altura necesaria para superar cada vagón queda pendiente de la prueba manual.

El GLB conserva su quad de dos triángulos. En runtime se genera una malla para
olas largas de hasta 0,38 m, descartando celdas secas y reduciendo el movimiento
junto a la costa. La física y el shader comparten el campo de olas; caminos,
puente y rampas conservan prioridad como superficie de conducción. El preset
reduce el patrón repetitivo y los brillos sobre el río grande. La espuma usa un
mapa de distancias 512² generado una vez desde las intersecciones de esta costa.

Al sobrevolar el agua aparecen manchas de espuma irregular, gotas con caída y
pequeños abanicos de salpicadura lateral. Reutilizan el dither del propulsor y
las siluetas procedurales del derrape, con tonos claros sin emisión luminosa.
Los anillos de la primera versión se reemplazaron por estos efectos. Dependen
de velocidad y altura, dejan de emitir a 3,2 m por defecto y usan una máscara
conservadora para excluir tierra/caminos. Son tres pools reutilizables: hasta
688 triángulos de efectos en escritorio y 352 en móvil. Se congelan en pausa, se limpian al
recuperar/reiniciar y se omiten con movimiento reducido. La malla del agua tiene
un techo de 32.768 triángulos en escritorio y 12.800 en móvil antes de descartar
celdas secas; el conteo efectivo se expone en `data-water-triangles` y los efectos
en `data-water-effect-triangles` del elemento `.flight-app`.

En el panel DialKit existente, **Agua · espuma y salpicones** permite ajustar
intensidad/densidad, ancho/persistencia de espuma, tamaño/altura/alcance lateral
de las gotas, distancia al agua y respuesta a velocidad. Las velocidades están
en m/s, las alturas en metros y la persistencia en segundos. `Trama` controla
el dither (0 lo elimina). `Tamaño lento`/`Tamaño rápido` van de 0,1 a 0,6 por
defecto; `Altura salpicón` conserva la altura lenta de 1,1 m y `Altura máxima`
sube a 2,6 m. Interpolan suavemente desde `Velocidad mínima` (3 m/s por defecto)
hasta el límite real de turbo, 72 m/s (259,2 km/h), sin depender del botón turbo.
La respuesta de densidad conserva sus controles y no multiplica el tamaño.
Los ajustes se guardan en este navegador durante
desarrollo; producción usa los valores del código. La base está en
`src/fx/water/hover-effects.ts` y el material en `src/fx/water/hover-material.ts`.
La versión anterior a esta iteración está en `output/water-fx-before-20261027/`.

Ajustes centrales: `DESERT_START` en `src/content/tracks/desert-valley/desert-route.ts`, `DESERT_JUMPS` en
`src/content/tracks/desert-valley/desert-handling.ts`, `DESERT_WATER_PRESET` en `src/content/tracks/desert-valley/water/preset.ts`,
`WATER_WAVES` en `src/content/tracks/desert-valley/water/waves.ts`, `RIVER_SURFACE` en
`src/content/tracks/desert-valley/water/desert-surface.ts` y `HOVER_WATER_FX` en `src/fx/water/hover-effects.ts`.
Las versiones previas de esta pasada están en
`output/desert-polish-before-20261027/`. Estos ajustes son locales y no se
publicaron en la PR de la integración inicial.

La locomotora y los 40 vagones de `freight-train-40-game.glb` recorren `railway.json`
por separado, con 40 enganches móviles y colisiones que consideran la altura.
La primera formación sale a los 8 s; las siguientes alternan dirección cada
45–60 s desde la salida anterior, a 216 km/h y esperando que salga toda la cola.
Los parámetros están en `TRAIN_SETTINGS` (`src/content/tracks/desert-valley/desert-train.ts`). Las rampas
permiten despegar; la posibilidad de superar el tren queda para ajuste jugando.

Los dos MP3 adjuntos están en `public/audio/train/`: traqueteo de 20 s en loop y
bocina de 5 s, ambos estéreo a 48 kHz. Hay un emisor en la parte más cercana del
tren y otro en la locomotora, con paneo 3D y silencio más allá de 150/210 m.
Usan el contexto de audio desbloqueado por gesto, el mute general y el volumen
de efectos. Pausa/reinicio/salida detienen sus fuentes. Midnight Noir continúa
como música del mapa. Procedencia: `public/audio/train/README.md`.

Conteos de los GLB por sus accessors: escena 116.384 triángulos con instancias;
vehículos del tren 44.940 más 480 de enganches dinámicos. Estos conteos corresponden a la entrega del mapa, previa al refactor. La validación del código se registra por separado en `docs/performance-refactor.md`.
En desarrollo, `&testSpawn=river` o `&testSpawn=bridge` permiten probar el río o el salto
directamente. `&renderer=webgl2` prueba el fallback y `&comic=0` muestra los colores base.
