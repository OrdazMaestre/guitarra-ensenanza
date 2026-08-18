'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AlphaTabPlayer from '../../../components/guitar/AlphaTabPlayer';
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

function getChordSvgCoords(
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

const gMajorNotes = ['G', 'A', 'B', 'C', 'D', 'E', 'F#'];
const chromaticNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const stringTunings = [
  { label: 'E', open: 4 },
  { label: 'B', open: 11 },
  { label: 'G', open: 7 },
  { label: 'D', open: 2 },
  { label: 'A', open: 9 },
  { label: 'E', open: 4 },
];

type ChordMap = {
  highlightedNotes: Array<{ fret: number; string: number }>;
  roman: string;
  title: string;
};

const chordMaps: ChordMap[] = [
  {
    highlightedNotes: [
      { fret: 3, string: 6 }, { fret: 2, string: 5 }, { fret: 0, string: 4 },
      { fret: 0, string: 3 }, { fret: 0, string: 2 }, { fret: 3, string: 1 },
    ],
    roman: 'I', title: 'G',
  },
  {
    highlightedNotes: [
      { fret: 0, string: 1 }, { fret: 1, string: 2 }, { fret: 2, string: 3 },
      { fret: 2, string: 4 }, { fret: 0, string: 5 }, { fret: 0, string: 6 },
    ],
    roman: 'ii', title: 'Am',
  },
  {
    highlightedNotes: [
      { fret: 2, string: 1 }, { fret: 3, string: 2 }, { fret: 4, string: 3 },
      { fret: 4, string: 4 }, { fret: 2, string: 5 }, { fret: 2, string: 6 },
    ],
    roman: 'iii', title: 'Bm',
  },
  {
    highlightedNotes: [
      { fret: 0, string: 1 }, { fret: 1, string: 2 }, { fret: 0, string: 3 },
      { fret: 2, string: 4 }, { fret: 3, string: 5 }, { fret: 0, string: 6 },
    ],
    roman: 'IV', title: 'C',
  },
  {
    highlightedNotes: [
      { fret: 2, string: 1 }, { fret: 3, string: 2 }, { fret: 2, string: 3 },
      { fret: 0, string: 4 }, { fret: 0, string: 5 }, { fret: 2, string: 6 },
    ],
    roman: 'V', title: 'D',
  },
  {
    highlightedNotes: [
      { fret: 0, string: 6 }, { fret: 2, string: 5 }, { fret: 2, string: 4 },
      { fret: 0, string: 3 }, { fret: 0, string: 2 }, { fret: 0, string: 1 },
    ],
    roman: 'vi', title: 'Em',
  },
  {
    highlightedNotes: [
      { fret: 2, string: 3 }, { fret: 4, string: 4 },
      { fret: 3, string: 5 }, { fret: 2, string: 6 },
    ],
    roman: 'vii disminuido', title: 'F# disminuido',
  },
];

const chordProgressionTab = `\\title "Acordes de Sol Mayor"
\\tempo 72
.
:2
(3.6 2.5 0.4 0.3 0.2 3.1){ch "G"} |
(0.6 0.5 2.4 2.3 1.2 0.1){ch "Am"} |
(2.6 2.5 4.4 4.3 3.2 2.1){ch "Bm"} |
(0.6 3.5 2.4 0.3 1.2 0.1){ch "C"} |
(2.6 0.5 0.4 2.3 3.2 2.1){ch "D"} |
(0.6 2.5 2.4 0.3 0.2 0.1){ch "Em"} |
(2.6 3.5 4.4 2.3){ch "F#dim"} |
(3.6 2.5 0.4 0.3 0.2 3.1){ch "G"} |`;

function noteNameForFret(open: number, fret: number) {
  return chromaticNotes[(open + fret) % chromaticNotes.length];
}

type FretboardProps = {
  chord: ChordMap;
  kbMode: boolean;
  kbPositions: { string: number; fret: number }[];
  volumeRef: React.RefObject<number>;
};

function ChordScaleFretboard({ chord, kbMode, kbPositions, volumeRef }: FretboardProps) {
  const boardX = 44;
  const boardY = 30;
  const fretWidth = 54;
  const boardHeight = 150;
  const stringGap = boardHeight / 5;
  const boardWidth = fretWidth * 5;
  const viewBoxWidth = boardX + boardWidth + 34;
  const viewBoxHeight = boardY + boardHeight + 36;
  const stringY = (string: number) => boardY + (string - 1) * stringGap;
  const fretX = (fret: number) => (fret === 0 ? boardX - 20 : boardX + (fret - 0.5) * fretWidth);

  const notes = stringTunings.flatMap((string, stringIndex) =>
    Array.from({ length: 6 }, (_, fret) => {
      const label = noteNameForFret(string.open, fret);
      return gMajorNotes.includes(label)
        ? {
            fret,
            inChord: chord.highlightedNotes.some(
              (n) => n.fret === fret && n.string === stringIndex + 1,
            ),
            label,
            string: stringIndex + 1,
          }
        : null;
    }).filter((n): n is { fret: number; inChord: boolean; label: string; string: number } => n !== null),
  );

  const svgRef = useRef<SVGSVGElement>(null);
  const ptHeldRef = useRef(new Map<number, { string: number; fret: number; midi: number }>());
  const ptStringVoiceRef = useRef(new Map<number, { pid: number; voiceId: number }>());
  const [ptPositions, setPtPositions] = useState<{ string: number; fret: number }[]>([]);

  function getPos(e: React.PointerEvent<SVGSVGElement>, held?: { string: number; fret: number } | null): { string: number; fret: number } | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const coords = getChordSvgCoords(e, svg);
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
      if (fret > 5) return null;
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
          const noteIsMarked = notes.some(n => n.string === string && n.fret === fret);
          return (
            <g key={`ko-${string}-${fret}`}
              pointerEvents="none"
              style={{ animation: 'fretboard-string-vibrate 80ms linear infinite' }}
            >
              <line
                x1={markerX} x2={boardX + boardWidth} y1={sy} y2={sy}
                stroke="#fbbf24" strokeLinecap="round" strokeWidth="3" opacity="0.85"
              />
              <circle
                cx={markerX} cy={sy}
                fill="#fbbf24" opacity={noteIsMarked ? 0.5 : 0.9} r="16"
              />
              <text x={markerX} y={sy + 4} fill="#b45309" fontSize="12" fontWeight="900" textAnchor="middle">
                {noteNameForFret(stringTunings[string - 1].open, fret)}
              </text>
            </g>
          );
        })}
      </>
    );
  }

  return (
    <figure className="chord-map">
      <figcaption>
        <span>{chord.roman}</span>
        {chord.title}
      </figcaption>
      <svg
        ref={svgRef}
        className="chord-board"
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        role="img"
        aria-label={`${chord.title} dentro de la escala de Sol Mayor en los trastes 0 al 4`}
        style={{ touchAction: 'none', cursor: 'pointer', userSelect: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <rect className="board-bg" x={boardX} y={boardY} width={boardWidth} height={boardHeight} />
        {stringTunings.map((string, index) => (
          <g key={`${string.label}-${index}`}>
            <text className="string-label" x="18" y={stringY(index + 1) + 5}>{string.label}</text>
            <line className="string-line" x1={boardX} x2={boardX + boardWidth} y1={stringY(index + 1)} y2={stringY(index + 1)} />
          </g>
        ))}
        {Array.from({ length: 6 }, (_, fret) => (
          <line
            className={fret === 0 ? 'nut-line' : 'fret-line'}
            key={`fret-${fret}`}
            x1={boardX + fret * fretWidth} x2={boardX + fret * fretWidth}
            y1={boardY} y2={boardY + boardHeight}
          />
        ))}
        <circle className="guide-dot" cx={boardX + 2.5 * fretWidth} cy={stringY(3.5)} r="7" />
        <text className="roman-fret" x={boardX + 2.5 * fretWidth} y={boardY + boardHeight + 22}>III</text>
        {notes.map((note) => (
          <g key={`${note.string}-${note.fret}-${note.label}`}>
            <circle
              className={`note-dot${note.inChord ? ' note-chord' : ''}`}
              cx={fretX(note.fret)} cy={stringY(note.string)}
              r={note.inChord ? 16 : 13}
            />
            <text className="note-label" x={fretX(note.fret)} y={stringY(note.string) + 5}>
              {note.label}
            </text>
          </g>
        ))}
        {interactionOverlay()}
      </svg>
    </figure>
  );
}

export default function AcordesEscalaSolMayorPage({ previous, next }: LessonPageProps) {
  const [volume, setVolume] = useState(1.0);
  const [kbMode, setKbMode] = useState(false);
  const [kbRange, setKbRange] = useState<'lower' | 'upper'>('lower');
  const volumeRef = useRef(volume);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  const metr = useMetronome();

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

  return (
    <main className="scale-chords-page">
      <article className="scale-chords-content">
        <header className="scale-chords-header">
          <h1>Acordes de la escala de Sol Mayor y Mi menor</h1>
          <div className="short-copy">
            <p>Ya conocemos la escala completa.</p>
            <p>Ahora sacamos sus acordes.</p>
          </div>
        </header>

        <section className="formula-box" aria-label="Acordes de Sol Mayor y Mi menor">
          <p>
            <strong>Sol Mayor:</strong> G, Am, Bm, C, D, Em y F# disminuido.
          </p>
          <p>
            <strong>Mi menor:</strong> Em, F# disminuido, G, Am, Bm, C y D.
          </p>
        </section>

        <section className="map-section" aria-labelledby="maps-title">
          <header className="section-header">
            <h2 id="maps-title">Trastes 0 al 5</h2>
          </header>

          <div className="midi-instrument-host">
          <div className="chord-grid">
            {chordMaps.map((chord) => (
              <ChordScaleFretboard
                key={chord.title}
                chord={chord}
                kbMode={kbMode}
                kbPositions={kbPositions}
                volumeRef={volumeRef}
              />
            ))}
          </div>

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
        </section>

        <section className="exercise-section" aria-labelledby="exercise-title">
          <div className="exercise-copy">
            <p className="lesson-kicker">Ejercicio</p>
            <h2 id="exercise-title">Progresion completa en orden</h2>
          </div>
          {/* Esta tablatura concreta se comporta distinto a las demas en AlphaTab:
              por detalles que aun no tenemos aislados, el scroll/seguimiento horizontal
              se desalineaba. La dejamos compacta, centrada y sin seguimiento de scroll
              solo aqui para que se vea decente sin afectar al resto de tablaturas. */}
          <AlphaTabPlayer
            centerHorizontalContent
            compact
            disablePlaybackScrollFollow
            horizontalBarFit={{
              barCount: 8,
              firstBarWidth: 132,
              maxRestBarWidth: 92,
              minRestBarWidth: 64,
              sidePadding: 260,
            }}
            horizontalLeftCrop={44}
            layout="horizontal"
            minHeight={230}
            showHorizontalScrollbar={false}
            tab={chordProgressionTab}
            title="Acordes de Sol Mayor"
          />
        </section>

        <section className="practice-link" aria-label="Extension de acordes">
          <Link href="/lecciones/temario/acordes-con-septima">Acordes con séptima</Link>
        </section>
      </article>

      <div className="lesson-pager-wrap">
        <TemarioPager previous={previous} next={next} />
      </div>

      <style>{`
        .scale-chords-page {
          background: #ffffff;
          box-sizing: border-box;
          color: #080808;
          min-height: 100vh;
          overflow-x: clip;
          padding: clamp(60px, 8vw, 104px) clamp(16px, 5vw, 84px) clamp(28px, 5vw, 72px);
          width: 100%;
        }

        .scale-chords-content,
        .lesson-pager-wrap {
          box-sizing: border-box;
          margin: 0 auto;
          max-width: 1180px;
          min-width: 0;
          width: 100%;
        }

        .scale-chords-content {
          display: grid;
          gap: clamp(32px, 5vw, 64px);
          padding-bottom: clamp(34px, 6vw, 72px);
        }

        .scale-chords-header,
        .section-header {
          margin: 0 auto;
          max-width: 940px;
          text-align: center;
        }

        .lesson-kicker {
          color: #047857;
          font-size: 13px;
          font-weight: 950;
          letter-spacing: 0.2em;
          margin: 0;
          text-transform: uppercase;
        }

        .scale-chords-header h1 {
          font-size: clamp(36px, 6.7vw, 84px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 0.94;
          margin: 12px 0 0;
          overflow-wrap: break-word;
          text-transform: uppercase;
          text-decoration: underline;
          text-decoration-thickness: 0.06em;
          text-underline-offset: 0.11em;
        }

        .short-copy,
        .section-header,
        .exercise-copy {
          display: grid;
          gap: 10px;
        }

        .short-copy {
          margin: clamp(20px, 4vw, 32px) auto 0;
          max-width: 720px;
        }

        .short-copy p,
        .formula-box p,
        .section-header p,
        .exercise-copy p {
          color: #303030;
          font-size: clamp(18px, 2vw, 24px);
          font-weight: 650;
          line-height: 1.42;
          margin: 0;
          overflow-wrap: anywhere;
        }

        .formula-box {
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

        .practice-link {
          border: 4px solid #047857;
          border-radius: 10px;
          display: grid;
          margin: 0 auto;
          max-width: 980px;
          padding: clamp(18px, 3vw, 28px);
          text-align: center;
          width: 100%;
        }

        .practice-link a {
          color: #080808;
          font-size: clamp(20px, 2.4vw, 30px);
          font-weight: 950;
          line-height: 1.16;
          overflow-wrap: anywhere;
          text-decoration-color: #047857;
          text-decoration-thickness: 3px;
          text-underline-offset: 6px;
        }

        .practice-link a:hover,
        .practice-link a:focus-visible {
          color: #047857;
        }

        .practice-link a:focus-visible {
          outline: 3px solid #047857;
          outline-offset: 4px;
        }

        .formula-box strong {
          color: #080808;
          font-weight: 950;
        }

        .map-section,
        .exercise-section {
          border-top: 1px solid #d4d4d8;
          display: grid;
          gap: clamp(22px, 4vw, 38px);
          min-width: 0;
          padding-top: clamp(24px, 4vw, 42px);
        }

        .section-header h2,
        .exercise-copy h2 {
          font-size: clamp(28px, 4.6vw, 56px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 1;
          margin: 0;
          overflow-wrap: break-word;
          text-transform: uppercase;
        }

        .chord-grid {
          display: grid;
          gap: clamp(24px, 4vw, 42px);
          grid-template-columns: repeat(2, minmax(0, 1fr));
          min-width: 0;
        }

        .chord-map {
          display: grid;
          gap: 10px;
          margin: 0;
          min-width: 0;
        }

        .chord-map:first-child {
          grid-column: 1 / -1;
          justify-self: center;
          max-width: 470px;
          width: 100%;
        }

        .chord-map figcaption {
          color: #080808;
          font-size: clamp(18px, 2vw, 24px);
          font-weight: 950;
          line-height: 1.1;
          text-align: center;
        }

        .chord-map figcaption span {
          color: #047857;
          display: block;
          font-size: 12px;
          letter-spacing: 0.16em;
          margin-bottom: 4px;
          text-transform: uppercase;
        }

        .chord-board {
          display: block;
          height: auto;
          max-width: 100%;
          width: 100%;
        }

        .board-bg { fill: #27313d; }
        .string-label { fill: #080808; font-size: 15px; font-weight: 950; text-anchor: middle; }
        .string-line { stroke: #9ca3af; stroke-width: 3; }
        .fret-line { stroke: #d1d5db; stroke-width: 4; }
        .nut-line { stroke: #e5e7eb; stroke-width: 8; }
        .guide-dot { fill: #cbd5e1; opacity: 0.82; }
        .roman-fret { fill: #080808; font-size: 15px; font-weight: 950; text-anchor: middle; }
        .note-dot { fill: #f8fafc; stroke: #a1a1aa; stroke-width: 3; }
        .note-chord { fill: #f6c453; stroke: #9a6b00; stroke-width: 4; }
        .note-label { fill: #080808; font-size: 16px; font-weight: 950; text-anchor: middle; }

        @media (max-width: 760px) {
          .scale-chords-header,
          .section-header,
          .formula-box,
          .practice-link {
            text-align: left;
          }

          .chord-grid {
            grid-template-columns: 1fr;
          }

          .chord-map:first-child {
            grid-column: auto;
            justify-self: stretch;
            max-width: none;
          }
        }

        @media (max-width: 520px) {
          .scale-chords-content,
          .lesson-pager-wrap {
            max-width: 320px;
          }
        }
      `}</style>
    </main>
  );
}
