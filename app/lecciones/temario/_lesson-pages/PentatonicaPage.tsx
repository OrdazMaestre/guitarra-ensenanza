'use client';
import { useEffect, useRef, useState } from 'react';
import { ReducedFretboardDiagram, ReducedFretboardStyles } from '../../../components/guitar/ReducedFretboardDiagram';
import Link from 'next/link';
import { playNote, preloadSamples, releaseNote, switchNote } from '@/app/lib/guitarAudioEngine';
import { FRETBOARD_KEYMAP, FRETBOARD_KEYMAP_UPPER, hasKeyboardGhosting } from '@/app/lib/fretboardKeymap';
import TemarioPager from '../TemarioPager';
import type { LessonPageProps } from './types';
import { useMetronome } from '@/app/lib/useMetronome';
import MetronomeControls from '@/app/components/guitar/MetronomeControls';
import MidiInstrumentChrome from '@/app/components/guitar/MidiInstrumentChrome';

const OPEN_STRING_MIDI: Record<number, number> = {
  1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40,
};

function getPentaSvgCoords(
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

const gTriadNotes = [
  { fret: 3, label: 'G', string: 1, highlight: true },
  { fret: 7, label: 'B', string: 1 },
  { fret: 10, label: 'D', string: 1 },
  { fret: 0, label: 'B', string: 2, highlight: true },
  { fret: 3, label: 'D', string: 2 },
  { fret: 8, label: 'G', string: 2 },
  { fret: 0, label: 'G', string: 3, highlight: true },
  { fret: 4, label: 'B', string: 3 },
  { fret: 7, label: 'D', string: 3 },
  { fret: 0, label: 'D', string: 4, highlight: true },
  { fret: 5, label: 'G', string: 4 },
  { fret: 9, label: 'B', string: 4 },
  { fret: 2, label: 'B', string: 5, highlight: true },
  { fret: 5, label: 'D', string: 5 },
  { fret: 10, label: 'G', string: 5 },
  { fret: 3, label: 'G', string: 6, highlight: true },
  { fret: 7, label: 'B', string: 6 },
  { fret: 10, label: 'D', string: 6 },
  { fret: 12, label: 'B', string: 2 },
  { fret: 12, label: 'G', string: 3 },
  { fret: 12, label: 'D', string: 4 },
];

const pentatonicNotes = ['G', 'A', 'B', 'D', 'E'];

const stringTunings = [
  { label: 'E', open: 4 },
  { label: 'B', open: 11 },
  { label: 'G', open: 7 },
  { label: 'D', open: 2 },
  { label: 'A', open: 9 },
  { label: 'E', open: 4 },
];

const chromaticNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const fretNotes = stringTunings.flatMap((string, stringIndex) =>
  Array.from({ length: 13 }, (_, fret) => {
    const note = chromaticNotes[(string.open + fret) % chromaticNotes.length];

    return pentatonicNotes.includes(note)
      ? {
          fret,
          note,
          string: stringIndex + 1,
        }
      : null;
  }).filter((item): item is { fret: number; note: string; string: number } => item !== null),
);

function PentatonicFretboard() {
  const boardX = 48;
  const boardY = 48;
  const fretWidth = 76;
  const boardWidth = fretWidth * 12;
  const boardHeight = 172;
  const stringGap = boardHeight / 5;
  const stringY = (string: number) => boardY + (string - 1) * stringGap;
  const fretX = (fret: number) => (fret === 0 ? boardX - 24 : boardX + (fret - 0.5) * fretWidth);

  const svgRef = useRef<SVGSVGElement>(null);
  const ptHeldRef = useRef(new Map<number, { string: number; fret: number; midi: number }>());
  const ptStringVoiceRef = useRef(new Map<number, { pid: number; voiceId: number }>());
  const [ptPositions, setPtPositions] = useState<{ string: number; fret: number }[]>([]);
  const [volume, setVolume] = useState(1.0);
  const [kbMode, setKbMode] = useState(false);
  const [kbRange, setKbRange] = useState<'lower' | 'upper'>('lower');

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
    const activeMap = kbRange === 'upper' ? FRETBOARD_KEYMAP_UPPER : FRETBOARD_KEYMAP;
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
      kbKeysHeldRef.current.set(e.code, entry);
      setKbGhostWarn(hasKeyboardGhosting(kbKeysHeldRef.current));
      if (!cur) {
        kbStringVoiceRef.current.set(entry.string, { code: e.code, voiceId: -1 });
        syncPositions();
        const id = await playNote(entry.midi, false, volumeRef.current);
        const sv = kbStringVoiceRef.current.get(entry.string);
        if (sv?.code === e.code) kbStringVoiceRef.current.set(entry.string, { code: e.code, voiceId: id });
        else releaseNote(id);
      } else {
        const curEntry = kbKeysHeldRef.current.get(cur.code);
        if (curEntry && entry.fret > curEntry.fret) {
          kbStringVoiceRef.current.set(entry.string, { code: e.code, voiceId: -1 });
          syncPositions();
          const id = await switchNote(cur.voiceId, entry.midi, false, volumeRef.current);
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
        const id = await switchNote(cur.voiceId, next.entry.midi, false, volumeRef.current);
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
  }, [kbMode, kbRange]);

  function getPos(e: React.PointerEvent<SVGSVGElement>, held?: { string: number; fret: number } | null): { string: number; fret: number } | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const coords = getPentaSvgCoords(e, svg);
    if (!coords) return null;
    const { x, y } = coords;
    const halfGap = stringGap / 2;
    if (y < boardY - halfGap || y > boardY + boardHeight + halfGap) return null;
    const string = Math.max(1, Math.min(6, Math.round((y - boardY) / stringGap) + 1));
    let fret: number;
    if (x < boardX) {
      if (x < boardX - 40) return null;
      fret = 0;
    } else {
      const colIndex = Math.floor((x - boardX) / fretWidth);
      fret = colIndex + 1;
      if (fret > 12) return null;
    }
    if (!held) return { string, fret };
    const EXP = 0.18;
    const rawSF = (y - boardY) / stringGap;
    const rawFF = (x - boardX) / fretWidth;
    const rStr = Math.abs(rawSF - (held.string - 1)) < 0.5 + EXP ? held.string : string;
    const rFret = held.fret === 0 ? (rawFF < EXP ? 0 : fret) : (Math.abs(rawFF - (held.fret - 0.5)) < 0.5 + EXP ? held.fret : fret);
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
    const midi = OPEN_STRING_MIDI[pos.string] + pos.fret;
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
    const midi = OPEN_STRING_MIDI[pos.string] + pos.fret;
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
          const noteIsMarked = fretNotes.some(n => n.string === string && n.fret === fret);
          return (
            <g key={`ko-${string}-${fret}`}
              pointerEvents="none"
              style={{ animation: 'fretboard-string-vibrate 80ms linear infinite' }}
            >
              <line
                x1={markerX}
                x2={boardX + boardWidth}
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
                r="17"
              />
            </g>
          );
        })}
      </>
    );
  }

  return (
    <div className="midi-instrument-host">
    <figure className="pentatonic-board-wrap">
      <svg
        ref={svgRef}
        className="pentatonic-board"
        viewBox="0 0 1020 318"
        role="img"
        aria-label="Mapa de la pentatónica mayor de Sol en los doce primeros trastes"
        style={{ touchAction: 'none', cursor: 'pointer', userSelect: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {Array.from({ length: 12 }, (_, fret) => (
          <text className="fret-number" key={`number-${fret + 1}`} x={boardX + fret * fretWidth + fretWidth / 2} y="26">
            {fret + 1}
          </text>
        ))}
        <text className="top-label" x={boardX + boardWidth / 2} y="40">
          trastes
        </text>

        <rect className="board-bg" x={boardX} y={boardY} width={boardWidth} height={boardHeight} />
        {Array.from({ length: 6 }, (_, index) => (
          <line className="string-line" key={`string-${index + 1}`} x1={boardX} x2={boardX + boardWidth} y1={stringY(index + 1)} y2={stringY(index + 1)} />
        ))}
        {Array.from({ length: 13 }, (_, fret) => (
          <line
            className={fret === 0 ? 'nut-line' : 'fret-line'}
            key={`fret-${fret}`}
            x1={boardX + fret * fretWidth}
            x2={boardX + fret * fretWidth}
            y1={boardY}
            y2={boardY + boardHeight}
          />
        ))}
        {[3, 5, 7, 9].map((fret) => (
          <circle className="guide-dot" cx={boardX + (fret - 0.5) * fretWidth} cy={stringY(3.5)} key={`guide-${fret}`} r="8" />
        ))}
        <circle className="guide-dot" cx={boardX + 11.5 * fretWidth} cy={stringY(2)} key="guide-12-top" r="8" />
        <circle className="guide-dot" cx={boardX + 11.5 * fretWidth} cy={stringY(5)} key="guide-12-bottom" r="8" />
        {fretNotes.map((item) => (
          <g key={`${item.string}-${item.fret}-${item.note}`}>
            <circle className={item.note === 'E' ? 'note-dot note-e' : item.note === 'G' ? 'note-dot note-g' : 'note-dot'} cx={fretX(item.fret)} cy={stringY(item.string)} r="17" />
            <text className="note-label" x={fretX(item.fret)} y={stringY(item.string) + 5}>
              {item.note}
            </text>
          </g>
        ))}
        {([3, 5, 7, 9, 12] as const).map((fret) => (
          <text className="roman-fret" key={`roman-${fret}`} x={boardX + (fret - 0.5) * fretWidth} y="240">
            {({ 3: 'III', 5: 'V', 7: 'VII', 9: 'IX', 12: 'XII' } as Record<number, string>)[fret]}
          </text>
        ))}
        <text className="bottom-label" x={boardX + boardWidth / 2} y="260">
          figuras
        </text>
        {[1, 2, 3, 4, 5].map((figure, index) => (
          <text className="figure-number" key={`figure-${figure}`} x={boardX + 76 + index * 190} y="294">
            {figure}
          </text>
        ))}
        {interactionOverlay()}
      </svg>
    </figure>
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

export default function PentatonicaPage({ previous, next }: LessonPageProps) {
  return (
    <main className="pentatonic-page">
      <article className="pentatonic-content">
        <header className="pentatonic-header">
          <h1>Pentatónica</h1>
          <div className="short-copy">
            <p>Al acorde de Sol Mayor le sumamos dos notas extra.</p>
            <p>Sol Mayor usa G, B y D.</p>
            <p>Ahora añadimos E y A.</p>
          </div>
        </header>

        <section className="reference-map-section" aria-labelledby="reference-map-title">
          <header className="section-header">
            <p className="lesson-kicker">Antes</p>
            <h2 id="reference-map-title">Arpegio de Sol Mayor</h2>
            <p>Este era nuestro mapa de 3 notas.</p>
            <p>G, B y D.</p>
          </header>
          <div className="arpegio-ref-wrap">
            <ReducedFretboardDiagram
              ariaLabel="Mapa del arpegio de Sol Mayor: G, B y D"
              startFret={0}
              endFret={12}
              notes={gTriadNotes}
            />
          </div>
        </section>

        <section className="map-section" aria-labelledby="map-title">
          <header className="section-header">
            <h2 id="map-title"><strong>pentatónica mayor de Sol</strong></h2>
            <p><strong>G, A, B, D y E</strong></p>
          </header>
          <PentatonicFretboard />
        </section>

        <section className="minor-box" aria-label="Relación con Mi menor">
          <p>Aquí también aparece la escala de Mi menor.</p>
          <p>
            Las pentatónicas de <strong>Mi menor</strong> y <strong>Sol Mayor</strong> son iguales.
          </p>
          <p>Usan las mismas notas.</p>
          <p>Pero una coloca el centro en Mi y la otra en Sol.</p>
        </section>

        <section className="memory-section" aria-labelledby="memory-title">
          <h2 id="memory-title">Pero son muchas notas. ¿Cómo las memorizo?</h2>
          <div className="short-copy">
            <p>Dividiendola en trozos.</p>
            <p>Practicando cada trozo por separado.</p>
            <p>Cada trozo coincide con una figura del acorde.</p>
          </div>
        </section>

        <section className="branch-section" aria-labelledby="branch-title">
          <p className="lesson-kicker">Ramas</p>
          <h2 id="branch-title">Caminos que salen de aquí</h2>
          <div className="branch-grid">
            <Link href="/lecciones/temario/ejercicios-pentatonica">
              <span>Ejercicios de pentatónica</span>
              <small>Para practicar las 5 figuras por partes.</small>
            </Link>
            <Link href="/lecciones/temario/pentatonica-blues">
              <span>Pentatónica de blues</span>
              <small>Para añadir la nota blues más adelante.</small>
            </Link>
          </div>
        </section>
      </article>

      <div className="lesson-pager-wrap">
        <TemarioPager previous={previous} next={next} />
      </div>

      <ReducedFretboardStyles />
      <style>{`
        .pentatonic-page {
          background: #ffffff;
          box-sizing: border-box;
          color: #080808;
          min-height: 100vh;
          overflow-x: clip;
          padding: clamp(28px, 5vw, 72px) clamp(16px, 5vw, 84px);
          width: 100%;
        }

        .pentatonic-content,
        .lesson-pager-wrap {
          box-sizing: border-box;
          margin: 0 auto;
          max-width: 1220px;
          min-width: 0;
          width: 100%;
        }

        .pentatonic-content {
          display: grid;
          gap: clamp(34px, 6vw, 78px);
          padding-bottom: clamp(34px, 6vw, 72px);
        }

        .lesson-kicker {
          color: #047857;
          font-size: 13px;
          font-weight: 950;
          letter-spacing: 0.22em;
          margin: 0 0 12px;
          text-transform: uppercase;
        }

        .pentatonic-header,
        .section-header,
        .memory-section,
        .branch-section {
          margin: 0 auto;
          max-width: 920px;
          text-align: center;
        }

        .pentatonic-header h1 {
          font-size: clamp(46px, 7.8vw, 104px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 0.9;
          margin: 0;
          overflow-wrap: break-word;
          text-transform: uppercase;
          text-decoration: underline;
          text-decoration-thickness: 0.06em;
          text-underline-offset: 0.11em;
        }

        .section-header h2,
        .memory-section h2,
        .branch-section h2 {
          font-size: clamp(30px, 4.7vw, 62px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 0.98;
          margin: 0;
          overflow-wrap: break-word;
          text-transform: uppercase;
        }

        .short-copy {
          display: grid;
          gap: 10px;
          margin: clamp(20px, 4vw, 32px) auto 0;
          max-width: 760px;
        }

        .short-copy p,
        .section-header p,
        .formula-box p,
        .minor-box p {
          color: #303030;
          font-size: clamp(18px, 2vw, 24px);
          font-weight: 650;
          line-height: 1.42;
          margin: 0;
          overflow-wrap: anywhere;
        }

        .formula-box,
        .minor-box {
          border: 4px solid #2f65ad;
          border-radius: 10px;
          display: grid;
          gap: 10px;
          margin: 0 auto;
          max-width: 980px;
          padding: clamp(18px, 3vw, 28px);
          text-align: center;
          width: 100%;
        }

        .formula-box strong,
        .minor-box strong {
          color: #080808;
          font-weight: 950;
        }

        .reference-map-section,
        .map-section {
          border-top: 1px solid #d4d4d8;
          display: grid;
          gap: clamp(18px, 3vw, 30px);
          min-width: 0;
          padding-top: clamp(24px, 4vw, 42px);
        }

        .arpegio-ref-wrap {
          margin: 0 auto;
          max-width: min(100%, 980px);
          min-width: 0;
          width: 100%;
        }

        .pentatonic-board-wrap {
          margin: 0;
          min-width: 0;
          overflow-x: auto;
          width: 100%;
        }

        .pentatonic-board {
          display: block;
          height: auto;
          margin: 0 auto;
          min-width: 760px;
          width: min(100%, 1080px);
        }

        .board-bg {
          fill: #26313d;
        }

        .string-line {
          stroke: #aab3bf;
          stroke-width: 3;
        }

        .fret-line {
          stroke: #d6dce4;
          stroke-width: 4;
        }

        .nut-line {
          stroke: #edf1f5;
          stroke-width: 8;
        }

        .guide-dot {
          fill: #cad2dc;
          opacity: 0.78;
        }

        .roman-fret {
          fill: #080808;
          font-size: 15px;
          font-weight: 950;
          text-anchor: middle;
        }

        .note-dot {
          fill: #f1f5f9;
          stroke: #a1a1aa;
          stroke-width: 3;
        }

        .note-e {
          stroke: #059669;
          stroke-width: 6;
        }

        .note-g {
          stroke: #2563eb;
          stroke-width: 6;
        }

        .note-label {
          fill: #080808;
          font-size: 20px;
          font-weight: 950;
          text-anchor: middle;
        }
        .fret-number,
        .figure-number,
        .top-label,
        .bottom-label {
          fill: #080808;
          font-weight: 950;
          text-anchor: middle;
        }

        .fret-number,
        .figure-number {
          font-size: 16px;
        }

        .top-label,
        .bottom-label {
          font-size: 15px;
        }

        .minor-box {
          border-radius: 48px;
        }

        .memory-section {
          border-top: 1px solid #d4d4d8;
          padding-top: clamp(24px, 4vw, 42px);
        }

        .branch-section {
          border: 2px solid #bfd7ff;
          border-radius: 10px;
          display: grid;
          gap: 18px;
          padding: clamp(18px, 3vw, 28px);
          width: 100%;
        }

        .branch-grid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .branch-grid a {
          border: 2px solid #080808;
          border-radius: 8px;
          color: #080808;
          display: grid;
          gap: 8px;
          min-width: 0;
          padding: 18px;
          text-align: left;
          text-decoration: none;
          transition: border-color 160ms ease, color 160ms ease;
        }

        .branch-grid a:hover,
        .branch-grid a:focus-visible {
          border-color: #047857;
          color: #047857;
        }

        .branch-grid a:focus-visible {
          outline: 3px solid #047857;
          outline-offset: 4px;
        }

        .branch-grid span {
          font-size: clamp(18px, 2vw, 24px);
          font-weight: 950;
          line-height: 1.15;
          overflow-wrap: anywhere;
        }

        .branch-grid small {
          color: #303030;
          font-size: 15px;
          font-weight: 700;
          line-height: 1.35;
          overflow-wrap: anywhere;
        }

        @media (max-width: 760px) {
          .pentatonic-header,
          .section-header,
          .formula-box,
          .minor-box,
          .memory-section,
          .branch-section {
            text-align: left;
          }

          .minor-box {
            border-radius: 10px;
          }

          .branch-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 520px) {
          .pentatonic-content,
          .lesson-pager-wrap {
            max-width: 320px;
          }
        }
      `}</style>
    </main>
  );
}
