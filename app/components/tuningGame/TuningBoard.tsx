'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { playNote, preloadSamples, releaseNote, switchNote } from '@/app/lib/guitarAudioEngine';
import { FRETBOARD_KEYMAP, FRETBOARD_KEYMAP_UPPER, hasKeyboardGhosting, type FretKeyEntry } from '@/app/lib/fretboardKeymap';
import MidiInstrumentChrome from '../guitar/MidiInstrumentChrome';
import TuningPeg from './TuningPeg';
import {
  DEGREES_PER_STEP,
  STANDARD_TUNING_MIDI,
  centsToMidiOffset,
  midiToNoteName,
  type StringNumber,
} from '@/app/lib/tuningGame/pitch';

// Cuerda 1 = Mi agudo (arriba), cuerda 6 = Mi grave (abajo) -- misma convención y mismo orden
// visual que ReducedFretboardDiagram.tsx, para que las dos mástiles de la página se lean igual.
const STRINGS: StringNumber[] = [1, 2, 3, 4, 5, 6];

const END_FRET = 5;
const PEG_X = 26;
const BOARD_X = 90;
const FRET_WIDTH = 56;
const BOARD_HEIGHT = 158;
const STRING_GAP = BOARD_HEIGHT / 5;
const BOARD_Y = 28;
const BOARD_WIDTH = END_FRET * FRET_WIDTH;
const FRET_NUMBER_Y = BOARD_Y + BOARD_HEIGHT + 28;
const VIEWBOX_WIDTH = BOARD_X + BOARD_WIDTH + 20;
const VIEWBOX_HEIGHT = FRET_NUMBER_Y + 16;
// Hueco a la izquierda del nut que cuenta como pulsación del traste 0 (misma idea que el margen de
// 40 en ReducedFretboardDiagram.tsx), recortado a 36 para no solaparse con el hit-area de la
// clavija (radio 15+8=23, centrada en PEG_X=26 -> llega hasta x=49; BOARD_X-36=54, sin solape).
const OPEN_HIT_MARGIN = 36;
// Mismo tope y mismo patrón que ptVoicesRef en MiniKeyboard.tsx (un Map por pointerId, cada dedo/
// clic totalmente independiente) -- a propósito NO se usa el patrón "una voz por cuerda" con
// hammer-on/pull-off de ReducedFretboardDiagram.tsx: afinar es comprobar notas sueltas (o como
// mucho dos cuerdas a la vez para comparar), no tocar acordes/riffs, así que esa complejidad no
// aporta aquí. Se comparte entre el tope de toques simultáneos y el de teclas simultáneas -- ver
// NOTES.md.
const MAX_VOICES = 3;

type Difficulty = 'facil' | 'dificil' | 'experto' | 'profesional';
const DIFFICULTIES: Difficulty[] = ['facil', 'dificil', 'experto', 'profesional'];
const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  facil: 'Fácil',
  dificil: 'Difícil',
  experto: 'Experto',
  profesional: 'Profesional',
};
// Descripción breve del objetivo de cada modo -- EDITAR AQUÍ para cambiar el texto. Se muestra
// bajo el selector de dificultad, una línea por modo (ver DIFFICULTIES.map más abajo en el JSX).
const DIFFICULTY_DESCRIPTIONS: Record<Difficulty, string> = {
  facil: 'Una cuerda se desajustó. Afinala girando su clavija.',
  dificil: 'Ahora no ves el nombre pero sabemos que la mayoría de cuerdas son como la anterior + 5 semitonos.',
  experto: 'Ahora afina todo usando la referencia del DIAPASÓN: "LA" es cuerda 5.',
  profesional:
    'Así te encontrarás una guitarra de verdad. Usa el diapasón, tu oído y tu cerebro.',
};

// Rango del desafinado aleatorio al empezar una ronda -- en SEMITONOS (100 cents cada uno, la
// rejilla de 1 cent que usan las clavijas sigue siendo la unidad interna, ver DEGREES_PER_STEP en
// pitch.ts), siempre entre 1 semitono y el máximo de cada dificultad, con signo al azar. Escala
// con la dificultad a petición explícita del usuario -- el primer intento (15-45 cents fijos,
// sin variar por dificultad) resultaba "muy poco" desafinado en la práctica. Profesional no usa
// esto -- tiene su propio mecanismo de desafinado, ver PROFESIONAL_* más abajo.
const MIN_DETUNE_SEMITONES = 1;
const MAX_DETUNE_SEMITONES: Record<'facil' | 'dificil' | 'experto', number> = { facil: 3, dificil: 4, experto: 6 };

function randomDetuneCents(maxSemitones: number): number {
  const minCents = MIN_DETUNE_SEMITONES * 100;
  const maxCents = maxSemitones * 100;
  const magnitude = minCents + Math.floor(Math.random() * (maxCents - minCents + 1));
  return Math.random() < 0.5 ? -magnitude : magnitude;
}

// Margen para considerar una cuerda "afinada correctamente" -- en GRADOS de la propia clavija
// (no en cents), a petición explícita del usuario, y progresivo con la dificultad: más permisivo
// en Fácil, más exigente en Experto. Profesional vuelve a un margen amplio (igual que Fácil) a
// propósito -- su preparación (clavijas en posición aleatoria + desafinado caótico en cadena) ya
// es bastante más dura que Experto por sí sola, así que exigir además precisión de Experto haría
// el modo injusto/imposible (razón dada explícitamente por el usuario). Ver el comentario junto a
// `allInTune` en el componente para cómo se compara. También es el tiempo que debe mantenerse el
// margen seguido antes de parar el cronómetro (SOLVED_HOLD_MS).
const IN_TUNE_TOLERANCE_DEGREES: Record<Difficulty, number> = { facil: 30, dificil: 20, experto: 10, profesional: 30 };
const SOLVED_HOLD_MS = 1000;

// Diapasón (Experto y Profesional): una pulsación cada 2s mientras se mantiene pulsado -- a
// petición explícita del usuario.
const DIAPASON_PLUCK_INTERVAL_MS = 2000;

function pickRandomString(): StringNumber {
  return STRINGS[Math.floor(Math.random() * STRINGS.length)];
}

// --- Modo Profesional: secuencia automática -- ver "Animación de Profesional" en NOTES.md. -------
//
// 1) Se ve el mástil normal, con nombres.
// 2) Cada clavija GIRA a una orientación visual aleatoria, pero el tono real NO cambia (sigue
//    afinado de fábrica) -- simula un clavijero real, donde cada clavija descansa en un ángulo
//    arbitrario según cuántas vueltas lleve dadas en su historia, sin que eso signifique nada
//    sobre si la cuerda está afinada o no.
// 3) Desaparecen los nombres de las notas.
// 4) Cada cuerda gira "de verdad" (esta vez SÍ cambia el tono) en PROFESIONAL_SUBROTATIONS tandas
//    simultáneas para las 6 cuerdas a la vez, cada tanda un giro aleatorio de entre
//    PROFESIONAL_MIN_TURN y PROFESIONAL_MAX_TURN vueltas, en sentido aleatorio.
// Solo entonces arranca el cronómetro.
const CENTS_PER_TURN = 200; // 1 vuelta completa = 1 tono = 200 cents, ver pitch.ts
const PROFESIONAL_SUBROTATIONS = 3;
const PROFESIONAL_MIN_TURN = 0.1;
const PROFESIONAL_MAX_TURN = 1.2;
// "Que la solución no caiga en 90 grados" -- a petición explícita del usuario: la orientación
// visual aleatoria del paso 2 (el ángulo al que hay que volver para estar afinado) nunca se elige
// dentro de este margen alrededor de 90°/270° (clavija "de lado"), para que ninguna cuerda tenga
// que acabar apuntando justo a esa posición, ambigua de leer de un vistazo.
const BASELINE_EXCLUDE_DEGREES = 15;
// Duración de cada fase de la animación (ms) -- elección propia, sin pedir nada exacto el usuario;
// fácil de retocar aquí si se quiere más rápido/lento.
const PHASE1_SHOW_MS = 1000;
const PHASE2_BASELINE_SPIN_MS = 900;
const PHASE3_HIDE_NAMES_MS = 500;
const PHASE4_SUBROTATION_STEP_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function randomBaselineDeg(): number {
  let deg: number;
  do {
    deg = Math.floor(Math.random() * 360);
  } while (Math.abs(deg - 90) < BASELINE_EXCLUDE_DEGREES || Math.abs(deg - 270) < BASELINE_EXCLUDE_DEGREES);
  return deg;
}

function randomSubrotationCents(): number {
  const turns = PROFESIONAL_MIN_TURN + Math.random() * (PROFESIONAL_MAX_TURN - PROFESIONAL_MIN_TURN);
  const magnitude = Math.round(turns * CENTS_PER_TURN);
  return Math.random() < 0.5 ? -magnitude : magnitude;
}

function zeroedRecord(): Record<StringNumber, number> {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
}

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function stringY(rowIndex: number): number {
  return BOARD_Y + rowIndex * STRING_GAP;
}

function fretMarkerX(fret: number): number {
  return fret === 0 ? BOARD_X : BOARD_X + (fret - 0.5) * FRET_WIDTH;
}

function getSvgCoords(e: PointerEvent<SVGSVGElement>, svg: SVGSVGElement): { x: number; y: number } | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const r = pt.matrixTransform(ctm.inverse());
  return { x: r.x, y: r.y };
}

// Tablero de afinación a oído: trastes 0-5 con una clavija a la izquierda de cada cuerda. Girar
// una clavija sube/baja el tono de ESA cuerda entera (una vuelta completa = tono entero, media
// vuelta = 1 semitono, en pasos de 1 cent -- ver pitch.ts) y el nombre de la nota se actualiza en
// tiempo real, tanto la de la cuerda al aire (etiqueta siempre visible junto al clavijero) como la
// de cualquier traste que se pulse (aparece un marcador igual que en el resto de mástiles del
// sitio). Es un instrumento MIDI de verdad -- pulsar cualquier traste reproduce la nota real vía
// guitarAudioEngine.playNote(), con el MIDI FRACCIONARIO que resulta de aplicar el desafinado de
// esa cuerda (en cents) a la nota de ese traste, así que lo que se oye coincide exactamente con lo
// que dice la etiqueta. Ver app/lib/tuningGame/NOTES.md para el porqué de cada decisión.
export default function TuningBoard() {
  const [cents, setCents] = useState<Record<StringNumber, number>>(zeroedRecord());
  const [volume, setVolume] = useState(1.0);
  const [pointerPositions, setPointerPositions] = useState<{ string: StringNumber; fret: number }[]>([]);
  const [kbMode, setKbMode] = useState(false);
  const [kbRange, setKbRange] = useState<'lower' | 'upper'>('lower');
  const [kbGhostWarn, setKbGhostWarn] = useState(false);
  const [kbPositions, setKbPositions] = useState<{ string: StringNumber; fret: number }[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [diapasonSounding, setDiapasonSounding] = useState(false);
  const [solved, setSolved] = useState(false);
  // Solo usados por Profesional -- ver "Animación de Profesional" en NOTES.md. baselineAngles es
  // puramente visual (se SUMA al ángulo que ya da cents, nunca toca el tono); introRunning
  // deshabilita las clavijas y bloquea el cronómetro/la detección de "afinado" mientras dura la
  // secuencia automática; profesionalNamesHidden es la versión de hideNoteNames propia de este
  // modo (empieza visible, se oculta a media secuencia, a diferencia de Difícil/Experto que
  // siempre ocultan desde el principio).
  const [baselineAngles, setBaselineAngles] = useState<Record<StringNumber, number>>(zeroedRecord());
  const [introRunning, setIntroRunning] = useState(false);
  const [profesionalNamesHidden, setProfesionalNamesHidden] = useState(false);

  // FÁCIL: una cuerda al azar desafinada, nombres de nota siempre visibles.
  // DIFÍCIL: igual, pero sin nombres de nota (ni al aire ni al pulsar un traste).
  // EXPERTO: TODAS las cuerdas desafinadas, sin nombres de nota, y aparece el botón de referencia.
  // PROFESIONAL: clavijas en posición aleatoria + desafinado en cadena (ver startProfessionalRound
  // más abajo); los nombres empiezan visibles y se ocultan a media secuencia automática
  // (profesionalNamesHidden), no desde el principio como Difícil/Experto.
  const hideNoteNames = difficulty === 'dificil' || difficulty === 'experto' || (difficulty === 'profesional' && profesionalNamesHidden);
  const showDiapason = difficulty === 'experto' || difficulty === 'profesional';
  // "Afinadas correctamente" con un margen en GRADOS de clavija en vez de exigir 0 exacto -- igual
  // que cualquier afinador electrónico real, que también da un margen "en verde" en vez de un
  // único valor exacto (llegar a 0 grados clavado arrastrando con el dedo/ratón sería frustrante
  // de más), y progresivo con la dificultad (ver IN_TUNE_TOLERANCE_DEGREES). `cents[s] *
  // DEGREES_PER_STEP` reconstruye el ángulo exacto de esa clavija (sin redondeo: cents ya es
  // entero, DEGREES_PER_STEP es la MISMA constante -1.8- con la que TuningPeg.tsx convirtió el
  // ángulo original a cents, así que la vuelta es exacta) -- baselineAngles (el giro puramente
  // visual de Profesional) NUNCA entra aquí a propósito, "afinado" siempre se mide sobre el tono
  // real, no sobre dónde apunta la clavija. Solo puede ser true habiendo ya elegido dificultad Y
  // fuera de la secuencia automática de Profesional (si no, las cuerdas siguen en 0 cents durante
  // las fases 1-3 de esa secuencia -- antes de que la fase 4 las desafine de verdad -- y
  // "estaría resuelto" antes incluso de que empiece el reto).
  const allInTune =
    difficulty !== null &&
    !introRunning &&
    STRINGS.every(s => Math.abs(cents[s] * DEGREES_PER_STEP) <= IN_TUNE_TOLERANCE_DEGREES[difficulty]);

  const svgRef = useRef<SVGSVGElement>(null);
  const ptVoicesRef = useRef(new Map<number, { string: StringNumber; fret: number; voiceId: number }>());
  const kbKeysHeldRef = useRef(new Map<string, FretKeyEntry & { voiceId: number }>());
  const diapasonVoiceRef = useRef(-1);
  const diapasonIntervalRef = useRef<number | null>(null);
  const volumeRef = useRef(volume);
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);
  const centsRef = useRef(cents);
  useEffect(() => {
    centsRef.current = cents;
  }, [cents]);
  // El handler de teclado (más abajo) vive en un useEffect con deps [kbMode, kbRange] -- leer
  // `introRunning` directamente ahí cerraría sobre un valor obsoleto en cuanto empezara/terminara
  // la secuencia automática de Profesional sin que kbMode/kbRange cambiaran (mismo motivo que
  // volumeRef/centsRef ya existen al lado de sus estados).
  const introRunningRef = useRef(introRunning);
  useEffect(() => {
    introRunningRef.current = introRunning;
  }, [introRunning]);

  useEffect(() => {
    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(() => preloadSamples());
      return () => cancelIdleCallback(id);
    }
    const id = window.setTimeout(() => preloadSamples(), 300);
    return () => window.clearTimeout(id);
  }, []);

  // Solo lo lee startProfessionalRound -- su secuencia de fases hace varios `await sleep(...)`, y
  // si el componente se desmonta a media secuencia (el usuario navega fuera de sala-de-pruebas)
  // hay que dejar de llamar a los setState de las fases siguientes en vez de seguir como si nada.
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  // Token de cancelación para la secuencia async de Profesional: sin esto, elegir OTRA dificultad
  // (o volver a pulsar Profesional) MIENTRAS startProfessionalRound sigue corriendo no la detiene --
  // solo detiene sus setState futuros si el componente se desmonta, pero la ronda sigue viva y
  // acaba pisando el `cents` de la ronda nueva con su fase 4 (confirmado con Playwright: cambiar a
  // Fácil a media Profesional dejaba las 6 cuerdas desafinadas por la ronda vieja segundos después).
  // startDifficulty/startProfessionalRound incrementan este contador al arrancar; cada `await
  // sleep(...)` de la secuencia comprueba que su propio token capturado sigue siendo el vigente.
  const roundTokenRef = useRef(0);

  useEffect(
    () => () => {
      ptVoicesRef.current.forEach(({ voiceId }) => {
        if (voiceId >= 0) releaseNote(voiceId);
      });
      ptVoicesRef.current.clear();
      kbKeysHeldRef.current.forEach(({ voiceId }) => {
        if (voiceId >= 0) releaseNote(voiceId);
      });
      kbKeysHeldRef.current.clear();
      if (diapasonVoiceRef.current >= 0) releaseNote(diapasonVoiceRef.current);
      if (diapasonIntervalRef.current !== null) window.clearInterval(diapasonIntervalRef.current);
    },
    [],
  );

  // El cronómetro arranca al elegir una dificultad (incluida la primera vez, null -> una
  // dificultad real) y sigue corriendo aunque se re-seleccione la misma -- startDifficulty ya
  // pone elapsedSeconds a 0 en ese caso, así que no hace falta reiniciar el intervalo en sí. Para
  // en seco en cuanto `solved` se pone a true (ver el efecto de abajo) -- ese es el "parar
  // automáticamente" pedido por el usuario. En Profesional, además, NO arranca mientras
  // `introRunning` sea true -- "tras todo esto comienza el cronómetro", pedido explícitamente por
  // el usuario para que la secuencia automática de preparación no cuente como tiempo de juego.
  useEffect(() => {
    if (!difficulty || solved || introRunning) return;
    const id = window.setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [difficulty, solved, introRunning]);

  // "Para automáticamente y cambia a verde cuando lleva 1s con todas las cuerdas afinadas" -- el
  // propio `allInTune` (derivado de `cents` en cada render) es la dependencia del efecto: cada vez
  // que CAMBIA de valor (no solo cuando `cents` cambia sin afectarlo) se dispara este efecto de
  // nuevo. Si se vuelve true, arranca un setTimeout de SOLVED_HOLD_MS; si `cents` cambia otra vez
  // antes de que cumpla el segundo (allInTune vuelve a false), el efecto se limpia y CANCELA ese
  // timeout -- así solo cuenta un segundo SEGUIDO en el margen de tolerancia, no acumulado a
  // trozos. Una vez `solved` es true se queda así el resto de la ronda (no se "des-resuelve" si
  // luego se vuelve a tocar una clavija) hasta la siguiente llamada a startDifficulty.
  useEffect(() => {
    if (!allInTune || solved) return;
    const id = window.setTimeout(() => setSolved(true), SOLVED_HOLD_MS);
    return () => window.clearTimeout(id);
  }, [allInTune, solved]);

  // Empezar/reiniciar una ronda (Fácil/Difícil/Experto): vuelve las 6 cuerdas a afinación estándar
  // y desafina según la dificultad -- FÁCIL/DIFÍCIL una cuerda al azar, EXPERTO las 6 -- antes de
  // aplicar el nuevo estado. Re-seleccionar la MISMA dificultad genera un desafinado nuevo cada vez
  // (útil como "otra ronda"), no repite el anterior. También limpia cualquier resto de una ronda
  // de Profesional anterior (baseline visual, secuencia automática, nombres ocultos a medias) --
  // sin esto, cambiar de Profesional a Fácil dejaría las clavijas con un giro visual heredado que
  // ya no significa nada.
  function startDifficulty(next: 'facil' | 'dificil' | 'experto') {
    roundTokenRef.current += 1; // invalida cualquier startProfessionalRound todavía en curso
    setDifficulty(next);
    setElapsedSeconds(0);
    setSolved(false);
    setIntroRunning(false);
    setProfesionalNamesHidden(false);
    setBaselineAngles(zeroedRecord());
    const maxSemitones = MAX_DETUNE_SEMITONES[next];
    const fresh = zeroedRecord();
    if (next === 'experto') {
      for (const s of STRINGS) fresh[s] = randomDetuneCents(maxSemitones);
    } else {
      fresh[pickRandomString()] = randomDetuneCents(maxSemitones);
    }
    setCents(fresh);
  }

  // Empezar/reiniciar una ronda de Profesional: la secuencia de 4 fases descrita junto a las
  // constantes PROFESIONAL_*/PHASE*_MS más arriba. `introRunning` se pone a false al terminar la
  // fase 4, momento en el que el efecto del cronómetro (más arriba) por fin arranca el conteo.
  async function startProfessionalRound() {
    const myToken = ++roundTokenRef.current; // invalida cualquier ronda anterior (incl. otra Profesional en curso)
    setDifficulty('profesional');
    setElapsedSeconds(0);
    setSolved(false);
    setIntroRunning(true);
    setProfesionalNamesHidden(false);
    setCents(zeroedRecord());
    setBaselineAngles(zeroedRecord());

    // Fase 1: mástil base con nombres, en reposo -- una pausa para que se vea el estado "normal".
    await sleep(PHASE1_SHOW_MS);
    if (!mountedRef.current || roundTokenRef.current !== myToken) return;

    // Fase 2: cada clavija gira a una orientación visual aleatoria SIN tocar el tono (cents sigue
    // en 0 para las 6) -- simula un clavijero real con clavijas en distinta posición aunque esté
    // afinado. La transición CSS de .is-animating (TuningPeg.tsx) anima el giro suavemente.
    const newBaselines = zeroedRecord();
    for (const s of STRINGS) newBaselines[s] = randomBaselineDeg();
    setBaselineAngles(newBaselines);
    await sleep(PHASE2_BASELINE_SPIN_MS);
    if (!mountedRef.current || roundTokenRef.current !== myToken) return;

    // Fase 3: desaparecen los nombres de las notas.
    setProfesionalNamesHidden(true);
    await sleep(PHASE3_HIDE_NAMES_MS);
    if (!mountedRef.current || roundTokenRef.current !== myToken) return;

    // Fase 4: cada cuerda gira PROFESIONAL_SUBROTATIONS veces, cada giro un valor aleatorio entre
    // PROFESIONAL_MIN_TURN y PROFESIONAL_MAX_TURN vueltas, en sentido aleatorio -- y esta vez SÍ
    // desafina de verdad. Las 6 cuerdas giran a la vez, en tandas simultáneas (no una cuerda detrás
    // de otra), para que se vea más caótico/realista en vez de una revelación lenta y ordenada.
    let running = zeroedRecord();
    for (let round = 0; round < PROFESIONAL_SUBROTATIONS; round++) {
      const next = { ...running };
      for (const s of STRINGS) next[s] = running[s] + randomSubrotationCents();
      running = next;
      setCents({ ...running });
      await sleep(PHASE4_SUBROTATION_STEP_MS);
      if (!mountedRef.current || roundTokenRef.current !== myToken) return;
    }

    setIntroRunning(false);
  }

  // Diapasón (solo EXPERTO): La2 de referencia, SIN el desafinado de ninguna cuerda -- es un tono
  // de referencia fijo, no una cuerda de la guitarra. forKeyboard=false a propósito: debe sonar
  // exactamente como el La2 de la guitarra MIDI (la misma muestra que suena al pulsar la cuerda 5
  // al aire), no el oscilador del teclado. Una pulsación nueva cada DIAPASON_PLUCK_INTERVAL_MS
  // mientras se mantiene pulsado -- no un tono sostenido -- así que cada tick suelta la pulsación
  // anterior (un pellizco real amortigua el anterior al volver a tocar la cuerda) antes de lanzar
  // la siguiente.
  function triggerDiapasonPluck() {
    if (diapasonVoiceRef.current >= 0) {
      releaseNote(diapasonVoiceRef.current);
      diapasonVoiceRef.current = -1;
    }
    playNote(STANDARD_TUNING_MIDI[5], false, volumeRef.current).then(id => {
      diapasonVoiceRef.current = id;
    });
  }

  function onDiapasonPointerDown(e: PointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDiapasonSounding(true);
    triggerDiapasonPluck();
    diapasonIntervalRef.current = window.setInterval(triggerDiapasonPluck, DIAPASON_PLUCK_INTERVAL_MS);
  }

  function onDiapasonPointerUp(e: PointerEvent<HTMLButtonElement>) {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // el navegador puede haber liberado ya la captura; se puede ignorar con seguridad
    }
    setDiapasonSounding(false);
    if (diapasonIntervalRef.current !== null) {
      window.clearInterval(diapasonIntervalRef.current);
      diapasonIntervalRef.current = null;
    }
    if (diapasonVoiceRef.current >= 0) {
      releaseNote(diapasonVoiceRef.current);
      diapasonVoiceRef.current = -1;
    }
  }

  function syncPointerPositions() {
    setPointerPositions([...ptVoicesRef.current.values()].map(({ string, fret }) => ({ string, fret })));
  }

  // Recibe `centsValue` como parámetro en vez de leerlo de un ref o de `cents` capturado por
  // cierre -- así sirve tanto para el render (pasando `cents[string]`, el estado directo) como
  // para los manejadores de puntero/teclado asíncronos (pasando `centsRef.current[string]`, el
  // valor más reciente tras el `await playNote(...)`, por si el usuario ha seguido girando la
  // clavija mientras la nota terminaba de cargar). Leer un ref DURANTE el render está prohibido
  // (rompe la regla react-hooks/refs) -- de ahí que esta función no lo haga nunca por sí misma.
  function effectiveMidi(string: StringNumber, fret: number, centsValue: number): number {
    return STANDARD_TUNING_MIDI[string] + fret + centsToMidiOffset(centsValue);
  }

  // Entrada por teclado -- mismo FRETBOARD_KEYMAP/FRETBOARD_KEYMAP_UPPER que el resto de mástiles
  // del sitio (AGENTS.md: "Fretboards use FRETBOARD_KEYMAP"), filtrando las entradas con traste >
  // END_FRET (ese mapa llega hasta el traste 12, este tablero solo hasta el 5). Como ese mapa cubre
  // las cuerdas 3-6 directamente y 1-4 en su variante "upper", entre los dos rangos se llega a las
  // 6 cuerdas -- igual que el toggle grave/agudo ya establecido en ReducedFretboardDiagram.tsx.
  // A propósito NO replica el hammer-on/pull-off de aquel componente: cada tecla mantenida es una
  // voz independiente (mismo criterio que el puntero, ver el comentario de MAX_VOICES).
  useEffect(() => {
    if (!kbMode) return;
    const activeMap = kbRange === 'upper' ? FRETBOARD_KEYMAP_UPPER : FRETBOARD_KEYMAP;

    function syncKbPositions() {
      setKbPositions([...kbKeysHeldRef.current.values()].map(({ string, fret }) => ({ string: string as StringNumber, fret })));
    }

    async function down(e: KeyboardEvent) {
      if (e.code === 'ArrowUp') {
        e.preventDefault();
        setKbRange('upper');
        return;
      }
      if (e.code === 'ArrowDown') {
        e.preventDefault();
        setKbRange('lower');
        return;
      }
      const entry = activeMap[e.code];
      if (!entry || entry.fret > END_FRET) return;
      e.preventDefault();
      if (introRunningRef.current) return; // la secuencia automática de Profesional está "tocando" el mástil
      if (e.repeat || kbKeysHeldRef.current.has(e.code)) return;
      if (kbKeysHeldRef.current.size >= MAX_VOICES) return;
      kbKeysHeldRef.current.set(e.code, { ...entry, voiceId: -1 });
      setKbGhostWarn(hasKeyboardGhosting(kbKeysHeldRef.current));
      syncKbPositions();
      const midi = effectiveMidi(entry.string as StringNumber, entry.fret, centsRef.current[entry.string as StringNumber]);
      const id = await playNote(midi, false, volumeRef.current);
      const cur = kbKeysHeldRef.current.get(e.code);
      if (cur) kbKeysHeldRef.current.set(e.code, { ...entry, voiceId: id });
      else releaseNote(id);
    }

    function up(e: KeyboardEvent) {
      const cur = kbKeysHeldRef.current.get(e.code);
      if (!cur) return;
      e.preventDefault();
      kbKeysHeldRef.current.delete(e.code);
      setKbGhostWarn(hasKeyboardGhosting(kbKeysHeldRef.current));
      syncKbPositions();
      if (cur.voiceId >= 0) releaseNote(cur.voiceId);
    }

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      kbKeysHeldRef.current.forEach(({ voiceId }) => {
        if (voiceId >= 0) releaseNote(voiceId);
      });
      kbKeysHeldRef.current.clear();
      setKbPositions([]);
      setKbGhostWarn(false);
    };
  }, [kbMode, kbRange]);

  function getCellAt(e: PointerEvent<SVGSVGElement>): { string: StringNumber; fret: number } | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const coords = getSvgCoords(e, svg);
    if (!coords) return null;
    const { x, y } = coords;
    const halfGap = STRING_GAP / 2;
    if (y < BOARD_Y - halfGap || y > BOARD_Y + BOARD_HEIGHT + halfGap) return null;
    const rowIndex = Math.max(0, Math.min(5, Math.round((y - BOARD_Y) / STRING_GAP)));
    const string = STRINGS[rowIndex];
    if (x < BOARD_X) {
      if (x < BOARD_X - OPEN_HIT_MARGIN) return null;
      return { string, fret: 0 };
    }
    const fret = Math.floor((x - BOARD_X) / FRET_WIDTH) + 1;
    if (fret > END_FRET) return null;
    return { string, fret };
  }

  async function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    if (introRunning) return; // la secuencia automática de Profesional está "tocando" el mástil
    const cell = getCellAt(e);
    if (!cell) return;
    if (ptVoicesRef.current.size >= MAX_VOICES) return;
    const svg = svgRef.current;
    if (!svg) return;
    svg.setPointerCapture(e.pointerId);
    ptVoicesRef.current.set(e.pointerId, { ...cell, voiceId: -1 });
    syncPointerPositions();
    const midi = effectiveMidi(cell.string, cell.fret, centsRef.current[cell.string]);
    const id = await playNote(midi, false, volumeRef.current);
    const cur = ptVoicesRef.current.get(e.pointerId);
    if (cur) ptVoicesRef.current.set(e.pointerId, { ...cell, voiceId: id });
    else releaseNote(id);
  }

  // Arrastrar sin soltar cambia de nota al pasar por encima de otra celda -- igual que el resto de
  // mástiles del sitio (ReducedFretboardDiagram.tsx). Si el arrastre sale del tablero (getCellAt
  // devuelve null) la nota actual se queda sonando tal cual hasta soltar o volver a entrar, en vez
  // de cortarse -- mismo comportamiento que allí.
  async function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    const cur = ptVoicesRef.current.get(e.pointerId);
    if (!cur) return;
    const cell = getCellAt(e);
    if (!cell) return;
    if (cell.string === cur.string && cell.fret === cur.fret) return;
    ptVoicesRef.current.set(e.pointerId, { ...cell, voiceId: -1 });
    syncPointerPositions();
    const midi = effectiveMidi(cell.string, cell.fret, centsRef.current[cell.string]);
    const id = await switchNote(cur.voiceId, midi, false, volumeRef.current);
    const sv = ptVoicesRef.current.get(e.pointerId);
    if (sv && sv.string === cell.string && sv.fret === cell.fret) ptVoicesRef.current.set(e.pointerId, { ...cell, voiceId: id });
    else releaseNote(id);
  }

  function onPointerUp(e: PointerEvent<SVGSVGElement>) {
    const cur = ptVoicesRef.current.get(e.pointerId);
    if (!cur) return;
    ptVoicesRef.current.delete(e.pointerId);
    syncPointerPositions();
    if (cur.voiceId >= 0) releaseNote(cur.voiceId);
  }

  return (
    <div className="midi-instrument-host">
      <div className="tuning-game-controls" role="group" aria-label="Dificultad del juego de afinar a oído">
        {DIFFICULTIES.map(d => (
          <button
            key={d}
            type="button"
            className={`tuning-difficulty-button${difficulty === d ? ' is-active' : ''}`}
            aria-pressed={difficulty === d}
            disabled={introRunning}
            onClick={() => {
              if (introRunning) return;
              if (d === 'profesional') startProfessionalRound();
              else startDifficulty(d);
            }}
          >
            {DIFFICULTY_LABELS[d]}
          </button>
        ))}
        {difficulty && (
          <span
            className={`tuning-timer${solved ? ' is-solved' : ''}`}
            aria-label={solved ? 'Tiempo final: todas las cuerdas afinadas' : 'Tiempo transcurrido'}
          >
            {solved ? '✅' : '⏱'} {formatElapsed(elapsedSeconds)}
          </span>
        )}
      </div>

      {difficulty && (
        <p className="tuning-difficulty-description">
          <strong>{DIFFICULTY_LABELS[difficulty]}:</strong> {DIFFICULTY_DESCRIPTIONS[difficulty]}
        </p>
      )}

      {showDiapason && (
        <button
          type="button"
          className={`tuning-diapason-button${diapasonSounding ? ' is-sounding' : ''}`}
          onPointerDown={onDiapasonPointerDown}
          onPointerUp={onDiapasonPointerUp}
          onPointerCancel={onDiapasonPointerUp}
          style={{ touchAction: 'none' }}
        >
          🎵 Diapasón La 440Hz
        </button>
      )}

      <svg
        ref={svgRef}
        className="tuning-board-svg"
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        role="img"
        aria-label="Mástil de afinación a oído, trastes 0 a 5, con una clavija por cuerda"
        style={{ touchAction: 'none', cursor: 'pointer', userSelect: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <rect className="reduced-board-bg" x={BOARD_X} y={BOARD_Y} width={BOARD_WIDTH} height={BOARD_HEIGHT} />

        {STRINGS.map((s, i) => (
          <line
            className="reduced-string"
            key={`string-${s}`}
            x1={BOARD_X}
            x2={BOARD_X + BOARD_WIDTH}
            y1={stringY(i)}
            y2={stringY(i)}
          />
        ))}

        {Array.from({ length: END_FRET + 1 }, (_, fret) => (
          <line
            className={fret === 0 ? 'reduced-nut' : 'reduced-fret'}
            key={`fret-${fret}`}
            x1={BOARD_X + fret * FRET_WIDTH}
            x2={BOARD_X + fret * FRET_WIDTH}
            y1={BOARD_Y}
            y2={BOARD_Y + BOARD_HEIGHT}
          />
        ))}

        {[3, 5].map(fret => (
          <circle
            className="reduced-guide-dot"
            key={`dot-${fret}`}
            cx={BOARD_X + (fret - 0.5) * FRET_WIDTH}
            cy={BOARD_Y + BOARD_HEIGHT / 2}
            r={7}
          />
        ))}

        {Array.from({ length: END_FRET + 1 }, (_, fret) => (
          <text
            className="reduced-fret-number"
            key={`fretnum-${fret}`}
            x={fret === 0 ? BOARD_X : BOARD_X + (fret - 0.5) * FRET_WIDTH}
            y={FRET_NUMBER_Y}
          >
            {fret}
          </text>
        ))}

        {STRINGS.map((s, i) => {
          const y = stringY(i);
          const noteName = midiToNoteName(effectiveMidi(s, 0, cents[s]));
          return (
            <g key={`peg-row-${s}`}>
              <TuningPeg
                x={PEG_X}
                y={y}
                stepValue={cents[s]}
                onStepChange={next => setCents(c => ({ ...c, [s]: next }))}
                ariaLabel={`Clavija de la cuerda ${s}`}
                baselineDeg={baselineAngles[s]}
                animating={introRunning}
              />
              {!hideNoteNames && (
                <text className="tuning-open-note" x={BOARD_X - 12} y={y + 5}>
                  {noteName}
                </text>
              )}
            </g>
          );
        })}

        {(kbMode ? kbPositions : pointerPositions).map(({ string, fret }) => {
          const markerX = fretMarkerX(fret);
          const y = stringY(STRINGS.indexOf(string));
          const noteName = midiToNoteName(effectiveMidi(string, fret, cents[string]));
          return (
            <g
              key={`marker-${string}-${fret}`}
              pointerEvents="none"
              style={{ animation: 'fretboard-string-vibrate 80ms linear infinite' }}
            >
              <circle className="tuning-note-marker" cx={markerX} cy={y} r={16} />
              {!hideNoteNames && (
                <text className="tuning-note-marker-label" x={markerX} y={y + 4}>
                  {noteName}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <MidiInstrumentChrome
        warning={kbMode && kbGhostWarn && (
          <span style={{ fontSize: '11px', color: '#92400e', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '4px', padding: '2px 6px', whiteSpace: 'nowrap' }}>
            ⚠ Necesitas teclado gaming para tocar ciertos acordes
          </span>
        )}
      >
        <div className="midi-anchor">
          <button
            onClick={() => setKbMode(m => !m)}
            style={{ background: kbMode ? '#047857' : 'transparent', border: `1.5px solid ${kbMode ? '#047857' : '#9ca3af'}`, borderRadius: '5px', color: kbMode ? '#fff' : '#6b7280', cursor: 'pointer', fontSize: '12px', fontWeight: 700, lineHeight: 1.4, padding: '3px 8px' }}
          >
            KEYBOARD
          </button>
          {kbMode && (
            <div className="midi-dropdown">
              {(['lower', 'upper'] as const).map(range => (
                <button key={range} onClick={() => setKbRange(range)} aria-pressed={kbRange === range}
                  style={{ background: kbRange === range ? '#047857' : 'transparent', border: `1.5px solid ${kbRange === range ? '#047857' : '#9ca3af'}`, borderRadius: '5px', color: kbRange === range ? '#fff' : '#6b7280', cursor: 'pointer', fontSize: '11px', fontWeight: 700, lineHeight: 1.4, padding: '3px 7px', whiteSpace: 'nowrap' }}>
                  {range === 'lower' ? 'Graves' : 'Agudas'}
                </button>
              ))}
            </div>
          )}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#080808', minWidth: '40px', textAlign: 'right' }}>
            Vol {Math.round(volume * 100)}
          </span>
          <input
            aria-label="Volumen del mástil de afinación"
            max="1"
            min="0"
            step="0.05"
            style={{ accentColor: '#047857', cursor: 'pointer', width: '112px' }}
            type="range"
            value={volume}
            onChange={e => setVolume(Number(e.target.value))}
          />
        </label>
      </MidiInstrumentChrome>
    </div>
  );
}

export function TuningBoardStyles() {
  return (
    <style>{`
      .tuning-game-controls {
        align-items: center;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 14px;
      }

      .tuning-difficulty-button {
        background: #f4f4f5;
        border: 1.5px solid #a1a1aa;
        border-radius: 999px;
        color: #52525b;
        cursor: pointer;
        font-size: 13px;
        font-weight: 800;
        padding: 7px 16px;
      }

      .tuning-difficulty-button.is-active {
        background: #047857;
        border-color: #047857;
        color: #ffffff;
      }

      .tuning-difficulty-button:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }

      .tuning-timer {
        color: #080808;
        font-size: 14px;
        font-weight: 800;
        font-variant-numeric: tabular-nums;
        margin-left: 4px;
      }

      .tuning-timer.is-solved {
        color: #047857;
      }

      .tuning-difficulty-description {
        color: #080808;
        font-size: 13px;
        line-height: 1.4;
        margin: 0 0 14px;
      }

      .tuning-difficulty-description strong {
        color: #047857;
      }

      .tuning-diapason-button {
        background: #fef3c7;
        border: 1.5px solid #f59e0b;
        border-radius: 8px;
        color: #92400e;
        cursor: pointer;
        display: inline-block;
        font-size: 13px;
        font-weight: 800;
        margin-bottom: 14px;
        padding: 8px 16px;
        user-select: none;
      }

      .tuning-diapason-button.is-sounding {
        background: #f59e0b;
        color: #ffffff;
      }

      .tuning-board-svg {
        display: block;
        height: auto;
        max-width: 100%;
        width: 100%;
      }

      .tuning-peg {
        cursor: grab;
      }

      .tuning-peg:active {
        cursor: grabbing;
      }

      .tuning-peg-body {
        fill: #d4d4d8;
        stroke: #52525b;
        stroke-width: 2;
      }

      .tuning-peg:hover .tuning-peg-body,
      .tuning-peg:focus-visible .tuning-peg-body {
        stroke: #047857;
      }

      .tuning-peg:focus-visible {
        outline: none;
      }

      .tuning-peg:focus-visible .tuning-peg-body {
        stroke-width: 3;
      }

      .tuning-peg-indicator {
        stroke: #047857;
        stroke-linecap: round;
        stroke-width: 3;
      }

      .tuning-peg.is-animating {
        cursor: default;
      }

      .tuning-peg.is-animating .tuning-peg-indicator {
        transition: transform 400ms ease-in-out;
      }

      .tuning-open-note {
        fill: #080808;
        font-size: 16px;
        font-weight: 950;
        text-anchor: end;
      }

      .tuning-note-marker {
        fill: #fbbf24;
        opacity: 0.9;
      }

      .tuning-note-marker-label {
        fill: #b45309;
        font-size: 12px;
        font-weight: 900;
        text-anchor: middle;
      }
    `}</style>
  );
}
