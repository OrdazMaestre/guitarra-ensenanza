'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { playNote, preloadSamples, releaseNote, switchNote } from '@/app/lib/guitarAudioEngine';
import { FRETBOARD_KEYMAP, FRETBOARD_KEYMAP_UPPER, hasKeyboardGhosting, type FretKeyEntry } from '@/app/lib/fretboardKeymap';
import MidiInstrumentChrome from '../guitar/MidiInstrumentChrome';
import TuningPeg from './TuningPeg';
import {
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
  const [cents, setCents] = useState<Record<StringNumber, number>>({
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    6: 0,
  });
  const [volume, setVolume] = useState(1.0);
  const [pointerPositions, setPointerPositions] = useState<{ string: StringNumber; fret: number }[]>([]);
  const [kbMode, setKbMode] = useState(false);
  const [kbRange, setKbRange] = useState<'lower' | 'upper'>('lower');
  const [kbGhostWarn, setKbGhostWarn] = useState(false);
  const [kbPositions, setKbPositions] = useState<{ string: StringNumber; fret: number }[]>([]);

  const svgRef = useRef<SVGSVGElement>(null);
  const ptVoicesRef = useRef(new Map<number, { string: StringNumber; fret: number; voiceId: number }>());
  const kbKeysHeldRef = useRef(new Map<string, FretKeyEntry & { voiceId: number }>());
  const volumeRef = useRef(volume);
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);
  const centsRef = useRef(cents);
  useEffect(() => {
    centsRef.current = cents;
  }, [cents]);

  useEffect(() => {
    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(() => preloadSamples());
      return () => cancelIdleCallback(id);
    }
    const id = window.setTimeout(() => preloadSamples(), 300);
    return () => window.clearTimeout(id);
  }, []);

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
    },
    [],
  );

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
              />
              <text className="tuning-open-note" x={BOARD_X - 12} y={y + 5}>
                {noteName}
              </text>
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
              <text className="tuning-note-marker-label" x={markerX} y={y + 4}>
                {noteName}
              </text>
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
