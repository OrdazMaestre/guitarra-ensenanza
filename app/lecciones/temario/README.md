# Mapa de paginas del temario

En Next.js los archivos que crean rutas deben llamarse `page.tsx`. Por eso no conviene renombrarlos. Para que sea facil encontrar el contenido real, las lecciones del temario viven en archivos con nombre reconocible dentro de `_lesson-pages`.

## Rutas principales

- `/lecciones/temario`: `app/lecciones/temario/page.tsx`
  Portada visual del temario.
- `/lecciones/temario/pasos`: `app/lecciones/temario/pasos/page.tsx`
  Arbol/listado de contenidos.
- `/lecciones/temario/[slug]`: `app/lecciones/temario/[slug]/page.tsx`
  Enrutador dinamico. Mantenerlo pequeno: solo decide que leccion cargar.
- `/lecciones/temario/el-sonido-en-la-musica`: `app/lecciones/temario/el-sonido-en-la-musica/page.tsx`
  Pagina de ampliacion sobre sonido.
- `/lecciones/temario/mas-punteos-cortos`: `app/lecciones/temario/mas-punteos-cortos/page.tsx`
  Pagina de ampliacion para ejercicios breves de punteo.

## Contenido editable de lecciones

- `app/lecciones/temario/_lesson-pages/ConceptosBasicosPage.tsx`
  Contenido de `/lecciones/temario/conceptos-basicos`.
- `app/lecciones/temario/_lesson-pages/NotacionMusicalPage.tsx`
  Contenido de `/lecciones/temario/notacion-musical`.
- `app/lecciones/temario/_lesson-pages/AfinacionPage.tsx`
  Contenido de `/lecciones/temario/afinacion`.
- `app/lecciones/temario/_lesson-pages/TablaturasPage.tsx`
  Contenido de `/lecciones/temario/tablaturas`.
- `app/lecciones/temario/_lesson-pages/TablaturasDosCuerdasPage.tsx`
  Contenido de `/lecciones/temario/tablaturas-dos-cuerdas`.
- `app/lecciones/temario/_lesson-pages/AcordesPage.tsx`
  Contenido de `/lecciones/temario/acordes`.
- `app/lecciones/temario/_lesson-pages/LetItBeConAcordesPage.tsx`
  Contenido de `/lecciones/temario/let-it-be-con-acordes`.
- `app/lecciones/temario/_lesson-pages/ArpegiosPage.tsx`
  Contenido de `/lecciones/temario/arpegios`.
- `app/lecciones/temario/_lesson-pages/PlaceholderLessonPage.tsx`
  Pantalla temporal para lecciones aun no desarrolladas.

## Datos compartidos

- `app/lecciones/temario/temarioData.ts`
  Orden, titulos y slugs del temario.
- `app/lecciones/temario/TemarioPager.tsx`
  Navegacion anterior/siguiente. Tambien define el espacio vertical comun entre el final de cada leccion y los links del paginador.

## Colores en mapas de mastil

- Verde: tonica menor cuando la leccion compara relativo menor o centro menor.
- Azul: tonica mayor cuando la leccion compara relativo mayor o centro mayor.
- Rojo: solo para una nota concreta que la leccion marque como especial, por ejemplo la blue note o la septima de un acorde.

No usar rojo para notas normales de una escala completa. Si una nota roja aparece en un diagrama, el texto de la leccion debe explicar por que esa nota concreta esta marcada.

## Regla de mantenimiento del arbol

Cada vez que se anada una pagina nueva al temario, una ampliacion, una practica extra o una ruta que salga como rama desde una leccion, tambien hay que actualizar `/lecciones/temario/pasos`.

- Si cambia el camino principal, editar `app/lecciones/temario/temarioData.ts`.
- Si aparece una rama lateral, editar `branchMap` en `app/lecciones/temario/pasos/page.tsx`.
- El arbol de `pasos` debe representar siempre las rutas reales que el alumno puede tomar dentro de la web.
