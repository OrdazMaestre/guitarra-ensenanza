# Afinar a oído (sala-de-pruebas) — notas de diseño

Minijuego nuevo, en construcción, visible solo en `sala-de-pruebas` (encima del mástil interactivo
existente). Todavía sin detección de "afinado correctamente" ni puntuación -- eso es la siguiente
iteración. Historial: la 1ª iteración fue el tablero solo visual (matemática en Hz); la 2ª lo
convirtió en instrumento MIDI de verdad (interactivo, con sonido real, clavijas cuantizadas) y
añadió arrastre-cambia-de-nota y entrada por teclado; esta 3ª iteración añadió las REGLAS del
juego: selector de dificultad, desafinado aleatorio, ocultar nombres de nota, cronómetro, y el
botón de diapasón de referencia (EXPERTO).

## Reglas del juego (selector de dificultad)

A petición explícita del usuario, el texto instructivo de la sección se sustituyó por un selector
de 3 botones (Fácil/Difícil/Experto, `DIFFICULTIES`/`DIFFICULTY_LABELS` en `TuningBoard.tsx`).
Elegir una dificultad (o volver a elegir la misma, para "otra ronda") reinicia las 6 cuerdas a
afinación estándar y luego aplica:

| Dificultad | Cuerdas desafinadas | Desafinado (por cuerda) | Nombres de nota | Botón diapasón |
|---|---|---|---|---|
| Fácil    | 1 al azar | 1-3 semitonos | visibles | no |
| Difícil  | 1 al azar | 1-4 semitonos | ocultos (aire y al pulsar un traste) | no |
| Experto  | las 6     | 1-6 semitonos | ocultos | sí ("Diapasón La 440Hz") |

`randomDetuneCents(maxSemitones)` genera un desplazamiento entero en cents (signo al azar) entre
`MIN_DETUNE_SEMITONES` (1 semitono = 100 cents) y `MAX_DETUNE_SEMITONES[dificultad]` (`3`/`4`/`6`
semitonos respectivamente) -- la magnitud SÍ escala con la dificultad, ajustado tras el primer
intento (15-45 cents fijos, sin variar por dificultad) resultar "muy poco" desafinado en la
práctica según el propio usuario. Verificado con 40 rondas por dificultad (240 muestras en
Experto): mínimos y máximos observados dentro de los límites exactos en los tres niveles, sin
ninguna muestra fuera de rango. `hideNoteNames` (Difícil/Experto) es un único
booleano derivado que condiciona DOS sitios de render: la etiqueta siempre-visible junto al
clavijero (traste 0) y el `<text>` del marcador que aparece al pulsar cualquier otro traste -- en
ambos casos solo se oculta el TEXTO, el círculo del marcador se sigue mostrando (confirmación
táctil/visual de qué se está pulsando, sin regalar el nombre de la nota).

**Cronómetro**: "el juego siempre inicia un cronómetro al seleccionar la dificultad" -- un
`setInterval` de 1s que solo corre mientras `difficulty !== null` (arranca en la primera selección,
se detiene si el componente se desmonta). Re-seleccionar cualquier dificultad reinicia
`elapsedSeconds` a 0 pero NO reinicia el intervalo en sí (no hace falta: si la dependencia del
efecto -- `difficulty` -- no cambia de valor porque se re-eligió la misma cadena, el intervalo ya
en marcha sigue tickeando bien sobre el contador recién puesto a 0). Formato `M:SS` sin ceros a la
izquierda en los minutos (`formatElapsed`).

**Parada automática al afinar (`solved`)**: a petición explícita del usuario, el cronómetro para
solo y se pone en verde cuando detecta 1 segundo SEGUIDO con las 6 cuerdas afinadas. "Afinada
correctamente" usa una tolerancia de `IN_TUNE_TOLERANCE_CENTS = 2` cents en vez de exigir 0 exacto
-- igual que cualquier afinador electrónico real, que también da un pequeño margen "en verde" en
vez de un único valor exacto (clavar 0 cents arrastrando con el dedo/ratón sería frustrante de
más). `allInTune` se deriva de `cents` en cada render y es la dependencia de un `useEffect` que
arma un `setTimeout(SOLVED_HOLD_MS)` en cuanto se vuelve `true`; si `cents` cambia otra vez antes
de que cumpla el segundo (`allInTune` vuelve a `false`), la limpieza del efecto CANCELA ese
timeout, así que solo cuenta un segundo seguido dentro del margen, no acumulado a trozos --
verificado corrigiendo una cuerda a medias (nunca se resuelve) y luego clavándola en 0 exacto (se
resuelve a los ~1s, ni antes). Un segundo `useEffect` separado para el propio intervalo del
cronómetro se detiene en cuanto `solved` pasa a `true` (dependencia añadida a su array) -- parada
real, no solo visual, verificado comprobando que el texto no cambia aunque pasen varios segundos
más. Una vez resuelto, `solved` se queda en `true` el resto de la ronda aunque se vuelva a tocar
una clavija después (no se "des-resuelve") hasta la siguiente llamada a `startDifficulty`. Además
del color (`.tuning-timer.is-solved`, verde `#047857`), el icono cambia de ⏱ a ✅.

**Diapasón La 440Hz (solo Experto)**: botón sobre el mástil, mantener pulsado para oír un La2 de
referencia (`STANDARD_TUNING_MIDI[5]`, MIDI 45) -- SIN aplicar el desafinado de ninguna cuerda, es
un tono de referencia fijo, no "la cuerda 5". Usa `playNote(45, true, volumen)` -- el `true`
(`forKeyboard`) elige el motor de oscilador en vez de la muestra de guitarra: suena mientras se
mantiene pulsado y se corta limpio al soltar (como un diapasón real al que se para la mano encima),
cosa que la muestra de guitarra no hace bien porque decae sola sin importar cuánto se mantenga
pulsada. Mismo patrón de pointer-capture que el resto de controles arrastrables del sitio.

## Ficheros

- `app/lib/tuningGame/pitch.ts` — matemática pura (sin React), ahora TODO en MIDI (fraccionario),
  no en Hz: `STANDARD_TUNING_MIDI` (afinación estándar EADGBE, misma convención de numeración de
  cuerda que `OPEN_STRING_MIDI` en `ReducedFretboardDiagram.tsx`, cuerda 1 = Mi agudo),
  `midiToNoteName`, `centsToMidiOffset`, `DEGREES_PER_SEMITONE`/`DEGREES_PER_CENT`/
  `DEGREES_PER_STEP`/`MIN_STEP_CENTS`.
- `app/components/tuningGame/TuningPeg.tsx` — la clavija: arrastre circular sin límite, ahora en
  pasos cuantizados de 1 cent (ver más abajo) en vez de grados continuos.
- `app/components/tuningGame/TuningBoard.tsx` — el tablero, ahora interactivo: pulsar cualquier
  traste (0-5) de cualquier cuerda reproduce esa nota de verdad vía `guitarAudioEngine.playNote()`,
  con el desafinado de esa cuerda ya aplicado.

## "El mástil para afinar debe ser MIDI" — por qué no hizo falta tocar guitarAudioEngine.ts

Todo el pitch se representa como un MIDI continuo (`STANDARD_TUNING_MIDI[cuerda] + traste +
cents/100`), no como Hz. Esto fue posible SIN tocar `guitarAudioEngine.ts` para nada: `playNote`/
`switchNote` ya aceptan un `midi: number` sin restricción de entero, y `startSampleVoice` calcula
la velocidad de reproducción de la muestra como `2 ** ((midi - sample.rootKey -
sample.pitchCorrection / 100) / 12)` -- una fórmula continua que funciona igual de bien con un MIDI
fraccionario (p.ej. `68.25`) que con uno entero. Pasarle ese MIDI fraccionario ya afina la muestra
en cents correctamente, sin pitch-bend ni ningún mecanismo nuevo. Esto simplificó mucho la
implementación y evitó tocar un motor de audio compartido por medio sitio.

## "Deben cambiar las notas dentro de la cuerda según ajustamos las clavijas"

El desafinado de una cuerda (en cents) se aplica UNIFORMEMENTE a los 6 trastes de esa cuerda, no
solo al traste 0 -- exactamente como en una guitarra real, donde destensar una clavija desafina
toda la cuerda, no solo la nota al aire. `effectiveMidi(cuerda, traste, cents)` = `MIDI base +
traste + cents/100`, usada tanto para lo que se OYE (el `playNote()` real al pulsar) como para lo
que se VE: la etiqueta junto al clavijero (siempre visible, traste 0) y el marcador de nota que
aparece al pulsar cualquier otro traste (mismo patrón "círculo + nombre de nota dentro" que el
resto de mástiles del sitio, ver la regla correspondiente en `AGENTS.md`). Verificado con
Playwright: cuerda 1 desafinada +1 semitono (Mi4 -> Fa4), pulsar el traste 3 de esa misma cuerda
suena y muestra Sol#4 (Fa4+3 trastes = Sol#4), no Sol4 -- confirma que el desafinado se propaga a
todo el diapasón.

## Clavijas: unidad mínima funcional = 1 cent

A petición explícita del usuario ("las clavijas deben aumentar/disminuir el tono con una unidad
MÍNIMA FUNCIONAL", con el ejemplo "un octavo de tono cada 45 grados... si consigues que sea aún más
preciso mejor"), las clavijas ya no giran de forma continua -- avanzan en pasos cuantizados.

Se eligió **1 cent** (1/100 de semitono) como unidad: es literalmente la más pequeña con
significado musical real -- la unidad estándar que usa cualquier afinador profesional o DAW, y por
debajo de 1 cent no hay nada perceptible ni práctico que cuantificar (el umbral de percepción
humana de diferencia de tono ronda los 5-6 cents incluso para oídos entrenados). Manteniendo la
norma "1 vuelta completa = 1 tono" (sin cambios respecto a la primera iteración): 360° / 200 cents
(1 tono = 2 semitonos = 200 cents) = **1.8° por cent** = `DEGREES_PER_STEP`. Esto hace que el
ejemplo del propio usuario salga exacto: 45° = 25 cents = un octavo de tono, verificado con
Playwright arrastrando la clavija exactamente 45° y confirmando `aria-valuenow === 25`; un
arrastre adicional de 1.8° exactos confirmó el siguiente cent (`26`), demostrando que la resolución
de 1 cent es realmente alcanzable con el gesto de arrastre, no solo teórica.

**Cómo se cuantiza sin perder precisión ni "atascarse".** `TuningPeg.tsx` acumula en un ref
(`dragRef.current.exactDegrees`) el ángulo EXACTO sin cuantizar de todo el gesto de arrastre --
solo al convertirlo al valor que sale hacia fuera (`onStepChange`) se redondea al paso más cercano
(`Math.round(exactDegrees / DEGREES_PER_STEP)`). Si se cuantizase el propio acumulador en cada
movimiento en vez de mantenerlo exacto, un arrastre lento y preciso podría perder movimientos más
pequeños que un paso entero y la clavija se quedaría "pegada" pese a estar moviendo el dedo/ratón
de verdad -- error clásico de cuantización con acumulador con pérdida.

El paso de teclado (flechas, con la clavija enfocada) es más grueso a propósito: 25 cents (un
octavo de tono) por pulsación, pensado para ajustes rápidos, con `Home` para volver a 0. El
indicador visual de la clavija gira con `(stepValue * DEGREES_PER_STEP) % 360`, así que da una
vuelta completa y sigue girando en vez de acumular un ángulo absurdo -- como una clavija real, no
se puede saber cuántas vueltas lleva dadas solo mirándola.

## Interacción: MAX_VOICES = 3, arrastre cambia de nota, sin hammer-on/pull-off

`TuningBoard.tsx` reutiliza el patrón MÁS SIMPLE ya documentado en `AGENTS.md` para MiniKeyboard
(`ptVoicesRef = useRef(new Map<number, {midi, voiceId}>())` por `pointerId`, cada toque
completamente independiente, tope de voces) en vez del patrón "una voz por cuerda" con hammer-on/
pull-off de `ReducedFretboardDiagram.tsx`. Decisión deliberada: afinar es comprobar notas sueltas
(o como mucho dos cuerdas a la vez para comparar si "laten" entre sí, algo real y útil al afinar de
oído -- de ahí permitir hasta `MAX_VOICES = 3` toques simultáneos), no tocar acordes o riffs, así
que la complejidad de encadenar notas DENTRO de una misma cuerda (el hammer-on/pull-off en sí) no
aporta nada aquí y no se implementó.

**Arrastrar sí cambia de nota**, a diferencia de la primera iteración: `onPointerMove` en el `<svg>`
compara la celda actual contra la que tenía ese `pointerId` y, si cambió, llama a `switchNote()` (no
`playNote()` de nuevo) para la transición -- mismo patrón que `ReducedFretboardDiagram.tsx`. Si el
arrastre sale de los límites del tablero la nota actual se queda sonando tal cual (no se corta)
hasta soltar o volver a entrar, igual que en aquel componente.

**Entrada por teclado**, añadida en una iteración posterior a petición del usuario: reutiliza
`FRETBOARD_KEYMAP`/`FRETBOARD_KEYMAP_UPPER` de `app/lib/fretboardKeymap.ts` -- el mismo mapa que ya
usa `ReducedFretboardDiagram.tsx` -- filtrando las entradas con `fret > END_FRET` (ese mapa llega
hasta el traste 12; este tablero solo hasta el 5). El mapa base cubre las cuerdas 3-6 directamente
y la variante "upper" remapea las mismas teclas físicas a las cuerdas 1-4; entre ambos rangos
(alternados con `ArrowUp`/`ArrowDown` mientras el modo teclado está activo, igual que en
`ReducedFretboardDiagram`) se llega a las 6 cuerdas. Cada tecla mantenida es una voz independiente
(mismo criterio que el puntero, sin hammer-on entre teclas de la misma cuerda) y comparte el aviso
de ghosting (`hasKeyboardGhosting`) con el resto de mástiles del sitio.

`TuningPeg.tsx` también responde a `ArrowUp`/`ArrowRight`/`ArrowDown`/`ArrowLeft`/`Home` cuando una
clavija tiene el foco (ver la sección anterior) -- esas mismas teclas son las que activan el toggle
de rango grave/agudo del modo teclado a nivel de `window`. Para que ambas cosas no se disparen a la
vez cuando una clavija está enfocada, `TuningPeg.onKeyDown` llama a `e.stopPropagation()` en sus
ramas de flecha -- el evento sintético de React propaga `stopPropagation()` al evento nativo
subyacente, así que nunca llega a burbujear hasta el listener de `window` de `TuningBoard.tsx`.
Verificado con Playwright: con una clavija enfocada, `ArrowRight` mueve la clavija (+25 cents) y NO
cambia el rango grave/agudo del modo teclado.

Se omitió `MetronomeControls` (sin relación obvia con comprobar una nota suelta contra una
referencia) -- se puede añadir si el usuario lo pide explícitamente para este instrumento.

## Estilos

Mismo patrón que el resto del sitio: CSS literal (`<style>{...}</style>`) en vez de utilidades de
Tailwind con escala de diseño, que no compilan en este proyecto -- ver el gotcha documentado en
`AlphaTabPlayer.NOTES.md`. `TuningBoardStyles` se renderiza una vez en `sala-de-pruebas/page.tsx`,
junto a `ReducedFretboardStyles` (ya presente en esa página), de la que reutiliza las clases del
mástil (`.reduced-board-bg`/`.reduced-string`/`.reduced-fret`/`.reduced-nut`/`.reduced-guide-dot`/
`.reduced-fret-number`) sin duplicarlas -- `TuningBoardStyles` solo define las clases NUEVAS de
este componente (`.tuning-*`).
