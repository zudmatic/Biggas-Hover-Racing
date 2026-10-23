# Biggas Hover Racing

Juego de carreras hover en 3D con Zud, las naves 033 y Oliva 037, y los circuitos Ruinas 034 y Nexus 035. Incluye selección de equipo, hangar interactivo, shader cómic/papel, turbo, derrape, iluminación dinámica y música integrada.

```sh
npm ci
npm run dev
```

- Juego: `http://localhost:5173/simulator.html`
- Hangar: `http://localhost:5173/spaceship.html`
- Escena original de Zud: `http://localhost:5173/`

`npm run build` genera la versión estática en `dist/`. `npm run preview` permite revisarla localmente. Las instrucciones técnicas y los controles completos se conservan a continuación.

Este repositorio parte de una copia independiente del proyecto, con un único commit inicial.

---

# El cuarto de Zud

Una escena 3D en Retro Print: el cuarto de Zud a pantalla completa, con navegación del portfolio. Es la versión publicada en [zudmatic.com/house](https://www.zudmatic.com/house).

## Desarrollo

```sh
npm install
npm run dev
```

`npm run build` genera la versión estática en `dist/`; `npm run preview` la sirve localmente.

## Publicar en zudmatic.com/house

`npm run build:house` genera la escena con base `/house/` en `dist-house/`. Se publica copiándola a la carpeta pública del portfolio (`zudmatic/Zudmatic-portfolio`) y haciendo commit allí; Vercel la despliega al hacer push a `main`:

```sh
npm run build:house -- --outDir ../Zudmatic-portfolio/public/house --emptyOutDir
```

El portfolio sirve `/house` sin la contraseña del resto del sitio (`src/proxy.ts` lo excluye) y reescribe `/house` a `/house/index.html` (`next.config.ts`). Los tags de vista previa (título «Zudmatic» e imagen `public/house-og.jpg`) están en `index.html`.

El build `house` no incluye los accesos ni los módulos de los editores de escena y personaje. Sus parámetros de URL abren el cuarto normal. Los editores siguen disponibles en desarrollo y en el build estático genérico.

## La escena

Un cuarto isométrico de muros gruesos de yeso sobre una base de madera: piso de tablas, cama baja con mesita de luz (con los anteojos pixelados y el cigarro de Zud), estante con una cámara Fujifilm, espejo de pared en vivo, póster, alfombra redonda con el logo, planta en la esquina y un escritorio bajo una ventana ancha con laptop, lámpara articulada, el libro Five Rings de Miyamoto Musashi y un despertador amarillo.

La casa está rodeada por una pequeña isla de césped con tres árboles, arbustos, flores, helechos, hongos y rocas del Stylized Nature MegaKit de Quaternius (CC0). El jardín usa 12 modelos glTF, texturas reducidas e instancias para la vegetación repetida; su distribución se ajusta en `src/nature-garden.js`.

Al cargar aparecen tres puntitos; sus estilos y la ocultación inicial del cuarto se cargan desde el HTML (`src/loading.css`), antes del JavaScript, para evitar que se vea el contenido sin estilos. Cuando las texturas y los objetos del cuarto están listos, la casa entra con un fundido y ya responde a las interacciones. La vegetación del jardín y del paisaje de la ventana se carga en segundo plano. Si algún modelo falla, el resto de la escena se muestra igual.

## Interacciones

- **Caminar:** clic en el piso (esquiva los muebles; si el clic cae sobre uno, va al lugar libre más cercano), o flechas relativas a la cámara. Espacio salta.
- **Cámara:** arrastrar gira la vista del cuarto.
- **Objetos:** al pasar el mouse se levantan y muestran qué hacen.
  - Laptop: Zud va a la silla y trabaja.
  - Anteojos: los toma de la mesita y baila con el fragmento 1:20–1:32 de ZAPRAVKA — TECHNO (VIP), servido localmente (sin YouTube). Si el navegador bloquea el audio, aparece un botón para reproducirlo.
  - Cigarro: fuma en un ciclo de 5 s (pitada, brasa, exhalación).
  - Planta: la riega con una regadera; la tierra se oscurece y la planta crece.
  - Cama: se acuesta a dormir y, después de 3 s, sueña con un cheesecake 3D.
  - Ventana: cierra o abre la persiana.
  - Reloj: se eleva hacia la cámara; arrastrar sus agujas cambia la hora y el ciclo de luz (amanecer, día, atardecer y noche). Escape o tocar fuera lo devuelve al escritorio.
- **Zud:** sin voz ni interacción al hacer clic sobre él. Teclas 1–4: saludar, saltar, bailar y dormir; 6–9: trabajar, fumar, anteojos y susto (máscara de conejo). Escape vuelve al reposo.

Respeta la preferencia de movimiento reducido, se adapta a móvil y muestra un aviso si WebGL no está disponible. La fuente pixelada VT323 se sirve localmente, con su licencia OFL incluida.

## Sonido

El botón de altavoz activa o silencia efectos y música. La escena empieza con el sonido activado y carga los dieciocho archivos de las doce capas locales. Si el navegador bloquea la reproducción automática, la primera interacción de mouse, táctil o teclado inicia el audio. Una elección explícita de silencio se respeta durante el baile.

Los efectos de origen se generaron con el MCP de ElevenLabs (`eleven_text_to_sound_v2`): pasos, aire y caída del salto, riego, teclado, cuerda y láminas de la persiana. Los ambientes generados anteriores (brisa, hojas, pájaros y grillos) siguen eliminados. Los ambientes actuales son **Ambiente · día**, del [video diurno](https://www.youtube.com/watch?v=NqKqUKqULRw), y **Ambiente · noche**, del [video nocturno](https://www.youtube.com/watch?v=t-QnTGSfMxc). Son bucles estéreo de 13,27 y 13,69 segundos, con uniones cruzadas de 1,5 segundos y almacenamiento WAV para evitar relleno del códec. Se alternan con fundidos según la luz del reloj, se atenúan con la persiana y la música, con niveles independientes. Los pasos siguen el desplazamiento real y detectan la geometría visible de la alfombra, incluso si se mueve o escala; usan un golpe de madera en el piso y uno más suave y amortiguado sobre tela, con cuatro archivos de pisadas diferentes por superficie. Cada ronda mezcla las cuatro sin repeticiones consecutivas, incluso al cambiar de ronda; no se usa un bucle para caminar. Las cuatro pisadas tienen contactos distintos (talón, suela, talón-punta y apoyo suave), editados localmente desde dos fuentes de ElevenLabs; el toque y la campanilla de interacción ahora son síntesis limpia sin ruido de fondo. El teclado empieza al llegar al escritorio y el riego al llegar a la planta. Al silenciar o esconder la pestaña se detienen las fuentes; los efectos breves no se encolan mientras cargan.

`src/scene-audio.js` mezcla los archivos de `public/audio/scene/`, con fundidos para riego y teclado. `manifest.json` conserva prompts, identificadores de generación y procesamiento de cada archivo. Los archivos de audio se sirven bajo la base de Vite (también `/house/`), sin claves ni llamadas a ElevenLabs durante la visita.

La mezcla se pulió en conjunto: pasos con volumen consistente, salto y persiana con colas cortas, agua sin el grave continuo y un teclado de diez segundos con ráfagas y pausas irregulares. El aterrizaje suena más suave sobre la alfombra. Los avisos mantienen sus tonos limpios. La música conserva el mismo fragmento y duración, normalizado a aproximadamente −18 LUFS, con fundidos cortos y margen para evitar saturación.

El procesamiento offline está en `scripts/polish-audio.py` (Python, numpy y FFmpeg). Se ejecuta con `--source` apuntando a una copia previa de `public/audio` y `--output` a otro directorio; no agrega dependencias ni procesamiento pesado al navegador. La ficha `mastering` del manifiesto documenta los ajustes aplicados.

La mezcla usa niveles fijos: día 32%, noche 34%, pasos en madera 60%, pasos en alfombra 100%, salto (aire) 88%, salto (caída) 100%, riego 79%, teclado 33%, persiana (cuerda) 100% y persiana (láminas) 27%; volumen general, interacción y música al 100%. Están definidos en `src/audio-channels.js`. La interfaz solo ofrece activar o silenciar el sonido; los ajustes antiguos del mezclador no se aplican.

## Editor de escena

En desarrollo o en el build estático genérico, abrí **Editar escena** desde el cuarto o entrá a `/?edit=scene`. No está disponible en la versión pública de `/house`.

- Catálogo con los **31 modelos GLB**, incluida la cama de una plaza, miniaturas, búsqueda y categorías. Los archivos se cargan al usarlos; conservan sus materiales y la escala de autoría.
- Selección con clic en el cuarto o desde **En escena**. Se pueden editar 16 objetos originales, incluidos muebles, lámpara, espejo, póster y accesorios.
- **Mover, Girar y Escalar** con controles 3D (atajos W / E / R), campos numéricos y ajuste a pasos de 0,1 / 15°. Todos los objetos tienen posiciones independientes en el cuarto: quitar, reemplazar o mover un mueble no afecta a sus accesorios.
- Agregar al piso, a altura de escritorio o de pared; apoyar un objeto en el piso o a altura de mesa; reemplazar conservando ubicación y orientación; quitar elementos.
- La pestaña **Originales** permite recuperar cualquier original quitado, conservando su última posición y color.
- Colores por superficie, aislados por objeto, con restablecimiento, deshacer e inclusión en el JSON.
- Vista previa de luz: día, noche o persiana baja.
- Deshacer y rehacer durante la sesión (Ctrl/⌘ Z y Ctrl/⌘ Shift Z), restaurar la escena base e importar/exportar JSON. Escape cancela la selección; Suprimir quita el objeto con el lienzo enfocado.
- Guardado automático local en `zud.scene.v3`, aplicado al volver al cuarto o recargar. El JSON permite trasladar la escena a otro navegador; no modifica la base del proyecto ni publica cambios para otros visitantes.

La escena base vive en `src/scene-base.json` y contiene la disposición aprobada del archivo `zud-escena (4).json`: silla giratoria, lámpara articulada, papelera, pantuflas, cómoda y mesa auxiliar con suculenta, la cama de una plaza con sus colores y escala, además de los ajustes de los originales. Se aplica al cuarto y al editor cuando no hay un borrador local v3. Los borradores anteriores v1 y v2 quedan intactos; se pueden importar archivos v1 y v2. La migración convierte las coordenadas antiguas de cámara, anteojos y cigarro a coordenadas independientes sin cambiar su ubicación.

Las lámparas articulada y de pie incorporan luz y bombilla emisiva que siguen la noche y la persiana. La suculenta y el terrario reciben la acción de riego: crece únicamente el follaje y se humedece la tierra, sin agrandar el recipiente ni acumular tamaño al regar repetidamente. Las rutas de acercamiento y el punto donde cae el agua siguen la posición editada de cada planta. La silla giratoria puede ocupar el lugar de la silla de trabajo; el reloj, los anteojos y el cigarro conservan sus acciones después de moverlos o escalarlos. La cama de una plaza conserva la acción Sleep: el acercamiento y la pose siguen su posición, giro y escala, y el acolchado y la almohada se animan al dormir. Las acciones de escritorio que dependan de una disposición incompatible siguen protegidas. El cuarto recalcula los obstáculos. Piso, paredes, ventana, jardín y personaje permanecen fuera de la selección del editor.

El catálogo vive en `src/scene-catalog.json`; GLB y miniaturas están en `public/models/room-objects/`. El editor usa la misma habitación, iluminación y acabado del cuarto. La aplicación carga los modelos bajo la base de Vite, compatible con `/house/`.

## Editor del personaje

Abrí `/?debug=character` (también `/?model-debug`) para entrar a **Zud Lab**. El enlace **Editar personaje** está disponible en el cuarto en desarrollo y en el build estático genérico. No está disponible en la versión pública de `/house`.

- Cámara libre con giro, zoom, desplazamiento y vistas de frente, perfil y espalda.
- Un deslizador **Detalle y curvas** reemplaza los presets de modelo: low poly (0), malla base (25), más subdivisiones (50), high poly (75) y curvas (100, por defecto). Todos derivan de la misma geometría aprobada; low simplifica el cuerpo y conserva el gorro. De 75 a 100, subdivisión Loop redondea progresivamente las superficies conservando las dimensiones de cada parte. Wireframe y contador de triángulos siguen disponibles.
- Uniones de hombros, caderas y cuello con raíces alojadas dentro del torso y la cabeza; los pivotes se conservan para las animaciones. La malla del cuerpo y el doblez del gorro usan triangulaciones regulares para mantener superficies limpias y un borde continuo en curvas 100.
- Rig con codos, rodillas y puntos de agarre: las extremidades se flexionan sobre su geometría de reposo, sin abrir las uniones ni acumular deformación. Los cinco brazos alternativos conservan rígidas sus placas y manos; los objetos siguen el agarre del brazo equipado. La caminata alterna la flexión de rodillas y mantiene una suela apoyada; el salto tiene anticipación y recuperación, y los giros toman el camino más corto. El Lab incluye las poses **Caminata** y **Salto**.
- **Ojos / Mirada y párpados**: blanco con relieve y acabado suave, párpados integrados en la piel de la cabeza mediante el cierre de la abertura y pupilas circulares recortadas. Controles de apertura, inclinación, tamaño de pupila, mirada horizontal/vertical y relieve; parpadeo automático, prueba manual y restaurar mirada. Los ajustes se guardan y viajan en el JSON. El parpadeo y las poses cierran los párpados sin escalar los ojos. Las variantes de mirada del Lab son locales; el cuarto usa la nueva mirada base.
- Material físico con rugosidad y metal, toon o normales; colores independientes de cuerpo, gorro, ojos y pupilas.
- Texturas de tejido, grano, cuadrícula UV o imagen propia (PNG/JPG/WebP, hasta 5 MB, reducida a 512 px), repetición y relieve.
- Proporciones, visibilidad de partes, poses, animación, iluminación y fondo del estudio.
- Cinco brazos con volumen y detalles propios: **Forja** y **Centinela** (armaduras con placas, remaches y guanteletes), **Hidráulico** (pistones y mangueras), **Aero** (cerámica y tendones) y **Reactor** (núcleo luminoso y refrigeración). Elegí cada lado de forma independiente, intercambiá los brazos o recuperá los originales. Derecha e izquierda son las del personaje. Las piezas siguen las animaciones del hombro y también aparecen al volver al cuarto. Las palmas apuntan hacia el cuerpo; la hombrera Centinela entra en el torso y las rótulas quedan bajo las carcasas. Muñecas y codos usan ejes centrados, los rebordes siguen el perfil de sus carcasas y los pistones y conductos tienen anclajes. Cada brazo alternativo permite editar color principal, bordes y detalles o luces; restaurar su paleta, intercambiar los colores junto con el brazo y guardarlos en el navegador o en el JSON. Los colores también se aplican en el cuarto.
- **Ver todo en cómic** aplica el shader Retro Print del proyecto al personaje, brazos y sombreros, con tinta de superficie, tramado y contornos. Se puede activar y desactivar para comparar; conserva el material anterior, incluso la vista de normales. La preferencia se guarda y viaja en el JSON.
- Tres sombreros detallados: Samurai Kasa, Cloud Chef y Crescent Wizard; además del gorro original y la opción sin sombrero.
- Tamaño, posición lateral/vertical/profundidad, giro, inclinación, altura de copa, tinte, rugosidad y metal del sombrero. «Ajustar a la cabeza» adapta la abertura y corrige las caras que atraviesan la cabeza; se puede desactivar para ajustar libremente. «Guardar y copiar ajustes» conserva una configuración por sombrero en este navegador y copia su nombre y valores como JSON para pegarlos en el chat (con copia manual si el portapapeles no está disponible). Cambiar de modelo recupera esa configuración guardada o su ajuste original; «Restablecer ajustes del sombrero» conserva el modelo elegido.
- El sombrero equipado, su visibilidad y sus ajustes se guardan automáticamente en este navegador y aparecen al **Volver al cuarto**. También se incluyen en el JSON exportado.
- Guardado automático local, importar/exportar JSON con detalle, curvas y textura, y restaurar la base. Los JSON anteriores migran su resolución al deslizador.

La base aprobada vive en `src/character-base.json`: los ajustes de `zud-character (1).json`, con detalle y curvas en 100, cómic activado, sombreado suave, piel mate y tejido en el gorro. Al abrir un guardado anterior del Lab se actualizan detalle y cómic a esta base final conservando los demás ajustes. El cuarto y **Restaurar base** usan esos ajustes. El estudio permite seguir experimentando con variantes locales de cuerpo, proporciones y superficies; esos cambios no reemplazan automáticamente esa base. Los brazos y el sombrero con sus ajustes sí se comparten con el cuarto. El JSON exportado guarda la configuración (no es un archivo de malla GLTF). El estudio usa iluminación propia y materiales editables. Los niveles de detalle se generan desde la malla aprobada y mantienen sus articulaciones. El panel Retro Print existente sigue disponible con `/?debug` en desarrollo.

Los sombreros usan tres GLB del catálogo original del catálogo entregado, con materiales PBR y miniaturas reducidas en `public/models/hats/`. `src/hat-catalog.js` enumera las revisiones y `src/character-hats.js` comparte la carga y el montaje entre el editor y la escena. Se cargan a demanda y se refinan en `src/hat-refinements.js`: abertura ovalada, proporciones propias de cada diseño, kasa más ancho y bajo con cordón ceñido al mentón, copa de mago reconstruida, cucharas sujetas al bolsillo, copas suavizadas y acabados de tela, cuero, paja, esmalte y metal. Los valores aprobados de cada sombrero viven en `HAT_PRESETS` y se usan al seleccionarlo o restablecerlo. El cordón del kasa se reconstruye sobre el contorno real de la cabeza. La copa cambia de altura sin levantar el borde. El ajuste automático usa una envolvente de la cabeza real y comprueba también el interior de las caras triangulares; las modificaciones parten siempre de la geometría de reposo, sin acumular deformaciones. Las piezas se agrupan por material y función para reducir llamadas de dibujo. Los GLB originales se conservan intactos; la versión refinada comparte el mismo montaje y sigue las animaciones de Zud; una carga fallida muestra el gorro original y permite reintentar desde el editor. Los controles de color/textura del gorro original y el deslizador de geometría no sustituyen los materiales ni las mallas de estos diseños.

Las recetas comunes de piel, tejido, madera, yeso y metal viven en `src/surface-library.js`. Se aplican al personaje y a los principales materiales del cuarto, con escala física, colores compartidos y relieve por familia. Ver [familias de superficies](docs/surfaces.md) para ajustar la biblioteca y conocer la compatibilidad con JSON anteriores.

## Render

- **Geometría:** cada superficie del cuarto se triangula con facetas algo irregulares (`facetBox` en `src/retro-room.js`); Zud conserva la malla densa ajustada a su silueta (`src/zud-print-style.js`), con material toon, UVs físicos y familias de superficie compartidas con el editor (`src/character-surfaces.js`).
- **Material** (`src/retro-material.js`): Lambert plano con variación por faceta y moteado en coordenadas del objeto, un rebote difuso aproximado desde 8 parches y un semitono CMYK aplicado sobre la luz final (`src/surface-halftone.js`).
- **Ventana** (`src/window-view.js`): exterior 3D con árboles del jardín, flores, helechos y colinas; comparte la altura del terreno y el mismo ciclo solar del jardín, con luz y sombras en coordenadas del mundo. El paisaje comparte la proyección del cuarto y se recorta por la abertura: al girar, el marco revela la vegetación según su profundidad real, sin desplazamiento artificial. Un render a textura mantiene el paisaje dentro del marco y se actualiza solo al cambiar la hora, el estilo o la dirección de cámara.
- **Luz** (`src/retro-lighting.js`): hemisferio, sol cálido con sombras suaves y contraluz; el sol sigue la hora del reloj. La lámpara y la pantalla son luces locales. Los parches de rebote se reparten entre cuadros (cada uno se actualiza unas 8 veces por segundo).
- **Revelado** (`src/retro-print.js`): la escena se dibuja en un buffer de media precisión y una pasada aplica ACES, algo de saturación, un brillo cálido de las altas luces y el papel blanco.

### Navegación y Work

La barra superior muestra el logo de Zudmatic y Home, Work, About, Photos, Blog y Contact; About, Photos, Blog y Contact son placeholders por ahora, sin destino. **Work** también se activa al hacer clic en la laptop o pulsar 6: Zud va al escritorio y trabaja, sin galería ni scroll de proyectos. La escena conserva sus controles e interacciones. Home, Atrás del navegador o Escape hacen que Zud deje el escritorio. El enlace `#work` permite iniciar esta actividad directamente.

### Estilo cómic

La escena arranca en **Cómic** y el botón circular de la barra alterna entre color y **Cómic B/N**. `?look=normal|comic|mono` sigue permitiendo elegir el estilo inicial. Cómic imprime la escena como un cómic: bandas planas, puntos en las luces, hatching en las sombras, contorno por profundidad, desregistro de color, papel opaco y animación «on twos». En desarrollo, `/?debug` abre un panel para ajustarlo (con un botón que copia todos los valores) y `?resolution=fixed` congela la resolución adaptativa. El fondo reacciona a la luz de la escena: al cerrar la persiana o hacerse de noche la página pasa a modo oscuro con un barrido de semitono (`?time=23:30` abre a esa hora). El color del papel claro vive en `src/paper.js` y debe coincidir con `--paper` de `style.css`, el fondo de la página donde se incrusta. Parámetros, presets, rendimiento y límites: [`docs/comic-print.md`](docs/comic-print.md).

### Rendimiento

- Las piezas compatibles del cuarto se agrupan por material y padre con `BatchedMesh` cuando está disponible `WEBGL_multi_draw`. Los objetos originales mantienen sus animaciones, selección y consultas de iluminación; una geometría que se deforma o cambia de material vuelve automáticamente a dibujarse por separado. El editor y los navegadores sin esa extensión conservan el camino original.
- Jardín, paisaje de la ventana y planta comparten geometrías e imágenes mediante `nature-assets.js`, con jerarquías y materiales de iluminación independientes. La vegetación exterior no bloquea la aparición del cuarto.
- Las consultas de oclusión descartan primero las cajas envolventes y terminan en el primer impacto real. Los resultados se reutilizan mientras los obstáculos no cambien; las sombras y la frecuencia de iluminación se mantienen.
- El espejo se dibuja antes del cuadro (no dentro de él) a 30 Hz, o en cada cuadro mientras se mueve la cámara. Si queda fuera del encuadre, de espaldas o está oculto, no solicita un render.
- Los textos, atributos y estilos de la interfaz solo se escriben cuando cambia su valor. Los símbolos vacíos no actualizan su posición cada cuadro.
- La resolución se adapta: si el cuadro tarda más de ~22 ms se reduce la densidad de píxeles (mínimo 0.75×) en un solo paso; si reducirla no ayuda, se vuelve atrás. MSAA solo a densidad baja y calidad completa.

En una comparación del cuarto diurno a 1000 × 760, con resolución fija y movimiento reducido, las llamadas de dibujo bajaron de 1943 a 646. El frame mantuvo los mismos 400987 triángulos procesados, sumando sus pasadas. Es una medida de trabajo de render en Chromium con `WEBGL_multi_draw`, no una promesa de FPS en todos los equipos.

## Verificación

```sh
npx playwright install chromium
npm test
```

Si el puerto habitual está ocupado, se puede usar `TEST_PORT=5194 npm test`.

### Animaciones de ActionForge

Zud usa seis clips de Quaternius (CC0) descargados de ActionForge: reposo,
caminata, baile y despegue/vuelo/aterrizaje. Se adaptan al rig compacto en
`src/actionforge-animation.js`, compartido por la escena y Character Lab.
La caminata sigue la distancia recorrida; los saltos conservan la física de
la escena. Las poses de escritorio, cama y objetos mantienen sus ajustes.
El GLB fuente, licencia y pasos de regeneración están en
[`public/animations/actionforge/README.md`](public/animations/actionforge/README.md).

## Hangar de la nave de Zud

Abrí `/spaceship.html` (o `/?view=spaceship`) para explorar la nave 033. El cuarto incluye un acceso **Nave de Zud** en desarrollo. El hangar también se genera en el build de `/house`, en `/house/spaceship.html`.

- Cámara orbital y cinco vistas; clic sobre una pieza o su etiqueta para identificar uno de los ocho sistemas.
- Apertura u ocultación de la cubierta, vista desarmada por conjuntos y etiquetas opcionales.
- **Zud al mando**: el personaje se sienta con las manos en extensiones de los controles y acompaña la nave durante el vuelo y el desarmado. Su gorro necesita la cubierta abierta u oculta.
- **Cómic**: activa el mismo shader Retro Print del proyecto en la nave, Zud y el hangar; al desactivarlo recupera los materiales originales.
- Secuencia de 18 segundos: encendido, despegue, vuelo estacionario y aterrizaje. Incluye pausa, arrastre de tiempo, velocidad y repetición. Espacio reproduce o pausa fuera de los controles.
- Movimiento reducido: vistas y desmontaje inmediatos, sin balanceo ni interpolación en el vuelo; la secuencia se muestra mediante estados. No hay reproducción automática.

El selector del hangar permite alternar entre **Nave 033** y **Oliva 037**. La Oliva conserva las 277 piezas y las tres texturas del GLB entregado, con inspección por sistemas, parabrisas ocultable, Zud sentado, vista desarmada y secuencia de vuelo. `ship-catalog.js` define los componentes, el asiento, los escapes y el faro de cada nave. La descarga entrega el GLB de la nave elegida.

El GLB original se conserva en `public/models/spaceship/zud-033.glb`, con las 322 piezas, colores y escala de autoría. Las dimensiones se expresan en unidades de escena, no en metros. La clasificación está en `src/spaceship-parts.js`; la animación y el escenario se generan en `src/spaceship.js`. La cubierta se eleva y desplaza para inspección; el modelo de origen no trae rig ni animaciones. La descarga entrega ese GLB original, sin las animaciones del visor.

Validación del hangar: `npx playwright test tests/spaceship.spec.js`.

## Biggas Hover Racing · Ruinas 034 y Nexus 035

Abrí `simulator.html` desde el botón del hangar. El inicio sigue el orden **portada → personaje → vehículo → mapa**. La portada es un título tipográfico animado, sin personajes, vehículos ni carga de WebGL. La selección usa fondo blanco, retratos frontales en fila, indicador amarillo y ficha azul; el modelo 3D aparece al elegir personaje. **Papel** está activo por defecto y se puede apagar desde cualquier paso: cambia el shader 3D, las miniaturas y la textura de la interfaz. La elección se conserva al iniciar el vuelo y al volver a la selección. Solo Zud está disponible como piloto. Se pueden elegir la Nave 033 y la Oliva 037; quedan ocho personajes y siete vehículos bloqueados. Las vistas 3D se pueden girar arrastrando, respetan movimiento reducido y se liberan antes de cargar el circuito. Enter confirma y Escape vuelve; también hay botones táctiles.

El último paso permite elegir **Ruinas 034** (795 m, pista de 12 m) o **Nexus 035 v03** (1212 m, calles de 18 m), y vuelo libre o contrarreloj. Confirmar carga el mapa y comienza el vuelo o la cuenta atrás. Ambos usan los GLB y colliders originales, con 16 checkpoints y tiempos independientes. Los enlaces antiguos de Cuenca preseleccionan Ruinas; `?map=nexus` preselecciona Nexus sin saltarse la preparación. Desde la pausa se puede volver a la selección.

W/S regula velocidad, A/D o ←/→ gira, E mantiene el derrape, Espacio frena, Shift activa turbo, F enciende/apaga los faros, C cambia cámara, M activa/silencia el sonido y R recupera desde el último checkpoint. En móvil, joystick horizontal y botones táctiles. Zud conduce con el shader cómic activo por defecto.

La selección de vehículo actualiza la miniatura, el modelo 3D y la ficha. La nave elegida viaja en `?vehicle=033` o `?vehicle=037` al entrar al circuito, reiniciar y volver al menú o al hangar. La Oliva tiene tres estelas de propulsión y un faro central (apagado inicialmente, tecla **F**); conserva sus UV y texturas tanto en cómic como en render normal. Ambas naves comparten los parámetros de conducción actuales; el volumen de colisión de la Oliva se adapta a su casco más ancho y largo.

La física usa pasos de 1/60 s: inercia lateral, dirección amortiguada, derrape controlable con recuperación gradual del agarre, suspensión de flotación de 0,65 m y choques inelásticos con parapetos. Los conos reaccionan al contacto. La altura sigue el collider real de las rampas y los checkpoints se validan en orden, incluyendo el regreso a meta. Los tiempos de esta física se guardan por separado de los anteriores.

En Ruinas, el entorno suma océano e islas, agua ondulada, cascadas y espuma animadas, banderas, helechos, balizas, drones de mantenimiento y semáforos de salida. El turbo deja estela, el derrape cambia la estela a ámbar y los impactos producen chispas. El botón ☾/☀ cambia entre día y noche: iluminación global de cielo y suelo, sol/luna con sombras, faros móviles, luz del motor y farolas cercanas. Los faros empiezan apagados; también se controlan con el botón del encabezado. Funciona también con cómic; las luces locales usan un conjunto limitado para móvil. La pausa congela la simulación y el entorno; `prefers-reduced-motion` desactiva el movimiento decorativo y la vibración de cámara.

Ambos cielos tienen gradiente atmosférico, nubes de volumen en capas con desplazamiento lento, sol diurno y luna/estrellas nocturnas. La cámara abre progresivamente su campo de visión al acelerar, se acerca y baja, y anticipa suavemente las curvas. A alta velocidad aparecen líneas de aire periféricas y aumenta el viento del motor; el turbo refuerza el efecto. `flight-atmosphere.js` agrupa las nubes en una sola malla instanciada (18 conjuntos en móvil, 30 en escritorio). La pausa congela las nubes y oculta las líneas; movimiento reducido fija la cámara y elimina estos efectos de movimiento.

Nexus conserva sus tres texturas incluidas (terreno, paisaje distante y asfalto), junto con sus UV. El resto de los modelos tiene texturas procedurales por superficie: asfalto, hormigón, roca, corteza, follaje, musgo, agua, espuma, vidrio, tela, pintura, ladrillo y metal. Los UV se generan a escala métrica; color y relieve funcionan con el cómic, y rugosidad en el render normal. Los mapas se comparten por familia y usan mipmaps para reducir el parpadeo a distancia.

Nexus añade ventilación de azoteas, vapor industrial, ventanas y franjas luminosas nocturnas, banderas, drones, conos y estelas. Su suelo sigue las mallas de calle, acera y terreno; un índice espacial conserva las colisiones cóncavas de edificios y barreras, incluido el paso bajo la arquitectura transversal. Puede salirse de la ruta: el terreno reduce la velocidad y, después de 10 s fuera o al alejarse más de 70 m, se recupera la nave desde el último checkpoint (+3 s en carrera). La cámara evita las masas de arquitectura. La geometría visual se agrupa por material y zona para permitir el descarte de bloques fuera de cámara.

`flight-selection.js` controla el inicio y su navegación; `flight-preview.js` muestra los modelos del equipo; `circuit-maps.js` registra los mapas; `circuit-collision.js` gestiona las superficies y colisiones de Nexus; `nexus-details.js` anima la ciudad; `circuit-textures.js` genera y libera esas texturas; `circuit-physics.js` controla la conducción; `circuit-world.js` carga el escenario y la superficie; `circuit-details.js` gestiona el ambiente y los objetos dinámicos; `circuit-lighting.js` gestiona las luces globales y locales; `race-audio.js` sintetiza y controla el audio; `flight-simulator.js` controla la sesión.

Pruebas: `TEST_PORT=5188 npx playwright test tests/circuit.spec.js tests/flight-simulator.spec.js tests/drift-lighting.spec.js tests/circuit-textures.spec.js tests/nexus.spec.js tests/flight-lobby.spec.js tests/race-audio.spec.js tests/game-music.spec.js tests/flight-atmosphere.spec.js tests/oliva-ship.spec.js tests/spaceship.spec.js --workers=1`.

El audio de carrera se genera con Web Audio: motor según velocidad, turbo, derrape/frenado, impactos, cuenta atrás, checkpoints, recuperación y meta. Se activa con la acción de entrar al circuito; **M** o el botón de altavoz activa/silencia el sonido y recuerda la preferencia. La pausa y salir de la pestaña silencian el juego.

Soundtrack local: **RALLY HOUSE** (`biggas-menu.mp3`) durante portada y selección; **MARLBORO CLUB** (`biggas-race.mp3`) en ambos mapas. `game-music.js` reproduce los MP3 en bucle, conserva la posición al pausar y comparte el control de sonido **M** con los efectos. Comienza tras la primera interacción para respetar el bloqueo de autoplay. No carga videos ni reproductores externos; las fuentes están registradas en `public/audio/biggas-soundtrack.json`.

`menu-motion.js` anima el recorrido del menú: entrada del título, salida de pantallas, aparición escalonada de tarjetas/modelos y barrido de entrada al circuito con progreso real. La cobertura permanece hasta renderizar el mapa y la cuenta atrás empieza después del revelado. Las animaciones se cancelan al navegar rápido; teclado y movimiento reducido cambian de pantalla de inmediato.
