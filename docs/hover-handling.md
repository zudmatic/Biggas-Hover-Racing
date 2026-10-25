# Conducción flotante

Este pase busca que la nave conserve inercia al doblar, flote sobre cambios de
pendiente y se incline con peso. Los controles siguen siendo W/S, A/D, E,
Espacio y Shift. Conviene empezar el giro antes y usar el contravolante para
corregir la trayectoria.

## Referencia: WipEout (1995)

Se inspeccionó el archivo aportado `WipEout (USA).7z`: contiene un disco de
PlayStation con una pista de datos y ocho de audio. El volumen ISO es `WIPEOUT`
y `SYSTEM.CNF` arranca `SCUS_943.01`. Esto identifica el material; no permite
deducir por sí solo las constantes de movimiento.

La comparación de movimiento se hizo con la
[reescritura jugable de PhobosLab](https://phoboslab.org/wipegame/), y se consultó
su [implementación de la nave](https://github.com/phoboslab/wipeout-rewrite/blob/master/src/wipeout/ship_player.c).
Allí la orientación y la velocidad son estados separados; el empuje, la
resistencia y la sustentación modifican la velocidad. El giro acumula velocidad
angular y alimenta el balanceo. El
[manual original para PC, página 15](https://www.bestoldgames.net/download/games/wipeout/wipeout-dos-manual.pdf)
describe aerofrenos independientes para curvas cerradas.

La interpretación para Biggas es conservar deslizamiento, suavizar la
suspensión y dar continuidad al balanceo. La reescritura es una referencia
cualitativa: no se ejecutó la imagen PS1 en un emulador ni se midió equivalencia
con su física. El PR contiene código propio y documentación; el disco y sus
recursos quedan fuera del repositorio.

## Comportamiento y ajustes

`HOVER_HANDLING` en `src/circuit-physics.js` reúne los parámetros. Las tasas de
respuesta y amortiguación están en s⁻¹; las rigideces, en s⁻².

| Parte | Cambio | Resultado esperado |
| --- | --- | --- |
| Agarre lateral | 9 → 4,8; derrape 2,3 → 1,6 | La trayectoria tarda más en seguir al morro, incluso sin E. |
| Dirección | Entrada 8,5; salida 5,8; contravolante 14 | El giro tiene continuidad y corregir sigue siendo rápido. |
| Suspensión | Rigidez 64, amortiguación 9 | La altura integra velocidad vertical en coordenadas del mundo. |
| Pendientes | Amortiguación respecto a la velocidad de la superficie | Sube rampas manteniendo apoyo y conserva impulso al coronarlas. |
| Cabeceo / balanceo | Resortes con velocidad angular propia | El casco tarda en asentarse al acelerar, frenar o cambiar de giro. |
| Frenado | Agarre lateral 9 y desaceleración existente | Espacio permite recuperar el control y prevalece sobre E y turbo. |

La altura nominal sigue siendo 0,65 m. La separación segura está acotada a
0,43–1,25 m: es un hover asistido para los circuitos actuales, no un modelo de
vuelo libre o saltos balísticos. El chequeo de colisiones conserva la altura
integrada y corrige únicamente separaciones inseguras. La recuperación consulta
la superficie real y reinicia la velocidad vertical y angular.

El movimiento reducido elimina la oscilación ociosa y la vista sigue ocultando
el balanceo. La trayectoria horizontal, los controles y el apoyo en pendientes
son los mismos.

## Comparación reproducible

En una superficie plana amplia, iniciar a 30 m/s, mantener giro 0,5 durante
40 pasos de 1/60 s y soltar durante 15 pasos. Sin derrape ni turbo:

| Medida | Antes | Ahora |
| --- | --- | --- |
| Ángulo entre velocidad y morro al terminar el giro | 6,6° | 11,8° |
| Ángulo restante 0,25 s después de soltar | 1,6° | 7,4° |
| Giro adicional durante esos 0,25 s | 4,3° | 8,2° |

Son mediciones de Biggas, no de WipEout. El objetivo es un deslizamiento
perceptible que termina asentándose, sin generar velocidad extra al derrapar.

## Validación y prueba de manejo

`tests/hover-handling.spec.js` cubre continuidad y recuperación del giro,
contravolante, límites de velocidad, balanceo, cambios de altura, rampas,
colisiones, recuperación, movimiento reducido y estabilidad a 30/60/120 Hz.
El juego mantiene su paso físico de 60 Hz y la interpolación de render existente.

Las pruebas de vueltas conservan el requisito de completar los 17 cruces sin
colisiones. Su conductor automático anticipa 0,5 s en lugar de 0,3 s para
acompañar la mayor inercia. Las comprobaciones de altura admiten el recorrido de
la suspensión en lugar de exigir una distancia casi constante al suelo.

Para evaluar el tacto en equipo:

1. En Ruinas, alcanzar velocidad media, dar un toque de A/D y soltar: el casco
   y la trayectoria deben terminar el giro gradualmente.
2. Repetir con E, corregir con la dirección opuesta y luego frenar con Espacio.
3. Pasar una rampa con y sin turbo: observar el pequeño ascenso al coronarla y
   cómo se asienta la nave.
4. Probar Nexus y Mario Raceway, incluyendo barreras y pasajes estrechos.
5. Pausar durante un giro y recuperar con R: no debe quedar impulso de la
   posición anterior.

Los números son un primer ajuste para playtesting; la preferencia final de
agarre y balanceo requiere que el equipo lo maneje.
