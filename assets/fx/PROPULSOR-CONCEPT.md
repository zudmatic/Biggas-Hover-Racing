# Propulsor — exploración visual v1

Estado: concept; no cambia el juego. Lámina generada con image_gen integrado. No es una captura del efecto funcionando.

Láminas: [A/B/C](concepts/propulsor-abc-v1.png) y [D/E/F/G/H/I](concepts/propulsor-defghi-v1.png). Prompts completos en `propulsor-prompt-v1.json` y `propulsor-prompt-v2.json`.

## Exploración ampliada

- D · Pulsos: anillos que se separan y expanden detrás del núcleo; frecuencia ligada al empuje.
- E · Llama dentada: lenguas de fuego planas y angulares; fluctuación suave de longitud.
- F · Descarga: ramificaciones eléctricas; mantener una trayectoria estable y renovar pequeños tramos para evitar parpadeo excesivo.
- G · Plasma: esferas facetadas que se separan, encogen y rompen en fragmentos.
- H · Filamentos: hebras finas que conservan el recorrido y ondulan suavemente.
- I · Fragmentos: piezas alargadas orientadas con la velocidad, espaciadas y disipadas con trama.

Para una primera comparación en movimiento: C, E e I ofrecen continuidad, fuerza y fragmentación respectivamente. D puede explorarse como un turbo especial. Son propuestas, no variantes ya implementadas.

## Referencias

- [Rocket League: ejemplos oficiales animados de boosts](https://www.rocketleague.com/news/coming-soon-competitive-season-3-and-season-2-rewards/).
- [Distinción oficial entre Rocket Boosts y Trails supersónicos](https://www.rocketleague.com/news/competitive-season-4-rewards/).
- Captura propia `.context/compare-ruins-high.png` para la nave y el acabado del mundo.

Las fuentes documentan apariencia y categorías; no explican su implementación interna. La arquitectura propuesta aquí es propia para Three.js.

## Variantes para comparar

| Variante | Forma | Comportamiento propuesto |
| --- | --- | --- |
| A · Chorro | Núcleo marfil, llama naranja facetada y fragmentos | Corto y enérgico, unido a la orientación del propulsor |
| B · Cinta | Banda turquesa estrecha con centro claro | Registra el recorrido; conserva la curva al girar y se afina hacia atrás |
| C · Mixto | Chorro corto más cinta y pocos fragmentos | Combina lectura inmediata del empuje y continuidad del movimiento; candidato inicial |

La 033 tiene dos toberas y Oliva tres, definidas en `src/ship-catalog.js`. Los efectos deben salir de esas posiciones transformadas por la nave, incluyendo escala, cabeceo y balanceo. Evitar la emisión genérica desde el centro que utiliza la estela actual.

## Movimiento propuesto

- Normal: núcleo corto, cola tenue proporcional al empuje.
- Turbo: crecimiento rápido pero continuo del chorro y la longitud; la velocidad también afecta el espaciado de la cola.
- Al soltar: se corta la emisión nueva y los segmentos existentes terminan su vida sin desaparecer de golpe.
- Curvas: la cola antigua permanece en el recorrido; no rota toda junto con la nave.
- Frenado: propulsión se atenúa mientras el humo de frenado conserva su propia forma y controles.
- Variación: fluctuación suave de longitud y pequeñas diferencias por partícula al nacer; evitar sortear una forma totalmente distinta en cada cuadro.
- Pausa congela; recuperar/reiniciar limpia; movimiento reducido elimina la cola dinámica.

## Prototipo posterior, como el frenado

Panel `Propulsor · comparación` con A/B/C y controles de longitud, ancho, duración de la cola, intensidad, cantidad de fragmentos, variación, trama, color del núcleo y color exterior. Valores propuestos para arrancar: longitud 1, ancho 1, cola 0,35 s, variación 0,15, trama 1,5; ajustar conduciendo. Separar intensidad normal y turbo. Guardar ajustes y limpiar la cola al cambiar variante.

Implementación propuesta: geometría corta orientada en cada tobera para el núcleo; cinta con historial de posiciones para B/C; partículas de capacidad fija para el final. Colores planos, borde escalonado y desaparición tramada, con brillo contenido compatible con el acabado cómic. Muestrear la cinta por distancia e interpolar el nacimiento entre cuadros para mantener continuidad a 30/60/120 FPS. Reutilizar buffers y agrupar geometrías; limitar duración, longitud y cantidad de segmentos.

Comparar la misma aceleración, giro, turbo y liberación en Ruinas/Nexus, ambas naves y móvil. Verificar unión a las toberas, legibilidad de la pista, pausa, limpieza y costo gráfico. La lámina orienta forma y color; el movimiento y costo se validarán en el prototipo.
