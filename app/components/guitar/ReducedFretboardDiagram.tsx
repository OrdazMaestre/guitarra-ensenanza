'use client';
import { useEffect, useRef, useState } from 'react';
import { playNote, preloadSamples, releaseNote, switchNote } from '@/app/lib/guitarAudioEngine';
import { FRETBOARD_KEYMAP, FRETBOARD_KEYMAP_LEFTY, FRETBOARD_KEYMAP_UPPER, FRETBOARD_KEYMAP_UPPER_LEFTY, hasKeyboardGhosting } from '@/app/lib/fretboardKeymap';
import { useMetronome } from '@/app/lib/useMetronome';
import { useNoteMarks } from '@/app/lib/useNoteMarks';
import HorizontalScrollbar from './HorizontalScrollbar';
import MetronomeControls from './MetronomeControls';
import MidiInstrumentChrome from './MidiInstrumentChrome';
import { NoteMarksOverlay, PaletteToggleButton } from './NoteMarksOverlay';
import { HandednessToggleButton, KeyboardLeftyNote } from './HandednessToggleButton';
import TuningPeg from '../tuningGame/TuningPeg';
import { centsToMidiOffset } from '@/app/lib/tuningGame/pitch';

// Standard tuning: MIDI for each open string (string 1 = high E)
const OPEN_STRING_MIDI: Record<number, number> = {
  1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40,
};

const chromaticNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// `centsValue` SIEMPRE como parámetro explícito (nunca leído de un ref/estado dentro de la
// función) -- mismo motivo que TuningBoard.tsx: así sirve tanto desde el render (pasando
// `cents[string]`) como desde los manejadores de puntero/teclado asíncronos (pasando
// `centsRef.current[string]`, el valor más reciente tras un `await`). Ver `allowTuning` más abajo.
function effectiveMidi(string: number, fret: number, centsValue: number): number {
  return OPEN_STRING_MIDI[string] + fret + centsToMidiOffset(centsValue);
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

interface ReducedFretboardDiagramProps {
  allowLeftHanded?: boolean;
  allowTuning?: boolean;
  ariaLabel: string;
  endFret: number;
  fretLabels?: boolean;
  fretLabelsAbove?: boolean;
  guideDots?: GuideDot[];
  notes: FretboardNote[];
  startFret: number;
}

const romanFretLabels: Record<number, string> = {
  3: 'III',
  5: 'V',
  7: 'VII',
  9: 'IX',
  12: 'XII',
};

function fretMarkerX(boardX: number, fretWidth: number, startFret: number, fret: number) {
  if (startFret === 0 && fret === 0) {
    return boardX - 20;
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

export function ReducedFretboardDiagram({ allowLeftHanded, allowTuning, ariaLabel, endFret, fretLabels, fretLabelsAbove, guideDots = [], notes, startFret }: ReducedFretboardDiagramProps) {
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
  const boardX = 42 + (allowTuning && showTuning ? PEG_AREA_WIDTH : 0);
  const fretWidth = 58;
  const boardHeight = 158;
  const stringGap = boardHeight / 5;
  // Modo zurdo (opt-in vía `allowLeftHanded`): invierte el mástil SOLO en el eje X -- la cuerda
  // (eje Y) nunca cambia de orden. `drawX` es la única función que conoce la inversión: toda
  // coordenada X que se DIBUJA pasa por aquí (mirror respecto al centro del tablero), y el resto
  // del componente (getPos, fretMarkerX, etc.) sigue razonando en coordenadas "lógicas" normales,
  // ajeno a la mano -- ver el comentario en `getPos` para el lado simétrico (puntero -> lógico).
  const [lefty, setLefty] = useState(false);
  const centerX = boardX + (fretCount * fretWidth) / 2;
  const drawX = (x: number) => (lefty ? 2 * centerX - x : x);
  const fretX = (fret: number) => drawX(fretMarkerX(boardX, fretWidth, startFret, fret));
  const allRomanFrets = Object.keys(romanFretLabels)
    .map(Number)
    .filter((fret) => fret >= startFret && fret <= endFret);
  const romansGoAbove = !!fretLabels && allRomanFrets.length > 0;
  const boardY = (fretLabelsAbove || romansGoAbove) ? 44 : 28;
  const boardWidth = fretCount * fretWidth;
  const bottomLabelY = boardY + boardHeight + 30;
  const hasBottomLabels = !!fretLabels || (allRomanFrets.length > 0 && !romansGoAbove);
  // `2 * boardX` (no `boardX + 42`) a propósito: el margen derecho debe ser SIMÉTRICO al
  // izquierdo para que nada se recorte al reflejar en modo zurdo (drawX refleja respecto al
  // centro del TABLERO, no del viewBox -- cualquier elemento a la izquierda de boardX, como las
  // clavijas o el marcador de cuerda al aire, necesita el mismo hueco disponible a la derecha tras
  // el mirror). Cuando `boardX` es la constante de siempre (42, sin clavijas) esto da exactamente
  // el mismo resultado que antes (42 + boardWidth + 42), así que no cambia nada para el resto de
  // usos de este componente -- solo importa cuando `boardX` crece por `showTuning`.
  const viewBoxWidth = 2 * boardX + boardWidth;
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
  const baseViewBoxWidth = 2 * 42 + boardWidth;
  const svgWidthPercent = (viewBoxWidth / baseViewBoxWidth) * 100;
  const viewBoxHeight = hasBottomLabels ? bottomLabelY + 18 : boardY + boardHeight + 20;
  const [cents, setCents] = useState<Record<number, number>>(zeroedCents());
  const centsRef = useRef(cents);
  useEffect(() => { centsRef.current = cents; }, [cents]);
  const stringY = (string: number) => boardY + (string - 1) * stringGap;
  const passedFrets = new Set(guideDots.map((d) => d.fret));
  const mergedGuideDots = [
    ...guideDots,
    ...[3, 5, 7, 9, 12]
      .filter((f) => f >= startFret && f <= endFret && !passedFrets.has(f))
      .map((f) => ({ fret: f })),
  ];

  // Audio interaction
  const svgRef = useRef<SVGSVGElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const ptHeldRef = useRef(new Map<number, { string: number; fret: number; midi: number }>());
  const ptStringVoiceRef = useRef(new Map<number, { pid: number; voiceId: number }>());
  const [ptPositions, setPtPositions] = useState<{ string: number; fret: number }[]>([]);
  const [volume, setVolume] = useState(1.0);
  const [kbMode, setKbMode] = useState(false);
  const [kbRange, setKbRange] = useState<'lower' | 'upper'>('lower');
  const [paintMode, setPaintMode] = useState(false);
  const { marks, toggleMark } = useNoteMarks();

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
  const [kbPositions, setKbPositions] = useState<{ string: number; fret: number }[]>([]);
  const [kbGhostWarn, setKbGhostWarn] = useState(false);
  const volumeRef = useRef(volume);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  const paintModeRef = useRef(paintMode);
  useEffect(() => { paintModeRef.current = paintMode; }, [paintMode]);
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
    const activeMap = lefty
      ? (kbRange === 'upper' ? FRETBOARD_KEYMAP_UPPER_LEFTY : FRETBOARD_KEYMAP_LEFTY)
      : (kbRange === 'upper' ? FRETBOARD_KEYMAP_UPPER : FRETBOARD_KEYMAP);
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
      setKbPositions([...pos]);
      if (kbStringVoiceRef.current.size >= 3) setKbGhostWarn(false);
    }
    async function down(e: KeyboardEvent) {
      e.preventDefault();
      if (e.repeat || kbKeysHeldRef.current.has(e.code)) return;
      const entry = activeMap[e.code];
      if (!entry) return;
      const cur = kbStringVoiceRef.current.get(entry.string);
      if (!cur && kbStringVoiceRef.current.size >= 3) return;
      if (paintModeRef.current) toggleMark(noteNameForFret(entry.string, entry.fret, centsRef.current[entry.string]));
      kbKeysHeldRef.current.set(e.code, entry);
      setKbGhostWarn(hasKeyboardGhosting(kbKeysHeldRef.current));
      if (!cur) {
        kbStringVoiceRef.current.set(entry.string, { code: e.code, voiceId: -1 });
        syncPositions();
        const id = await playNote(effectiveMidi(entry.string, entry.fret, centsRef.current[entry.string]), false, volumeRef.current);
        const sv = kbStringVoiceRef.current.get(entry.string);
        if (sv?.code === e.code) kbStringVoiceRef.current.set(entry.string, { code: e.code, voiceId: id });
        else releaseNote(id);
      } else {
        const curEntry = kbKeysHeldRef.current.get(cur.code);
        if (curEntry && entry.fret > curEntry.fret) {
          kbStringVoiceRef.current.set(entry.string, { code: e.code, voiceId: -1 });
          syncPositions();
          const id = await switchNote(cur.voiceId, effectiveMidi(entry.string, entry.fret, centsRef.current[entry.string]), false, volumeRef.current);
          const sv = kbStringVoiceRef.current.get(entry.string);
          if (sv?.code === e.code) kbStringVoiceRef.current.set(entry.string, { code: e.code, voiceId: id });
          else releaseNote(id);
        }
      }
    }
    async function up(e: KeyboardEvent) {
      e.preventDefault();
      const entry = kbKeysHeldRef.current.get(e.code);
      if (!entry) return;
      kbKeysHeldRef.current.delete(e.code);
      setKbGhostWarn(hasKeyboardGhosting(kbKeysHeldRef.current));
      const cur = kbStringVoiceRef.current.get(entry.string);
      if (!cur || cur.code !== e.code) return;
      const next = getHighestOnString(entry.string);
      if (next) {
        kbStringVoiceRef.current.set(entry.string, { code: next.code, voiceId: -1 });
        syncPositions();
        const id = await switchNote(cur.voiceId, effectiveMidi(next.entry.string, next.entry.fret, centsRef.current[next.entry.string]), false, volumeRef.current);
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
      setKbPositions([]);
      setKbGhostWarn(false);
    };
  }, [kbMode, kbRange, lefty]);

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

    const halfGap = stringGap / 2;
    if (y < boardY - halfGap || y > boardY + boardHeight + halfGap) return null;
    const string = Math.max(1, Math.min(6, Math.round((y - boardY) / stringGap) + 1));

    let fret: number;
    if (x < boardX) {
      if (startFret !== 0 || x < boardX - 40) return null;
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
    const rStr = Math.abs(rawSF - (held.string - 1)) < 0.5 + EXP ? held.string : string;
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
    setPtPositions([...pos]);
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
    if (paintMode) toggleMark(noteNameForFret(pos.string, pos.fret, centsRef.current[pos.string]));
    const midi = effectiveMidi(pos.string, pos.fret, centsRef.current[pos.string]);
    const cur = ptStringVoiceRef.current.get(pos.string);
    if (!cur) {
      if (ptStringVoiceRef.current.size >= 3) return;
      ptHeldRef.current.set(e.pointerId, { string: pos.string, fret: pos.fret, midi });
      ptStringVoiceRef.current.set(pos.string, { pid: e.pointerId, voiceId: -1 });
      syncPt();
      const id = await playNote(midi, false, volumeRef.current);
      const sv = ptStringVoiceRef.current.get(pos.string);
      if (sv?.pid === e.pointerId) ptStringVoiceRef.current.set(pos.string, { pid: e.pointerId, voiceId: id });
      else releaseNote(id);
    } else {
      ptHeldRef.current.set(e.pointerId, { string: pos.string, fret: pos.fret, midi });
      const curEntry = ptHeldRef.current.get(cur.pid);
      if (curEntry && pos.fret > curEntry.fret) {
        ptStringVoiceRef.current.set(pos.string, { pid: e.pointerId, voiceId: -1 });
        syncPt();
        const id = await switchNote(cur.voiceId, midi, false, volumeRef.current);
        const sv = ptStringVoiceRef.current.get(pos.string);
        if (sv?.pid === e.pointerId) ptStringVoiceRef.current.set(pos.string, { pid: e.pointerId, voiceId: id });
        else releaseNote(id);
      }
    }
  }
  async function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const curEntry = ptHeldRef.current.get(e.pointerId);
    if (!curEntry) return;
    const pos = getPos(e, { string: curEntry.string, fret: curEntry.fret });
    if (!pos) return;
    if (pos.string === curEntry.string && pos.fret === curEntry.fret) return;
    const midi = effectiveMidi(pos.string, pos.fret, centsRef.current[pos.string]);
    if (pos.string === curEntry.string) {
      ptHeldRef.current.set(e.pointerId, { string: pos.string, fret: pos.fret, midi });
      const sv = ptStringVoiceRef.current.get(pos.string);
      if (sv?.pid === e.pointerId) {
        syncPt();
        const id = await switchNote(sv.voiceId, midi, false, volumeRef.current);
        const sv2 = ptStringVoiceRef.current.get(pos.string);
        if (sv2?.pid === e.pointerId) ptStringVoiceRef.current.set(pos.string, { pid: e.pointerId, voiceId: id });
        else releaseNote(id);
      } else if (sv) {
        const activeEntry = ptHeldRef.current.get(sv.pid);
        if (activeEntry && pos.fret > activeEntry.fret) {
          ptStringVoiceRef.current.set(pos.string, { pid: e.pointerId, voiceId: -1 });
          syncPt();
          const id = await switchNote(sv.voiceId, midi, false, volumeRef.current);
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
          const id = await switchNote(oldVoice.voiceId, next.midi, false, volumeRef.current);
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
        ptStringVoiceRef.current.set(pos.string, { pid: e.pointerId, voiceId: -1 });
        syncPt();
        const id = await playNote(midi, false, volumeRef.current);
        const sv = ptStringVoiceRef.current.get(pos.string);
        if (sv?.pid === e.pointerId) ptStringVoiceRef.current.set(pos.string, { pid: e.pointerId, voiceId: id });
        else releaseNote(id);
      } else if (newVoice) {
        const activeEntry = ptHeldRef.current.get(newVoice.pid);
        if (activeEntry && pos.fret > activeEntry.fret) {
          ptStringVoiceRef.current.set(pos.string, { pid: e.pointerId, voiceId: -1 });
          syncPt();
          const id = await switchNote(newVoice.voiceId, midi, false, volumeRef.current);
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
    const curEntry = ptHeldRef.current.get(e.pointerId);
    if (!curEntry) return;
    ptHeldRef.current.delete(e.pointerId);
    const cur = ptStringVoiceRef.current.get(curEntry.string);
    if (!cur || cur.pid !== e.pointerId) { syncPt(); return; }
    const next = getHighestOnPtString(curEntry.string);
    if (next) {
      ptStringVoiceRef.current.set(curEntry.string, { pid: next.pid, voiceId: -1 });
      syncPt();
      const id = await switchNote(cur.voiceId, next.midi, false, volumeRef.current);
      const sv = ptStringVoiceRef.current.get(curEntry.string);
      if (sv?.pid === next.pid) ptStringVoiceRef.current.set(curEntry.string, { pid: next.pid, voiceId: id });
      else releaseNote(id);
    } else {
      ptStringVoiceRef.current.delete(curEntry.string);
      syncPt();
      if (cur.voiceId >= 0) releaseNote(cur.voiceId);
    }
  }

  function interactionOverlay() {
    const posList = kbMode ? kbPositions : ptPositions;
    if (posList.length === 0) return null;
    return (
      <>
        {posList.map(({ string, fret }) => {
          const markerX = fretX(fret);
          const sy = stringY(string);
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

  return (
    <div className="midi-instrument-host">
    <div className="reduced-fretboard-wrap" ref={scrollRef}>
    <svg
      ref={svgRef}
      className="reduced-fretboard"
      viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
      role="img"
      aria-label={ariaLabel}
      style={{ touchAction: 'none', cursor: 'pointer', userSelect: 'none', maxWidth: `${svgWidthPercent}%`, width: `${svgWidthPercent}%` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <rect className="reduced-board-bg" x={boardX} y={boardY} width={boardWidth} height={boardHeight} />
      {Array.from({ length: 6 }, (_, index) => (
        <line className="reduced-string" key={`string-${index + 1}`} x1={boardX} x2={boardX + boardWidth} y1={stringY(index + 1)} y2={stringY(index + 1)} />
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
          cy={stringY(dot.string ?? 3.5)}
          key={`guide-${dot.fret}-${dot.string ?? 'center'}`}
          r="7"
        />
      ))}
      {notes.map((note) => (
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
      {fretLabels && Array.from(
        { length: startFret === 0 ? endFret + 1 : endFret - startFret + 1 },
        (_, index) => {
          const fret = startFret === 0 ? index : startFret + index;
          return (
            <text className="reduced-fret-number" key={`fretnum-${fret}`} x={fretX(fret)} y={bottomLabelY}>
              {fret}
            </text>
          );
        }
      )}
      <NoteMarksOverlay
        endFret={endFret}
        getNoteName={(string, fret) => noteNameForFret(string, fret, cents[string])}
        getX={fretX}
        getY={stringY}
        marks={marks}
        startFret={startFret}
      />
      {allowTuning && showTuning && [1, 2, 3, 4, 5, 6].map((string) => (
        <TuningPeg
          ariaLabel={`Clavija de la cuerda ${string}`}
          key={`tuning-peg-${string}`}
          onStepChange={(next) => setCents((c) => ({ ...c, [string]: next }))}
          stepValue={cents[string]}
          x={drawX(PEG_X)}
          y={stringY(string)}
        />
      ))}
      {interactionOverlay()}
    </svg>
    </div>
    <HorizontalScrollbar targetRef={scrollRef} />
    <MidiInstrumentChrome
      belowNote={allowLeftHanded && kbMode && lefty && <KeyboardLeftyNote />}
      warning={kbMode && kbGhostWarn && (
        <span style={{ fontSize: '11px', color: '#92400e', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '4px', padding: '2px 6px', whiteSpace: 'nowrap' }}>
          ⚠ Necesitas teclado gaming para tocar ciertos acordes
        </span>
      )}
    >
      {allowLeftHanded && <HandednessToggleButton lefty={lefty} onClick={() => setLefty(l => !l)} />}
      {allowTuning && (
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
      <PaletteToggleButton active={paintMode} onClick={() => setPaintMode(p => !p)} />
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
          aria-label="Volumen de la guitarra"
          max="1" min="0" step="0.05"
          style={{ accentColor: '#047857', cursor: 'pointer', width: '112px' }}
          type="range"
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
        />
      </label>
      <MetronomeControls {...metr} />
    </MidiInstrumentChrome>
    </div>
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

      .reduced-fret-number-above {
        fill: #080808;
        font-size: 15px;
        font-weight: 700;
        text-anchor: middle;
      }
    `}</style>
  );
}
