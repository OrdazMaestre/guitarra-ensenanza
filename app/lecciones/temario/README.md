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

## Contenido editable de lecciones

- `app/lecciones/temario/_lesson-pages/ConceptosBasicosPage.tsx`
  Contenido de `/lecciones/temario/conceptos-basicos`.
- `app/lecciones/temario/_lesson-pages/NotacionMusicalPage.tsx`
  Contenido de `/lecciones/temario/notacion-musical`.
- `app/lecciones/temario/_lesson-pages/AfinacionPage.tsx`
  Contenido de `/lecciones/temario/afinacion`.
- `app/lecciones/temario/_lesson-pages/PlaceholderLessonPage.tsx`
  Pantalla temporal para lecciones aun no desarrolladas.

## Datos compartidos

- `app/lecciones/temario/temarioData.ts`
  Orden, titulos y slugs del temario.
- `app/lecciones/temario/TemarioPager.tsx`
  Navegacion anterior/siguiente. Tambien define el espacio vertical comun entre el final de cada leccion y los links del paginador.
