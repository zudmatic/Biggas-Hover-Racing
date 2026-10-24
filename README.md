# Biggas Hover Racing

Juego de carreras hover en 3D con Zud y Zudmatic, las naves 033 y Oliva 037, y los circuitos Ruinas 034 y Nexus 035. Incluye selección de equipo, hangar interactivo, acabado cómic/papel, turbo, derrape, iluminación dinámica y música integrada.

## Desarrollo

```sh
npm ci
npm run dev
```

- Inicio y selección de partida: `http://localhost:5173/`
- Hangar: `http://localhost:5173/spaceship.html`
- Entrada alternativa al juego: `http://localhost:5173/simulator.html`

En la landing, **Jugar** abre la selección de personaje, nave, circuito y modo. El enlace **Hangar** permite inspeccionar las naves y sus componentes. Desde el hangar se puede volver al inicio o abrir la selección de partida con la nave elegida.

Las rutas del juego aceptan `?vehicle=033|037`, `?map=ruins|nexus` y `?comic=0|1`. El hangar acepta `?vehicle=033|037`. El enlace anterior `/?view=spaceship` sigue abriendo el hangar. Ambas vistas aceptan `pilot=zud|zudmatic` y `palette=Original|Matcha|Lavanda|Coral|Bosque` y `hat=beanie|samurai_kasa|cloud_chef|crescent_wizard`.

**Zud** permite elegir el gorro original o los sombreros Samurai Kasa, Cloud Chef y Crescent Wizard. Los tres GLB y sus ajustes de encaje se recuperaron del historial anterior a `b0233e0`. La selección se conserva al cambiar de nave, entrar en pista y visitar el hangar.

**Zudmatic** usa el GLB con rig y animaciones del paquete `Personaje-rig-shader-animaciones-5-paletas`. Sus cinco paletas se eligen en la selección de personaje; Bosque conserva los colores particulares de sus piezas. La vista previa reproduce Reposo y las naves usan una pose sentada con escala uniforme de `0.31`, pelvis anclada al asiento y el desplazamiento de cabina de cada vehículo. La elección acompaña al jugador en la pista, el hangar y el regreso a la selección.

## Controles

**Propulsor · A · Chorro** en DialKit ajusta la llama de cada tobera: longitud, ancho, intensidad tramada, variación y colores del fuego/núcleo. El chorro crece suavemente con turbo, se acorta al frenar y sigue la posición y escala de la nave. La 033 emite desde dos toberas y Oliva desde tres. Los ajustes se guardan en el navegador.

Para comparar el nuevo humo, abrí **Humo · comparación** en DialKit: **A · Fragmentos procedurales**, **B · Humo híbrido** (predeterminado) o **C · Mixto**. Los valores iniciales son tamaño 1,3, duración 1,5, color `#bababa`, densidad 1, trama 1,5 y emisión desde cuatro ruedas desactivada. Podés cambiar el color y el tramado en vivo; los ajustes se guardan en el navegador. Acelerá con W y combiná E con A/D para derrapar: en recta no aparece humo de derrape. Cada variante introduce formas, giros y tiempos distintos por partícula. El selector devuelve el foco al juego y limpia el humo anterior.

El derrape (**E**) y el frenado (**Espacio**) tienen un primer pase de efectos pixel-cómic: humo coloreable, chispas y marcas cortas que siguen la superficie de la pista. La intensidad del derrape depende del deslizamiento; los efectos acompañan la escala de la nave, se congelan al pausar y se limpian al recuperar o reiniciar. Con movimiento reducido se omiten. Detalles y siguientes etapas en [el plan de efectos](assets/fx/IMPLEMENTACION.md).

### Barril de aceite y bot de prueba

En **vuelo libre**, Ruinas y Nexus tienen barriles flotantes recogibles. Atravesá uno para guardarlo (un espacio) y presioná **Q** o **Soltar aceite**. La nave vierte una estela durante 1 segundo; cada tramo dura 6 segundos y reduce un 55% la velocidad objetivo al pisarlo, con recuperación gradual al salir. También puede afectarte tu propio aceite. Los barriles reaparecen a los 8 segundos.

Para probarlo rápido, pulsá **Preparar prueba**: vuelve al tramo inicial, entrega un barril, pone tu nave en movimiento y ubica al bot detrás. Usá Q para ver su velocidad bajar y el indicador **EN ACEITE**. El bot es un vehículo de entrenamiento que sigue el centro de la ruta, sin colisiones con tu nave; se puede desactivar con su casilla. El minimapa lo marca en naranja. No es una IA de competición.

**Bot tira aceite** hace la prueba inversa: coloca al bot delante, vierte automáticamente y deja tu nave avanzando hacia su estela. El panel muestra tu velocidad y los estados **EN ACEITE**, **recuperando** y **normal**. **Mirar atrás / Mirar adelante** cambia la vista para observar la estela y al bot.

El aceite solo ralentiza: mantiene disponibles dirección, turbo y freno, sin giro ni aturdimiento. Para una futura bomba queda propuesto un impacto al pisarla o chocar con ella, giro de 360° en 0,49 s con easing áureo (38,2% aceleración / 61,8% frenada) y aturdimiento breve. La bomba todavía no está implementada.

En DialKit, **Aceite · prueba** ajusta ancho, tiempo de vertido, duración de la mancha, porcentaje de ralentización y velocidad del bot (m/s). En móvil DialKit empieza cerrado para dejar libres los controles. La pausa congela aceite y bot; reiniciar limpia la prueba. La contrarreloj no incluye ítems ni bot y mantiene sus récords separados de estas pruebas.

El modelo del barril está en `public/models/items/oil-barrel.glb`; el original editable, textura y render están en `assets/items/oil-barrel/`.

Para experimentar con el aceite, DialKit ofrece **Ralentizacion** de 0 a 95%. **Ancho** es el diámetro inicial de las manchas (m); en **Forma**, **AnchoFinal** es el diámetro al terminar el vertido, **DispersionInicial/Final** controlan cuánto se apartan lateralmente del centro (m), **Separacion** la distancia entre manchas (m) y **Variacion** la irregularidad de tamaño (%). **Evolucion** menor que 1 afina antes; mayor que 1 conserva el ancho inicial más tiempo. En **Respuesta**, **Entrada** y **Recuperacion** son los segundos aproximados para completar el 95% de cada transición. La velocidad física también depende de la aceleración y el frenado de la nave.

Los botones **Probar: fuerte y fina** (65%) y **Probar: salpicado** (75%) aplican combinaciones iniciales; **Volver al clásico** recupera el 30% y la estela uniforme. Los ajustes se guardan en el navegador. Los cambios de forma afectan a las nuevas manchas; las existentes conservan tamaño y vencimiento. Vertido se toma al activar cada barril. La ralentización y la respuesta se actualizan en vivo tanto para la nave como para el bot.

Durante la carrera, el panel DialKit de abajo a la izquierda permite ajustar **Escala** de la nave y su piloto juntos: `0.75` es el tamaño inicial, `1.00` el original, con un rango de `0.35` a `1.25`. El cambio es inmediato y se guarda en el navegador para ambas naves y mapas. Las colisiones y los faros acompañan la escala. El hangar y las vistas de selección conservan su presentación original. Para acordar el tamaño definitivo, basta compartir el número del deslizador.

| Tecla | Acción |
| --- | --- |
| W / S | Acelerar / reducir velocidad |
| A / D o flechas laterales | Girar |
| Shift | Turbo |
| E | Derrapar |
| Espacio | Frenar |
| R | Recuperar la nave |
| F | Faros |
| C | Cambiar cámara |
| M | Sonido |
| Escape | Pausar / volver |

El botón de sonido abre un slider de volumen de música (0–100%) y la opción de silenciar todo. El volumen se guarda entre visitas y se mantiene al entrar a la carrera. La tecla M sigue activando o silenciando todo el sonido.

En pausa, **Gráficos** permite elegir **Automático**, **Mayor calidad** o **Más fluidez**. El modo predeterminado es **Mayor calidad**, que conserva la resolución, el suavizado y el brillo originales. Automático ajusta la resolución del mundo 3D cuando hay caídas sostenidas de FPS; los textos y controles mantienen su nitidez. La preferencia se guarda entre visitas. Los shaders se preparan durante la carga y las sombras se actualizan a 30 Hz en los modos de menor costo.

Los postes, conos y piezas de ventilación comparten geometría mediante instancias, sin reducir polígonos ni texturas. Las instancias son una representación visual: cada cono conserva su transformación y estado físico independiente. Los lotes móviles actualizan sus límites de visibilidad al desplazarse; los estáticos se preparan una vez. Esta separación permite incorporar sincronización de entidades más adelante sin usar el lote gráfico como estado de juego; todavía no hay multijugador.

El menú permite elegir vuelo libre o contrarreloj. En móvil se muestran controles táctiles. En el hangar se puede arrastrar para girar, acercar con la rueda o un gesto de dos dedos y explorar las piezas, el piloto y la animación de vuelo.

## Compilación y pruebas

```sh
npm run build
npm run preview
npm test
```

La compilación genera `dist/` con las tres entradas HTML. Las pruebas usan Playwright y levantan Vite. Para elegir un puerto libre:

```sh
TEST_PORT=43179 npm test -- --workers=1
```

## Organización

- `src/flight-selection.*`, `flight-preview.js`, `menu-motion.*`: landing, selección y transiciones.
- `src/flight-simulator.*`, `flight-ship.js`, `flight-atmosphere.js`: conducción, HUD y ambiente.
- `src/circuit-*`, `nexus-details.js`: circuitos, colisiones, física, materiales e iluminación.
- `src/spaceship.*`, `spaceship-parts.js`, `ship-catalog.js`: hangar y catálogo de naves.
- `src/pilot-catalog.js`, `selectable-pilot.js`, `zudmatic-model.js`, `zudmatic-palettes.json`: selección de piloto, carga del GLB, paletas y ajuste de Zudmatic a las cabinas.
- `src/spaceship-pilot.js`, `zud-*`, `character-*`, `eye-settings.js`: modelo, apariencia y rig del piloto.
- `src/retro-*`, `surface-*`, `paper.js`: renderizado cómic y superficies compartidas.
- `src/racing-theme.css`: colores y textura de papel compartidos por la landing y el hangar.
- `src/race-audio.js`, `game-music.js`: efectos procedurales y banda sonora.
- `public/models/`, `public/images/flight/`, `public/audio/`: recursos del juego.

El repositorio contiene únicamente el juego y el hangar. La escena de la casa, sus editores y su compilación independiente fueron retirados. El modelo de Zud y el renderizado compartido permanecen porque los utilizan el piloto y las vistas previas.

Más información: [acabado cómic](docs/comic-print.md), [superficies del piloto](docs/surfaces.md) y [banda sonora](public/audio/README.md).


## Validación WebGPU / TSL

`webgpu-preview.html` es la vista aislada de migración. La etapa 1 conserva mapa,
nave, texturas y luces con materiales base; la etapa 2 añade el acabado cómic en
TSL: posterización, puntos, rayado, contornos por profundidad y acabado de color.
La etapa 3 incorpora propulsor, motor incandescente, partículas, calor, humo,
marcas de frenado y aceite. El simulador ofrece WebGPU de forma optativa desde
la etapa 4; el render original sigue siendo el predeterminado.

- `webgpu-preview.html`: WebGPU con cómic; fallback automático si no hay WebGPU.
- `webgpu-preview.html?backend=webgl`: referencia GLSL original con el mismo encuadre.
- `webgpu-preview.html?backend=webgl2`: fuerza el fallback del renderer nuevo.
- `look=base`, `map=nexus` y `vehicle=033` permiten cambiar la comparación inicial.

DialKit permite alternar cómic, puntos, rayado, contornos, color, trama en objeto
u pantalla, día/noche, faros, sombras y recorrido. `Recorrer` desplaza la nave por
la pista para revisar el render; todavía no es una prueba de conducción.

Esta etapa valida el acabado diurno de cómic sobre las luces del circuito,
incluida su transición nocturna. No migra todavía modos monocromo/normal,
rebotes de luz de otras escenas ni la transición de papel del hangar.
Las pruebas `webgpu-preview.spec.js` y `webgpu-comic.spec.js` comprueban ambos
mapas/naves, cambios de controles, redimensionado y la paleta frente a GLSL.


En etapa 3, `VFX · pruebas` permite activar Turbo (azul), Aceleración (rojo),
Reposo o Soltar, simular derrape/frenado, pausar y soltar aceite. `Recorrer`
mueve la nave por el circuito. `Propulsor · WebGPU` ajusta llama, partículas y
calor; `Humo · comparación` conserva los tres estilos y los cuatro apoyos.
`vfx=off` reproduce la comparación de etapa 2 sin efectos.

El propulsor reutiliza Three VFX (`vanilla-vfx` 0.6.0), con simulación GPU en
WebGPU y CPU en WebGL2. La estela conserva posiciones anteriores al girar; humo,
marcas y aceite mantienen simulaciones acotadas y usan materiales TSL. El calor
se compone en la misma pasada que el cómic, con prueba de profundidad para no
distorsionar objetos delante de la estela. La prueba de aceite es visual: no
activa penalizaciones de conducción en esta vista. Todavía no hay mecánica de
bombas para migrar. Los recursos compartidos del estudio están en `src/vfx/`.

`webgpu-vfx.spec.js` valida color de turbo, emisión, recorrido, humo y marcas,
aceite, pausa, desactivación, redimensionado y los backends WebGPU/WebGL2.


## Etapa 4: conducción con WebGPU

`simulator.html?selection=map&renderer=webgpu&camera=klipp&vehicle=037`
abre el flujo de selección y permite conducir con el renderer nuevo. Usar
`renderer=webgl2` fuerza su fallback; omitir `renderer` conserva el WebGL
original para comparar. El cambio por defecto de todo el producto queda separado
de esta integración del simulador.

La física a paso fijo, la interpolación visual, las cámaras, el HUD, la
contrarreloj y el aceite siguen en el simulador compartido. El material de aceite
TSL usa los mismos parches y contactos que el original, incluidos el bot y la
penalización de velocidad. Shift activa el turbo azul; el modo normal usa rojo.
Pausa congela los efectos y recuperación/reinicio limpia las estelas. El cielo,
noche, faros y líneas de velocidad se renderizan también en el nuevo backend.
Los controles existentes de calidad ajustan resolución y frecuencia de sombras.
La selección/hangar todavía conservan su render original.

`webgpu-driving.spec.js` valida conducción, turbo, derrape, recuperación, aceite,
noche, faros, cambio de calidad, pausa, redimensionado y reinicio de contrarreloj.

## Etapa 5: rendimiento y estabilidad del simulador

El selector de calidad del menú de pausa controla también el render WebGPU y
su fallback WebGL2. Alta conserva 4 muestras de antialiasing y 12 muestras de
resplandor; Rendimiento usa 0 y 4 respectivamente, reduce la resolución y emite
el 55% de partículas, conservando la llama continua. Automático reduce primero
la resolución y activa la variante ligera ante caídas sostenidas. Un cuadro
aislado de carga no baja la calidad, pero las pausas repetidas sí se contabilizan.
Las variantes del postprocesado se reutilizan y se liberan al salir.

La longitud del propulsor incluye ahora el desplazamiento de la nave y su escala:
acelerar no estira indefinidamente el historial de la llama. Las partículas
también acortan su vida según la velocidad; son más pequeñas y tienen bordes
suaves. DialKit añade `Densidad llama` (0,82), con longitud base 2,7, ancho 0,7,
fragmentos de tamaño 0,24 y duración máxima de 0,18 segundos. Turbo sigue azul.
El historial está limitado a 240 poses reutilizables y no crece durante la pausa.

`flame-trail.spec.js` valida longitud a 0, 52 y 100 m/s, giros y recuperación;
`flight-performance.spec.js` comprueba el ajuste automático y las preferencias;
`webgpu-driving.spec.js` verifica los cambios de calidad en ambos backends.
Esta etapa no cambia el renderer predeterminado ni migra la selección/hangar.
