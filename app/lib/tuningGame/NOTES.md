# Afinar a oído (sala-de-pruebas) — notas de diseño

Minijuego nuevo, visible solo en `sala-de-pruebas` (encima del mástil interactivo existente).
Historial: la 1ª iteración fue el tablero solo visual (matemática en Hz); la 2ª lo convirtió en
instrumento MIDI de verdad (interactivo, con sonido real, clavijas cuantizadas) y añadió
arrastre-cambia-de-nota y entrada por teclado; la 3ª añadió las REGLAS del juego: selector de
dificultad, desafinado aleatorio, ocultar nombres de nota, cronómetro, y el botón de diapasón de
referencia (EXPERTO); esta 4ª iteración ajustó el margen de "afinado" a GRADOS progresivos por
dificultad y añadió un 4º nivel, **Profesional**, con una secuencia de preparación animada.

## Reglas del juego (selector de dificultad)

A petición explícita del usuario, el texto instructivo de la sección se sustituyó por un selector
de 4 botones (Fácil/Difícil/Experto/Profesional, `DIFFICULTIES`/`DIFFICULTY_LABELS` en
`TuningBoard.tsx`). Bajo el selector se muestra una lista con una línea de objetivo por modo -- el
texto vive en `DIFFICULTY_DESCRIPTIONS` (`Record<Difficulty, string>`), justo debajo de
`DIFFICULTY_LABELS` en `TuningBoard.tsx` (hay un comentario "EDITAR AQUÍ" en esa misma constante);
para cambiar la redacción de cualquier modo basta con editar esa cadena, no hace falta tocar el
JSX. Elegir Fácil/Difícil/Experto (o volver a elegir el mismo, para "otra ronda") reinicia las 6
cuerdas a afinación estándar y luego aplica:

| Dificultad | Cuerdas desafinadas | Desafinado (por cuerda) | Nombres de nota | Botón diapasón |
|---|---|---|---|---|
| Fácil       | 1 al azar | 1-3 semitonos | visibles | no |
| Difícil     | 1 al azar | 1-4 semitonos | ocultos (aire y al pulsar un traste) | no |
| Experto     | las 6     | 1-6 semitonos | ocultos | sí ("Diapasón La 440Hz") |
| Profesional | las 6     | secuencia animada, ver más abajo | ocultos (a media secuencia) | sí |

Profesional NO usa `startDifficulty`/`randomDetuneCents` -- tiene su propio arranque asíncrono,
`startProfessionalRound` (ver "Modo Profesional" más abajo).

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
correctamente" usa un margen EN GRADOS de la propia clavija (no en cents) -- igual que cualquier
afinador electrónico real, que también da un pequeño margen "en verde" en vez de un único valor
exacto (clavar el giro perfecto arrastrando con el dedo/ratón sería frustrante de más) -- y
PROGRESIVO con la dificultad, ajustado dos veces a petición explícita del usuario: primero de un
margen fijo de 2 cents (~3.6°, igual de exigente en los tres niveles) a `{facil: 20, dificil: 10,
experto: 5}`, y más tarde, tras confirmar la sensibilidad real del arrastre (1 cent cada 1.8°, más
fino que octavos de tono) y añadir Profesional, a los valores actuales:
`IN_TUNE_TOLERANCE_DEGREES = { facil: 30, dificil: 20, experto: 10, profesional: 30 }`. Profesional
vuelve a un margen amplio (igual que Fácil) a propósito, palabras del propio usuario: su
preparación (clavijas en posición aleatoria + desafinado en cadena, ver más abajo) ya es bastante
más dura que Experto por sí sola, así que exigir además precisión de Experto haría el modo
injusto/imposible. La comprobación reconstruye el ángulo exacto de cada clavija multiplicando
`cents[cuerda] * DEGREES_PER_STEP` (1.8°/cent, la misma constante de `pitch.ts` con la que
`TuningPeg.tsx` convirtió el arrastre original a cents, así que la vuelta es exacta, sin redondeo
extra) y lo compara contra el margen del modo activo -- el giro puramente visual de Profesional
(`baselineAngles`, ver más abajo) NUNCA entra en esta cuenta, "afinado" siempre se mide sobre el
tono real. Verificado arrastrando cada clavija a un valor exacto en cents justo dentro y justo
fuera de cada margen en los cuatro niveles -- en Experto/Profesional, además, llevando las 6
cuerdas a la vez al mismo valor, porque ahí las 6 deben cumplir el margen a la vez, no solo una.
`allInTune` se deriva de `cents` en cada render (y es `false` mientras `introRunning` -- ver más
abajo -- para que Profesional no se dé por resuelto durante su propia preparación) y es la
dependencia de un `useEffect` que arma un `setTimeout(SOLVED_HOLD_MS)` en cuanto se vuelve `true`;
si `cents` cambia otra vez antes de que cumpla el segundo (`allInTune` vuelve a `false`), la
limpieza del efecto CANCELA ese timeout, así que solo cuenta un segundo seguido dentro del margen,
no acumulado a trozos -- verificado corrigiendo una cuerda a medias (nunca se resuelve) y luego
clavándola en 0 exacto (se resuelve a los ~1s, ni antes). Un segundo `useEffect` separado para el
propio intervalo del cronómetro se detiene en cuanto `solved` pasa a `true` (dependencia añadida a
su array) -- parada real, no solo visual, verificado comprobando que el texto no cambia aunque
pasen varios segundos más. Una vez resuelto, `solved` se queda en `true` el resto de la ronda
aunque se vuelva a tocar una clavija después (no se "des-resuelve") hasta la siguiente ronda.
Además del color (`.tuning-timer.is-solved`, verde `#047857`), el icono cambia de ⏱ a ✅.

**Diapasón La 440Hz (Experto y Profesional)**: botón sobre el mástil, mantener pulsado para oír un La2 de
referencia (`STANDARD_TUNING_MIDI[5]`, MIDI 45) -- SIN aplicar el desafinado de ninguna cuerda, es
un tono de referencia fijo, no "la cuerda 5". A petición explícita del usuario usa
`playNote(45, false, volumen)` -- el `false` (`forKeyboard`) elige la MISMA muestra de guitarra que
suena al pulsar la cuerda 5 al aire (no el oscilador del teclado, como en un primer intento), y
repite la pulsación cada `DIAPASON_PLUCK_INTERVAL_MS` (2000ms) mientras se mantiene pulsado, en vez
de sonar como un tono sostenido -- verificado instrumentando `AudioContext.prototype
.createBufferSource` (la muestra de guitarra, no `createOscillator`) con `page.addInitScript`:
exactamente 3 pulsaciones en ~4.5s mantenido, con huecos de 1992ms/2000ms entre ellas, y ninguna
pulsación más tras soltar. Cada pulsación suelta (`releaseNote`) la anterior antes de lanzar la
siguiente -- como un pellizco real amortigua el anterior al volver a tocar la cuerda -- y al
soltar el botón también se suelta la última con el mismo patrón de pointer-capture que el resto de
controles arrastrables del sitio.

## Modo Profesional: secuencia de preparación animada

A petición explícita del usuario, incluye una animación de 4 fases antes de empezar la ronda (y
antes de que arranque el cronómetro), pensada para simular un clavijero real: "cada clavija
descansa en un ángulo arbitrario según cuántas vueltas lleve dadas en su historia, sin que eso
signifique nada sobre si la cuerda está afinada o no". Orquestada por `startProfessionalRound`
(función async, `TuningBoard.tsx`):

1. **Reposo** (`PHASE1_SHOW_MS` = 1000ms): mástil en afinación estándar, nombres de nota visibles,
   tal cual empiezan Fácil/Difícil/Experto -- una pausa para que se vea el estado "normal" antes de
   que nada se mueva.
2. **Giro de clavijero, SIN desafinar** (`PHASE2_BASELINE_SPIN_MS` = 900ms): cada clavija gira a una
   orientación visual aleatoria (`randomBaselineDeg()`, una por cuerda) mientras el tono real se
   queda exactamente en 0 cents -- verificado con Playwright leyendo `aria-valuenow` de las 6
   clavijas durante esta fase en 8 rondas seguidas (48 lecturas): siempre `'0'`. Esto se consigue
   con una prop nueva en `TuningPeg.tsx`, `baselineDeg`, que se SUMA al ángulo visual
   (`(stepValue * DEGREES_PER_STEP + baselineDeg) % 360`) pero nunca se lee en ningún sitio que
   calcule tono (`effectiveMidi`, `allInTune`) -- desacoplo total entre "dónde apunta la clavija" y
   "qué nota suena", igual que en una guitarra real. La rotación se anima con una transición CSS
   (`.tuning-peg.is-animating .tuning-peg-indicator { transition: transform 400ms ease-in-out }`)
   en vez de saltar de golpe.
3. **Ocultar nombres** (`PHASE3_HIDE_NAMES_MS` = 500ms): a diferencia de Difícil/Experto (que
   ocultan los nombres desde el principio), Profesional los oculta a MEDIA secuencia --
   `profesionalNamesHidden` (inicia en `false`, este paso lo pone a `true`) es la pieza que
   `hideNoteNames` sustituye por la del resto de modos cuando `difficulty === 'profesional'`.
4. **Desafinado en cadena** (`PROFESIONAL_SUBROTATIONS` = 3 tandas de `PHASE4_SUBROTATION_STEP_MS` =
   500ms cada una): esta vez SÍ cambia el tono. Cada tanda suma a cada cuerda un giro aleatorio de
   entre `PROFESIONAL_MIN_TURN` (0.1) y `PROFESIONAL_MAX_TURN` (1.2) vueltas
   (`CENTS_PER_TURN` = 200, la misma norma "1 vuelta = 1 tono" del resto del juego), en sentido
   aleatorio, y las 6 cuerdas giran A LA VEZ en cada tanda (no una detrás de otra) para que se vea
   caótico en vez de una revelación lenta y ordenada. Cents finales observados tras 3 tandas en una
   ronda real: `[-140, 71, 7, -82, 58, -26]` -- magnitudes plausibles para 3 giros de 20-240 cents
   cada uno con signo al azar.

**Bug real encontrado y corregido: re-pulsar "Profesional" durante su propia intro la reiniciaba
en bucle infinito.** Reportado por el propio usuario ("no funciona el modo Profesional, ni
siquiera empieza su animación") tras verificar que la secuencia SÍ completaba correctamente en
pruebas automatizadas aisladas -- la pista real estuvo en que la Fase 1 (1000ms) no cambia NADA
visualmente (mástil en reposo), así que a un usuario real que pulsa "Profesional" y no ve pasar
nada en ese primer segundo le resulta natural volver a pulsar el mismo botón, pensando que el
primer clic no funcionó. Como el botón de dificultad seguía activo/clicable durante toda la
secuencia, y `startProfessionalRound` reinicia su propio `roundTokenRef` en cada llamada
(el mecanismo de cancelación descrito más abajo), cada re-clic cancelaba la ronda en curso y la
reiniciaba desde la Fase 1 -- si el usuario repite esto cada vez que no ve movimiento (patrón
natural: clic, ~0.5s sin cambios, clic de nuevo), la secuencia NUNCA llega a completarse, atrapada
en un bucle de reinicios. Reproducido con Playwright: 5 clics seguidos sobre "Profesional"
espaciados ~400-500ms (justo el patrón de un usuario impaciente dentro de la ventana de silencio
de la Fase 1) dejan las 6 cuerdas en `cents = [0,0,0,0,0,0]` indefinidamente, exactamente como
reportó el usuario. Arreglado deshabilitando los 4 botones de dificultad (`disabled={introRunning}`
más una comprobación equivalente al principio del `onClick`, por si acaso) mientras dura la
secuencia automática -- coherente con que el resto del tablero (clavijas, mástil) ya estaba
bloqueado durante ese mismo tramo. Además de arreglar el bucle, el estado `:disabled` (opacidad
reducida, cursor `not-allowed`) da una señal visual inmediata de "algo está pasando, espera" que
mitiga la falta de feedback de la Fase 1. Reverificado con Playwright: el mismo patrón de 5 clics
ahora deja pasar automáticamente ~4s entre cada clic real (Playwright espera a que el botón vuelva
a ser clicable antes de intentar el siguiente), y la secuencia completa una única vez con el
cronómetro arrancando correctamente al final.

Solo entonces `introRunning` pasa a `false`, momento en el que el `useEffect` del cronómetro (que
ya comprobaba `introRunning` como dependencia adicional) arranca el conteo por primera vez --
verificado con Playwright: el texto del cronómetro marca `0:00` justo al terminar la secuencia y
`0:01` 1.5s después, nunca antes. Mientras `introRunning` es `true`: las clavijas no responden a
gestos ni a teclado (`TuningPeg` recibe `animating={introRunning}`, con guardas al principio de
`onPointerDown`/`onKeyDown` y `tabIndex={-1}`) y el propio mástil tampoco reproduce notas al pulsar
un traste (`introRunning` comprobado al principio de `onPointerDown` del `<svg>`, y su equivalente
por teclado vía un `introRunningRef` -- necesario porque el `useEffect` del modo teclado tiene
`[kbMode, kbRange]` como dependencias y leer `introRunning` directamente ahí cerraría sobre un
valor obsoleto, mismo motivo que ya justifica `volumeRef`/`centsRef` junto a sus estados) --
verificado arrastrando una clavija durante la fase 1 y comprobando que su `aria-valuenow` no
cambia.

**"Que la solución no caiga en 90 grados"**: `randomBaselineDeg()` sortea un ángulo entre 0° y 360°
pero repite el sorteo si cae dentro de `BASELINE_EXCLUDE_DEGREES` (15°) de 90° o de 270° --
decisión de diseño no especificada al detalle por el usuario (solo pidió "que la solución no caiga
en 90 grados"), interpretada como una franja de exclusión alrededor de las dos orientaciones donde
la clavija queda "de lado" (90° y 270° son equivalentes en ese sentido, vista de perfil) porque una
clavija justo de lado es ambigua de leer de un vistazo. Verificado con Playwright: 48 muestras de
`randomBaselineDeg()` a través de 8 rondas, 0 caen dentro de 90°±15° o 270°±15°.

**Bug real encontrado y corregido: cancelación de la ronda en curso.** La primera versión solo
comprobaba `mountedRef.current` (para no seguir llamando a `setState` tras desmontar el
componente) tras cada `await sleep(...)`, pero NADA impedía que la secuencia async siguiera
corriendo si el usuario elegía OTRA dificultad (o volvía a pulsar Profesional) mientras
`startProfessionalRound` seguía en marcha -- confirmado con Playwright: pulsar Profesional y, a los
150ms, pulsar Fácil, dejaba el tablero en apariencia correcto al instante, pero ~3.5s después las 6
cuerdas aparecían desafinadas otra vez (la fase 4 de la ronda Profesional vieja, todavía viva,
seguía escribiendo sobre el `cents` de la ronda Fácil nueva). Arreglado con un token de cancelación
(`roundTokenRef`, incrementado al arrancar cualquier ronda -- `startDifficulty` o
`startProfessionalRound`): `startProfessionalRound` captura su propio token al empezar
(`const myToken = ++roundTokenRef.current`) y comprueba `roundTokenRef.current === myToken` junto
a `mountedRef.current` tras cada `await sleep(...)`, abortando en silencio si alguna otra ronda
empezó mientras tanto. Reverificado el mismo escenario tras el arreglo: las cuerdas de Fácil se
mantienen estables (`[0, -219, 0, 0, 0, 0]`) 3.5s después del cambio.

## Ficheros

- `app/lib/tuningGame/pitch.ts` — matemática pura (sin React), ahora TODO en MIDI (fraccionario),
  no en Hz: `STANDARD_TUNING_MIDI` (afinación estándar EADGBE, misma convención de numeración de
  cuerda que `OPEN_STRING_MIDI` en `ReducedFretboardDiagram.tsx`, cuerda 1 = Mi agudo),
  `midiToNoteName`, `centsToMidiOffset`, `DEGREES_PER_SEMITONE`/`DEGREES_PER_CENT`/
  `DEGREES_PER_STEP`/`MIN_STEP_CENTS`.
- `app/components/tuningGame/TuningPeg.tsx` — la clavija: arrastre circular sin límite, en pasos
  cuantizados de 1 cent (ver más abajo) en vez de grados continuos. Props `baselineDeg`/`animating`
  (solo las usa Profesional, ver esa sección) desacoplan el ángulo visual del tono real y
  deshabilitan la clavija durante la secuencia automática.
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

## Etiqueta de la cuerda al aire: letra a opacidad completa, número de octava al 50%

A petición explícita del usuario (tras una captura mostrando "E4"/"B3"/etc. junto a cada clavija),
la etiqueta SIEMPRE visible de la cuerda al aire (`.tuning-open-note`, NO el marcador que aparece
al pulsar un traste ni los números de traste del diapasón) separa la letra de la nota del número
de octava: la letra se queda a opacidad completa (blanco en modo oscuro / negro en modo claro, sin
cambios -- ya funcionaba así gracias al mismo `filter: invert(1)` que usa todo el modo oscuro del
sitio) y el número de octava se atenúa al 50%. `splitNoteName(name)` (regex `^([A-G]#?)(-?\d+)$`)
separa p.ej. "C#4" en `{letter: 'C#', octave: '4'}`; el render envuelve el número en un `<tspan
className="tuning-open-note-octave">` SIN `fill` propio (hereda el de `<text>`) y la clase solo
pone `opacity: 0.5` -- truco deliberado para no necesitar un gris explícito: 50% de negro ya es
gris, y 50% de blanco (tras el invert de modo oscuro) también lo parece, así que un único `opacity`
basta en los dos modos. Se dejaron sin tocar, a petición también explícita: los números de traste
(`.reduced-fret-number`, ajenos a este componente) y la etiqueta del marcador de nota al pulsar un
traste (`.tuning-note-marker-label`), que sigue la convención ámbar de `AGENTS.md` compartida con
el resto de mástiles del sitio. Verificado con Playwright en `sala-de-pruebas` y en la instancia
embebida en `AfinacionPage.tsx`: opacidad computada 1 en la letra, 0.5 en el `<tspan>` del número,
y 1 sin cambios en los números de traste, en ambas páginas.

## Diestro/zurdo

A petición explícita del usuario de implementarlo en TODOS los mástiles MIDI del sitio (lo había
pedido primero solo para `ReducedFretboardDiagram.tsx` en sala-de-pruebas), este tablero también
tiene su propio botón `DIESTRO`/`ZURDO` (`<HandednessToggleButton>`, compartido con el resto del
sitio -- ver `app/components/guitar/HandednessToggleButton.tsx`), colocado como primer hijo dentro
de `<MidiInstrumentChrome>` (este tablero no tiene botón de paleta, así que no hay "a la izquierda
de qué" -- simplemente el primero). Mismo mecanismo que en todos los demás mástiles: un único
`drawX(x) = lefty ? 2*centerX - x : x` (con `centerX = BOARD_X + BOARD_WIDTH/2`) que invierte TODAS
las coordenadas X dibujadas (clavijas, nut/trastes, marcador de nota, nombre de traste) sin tocar
nunca el eje Y (las cuerdas no cambian de orden), y el mismo mapa de teclado invertido
(`FRETBOARD_KEYMAP_LEFTY`/`FRETBOARD_KEYMAP_UPPER_LEFTY` de `fretboardKeymap.ts`, filtrado por
`entry.fret > END_FRET` igual que el mapa normal). La etiqueta `.tuning-open-note` (texto
`text-anchor: end` por defecto, para crecer HACIA la clavija) es el único elemento que además
necesita invertir su alineación -- `style={{ textAnchor: lefty ? 'start' : 'end' }}` -- porque en
zurdo la clavija queda al otro lado y el texto debe seguir creciendo hacia ella en vez de salirse
del `viewBox`; todo el resto de texto de este tablero (nombres de traste, marcador) ya es
`text-anchor: middle`, simétrico, y no necesita este ajuste. Verificado con Playwright en
`sala-de-pruebas` (incluida la entrada por teclado: `ShiftRight` en zurdo+KB suena como "E2", cuerda
6 al aire, igual que en el resto de mástiles) y en la instancia embebida en `AfinacionPage.tsx`.

## Estilos

Mismo patrón que el resto del sitio: CSS literal (`<style>{...}</style>`) en vez de utilidades de
Tailwind con escala de diseño, que no compilan en este proyecto -- ver el gotcha documentado en
`AlphaTabPlayer.NOTES.md`. `TuningBoardStyles` se renderiza una vez en `sala-de-pruebas/page.tsx`,
junto a `ReducedFretboardStyles` (ya presente en esa página), de la que reutiliza las clases del
mástil (`.reduced-board-bg`/`.reduced-string`/`.reduced-fret`/`.reduced-nut`/`.reduced-guide-dot`/
`.reduced-fret-number`) sin duplicarlas -- `TuningBoardStyles` solo define las clases NUEVAS de
este componente (`.tuning-*`).
