# Mesa de mezclas — notas de diseño

Componente nuevo, sin relación con `AlphaTabPlayer.tsx` ni con `guitarAudioEngine.ts`. Nació
pensado solo para `sala-de-pruebas`, pero ahora se monta UNA SOLA VEZ en `app/layout.tsx` (junto a
`ThemeToggle`/`MaikaelWidget`), así que está disponible en cualquier página del sitio -- nunca
dentro de una página individual, o se duplicaría el `AudioContext`/los `<audio>`. Al vivir en el
layout raíz, una única instancia sobrevive a la navegación entre páginas (`next/link` no
remonta el layout), así que la música sigue sonando y el panel mantiene sus niveles al cambiar de
página. No es una lección ni una rama del temario, así que no requiere tocar
`/lecciones/temario/pasos`.

## Ficheros

- `app/lib/mixingConsole/audioEngine.ts` — clase `MixingConsoleEngine`, sin dependencias de React.
  Posee el `AudioContext`, el grafo de Web Audio y el estado (canción actual, transporte,
  volumen/pan/EQ/mute/solo por canal). Expone `subscribe`/`getState` estilo store externo.
- `app/lib/mixingConsole/useMixingConsole.ts` — hook que envuelve la clase con
  `useSyncExternalStore` para exponerla como estado reactivo de React. El motor se crea una sola
  vez vía el inicializador perezoso de `useState(() => new MixingConsoleEngine())`.
- `app/components/mixingConsole/MixingConsole.tsx` — componente raíz: botón de apertura (esquina
  superior izquierda) + panel (recuadro superior + fila de canales). Ambos se renderizan vía
  `createPortal` en `document.body`, fuera de `.site-shell` -- ver "Modo claro/oscuro y
  posicionamiento" más abajo.
- `app/components/mixingConsole/ChannelStrip.tsx` — recuadro vertical de un instrumento (EQ, pan,
  mute/solo, volumen).
- `app/components/mixingConsole/Knob.tsx` — perilla rotativa de arrastre vertical, reutilizada para
  EQ y pan.

## Grafo de audio por canal

Por cada instrumento de la canción activa (3 para Facil/Dificil, 4 para Mini-torneo/Campeonato):

```
<audio> (MediaElementAudioSourceNode)
  -> BiquadFilterNode (lowshelf, 200Hz)   -- EQ low
  -> BiquadFilterNode (peaking, 1kHz)     -- EQ mid
  -> BiquadFilterNode (highshelf, 5kHz)   -- EQ high
  -> StereoPannerNode                      -- pan
  -> GainNode                               -- volumen de canal (mute/solo se aplican AQUÍ,
                                                multiplicando a 0 en vez de usar una puerta aparte)
  -> GainNode máster (volumen del recuadro superior)
  -> destination
```

Se usa `MediaElementAudioSourceNode` (no `AudioBufferSourceNode`/`decodeAudioData`) porque cada
pista dura ~2:45-3:05 y no tiene sentido decodificar varios MB enteros en memoria antes de poder
sonar; el `<audio>` hace streaming/buffering progresivo igual que una reproducción normal.

Rangos: volumen de canal y máster 0-1 (lineal, sobre `GainNode.gain`), pan -1..1 centrado en 0
(`StereoPannerNode.pan`), EQ `EQ_MIN_DB` (-40, "-∞" en la UI)..`EQ_MAX_DB` (+12) sobre
`BiquadFilterNode.gain`, con taper NO lineal (ver siguiente sección) en vez de un barrido lineal.

## Perilla de EQ: taper no lineal (a petición explícita del usuario)

Las perillas de EQ (High/Mid/Low) no reparten sus dB linealmente a lo largo del giro, como sí hacen
pan y volumen. Los puntos de referencia, en el mismo sistema de ángulo que ya usa `Knob.tsx`
(-135deg = tope izquierdo, 0deg = las 12 en punto, +135deg = tope derecho, barrido total 270deg):

| posición de la perilla        | ratio (0..1) | dB           |
|--------------------------------|--------------|--------------|
| tope izquierdo                 | 0            | `EQ_MIN_DB` (-40, mostrado "-∞") |
| las 9 en punto                 | 1/6          | -12          |
| las 12 en punto (por defecto)  | 1/2          | 0            |
| tope derecho                   | 1            | `EQ_MAX_DB` (+12) |

`eqRatioToDb`/`eqDbToRatio` en `audioEngine.ts` interpolan linealmente entre esos 4 puntos
(interpolación lineal por tramos, no una curva continua). El efecto: la mitad derecha de la perilla
(0 a +12dB) conserva la misma resolución que antes tenía todo el rango completo hacia ese lado; la
mitad izquierda comprime -12dB hasta el suelo práctico en el último sexto del recorrido, dejando
mucho más margen de giro para el tramo -12..0dB que con un barrido lineal simple. Así se puede
"mutear" una banda de frecuencias llevando la perilla al tope izquierdo, o duplicar su presencia
(+12dB ≈ el doble de amplitud) llevándola al tope derecho, con precisión fina en medio.

`EQ_MIN_DB = -40` y no `-Infinity` real porque `BiquadFilterNode.gain` tiene un rango nominal de
±40dB en la especificación de Web Audio; -40dB ya es inaudible para un filtro
lowshelf/peaking/highshelf, así que a efectos prácticos equivale a mutear esa banda sin arriesgarse
a que el navegador recorte un valor fuera de rango de forma sorprendente.

`Knob.tsx` acepta `valueToRatio`/`ratioToValue` opcionales para este caso (si se omiten, cae al
mapeo lineal de siempre a partir de `min`/`max`, sin cambios para pan/volumen). El arrastre y el
paso de teclado (flechas) se calculan en espacio de RATIO, no de valor, para que un mismo gesto
físico gire la perilla el mismo ángulo sin importar el tramo del taper en el que esté.

`AudioContext` se crea de forma perezosa dentro de `ensureContext()`, llamada solo desde gestos
reales del usuario (`play()`, o `init()` si se quisiera "calentar" el contexto antes) — misma idea
que `touchAudioContext()` en `guitarAudioEngine.ts`, sin compartir código.

## Solo/mute

Solo es exclusivo por canción, mismo patrón de interacción que las pistas del multipista de
`AlphaTabPlayer.tsx` (sin compartir código): si un instrumento entra en solo, la ganancia efectiva
de todos los demás canales de esa canción se fuerza a 0, sin tocar su propio flag de `muted`. Al
quitar el solo, cada canal vuelve a su volumen normal salvo que además esté muteado. `toggleMute`
solo afecta a su propio canal.

## Colapsar el panel (o navegar a otra página) no detiene el audio

El motor (`useMixingConsole()`) se instancia en `MixingConsole.tsx`, el mismo componente que
`app/layout.tsx` monta una única vez para todo el sitio. `open` (useState local) solo decide si el
JSX del panel se renderiza (`{open && <div className="mixing-console-panel">...}`); el hook que
posee el `AudioContext` y los elementos `<audio>` se llama siempre, fuera de ese condicional, así
que nunca se desmonta al colapsar — solo desaparece la interfaz. Como `MixingConsole` vive en el
layout raíz (no dentro de una página), tampoco se desmonta al navegar entre páginas con
`next/link` (Next.js reutiliza el layout raíz entre rutas) — la música sigue sonando y el panel
conserva sus niveles al cambiar de `/lecciones/...` a otra. El `AudioContext` solo se cerraría
(`engine.dispose()`) si `MixingConsole` en sí se desmontase, lo que en la práctica no ocurre
mientras el sitio esté abierto (solo al cerrar/recargar la pestaña).

## Cambiar de canción: reinicio de niveles (decisión de diseño)

Al cambiar de canción (flechas o lista desplegable) los niveles de CADA canal (volumen, pan, EQ,
mute, solo) se **reinician a los valores por defecto**, no se recuerdan por canción. Es la opción
más simple para una v1 y evita tener que decidir qué hacer cuando el número de instrumentos cambia
entre canciones (3 vs 4) o cuando un instrumento con el mismo id de un canal pero un timbre muy
distinto (p.ej. "guitars" en Facil/Dificil vs "lead"/"rhythm" en Mini-torneo/Campeonato) hereda una
EQ pensada para otra mezcla. `engine.selectSong()` en sí deja `playing: false` (los `<audio>`
antiguos se destruyen y los nuevos empiezan desde el principio, no desde "el mismo punto" de la
canción anterior -- eso sería más "natural" pero mucho más complejo, con arranque no sincronizado
entre pistas de duraciones distintas y saltos bruscos de audio).

## Play automático (a petición explícita del usuario)

A pesar de que `engine.selectSong()` deja la reproducción parada, `MixingConsole.tsx` llama a
`engine.play()` inmediatamente después, tanto al elegir canción (flechas ◀▶ o la lista desplegable)
como -- mediante `hasAutoPlayedOnOpenRef` -- la primera vez que se despliega el panel (no en
aperturas posteriores). Ambas llamadas ocurren de forma síncrona dentro del `onClick` real que las
origina, requisito de las políticas de autoplay del navegador (un `play()` disparado fuera de un
gesto de usuario, p.ej. en un `setTimeout` o una promesa resuelta más tarde, puede ser bloqueado).
Separar esto en la capa de React (en vez de que `engine.selectSong()` reproduzca por sí solo) deja
al motor libre de asumir que siempre se le llama desde un gesto de click.

Si en el futuro se quiere recordar los niveles por canción, el punto de extensión es
`MixingConsoleEngine`: en vez de un único `Record<string, ChannelState>` para "la canción actual",
mantener `Record<SongId, Record<string, ChannelState>>` y no reinicializar en `selectSong`.

## Sincronización entre pistas (limitación conocida + mitigación simple)

Cada instrumento es un elemento `<audio>` independiente. `play()`/`pause()` llaman a `.play()`/
`.pause()` sobre todos los elementos de la canción actual en el mismo tick de JavaScript, así que
arrancan prácticamente a la vez, pero no hay garantía de un arranque sample-accurate entre
elementos `<audio>` HTML, y en reproducciones largas pueden derivar por streaming/buffering
independiente de cada uno.

Mitigación implementada: mientras se reproduce, cada 2 segundos (`startDriftCheck` en
`audioEngine.ts`) se compara el `currentTime` de cada pista contra la primera pista de la canción
(la "referencia") y, si la diferencia supera 150ms, se realinea esa pista (`audio.currentTime =
reference`). No es un algoritmo de resincronización sample-accurate ni compensa
gradualmente (salta el valor de golpe), pero es suficiente para que una sesión de mezcla de varios
minutos no se perciba desfasada. El estado `desynced` del motor queda disponible para la UI si se
quisiera mostrar un aviso (no se usa visualmente en la v1, se corrige en silencio).

## Modo claro/oscuro y posicionamiento: botón/panel se portan fuera de .site-shell (histórico + solución final)

Este sitio NO restylea cada componente para el modo oscuro: aplica un único filtro CSS a TODO
`.site-shell` (el wrapper que envuelve casi toda la web, ver `app/layout.tsx`/`globals.css`):

```css
html[data-theme='dark'] .site-shell {
  filter: invert(1) hue-rotate(180deg);
}
```

**Primer intento (descartado): dejar el botón/panel dentro de `.site-shell`.** Parecía lo obvio --
cualquier componente dentro de `.site-shell` hereda el modo oscuro gratis con ese filtro, sin
declarar colores oscuros propios (así es como funciona el resto de páginas/diagramas del sitio).
Pero `filter` en un ancestro tiene un efecto secundario de la spec de CSS: convierte a ese ancestro
en el "containing block" de cualquier descendiente `position: fixed`. Esto rompió DOS cosas:

1. **Color invertido dos veces.** Si además se le daba al botón/panel una paleta oscura propia bajo
   `html[data-theme='dark']`, el filtro la invertía una SEGUNDA vez y el resultado visual quedaba
   casi blanco -- `getComputedStyle(...).backgroundColor` decía "oscuro" (coherente en CSSOM) pero
   el PÍXEL pintado en pantalla era claro. Diagnosticado comparando ese computed style contra el
   color de píxel real muestreado con `sharp` sobre una captura de Playwright (inconsistentes entre
   sí) y confirmando con `document.elementsFromPoint()`/inspección de estilos por cada ancestro que
   `.site-shell` tenía el filtro aplicado.
2. **Posición y scroll rotos.** En modo oscuro, `position: fixed` dejaba de ser relativo al
   viewport y pasaba a serlo respecto a la caja de `.site-shell` -- que ni arranca en `(0, 0)` (el
   margin de `<body>` más el `margin-top` de `.site-home-link` colapsando hacia arriba lo
   desplazan, una cantidad que además cambia con el breakpoint móvil) ni se queda quieta (es un
   bloque normal que se desplaza con el scroll de la página). Un primer arreglo midió ese offset en
   tiempo real (`useEffect` + `getBoundingClientRect()` + `MutationObserver` para `data-theme` +
   listener de `scroll` con `requestAnimationFrame`) y funcionaba, pero con un retraso perceptible
   de un frame detrás del scroll real, porque dependía de JS reaccionando al evento en vez del
   navegador moviendo el elemento de forma nativa.

**Solución final: `createPortal(..., document.body)`.** El botón y el panel se renderizan enteros
FUERA del árbol de `.site-shell` -- directamente como hijos de `document.body` -- exactamente como
ya hace `.theme-toggle-button` en `globals.css` (que vive en `app/layout.tsx` como hermano directo
de `<body>`, nunca dentro de `.site-shell`). Esto elimina el problema de raíz: al no estar dentro
del subárbol filtrado, `position: fixed` vuelve a ser relativo al viewport de verdad, sin ningún JS
de por medio y sin ningún retraso, tanto en la posición inicial como siguiendo el scroll. El precio:
ya no se benefician del `invert()` automático, así que SÍ necesitan su propia paleta oscura
explícita bajo `html[data-theme='dark']` (mismo patrón que `.theme-toggle-button`) -- las variables
`--mc-*` declaradas en `:root` (modo claro) tienen ahora su contrapartida en
`html[data-theme='dark'] { --mc-*: ... }` (modo oscuro), dentro del `<style>` de
`MixingConsole.tsx`.

`createPortal` necesita un `document.body` real, que no existe durante el render de servidor -- se
usa el patrón estándar de React (`useState`/`useEffect` con un flag `mounted`, mismo patrón ya usado
en `QuizRunner.tsx`) para retrasar el portal un tick hasta que el componente esté montado en el
cliente. El hook `useMixingConsole()` (que posee el `AudioContext`) se sigue llamando siempre en el
primer render, sin condicionar -- solo el JSX portado espera a `mounted`, nunca el motor de audio.

## Estilos

Todo color y todo tamaño/espaciado de este componente usa CSS literal (`<style>{...}</style>` con
clases propias, o `style={{}}` inline para valores dinámicos) en vez de utilidades de Tailwind con
escala de diseño (`bg-*`, `text-{color}`, `h-*`/`w-*`/`p-*`/`gap-*` numéricos), que no compilan en
este proyecto — ver "gotcha" en `AlphaTabPlayer.NOTES.md`. Un `<style>` literal con clases propias
(como ya hacen `globals.css` y varias páginas del sitio, p.ej. `.test-room-page` en
`sala-de-pruebas/page.tsx`) no pasa por el compilador de utilidades de Tailwind, así que no le
afecta el bug — es CSS normal.

El botón de apertura (`.mixing-console-toggle-button`) copia exactamente el patrón geométrico de
`.theme-toggle-button` (`app/globals.css`) pero en la esquina superior izquierda, con su propio
icono (🎚️, mismo patrón de icono-emoji que `ThemeToggle.tsx`).
