'use client';
import { type MutableRefObject, type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { getAudioCurrentTime, type GuitarTone, playDrumPad, playNote, preloadSamples, releaseNote, switchNote, touchAudioContext } from '@/app/lib/guitarAudioEngine';
import type { DrumNeckGeometry } from './riff/DrumKitNeck';
import { keyAt, keyRect, type KeysNeckGeometry } from '@/app/lib/riff/keysGeometry';

// Motor del juego Riff-Hero (DrumKitNeck/KeysNeck/RiffHighway/RiffControls/RiffTutorialCard/SoundCheckDesk):
// cargados con next/dynamic a propósito -- son ~2800 líneas que antes se compilaban SIEMPRE, en las 27
// páginas que usan este mástil, aunque solo Sala de pruebas (la única con `riffGame`/`instrumentChoice`)
// llegue a necesitarlas. `useRiffController` (hook, más abajo) no puede cargarse así -- React exige llamar
// los hooks siempre, de forma síncrona -- así que esas ~5800 líneas de app/lib/riff/* siguen compilándose
// en toda página con mástil; separar eso exigiría partir este componente en dos, fuera de alcance por ahora.
// Los tres `dynamic()` que comparten un mismo archivo (DrumKitNeck, KeysNeck, RiffControls) comparten también
// su chunk -- Turbopack/webpack lo deduplican, no se compila tres veces.
const DrumKitNeck = dynamic(() => import('./riff/DrumKitNeck'), { ssr: false });
const DrumHits = dynamic(() => import('./riff/DrumKitNeck').then((m) => m.DrumHits), { ssr: false });
const DrumHitStyles = dynamic(() => import('./riff/DrumKitNeck').then((m) => m.DrumHitStyles), { ssr: false });
const KeysNeck = dynamic(() => import('./riff/KeysNeck'), { ssr: false });
const KeysHits = dynamic(() => import('./riff/KeysNeck').then((m) => m.KeysHits), { ssr: false });
const KeysHitStyles = dynamic(() => import('./riff/KeysNeck').then((m) => m.KeysHitStyles), { ssr: false });

const SPANISH_NOTE_NAMES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
import { isLatchingQuirk, LATCH_RELEASE_MS, PIANO_KEYMAP, PIANO_TREBLE_CODES } from '@/app/lib/pianoKeymap';
import { isBlackKey } from '@/app/lib/riff/keys';
import type { DifficultyKind } from '@/app/lib/riff/difficulty';

// Batería (usuario, 2026-11-16): en pantallas anchas el mástil no pasa de este ancho, centrado; con 6 columnas
// a todo lo ancho los tambores salían demasiado estirados. La autopista sigue sus bordes (getScreenCTM).
// Ancho máximo de la batería (usuario, 2026-11-20): el que tiene justo al pasar del modo estrecho al ancho (el
// umbral de `fitsFullNeck` en useRiffController: 12 trastes × 44 px + 60 px de margen). En pantalla estrecha crece
// con el ancho; desde ahí ya no crece más.
const DRUM_NECK_MAX_PX = 12 * 44 + 60;
// Batería: alto de la tabla en anchos de columna en la batería MIDI suelta (158 / 61 ≈ 2,59; los platos y bombos
// caben con 2,54: plato fuerte 1,15 + margen 0,12 por encima de la línea de golpe, que va en el centro).
const DRUM_BOARD_PER_COLUMN = 2.54;
// Lo que pueden bajar los bombos bajo el mástil: la barra MIDI (2 px de margen + su alto, ~38 px).
const DRUM_KICK_OVERHANG_PX = 40;
import { FRETBOARD_KEYMAP, FRETBOARD_KEYMAP_LEFTY, FRETBOARD_KEYMAP_UPPER, FRETBOARD_KEYMAP_UPPER_LEFTY, hasKeyboardGhosting } from '@/app/lib/fretboardKeymap';
import { useMetronome } from '@/app/lib/useMetronome';
import { useNoteMarks } from '@/app/lib/useNoteMarks';
import { type PracticeExercise, type PracticeNoteEvent, useFretboardPractice } from '@/app/lib/useFretboardPractice';
import { FretboardPracticeStyles, PracticeButtons, PracticeFeedback, PracticeTargetMarker } from './FretboardPractice';
import { formatScore } from '@/app/lib/riff/formatScore';
import { useRiffController } from './riff/useRiffController';
const RiffHighway = dynamic(() => import('./riff/RiffHighway'), { ssr: false });
const RiffControls = dynamic(() => import('./riff/RiffControls').then((m) => m.RiffControls), { ssr: false });
const RiffStyles = dynamic(() => import('./riff/RiffControls').then((m) => m.RiffStyles), { ssr: false });
const RiffTutorialCard = dynamic(() => import('./riff/RiffTutorialCard').then((m) => m.RiffTutorialCard), { ssr: false });
const SoundCheckDesk = dynamic(() => import('./riff/SoundCheckDesk').then((m) => m.SoundCheckDesk), { ssr: false });
import HorizontalScrollbar from './HorizontalScrollbar';
import MetronomeControls from './MetronomeControls';
import MidiInstrumentChrome from './MidiInstrumentChrome';
import HoldGuard, { HoldGuardStyles } from './HoldGuard';
import { FRETBOARD_TOUR, TutorialButton } from './ButtonTour';
import type { SongEntry } from '@/app/lib/songs';
import { useSongChoice } from './LocalSongSearch';

const NO_SONGS: SongEntry[] = [];
import { NoteMarksOverlay, PaletteToggleButton } from './NoteMarksOverlay';
import { HandednessToggleButton, KeyboardLeftyNote } from './HandednessToggleButton';
import { laneAt, laneRows } from '@/app/lib/riff/lanes';
import { RIFF_STRING_COLORS } from '@/app/lib/riff/colors';
import { laneSpeedFactor, RIFF_LEVELS, stretchesLane } from '@/app/lib/riff/levels';
import { RIFF_TUTORIAL } from './riff/riffTutorial';
import { COUNTDOWN_PHRASES, EXPERTO_PHRASES } from '@/app/lib/riff/phrases';
import { isTouchOnly } from '@/app/lib/localSongs';
import { setGameInProgress } from '@/app/lib/gameInProgress';
import TuningPeg from '../tuningGame/TuningPeg';
import { centsToMidiOffset } from '@/app/lib/tuningGame/pitch';
import { KeyboardToggleLabel } from './InstrumentIcons';
import { RiffPerfBox } from './riff/RiffPerfBox';
import NeckInstrumentPicker from './NeckInstrumentPicker';
import { claimOpenGame, onOpenGameClaim } from '@/app/lib/riff/openGame';

// Standard tuning: MIDI for each open string (string 1 = high E)
const OPEN_STRING_MIDI: Record<number, number> = {
  1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40,
  // Cuerdas graves de los instrumentos de más de 6 (Experto, ver `gameStrings` en chart.ts).
  7: 35, 8: 30, 9: 25,
};

// BAJO de 4 cuerdas en el mástil (usuario, 2026-11-17): las cuerdas internas 6-3 (como `gameStrings` en
// chart.ts), una octava por debajo de la guitarra y afinado en Mi: E1 A1 D2 G2.
const BASS_OPEN_MIDI: Record<number, number> = { 3: 43, 4: 38, 5: 33, 6: 28 };
const BASS_STRINGS = [3, 4, 5, 6];
// Sus filas: las mismas que las 4 cuerdas del nivel Difícil (lanes.ts: centradas en el mástil, usuario
// 2026-11-18); en el tema oscuro de la Sala, con sus colores (RIFF_STRING_COLORS de 6 a 3).
const BASS_LANES = laneRows(BASS_STRINGS);
// Grosor de sus cuerdas (las de la guitarra, 3).
const BASS_STRING_WIDTH = 5;
const GUITAR_STRINGS = [1, 2, 3, 4, 5, 6];
// Clave del instrumento recordado, la misma que la partida (useRiffController).
const NECK_INSTRUMENT_STORAGE_KEY = 'riff-ultimo-instrumento';
const noNeckChanges = () => () => {};
// Selector de instrumento (Sala de pruebas, 2026-11-20): guitarra/bajo/batería/teclado, los 4 como
// opciones normales del mismo selector, se recuerdan igual (antes la batería suelta usaba
// `remember: false` a propósito para no pisar guitarra/bajo -- ahora es una opción más, se recuerda igual).
function savedNeckKind(): DifficultyKind | null {
  try {
    const value = window.localStorage.getItem(NECK_INSTRUMENT_STORAGE_KEY);
    return value === 'bass' || value === 'drums' || value === 'keys' ? value : null;
  } catch {
    return null;
  }
}
function rememberNeck(kind: DifficultyKind) {
  try {
    if (kind === 'guitar') window.localStorage.removeItem(NECK_INSTRUMENT_STORAGE_KEY);
    else window.localStorage.setItem(NECK_INSTRUMENT_STORAGE_KEY, kind);
  } catch {
    // Sin almacenamiento: vale para esta visita.
  }
}
// Batería suelta/en partida: siempre 6 pads (0-5); los 5 niveles de batería comparten el mismo maxFret.
const DRUM_MAX_FRET = RIFF_LEVELS['bateria-facil'].maxFret;

const TUTORIAL_LANE_SPEEDS = RIFF_TUTORIAL.map((part) => part.laneSpeed);

type MarkPos = { string: number; fret: number };

// Marca naranja de las notas pulsadas, con su PROPIO estado (usuario, 2026-11-09): pulsar y soltar una
// nota corta redibujaban el mástil ENTERO dos veces, un tirón en cada nota en el móvil. Así solo se
// redibuja esto. `render` es la de la última vez que se dibujó el mástil (la geometría no cambia al pulsar).
function PressMarks({ render, setterRef }: { render: (list: MarkPos[]) => ReactNode; setterRef: MutableRefObject<((list: MarkPos[]) => void) | null> }) {
  const [list, setList] = useState<MarkPos[]>([]);
  useEffect(() => {
    setterRef.current = setList;
    return () => { setterRef.current = null; };
  }, [setterRef]);
  return <>{render(list)}</>;
}

type RiffStats = { subscribe: (listener: () => void) => () => void; get: () => { hits: number; score: number } };

// Los puntos de la partida: solo esta línea se redibuja con cada acierto (ver `stats` en useRiffGame).
function RiffScoreText({ show, stats }: { show: boolean; stats: RiffStats }) {
  const score = useSyncExternalStore(stats.subscribe, () => stats.get().score, () => 0);
  return <>{show ? `${formatScore(score)} puntos` : ''}</>;
}

const chromaticNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// `centsValue` SIEMPRE como parámetro explícito (nunca leído de un ref/estado dentro de la
// función) -- mismo motivo que TuningBoard.tsx: así sirve tanto desde el render (pasando
// `cents[string]`) como desde los manejadores de puntero/teclado asíncronos (pasando
// `centsRef.current[string]`, el valor más reciente tras un `await`). Ver `allowTuning` más abajo.
function effectiveMidi(string: number, fret: number, centsValue: number, bass = false): number {
  return (bass ? BASS_OPEN_MIDI[string] ?? OPEN_STRING_MIDI[string] - 12 : OPEN_STRING_MIDI[string]) + fret + centsToMidiOffset(centsValue ?? 0);
}

function noteNameForFret(string: number, fret: number, centsValue: number) {
  const midi = Math.round(effectiveMidi(string, fret, centsValue));
  return chromaticNotes[((midi % 12) + 12) % 12];
}

type TuningPreset = { id: string; label: string; shiftSemitones: number };

// Afinaciones "Estándar X" -- a petición explícita del usuario: mismo patrón de intervalos que la
// afinación estándar (E A D G B E), desplazado uniformemente en semitonos para que la cuerda 6
// caiga en la nota X. EDITAR AQUÍ para añadir/quitar afinaciones del menú -- cada entrada nueva
// solo necesita su `shiftSemitones` (cuántos semitonos por debajo -negativo- o encima -positivo-
// de la afinación estándar se desplazan las 6 cuerdas a la vez).
const TUNING_PRESETS: TuningPreset[] = [
  { id: 'e', label: 'Estándar E (Estándar)', shiftSemitones: 0 },
  { id: 'eb', label: 'Estándar D# (Media caída)', shiftSemitones: -1 },
  { id: 'd', label: 'Estándar D (Un tono bajo)', shiftSemitones: -2 },
  { id: 'csharp', label: 'Estándar C# (Tono y medio bajo)', shiftSemitones: -3 },
  { id: 'c', label: 'Estándar C (Dos tonos bajo)', shiftSemitones: -4 },
  { id: 'b', label: 'Estándar B (Barítono)', shiftSemitones: -5 },
];

function zeroedCents(): Record<number, number> {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
}

function centsForPreset(preset: TuningPreset): Record<number, number> {
  const value = preset.shiftSemitones * 100;
  return { 1: value, 2: value, 3: value, 4: value, 5: value, 6: value };
}

type FretboardNote = {
  fret: number;
  highlight?: boolean;
  label: string;
  string: number;
  tone?: 'minor' | 'root' | 'special';
};

type GuideDot = {
  fret: number;
  string?: number;
};

export interface FretboardGeometry {
  svg: SVGSVGElement | null;
  // Coordenadas en unidades del viewBox (pasarlas por svg.getScreenCTM() para píxeles).
  fretX: (fret: number) => number;
  stringY: (string: number) => number;
  // Altura a la que caen las notas del juego en el nivel elegido (lanes.ts); sin juego = stringY.
  laneY?: (string: number) => number;
  // Bordes de cada columna de traste (líneas de traste), en orden lógico de traste.
  fretLineXs: number[];
  // Casilla del traste 0 en el juego (de borde a cejuela, ya dibujada): tan ancha como las demás.
  openColumn?: [number, number];
  startFret: number;
  endFret: number;
  // Batería (DrumKitNeck): su geometría, para el "fantasma" gris de las piezas en la autopista.
  drumGeo?: DrumNeckGeometry;
}

interface ReducedFretboardDiagramProps {
  allowLeftHanded?: boolean;
  allowOverdrive?: boolean;
  allowTuning?: boolean;
  ariaLabel: string;
  endFret: number;
  fretLabels?: boolean;
  fretLabelsAbove?: boolean;
  // Geometría viva del mástil (coordenadas del viewBox + el <svg>), para dibujar encima cosas
  // alineadas traste a traste -- la usa la autopista del juego (RiffHighway).
  geometryRef?: MutableRefObject<FretboardGeometry | null>;
  guideDots?: GuideDot[];
  notes: FretboardNote[];
  // Llamado con cada nota que suena; puede devolver un volumen relativo (1 = normal).
  onNoteEvent?: (event: PracticeNoteEvent) => number | void;
  // Modo "Practicar ejercicio" (opt-in): un botón por ejercicio, ver useFretboardPractice.ts.
  practiceExercises?: PracticeExercise[];
  // Juego tipo Rocksmith (opt-in): añade "JUGAR" a la barra de controles, que despliega los ajustes
  // y "Empezar", y muestra la autopista de notas encima del mástil. Ver app/lib/riff.
  // `songs`: las canciones que se pueden elegir con el botón del disco (la primera a la izquierda del
  // panel); `initialSong`: id de la que sale al cargar (si falta, la primera).
  riffGame?: { songs: SongEntry[]; initialSong?: string };
  // Botón "Tutorial" encima del mástil: enseña los botones de su barra. Por defecto, sí (todos los
  // instrumentos MIDI de la web lo llevan, petición del usuario); `false` lo quita.
  tutorial?: boolean;
  startFret: number;
  // Selector Guitarra / Bajo / Batería / Teclado en la barra (Sala de pruebas, 2026-11-20): los 4 como
  // opciones normales e independientes de cualquier canción cargada, con el sonido de cada uno.
  instrumentChoice?: boolean;
  // Solo en el TEMA OSCURO (usuario, 2026-11-18, Sala de pruebas): el mástil con el aspecto de la partida de
  // Riff-Hero (madera oscura, trastes, cejuela y puntos amarillos con brillo, cuerdas en sus colores del juego).
  darkGameLook?: boolean;
}

const romanFretLabels: Record<number, string> = {
  3: 'III',
  5: 'V',
  7: 'VII',
  9: 'IX',
  12: 'XII',
};

// Niveles del juego que se estiran: todos los que usan menos trastes que el mástil entero (0-5 en
// trastes Principiante/Fácil/Medio; 0-10 en trastes Avanzado y 0-11 en Medio cuerdas, petición del
// usuario 2026-11-02). Avanzado/Difícil cuerdas (0-12) y Experto usan el mástil normal.

function fretMarkerX(boardX: number, fretWidth: number, startFret: number, fret: number, openWidth: number | null = null) {
  if (startFret === 0 && fret === 0) {
    return boardX - (openWidth === null ? 20 : openWidth / 2);
  }

  if (startFret === 0) {
    return boardX + (fret - 0.5) * fretWidth;
  }

  return boardX + (fret - startFret + 0.5) * fretWidth;
}

function noteToneClass(note: FretboardNote) {
  if (note.tone === 'special') {
    return 'reduced-note-special';
  }

  if (note.label === 'E') {
    return 'reduced-note-e';
  }

  if (note.label === 'G') {
    return 'reduced-note-g';
  }

  return '';
}

function getSvgCoords(
  e: React.PointerEvent<SVGSVGElement>,
  svg: SVGSVGElement,
): { x: number; y: number } | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const r = pt.matrixTransform(ctm.inverse());
  return { x: r.x, y: r.y };
}

// Hueco mínimo (px) entre los números de traste y el botón KEYBOARD para poner "Usa teclado" + la flecha.
const KB_HINT_MIN_GAP = 34;
// Ancho (px) de "◀ Usa teclado" a la derecha de la barra (con JUGAR la barra va pegada a los números).
const KB_SIDE_HINT_WIDTH = 104;

const BASE_BOARD_HEIGHT = 158;
const TALL_NECK_SCREEN = 0.4;
const TALL_NECK_PORTRAIT_TRIM_PX = 10;
// Por debajo de este ancho de ventana el escenario del juego llega a los bordes también con ratón.
const BLEED_MAX_VIEWPORT = 1000;

export function ReducedFretboardDiagram({ allowLeftHanded, allowOverdrive, allowTuning, ariaLabel, fretLabels, fretLabelsAbove, geometryRef, guideDots = [], notes, onNoteEvent, practiceExercises, riffGame, startFret, tutorial = true, endFret: fullEndFret, instrumentChoice = false, darkGameLook = false }: ReducedFretboardDiagramProps) {
  // Juego tipo Rocksmith (prop `riffGame`). `gameOpen` = JUGAR activado (autopista visible); la
  // partida en sí la arranca "Empezar". El mástil ocupa siempre lo mismo en pantalla; en los niveles
  // de 6 trastes (0-5) se ESTIRA en el eje X (decisión del usuario): solo se dibujan esos trastes y
  // cada uno es más ancho, para que juntos midan lo que el mástil completo (no se agranda: el alto,
  // las cuerdas y los textos no cambian).
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [gameOpen, setGameOpen] = useState(false);
  // Posiciones que suenan AHORA (teclado y ratón/dedo), para las notas repetidas con la pulsación
  // mantenida del juego. Se rellena más abajo, cuando existen los refs de las pulsaciones.
  const heldPositionsRef = useRef<() => { string: number; fret: number }[]>(() => []);
  // Canción del disco: las de la web + las del propio dispositivo (LocalSongSearch.tsx).
  // Carita y orden del disco por el instrumento de la pista elegida (usuario, 2026-11-19; se ajusta más abajo,
  // cuando ya se sabe la pista).
  const [songKind, setSongKind] = useState<DifficultyKind>(instrumentChoice ? savedNeckKind() ?? 'guitar' : 'guitar');
  const songChoice = useSongChoice(riffGame?.songs ?? NO_SONGS, riffGame?.initialSong, songKind);
  const song = riffGame ? songChoice.song : undefined;
  // Se mide el ESCENARIO del juego (no el host): con JUGAR abierto se estira hasta los bordes de la
  // pantalla (`bleed`), y es ese ancho real el que decide qué niveles caben y el modo estrecho.
  // INSTRUMENTO del mástil (usuario, 2026-11-17, ampliado a 4 el 2026-11-20): guitarra/bajo/batería/teclado
  // con el selector (`instrumentChoice`, se recuerda con la misma clave que la partida). Con JUGAR abierto
  // manda la pista que se toca (Tocas), y elegirla en Tocas cambia también el selector.
  const savedKind = useSyncExternalStore(noNeckChanges, savedNeckKind, () => null);
  const [pickedNeck, setPickedNeck] = useState<DifficultyKind | null>(null);
  const neckChoice: DifficultyKind = instrumentChoice ? (pickedNeck ?? savedKind ?? 'guitar') : 'guitar';
  const chooseNeck = (kind: DifficultyKind) => {
    setPickedNeck(kind);
    rememberNeck(kind);
  };
  const riffCore = useRiffController({
    source: song?.source, initialTrack: song?.initialTrack, trackRoles: song?.trackRoles, startFret, endFret: fullEndFret, measureRef: stageRef, heldRef: heldPositionsRef,
    // El selector manda salvo que se haya elegido Guitarra a mano; si no, el instrumento recordado de la
    // partida (que puede ser cualquiera de los 4).
    kind: instrumentChoice && (neckChoice !== 'guitar' || pickedNeck === 'guitar') ? neckChoice : undefined,
  });
  // Elegir pista en Tocas pone el selector en su instrumento.
  const riff = instrumentChoice
    ? {
        ...riffCore,
        setTrackIndex: (index: number) => {
          riffCore.setTrackIndex(index);
          const kind = riffCore.tracks.find((track) => track.index === index)?.kind ?? 'guitar';
          setPickedNeck(kind);
        },
      }
    : riffCore;
  const trackKindNow: DifficultyKind = riff.tracks.find((track) => track.index === riff.trackIndex)?.kind ?? 'guitar';
  if (riff.tracks.length > 0 && trackKindNow !== songKind) setSongKind(trackKindNow);
  const chartKind = riffGame && gameOpen && riff.chart ? (riff.chart.kit === 'drums' ? 'drums' : riff.chart.kit === 'keys' ? 'keys' : riff.chart.bass ? 'bass' : 'guitar') : null;
  const instrumentNow: DifficultyKind = chartKind ?? neckChoice;
  const bassNeck = instrumentNow === 'bass';
  const drumKit = instrumentNow === 'drums';
  // TECLADO (keys.ts, usuario 2026-11-18; suelto desde el 2026-11-20): con JUGAR y una pista de
  // piano/órgano/sinte el mástil es un teclado (KeysNeck), una columna por semitono del nivel; suelto (sin
  // partida) usa el rango por defecto de Teclado Principiante (Do4-Do5). Se toca como la batería: cada
  // tecla o dedo es su propio golpe, sin hammer ni pull-off. El zurdo no lo refleja (un piano no se da la
  // vuelta).
  const keysRule = instrumentNow === 'keys' ? riff.profile?.keys ?? RIFF_LEVELS['teclado-principiante'].keys ?? null : null;
  const keysKit = keysRule !== null;
  const bassRef = useRef(bassNeck);
  useEffect(() => { bassRef.current = bassNeck; }, [bassNeck]);
  const fullFretCount = startFret === 0 ? fullEndFret : fullEndFret - startFret + 1;
  // Teclado (keys.ts): una columna por tecla, también si son más que los trastes del mástil (Avanzado: 21).
  // Batería suelta (sin partida): se estira a sus 6 pads (0-5) igual que la instancia dedicada de antes.
  const stretchTo = startFret !== 0 ? null
    : drumKit ? DRUM_MAX_FRET
    : riffGame && gameOpen && riff.profile && (riff.profile.maxFret < fullEndFret || riff.profile.keys) ? riff.profile.maxFret
    : null;
  const endFret = stretchTo ?? fullEndFret;
  const fretCount = startFret === 0 ? endFret : endFret - startFret + 1;
  // Modo afinar (opt-in vía `allowTuning`): despliega una clavija por cuerda a la izquierda del
  // nut, igual sistema que TuningBoard.tsx (arrastre circular -> cents -> MIDI fraccionario), pero
  // aquí guardado detrás de un botón ("AFINAR") en vez de siempre visible -- el mástil normal no
  // debe verse distinto en el resto del sitio. Mostrar las clavijas EMPUJA el tablero (`boardX`)
  // hacia la derecha para hacerles sitio real, en vez de superponerlas -- por eso `boardX` pasa de
  // constante a derivado de `showTuning`.
  // `<TuningPeg>`'s CSS (.tuning-peg/.tuning-peg-body/.tuning-peg-indicator) vive en
  // TuningBoardStyles() (TuningBoard.tsx), no aquí -- cualquier página que pase `allowTuning` debe
  // renderizar `<TuningBoardStyles />` también, o las clavijas saldrán sin estilo. sala-de-pruebas
  // ya lo hace (usa <TuningBoard /> en la misma página); si `allowTuning` se usa en otra página sin
  // ese componente, añadir `<TuningBoardStyles />` ahí también.
  const [showTuning, setShowTuning] = useState(false);
  const PEG_AREA_WIDTH = 66;
  const PEG_X = 24;
  // Juego (JUGAR activado): el traste 0 tiene una casilla TAN ANCHA como las demás (petición del
  // usuario: casillas iguales y aprovechar todo el espacio), en vez de la franja estrecha de antes
  // de la cejuela. Casilla del 0 + tablero ocupan lo mismo que el mástil normal con sus márgenes,
  // con solo un borde pequeño (así el mástil sigue midiendo lo mismo en pantalla). Sin clavijas.
  const gameLayout = (drumKit || keysKit || (!!riffGame && gameOpen)) && startFret === 0;
  const pegsShown = !!allowTuning && showTuning && !gameLayout;
  const GAME_EDGE = 4;
  const fullBaseViewBoxWidth = 2 * 42 + 58 * fullFretCount;
  // Márgenes laterales del escenario del juego (ver el efecto de `bleed` más abajo).
  const [bleed, setBleed] = useState<{ left: number; right: number } | null>(null);
  // Alto de la ventana para el mástil alto. En el móvil la barra del navegador cambia el alto al
  // desplazarse: solo cuenta un cambio de más del 10 % o un cambio de ancho (girar el móvil).
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  useEffect(() => {
    let width = 0;
    const measure = () => {
      const height = window.innerHeight;
      setViewportHeight((old) => (old !== null && window.innerWidth === width && Math.abs(height - old) < old * 0.1 ? old : height));
      width = window.innerWidth;
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  // Móvil en vertical (o ventana estrecha) con un nivel de 6 trastes (0-5): las casillas quedan muy
  // bajas para tocarlas con el dedo, así que el mástil crece (petición del usuario, 2026-11-05: el
  // doble; 2026-11-09: 4 veces, luego 3, y al final RESPONSIVE): su madera mide el TALL_NECK_SCREEN
  // (40 %) del alto de la ventana, sin bajar del alto normal, y debajo siguen cabiendo SALIR y PAUSA.
  // Solo cambia la altura: cuerdas, carriles y toque salen de `stringGap`.
  // Modo estrecho = el mástil ENTERO no cabe (el mismo criterio que el aviso de pantalla pequeña;
  // antes era un umbral propio de 600 px, y entre 588 y 600 salía el mástil alto aunque cabían todos
  // los niveles, usuario 2026-11-09).
  const narrowNeck = gameLayout && riff.hostWidth !== null && !riff.fitsFullNeck;
  const tallNeck = narrowNeck && fretCount === 5;
  const neckPixelWidth = riff.hostWidth ?? 0;
  // En VERTICAL (más alto que ancho), 10 px de pantalla menos (usuario, 2026-11-19).
  const portraitTrim = viewportHeight !== null && viewportHeight > neckPixelWidth ? TALL_NECK_PORTRAIT_TRIM_PX : 0;
  // Batería fuera del mástil alto (pantalla ancha): la tabla toma el alto que pide su proporción (columna ×
  // DRUM_BOARD_PER_COLUMN), así el dibujo sale igual de grande que al final del modo estrecho (DRUM_NECK_MAX_PX)
  // en vez de quedarse en el alto del mástil de guitarra (usuario, 2026-11-20: "muy pequeña en pantalla grande").
  const drumBoardHeight = drumKit && gameLayout ? DRUM_BOARD_PER_COLUMN * (fullBaseViewBoxWidth - 2 * GAME_EDGE) / (fretCount + 1) : 0;
  const boardHeight = tallNeck && viewportHeight !== null && neckPixelWidth > 0
    ? Math.max(BASE_BOARD_HEIGHT, ((TALL_NECK_SCREEN * viewportHeight - portraitTrim) * fullBaseViewBoxWidth) / neckPixelWidth)
    : Math.max(BASE_BOARD_HEIGHT, drumBoardHeight);
  // BATERÍA en la partida (usuario, 2026-11-20, con la captura de la batería MIDI: "siempre esta proporción,
  // distribución y tamaño de los elementos", sin cambiar el alto del mástil): cada columna mide como mucho lo
  // que en la batería MIDI suelta para ese alto de tabla (`DRUM_BOARD_PER_COLUMN` columnas de alto por una de
  // ancho). En pantalla ancha el mástil de batería sale más ESTRECHO (y centrado; la autopista lo sigue) en vez
  // de con columnas anchas y la batería aplastada; en el móvil en vertical (mástil alto) ya cabe a lo ancho.
  const drumCol = Math.min((fullBaseViewBoxWidth - 2 * GAME_EDGE) / (fretCount + 1), boardHeight / DRUM_BOARD_PER_COLUMN);
  const baseViewBoxWidth = drumKit && gameLayout ? 2 * GAME_EDGE + drumCol * (fretCount + 1) : fullBaseViewBoxWidth;
  // Cuánto del ancho normal ocupa entonces el mástil de batería (1 = todo).
  const drumWidthScale = baseViewBoxWidth / fullBaseViewBoxWidth;
  // Estirado: el mismo ancho total de tablero con menos trastes.
  const fretWidth = gameLayout ? (baseViewBoxWidth - 2 * GAME_EDGE) / (fretCount + 1) : (58 * fullFretCount) / fretCount;
  const openWidth = gameLayout ? fretWidth : null;
  const boardX = gameLayout ? GAME_EDGE + fretWidth : 42 + (pegsShown ? PEG_AREA_WIDTH : 0);
  // Borde izquierdo del tablero dibujado (con la casilla del 0 en el juego).
  const boardLeftEdge = boardX - (openWidth ?? 0);
  // Juego en vertical / ventana estrecha (el mismo umbral que el mástil alto, cualquier nivel;
  // petición del usuario, 2026-11-09): sin números de traste bajo el mástil, mástil y barra MIDI más
  // juntos, y al empezar SALIR/PAUSA quedan a 2 px del borde inferior de la pantalla (placeGame).
  const compactGame = narrowNeck;
  const stringGap = boardHeight / 5;
  // Modo zurdo (opt-in vía `allowLeftHanded`): invierte el mástil SOLO en el eje X -- la cuerda
  // (eje Y) nunca cambia de orden. `drawX` es la única función que conoce la inversión: toda
  // coordenada X que se DIBUJA pasa por aquí (mirror respecto al centro del tablero), y el resto
  // del componente (getPos, fretMarkerX, etc.) sigue razonando en coordenadas "lógicas" normales,
  // ajeno a la mano -- ver el comentario en `getPos` para el lado simétrico (puntero -> lógico).
  const [lefty, setLefty] = useState(false);
  const centerX = (boardLeftEdge + boardX + fretCount * fretWidth) / 2;
  const drawX = (x: number) => (lefty && !keysKit ? 2 * centerX - x : x);
  const fretX = (fret: number) => drawX(fretMarkerX(boardX, fretWidth, startFret, fret, openWidth));
  // La batería y el teclado no llevan números romanos (no hay trastes): solo los números 0-5 debajo.
  const allRomanFrets = drumKit || keysKit ? [] : Object.keys(romanFretLabels)
    .map(Number)
    .filter((fret) => fret >= startFret && fret <= endFret);
  const romansGoAbove = !!fretLabels && allRomanFrets.length > 0;
  const boardY = (fretLabelsAbove || romansGoAbove) ? 44 : 28;
  const boardWidth = fretCount * fretWidth;
  const bottomLabelY = boardY + boardHeight + 30;
  const showFretNumbers = !!fretLabels && !compactGame;
  const hasBottomLabels = showFretNumbers || (allRomanFrets.length > 0 && !romansGoAbove);
  // `2 * boardX` (no `boardX + 42`) a propósito: el margen derecho debe ser SIMÉTRICO al
  // izquierdo para que nada se recorte al reflejar en modo zurdo (drawX refleja respecto al
  // centro del TABLERO, no del viewBox -- cualquier elemento a la izquierda de boardX, como las
  // clavijas o el marcador de cuerda al aire, necesita el mismo hueco disponible a la derecha tras
  // el mirror). Cuando `boardX` es la constante de siempre (42, sin clavijas) esto da exactamente
  // el mismo resultado que antes (42 + boardWidth + 42), así que no cambia nada para el resto de
  // usos de este componente -- solo importa cuando `boardX` crece por `showTuning`.
  const viewBoxWidth = gameLayout ? baseViewBoxWidth : 2 * boardX + boardWidth;
  // `viewBoxWidth` crece cuando aparecen las clavijas, pero el <svg> seguía fijo en `width: 100%`
  // de su contenedor -- más unidades lógicas en el MISMO ancho en píxeles significa que CADA
  // unidad ocupa menos píxeles, así que todo el mástil (trastes, puntos, letras) se encogía al
  // desplegar las clavijas. Bug real reportado por el usuario: "NO debe hacer eso, debe
  // desplazarse". La escala (píxeles por unidad) se define SOLO por `boardWidth`+el margen base de
  // 42 -- `baseViewBoxWidth` -- igual en todos los demás usos de este componente (sin clavijas).
  // Si el `<svg>` crece en ANCHO EN PANTALLA en la misma proporción que crece `viewBoxWidth`, esa
  // escala se mantiene constante: el mástil no se encoge, el widget entero se ENSANCHA hacia donde
  // haga falta (izquierda en diestro, derecha en zurdo -- más precisamente, el NUT se desplaza
  // dentro de ese ancho mayor, ver el comentario de `boardX`/`drawX`). El contenedor con scroll
  // (`.reduced-fretboard-wrap` + `HorizontalScrollbar`, más abajo) absorbe ese extra ancho sin
  // provocar overflow de la PÁGINA -- cuando no hace falta más ancho que el contenedor (caso
  // normal, o pantallas anchas), `HorizontalScrollbar` simplemente no se muestra (ya se comporta
  // así en el resto del sitio).
  const svgWidthPercent = (viewBoxWidth / baseViewBoxWidth) * 100;
  // Con JUGAR abierto, lo justo bajo los números de traste (usuario, 2026-11-15: barra MIDI lo más
  // pegada posible, para que al empezar quepan PAUSA y KEYBOARD en pantalla).
  const viewBoxHeight = hasBottomLabels ? bottomLabelY + (gameLayout ? 5 : 18) : boardY + boardHeight + (compactGame ? 6 : 20);
  const [cents, setCents] = useState<Record<number, number>>(zeroedCents());
  const centsRef = useRef(cents);
  useEffect(() => { centsRef.current = cents; }, [cents]);
  // Juego: al cargar una canción con JUGAR abierto, el mástil toma su afinación ORIGINAL (Do# en
  // Black Gilmur, Mi♭ en Iron Rain...; petición del usuario). El chart sigue en posiciones de la
  // estándar y suena con `soundOffset` (chart.ts), así que mástil y canción coinciden. Se aplica
  // una vez por canción (ajuste de estado durante el render, no en un efecto): luego se puede
  // reafinar a mano con el botón de afinación hasta empezar.
  // El bajo: su octava de `soundOffset` no es afinación; el mástil solo toma lo que esté bajado.
  const songTuningShift = (riff.chart?.soundOffset ?? 0) + (riff.chart?.bass ? 12 : 0);
  const songTuningKey = riffGame && gameOpen && riff.chart && song ? `${song.id}:${songTuningShift}` : null;
  const [appliedSongTuning, setAppliedSongTuning] = useState<string | null>(null);
  if (songTuningKey !== appliedSongTuning) {
    setAppliedSongTuning(songTuningKey);
    if (songTuningKey && riff.chart) {
      setCents(centsForPreset({ id: 'song', label: '', shiftSemitones: songTuningShift }));
    }
  }
  // Bajo: sus 4 cuerdas (6-3) en las filas de las 4 cuerdas de Difícil (BASS_LANES).
  const rowY = (row: number) => boardY + (row - 1) * stringGap;
  const neckStrings = bassNeck ? BASS_STRINGS : GUITAR_STRINGS;
  const stringY = (string: number) => (bassNeck ? rowY(BASS_LANES.get(string) ?? 3.5) : rowY(string));
  // Altura a la que caen las notas del juego (lanes.ts, decisión del usuario): en Experto, su
  // cuerda real; en el resto de niveles, sus cuerdas repartidas por el centro del mástil (los dos Mi
  // quedan para Experto). Mientras se juega (o en pausa) el mástil se TOCA igual: cada cuerda del
  // nivel tiene su franja, que llega hasta la mitad del camino a la vecina (ver getPos).
  // Experto con un instrumento que no tiene 6 cuerdas: las suyas, repartidas por el mástil.
  const laneStrings = riff.profile ? (riff.profile.freeStrings ? [6] : riff.profile.strings) : riff.chart?.strings;
  const lanes = riffGame && gameOpen && laneStrings ? laneRows(laneStrings) : null;
  const laneY = (string: number) => {
    const row = lanes?.get(string);
    return row === undefined ? stringY(string) : boardY + (row - 1) * stringGap;
  };
  const liveLanes = lanes && (riff.playing || riff.paused) ? lanes : null;
  const touchY = (string: number) => (liveLanes?.has(string) ? laneY(string) : stringY(string));
  // Sin deps a propósito: se republica en cada render (zurdo, clavijas y tamaño cambian `fretX`).
  // La publica siempre en `localGeometryRef` (la usa la autopista del juego) y, si la pasan, también
  // en la prop `geometryRef`.
  const localGeometryRef = useRef<FretboardGeometry | null>(null);
  const passedFrets = new Set(guideDots.map((d) => d.fret));
  const mergedGuideDots = [
    ...guideDots.filter((d) => d.fret >= startFret && d.fret <= endFret),
    ...[3, 5, 7, 9, 12]
      .filter((f) => f >= startFret && f <= endFret && !passedFrets.has(f))
      .map((f) => ({ fret: f })),
  ];

  // Audio interaction
  const svgRef = useRef<SVGSVGElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const ptHeldRef = useRef(new Map<number, { string: number; fret: number; midi: number }>());
  const ptStringVoiceRef = useRef(new Map<number, { pid: number; voiceId: number }>());
  // Marcas de las notas pulsadas (ver PressMarks): con ratón/dedo y con el teclado.
  const ptMarksRef = useRef<((list: MarkPos[]) => void) | null>(null);
  const kbMarksRef = useRef<((list: MarkPos[]) => void) | null>(null);
  const [volume, setVolume] = useState(1.0);
  const [kbMode, setKbMode] = useState(false);
  const [kbRange, setKbRange] = useState<'lower' | 'upper'>('lower');
  const [paintMode, setPaintMode] = useState(false);
  const { marks, toggleMark } = useNoteMarks();
  const practice = useFretboardPractice(practiceExercises);
  const registerPracticeNote = practice.registerNote;
  // Cada nota que SUENA pasa por aquí: la cuenta el modo práctica y, si hay `onNoteEvent` (juego
  // tipo Rocksmith, ver app/lib/riff), este devuelve el volumen relativo con el que debe sonar.
  // Ref para poder llamarlo desde el useEffect del teclado sin cierres viejos.
  const onNoteEventRef = useRef(onNoteEvent);
  useEffect(() => { onNoteEventRef.current = onNoteEvent; }, [onNoteEvent]);
  // Juego tipo Rocksmith (prop `riffGame`). `gameOpen` = panel de "JUGAR" desplegado y autopista
  // visible; la partida en sí la arranca "Empezar".
  const riffNoteEvent = riff.game.onNoteEvent;
  // Durante la partida el mástil no suena (ver RiffSession.judge); también la nota a la que vuelve
  // una cuerda al arrastrar el dedo a otra, que no pasa por emitNoteEvent.
  const riffPlayingRef = useRef(false);
  useEffect(() => { riffPlayingRef.current = riff.playing; }, [riff.playing]);
  // BATERÍA (app/lib/riff/drums.ts, usuario 2026-11-16): con JUGAR y la pista de batería, el mástil es una
  // batería de 6 pads (columnas 0-5) que funciona como un TECLADO: cada tecla o dedo es un golpe propio,
  // sin hammer-on ni pull-off, y lo que se toca a la vez suena a la vez. Golpes con tecla o dedo pulsados:
  // `drumKeysRef` (tecla -> pad) y `drumPtRef` (puntero -> pad), para "mantener" (autoHold) y el slide.
  const drumKitRef = useRef(drumKit);
  // Solo en el cliente (la batería sale tras abrir JUGAR): en pantallas táctiles, sin las teclas.
  const touchOnlyScreen = drumKit && typeof window !== 'undefined' && isTouchOnly();
  const drumKeysRef = useRef(new Map<string, number>());
  const drumPtRef = useRef(new Map<number, number>());
  useEffect(() => {
    drumKitRef.current = drumKit;
    drumKeysRef.current.clear();
    drumPtRef.current.clear();
    kbMarksRef.current?.([]);
    ptMarksRef.current?.([]);
  }, [drumKit]);
  // Teclado: tecla física -> columna, puntero -> columna, y la voz que suena fuera de partida.
  const keysKitRef = useRef<{ low: number; high: number } | null>(null);
  useEffect(() => {
    keysKitRef.current = keysRule ? { low: keysRule.low, high: keysRule.high } : null;
  }, [keysRule]);
  const keysKeysRef = useRef(new Map<string, number>());
  const keysPtRef = useRef(new Map<number, number>());
  const keysVoiceRef = useRef(new Map<string, number>());
  const syncKeysMarks = useCallback(() => {
    const all = [...new Set([...keysKeysRef.current.values(), ...keysPtRef.current.values()])].map((fret) => ({ string: 6, fret }));
    kbMarksRef.current?.(all);
    ptMarksRef.current?.(all);
  }, []);
  // Suena (fuera de partida, o en pausa) con la voz del MiniKeyboard; jugando, `gain` es 0.
  const startKeyVoice = useCallback((id: string, midi: number, gain: number) => {
    const level = volumeRef.current * gain;
    if (level <= 0) return;
    void playNote(midi, true, level).then((voice) => {
      const old = keysVoiceRef.current.get(id);
      if (old !== undefined && old >= 0) releaseNote(old);
      if (voice >= 0) keysVoiceRef.current.set(id, voice);
    });
  }, []);
  const stopKeyVoice = useCallback((id: string) => {
    const voice = keysVoiceRef.current.get(id);
    keysVoiceRef.current.delete(id);
    if (voice !== undefined && voice >= 0) releaseNote(voice);
  }, []);
  useEffect(() => {
    keysKeysRef.current.clear();
    keysPtRef.current.clear();
    for (const voice of keysVoiceRef.current.values()) if (voice >= 0) releaseNote(voice);
    keysVoiceRef.current.clear();
    kbMarksRef.current?.([]);
    ptMarksRef.current?.([]);
  }, [keysKit]);
  const syncDrumMarks = useCallback(() => {
    kbMarksRef.current?.([...new Set(drumKeysRef.current.values())].map((fret) => ({ string: 6, fret })));
    ptMarksRef.current?.([...new Set(drumPtRef.current.values())].map((fret) => ({ string: 6, fret })));
  }, []);
  // Teclado en los niveles de 2 y 3 cuerdas (usuario, 2026-11-14): las filas de teclas de cuerdas que el
  // nivel no tiene, por ENCIMA de su cuerda más aguda, cuentan como esa cuerda, con su mismo traste (2
  // cuerdas: las filas Q y de números tocan la La; 3 cuerdas: la de números toca la Re). Así cada mano
  // tiene más filas cómodas. El resto de niveles, igual que siempre.
  const levelStrings = riffGame && gameOpen && riff.profile && !riff.profile.freeStrings ? riff.profile.strings : null;
  const kbTopString = levelStrings && (levelStrings.length === 2 || levelStrings.length === 3) ? Math.min(...levelStrings) : null;
  const kbTopStringRef = useRef<number | null>(null);
  useEffect(() => { kbTopStringRef.current = kbTopString; }, [kbTopString]);
  // Partida en curso: MAIkael no se abre con un toque sin querer (petición del usuario).
  useEffect(() => {
    if (!riffGame) return;
    setGameInProgress(riff.playing);
    return () => setGameInProgress(false);
  }, [riffGame, riff.playing]);
  const emitNoteEvent = useCallback((ev: PracticeNoteEvent): number => {
    registerPracticeNote(ev);
    const external = onNoteEventRef.current?.(ev) ?? 1;
    return external * (riffNoteEvent(ev) ?? 1);
  }, [registerPracticeNote, riffNoteEvent]);
  // Partida en marcha o en pausa (no terminada).
  const riffInGame = !!riffGame && gameOpen && (riff.playing || riff.paused);
  // Barra del mástil con JUGAR abierto / con la partida corriendo (cuenta atrás o tocando).
  const gameOpenBar = !!riffGame && gameOpen;
  const gamePlayingBar = gameOpenBar && riff.playing;
  // Panel de ajustes ENCIMA del mástil (petición del usuario): centrado sobre el <svg>, sin salirse
  // por arriba del escenario (en móvil el mástil es bajito y el panel puede ser más alto).
  const overlayRef = useRef<HTMLDivElement>(null);
  const [overlayTop, setOverlayTop] = useState<number | null>(null);
  const overlayOpen = !!riffGame && gameOpen && !riff.playing;
  // Pantallas táctiles y ventanas estrechas (< BLEED_MAX_VIEWPORT, también con ratón) con JUGAR abierto
  // (petición del usuario, 2026-11-09): el escenario (autopista + mástil) se sale de los márgenes de la
  // página hasta donde lo permite el primer antepasado que recorta (overflow distinto de visible), así el
  // mástil llega casi a los bordes de la pantalla, en vertical y en horizontal. Se mide el HOST (que no
  // cambia con estos márgenes): sin bucles. Se decide en cada medida (al cambiar el tamaño de la ventana).
  const bleedWanted = gameLayout;
  useLayoutEffect(() => {
    if (!bleedWanted) return;
    const measure = () => {
      const host = hostRef.current;
      if (!host) return;
      if (!isTouchOnly() && window.innerWidth >= BLEED_MAX_VIEWPORT) {
        setBleed(null);
        return;
      }
      const rect = host.getBoundingClientRect();
      let left = 0;
      let right = document.documentElement.clientWidth;
      for (let el = host.parentElement; el && el !== document.documentElement; el = el.parentElement) {
        if (getComputedStyle(el).overflowX === 'visible') continue;
        const box = el.getBoundingClientRect();
        left = Math.max(left, box.left + el.clientLeft);
        right = Math.min(right, box.left + el.clientLeft + el.clientWidth);
      }
      const next = { left: Math.max(0, Math.floor(rect.left - left)), right: Math.max(0, Math.floor(right - rect.right)) };
      setBleed((old) => (old && old.left === next.left && old.right === next.right ? old : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (hostRef.current) observer.observe(hostRef.current);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [bleedWanted]);
  useLayoutEffect(() => {
    if (!overlayOpen) return;
    const place = () => {
      const stage = stageRef.current;
      const svg = svgRef.current;
      const overlay = overlayRef.current;
      if (!stage || !svg || !overlay) return;
      const svgRect = svg.getBoundingClientRect();
      const svgTop = svgRect.top - stage.getBoundingClientRect().top;
      // Centrado sobre el mástil; si es más alto que él (la mesa de sonido), sube sobre el carril libre para no
      // pasar del borde inferior del mástil, donde la barra MIDI lo taparía.
      const center = Math.min(svgTop + svgRect.height / 2, svgTop + svgRect.height - overlay.offsetHeight / 2);
      setOverlayTop(Math.max(overlay.offsetHeight / 2 + 4, center));
    };
    place();
    const observer = new ResizeObserver(place);
    if (stageRef.current) observer.observe(stageRef.current);
    if (overlayRef.current) observer.observe(overlayRef.current);
    window.addEventListener('resize', place);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [overlayOpen]);
  // Flecha hacia el botón KEYBOARD (petición del usuario): con JUGAR activado y el teclado aún sin
  // activar, en la fila de los números de traste justo encima del botón. Se mide el botón (su
  // centro) y la fila de los números (bottomLabelY) respecto al host, y se vuelve a medir si cambia
  // el tamaño de algo o la barra (al empezar la partida aparece PAUSA y el botón se mueve).
  // Con sitio entre los números de traste y la barra, la flecha baja y lleva encima el mensaje "Usa
  // teclado" (petición del usuario, 2026-11-03: sin invadir el mástil ni tapar números); `top` es entonces
  // el BORDE INFERIOR del bloque, 4 px por encima del botón. Sin sitio, la flecha sola en la fila de números.
  // Con JUGAR la barra va pegada a los números (usuario, 2026-11-15) y casi nunca hay hueco encima:
  // entonces "◀ Usa teclado" va A LA DERECHA de la barra (KEYBOARD es su último botón en el juego),
  // centrado en el botón; si tampoco cabe ahí, la flecha sola en la fila de números.
  const [kbArrow, setKbArrow] = useState<{ left: number; top: number; hint: boolean; side?: boolean } | null>(null);
  const kbArrowWanted = !!riffGame && gameOpen && !kbMode;
  useLayoutEffect(() => {
    if (!kbArrowWanted) return;
    const place = () => {
      const host = hostRef.current;
      const svg = svgRef.current;
      const button = host?.querySelector<HTMLElement>('.midi-kb-toggle');
      const ctm = svg?.getScreenCTM();
      if (!host || !svg || !button || !ctm) return;
      const hostRect = host.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      if (buttonRect.width === 0) {
        setKbArrow(null);
        return;
      }
      const left = buttonRect.left + buttonRect.width / 2 - hostRect.left;
      const numbersBottom = host.querySelector('.reduced-fret-number')?.getBoundingClientRect().bottom;
      if (numbersBottom !== undefined && buttonRect.top - numbersBottom >= KB_HINT_MIN_GAP) {
        setKbArrow({ left, top: buttonRect.top - 4 - hostRect.top, hint: true });
        return;
      }
      const pillRect = host.querySelector('.midi-float-pill')?.getBoundingClientRect();
      if (pillRect && pillRect.right + 6 + KB_SIDE_HINT_WIDTH <= Math.min(hostRect.right, document.documentElement.clientWidth)) {
        setKbArrow({ left: pillRect.right + 6 - hostRect.left, top: buttonRect.top + buttonRect.height / 2 - hostRect.top, hint: true, side: true });
        return;
      }
      const rowY = ctm.d * (bottomLabelY - 5) + ctm.f;
      setKbArrow({ left, top: rowY - hostRect.top, hint: false });
    };
    place();
    const observer = new ResizeObserver(place);
    if (hostRef.current) observer.observe(hostRef.current);
    const pill = hostRef.current?.querySelector('.midi-float-pill');
    if (pill) observer.observe(pill);
    window.addEventListener('resize', place);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [kbArrowWanted, bottomLabelY, riff.playing, riff.paused]);
  // Ajustes de la partida: delante del juego mientras no se toca; se pliegan al empezar o
  // continuar, y se despliegan solos al pausar o terminar.
  const settingsOpen = !riff.playing;
  function toggleGame() {
    // Cerrar JUGAR para la partida y sale de la partida tutorial si la había.
    if (gameOpen) {
      riff.exitTutorial();
      riff.closeSoundCheck();
    }
    else {
      // Sus botones desaparecen con JUGAR abierto: si se quedaran encendidos no se podrían apagar.
      metr.turnOff();
      setShowTuning(false);
      setPaintMode(false);
    }
    setGameOpen((open) => !open);
  }
  // Una sola partida abierta en la página (mástil y batería suelta de la Sala de pruebas): abrir JUGAR aquí
  // cierra la de los demás, por el mismo camino que SALIR.
  const [gameId] = useState(() => Symbol('juego'));
  const closeGameRef = useRef<() => void>(() => {});
  useEffect(() => {
    closeGameRef.current = () => {
      if (!gameOpen) return;
      riff.exitTutorial();
      setGameOpen(false);
    };
  });
  useEffect(() => {
    if (gameOpen) claimOpenGame(gameId);
  }, [gameOpen, gameId]);
  useEffect(() => onOpenGameClaim((owner) => { if (owner !== gameId) closeGameRef.current(); }), [gameId]);
  const showHighway = !!riffGame && gameOpen && !riff.narrow && !!riff.chart;

  useEffect(() => {
    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(() => preloadSamples());
      return () => cancelIdleCallback(id);
    }
    const id = window.setTimeout(() => preloadSamples(), 300);
    return () => window.clearTimeout(id);
  }, []);

  const kbKeysHeldRef = useRef(new Map<string, { string: number; fret: number; midi: number }>());
  const kbStringVoiceRef = useRef(new Map<number, { code: string; voiceId: number }>());
  useEffect(() => {
    heldPositionsRef.current = () => {
      const held: { string: number; fret: number }[] = [];
      for (const { code } of kbStringVoiceRef.current.values()) {
        const entry = kbKeysHeldRef.current.get(code);
        if (entry) held.push({ string: entry.string, fret: entry.fret });
      }
      for (const { pid } of ptStringVoiceRef.current.values()) {
        const entry = ptHeldRef.current.get(pid);
        if (entry) held.push({ string: entry.string, fret: entry.fret });
      }
      // Batería: los pads pulsados (cuerdas libres: basta el traste).
      for (const fret of new Set([...drumKeysRef.current.values(), ...drumPtRef.current.values()])) held.push({ string: 6, fret });
      // Teclado: las teclas pulsadas (blancas en la 6, negras en la 5).
      const keys = keysKitRef.current;
      if (keys) for (const fret of new Set([...keysKeysRef.current.values(), ...keysPtRef.current.values()])) held.push({ string: isBlackKey(keys.low + fret) ? 5 : 6, fret });
      return held;
    };
  }, []);
  const [kbGhostWarn, setKbGhostWarn] = useState(false);
  const volumeRef = useRef(volume);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  // Un golpe de un pad en el propio mástil (fuera de partida, o en pausa; jugando, `gain` es 0 y suena el
  // golpe de la canción al acertar, ver useRiffGame).
  const playDrumHit = useCallback((pad: number, gain: number) => {
    const level = volumeRef.current * gain;
    if (level <= 0) return;
    touchAudioContext();
    playDrumPad(pad, getAudioCurrentTime(), level * 0.64);
  }, []);
  const paintModeRef = useRef(paintMode);
  useEffect(() => { paintModeRef.current = paintMode; }, [paintMode]);
  // Sonido (opt-in vía `allowOverdrive`): 'clean' o 'overdrive', ver getOverdriveBus en
  // guitarAudioEngine.ts. Ref por el mismo motivo que volumeRef/paintModeRef.
  const [tone, setTone] = useState<GuitarTone>('clean');
  const toneRef = useRef<GuitarTone>(tone);
  // Bajo: todas las notas con su sonido (GuitarTone 'bass' en guitarAudioEngine.ts).
  useEffect(() => { toneRef.current = bassNeck ? 'bass' : tone; }, [tone, bassNeck]);
  const metr = useMetronome();
  useEffect(() => {
    if (!kbMode && !metr.on) return;
    function handleArrow(e: KeyboardEvent) {
      if (e.code === 'ArrowUp') { e.preventDefault(); setKbRange('upper'); }
      else if (e.code === 'ArrowDown') { e.preventDefault(); setKbRange('lower'); }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); metr.setBpm(b => Math.max(30, b - 5)); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); metr.setBpm(b => Math.min(100, b + 5)); }
    }
    window.addEventListener('keydown', handleArrow);
    return () => window.removeEventListener('keydown', handleArrow);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kbMode, metr.on]);
  useEffect(() => {
    if (!kbMode) return;
    // Modo zurdo: misma idea que `drawX` para el dibujo -- el mapa de teclado también se invierte
    // SOLO en el eje X (traste dentro de cada fila/cuerda), nunca cambia a qué cuerda apunta cada
    // tecla. `lefty` entra en las deps de este efecto (no un ref) a propósito: cambiar de mano
    // mientras se toca reinicia limpiamente las teclas mantenidas en vez de dejarlas sonando con el
    // mapa viejo -- comportamiento deseado, no un descuido.
    const range = bassNeck || drumKit ? 'lower' : kbRange;
    const activeMap = lefty
      ? (range === 'upper' ? FRETBOARD_KEYMAP_UPPER_LEFTY : FRETBOARD_KEYMAP_LEFTY)
      : (range === 'upper' ? FRETBOARD_KEYMAP_UPPER : FRETBOARD_KEYMAP);
    function getHighestOnString(stringNum: number) {
      let best: { code: string; entry: { string: number; fret: number; midi: number } } | null = null;
      for (const [code, entry] of kbKeysHeldRef.current) {
        if (entry.string === stringNum && (!best || entry.fret > best.entry.fret)) best = { code, entry };
      }
      return best;
    }
    function syncPositions() {
      const pos: { string: number; fret: number }[] = [];
      for (const [stringNum, { code }] of kbStringVoiceRef.current) {
        const entry = kbKeysHeldRef.current.get(code);
        if (entry) pos.push({ string: stringNum, fret: entry.fret });
      }
      kbMarksRef.current?.(pos);
      if (kbStringVoiceRef.current.size >= 3) setKbGhostWarn(false);
    }
    async function down(e: KeyboardEvent) {
      e.preventDefault();
      // Teclado (keys.ts): las teclas del MiniKeyboard (pianoKeymap.ts), llevadas a la octava del nivel.
      // BloqMayús en Mac llega "enganchada" (solo keydown o solo keyup): cada evento, una pulsación corta.
      if (keysKitRef.current) {
        if (isLatchingQuirk(e.code)) latchKey(e);
        else keyPress(e);
        return;
      }
      if (e.repeat || kbKeysHeldRef.current.has(e.code) || drumKeysRef.current.has(e.code)) return;
      // Batería: la tecla de la columna 0-5 de CUALQUIER fila es un golpe de ese pad, independiente. Zurdo: la
      // columna espejo (5 - columna). El mapa zurdo de la guitarra no vale aquí: lleva Z al traste 10.
      if (drumKitRef.current) {
        const key = FRETBOARD_KEYMAP[e.code];
        if (!key || key.fret > 5) return;
        const pad = lefty ? 5 - key.fret : key.fret;
        drumKeysRef.current.set(e.code, pad);
        setKbGhostWarn(drumKeysRef.current.size >= 3);
        syncDrumMarks();
        playDrumHit(pad, emitNoteEvent({ string: 6, fret: pad, kind: 'pluck', timeStamp: e.timeStamp }));
        return;
      }
      const raw = activeMap[e.code];
      if (!raw) return;
      const top = kbTopStringRef.current;
      const entry = top !== null && raw.string < top ? { string: top, fret: raw.fret, midi: OPEN_STRING_MIDI[top] + raw.fret } : raw;
      const cur = kbStringVoiceRef.current.get(entry.string);
      if (!cur && kbStringVoiceRef.current.size >= 3) return;
      if (paintModeRef.current) toggleMark(noteNameForFret(entry.string, entry.fret, centsRef.current[entry.string]));
      kbKeysHeldRef.current.set(e.code, entry);
      setKbGhostWarn(hasKeyboardGhosting(kbKeysHeldRef.current));
      if (!cur) {
        const gain = emitNoteEvent({ string: entry.string, fret: entry.fret, kind: 'pluck' , timeStamp: e.timeStamp });
        kbStringVoiceRef.current.set(entry.string, { code: e.code, voiceId: -1 });
        syncPositions();
        const id = await playNote(effectiveMidi(entry.string, entry.fret, centsRef.current[entry.string], bassRef.current), false, volumeRef.current * gain, toneRef.current);
        const sv = kbStringVoiceRef.current.get(entry.string);
        if (sv?.code === e.code) kbStringVoiceRef.current.set(entry.string, { code: e.code, voiceId: id });
        else releaseNote(id);
      } else {
        const curEntry = kbKeysHeldRef.current.get(cur.code);
        if (curEntry && entry.fret > curEntry.fret) {
          const gain = emitNoteEvent({ string: entry.string, fret: entry.fret, kind: 'hammer' , timeStamp: e.timeStamp });
          kbStringVoiceRef.current.set(entry.string, { code: e.code, voiceId: -1 });
          syncPositions();
          const id = await switchNote(cur.voiceId, effectiveMidi(entry.string, entry.fret, centsRef.current[entry.string], bassRef.current), false, volumeRef.current * gain, toneRef.current);
          const sv = kbStringVoiceRef.current.get(entry.string);
          if (sv?.code === e.code) kbStringVoiceRef.current.set(entry.string, { code: e.code, voiceId: id });
          else releaseNote(id);
        }
      }
    }
    function keyPress(e: KeyboardEvent) {
      const keys = keysKitRef.current;
      if (!keys || e.repeat || keysKeysRef.current.has(e.code)) return;
      let midi = PIANO_KEYMAP[e.code];
      if (midi === undefined) return;
      // Fila aguda (Q y números): vale por su NOTA EXACTA (la que suena), para gente pro; se ilumina la tecla
      // del trozo donde cae. Filas A y Z: la tecla del trozo, como siempre.
      const exactMidi = PIANO_TREBLE_CODES.has(e.code) ? midi : undefined;
      while (midi > keys.high) midi -= 12;
      while (midi < keys.low) midi += 12;
      if (midi > keys.high) return;
      const fret = midi - keys.low;
      keysKeysRef.current.set(e.code, fret);
      setKbGhostWarn(keysKeysRef.current.size >= 3);
      syncKeysMarks();
      const gain = emitNoteEvent({ string: isBlackKey(midi) ? 5 : 6, fret, kind: 'pluck', timeStamp: e.timeStamp, ...(exactMidi !== undefined ? { exactMidi } : {}) });
      startKeyVoice(`k:${e.code}`, exactMidi ?? midi, gain);
    }
    function keyRelease(code: string) {
      if (!keysKeysRef.current.delete(code)) return;
      setKbGhostWarn(keysKeysRef.current.size >= 3);
      syncKeysMarks();
      stopKeyVoice(`k:${code}`);
    }
    function latchKey(e: KeyboardEvent) {
      keyPress(e);
      window.setTimeout(() => keyRelease(e.code), LATCH_RELEASE_MS);
    }
    async function up(e: KeyboardEvent) {
      e.preventDefault();
      if (keysKitRef.current) {
        if (isLatchingQuirk(e.code)) latchKey(e);
        else keyRelease(e.code);
        return;
      }
      if (drumKeysRef.current.delete(e.code)) {
        setKbGhostWarn(drumKeysRef.current.size >= 3);
        syncDrumMarks();
        return;
      }
      const entry = kbKeysHeldRef.current.get(e.code);
      if (!entry) return;
      kbKeysHeldRef.current.delete(e.code);
      setKbGhostWarn(hasKeyboardGhosting(kbKeysHeldRef.current));
      const cur = kbStringVoiceRef.current.get(entry.string);
      if (!cur || cur.code !== e.code) return;
      const next = getHighestOnString(entry.string);
      if (next) {
        const gain = emitNoteEvent({ string: next.entry.string, fret: next.entry.fret, kind: 'pulloff' , timeStamp: e.timeStamp });
        kbStringVoiceRef.current.set(entry.string, { code: next.code, voiceId: -1 });
        syncPositions();
        const id = await switchNote(cur.voiceId, effectiveMidi(next.entry.string, next.entry.fret, centsRef.current[next.entry.string], bassRef.current), false, volumeRef.current * gain, toneRef.current);
        const sv = kbStringVoiceRef.current.get(entry.string);
        if (sv?.code === next.code) kbStringVoiceRef.current.set(entry.string, { code: next.code, voiceId: id });
        else releaseNote(id);
      } else {
        kbStringVoiceRef.current.delete(entry.string);
        syncPositions();
        if (cur.voiceId >= 0) releaseNote(cur.voiceId);
      }
    }
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      kbStringVoiceRef.current.forEach(({ voiceId }) => { if (voiceId >= 0) releaseNote(voiceId); });
      kbStringVoiceRef.current.clear();
      kbKeysHeldRef.current.clear();
      drumKeysRef.current.clear();
      for (const code of keysKeysRef.current.keys()) stopKeyVoice(`k:${code}`);
      keysKeysRef.current.clear();
      kbMarksRef.current?.([]);
      setKbGhostWarn(false);
    };
  }, [kbMode, kbRange, lefty, emitNoteEvent, playDrumHit, syncDrumMarks, bassNeck, drumKit, keysKit, syncKeysMarks, startKeyVoice, stopKeyVoice]);

  function getPos(e: React.PointerEvent<SVGSVGElement>, held?: { string: number; fret: number } | null): { string: number; fret: number } | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const coords = getSvgCoords(e, svg);
    if (!coords) return null;
    // Mirror es su propia inversa (reflejar dos veces = identidad) -- aplicarla UNA vez aquí sobre
    // la coordenada real del puntero convierte "dónde tocó la pantalla" en "qué posición lógica (no
    // volteada) representa eso", y el resto de esta función sigue funcionando exactamente igual que
    // en modo diestro, sin enterarse de `lefty` -- ver el comentario de `drawX` más arriba.
    const x = drawX(coords.x);
    const { y } = coords;

    // Bajo (fuera de la partida en curso): sus 4 filas, como los carriles de Difícil.
    const touchLanes = liveLanes ?? (bassNeck ? BASS_LANES : null);
    const halfGap = stringGap / 2;
    if (y < boardY - halfGap || y > boardY + boardHeight + halfGap) return null;
    const row = (y - boardY) / stringGap + 1;
    const string = touchLanes
      ? laneAt(touchLanes, row)
      : Math.max(1, Math.min(6, Math.round((y - boardY) / stringGap) + 1));

    let fret: number;
    if (x < boardX) {
      if (startFret !== 0 || x < boardX - (openWidth ?? 40)) return null;
      fret = 0;
    } else {
      const colIndex = Math.floor((x - boardX) / fretWidth);
      fret = startFret === 0 ? colIndex + 1 : startFret + colIndex;
      if (fret > endFret) return null;
    }

    if (!held) return { string, fret };
    const EXP = 0.18;
    const rawSF = (y - boardY) / stringGap;
    const rawFF = (x - boardX) / fretWidth;
    const heldLane = touchLanes?.get(held.string);
    const rStr = touchLanes
      ? (heldLane !== undefined && Math.abs(row - heldLane) <= Math.abs(row - touchLanes.get(string)!) + EXP ? held.string : string)
      : (Math.abs(rawSF - (held.string - 1)) < 0.5 + EXP ? held.string : string);
    const heldCol = startFret === 0 ? held.fret - 1 : held.fret - startFret;
    const rFret = held.fret === 0 ? (rawFF < EXP ? 0 : fret) : (Math.abs(rawFF - (heldCol + 0.5)) < 0.5 + EXP ? held.fret : fret);
    return { string: rStr, fret: rFret };
  }

  useEffect(() => () => {
    ptStringVoiceRef.current.forEach(({ voiceId }) => { if (voiceId >= 0) releaseNote(voiceId); });
    ptStringVoiceRef.current.clear();
    ptHeldRef.current.clear();
  }, []);
  function syncPt() {
    const pos: { string: number; fret: number }[] = [];
    for (const [strNum, { pid }] of ptStringVoiceRef.current) {
      const entry = ptHeldRef.current.get(pid);
      if (entry) pos.push({ string: strNum, fret: entry.fret });
    }
    ptMarksRef.current?.(pos);
  }
  function getHighestOnPtString(stringNum: number) {
    let best: { pid: number; midi: number } | null = null;
    for (const [pid, entry] of ptHeldRef.current) {
      if (entry.string === stringNum) {
        const bestEntry = best ? ptHeldRef.current.get(best.pid) : null;
        if (!bestEntry || entry.fret > bestEntry.fret) best = { pid, midi: entry.midi };
      }
    }
    return best;
  }
  async function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const pos = getPos(e);
    if (!pos) return;
    const svg = svgRef.current;
    if (!svg) return;
    svg.setPointerCapture(e.pointerId);
    // Teclado: la tecla bajo el dedo (las negras, arriba), cada dedo un golpe propio.
    if (keysGeo && keysKitRef.current) {
      const fret = keyUnder(e);
      if (fret === null) return;
      keysPtRef.current.set(e.pointerId, fret);
      syncKeysMarks();
      const midi = keysKitRef.current.low + fret;
      startKeyVoice(`p:${e.pointerId}`, midi, emitNoteEvent({ string: isBlackKey(midi) ? 5 : 6, fret, kind: 'pluck', timeStamp: e.timeStamp }));
      return;
    }
    // Batería: cada dedo, un golpe propio en la columna que toca (vale cualquier fila).
    if (drumKitRef.current) {
      if (pos.fret > 5) return;
      drumPtRef.current.set(e.pointerId, pos.fret);
      syncDrumMarks();
      playDrumHit(pos.fret, emitNoteEvent({ string: 6, fret: pos.fret, kind: 'pluck', timeStamp: e.timeStamp }));
      return;
    }
    if (paintMode) toggleMark(noteNameForFret(pos.string, pos.fret, centsRef.current[pos.string]));
    const midi = effectiveMidi(pos.string, pos.fret, centsRef.current[pos.string], bassRef.current);
    const cur = ptStringVoiceRef.current.get(pos.string);
    if (!cur) {
      if (ptStringVoiceRef.current.size >= 3) return;
      const gain = emitNoteEvent({ ...pos, kind: 'pluck' , timeStamp: e.timeStamp });
      ptHeldRef.current.set(e.pointerId, { string: pos.string, fret: pos.fret, midi });
      ptStringVoiceRef.current.set(pos.string, { pid: e.pointerId, voiceId: -1 });
      syncPt();
      const id = await playNote(midi, false, volumeRef.current * gain, toneRef.current);
      const sv = ptStringVoiceRef.current.get(pos.string);
      if (sv?.pid === e.pointerId) ptStringVoiceRef.current.set(pos.string, { pid: e.pointerId, voiceId: id });
      else releaseNote(id);
    } else {
      ptHeldRef.current.set(e.pointerId, { string: pos.string, fret: pos.fret, midi });
      const curEntry = ptHeldRef.current.get(cur.pid);
      if (curEntry && pos.fret > curEntry.fret) {
        const gain = emitNoteEvent({ ...pos, kind: 'hammer' , timeStamp: e.timeStamp });
        ptStringVoiceRef.current.set(pos.string, { pid: e.pointerId, voiceId: -1 });
        syncPt();
        const id = await switchNote(cur.voiceId, midi, false, volumeRef.current * gain, toneRef.current);
        const sv = ptStringVoiceRef.current.get(pos.string);
        if (sv?.pid === e.pointerId) ptStringVoiceRef.current.set(pos.string, { pid: e.pointerId, voiceId: id });
        else releaseNote(id);
      }
    }
  }
  // Teclado: qué tecla hay bajo el puntero (KeysNeck.keyAt).
  function keyUnder(e: React.PointerEvent<SVGSVGElement>): number | null {
    const svg = svgRef.current;
    if (!svg || !keysGeo) return null;
    const coords = getSvgCoords(e, svg);
    return coords ? keyAt(coords.x, coords.y, keysGeo) : null;
  }
  async function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    // Teclado: arrastrar a otra tecla es un SLIDE desde la anterior (solo cuenta a la vecina).
    const keyFrom = keysPtRef.current.get(e.pointerId);
    if (keyFrom !== undefined && keysKitRef.current) {
      const fret = keyUnder(e);
      if (fret === null || fret === keyFrom) return;
      keysPtRef.current.set(e.pointerId, fret);
      syncKeysMarks();
      const low = keysKitRef.current.low;
      const midi = low + fret;
      stopKeyVoice(`p:${e.pointerId}`);
      startKeyVoice(`p:${e.pointerId}`, midi, emitNoteEvent({ string: isBlackKey(midi) ? 5 : 6, fret, kind: 'slide', from: { string: isBlackKey(low + keyFrom) ? 5 : 6, fret: keyFrom }, timeStamp: e.timeStamp }));
      return;
    }
    // Batería: arrastrar a otra columna es un SLIDE desde la anterior (solo cuenta a la vecina).
    const drumFrom = drumPtRef.current.get(e.pointerId);
    if (drumFrom !== undefined) {
      const pos = getPos(e);
      if (!pos || pos.fret > 5 || pos.fret === drumFrom) return;
      drumPtRef.current.set(e.pointerId, pos.fret);
      syncDrumMarks();
      playDrumHit(pos.fret, emitNoteEvent({ string: 6, fret: pos.fret, kind: 'slide', from: { string: 6, fret: drumFrom }, timeStamp: e.timeStamp }));
      return;
    }
    const curEntry = ptHeldRef.current.get(e.pointerId);
    if (!curEntry) return;
    const pos = getPos(e, { string: curEntry.string, fret: curEntry.fret });
    if (!pos) return;
    if (pos.string === curEntry.string && pos.fret === curEntry.fret) return;
    const midi = effectiveMidi(pos.string, pos.fret, centsRef.current[pos.string], bassRef.current);
    if (pos.string === curEntry.string) {
      ptHeldRef.current.set(e.pointerId, { string: pos.string, fret: pos.fret, midi });
      const sv = ptStringVoiceRef.current.get(pos.string);
      if (sv?.pid === e.pointerId) {
        const gain = emitNoteEvent({ ...pos, kind: 'slide', from: curEntry , timeStamp: e.timeStamp });
        syncPt();
        const id = await switchNote(sv.voiceId, midi, false, volumeRef.current * gain, toneRef.current);
        const sv2 = ptStringVoiceRef.current.get(pos.string);
        if (sv2?.pid === e.pointerId) ptStringVoiceRef.current.set(pos.string, { pid: e.pointerId, voiceId: id });
        else releaseNote(id);
      } else if (sv) {
        const activeEntry = ptHeldRef.current.get(sv.pid);
        if (activeEntry && pos.fret > activeEntry.fret) {
          const gain = emitNoteEvent({ ...pos, kind: 'slide', from: curEntry , timeStamp: e.timeStamp });
          ptStringVoiceRef.current.set(pos.string, { pid: e.pointerId, voiceId: -1 });
          syncPt();
          const id = await switchNote(sv.voiceId, midi, false, volumeRef.current * gain, toneRef.current);
          const sv2 = ptStringVoiceRef.current.get(pos.string);
          if (sv2?.pid === e.pointerId) ptStringVoiceRef.current.set(pos.string, { pid: e.pointerId, voiceId: id });
          else releaseNote(id);
        }
      }
    } else {
      const oldStr = curEntry.string;
      ptHeldRef.current.set(e.pointerId, { string: pos.string, fret: pos.fret, midi });
      const oldVoice = ptStringVoiceRef.current.get(oldStr);
      if (oldVoice?.pid === e.pointerId) {
        const next = getHighestOnPtString(oldStr);
        if (next) {
          ptStringVoiceRef.current.set(oldStr, { pid: next.pid, voiceId: -1 });
          const id = await switchNote(oldVoice.voiceId, next.midi, false, volumeRef.current * (riffPlayingRef.current ? 0 : 1), toneRef.current);
          const sv = ptStringVoiceRef.current.get(oldStr);
          if (sv?.pid === next.pid) ptStringVoiceRef.current.set(oldStr, { pid: next.pid, voiceId: id });
          else releaseNote(id);
        } else {
          ptStringVoiceRef.current.delete(oldStr);
          if (oldVoice.voiceId >= 0) releaseNote(oldVoice.voiceId);
        }
      }
      const newVoice = ptStringVoiceRef.current.get(pos.string);
      if (!newVoice && ptStringVoiceRef.current.size < 3) {
        const gain = emitNoteEvent({ ...pos, kind: 'slide', from: curEntry , timeStamp: e.timeStamp });
        ptStringVoiceRef.current.set(pos.string, { pid: e.pointerId, voiceId: -1 });
        syncPt();
        const id = await playNote(midi, false, volumeRef.current * gain, toneRef.current);
        const sv = ptStringVoiceRef.current.get(pos.string);
        if (sv?.pid === e.pointerId) ptStringVoiceRef.current.set(pos.string, { pid: e.pointerId, voiceId: id });
        else releaseNote(id);
      } else if (newVoice) {
        const activeEntry = ptHeldRef.current.get(newVoice.pid);
        if (activeEntry && pos.fret > activeEntry.fret) {
          const gain = emitNoteEvent({ ...pos, kind: 'slide', from: curEntry , timeStamp: e.timeStamp });
          ptStringVoiceRef.current.set(pos.string, { pid: e.pointerId, voiceId: -1 });
          syncPt();
          const id = await switchNote(newVoice.voiceId, midi, false, volumeRef.current * gain, toneRef.current);
          const sv = ptStringVoiceRef.current.get(pos.string);
          if (sv?.pid === e.pointerId) ptStringVoiceRef.current.set(pos.string, { pid: e.pointerId, voiceId: id });
          else releaseNote(id);
        } else {
          syncPt();
        }
      } else {
        syncPt();
      }
    }
  }
  async function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    if (keysPtRef.current.delete(e.pointerId)) {
      syncKeysMarks();
      stopKeyVoice(`p:${e.pointerId}`);
      return;
    }
    if (drumPtRef.current.delete(e.pointerId)) {
      syncDrumMarks();
      return;
    }
    const curEntry = ptHeldRef.current.get(e.pointerId);
    if (!curEntry) return;
    ptHeldRef.current.delete(e.pointerId);
    const cur = ptStringVoiceRef.current.get(curEntry.string);
    if (!cur || cur.pid !== e.pointerId) { syncPt(); return; }
    const next = getHighestOnPtString(curEntry.string);
    if (next) {
      const nextEntry = ptHeldRef.current.get(next.pid);
      const gain = nextEntry ? emitNoteEvent({ string: nextEntry.string, fret: nextEntry.fret, kind: 'pulloff' , timeStamp: e.timeStamp }) : 1;
      ptStringVoiceRef.current.set(curEntry.string, { pid: next.pid, voiceId: -1 });
      syncPt();
      const id = await switchNote(cur.voiceId, next.midi, false, volumeRef.current * gain, toneRef.current);
      const sv = ptStringVoiceRef.current.get(curEntry.string);
      if (sv?.pid === next.pid) ptStringVoiceRef.current.set(curEntry.string, { pid: next.pid, voiceId: id });
      else releaseNote(id);
    } else {
      ptStringVoiceRef.current.delete(curEntry.string);
      syncPt();
      if (cur.voiceId >= 0) releaseNote(cur.voiceId);
    }
  }

  // Al empezar una partida (petición del usuario): lo más bajo que se ve son los números de traste
  // bajo el mástil, y encima, todo lo posible de la autopista por donde caen las notas. La barra MIDI
  // (con PAUSA) y los puntos solo entran si cabe TODO -- autopista entera, mástil, puntos y barra --;
  // en una pantalla baja (móvil) no se gasta autopista en ellos. Instantáneo a propósito: un scroll
  // 'smooth' lanzado desde un clic real de ratón se cancelaba. Se repite cuando la partida arranca DE
  // VERDAD (dos frames después de plegarse el panel): "Empezar" espera a que estén cargados los sonidos,
  // y colocarla solo al hacer clic la dejaba calculada con el panel todavía abierto.
  function placeGame() {
    const stage = stageRef.current;
    const svg = svgRef.current;
    if (!stage || !svg) return;
    const top = stage.getBoundingClientRect().top;
    const neckBottom = svg.getBoundingClientRect().bottom;
    const pill = hostRef.current?.querySelector('.midi-float-pill');
    const pillBottom = pill ? pill.getBoundingClientRect().bottom : neckBottom;
    // Si no cabe todo (móvil en horizontal, ventanas bajas), el borde inferior de la MADERA va al
    // borde inferior de la pantalla: los números de traste quedan debajo, fuera de la vista, y la
    // autopista gana esa altura para ver antes las notas que caen (petición del usuario, 2026-11-03).
    const ctm = svg.getScreenCTM();
    const woodBottom = ctm ? ctm.d * (boardY + boardHeight) + ctm.f : neckBottom;
    // En vertical / ventana estrecha, SIEMPRE con los botones SALIR y PAUSA a 2 px del borde inferior.
    // Jugando solo queda PAUSA en la barra (SALIR vuelve en pausa).
    const exitButton = compactGame ? hostRef.current?.querySelector('.riff-pause-toggle') ?? hostRef.current?.querySelector('.riff-open-toggle') : null;
    if (exitButton) {
      window.scrollTo({ top: window.scrollY + exitButton.getBoundingClientRect().bottom + 2 - window.innerHeight, behavior: 'instant' });
      return;
    }
    const bottom = pillBottom - top <= window.innerHeight ? pillBottom : woodBottom;
    window.scrollTo({ top: window.scrollY + bottom - window.innerHeight, behavior: 'instant' });
  }
  // Teclado (usuario, 2026-11-09): ESPACIO pausa la partida AL INSTANTE, esté o no activado
  // KEYBOARD y sin mantenerlo como los botones (HoldGuard). Se escucha en captura y se anula el
  // keyup que le sigue: si el foco está en un botón, el navegador lo "pulsaría" al soltar (en PAUSA
  // eso reanudaría la partida).
  const pauseRef = useRef<(() => void) | null>(null);
  const pauseNow = riffGame && gameOpen && riff.playing ? riff.pause : null;
  useEffect(() => { pauseRef.current = pauseNow; }, [pauseNow]);
  useEffect(() => {
    if (!riffGame || !gameOpen) return;
    let swallowKeyUp = false;
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const pause = pauseRef.current;
      if (!pause) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      swallowKeyUp = true;
      if (!e.repeat) pause();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !swallowKeyUp) return;
      swallowKeyUp = false;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
    };
  }, [riffGame, gameOpen]);
  const placeOnStartRef = useRef(false);
  function scrollIntoGame() {
    placeOnStartRef.current = true;
    placeGame();
    requestAnimationFrame(() => requestAnimationFrame(placeGame));
  }
  useEffect(() => {
    if (!riff.playing || !placeOnStartRef.current) return;
    placeOnStartRef.current = false;
    requestAnimationFrame(() => requestAnimationFrame(placeGame));
  }, [riff.playing]);
  // Al entrar en pantalla completa (bloqueo del giro) cambia la altura de la ventana.
  useEffect(() => {
    if (!riff.playing) return;
    const replace = () => requestAnimationFrame(() => requestAnimationFrame(placeGame));
    document.addEventListener('fullscreenchange', replace);
    return () => document.removeEventListener('fullscreenchange', replace);
  }, [riff.playing]);


  // Aciertos y puntos en el escenario (para los tests), escritos al cambiar sin redibujar el mástil.
  const riffStats = riff.game.stats;
  const showStats = !!riffGame && gameOpen;
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (!showStats) {
      delete stage.dataset.hits;
      delete stage.dataset.score;
      return;
    }
    const write = () => {
      const { hits, score } = riffStats.get();
      stage.dataset.hits = String(hits);
      stage.dataset.score = String(score);
    };
    write();
    return riffStats.subscribe(write);
  }, [riffStats, showStats]);

  // Unidades del viewBox por píxel de pantalla de la batería (con el ancho real del mástil).
  const drumUnitsPerPx = viewBoxWidth / Math.max(1, Math.min((riff.hostWidth ?? DRUM_NECK_MAX_PX) * svgWidthPercent * drumWidthScale / 100, DRUM_NECK_MAX_PX * drumWidthScale));
  // Batería: el mástil dibujado como una batería (DrumKitNeck), con la línea de golpe donde caen las notas.
  const drumGeo: DrumNeckGeometry | null = drumKit
    ? {
        cx: fretX,
        colWidth: fretWidth,
        left: boardLeftEdge,
        right: boardX + boardWidth,
        top: boardY,
        height: boardHeight,
        // Sin partida no hay carriles: la línea de golpe, en el centro (donde caen las notas en batería).
        hitY: lanes ? laneY(6) : boardY + 2.5 * stringGap,
        touch: touchOnlyScreen,
        // Bombos ENTEROS (usuario, 2026-11-16): se salen del mástil por abajo y quedan DETRÁS de la barra
        // MIDI, sin bajarla: como mucho hasta el fondo de la barra (DRUM_KICK_OVERHANG_PX bajo el <svg>,
        // pasado a unidades del viewBox con el ancho real del mástil).
        maxBottom: viewBoxHeight + DRUM_KICK_OVERHANG_PX * drumUnitsPerPx,
        unitsPerPx: drumUnitsPerPx,
      }
    : null;

  // Teclado: el mástil dibujado como un teclado (KeysNeck), una columna por semitono.
  const keysGeo: KeysNeckGeometry | null = keysRule && gameLayout
    ? {
        colLeft: (fret: number) => boardLeftEdge + fret * fretWidth,
        colWidth: fretWidth,
        drawX,
        top: boardY,
        height: boardHeight,
        low: keysRule.low,
        count: keysRule.high - keysRule.low + 1,
      }
    : null;

  // Geometría publicada para la autopista (después de `drumGeo`, que va dentro).
  useEffect(() => {
    const geometry: FretboardGeometry = {
      svg: svgRef.current,
      fretX,
      // Las filas del mástil de 6 (la 1 y la 6 son sus bordes): la autopista saca de ahí la tabla. Con el bajo
      // sus cuerdas van centradas (stringY), pero los bordes del mástil son los mismos (usuario, 2026-11-18: con
      // stringY del bajo, la autopista empezaba a media altura del mástil).
      stringY: rowY,
      laneY,
      fretLineXs: Array.from({ length: fretCount + 1 }, (_, index) => drawX(boardX + index * fretWidth)),
      openColumn: openWidth === null ? undefined : [drawX(boardLeftEdge), drawX(boardX)],
      startFret,
      endFret,
      drumGeo: drumGeo ?? undefined,
    };
    localGeometryRef.current = geometry;
    if (geometryRef) geometryRef.current = geometry;
  });

  // Números de traste bajo el mástil (también con la batería, usuario 2026-11-16).
  const fretNumbers = showFretNumbers && Array.from(
    { length: startFret === 0 ? endFret + 1 : endFret - startFret + 1 },
    (_, index) => {
      const fret = startFret === 0 ? index : startFret + index;
      return (
        <text className="reduced-fret-number" key={`fretnum-${fret}`} x={fretX(fret)} y={bottomLabelY}>
          {fret}
        </text>
      );
    }
  );

  // Teclado: bajo cada tecla BLANCA, su nombre (Do, Re, Mi...) en vez del número de traste.
  const keyNames = showFretNumbers && keysGeo && Array.from({ length: keysGeo.count }, (_, fret) => fret)
    .filter((fret) => !isBlackKey(keysGeo.low + fret))
    .map((fret) => {
      const r = keyRect(fret, keysGeo);
      return (
        <text className="reduced-fret-number" key={`keyname-${fret}`} x={r.x + r.w / 2} y={bottomLabelY}>
          {SPANISH_NOTE_NAMES[(keysGeo.low + fret) % 12]}
        </text>
      );
    });

  function interactionOverlay(posList: MarkPos[]) {
    // Batería: siempre montada (los velos pálidos y la línea de golpe); golpear solo cambia `data-on`.
    if (drumGeo) return <DrumHits g={drumGeo} on={new Set(posList.map((p) => p.fret))} />;
    if (keysGeo) return <KeysHits g={keysGeo} on={new Set(posList.map((p) => p.fret))} />;
    if (posList.length === 0) return null;
    return (
      <>
        {posList.map(({ string, fret }) => {
          const markerX = fretX(fret);
          const sy = touchY(string);
          const noteIsMarked = notes.some(n => n.string === string && n.fret === fret);
          return (
            <g key={`ko-${string}-${fret}`}
              pointerEvents="none"
              style={{ animation: 'fretboard-string-vibrate 80ms linear infinite' }}
            >
              <line
                x1={markerX}
                x2={drawX(boardX + boardWidth)}
                y1={sy}
                y2={sy}
                stroke="#fbbf24"
                strokeLinecap="round"
                strokeWidth="3"
                opacity="0.85"
              />
              <circle
                cx={markerX}
                cy={sy}
                fill="#fbbf24"
                opacity={noteIsMarked ? 0.5 : 0.9}
                r="16"
              />
              <text x={markerX} y={sy + 4} fill="#b45309" fontSize="12" fontWeight="900" textAnchor="middle">
                {noteNameForFret(string, fret, cents[string])}
              </text>
            </g>
          );
        })}
      </>
    );
  }

  // Definido una vez, colocado en un orden distinto según `instrumentChoice` (ver el bloque KB/volumen/
  // metrónomo/selector más abajo).
  const volumeSlider = (
    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
      <span style={{ fontSize: '13px', fontWeight: 700, color: '#080808', minWidth: '40px', textAlign: 'right' }}>
        Vol {Math.round(volume * 100)}
      </span>
      <input
        aria-label={drumKit ? 'Volumen de la batería' : bassNeck ? 'Volumen del bajo' : keysKit ? 'Volumen del teclado' : 'Volumen de la guitarra'}
        max="1" min="0" step="0.05"
        style={{ accentColor: '#047857', cursor: 'pointer', width: '112px' }}
        type="range"
        value={volume}
        onChange={(e) => setVolume(Number(e.target.value))}
      />
    </label>
  );

  return (
    <>
    {/* Fuera de .midi-instrument-host a propósito: el aviso flotante de MidiInstrumentChrome se
        coloca encima del host, y taparía estos botones si vivieran dentro. */}
    {riffGame && <RiffStyles />}
    {riffGame && <HoldGuardStyles />}
    {practiceExercises && (
      <>
        <FretboardPracticeStyles />
        <PracticeButtons activeIndex={practice.activeIndex} exercises={practiceExercises} onToggle={practice.toggle} />
      </>
    )}
    {tutorial && (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
        {/* Con JUGAR abierto solo brillan el Tutorial de la partida y KEYBOARD (usuario, 2026-11-15). */}
        <TutorialButton glow={!(riffGame && gameOpen)} rootRef={hostRef} steps={FRETBOARD_TOUR} />
      </div>
    )}
    <div className={`midi-instrument-host${compactGame ? ' riff-compact' : ''}${riffGame && gameOpen ? ' riff-game-open' : ''}`} ref={hostRef}>
    {/* Puntos de la partida ENCIMA del carril de las notas (usuario, 2026-11-09; antes, entre el mástil
        y la barra): rojo intenso con brillo amarillo. Pegados arriba de la pantalla (sticky) cuando el
        carril empieza por encima de ella. La fila existe mientras JUGAR está abierto, para que nada
        salte al empezar. */}
    {riffGame && gameOpen && (
      <p aria-live="polite" className="riff-score" data-testid="riff-score">
        <RiffScoreText show={riff.game.status !== 'idle' && riff.game.scoring} stats={riff.game.stats} />
      </p>
    )}
    {/* Ancla del mensaje de práctica: solo el área del mástil, para que "OTRA VEZ"/"ENHORABUENA"
        salgan centrados DELANTE del mástil aunque la barra de controles vaya en flujo (móvil). */}
    <div
      // `riff-live`: partida en curso o en pausa -> el mástil cambia de aspecto (ver RiffStyles).
      className={riffGame ? `riff-stage${riffInGame ? ' riff-live' : ''}` : undefined}
      data-game-mode={riffGame && gameOpen ? riff.gameMode : undefined}
      data-status={riffGame && gameOpen ? riff.game.status : undefined}
      // Afinación del mástil (nota de la 6ª al aire): con JUGAR abierto su botón no está en la barra.
      data-tuning={riffGame && gameOpen ? noteNameForFret(6, 0, cents[6]) : undefined}
      data-tutorial={riffGame && gameOpen && riff.tutorialOn ? riff.tutorialCard ?? 'playing' : undefined}
      data-repetition={riffGame && gameOpen && riff.game.repetition ? riff.game.repetition : undefined}
      ref={stageRef}
      style={{ containerType: 'inline-size', minWidth: 0, position: 'relative', ...(bleed && bleedWanted ? { marginLeft: -bleed.left, marginRight: -bleed.right } : null) }}
    >
    {showHighway && <div aria-hidden="true" className="riff-highway-space" />}
    {riffGame && gameOpen && <RiffPerfBox status={riff.game.status} />}
    {/* Batería: sin recortar por abajo (los bombos se salen del mástil, ver `maxBottom`). */}
    <div className={`reduced-fretboard-wrap${drumKit ? ' riff-drum-wrap' : ''}`} ref={scrollRef}>
    <svg
      ref={svgRef}
      className={`reduced-fretboard${drumKit ? ' riff-drum-neck' : ''}${drumKit && !gameOpen ? ' riff-drum-standalone' : ''}${darkGameLook && !drumKit && !keysKit ? ' dark-game-look' : ''}`}
      viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
      role="img"
      aria-label={ariaLabel}
      style={{ touchAction: 'none', cursor: 'pointer', userSelect: 'none', WebkitTapHighlightColor: 'transparent', maxWidth: drumKit ? `min(${svgWidthPercent * drumWidthScale}%, ${DRUM_NECK_MAX_PX * drumWidthScale}px)` : `${svgWidthPercent}%`, width: `${svgWidthPercent * (drumKit ? drumWidthScale : 1)}%`, ...(drumKit ? { marginInline: 'auto', overflow: 'visible' } : null) }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      // Un toque corto (no mantener ni tapear) hacía que el móvil pintara su resaltado azul y mandara
      // ratón emulado + un clic fantasma: un tirón en cada nota durante la canción (usuario, 2026-11-09).
      // El mástil solo usa eventos de puntero, que ya han llegado; esto anula lo demás.
      onTouchEnd={(e) => { if (e.cancelable) e.preventDefault(); }}
    >
      {drumGeo && <><DrumHitStyles /><DrumKitNeck g={drumGeo} /></>}
      {keysGeo && <><KeysHitStyles /><KeysNeck g={keysGeo} /></>}
      {!drumGeo && !keysGeo && <>
      <rect className="reduced-board-bg" x={boardLeftEdge} y={boardY} width={boardX + boardWidth - boardLeftEdge} height={boardHeight} />
      {neckStrings.map((string) => (
        <line
          className="reduced-string"
          data-string={string}
          key={`string-${string}`}
          // Bajo: cuerdas más gruesas (usuario, 2026-11-18). Su color de juego solo en el tema oscuro de la Sala
          // (darkGameLook); en claro, grises como las de la guitarra.
          style={bassNeck ? { strokeWidth: BASS_STRING_WIDTH } : undefined}
          x1={boardLeftEdge} x2={boardX + boardWidth} y1={stringY(string)} y2={stringY(string)}
        />
      ))}
      {Array.from({ length: fretCount + 1 }, (_, index) => {
        const isNut = startFret === 0 && index === 0;
        const fret = startFret === 0 ? index : startFret + index;

        return (
          <line
            className={isNut ? 'reduced-nut' : 'reduced-fret'}
            key={`fret-${fret}`}
            x1={drawX(boardX + index * fretWidth)}
            x2={drawX(boardX + index * fretWidth)}
            y1={boardY}
            y2={boardY + boardHeight}
          />
        );
      })}
      {mergedGuideDots.flatMap((dot): Array<{ fret: number; string?: number }> =>
        dot.fret === 12
          ? [{ fret: 12, string: 2 }, { fret: 12, string: 5 }]
          : [dot]
      ).map((dot) => (
        <circle
          className="reduced-guide-dot"
          cx={fretX(dot.fret)}
          // Las filas de los puntos son de la guitarra (el bajo comparte el centro, 3,5).
          cy={rowY(bassNeck && dot.string ? (dot.string < 3.5 ? 2.3 : 4.7) : dot.string ?? 3.5)}
          key={`guide-${dot.fret}-${dot.string ?? 'center'}`}
          r="7"
        />
      ))}
      {notes.filter((note) => note.fret >= startFret && note.fret <= endFret).map((note) => (
        <g key={`${note.string}-${note.fret}-${note.label}`}>
          <circle
            className={`reduced-note ${noteToneClass(note)}`}
            cx={fretX(note.fret)}
            cy={stringY(note.string)}
            r="16"
          />
          <text className="reduced-note-label" x={fretX(note.fret)} y={stringY(note.string) + 5}>
            {note.label}
          </text>
          {note.highlight ? (
            <circle
              className="reduced-note-highlight-ring"
              cx={fretX(note.fret)}
              cy={stringY(note.string)}
              r="21"
            />
          ) : null}
        </g>
      ))}
      </>}
      {fretLabelsAbove && Array.from(
        { length: startFret === 0 ? endFret + 1 : endFret - startFret + 1 },
        (_, index) => {
          const fret = startFret === 0 ? index : startFret + index;
          return (
            <text className="reduced-fret-number-above" key={`fretnumtop-${fret}`} x={fretX(fret)} y={boardY - 20}>
              {fret}
            </text>
          );
        }
      )}
      {allRomanFrets.map((fret) => (
        <text className="reduced-roman-fret" key={`roman-${fret}`} x={fretX(fret)} y={romansGoAbove ? boardY - 20 : bottomLabelY}>
          {romanFretLabels[fret]}
        </text>
      ))}
      {/* También con la batería (usuario, 2026-11-16: números de traste debajo, sin teclas en el dibujo). */}
      {!drumKit && (keyNames || fretNumbers)}
      <NoteMarksOverlay
        endFret={endFret}
        getNoteName={(string, fret) => noteNameForFret(string, fret, cents[string])}
        getX={fretX}
        getY={stringY}
        marks={marks}
        startFret={startFret}
        firstString={neckStrings[0]}
      />
      {pegsShown && [1, 2, 3, 4, 5, 6].map((string) => (
        <TuningPeg
          ariaLabel={`Clavija de la cuerda ${string}`}
          key={`tuning-peg-${string}`}
          onStepChange={(next) => setCents((c) => ({ ...c, [string]: next }))}
          stepValue={cents[string]}
          x={drawX(PEG_X)}
          y={stringY(string)}
        />
      ))}
      <PracticeTargetMarker getX={fretX} getY={stringY} target={practice.target} />
      {kbMode
        ? <PressMarks key="kb" render={interactionOverlay} setterRef={kbMarksRef} />
        : <PressMarks key="pt" render={interactionOverlay} setterRef={ptMarksRef} />}
      {/* Batería: los números, por encima de los bombos (que bajan hasta su fila) y de sus golpes. */}
      {drumKit && fretNumbers}
    </svg>
    </div>
    <PracticeFeedback feedback={practice.feedback} />
    {showHighway && riff.chart && (
      <RiffHighway
        activeStrings={riff.profile?.strings ?? riff.chart?.strings}
        ambientPhrases={riff.level === 'experto' && !riff.tutorialOn ? EXPERTO_PHRASES : undefined}
        chart={riff.chart}
        countdownPhrase={riff.tutorialOn ? undefined : COUNTDOWN_PHRASES[riff.level]}
        colorBy={riff.profile?.colorBy ?? 'string'}
        fretCaps={Object.fromEntries((riff.profile?.strings ?? riff.chart?.strings ?? [1, 2, 3, 4, 5, 6]).map((string) => [string, riff.profile ? Math.min(riff.profile.maxFret, riff.profile.maxFretByString?.[string] ?? riff.profile.maxFret) : endFret]))}
        fretRange={riff.profile ? [riff.profile.minFret, riff.profile.maxFret] : undefined}
        freeStrings={!!riff.profile?.freeStrings}
        geometryRef={localGeometryRef}
        practice={riff.loop && !riff.tutorialOn}
        previewTime={riff.previewTime}
        sessionRef={riff.game.sessionRef}
        stageRef={stageRef}
        stretch={stretchesLane(riff.level) && !riff.tutorialOn}
        laneSpeed={riff.tutorialOn ? 1 : laneSpeedFactor(riff.level)}
        sectionLaneSpeeds={riff.tutorialOn ? TUTORIAL_LANE_SPEEDS : undefined}
      />
    )}
    {riffGame && gameOpen && settingsOpen && (
      <div className="riff-overlay" ref={overlayRef} style={overlayTop === null ? undefined : { top: `${overlayTop}px` }}>
        {/* Partida tutorial: sus mensajes (o su pausa) en lugar del panel de ajustes. */}
        {riff.soundCheck ? <SoundCheckDesk riff={riff} /> : riff.tutorialOn ? <RiffTutorialCard riff={riff} /> : (
          <RiffControls
            onStart={scrollIntoGame}
            onSong={(id) => void songChoice.pick(id)}
            riff={riff}
            song={song}
            songNotice={songChoice.notice}
            songs={songChoice.songs}
            trackRoles={song?.trackRoles}
          />
        )}
      </div>
    )}
    </div>
    <HorizontalScrollbar targetRef={scrollRef} />
    {kbArrowWanted && kbArrow && (kbArrow.side ? (
      <span aria-hidden="true" className="riff-kb-hint riff-kb-side" data-testid="riff-kb-hint" style={{ left: `${kbArrow.left}px`, top: `${kbArrow.top}px` }}>
        <span className="riff-kb-arrow" data-testid="riff-kb-arrow">◀</span>
        <span className="riff-kb-hint-text">Usa teclado</span>
      </span>
    ) : kbArrow.hint ? (
      <span aria-hidden="true" className="riff-kb-hint" data-testid="riff-kb-hint" style={{ left: `${kbArrow.left}px`, top: `${kbArrow.top}px` }}>
        <span className="riff-kb-hint-text">Usa teclado</span>
        <span className="riff-kb-arrow" data-testid="riff-kb-arrow">▼</span>
      </span>
    ) : (
      <span aria-hidden="true" className="riff-kb-arrow riff-kb-arrow-alone" data-testid="riff-kb-arrow" style={{ left: `${kbArrow.left}px`, top: `${kbArrow.top}px` }}>▼</span>
    ))}
    <MidiInstrumentChrome
      belowNote={allowLeftHanded && kbMode && lefty && <KeyboardLeftyNote />}
      warning={kbMode && kbGhostWarn && (
        <span style={{ fontSize: '11px', color: '#92400e', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '4px', padding: '2px 6px', whiteSpace: 'nowrap' }}>
          ⚠ Necesitas teclado gaming para tocar ciertos acordes
        </span>
      )}
    >
      {/* Mientras la partida corre, cada control de la barra (PAUSA incluida) pide mantenerlo
          pulsado 1 s: evita activarlos sin querer al tocar la pantalla jugando. En pausa, no. */}
      <HoldGuard active={!!riffGame && gameOpen && riff.playing}>
      {riffGame && !gamePlayingBar && (
        // Con el juego abierto, el mismo botón es SALIR: cierra panel y autopista y para la partida.
        <button aria-pressed={gameOpen} className="riff-open-toggle" onClick={toggleGame} type="button">
          {gameOpen ? 'SALIR' : 'JUGAR'}
        </button>
      )}
      {/* PAUSA, junto a JUGAR mientras hay partida: la para y despliega los ajustes delante del
          juego (desde ahí, "Continuar" o "Volver a empezar"). Pulsarla en pausa = continuar. */}
      {riffInGame && (
        <button
          aria-pressed={riff.paused}
          className="riff-pause-toggle"
          disabled={riff.paused && !riff.canContinue}
          onClick={() => (riff.paused ? riff.resume() : riff.pause())}
          type="button"
        >
          PAUSA
        </button>
      )}
      {/* Con JUGAR abierto (usuario, 2026-11-15): jugando, solo PAUSA y KEYBOARD; con el panel abierto (antes de
          empezar, en pausa o al terminar), solo JUGAR/SALIR, PAUSA, KEYBOARD, diestro/zurdo y
          CLEAN/OVERDRIVE. Afinación, colores, volumen del mástil y metrónomo no se usan en el juego
          (el panel tiene su propio Vol). */}
      {allowLeftHanded && !gamePlayingBar && <HandednessToggleButton lefty={lefty} onClick={() => setLefty(l => !l)} />}
      {allowTuning && !gameOpenBar && !bassNeck && !drumKit && !keysKit && (
        <div className="midi-anchor">
          <button
            onClick={() => setShowTuning(s => !s)}
            aria-pressed={showTuning}
            aria-label="Afinar el mástil"
            style={{ background: showTuning ? '#047857' : 'transparent', border: `1.5px solid ${showTuning ? '#047857' : '#9ca3af'}`, borderRadius: '5px', color: showTuning ? '#fff' : '#6b7280', cursor: 'pointer', fontSize: '12px', fontWeight: 700, lineHeight: 1.4, padding: '3px 8px' }}
          >
            {noteNameForFret(6, 0, cents[6])}
          </button>
          {showTuning && (
            <div className="midi-dropdown">
              {TUNING_PRESETS.map((preset) => {
                const active = [1, 2, 3, 4, 5, 6].every((s) => cents[s] === preset.shiftSemitones * 100);
                return (
                  <button
                    key={preset.id}
                    onClick={() => setCents(centsForPreset(preset))}
                    aria-pressed={active}
                    style={{ background: active ? '#047857' : 'transparent', border: `1.5px solid ${active ? '#047857' : '#9ca3af'}`, borderRadius: '5px', color: active ? '#fff' : '#6b7280', cursor: 'pointer', fontSize: '11px', fontWeight: 700, lineHeight: 1.4, padding: '3px 7px', whiteSpace: 'nowrap' }}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      {allowOverdrive && !gamePlayingBar && !bassNeck && !drumKit && !keysKit && (
        <button
          onClick={() => setTone(t => (t === 'clean' ? 'overdrive' : 'clean'))}
          aria-pressed={tone === 'overdrive'}
          aria-label="Cambiar sonido clean u overdrive"
          style={{ background: tone === 'overdrive' ? '#047857' : 'transparent', border: `1.5px solid ${tone === 'overdrive' ? '#047857' : '#9ca3af'}`, borderRadius: '5px', color: tone === 'overdrive' ? '#fff' : '#6b7280', cursor: 'pointer', fontSize: '12px', fontWeight: 700, lineHeight: 1.4, padding: '3px 8px' }}
        >
          {tone === 'overdrive' ? 'OVERDRIVE' : 'CLEAN'}
        </button>
      )}
      {!gameOpenBar && !drumKit && !keysKit && <PaletteToggleButton active={paintMode} onClick={() => setPaintMode(p => !p)} />}
      {/* KEYBOARD se queda también jugando (usuario, 2026-11-15; en táctil lo esconde el CSS). */}
      {<div className="midi-anchor">
        <button
          // aria-pressed: el tutorial del juego se salta "Activa el teclado" si ya está activado.
          aria-pressed={kbMode}
          className={`midi-kb-toggle${riffGame && gameOpen ? ' riff-kb-glow' : ''}`}
          onClick={() => setKbMode(m => !m)}
          style={{ background: kbMode ? '#047857' : 'transparent', border: `1.5px solid ${kbMode ? '#047857' : '#9ca3af'}`, borderRadius: '5px', color: kbMode ? '#fff' : '#6b7280', cursor: 'pointer', fontSize: '12px', fontWeight: 700, lineHeight: 1.4, padding: '3px 8px' }}
        >
          <KeyboardToggleLabel />
        </button>
        {kbMode && !bassNeck && !drumKit && !keysKit && (
          <div className="midi-dropdown">
            {(['lower', 'upper'] as const).map(range => (
              <button key={range} onClick={() => setKbRange(range)} aria-pressed={kbRange === range}
                style={{ background: kbRange === range ? '#047857' : 'transparent', border: `1.5px solid ${kbRange === range ? '#047857' : '#9ca3af'}`, borderRadius: '5px', color: kbRange === range ? '#fff' : '#6b7280', cursor: 'pointer', fontSize: '11px', fontWeight: 700, lineHeight: 1.4, padding: '3px 7px', whiteSpace: 'nowrap' }}>
                {range === 'lower' ? 'Graves' : 'Agudas'}
              </button>
            ))}
          </div>
        )}
      </div>}
      {/* Orden KB/volumen/metrónomo (regla de todo el sitio): el volumen va SIEMPRE entre los dos botones --
          salvo con el selector de instrumento (Sala de pruebas, 2026-11-20): ahí el metrónomo pasa a ir junto
          al botón KEYBOARD, y el volumen se queda junto al selector, al final (petición del usuario: el
          selector de instrumento debajo del resto de controles, con el volumen entre ambos). */}
      {!gameOpenBar && !instrumentChoice && volumeSlider}
      {!gameOpenBar && !instrumentChoice && <MetronomeControls {...metr} />}
      {!gameOpenBar && instrumentChoice && <MetronomeControls {...metr} />}
      {!gameOpenBar && instrumentChoice && volumeSlider}
      {instrumentChoice && !gameOpenBar && <NeckInstrumentPicker kind={neckChoice} onPick={chooseNeck} />}
      </HoldGuard>
    </MidiInstrumentChrome>
    </div>
    </>
  );
}

export function ReducedFretboardStyles() {
  return (
    <style>{`
      .reduced-fretboard-wrap {
        margin: 0;
        min-width: 0;
        overflow-x: auto;
        scrollbar-width: none;
        width: 100%;
      }

      .reduced-fretboard-wrap::-webkit-scrollbar {
        display: none;
      }

      .reduced-fretboard {
        display: block;
        height: auto;
      }

      .reduced-board-bg {
        fill: #27313d;
      }

      .reduced-string {
        stroke: #9ca3af;
        stroke-width: 3;
      }

      .reduced-fret {
        stroke: #d1d5db;
        stroke-width: 4;
      }

      .reduced-nut {
        stroke: #e5e7eb;
        stroke-width: 8;
      }

      .reduced-guide-dot {
        fill: #cbd5e1;
        opacity: 0.82;
      }

      .reduced-note {
        fill: #f1f5f9;
        stroke: #a1a1aa;
        stroke-width: 3;
      }

      .reduced-note-e {
        stroke: #059669;
        stroke-width: 5;
      }

      .reduced-note-g {
        stroke: #2563eb;
        stroke-width: 5;
      }

      .reduced-note-special {
        stroke: #dc2626;
        stroke-width: 5;
      }

      .reduced-note-highlight-ring {
        fill: none;
        stroke: #fbbf24;
        stroke-width: 5;
      }

      .reduced-note-label {
        fill: #080808;
        font-size: 18px;
        font-weight: 950;
        text-anchor: middle;
      }

      .reduced-roman-fret {
        fill: #080808;
        font-size: 15px;
        font-weight: 950;
        text-anchor: middle;
      }

      .reduced-fret-number {
        fill: #080808;
        font-size: 15px;
        font-weight: 700;
        text-anchor: middle;
      }

      /* Batería (DrumKitNeck): su dibujo ya es oscuro; en el tema oscuro se contra-invierte siempre (también
         antes de empezar, cuando el mástil aún no es "riff-live"). */
      /* Batería: el contenedor no recorta (con overflow-x: auto también recortaba por abajo los bombos). */
      .reduced-fretboard-wrap.riff-drum-wrap {
        overflow: visible;
        /* Su propia capa, por DEBAJO de la barra MIDI (usuario, 2026-11-17: los botones deben verse
           delante del doble bombo, que baja detrás de ella). */
        position: relative;
        z-index: 0;
      }

      .midi-instrument-host.riff-game-open .midi-float-controls {
        z-index: 150;
      }

      /* En el móvil la barra va en el flujo (is-in-flow, static): sin posición, su z-index no contaría. */
      .midi-instrument-host.riff-game-open .midi-float-controls.is-in-flow {
        position: relative;
      }

      /* Los números de traste pasan por encima de los bombos (oscuros): con contorno blanco se leen. */
      svg.riff-drum-neck .reduced-fret-number {
        paint-order: stroke;
        stroke: #ffffff;
        stroke-width: 4px;
        stroke-linejoin: round;
      }

      html[data-theme='dark'] svg.reduced-fretboard.riff-drum-neck {
        filter: invert(1) hue-rotate(180deg);
      }

      /* Batería MIDI suelta, sin partida y en el tema CLARO (usuario, 2026-11-18): tabla blanca y cada columna del
         tono pálido de su color. En el tema oscuro y en partida, la tabla oscura de siempre. */
      html:not([data-theme='dark']) svg.riff-drum-standalone .riff-drum-board {
        fill: #ffffff;
      }
      html:not([data-theme='dark']) svg.riff-drum-standalone .riff-drum-col {
        opacity: 0.3;
      }

      /* Aspecto de partida en el tema oscuro (prop darkGameLook, Sala de pruebas): los mismos colores que el
         mástil durante el juego (.riff-live en RiffStyles), con las cuerdas del <svg> en sus colores del juego
         (RIFF_STRING_COLORS; en la partida las dibuja la autopista). El <svg> se contra-invierte para que el
         tema oscuro no cambie esos colores, y sus números van en blanco sobre la página oscura. */
      html[data-theme='dark'] svg.reduced-fretboard.dark-game-look {
        filter: invert(1) hue-rotate(180deg);
      }
      html[data-theme='dark'] svg.dark-game-look .reduced-board-bg {
        fill-opacity: 0.78;
      }
      html[data-theme='dark'] svg.dark-game-look .reduced-fret,
      html[data-theme='dark'] svg.dark-game-look .reduced-nut {
        filter: drop-shadow(0 0 3px rgba(250, 204, 21, 0.75));
        stroke: #facc15;
      }
      html[data-theme='dark'] svg.dark-game-look .reduced-guide-dot {
        fill: #facc15;
        filter: drop-shadow(0 0 4px rgba(250, 204, 21, 0.8));
        opacity: 1;
      }
      html[data-theme='dark'] svg.dark-game-look .reduced-string {
        stroke-width: 3;
      }
      html[data-theme='dark'] svg.dark-game-look .reduced-string[data-string='1'] { stroke: ${RIFF_STRING_COLORS[1]}; }
      html[data-theme='dark'] svg.dark-game-look .reduced-string[data-string='2'] { stroke: ${RIFF_STRING_COLORS[2]}; }
      html[data-theme='dark'] svg.dark-game-look .reduced-string[data-string='3'] { stroke: ${RIFF_STRING_COLORS[3]}; }
      html[data-theme='dark'] svg.dark-game-look .reduced-string[data-string='4'] { stroke: ${RIFF_STRING_COLORS[4]}; }
      html[data-theme='dark'] svg.dark-game-look .reduced-string[data-string='5'] { stroke: ${RIFF_STRING_COLORS[5]}; }
      html[data-theme='dark'] svg.dark-game-look .reduced-string[data-string='6'] { stroke: ${RIFF_STRING_COLORS[6]}; }
      html[data-theme='dark'] svg.dark-game-look .reduced-fret-number,
      html[data-theme='dark'] svg.dark-game-look .reduced-roman-fret,
      html[data-theme='dark'] svg.dark-game-look .reduced-fret-number-above {
        fill: #ffffff;
      }

      .reduced-fret-number-above {
        fill: #080808;
        font-size: 15px;
        font-weight: 700;
        text-anchor: middle;
      }
    `}</style>
  );
}
