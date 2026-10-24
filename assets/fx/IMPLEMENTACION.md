# Biggas — efectos pixel-cómic

Propuesta preparada el 23 de octubre de 2026. Estado: derrape y frenado con variantes A/B/C integrados; aceite implementado en vuelo libre. Bomba pendiente. Los mockups son ilustraciones generadas, no capturas de una implementación funcionando.

## Primer pase implementado

### Exploración A/B posterior

Actualización: híbrido es ahora el estilo inicial. DialKit incluye **Tamaño** (multiplicador 0,5–2,5; inicial 1,3) y **Duración** (multiplicador 0,5–3; inicial 1,5). Los valores afectan al humo nuevo, no a chispas ni marcas, y se guardan en el navegador. **Cuatro ruedas** es opcional y empieza apagado: al activarlo se reparte la emisión entre los cuatro puntos laterales delanteros/traseros estimados desde el tamaño de la nave. No se cuadruplica la cantidad total ni se emiten cuatro partículas simultáneas. El estilo se puede alternar con A/B/C. Color inicial `#bababa`, densidad 1 y trama 1,5; color, densidad y trama se actualizan en vivo.

El panel **Humo · comparación** permite elegir **A · Fragmentos procedurales**, **B · Humo híbrido** (predeterminado) y **C · Mixto**. Cada cambio limpia los efectos activos, muestra un aviso y devuelve el foco a la conducción. A genera siluetas irregulares en shader sin utilizar la imagen como máscara de humo; B utiliza dos siluetas de la fuente, giradas y superpuestas, sin el salto entre cuadros del primer pase. Ambos emplean tramado Bayer, crecimiento, giro y desaceleración. Forma, tamaño, rotación y duración se eligen al nacer; no se aleatorizan cada cuadro.

La emisión se activa con deslizamiento lateral significativo, tiene intervalos desfasados y favorece el lado hacia el que se desliza la nave. Mantener E en recta no produce humo. Las chispas se reservan para deslizamientos fuertes o contacto. El frenado conserva emisión según velocidad. Permanecen las marcas cortas y los límites de objetos del primer pase.

Prueba manual: acelerar con W, mantener E mientras se gira brevemente con A/D, comparar variantes desde el panel y usar R para volver al punto de recuperación. La comparación se realiza conduciendo; todavía no hay repetición automática de una trayectoria idéntica. Capturas: `.context/fx-procedural-ruins.png`, `.context/fx-hybrid-ruins.png` y equivalentes de Nexus. Pruebas automatizadas verifican ambos estilos, ausencia de humo en recta, cambio de estilo, pausa y limpieza. La implementación anterior se describe abajo como historial del primer pase.

`src/flight-fx.js` añade humo marfil animado, chispas turquesas al derrapar y ámbar al frenar, y roces discontinuos. Usa dos geometrías compartidas de capacidad fija: aire y suelo. El shader muestrea la fuente artística con una cuadrícula de 48 píxeles por celda, recorta alfa y remapea el color a tres tonos de papel/tinta. La desaparición es tramada, con prueba y escritura de profundidad para evitar problemas de orden entre transparencias.

La fuente se conserva sin editar en `public/images/fx/pixel-comic-source-v1.png`; el recorte y la limpieza de color se hacen al renderizar. Esto permite validar el arte antes de exportar un atlas limpio y reducido. La versión actual consume la hoja completa aunque solo usa humo y una estrella.

La cantidad depende del tiempo y del deslizamiento. La escala y los puntos laterales siguen el tamaño de la nave; las partículas emitidas permanecen en el mundo. Las marcas consultan la altura en cada vértice y omiten huecos o saltos de posición. Pausa congela, recuperación/reinicio limpian y movimiento reducido oculta y vacía los FX. Se conserva la estela existente para vuelo normal/turbo y las chispas de choque; se evita duplicarla durante derrape o frenado.

Verificación: pruebas de emisión a 30/60/120 Hz, capacidades, pausa, expiración, recuperación, movimiento reducido, rampas y huecos; prueba en navegador de Ruinas/033 y Nexus/037 con captura visual y sin errores de consola. Las capturas están en `.context/fx-drift-ruins.png` y `.context/fx-drift-nexus.png` desde la raíz del proyecto. No se ha medido todavía el costo de GPU en dispositivos móviles físicos ni realizado una comparación de rendimiento antes/después. El selector A/B/C queda para un siguiente pase de ajuste.

## Material preparado

- `concepts/style-comparison-v1.png`: tres tratamientos sobre una referencia del circuito Ruinas y la nave actual.
- `concepts/pixel-comic-sprite-studies-v1.png`: fuente transparente con 16 estudios. No usar como atlas definitivo: revisar halos, padding, pivotes y continuidad entre cuadros antes de exportar.
- `../../art/concepts/racing-fx-concepts-v1.png`: primera exploración.
- `prompts.json`: prompts completos de las dos nuevas imágenes, generadas con ImageGen integrado.

## Opciones visuales

| Opción | Aspecto | Uso sugerido |
| --- | --- | --- |
| A — Retro seco | Pocas partículas, humo pequeño, marcas quebradas | Variante discreta o menor carga visual |
| B — Pixel-cómic | Humo marfil angular, sombras de tinta, chispas puntuales | Dirección recomendada para el juego |
| C — Arcade intenso | Humo grande, más estrellas y estelas | Reservar intensidad para golpes o derrapes fuertes |

B combina mejor con el papel, semitono y colores de las naves. Evitar efectos blancos lisos, niebla realista y grandes resplandores. Mantener el humo por debajo del piloto y hacia los laterales. Las marcas de hover serán fragmentos de roce, no huellas continuas de neumáticos. Los mockups ilustran intensidad y paleta; la trayectoria exacta de las marcas se obtiene del movimiento real.

Paleta inicial: marfil `#f3efdf`, carbón `#262c32`, turquesa apagado `#64c5b3`, naranja `#ed8c37`, aceite casi negro con pocos reflejos violetas. La forma diferencia los eventos además del color.

## Opciones de implementación

| Método | Ventaja | Limitación | Decisión |
| --- | --- | --- | --- |
| Sprites individuales + planos en suelo | Primer prototipo fácil de ajustar | Muchos objetos y transparencias si crece la cantidad | Útil para validar tamaño y animación |
| Atlas + partículas agrupadas + geometría de suelo compartida | Control artístico y cantidad acotada de envíos al render | Requiere UV por instancia y manejar transparencia | Recomendado como implementación final |
| Fragmentos y humo geométricos en 3D | Volumen desde todas las cámaras | Se aleja del concepto dibujado y añade geometría | Usar solo para pocos restos de impacto |

Los sprites de humo e impacto miran a cámara. Las manchas permanecen en el mundo y siguen la superficie real. El movimiento de las partículas es continuo; la textura cambia en cuadros discretos. El atlas no es requisito para el primer prototipo.

## Especificación de efectos

Valores iniciales propuestos, sujetos a pruebas; no son mediciones ni ajustes aplicados. W representa el ancho visible de la nave con su escala actual.

| Efecto | Aparición | Tamaño y tiempo | Suelo |
| --- | --- | --- | --- |
| Derrape | `state.drifting`, intensidad según velocidad y `abs(state.slip)` | Humo 0,15–0,4 W; 0,35–0,6 s; 4 cuadros a 8–12 fps | Segmentos cortos cada 0,5–0,9 unidades recorridas, vida 1,5–2,5 s |
| Frenado | `state.braking` y velocidad mayor a 8 | Polvo bajo 0,12–0,3 W; 0,2–0,4 s; pocas chispas | Roce corto, más intenso al frenar fuerte; no emitir parado |
| Bomba | Evento único con posición y radio del impacto | Destello 0,06–0,1 s; golpe 0,15–0,25 s; humo 0,5–0,8 s | Quemadura 3–4 s, puramente visual |
| Aceite al verter | Creación de un tramo en `sim.patches` | 2–4 gotas por evento, 0,2–0,35 s | Mancha vinculada al tramo real; conserva su duración configurada |
| Aceite al tocar | Incremento de `oilHitSerial` | Salpicadura lateral pequeña, 0,15–0,25 s | Sin crear nueva zona de ralentización |

Las marcas y gotas se desprenden de la nave al emitirse. No deben seguirla durante su vida. El humo se desplaza suavemente hacia atrás y crece poco; evitar una pared opaca. Orientar el humo direccional según la proyección del desplazamiento en pantalla, verificando la cámara trasera.

## Preparación de texturas

1. Tomar los 16 estudios como fuente artística. Limpiar contornos coloreados y píxeles semitransparentes accidentales; comprobar sobre fondo claro, oscuro y color del asfalto.
2. Exportar humo y chispas a una cuadrícula lógica de 64 × 64; explosión y manchas a 128 × 128 si hace falta. Mantener tamaño de píxel perceptual coherente en pantalla.
3. Alinear el pivote inferior del humo y el centro de los impactos; las cuatro fases no deben saltar de posición.
4. Empaquetar con margen transparente y UV interiores. Usar filtrado nearest para magnificación y comprobar parpadeo a distancia antes de decidir la política de minificación.
5. Probar primero opacidad recortada y disolución tramada. Si se usa mezcla alfa, mantener prueba de profundidad, desactivar escritura de profundidad y resolver el orden de los elementos transparentes. Evitar humo aditivo; reservar brillo, si se necesita, para pocas chispas.

La hoja generada no cumple automáticamente esas condiciones. No se recortó ni se conectó como atlas de producción en esta preparación.

## Conexión con el código existente

- `src/circuit-details.js` ya tiene un pool de 90/180 puntos para estela y chispas. Separar los nuevos FX en un módulo propio y reemplazar la emisión equivalente para no duplicar humo/chispas. Usar acumuladores por segundo, no cantidades por fotograma.
- `src/circuit-physics.js` expone `drifting`, `braking`, `slip`, `speed` e `impactSerial`. Leerlos sin cambiar la conducción. Un choque de pared no equivale automáticamente a una bomba.
- `src/flight-oil.js` agrupa las manchas en una geometría y proyecta su perímetro sobre `surfaceHeight`. Conservar ese enfoque y la asociación con los tramos reales; reemplazar textura y forma visual sin modificar contacto ni duración. Mantener cobertura visible de la zona peligrosa, evitando grandes huecos transparentes dentro del área efectiva.
- `src/oil-simulation.js` conserva la lógica de ralentización y aturdimiento. Los FX no deben introducir colisiones ni nuevos impactos.
- `src/circuit-world.js` ofrece `surfaceHeight`, `reset` y `update`: usar esa superficie para las marcas en rampas. No proyectarlas solo sobre un plano horizontal ni unir segmentos a través de huecos, reinicios o recuperación.
- `src/flight-simulator.js` coordina fase, pausa, escala y movimiento reducido. Conectar ciclo de vida y limpieza en esos puntos. Las marcas ya emitidas conservan su tamaño aunque cambie la escala de la nave.
- La bomba aparece como concepto en `docs/concepts/items/CONCEPTO.md`; no se encontró una mecánica de bomba implementada en los archivos revisados. Preparar `emitBombImpact(position, radius)` y validarla con un disparador de prueba antes de conectar daño o lanzamiento.

API propuesta del módulo: `update(dt, context)`, `emitBombImpact(position, radius)`, `reset()` y `dispose()`. Un solo reloj de simulación; pausa congela vidas y animación. Reiniciar y recuperar cortan continuidad de las estelas.

## Presupuesto inicial y validación

Propuesta: máximo 96 sprites de aire y 160 segmentos de roce en escritorio; 40 y 64 en móvil. Son límites de diseño a medir, no garantía de rendimiento. Mantener aparte el límite actual de manchas de aceite y su lógica de juego. Reutilizar recursos; al saturar, reemplazar el efecto cosmético más antiguo. Reducir emisión por distancia, conservando legibilidad de peligros activos.

Validar en Ruinas y Nexus, con ambas naves, en recta y rampa, día/noche y cómic activado/desactivado. Comparar a 30/60/120 Hz para asegurar densidad temporal estable. Comprobar cámaras delantera/trasera/cercana, pausa, reinicio, recuperación y escala 0,35–1,25. Con movimiento reducido, quitar sacudidas y destellos fuertes, reducir partículas y conservar aceite visible.

Primer pase recomendado: derrape y frenado B; segundo pase: aceite con el bot existente; tercer pase: bomba aislada. Agregar un selector A/B/C de prueba usando el mismo sistema y variando cantidad, tamaño y vida. Medir tiempo de cuadro, objetos y draw calls respecto a la versión actual antes de fijar presupuestos.

## Referencias técnicas

- [SpriteMaterial de Three.js](https://threejs.org/docs/pages/SpriteMaterial.html): texturas para sprites y alfa.
- [Material de Three.js](https://threejs.org/docs/pages/Material.html): alphaTest, profundidad y transparencia.
- [InstancedMesh de Three.js](https://threejs.org/docs/pages/InstancedMesh.html): instancias y actualización de límites.

Las recomendaciones de integración se basan en los archivos locales revisados; las duraciones y cantidades son propuestas artísticas.
