# Biggas Hover Racing

Juego de carreras hover en 3D con Zud, las naves 033 y Oliva 037, y los circuitos Ruinas 034 y Nexus 035. Incluye selección de equipo, hangar interactivo, acabado cómic/papel, turbo, derrape, iluminación dinámica y música integrada.

## Desarrollo

```sh
npm ci
npm run dev
```

- Inicio y selección de partida: `http://localhost:5173/`
- Hangar: `http://localhost:5173/spaceship.html`
- Entrada alternativa al juego: `http://localhost:5173/simulator.html`

En la landing, **Jugar** abre la selección de personaje, nave, circuito y modo. El enlace **Hangar** permite inspeccionar las naves y sus componentes. Desde el hangar se puede volver al inicio o abrir la selección de partida con la nave elegida.

Las rutas del juego aceptan `?vehicle=033|037`, `?map=ruins|nexus` y `?comic=0|1`. El hangar acepta `?vehicle=033|037`. El enlace anterior `/?view=spaceship` sigue abriendo el hangar.

## Controles

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
- `src/spaceship-pilot.js`, `zud-*`, `character-*`, `eye-settings.js`: modelo, apariencia y rig del piloto.
- `src/retro-*`, `surface-*`, `paper.js`: renderizado cómic y superficies compartidas.
- `src/racing-theme.css`: colores y textura de papel compartidos por la landing y el hangar.
- `src/race-audio.js`, `game-music.js`: efectos procedurales y banda sonora.
- `public/models/`, `public/images/flight/`, `public/audio/`: recursos del juego.

El repositorio contiene únicamente el juego y el hangar. La escena de la casa, sus editores y su compilación independiente fueron retirados. El modelo de Zud y el renderizado compartido permanecen porque los utilizan el piloto y las vistas previas.

Más información: [acabado cómic](docs/comic-print.md), [superficies del piloto](docs/surfaces.md) y [banda sonora](public/audio/README.md).
