BIGGAS CITY | Revisión v02
Circuito de ciudad, bosque y cascada construido en Blender 4.3.2.

NOVEDADES
Nombre de pista: Biggas City. Cartelería, comercios y decoraciones: BIGGA.
Estatua original de gato sentado de 44,54 m de alto, sobre pedestal y plaza;
altura total del monumento aproximada de 60 m sobre la cota cero del mapa.
Ojos jade, orejas, hocico, bigotes, patas, cola curvada, collar y placa BIGGA.
Faroles y carteles de neón con iluminación real por luces puntuales y spots;
las superficies emisivas no son la única fuente de iluminación.

ESCENAS BLENDER
Biggas City | Day: luz diurna y todos los elementos del circuito.
Biggas City | Dusk: versión crepuscular, faroles, neón y focos del monumento.
Las dos escenas comparten la geometría; no son mapas duplicados para importar.
Cambiar la escena en el selector de la barra superior de Blender.
El archivo .blend es autónomo, sin texturas externas.

TRAZADO CONSERVADO
Vuelta de 3.635,94 m, calzada de 22–26 m, 12 posiciones y 32 checkpoints.
Los puntos de ruta, parrilla y checkpoints son idénticos a la versión anterior.
El JSON usa X/Y horizontales y Z hacia arriba; GLB se convierte a Y-up.
Importar Core, City, Forest, Cascade y Landmark en origen común, escala 1.
Collision se importa aparte como colisión, no como geometría visible.

ILUMINACIÓN EN GLB
City.glb y Landmark.glb incluyen luces puntuales y spots mediante KHR_lights_punctual.
El motor/importador debe soportar esa extensión para conservarlas.
El cielo procedural, compositor de glow y exposición de Blender no se
transfieren como un sistema de iluminación equivalente a todos los motores.
Ajustar ambiente, sombras, bloom y potencias después de importar.
La versión de referencia completa de iluminación es el archivo .blend.

LOD Y RENDIMIENTO
Forest_LOD1.glb sustituye a Forest.glb; no cargar ambos a la vez.
Reduce 71,3 % los triángulos de vegetación conservando instancias y materiales.
No incluye conmutación automática por distancia ni benchmark de FPS.
Aplicar instancing, culling y LOD según el motor y la plataforma.

ALCANCE
Entorno estático. No incluye vehículos/controlador, multijugador, reglas de
vueltas, cronómetro, IA ni simulación o animación del agua.
Parrilla/checkpoints son datos y empties para integrar en el motor.
La colisión cubre carretera y barreras; la decoración exterior no tiene
colisión individual de cada pieza.

FUENTES DE REVISIÓN
scripts/cat_statue.py crea la estatua original sin dependencias externas.
scripts/revise_biggas.py aplica la revisión a sources/Baseline_039_v01.blend,
incluido únicamente para reproducir la revisión. Es la base histórica anterior.
El nativo v02 final NO depende de esa base histórica.
scripts/render_biggas.py genera vistas diurnas y crepusculares.
scripts/export_biggas.py exporta el paquete por colecciones y luces reales.

DETALLE DE LUCES
31 faroles con luces puntuales, 7 luces locales de carteles de neón,
1 luz del pórtico y 4 focos spot del monumento. No se usaron luces AREA.
Los materiales emisivos y el glow de presentación complementan esas fuentes.

ORDEN DE LAS FUENTES
revise_biggas.py → refine_lighting.py → tune_twilight.py → render_biggas.py
→ export_biggas.py. Ejecutar cada revisión una sola vez sobre su salida.
Los cambios de altura de soportes en refine_lighting.py no son idempotentes.
El archivo de base histórico está en sources. La carpeta models contiene
los GLB y el resultado autónomo final, según el paquete descargado.
Los neones usan además KHR_materials_emissive_strength. El importador debe
soportar esa extensión para respetar la intensidad emisiva de referencia.
La suavidad de sombras y el radio de las fuentes puntuales de Blender
pueden necesitar ajuste propio en el motor, aunque sus posiciones, colores
e intensidades sí se exportan mediante KHR_lights_punctual.
Las microtexturas procedurales de Blender se aproximan a materiales PBR
al exportar; no se incluyen mapas de textura horneados externos.
El nativo .blend es la referencia visual completa.
