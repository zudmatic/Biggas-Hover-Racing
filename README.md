# Biggas Hover Racing

Juego de carreras hover en 3D con Zud y Zudmatic, las naves 033, Oliva 037 y Nómada 038, y los circuitos Ruinas 034, Nexus 035 y Mario Raceway (N64). Incluye selección de equipo, hangar interactivo, acabado cómic/papel, turbo, derrape, iluminación dinámica y música integrada.

## Desarrollo

```sh
npm ci
npm run dev
```

- Inicio y selección de partida: `http://localhost:5173/`
- Hangar: `http://localhost:5173/spaceship.html`
- Entrada alternativa al juego: `http://localhost:5173/simulator.html`

En la landing, **Jugar** abre la selección de personaje, nave, circuito y modo. El enlace **Hangar** permite inspeccionar las naves y sus componentes. Desde el hangar se puede volver al inicio o abrir la selección de partida con la nave elegida.

Las rutas del juego aceptan `?vehicle=033|037|038`, `?map=ruins|nexus|mario-raceway` y `?comic=0|1`. El hangar acepta `?vehicle=033|037|038`. El enlace anterior `/?view=spaceship` sigue abriendo el hangar. Ambas vistas aceptan `pilot=zud|zudmatic` y `palette=Original|Matcha|Lavanda|Coral|Bosque` y `hat=beanie|samurai_kasa|cloud_chef|crescent_wizard`.

**Zud** permite elegir el gorro original o los sombreros Samurai Kasa, Cloud Chef y Crescent Wizard. Los tres GLB y sus ajustes de encaje se recuperaron del historial anterior a `b0233e0`. La selección se conserva al cambiar de nave, entrar en pista y visitar el hangar.

**Zudmatic** usa el GLB con rig y animaciones del paquete `Personaje-rig-shader-animaciones-5-paletas`. Sus cinco paletas se eligen en la selección de personaje; Bosque conserva los colores particulares de sus piezas. La vista previa reproduce Reposo y las naves 033 y 037 usan una pose sentada con escala uniforme de `0.31`, pelvis anclada al asiento y el desplazamiento de cabina de cada vehículo. La elección acompaña al jugador en la pista, el hangar y el regreso a la selección.

La **Nómada 038** es una hoverbike de cabina abierta, con reactor único y faro ámbar. Está disponible en selección, hangar, vuelo libre y contrarreloj. Conserva sus texturas PBR y usa las mismas animaciones de vuelo, turbo, frenado y derrape que las otras naves. Zud y Zudmatic tienen una postura específica a horcajadas, escala uniforme propia, extensiones al manillar y estribos elevados. La bandera y sus flecos flamean con más intensidad al acelerar o usar turbo; se detienen al pausar la carrera y respetan movimiento reducido. El hangar ofrece inspección de sus ocho grupos de piezas, desarmado y secuencia de despegue/aterrizaje; al no tener cubierta, no muestra controles de cabina.

## Controles

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

Durante la carrera, el panel DialKit de abajo a la izquierda permite ajustar **Escala** de la nave y su piloto juntos: `0.75` es el tamaño inicial, `1.00` el original, con un rango de `0.35` a `1.25`. El cambio es inmediato y se guarda en el navegador para todas las naves y mapas. Las colisiones y los faros acompañan la escala. El hangar y las vistas de selección conservan su presentación original. Para acordar el tamaño definitivo, basta compartir el número del deslizador.

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

### Mario Raceway (N64)

El mapa adjunto está integrado con sus texturas y colores originales, ruta de 1,50 km, colisiones de pista, terreno y obstáculos, 16 checkpoints y récord independiente. Comparte el shader cómic, luz global, sombras, faros, ciclo día/noche, efectos e ítems de los otros circuitos. Se puede elegir en el menú o con `?selection=map&map=mario-raceway`.

El FBX original está en `assets/maps/mario-raceway/`. `node scripts/build-mario-raceway.mjs` regenera los GLB y datos de carrera de `public/models/mario-raceway/`, conservando las texturas embebidas y derivando la ruta de los bordes del asfalto. La escala de importación es 0,0015 (15 m de ancho de pista).
