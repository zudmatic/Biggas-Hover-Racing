# Tokyo Highway · primer pase nocturno

Mapa de prueba de 2,73 km, disponible en el selector como **Tokyo Highway**.
En desarrollo: `/?selection=map&map=tokyo-highway&pilot=zudmatic`.
Arranca de noche, con el look natural y el cielo pintado del GLB.

## Ajustar la luz

El panel **Tokyo · iluminación nocturna** de DialKit incluye:

- **Luna**: intensidad, relleno ambiente, altura y color de la luz direccional.
- **Sodio**: potencia de las luces locales, emisión de las lentes y color ámbar.
- **Tunel**: potencia, emisión y color independientes.
- **Torre**: iluminación aparente de la fachada, intensidad de las balizas y parpadeo.
- **Ventanas**: activar, densidad e intensidad de las ventanas iluminadas.
- **Resplandor**: halo de las superficies emisivas en el look natural.

Los ajustes se guardan en el navegador en desarrollo; producción usa los valores
de `src/content/tracks/tokyo-highway/tokyo-lighting.ts`. El botón de iluminación
del menú de pausa permite comparar día/noche; el fondo pintado sigue siendo
nocturno. La pausa congela las balizas, y movimiento reducido las deja fijas.

Se puede sumar `&testSpawn=tunnel`, `bridge`, `tower` o `underpass` a la URL en
desarrollo. `&renderer=webgl2` fuerza el fallback; el otro backend es WebGPU.

## Implementación y alcance

El archivo `public/models/tokyo-highway/tokyo-highway.glb` es una copia exacta del
export `tokyo-highway-complete-optimized.glb` recibido. Se conservan sus texturas,
UV secundarios, colores de vértice, compresión Draco y materiales unlit del fondo.
SHA-256: `1bceccb30aa25c29d4ea0b52e5e32524887dfa82f5cb09b6eab8f9e4b29707fe`.

Se detectaron 112 lámparas de sodio (incluidas 24 del puente), 64 del túnel y
6 balizas de la torre. Las lentes emiten a cualquier distancia; un pool fijo de
8 focos en escritorio o 4 en móvil ilumina las superficies cercanas a la nave.
Las luces locales no proyectan sombras; la luz direccional sí. El pool atenúa
la entrada/salida de luminarias sin agregar luces ni recompilar shaders al conducir.
Desde una vista aérea, el pavimento lejano no recibe estas luces locales.

La noche usa una luz direccional fría y relleno hemisférico, sin GI ni lightmap
horneado. La torre usa una emisión suave modulada por su textura para simular
la iluminación de la estructura, más sus balizas rojas separadas.

El bonus de ventanas cubre los atlas **TokyoMidrise** y **TokyoResidentialOffice**.
Una máscara de vidrio excluye paredes y marcos; un hash por edificio y ventana
elige cuáles se encienden. No cambia al recargar ni titila al mover la cámara.
Los edificios del atlas común y los escaparates quedan para un próximo pase.

El export no incluye ruta ni colliders dedicados. Este prototipo deriva la
superficie del sector de asfalto de su atlas y usa el resto de la autopista y
puente como colisión. La consulta de altura distingue las dos calzadas en el
cruce elevado. El puente permanece cerrado y estático. Los datos de ruta sirven
para conducir, recuperar la nave y dibujar el minimapa; requieren revisión
artística si cambia la geometría del export.

## Reimportar

Desde la raíz del proyecto:

```sh
pnpm exec tsx scripts/assets/prepare-tokyo.ts "ruta/al/tokyo-highway-complete-optimized.glb"
```

El script copia el GLB sin transformarlo y deriva `lights.json`, `route_gltf.json`
y `gameplay.json`. Valida la continuidad de la calzada y la unión del puente;
si cambian, falla para permitir revisar el export. Las imágenes del selector
son capturas de la escena renderizada.

Para cambios en esta integración, comprobar tipos/build, ambos renderizadores,
conducción dentro del túnel, el cruce inferior, reinicio y alternancia día/noche.
