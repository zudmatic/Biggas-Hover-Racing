# Biggas Hover Racing

Juego de carreras hover en 3D con Zud, Zudmatic, Ajo, Bluleet y Lomi, las naves 033, Oliva 037, Nómada 038, Bulldog 039, Bluleet Hover Kart y Lomi 040, y los circuitos Ruinas 034, Nexus 035 y Mario Raceway (N64). Incluye selección de equipo, hangar interactivo, acabado cómic/papel, turbo, derrape, iluminación dinámica y música integrada.

## Desarrollo

```sh
npm ci
npm run dev
```

- Inicio y selección de partida: `http://localhost:5173/`
- Hangar: `http://localhost:5173/spaceship.html`
- Estudio de Bluleet y su hover kart: `http://localhost:5173/chubee-studio.html`
- Playground de depuración: `http://localhost:5173/playground`
- Laboratorio independiente de efectos y cámaras: `http://localhost:43181/` (requiere su propio servidor).
- Compatibilidad: `simulator.html` redirige al inicio; `webgpu-preview.html` y `propulsor-studio.html` redirigen al playground. Todos conservan parámetros y fragmento.

En la landing, **Jugar** abre la selección de personaje, nave, circuito y modo. El enlace **Hangar** permite inspeccionar las naves y sus componentes. Desde el hangar se puede volver al inicio o abrir la selección de partida con la nave elegida.

Las rutas del juego aceptan `?vehicle=033|037|038|039|bluleet|040`, `?map=ruins|nexus|mario-raceway` y `?comic=0|1`. El hangar acepta las mismas naves. El enlace anterior `/?view=spaceship` sigue abriendo el hangar. Ambas vistas aceptan `pilot=zud|zudmatic|ajo|bluleet|lomi` y `palette=Original|Matcha|Lavanda|Coral|Bosque` y `hat=beanie|samurai_kasa|cloud_chef|crescent_wizard`.

**Bluleet** incluye el personaje original con ojos en espiral, acabado de tinta y contorno amarillo/rojo, junto con su hover kart texturizado. Se puede elegir en el menú, inspeccionar en el hangar y conducir en los circuitos. El kart selecciona a Bluleet por defecto cuando no se indica otro piloto; la tinta del personaje permanece activa con `comic=0`. El estudio permite ajustar la pose y el acabado por separado; el juego comparte la pose sentada y el agarre del volante. La integración conserva los GLB originales y calcula la pose sobre el esqueleto al cargar.

**Zud** permite elegir el gorro original o los sombreros Samurai Kasa, Cloud Chef y Crescent Wizard. Los tres GLB y sus ajustes de encaje se recuperaron del historial anterior a `b0233e0`. La selección se conserva al cambiar de nave, entrar en pista y visitar el hangar.

**Zudmatic** usa el GLB con rig y animaciones del paquete `Personaje-rig-shader-animaciones-5-paletas`. Sus cinco paletas se eligen en la selección de personaje; Bosque conserva los colores particulares de sus piezas. La vista previa reproduce Reposo y las naves 033 y 037 usan una pose sentada con escala uniforme de `0.31`, pelvis anclada al asiento y el desplazamiento de cabina de cada vehículo. La elección acompaña al jugador en la pista, el hangar y el regreso a la selección.

**Lomi** comparte el esqueleto de Ajo; ambos se sientan con `src/mannequin-pilot.js`.

La **Nómada 038** es una hoverbike de cabina abierta, con reactor único y faro ámbar. Está disponible en selección, hangar y conducción libre. Conserva sus texturas PBR y usa las mismas animaciones de vuelo, turbo, frenado y derrape que las otras naves. Zud y Zudmatic tienen una postura específica a horcajadas, escala uniforme propia, extensiones al manillar y estribos elevados. La bandera y sus flecos flamean con más intensidad al acelerar o usar turbo; se detienen al pausar la carrera y respetan movimiento reducido. El hangar ofrece inspección de sus ocho grupos de piezas, desarmado y secuencia de despegue/aterrizaje; al no tener cubierta, no muestra controles de cabina.

La **Bulldog 039** es una nave con forma de bulldog francés: cabina abierta tras la cabeza, turbina principal con dos escapes auxiliares y alerón trasero. Usa el GLB **Animated Prototype** (LOD0 + rig facial: 62.892 triángulos, 108 primitivas). Su toon viene horneado en materiales unlit de tres tonos (`toon 0/1/2`); al cargarlo, cada familia se convierte en un único material lit con el tono 2 (el albedo autoral), así recibe el mismo shader cómic TSL (iluminación, bandas, trama, tinta, sombras, noche y faros) que las demás naves. Los ojos usan `KHR_materials_unlit` a propósito y conservan su ilustración. Los faros (`F`) salen desde los ojos. Zud, Zudmatic y Ajo se sientan en su asiento con el desplazamiento de cabina del catálogo, y el hangar inspecciona sus ocho grupos de exportación y los ojos.

**Expresiones de la Bulldog** (`src/ship-eyes.js`, contrato de `README_controles` del prototipo): las lentes giran hasta ±3° sobre `CTRL_Eye_L/R` hacia el lado del giro; los párpados `Lid_L/R` recorren sus cuatro morphs de trayectoria y parpadean con el clip `Blink` cada 3–6 s; un choque fuerte (≥ 3 m/s) reproduce el clip `Collision`: cierre, retroceso de lengua (`Tongue_Recoil`) y recuperación. Los roces leves no la disparan y, con movimiento reducido, la cara queda quieta.

Al entrar a pista con la Bulldog se reproduce un **cameo cinematográfico** de 10 s en el circuito real: los ojos parpadean y se encienden, el motor arranca y la nave se eleva; luego un piloto automático la conduce con la física del juego (frena antes de las curvas cerradas y activa el turbo) mientras la cámara corta entre cuatro planos (encendido, salida, turbina y pasada con rótulo). `Enter`, `Espacio`, `Esc` o **Saltar** terminan la intro; una cortina vuelve la nave a la parrilla y empieza la conducción. No se muestra con movimiento reducido ni con `?intro=0`.

La **Lomi 040** es una nave de acero negro con cristales y dos toberas sin fuego. Su motor `singularity` reemplaza las llamas: plasma en los cristales y un agujero negro en cada tobera que curva la imagen. Con **Shift** el plasma pasa del azul a violeta, magenta y cian.

## Controles

La conducción conserva más inercia lateral al doblar y al soltar la dirección.
La suspensión flota sobre cambios de pendiente y el casco se asienta gradualmente
al acelerar, frenar y contravolantear. Espacio mantiene un frenado firme; E amplía
el derrape. Ver [referencia, ajustes y pruebas de conducción](docs/hover-handling.md).

**Propulsor · WebGPU** en DialKit ajusta la llama, el motor incandescente, los fragmentos, las brasas, las chispas lineales y el tramado. Turbo usa la paleta azul; la aceleración normal usa rojo. La estela sigue el movimiento y la escala de la nave. La 033 emite desde dos toberas, Oliva desde tres y Nómada desde una. Los ajustes se guardan en el navegador.

Para comparar el nuevo humo, abrí **Humo · comparación** en DialKit: **A · Fragmentos procedurales**, **B · Humo híbrido** (predeterminado) o **C · Mixto**. Los valores iniciales son tamaño 1,3, duración 1,5, color `#bababa`, densidad 1, trama 1,5 y emisión desde cuatro ruedas desactivada. Podés cambiar el color y el tramado en vivo; los ajustes se guardan en el navegador. Acelerá con W y combiná E con A/D para derrapar: en recta no aparece humo de derrape. Cada variante introduce formas, giros y tiempos distintos por partícula. El selector devuelve el foco al juego y limpia el humo anterior.

El derrape (**E**) y el frenado (**Espacio**) tienen un primer pase de efectos pixel-cómic: humo coloreable, chispas y marcas cortas que siguen la superficie de la pista. La intensidad del derrape depende del deslizamiento; los efectos acompañan la escala de la nave, se congelan al pausar y se limpian al recuperar o reiniciar. Con movimiento reducido se omiten. Detalles y siguientes etapas en [el plan de efectos](assets/fx/IMPLEMENTACION.md).

### Barril de aceite y bot de prueba

En **vuelo libre**, Ruinas y Nexus tienen barriles flotantes recogibles. Atravesá uno para guardarlo (un espacio) y presioná **Q** o **Soltar aceite**. La nave vierte una estela durante 1 segundo; cada tramo dura 6 segundos y reduce un 55% la velocidad objetivo al pisarlo, con recuperación gradual al salir. También puede afectarte tu propio aceite. Los barriles reaparecen a los 8 segundos.

Para probarlo rápido, pulsá **Preparar prueba**: vuelve al tramo inicial, entrega un barril, pone tu nave en movimiento y ubica al bot detrás. Usá Q para ver su velocidad bajar y el indicador **EN ACEITE**. El bot es un vehículo de entrenamiento que sigue el centro de la ruta, sin colisiones con tu nave; se puede desactivar con su casilla. El minimapa lo marca en naranja. No es una IA de competición.

**Bot tira aceite** hace la prueba inversa: coloca al bot delante, vierte automáticamente y deja tu nave avanzando hacia su estela. El panel muestra tu velocidad y los estados **EN ACEITE**, **recuperando** y **normal**. **Mirar atrás / Mirar adelante** cambia la vista para observar la estela y al bot.

El aceite solo ralentiza: mantiene disponibles dirección, turbo y freno, sin giro ni aturdimiento. Para una futura bomba queda propuesto un impacto al pisarla o chocar con ella, giro de 360° en 0,49 s con easing áureo (38,2% aceleración / 61,8% frenada) y aturdimiento breve. La bomba todavía no está implementada.

En DialKit, **Aceite · prueba** ajusta ancho, tiempo de vertido, duración de la mancha, porcentaje de ralentización y velocidad del bot (m/s). En móvil DialKit empieza cerrado para dejar libres los controles. La pausa congela aceite y bot; reiniciar limpia la prueba. Los ítems y el bot están disponibles en conducción libre.

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

En el menú de pausa, **Opciones → Sonido** abre un slider de volumen de música (0–100%) y la opción de silenciar todo. El volumen se guarda entre visitas y se mantiene al entrar a la carrera. La tecla M sigue activando o silenciando todo el sonido.

En pausa, **Opciones → Gráficos** permite elegir **Automático**, **Mayor calidad** o **Más fluidez**. El modo predeterminado es **Mayor calidad**, que conserva la resolución, el suavizado y el brillo originales. Automático ajusta la resolución del mundo 3D cuando hay caídas sostenidas de FPS; los textos y controles mantienen su nitidez. La preferencia se guarda entre visitas. Los shaders se preparan durante la carga y las sombras se actualizan a 30 Hz en los modos de menor costo.

Los postes, conos y piezas de ventilación comparten geometría mediante instancias, sin reducir polígonos ni texturas. Las instancias son una representación visual: cada cono conserva su transformación y estado físico independiente. Los lotes móviles actualizan sus límites de visibilidad al desplazarse; los estáticos se preparan una vez. Esta separación permite incorporar sincronización de entidades más adelante sin usar el lote gráfico como estado de juego; todavía no hay multijugador.

El único modo es **conducción libre**: la selección de circuito entra directamente a pista, sin cuenta atrás ni modo contrarreloj. El panel de conducción muestra piloto, nave y estado actual (detenido, en marcha, frenando, derrapando o turbo). **Escape** abre el menú de pausa, con las secciones **Controles** y **Opciones**; allí están sonido, cámara, día/noche, estilo cómic, gráficos y acceso al hangar. La interfaz de conducción no muestra cabecera de marca ni botón de pausa. En móvil se muestran controles táctiles de conducción. En el hangar se puede arrastrar para girar, acercar con la rueda o un gesto de dos dedos y explorar las piezas, el piloto y la animación de vuelo.

## Compilación y pruebas

```sh
npm run build
npm run preview
npm test
```

La compilación genera `dist/` con cuatro páginas activas (inicio/juego, hangar, preview WebGPU y estudio de Bluleet) y dos entradas de compatibilidad que solo redirigen. Las pruebas usan Playwright y levantan Vite. Para elegir un puerto libre:

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

El repositorio contiene el juego, el hangar y las vistas de pruebas de renderizado y efectos. La escena de la casa, sus editores y su compilación independiente fueron retirados. El modelo de Zud y el renderizado compartido permanecen porque los utilizan el piloto y las vistas previas.

Más información: [acabado cómic](docs/comic-print.md), [superficies del piloto](docs/surfaces.md) y [banda sonora](public/audio/README.md).


## Validación WebGPU / TSL

`/playground` es la vista aislada de depuración. La etapa 1 conserva mapa,
nave, texturas y luces con materiales base; la etapa 2 añade el acabado cómic en
TSL: posterización, puntos, rayado, contornos por profundidad y acabado de color.
La etapa 3 incorpora propulsor, motor incandescente, partículas, calor, humo,
marcas de frenado y aceite. La etapa 4 incorporó la conducción y la etapa 5
el ajuste de rendimiento. Ahora WebGPU es el render predeterminado de todas
las vistas activas del juego, con fallback WebGL2 sobre la misma base TSL.

- `/playground`: WebGPU con cómic; fallback automático si no hay WebGPU.
- `/playground?backend=webgl2`: fuerza el fallback del renderer nuevo.
- `look=base`, `vfx=off`, `map=nexus`, `vehicle=033`, `view=tobera`, `state=turbo` y
  `effect=pad` permiten cambiar el arranque.

El playground suma vistas de cámara fijas (teclas 1–7), estados de nave (parada,
acelerando, turbo, contra muro, frenando, derrape, girando, manejar y soltar),
pausa, avance por cuadro, cámara lenta y un HUD de métricas. En `Manejar` la nave
usa la física del juego con W/S, A/D, Shift, Space, E y R. Todos los paneles de
DialKit arrancan cerrados; `window.playground` permite manejar cualquier control
(`set(panel, control, valor)`), cambiar vista o estado y leer `info()` desde scripts.

Esta etapa valida el acabado diurno de cómic sobre las luces del circuito,
incluida su transición nocturna. No migra todavía modos monocromo/normal,
rebotes de luz de otras escenas ni la transición de papel del hangar.
Las pruebas `playground-render.spec.js` y `playground-comic.spec.js` comprueban ambos
mapas/naves, cambios de controles y redimensionado.


En etapa 3, `VFX · pruebas` permite activar Turbo (azul), Aceleración (rojo),
Reposo o Soltar, simular derrape/frenado, pausar y soltar aceite. `Recorrer`
mueve la nave por el circuito. `Propulsor · WebGPU` ajusta llama, partículas y
calor; `Humo · comparación` conserva los tres estilos y los cuatro apoyos.
`vfx=off` reproduce la comparación de etapa 2 sin efectos.

En **Propulsor · WebGPU**, **Trama** aplica Apagado, Damero o Dither a la llama, fragmentos, brasas y chispas lineales, igual que el laboratorio. **Intensidad trama** (0,6) y **Tamaño trama** (2 píxeles del render) controlan el patrón compartido. Estos controles también están disponibles al conducir con el renderer nuevo.

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

`/?selection=map&renderer=webgpu&camera=klipp&vehicle=037`
abre el flujo de selección y permite conducir con el renderer nuevo. Usar
`renderer=webgl2` fuerza su fallback con los mismos materiales TSL. Omitir
`renderer` usa WebGPU por defecto y selecciona WebGL2 automáticamente si no
está disponible.

La física a paso fijo, la interpolación visual, las cámaras, el HUD, la
contrarreloj y el aceite siguen en el simulador compartido. El material de aceite
TSL usa los mismos parches y contactos que el original, incluidos el bot y la
penalización de velocidad. Shift activa el turbo azul; el modo normal usa rojo.
Pausa congela los efectos y recuperación/reinicio limpia las estelas. El cielo,
noche, faros y líneas de velocidad se renderizan también en el nuevo backend.
Los controles existentes de calidad ajustan resolución y frecuencia de sombras.
La selección y el hangar usan también el renderer de nodos compartido.

`webgpu-driving.spec.js` valida conducción, turbo, derrape, recuperación, aceite,
noche, faros, cambio de calidad, pausa, redimensionado y reinicio de contrarreloj.

## Etapa 5: rendimiento y estabilidad del simulador

El selector de calidad del menú de pausa controla también el render WebGPU y
su fallback WebGL2. Alta conserva 4 muestras de antialiasing y 12 muestras de
resplandor; Rendimiento usa 0 y 4 respectivamente, reduce la resolución y emite
el 55% de fragmentos, conservando llama, brasas y líneas. Automático reduce primero
la resolución y activa la variante ligera ante caídas sostenidas. Un cuadro
aislado de carga no baja la calidad, pero las pausas repetidas sí se contabilizan.
Las variantes del postprocesado se reutilizan y se liberan al salir.

La longitud del propulsor incluye ahora el desplazamiento de la nave y su escala:
acelerar no estira indefinidamente el historial de la llama. Las partículas
también acortan su vida según la velocidad; son más pequeñas y tienen bordes
suaves. DialKit añade `Densidad llama` (0,82), con longitud base 2,7, ancho 0,7,
fragmentos de tamaño 0,32 y duración máxima de 0,22 segundos. Turbo sigue azul.
El historial está limitado a 240 poses reutilizables y no crece durante la pausa.

Las partículas heredan parte de la velocidad de la nave (`Seguir nave`, 0,9).
`Estela partículas` controla su alcance separado de la llama; las brasas y líneas
pueden sobresalir del núcleo, con brillo y dispersión mayores. Sus cantidades,
tamaños y duraciones se ajustan por separado en DialKit. La vida mínima de 90 ms
evita que desaparezcan en un solo cuadro. Rendimiento reduce los fragmentos
densos, pero conserva las brasas y chispas lineales.

`flame-trail.spec.js` valida longitud a 0, 52 y 100 m/s, giros y recuperación;
`flight-performance.spec.js` comprueba el ajuste automático y las preferencias;
`webgpu-driving.spec.js` verifica los cambios de calidad en ambos backends.
La migración completa descrita más abajo extiende esta base a las vistas de selección y hangar.
### Mario Raceway (N64)

El mapa adjunto está integrado con sus texturas y colores originales, ruta de 1,50 km, colisiones de pista, terreno y obstáculos, 16 checkpoints y récord independiente. Comparte el shader cómic, luz global, sombras, faros, ciclo día/noche, efectos e ítems de los otros circuitos. Se puede elegir en el menú o con `?selection=map&map=mario-raceway`.

El FBX original está en `assets/maps/mario-raceway/`. `node scripts/build-mario-raceway.mjs` regenera los GLB y datos de carrera de `public/models/mario-raceway/`, conservando las texturas embebidas y derivando la ruta de los bordes del asfalto. La escala de importación es 0,0015 (15 m de ancho de pista).

### Integración Mario Raceway y Nómada en WebGPU

`/?selection=map&renderer=webgpu&map=mario-raceway&vehicle=038&camera=klipp`
permite probar juntos el mapa y la nave nuevos. `renderer=webgl2` usa el fallback;
`pilot=zudmatic` cambia el piloto. Se conservan el ajuste de manos y apoyos,
la bandera animada, las colisiones, los checkpoints y los récords de Fran.
El reactor único usa los efectos TSL, calor y turbo azul del simulador.

El playground (`/playground?map=mario-raceway&vehicle=038`) toma sus opciones
del catálogo compartido. El estudio de `experiments/vfx-lab` ofrece también
Nómada en DialKit, con la orientación, reactor y bandera del mismo catálogo.
La bandera mantiene la deformación de geometría compartida con WebGL: sus
materiales, silueta y sombras funcionan en WebGPU sin duplicar la animación.

Las pruebas `webgpu-fran.spec.js` verifican texturas, colores de vértices,
recortes de transparencia, doble cara y bandera con materiales TSL;
`webgpu-driving.spec.js` incluye Mario Raceway / Nómada en ambos backends.
El hangar y la selección usan WebGPU por defecto, con los mismos materiales TSL.


## Renderer compartido: WebGPU por defecto

El juego (`/`), la selección de pilotos/naves y el hangar (`spaceship.html`)
usan `WebGPURenderer`. `src/game-renderer.js` inicializa WebGPU y permite el
fallback automático a WebGL2. Para comprobarlo explícitamente, añadir
`?renderer=webgl2`; la navegación interna conserva esta elección.

Los materiales de cómic, humo, marcas, aceite y propulsores usan TSL. El hangar
y la selección comparten `src/comic-view.js`, que incorpora sombreros y modelos
cargados después del primer cuadro. Las piezas comparten el grafo del shader,
con referencias de color por material, para evitar compilar una variante por
pieza clonada. La selección y el hangar esperan un cuadro renderizado
antes de mostrar el modelo. Las vistas evitan renders simultáneos y esperan al
cuadro pendiente antes de liberar sus recursos. La bandera y el piloto de la
nave se actualizan también durante la conducción.

El laboratorio de `experiments/vfx-lab` ya utiliza WebGPU. Las rutas antiguas
`simulator.html`, `webgpu-preview.html` y `propulsor-studio.html` redirigen a las
páginas activas. La referencia GLSL original (`backend=webgl`) se retiró junto con
el preview.

La física y las cámaras conservan su simulación compartida en CPU. El cambio
unifica el render, no altera sus reglas. El fallback WebGL2 utiliza los mismos
materiales TSL y simula las partículas en CPU cuando corresponde.

`webgpu-entrypoints.spec.js` cubre selección y hangar en ambos backends;
`webgpu-driving.spec.js` comprueba el renderer predeterminado al conducir y su
fallback. Las pruebas de navegación, sombreros, Nómada y banderas cubren las
cargas y los controles compartidos.


### Controles de desarrollo

DialKit solo se muestra con el servidor de desarrollo (`npm run dev`).
Las compilaciones de producción (`npm run build`) no montan sus paneles ni
activan sus atajos; usan los valores predeterminados del código y no recuperan
ajustes experimentales guardados en el navegador. Esto incluye el juego, el
preview y las compilaciones del laboratorio independiente.
