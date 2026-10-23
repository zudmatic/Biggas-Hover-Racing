# Familias de superficies

La biblioteca en `src/surface-library.js` define las recetas del personaje y del cuarto. Conserva la paleta aprobada: cuerpo `#302727`, gorro `#d95326`, ojos `#fffefa`, pupilas `#251e1d`, madera cálida y telas azuladas.

| Familia | Aplicación | Acabado |
| --- | --- | --- |
| Piel mate | Cuerpo, cabeza y extremidades | Grano fino, contraste y relieve mínimos |
| Tejido suave | Gorro, pompón, ropa de cama y persiana | Puntos pequeños, relieve suave |
| Madera | Piso, cama, escritorio, silla, estante y mesita | Veta longitudinal discreta |
| Yeso | Paredes y superficies minerales | Grano fino de baja intensidad |
| Metal satinado | Laptop | Microtextura direccional, poco contraste |

Cada receta define `density` (repeticiones por unidad del cuarto), `contrast` (variación de color), `bump` (relieve), `mottle` y `facets` (variación adicional de Retro Print). Cambiar estos valores actualiza todos los consumidores de la familia al recargar. Las texturas se generan de forma determinista, en gris; cada material aporta su propio color. El mapa de color usa sRGB y el mapa de relieve es lineal.

El cuarto conserva su iluminación y tratamiento Retro Print; el personaje conserva su material toon. Las familias normalizan sus superficies, no reemplazan estos modelos de iluminación. El metal del cuarto sigue siendo difuso, sin reflejos PBR. El póster, el paisaje y la alfombra conservan sus imágenes y UV originales.

En Cómic y Cómic B/N, Retro Print posteriza la luz conservando la variación del mapa de color: la veta, el tejido y las imágenes siguen visibles. Esto se aplica a todos los materiales con textura. La opción de depuración B/N de dos tonos (`monoDetail: 0`) mantiene su simplificación deliberada.

## Escala y edición

Las familias del personaje usan un segundo canal UV medido en unidades del cuarto, incluyendo la escala propia de cabeza y pompón. El estudio amplía el personaje manteniendo esa densidad. Las superficies del cuarto usan UV físicos; la persiana actualiza sus UV mientras se despliega.

En Zud Lab, **Base** y **Restaurar base** usan piel mate y tejido suave. **Repetición** y **Relieve** multiplican proporcionalmente la receta de cada familia; 3 y 0.1 son sus valores de referencia. Se puede aplicar cualquiera de las cinco familias al cuerpo o al gorro para experimentar. Los controles de rugosidad y metal siguen correspondiendo al material físico.

Los JSON de versión 1 siguen siendo compatibles. `noise`, `knit`, las imágenes propias y sus UV normalizados mantienen el comportamiento anterior; el selector los identifica como **Grano anterior** y **Tejido anterior**. Una variante local guardada se recupera tal como fue guardada: pulsar **Base** permite probar la nueva biblioteca.
