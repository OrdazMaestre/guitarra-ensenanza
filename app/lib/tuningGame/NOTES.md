# Afinar a oído (sala-de-pruebas) — notas de diseño

Minijuego nuevo, en construcción, visible solo en `sala-de-pruebas` (encima del mástil interactivo
existente). Todavía sin objetivo/puntuación -- eso es la siguiente iteración, cuando se decida el
resto de la mecánica del juego. Esta segunda iteración convirtió el tablero de la primera (solo
visual, matemática en Hz) en un instrumento MIDI de verdad: interactivo, con sonido real, y con
clavijas cuantizadas a una unidad mínima funcional -- las tres peticiones explícitas del usuario.

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
