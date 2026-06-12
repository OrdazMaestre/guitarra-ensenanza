# AlphaTabPlayer — notas de ajuste fino

Documento vivo. Aquí guardamos el **por qué** de las decisiones de `AlphaTabPlayer.tsx` (2500+ líneas) que no son obvias leyendo el código a secas. Lo mantiene principalmente el agente `alphatab-guardian`, pero cualquiera puede añadir entradas.

Formato de cada entrada: qué es, por qué está así, qué se rompe si se toca sin cuidado.

## Arquitectura general

- `enablePlayer: false` en la config de AlphaTab (línea ~1222): **no usamos el reproductor de sonido nativo de AlphaTab**. Todo el audio (cuerdas pulsadas, metrónomo) es un motor propio basado en Web Audio API + samples, ver "Motor de audio" abajo. AlphaTab solo se usa para parsear/renderizar la partitura y para `boundsLookup` (posiciones en pantalla de cada compás/nota).
- Dos layouts: `page` (vertical, normal) y `horizontal` (una sola línea con scroll horizontal propio). Cada uno tiene su propia lógica de seguimiento de cursor y scroll — ver "Sistema de scroll-follow".
- Estado global a nivel de módulo (`selectedKeyboardPlayerId`, `currentPlayingPlayerId`, `stopCurrentPlayingPlayer`): coordina que solo suene un reproductor a la vez aunque haya varios `<AlphaTabPlayer>` en la misma página, y a cuál de ellos responde la barra espaciadora.

## Dependencias de assets (no tocar rutas sin actualizar el otro lado)

- `core.fontDirectory: '/alphatab-fonts/'` → sirve `public/alphatab-fonts/Bravura.*` (fuente SMuFL para los símbolos de notación). Si AlphaTab no encuentra estos ficheros, la notación se ve con cuadros vacíos.
- `GUITAR_SAMPLE_BASE_URL = '/samples/seagull-acoustic/'` → `public/samples/seagull-acoustic/manifest.json` + `.wav`. El manifest define `keyRange`, `rootKey`, `loopStart/End`, `pitchCorrection` por muestra; `chooseGuitarSample` elige la muestra más cercana al MIDI pedido y `playPluckedNote` ajusta `playbackRate` para afinar el resto.

## Motor de audio (Web Audio API)

- `MAX_GUITAR_VOICES = 12`: polifonía máxima; `enforceGuitarSamplePolyphony` corta la voz más antigua si se supera.
- `GUITAR_SAMPLE_CUTOFFS` (por índice de cuerda, agudo→grave) + `GUITAR_STRING_GAINS` (por nº de cuerda real 1-6): compensan que las muestras no suenan igual de "brillantes"/fuertes en cada cuerda. `GUITAR_STRING_GAINS` solo se aplica cuando hay acorde denso (`DENSE_CHORD_NOTE_COUNT = 3` o más notas a la vez).
- `STRUM_OFFSETS`: micro-retrasos (segundos) por cuerda para simular un rasgueo en vez de que todas las notas de un acorde suenen exactamente a la vez. Solo se aplica con acordes densos.
- `GUITAR_SAMPLE_RELEASE` / `GUITAR_SAMPLE_PALM_MUTE_RELEASE`: cola de la envolvente normal vs. con palm mute (mucho más corta).
- `MIN_AUDIBLE_NOTE_LEVEL = 0.028`: suelo de volumen para que una nota nunca quede inaudible aunque el cálculo de compensación dé un valor muy bajo.
- Metrónomo (`playMetronomeClick`, `scheduleMetronomeClicks`): sintetizado con ruido filtrado (no es una muestra), con tres subdivisiones (`eighth`/`quarter`/`sixteenth` vía `METRONOME_SUBDIVISION_QUARTERS`).

## Colores de notación y fondo (`.alphatab-surface`)

- El wrapper en `AlphaTabPlayer.tsx:2379` (`<div className="alphatab-surface relative overflow-hidden bg-white">`) envuelve la barra de scroll propia, los resaltados de loop, el cursor, `.alphatab-container` y las etiquetas de cuerdas — todo "sobre blanco" visualmente. `.tab-container` (`#09090b`, `app/globals.css`) **no se usa en ningún sitio del código** (solo aparecía en un comentario erróneo, ya corregido); no forma parte de la jerarquía real del player.
- Por eso `display.resources` (config de `AlphaTabApi`, ~línea 1226-1238) usa los **colores por defecto de AlphaTab** (glifos/negro sobre blanco). **No añadir colores claros aquí**: un intento previo (2026-06-12) puso `mainGlyphColor`/`scoreInfoColor` en zinc-100 pensando que el fondo era `#09090b`, lo que dejó la notación casi invisible (gris claro sobre blanco) en el estado normal del sitio. Se revirtió el mismo día.
- El bug original de "etiquetas de notas invisibles" (modo oscuro Android force-dark) era de `ReducedFretboardDiagram` y similares, no de AlphaTab — no tocar `display.resources` para arreglar eso.

### Modo oscuro (toggle) y el "fondo blanco" que en realidad no existe (2026-06-12)

- **`bg-white` de Tailwind NO se compila en este proyecto.** Verificado con CDP: `.alphatab-surface` tenía `background-color: rgba(0, 0, 0, 0)` (transparente) pese a la clase `bg-white` en el JSX, y el CSS compilado (`app_globals_*.css`) no contiene ninguna regla `.bg-white`. Lo mismo aplica a `.alphatab-container` y al `<svg class="at-surface-svg">` que pinta AlphaTab: todos transparentes, sin `rect` de fondo propio.
- El "fondo blanco" que se ve en modo claro **es `.site-shell { background: #ffffff }` (app/globals.css) transparentándose a través de varias capas** — no es un fondo propio del bloque AlphaTab.
- **Por qué el contra-invertido fallaba en modo oscuro**: `html[data-theme='dark'] .site-shell { filter: invert(1) hue-rotate(180deg) }` invierte TODO el árbol (incluido el blanco de fondo → negro). El contra-invertido en `.alphatab-surface` (mismo filtro, aplicado de nuevo sobre ese subárbol) round-trippea correctamente los píxeles OPACOS de la notación (vuelven a negro-sobre-???), pero el fondo transparente sigue siendo transparente después de cualquier `invert()` — no hay nada que "deshacer". Resultado real observado: notación visible pero en colores invertidos (texto claro sobre fondo negro), exactamente como una sola inversión sin contra-invertido — el contra-invertido no tenía ningún píxel opaco de fondo sobre el que actuar.
- **Arreglo aplicado** (`app/globals.css`, regla nueva justo antes del bloque de modo oscuro): `.alphatab-surface { background-color: #ffffff; }` — un fondo blanco OPACO real, explícito, independiente de Tailwind. Con esto:
  - Modo claro: sin cambio visual (ya se veía blanco por transparencia; ahora es blanco opaco propio — idéntico).
  - Modo oscuro: el contra-invertido (`invert(1) hue-rotate(180deg)`) ahora tiene un fondo blanco opaco para invertir → `#ffffff` invertido = negro, y combinado con la doble inversión del `.site-shell` el resultado neto es **blanco otra vez**, con la notación negra encima sin cambios. Verificado con capturas de pantalla vía CDP: ambos estados del toggle son pixel-idénticos al modo claro original (negro sobre blanco, líneas grises `#A5A5A5`, números de compás rojos).
- **Modelo mental correcto**: el contra-invertido de `.alphatab-surface` (`app/globals.css`, regla `html[data-theme='dark'] .site-shell .alphatab-surface`) SOLO funciona si `.alphatab-surface` tiene un fondo opaco propio que invertir. No depende de que el contenido interno (SVG de AlphaTab, scrollbar, cursor, etc.) tenga fondos propios — esos elementos ya son opacos en sus píxeles de "tinta" (líneas, glifos, colores de UI) y sí round-trippean correctamente; solo el fondo necesitaba ser opaco.
- Si en el futuro se cambia el fondo del wrapper `.alphatab-surface` (deja de ser blanco) o se añade un modo "hoja oscura" real para AlphaTab, esta regla de fondo opaco, el bloque de `resources` y el contra-invertido de `app/globals.css` tendrán que revisarse juntos.

## Cursor y geometría

- `TAB_LINE_SPACING = 12.45`: separación vertical (px) entre líneas de tablatura, usada para colocar las etiquetas de cuerdas (`STRING_LABELS_TOP_TO_BOTTOM`, solo en modo no-compacto). **Hipótesis**: este valor está pixel-ajustado al tamaño de fuente/zoom actual de AlphaTab; si cambia `display.padding`, `rhythmHeight` o el tamaño de fuente global, probablemente haya que re-ajustar esto. *(pendiente confirmar con el usuario)*
- `CURSOR_LINE_WIDTH = 3`: grosor del cursor verde de reproducción.
- `getCursorXFromBeatBounds`: prioriza el centro de las cabezas de nota (`noteHeadBounds`) sobre `onNotesX`/`visualBounds`/`realBounds` — esto hace que el cursor quede centrado en acordes con notas desalineadas horizontalmente.

## Selección de loop

- `LOOP_VISUAL_X_OFFSET = -31`: desplaza hacia la izquierda el resaltado/handles del loop respecto a la posición real del compás. **Hipótesis**: compensa el padding/posición del cursor para que el resaltado "abrace" visualmente la nota en vez de empezar justo en su borde.
- `LOOP_HANDLE_OUTSIDE_OFFSET = 30`: separa los tiradores `[`/`]` del loop hacia fuera del resaltado para que no tapen las notas.
- Doble-tap (ventana 380ms, distancia <34px) sobre un compás selecciona el loop de ese compás entero (`selectBarLoopFromPointer` + `getBarRangeForEventIndex`).

## Sistema de scroll-follow

- `PLAYBACK_SCROLL_RESUME_DELAY = 1600` ms: tras un scroll programático, ventana durante la cual no se considera "scroll manual del usuario".
- Layout `page`: `keepCursorVisibleOnPage` usa márgenes de confort (`topComfort`/`bottomComfort`, % de `window.innerHeight`) y `keepCursorVisibleHorizontally` con `PAGE_LAYOUT_HORIZONTAL_SCROLL_MARGIN_RATIO = 0.22`.
- Layout `horizontal`: `followLinearCursorHorizontally` mantiene el cursor a `LINEAR_PLAYBACK_CURSOR_RATIO = 0.34` del ancho visible (no centrado, ligeramente a la izquierda) — coincide con la regla de AGENTS.md de usar la scrollbar propia del player (`horizontalBarWidth`/`horizontalBarFit`), no un wrapper externo.
- `playbackScrollUserOverrideRef`: si el usuario interactúa (rueda, touch, teclas de flecha/scroll, drag), se desactiva el auto-follow hasta la siguiente vez que se pulse play.

## Anchuras de compás en layout horizontal

- `applyAnnotatedHorizontalBarWidths` + `getAnnotatedBarWidth` (`ANNOTATED_BAR_BASE_WIDTH = 72`, `ANNOTATED_BAR_TEXT_WIDTH = 7.5`, `ANNOTATED_BAR_BEAT_WIDTH = 28`, `ANNOTATED_BAR_NOTE_WIDTH = 6`): cuando un compás tiene texto/sección/letra, se le da más ancho proporcional a la longitud del texto y nº de notas, para que no se amontone.
- `horizontalBarFit`: alternativa para que el primer compás tenga un ancho fijo (`firstBarWidth`) y el resto se reparta el espacio sobrante del contenedor (`minRestBarWidth`/`maxRestBarWidth`).

## Preguntas abiertas / a confirmar con el usuario

- ¿Por qué `TAB_LINE_SPACING = 12.45` exactamente? ¿Se recalculó a mano contra algún `display.padding` o tamaño de fuente concreto?
- ¿`LOOP_VISUAL_X_OFFSET = -31` y `LOOP_HANDLE_OUTSIDE_OFFSET = 30` se ajustaron mirando algún caso concreto (acordes vs notas sueltas, page vs horizontal)?
- ¿`LINEAR_PLAYBACK_CURSOR_RATIO = 0.34` tiene un motivo pedagógico (dejar ver "lo que viene") o es puramente estético?
- ¿Hay algún dispositivo/navegador concreto que motivó `TAB_DRAG_THRESHOLD = 8` o la ventana de doble-tap de 380ms?

## Historial

- **2026-06-10**: primera revisión conjunta del proyecto. Se eliminaron `app/components/ui/`, `app/lib/constants/`, `app/lib/tabs/` (carpetas placeholder vacías, sin imports) y `chrome-figuras-*-temp/`, `chrome-pdf-temp*/` (carpetas vacías, restos de sesiones de debugging visual con Chrome — probablemente de comparar anchuras/posiciones de "figuras" y de extraer imágenes del PDF de referencia). Verificado: `npm run lint` y `npm run build` sin errores tras el borrado. Se crea este documento y el agente `alphatab-guardian`.
