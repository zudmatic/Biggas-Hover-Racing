# Cierre del refactor de rendimiento

Validación local: 27 de octubre de 2026. Base de comparación: `82cf702`.

## Alcance

- Integración de los módulos TypeScript con contratos comunes de personajes, vehículos y pistas.
- `RaceSession`, simulación fija e interpolación, cámaras, input y HUD con ciclo de vida explícito.
- Carga centralizada, warmup de escenarios/LOD durante la pantalla de carga, matrices estáticas y cachés de materiales.
- Una instancia de Three.js en el juego y el laboratorio de efectos; adaptación local de `core-vfx` en lugar del wrapper que incorporaba otra copia.
- Audio centralizado: música, motor, efectos, emisores del tren y voces procedurales de los personajes.
- Selección, hangar, playground, estudios y exportadores migrados a las nuevas APIs. Se eliminaron las fachadas de compatibilidad obsoletas.
- Calidad inicial automática, conservación de preferencias guardadas y APIs de diagnóstico solo en desarrollo.
- Corrección de la ruta de instancias de Three r182 para WebGL2 con bloques uniformes de 16 KiB. La geometría y la cantidad de instancias se conservan.

La integración con `main` incorpora el modelo Zudoneta v07, su manifiesto y sus miniaturas exactamente como los publicó Zud (`aaebac7`), y conserva la retirada de los modelos 033/Oliva. Los demás modelos y texturas no se modifican; `public/basis/` añade los transcodificadores del refactor. **La compresión de assets quedó fuera de alcance por decisión del usuario.** Los scripts de inspección y optimización están disponibles para una entrega posterior; no se aplicaron sobre los modelos del juego.

## Comprobaciones

- `npm run check`: TypeScript estricto del juego/configuración/scripts y build de producción.
- Build independiente del laboratorio `experiments/vfx-lab`.
- Capturas locales de cuatro mapas, sus variantes probadas, los seis vehículos anteriores a la integración de Zud, cinco personajes, selección y herramientas.
- Conducción, pausa sin avanzar física, continuación, reinicio, cambio de cámara y persistencia del interruptor de sonido.
- WebGL2 forzado y build de producción con movimiento reducido; ausencia de APIs de debug y paneles DialKit en producción.
- Comprobaciones de loop fijo: límite de recuperación tras un frame largo, pausa, reset, reinicio y liberación del callback; preferencias por defecto.
- Generación de previews en una carpeta temporal, sin reemplazar las imágenes originales.

Los informes, capturas y pruebas de esta sesión quedan en `.context/codex/`, `.context/visual/` y `.context/bench/`, excluidos de Git según la convención de esta branch.

## Integración de Zudoneta

Se fusionó `aaebac7` conservando la arquitectura TypeScript y el historial de Zud. `VehicleDefinition.paint` y `VehicleLivery` incorporan las cinco pinturas sin alterar las texturas mecánicas ni los UV; las variantes restauran exactamente los mapas y colores originales. La selección acompaña al jugador en preview, carrera, reinicio y enlaces al hangar, independientemente de la paleta o sombrero del piloto.

El hangar usa los mismos motores del juego mediante `createExhaustEngine`, conserva las etiquetas apagadas por defecto y el control independiente del parabrisas. También incorpora la corrección de matrices GPU al rearmar las piezas. Los módulos JavaScript de Zud se portaron a los dominios del refactor y sus pruebas se adaptaron a esas APIs para ejecutarlas localmente, siguiendo la convención de esta branch.

Comprobaciones de la integración: siete pruebas de modelo/pintura y seis de comportamiento del hangar pasaron; `npm run check` pasó. Una prueba heredada busca `data-comic` en la carrera, atributo de diagnóstico retirado por el refactor: sus comprobaciones visuales del hangar y navegación pasaron, pero esa aserción final quedó sin adaptar. Las pruebas de navegador se detuvieron a pedido del usuario, sin nuevas ejecuciones. El ajuste del valor predeterminado del laboratorio se verificó por lectura de código.

## Medición exploratoria

Esta medición corresponde a `3afef74`, antes de incorporar el modelo nuevo de Zud; no mide el rendimiento de la integración posterior.


Chromium con WebGPU nativo, ventana de 1512 × 945, DPR 2, calidad alta y escala interna 1.00. Se ejecutó el mismo script de conducción secuencialmente sobre la base y el refactor, con 600 frames y profiler de CPU activo, sin límite de FPS.

| Métrica | Base | Refactor |
| --- | ---: | ---: |
| FPS medio | 137.3 | 214.3 |
| Tiempo medio de frame | 7.28 ms | 4.67 ms |
| p95 de frame | 11.2 ms | 6.0 ms |

Es una comprobación breve de tendencia en esta máquina, no una garantía de FPS ni un benchmark estadístico. Al medir un número fijo de frames mientras el vehículo avanza, la duración y el tramo exacto recorrido difieren. Para comparaciones reproducibles por posición usar `npm run bench:desert -- webgpu` y varias repeticiones. No se modificó la calidad para favorecer la medición.

## Límites conocidos

Vite sigue avisando del tamaño de los chunks de Three.js y del renderer de las herramientas. Las capturas WebGPU registran avisos de normales ausentes y draws vacíos; Los avisos de buffers uniformes vacíos detectados en Nexus y Mario se corrigieron excluyendo del warmup los pools sin capacidad. Las escenas se renderizaron y las capturas quedaron guardadas para inspección. Esta comprobación no sustituye una matriz de dispositivos móviles ni pruebas largas de estabilidad.

Para exportar previews sin tocar los originales, definir `PREVIEW_OUTPUT_DIR` al ejecutar `scripts/render-*-previews.mjs`.
