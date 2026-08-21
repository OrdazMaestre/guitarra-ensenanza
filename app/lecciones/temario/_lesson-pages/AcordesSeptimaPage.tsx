'use client';
import { useEffect, useRef, useState } from 'react';
import AlphaTabPlayer from '../../../components/guitar/AlphaTabPlayer';
import { playNote, preloadSamples, releaseNote, switchNote } from '@/app/lib/guitarAudioEngine';
import { FRETBOARD_KEYMAP, FRETBOARD_KEYMAP_UPPER, hasKeyboardGhosting } from '@/app/lib/fretboardKeymap';
import TemarioPager from '../TemarioPager';
import type { LessonPageProps } from './types';
import { useMetronome } from '@/app/lib/useMetronome';
import MetronomeControls from '@/app/components/guitar/MetronomeControls';
import MidiInstrumentChrome from '@/app/components/guitar/MidiInstrumentChrome';
import HorizontalScrollbar from '@/app/components/guitar/HorizontalScrollbar';

const OPEN_STRING_MIDI: Record<number, number> = {
  1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40,
};

function getSeptimaSvgCoords(
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

type SeventhChord = {
  degree: string;
  displayName?: string;
  firstFret: number;
  formula: string;
  fretCount: number;
  name: string;
  notes: string[];
  quality: string;
  seventh: string;
  voicing: Array<{
    fret: number;
    label: string;
    string: number;
  }>;
  voicingE2: Array<{
    fret: number;
    label: string;
    string: number;
  }>;
};

type CropPos = { chordName: string; fret: number; row: 'e4' | 'e2'; string: number };

const seventhChords: SeventhChord[] = [
  {
    degree: '1',
    firstFret: 1,
    formula: 'Mayor séptima',
    fretCount: 4,
    name: 'GMaj7',
    notes: ['G', 'B', 'D', 'F#'],
    quality: 'Mayor',
    seventh: 'F#',
    voicing: [
      { fret: 3, label: 'G', string: 1 },
      { fret: 3, label: 'D', string: 2 },
      { fret: 4, label: 'B', string: 3 },
      { fret: 3, label: 'F#', string: 4 },
    ],
    voicingE2: [
      { fret: 3, label: 'G', string: 6 },
      { fret: 5, label: 'D', string: 5 },
      { fret: 4, label: 'F#', string: 4 },
      { fret: 4, label: 'B', string: 3 },
    ],
  },
  {
    degree: '2',
    firstFret: 4,
    formula: 'menor séptima',
    fretCount: 5,
    name: 'Am7',
    notes: ['A', 'C', 'E', 'G'],
    quality: 'menor',
    seventh: 'G',
    voicing: [
      { fret: 5, label: 'A', string: 1 },
      { fret: 5, label: 'E', string: 2 },
      { fret: 5, label: 'C', string: 3 },
      { fret: 5, label: 'G', string: 4 },
    ],
    voicingE2: [
      { fret: 5, label: 'A', string: 6 },
      { fret: 7, label: 'E', string: 5 },
      { fret: 5, label: 'G', string: 4 },
      { fret: 5, label: 'C', string: 3 },
    ],
  },
  {
    degree: '3',
    firstFret: 6,
    formula: 'menor séptima',
    fretCount: 3,
    name: 'Bm7',
    notes: ['B', 'D', 'F#', 'A'],
    quality: 'menor',
    seventh: 'A',
    voicing: [
      { fret: 7, label: 'B', string: 1 },
      { fret: 7, label: 'F#', string: 2 },
      { fret: 7, label: 'D', string: 3 },
      { fret: 7, label: 'A', string: 4 },
    ],
    voicingE2: [
      { fret: 7, label: 'B', string: 6 },
      { fret: 9, label: 'F#', string: 5 },
      { fret: 7, label: 'A', string: 4 },
      { fret: 7, label: 'D', string: 3 },
    ],
  },
  {
    degree: '4',
    firstFret: 8,
    formula: 'Mayor séptima',
    fretCount: 4,
    name: 'CMaj7',
    notes: ['C', 'E', 'G', 'B'],
    quality: 'Mayor',
    seventh: 'B',
    voicing: [
      { fret: 8, label: 'C', string: 1 },
      { fret: 8, label: 'G', string: 2 },
      { fret: 9, label: 'E', string: 3 },
      { fret: 8, label: 'B', string: 4 },
    ],
    voicingE2: [
      { fret: 8, label: 'C', string: 6 },
      { fret: 10, label: 'G', string: 5 },
      { fret: 9, label: 'B', string: 4 },
      { fret: 9, label: 'E', string: 3 },
    ],
  },
  {
    degree: '5',
    firstFret: 10,
    formula: 'DOMINANTE séptima',
    fretCount: 4,
    name: 'D7',
    notes: ['D', 'F#', 'A', 'C'],
    quality: 'dominante',
    seventh: 'C',
    voicing: [
      { fret: 10, label: 'D', string: 1 },
      { fret: 11, label: 'A', string: 2 },
      { fret: 10, label: 'F#', string: 3 },
      { fret: 10, label: 'C', string: 4 },
    ],
    voicingE2: [
      { fret: 10, label: 'D', string: 6 },
      { fret: 12, label: 'A', string: 5 },
      { fret: 10, label: 'C', string: 4 },
      { fret: 11, label: 'F#', string: 3 },
    ],
  },
  {
    degree: '6',
    firstFret: 0,
    formula: 'menor séptima',
    fretCount: 3,
    name: 'Em7',
    notes: ['E', 'G', 'B', 'D'],
    quality: 'menor',
    seventh: 'D',
    voicing: [
      { fret: 0, label: 'E', string: 1 },
      { fret: 0, label: 'B', string: 2 },
      { fret: 0, label: 'G', string: 3 },
      { fret: 0, label: 'D', string: 4 },
    ],
    voicingE2: [
      { fret: 0, label: 'E', string: 6 },
      { fret: 2, label: 'B', string: 5 },
      { fret: 0, label: 'D', string: 4 },
      { fret: 0, label: 'G', string: 3 },
    ],
  },
  {
    degree: '7',
    displayName: 'F# semi-disminuido',
    firstFret: 1,
    formula: 'semi-disminuido',
    fretCount: 4,
    name: 'F#m7b5',
    notes: ['F#', 'A', 'C', 'E'],
    quality: 'semi-disminuido',
    seventh: 'E',
    voicing: [
      { fret: 2, label: 'F#', string: 1 },
      { fret: 1, label: 'C', string: 2 },
      { fret: 2, label: 'A', string: 3 },
      { fret: 2, label: 'E', string: 4 },
    ],
    voicingE2: [
      { fret: 2, label: 'F#', string: 6 },
      { fret: 3, label: 'C', string: 5 },
      { fret: 2, label: 'E', string: 4 },
      { fret: 2, label: 'A', string: 3 },
    ],
  },
];

const triadDegreeChords = ['G', 'Am', 'Bm', 'C', 'D', 'Em', 'F# disminuido', 'G'];
const seventhDegreeChords = ['GMaj7', 'Am7', 'Bm7', 'CMaj7', 'D7', 'Em7', 'F# semi-disminuido', 'GMaj7'];

function DegreeRow({ chords }: { chords: string[] }) {
  return (
    <div className="degree-row">
      {chords.map((chord, index) => (
        <span className="degree-cell" key={`${chord}-${index}`}>
          {chord}
          {index === chords.length - 1 ? '.' : null}
        </span>
      ))}
    </div>
  );
}

type ChordBox = { chord: SeventhChord; id: string; label: string };

const positionedChordNames = ['Em7', 'F#m7b5', 'GMaj7', 'Am7', 'Bm7', 'CMaj7', 'D7'] as const;
const positionedChords = positionedChordNames.map((name) => seventhChords.find((chord) => chord.name === name)!);
// The octave-up Em7 shape at fret 12 (same open notes, one octave higher) bookends the sequence
// on the right, mirroring the open Em7 box at the far left. voicingE2 is shifted +12 frets so the
// low-shape highlighting (G/D/low-E) lines up with the fret-12 column instead of the open position.
const openEm7Chord = seventhChords.find((chord) => chord.name === 'Em7')!;
const octaveEm7Chord: SeventhChord = {
  ...openEm7Chord,
  voicingE2: openEm7Chord.voicingE2.map((note) => ({ ...note, fret: note.fret + 12 })),
};
const positionedBoxes: ChordBox[] = [
  ...positionedChords.map((chord) => ({ chord, id: chord.name, label: chord.name })),
  { chord: octaveEm7Chord, id: 'Em7-12', label: octaveEm7Chord.name },
];
const chordCropRanges: Record<string, { end: number; labelX: number; start: number }> = {
  Em7: { end: 0, labelX: 82, start: 0 },
  'F#m7b5': { end: 2, labelX: 202, start: 1 },
  GMaj7: { end: 4, labelX: 334, start: 3 },
  Am7: { end: 5, labelX: 472, start: 5 },
  Bm7: { end: 7, labelX: 656, start: 7 },
  CMaj7: { end: 9, labelX: 794, start: 8 },
  D7: { end: 11, labelX: 978, start: 10 },
  'Em7-12': { end: 12, labelX: 1116, start: 12 },
};

const seventhProgressionTab = `\\title "Acordes con séptima"
\\tempo 68
.
:2
(4.4 4.3 3.2 3.1){ch "GMaj7"} |
(5.4 5.3 5.2 5.1){ch "Am7"} |
(7.4 7.3 7.2 7.1){ch "Bm7"} |
(8.4 9.3 8.2 8.1){ch "CMaj7"} |
(10.4 11.3 10.2 10.1){ch "D7"} |
(0.4 0.3 0.2 0.1){ch "Em7"} |
(2.4 2.3 1.2 2.1){ch "F#m7b5"} |
(4.4 4.3 3.2 3.1){ch "GMaj7"} |`;

const seventhProgressionE2Tab = `\\title "Acordes con séptima E2"
\\tempo 68
.
:2
(3.6 4.4 4.3 3.2){ch "GMaj7"} |
(5.6 5.4 5.3 5.2){ch "Am7"} |
(7.6 7.4 7.3 7.2){ch "Bm7"} |
(8.6 9.4 9.3 8.2){ch "CMaj7"} |
(10.6 10.4 11.3 10.2){ch "D7"} |
(0.6 0.4 0.3 0.2){ch "Em7"} |
(2.6 2.4 2.3 1.2){ch "F#m7b5"} |
(3.6 4.4 4.3 3.2){ch "GMaj7"} |`;

function noteNameForFret(open: number, fret: number) {
  return chromaticNotes[(open + fret) % chromaticNotes.length];
}

function ScaleWithChordPositions() {
  const boardX = 58;
  const boardY = 232;
  const fretWidth = 92;
  const boardWidth = fretWidth * 12;
  const boardHeight = 174;
  const stringGap = boardHeight / 5;
  const e4Row = { label: 'E4', mode: 'chordNotes', top: 44 } as const;
  const e2Row = { label: 'E2', mode: 'lowShape', top: 470 } as const;
  const miniFretWidth = 42;
  const miniStringGap = 22;
  const miniHeight = miniStringGap * 5;
  const viewBoxWidth = boardX + boardWidth + 74;
  const viewBoxHeight = e2Row.top + 26 + miniHeight + 34;
  const stringY = (string: number) => boardY + (string - 1) * stringGap;
  const fretX = (fret: number) => (fret === 0 ? boardX - 28 : boardX + (fret - 0.5) * fretWidth);

  const svgRef = useRef<SVGSVGElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const ptHeldRef = useRef(new Map<number, { string: number; fret: number; midi: number }>());
  const ptStringVoiceRef = useRef(new Map<number, { pid: number; voiceId: number }>());
  const [ptPositions, setPtPositions] = useState<{ string: number; fret: number }[]>([]);
  const cropVoiceMapRef = useRef(new Map<number, number>());
  const activeCropPointerRef = useRef(-1);
  const curCropRef = useRef<CropPos | null>(null);
  const [pressedCrop, setPressedCrop] = useState<CropPos | null>(null);
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
    const coords = getSeptimaSvgCoords(e, svg);
    if (!coords) return null;
    const { x, y } = coords;
    const halfGap = stringGap / 2;
    // Only main board zone — mini crops are at y≈44-180 and y≈470+, safely outside
    if (y < boardY - halfGap || y > boardY + boardHeight + halfGap) return null;
    const string = Math.max(1, Math.min(6, Math.round((y - boardY) / stringGap) + 1));
    let fret: number;
    if (x < boardX) {
      if (x < boardX - 44) return null;
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

  function getCropPos(e: React.PointerEvent<SVGSVGElement>): CropPos | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const coords = getSeptimaSvgCoords(e, svg);
    if (!coords) return null;
    const { x, y } = coords;
    let rowKey: 'e4' | 'e2';
    let top: number;
    if (y >= e4Row.top + 26 && y <= e4Row.top + 26 + miniHeight) {
      rowKey = 'e4';
      top = e4Row.top;
    } else if (y >= e2Row.top + 26 && y <= e2Row.top + 26 + miniHeight) {
      rowKey = 'e2';
      top = e2Row.top;
    } else {
      return null;
    }
    for (const box of positionedBoxes) {
      const range = chordCropRanges[box.id];
      const fretCount = range.end - range.start + 1;
      const cropWidth = fretCount * miniFretWidth;
      const cropX = range.labelX - cropWidth / 2;
      const openLeft = range.start === 0 ? cropX - 34 : cropX;
      if (x < openLeft || x > cropX + cropWidth) continue;
      const string = Math.max(1, Math.min(6, Math.round((y - (top + 26)) / miniStringGap) + 1));
      let fret: number;
      if (x < cropX) {
        fret = 0;
      } else {
        const colIndex = Math.floor((x - cropX) / miniFretWidth);
        fret = range.start + colIndex;
        if (fret > range.end) continue;
      }
      return { chordName: box.id, fret, row: rowKey, string };
    }
    return null;
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
    const svg = svgRef.current;
    if (!svg) return;
    const pos = getPos(e);
    if (pos) {
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
      return;
    }
    const cropPos = getCropPos(e);
    if (!cropPos) return;
    svg.setPointerCapture(e.pointerId);
    cropVoiceMapRef.current.set(e.pointerId, -1);
    activeCropPointerRef.current = e.pointerId;
    curCropRef.current = cropPos;
    setPressedCrop(cropPos);
    const id = await playNote(OPEN_STRING_MIDI[cropPos.string] + cropPos.fret, false, volumeRef.current);
    if (cropVoiceMapRef.current.has(e.pointerId)) {
      cropVoiceMapRef.current.set(e.pointerId, id);
    } else {
      releaseNote(id);
    }
  }
  async function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (ptHeldRef.current.has(e.pointerId)) {
      const curEntry = ptHeldRef.current.get(e.pointerId)!;
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
    } else if (cropVoiceMapRef.current.has(e.pointerId) && e.pointerId === activeCropPointerRef.current) {
      const cropPos = getCropPos(e);
      if (!cropPos) return;
      const cur = curCropRef.current;
      if (cur && cur.chordName === cropPos.chordName && cur.string === cropPos.string && cur.fret === cropPos.fret) return;
      curCropRef.current = cropPos;
      setPressedCrop(cropPos);
      const oldId = cropVoiceMapRef.current.get(e.pointerId) ?? -1;
      const id = await switchNote(oldId, OPEN_STRING_MIDI[cropPos.string] + cropPos.fret, false, volumeRef.current);
      if (cropVoiceMapRef.current.has(e.pointerId)) {
        cropVoiceMapRef.current.set(e.pointerId, id);
      } else {
        releaseNote(id);
      }
    }
  }
  async function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    if (ptHeldRef.current.has(e.pointerId)) {
      const curEntry = ptHeldRef.current.get(e.pointerId)!;
      ptHeldRef.current.delete(e.pointerId);
      const cur = ptStringVoiceRef.current.get(curEntry.string);
      if (!cur || cur.pid !== e.pointerId) { syncPt(); }
      else {
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
    }
    if (cropVoiceMapRef.current.has(e.pointerId)) {
      const voiceId = cropVoiceMapRef.current.get(e.pointerId) ?? -1;
      cropVoiceMapRef.current.delete(e.pointerId);
      if (voiceId >= 0) releaseNote(voiceId);
      if (e.pointerId === activeCropPointerRef.current) {
        activeCropPointerRef.current = -1;
        curCropRef.current = null;
        setPressedCrop(null);
      }
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
          const noteIsMarked = scaleNotes.some(n => n.string === string && n.fret === fret);
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
                r="15"
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

  function cropOverlay() {
    // Collect all active physical positions (string + fret) from every source
    const positions: Array<{ string: number; fret: number }> = [
      ...ptPositions,
      ...kbPositions,
      ...(pressedCrop ? [{ string: pressedCrop.string, fret: pressedCrop.fret }] : []),
    ];

    if (positions.length === 0) return null;

    const rows = [
      { rowKey: 'e4' as const, top: e4Row.top },
      { rowKey: 'e2' as const, top: e2Row.top },
    ];

    const elements: React.ReactNode[] = [];
    const seen = new Set<string>();

    for (const p of positions) {
      const posKey = `${p.string}-${p.fret}`;
      if (seen.has(posKey)) continue;
      seen.add(posKey);

      // Find the mini-crop column whose fret range covers this fret
      const box = positionedBoxes.find(b => {
        const r = chordCropRanges[b.id];
        return p.fret === 0 ? r.start === 0 : (p.fret >= r.start && p.fret <= r.end);
      });
      if (!box) continue;

      const range = chordCropRanges[box.id];
      const cropWidth = (range.end - range.start + 1) * miniFretWidth;
      const cropX = range.labelX - cropWidth / 2;
      const markerX = p.fret === 0 ? cropX - 17 : cropX + (p.fret - range.start + 0.5) * miniFretWidth;

      for (const { rowKey, top } of rows) {
        const markerY = top + 26 + (p.string - 1) * miniStringGap;
        const direct = pressedCrop !== null &&
          pressedCrop.chordName === box.id &&
          pressedCrop.string === p.string &&
          pressedCrop.fret === p.fret &&
          pressedCrop.row === rowKey;

        elements.push(
          <g key={`ol-${rowKey}-${box.id}-${p.string}-${p.fret}`} pointerEvents="none"
             style={direct ? { animation: 'fretboard-string-vibrate 80ms linear infinite' } : undefined}>
            <line x1={markerX} x2={cropX + cropWidth} y1={markerY} y2={markerY}
              stroke="#fbbf24" strokeLinecap="round" strokeWidth="2" opacity="0.85" />
            <circle cx={markerX} cy={markerY} fill="#fbbf24" opacity="0.85" r="12" />
            <text x={markerX} y={markerY + 3} fill="#b45309" fontSize="10" fontWeight="900" textAnchor="middle">
              {noteNameForFret(stringTunings[p.string - 1].open, p.fret)}
            </text>
          </g>
        );
      }
    }

    return elements.length === 0 ? null : <>{elements}</>;
  }

  const scaleNotes = stringTunings.flatMap((string, stringIndex) =>
    Array.from({ length: 13 }, (_, fret) => {
      const note = noteNameForFret(string.open, fret);

      return gMajorNotes.includes(note)
        ? {
            fret,
            note,
            string: stringIndex + 1,
          }
        : null;
    }).filter((item): item is { fret: number; note: string; string: number } => item !== null),
  );

  function MiniCrop({ box, mode, top }: { box: ChordBox; mode: 'chordNotes' | 'lowShape'; top: number }) {
    const { chord, id, label } = box;
    const range = chordCropRanges[id];
    const fretCount = range.end - range.start + 1;
    const cropWidth = fretCount * miniFretWidth;
    const cropX = range.labelX - cropWidth / 2;
    const cropStringY = (string: number) => top + 26 + (string - 1) * miniStringGap;
    const cropFretX = (fret: number) => (fret === 0 ? cropX - 17 : cropX + (fret - range.start + 0.5) * miniFretWidth);
    const lowShapeKeys = new Set(chord.voicingE2.map((note) => `${note.string}-${note.fret}`));
    const cropNotes = scaleNotes
      .filter((item) => item.fret >= range.start && item.fret <= range.end)
      .map((item) => ({
        ...item,
        inShape:
          mode === 'chordNotes'
            ? chord.notes.includes(item.note) && item.string !== 6
            : lowShapeKeys.has(`${item.string}-${item.fret}`) || (item.string === 2 && chord.notes.includes(item.note)),
      }));

    return (
      <g>
        <text className="mini-title" x={range.labelX} y={top - 12}>
          <tspan className="mini-degree">{chord.degree}</tspan>
          <tspan> {label}</tspan>
        </text>
        <rect className="mini-bg" x={cropX} y={top + 26} width={cropWidth} height={miniHeight} />
        {[1, 2, 3, 4, 5, 6].map((string) => (
          <line className="mini-string" key={`mini-string-${id}-${string}`} x1={cropX} x2={cropX + cropWidth} y1={cropStringY(string)} y2={cropStringY(string)} />
        ))}
        {Array.from({ length: fretCount + 1 }, (_, index) => (
          <line
            className={range.start === 0 && index === 0 ? 'mini-nut' : 'mini-fret'}
            key={`mini-fret-${id}-${index}`}
            x1={cropX + index * miniFretWidth}
            x2={cropX + index * miniFretWidth}
            y1={top + 26}
            y2={top + 26 + miniHeight}
          />
        ))}
        {[3, 5, 7, 9, 12].filter((fret) => fret >= range.start && fret <= range.end).map((fret) => (
          <circle className="mini-guide-dot" cx={cropX + (fret - range.start + 0.5) * miniFretWidth} cy={cropStringY(3.5)} key={`mini-guide-${id}-${fret}`} r="6" />
        ))}
        {cropNotes.map((note) => (
          <g key={`mini-${id}-${note.string}-${note.fret}`}>
            <circle className={note.inShape ? 'mini-note mini-note-shape' : note.note === 'G' ? 'mini-note mini-note-tonic' : 'mini-note'} cx={cropFretX(note.fret)} cy={cropStringY(note.string)} r="12" />
            <text className={note.note === 'G' ? 'mini-note-label mini-tonic-label' : 'mini-note-label'} x={cropFretX(note.fret)} y={cropStringY(note.string) + 4}>
              {note.note}
            </text>
          </g>
        ))}
      </g>
    );
  }

  function MiniRow({ row }: { row: { label: string; mode: 'chordNotes' | 'lowShape'; top: number } }) {
    return (
      <g>
        <text className="mini-row-label" x="8" y={row.top + 88}>
          {row.label}
        </text>
        {positionedBoxes.map((box) => (
          <MiniCrop box={box} key={`${row.label}-${box.id}`} mode={row.mode} top={row.top} />
        ))}
      </g>
    );
  }

  return (
    <div className="midi-instrument-host">
    <div className="position-scroll" ref={scrollRef}>
    <figure className="position-map" aria-label="Acordes con séptima colocados sobre el mástil de Sol Mayor">
      <svg
        ref={svgRef}
        className="position-board"
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        role="img"
        style={{ touchAction: 'none', cursor: 'pointer', userSelect: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <MiniRow row={e4Row} />

        {Array.from({ length: 12 }, (_, fret) => (
          <text className="fret-number" key={`number-${fret + 1}`} x={boardX + fret * fretWidth + fretWidth / 2} y={boardY - 18}>
            {fret + 1}
          </text>
        ))}
        <rect className="board-bg" x={boardX} y={boardY} width={boardWidth} height={boardHeight} />
        {stringTunings.map((string, index) => (
          <g key={`${string.label}-${index}`}>
            <text className="string-label" x="22" y={stringY(index + 1) + 5}>
              {string.label}
            </text>
            <line className="string-line" x1={boardX} x2={boardX + boardWidth} y1={stringY(index + 1)} y2={stringY(index + 1)} />
          </g>
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
        {([3, 5, 7, 9, 12] as const).map((fret) => (
          <text className="roman-fret" key={`roman-${fret}`} x={boardX + (fret - 0.5) * fretWidth} y={boardY + boardHeight + 22}>
            {({ 3: 'III', 5: 'V', 7: 'VII', 9: 'IX', 12: 'XII' } as Record<number, string>)[fret]}
          </text>
        ))}
        {scaleNotes.map((item) => {
          return (
            <g key={`${item.string}-${item.fret}-${item.note}`}>
              <circle
                className={item.note === 'G' ? 'note-dot note-g' : 'note-dot'}
                cx={fretX(item.fret)}
                cy={stringY(item.string)}
                r="15"
              />
              <text className={item.note === 'G' ? 'note-label note-tonic-label' : 'note-label'} x={fretX(item.fret)} y={stringY(item.string) + 5}>
                {item.note}
              </text>
            </g>
          );
        })}

        <MiniRow row={e2Row} />
        {interactionOverlay()}
        {cropOverlay()}
      </svg>
    </figure>
    </div>
    <HorizontalScrollbar targetRef={scrollRef} />
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

export default function AcordesSeptimaPage({ previous, next }: LessonPageProps) {
  return (
    <main className="seventh-chords-page">
      <article className="seventh-chords-content">
        <header className="seventh-header">
          <p className="lesson-kicker">Ampliacion acordes</p>
          <h1>Acordes con séptima: cuatriadas</h1>
          <div className="short-copy">
            <p>La escala tiene 7 notas y 7 acordes.</p>
            <p>Cada nota y acorde tienen un número: 1, 2, 3, 4, 5, 6 y 7.</p>
            <p>Un acorde triada usa las notas 1, 3 y 5.</p>
            <p>Un acorde con séptima usa las notas 1, 3, 5 y 7.</p>
                <section className="rule-box" aria-label="Acordes triada y cuatriada">
          <p>
            <strong>acorde Sol Mayor triada (G):</strong> G, B y D.
          </p>
          <p>
            <strong>Sol Mayor cuatriada (GMaj7):</strong> G, B, D y F#.
          </p>
        </section>
        
          </div>
          
        </header>
<section className="sequence-box" aria-label="Secuencia de acordes con séptima">
          <p>
            <strong>Escala de Sol Mayor</strong>
          </p>
          <p className="degree-row-label">
            <strong>Acordes Triada:</strong>
          </p>
          <DegreeRow chords={triadDegreeChords} />
          <p className="degree-row-label">
            <strong>Cuatríadas:</strong>
          </p>
          <DegreeRow chords={seventhDegreeChords} />
        </section>
        <section className="position-section" aria-labelledby="position-title">
          <header className="section-header">
            <h2 id="position-title">Acordes con séptima de la escala de Sol Mayor</h2>
          </header>
          <ScaleWithChordPositions />
        </section>

    

        

        <section className="exercise-section" aria-labelledby="exercise-title">
          <header className="section-header">
            <p className="lesson-kicker">Ejercicios</p>
            <h2 id="exercise-title">Usando cuerda Mi agudo (E4)</h2>
          </header>
          <div className="seventh-alphatab-frame seventh-alphatab-frame-top">
            <AlphaTabPlayer compact horizontalBarWidth={82} layout="horizontal" minHeight={230} tab={seventhProgressionTab} title="Acordes con séptima" />
          </div>
          <div className="exercise-subhead">
            <h3>Usando cuerda Mi grave (E2)</h3>
          </div>
          <div className="seventh-alphatab-frame">
            <AlphaTabPlayer compact horizontalBarWidth={82} layout="horizontal" minHeight={230} tab={seventhProgressionE2Tab} title="Acordes con séptima E2" />
          </div>
        </section>
      </article>

      <div className="lesson-pager-wrap">
        <TemarioPager previous={previous} next={next} />
      </div>

      <style>{`
        .seventh-chords-page {
          background: #ffffff;
          box-sizing: border-box;
          color: #080808;
          min-height: 100vh;
          overflow-x: clip;
          padding: clamp(34px, 5vw, 76px) clamp(16px, 5vw, 84px);
          width: 100%;
        }

        .seventh-chords-content,
        .lesson-pager-wrap {
          box-sizing: border-box;
          margin: 0 auto;
          max-width: 1220px;
          min-width: 0;
          width: 100%;
        }

        .seventh-chords-content {
          display: grid;
          gap: clamp(34px, 6vw, 72px);
          padding-bottom: clamp(34px, 6vw, 72px);
        }

        .lesson-kicker {
          color: #047857;
          font-size: 13px;
          font-weight: 950;
          letter-spacing: 0.22em;
          margin: 0;
          text-transform: uppercase;
        }

        .seventh-header,
        .section-header {
          margin: 0 auto;
          max-width: 940px;
          text-align: center;
        }

        .seventh-header h1,
        .section-header h2 {
          font-weight: 950;
          letter-spacing: 0;
          line-height: 0.96;
          margin: 12px 0 0;
          overflow-wrap: break-word;
          text-transform: uppercase;
        }

        .seventh-header h1 {
          font-size: clamp(38px, 7vw, 88px);
          text-decoration: underline;
          text-decoration-thickness: 0.06em;
          text-underline-offset: 0.12em;
        }

        .section-header h2 {
          font-size: clamp(28px, 4.6vw, 56px);
        }

        .short-copy,
        .section-header,
        .rule-box,
        .sequence-box {
          display: grid;
          gap: 10px;
        }

        .degree-row-label {
          margin-top: 6px;
        }

        .degree-row {
          display: grid;
          gap: 6px clamp(10px, 2.4vw, 26px);
          grid-template-columns: repeat(8, minmax(0, 1fr));
          margin-top: -4px;
        }

        .degree-cell {
          color: #303030;
          display: inline-block;
          font-size: clamp(15px, 2vw, 24px);
          font-weight: 650;
          line-height: 1.3;
          overflow-wrap: normal;
        }

        @media (max-width: 760px) {
          .degree-row {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
        }

        @media (max-width: 480px) {
          .degree-row {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        .short-copy {
          margin: clamp(20px, 4vw, 32px) auto 0;
          max-width: 720px;
        }

        .short-copy p,
        .rule-box p,
        .sequence-box p,
        .section-header p {
          color: #303030;
          font-size: clamp(18px, 2vw, 24px);
          font-weight: 650;
          line-height: 1.42;
          margin: 0;
          overflow-wrap: anywhere;
        }

        .rule-box,
        .sequence-box {
          border: 4px solid #2f65ad;
          border-radius: 10px;
          margin: 0 auto;
          max-width: 980px;
          padding: clamp(18px, 3vw, 28px);
          text-align: center;
          width: 100%;
        }

        .sequence-box {
          border-color: #047857;
          max-width: 100%;
        }

        .rule-box strong,
        .sequence-box strong {
          color: #080808;
          font-weight: 950;
        }

        .exercise-section,
        .position-section {
          border-top: 1px solid #d4d4d8;
          display: grid;
          gap: clamp(20px, 4vw, 36px);
          min-width: 0;
          padding-top: clamp(24px, 4vw, 42px);
        }

        .exercise-section {
          overscroll-behavior-x: contain;
        }

        .seventh-alphatab-frame {
          border: 4px solid #2f65ad;
          border-radius: 10px 10px 56px 56px;
          margin: 0;
          min-width: 0;
          padding: clamp(10px, 2vw, 18px);
          width: 100%;
        }

        .exercise-subhead {
          display: grid;
          gap: 8px;
          margin: clamp(8px, 2vw, 16px) auto 0;
          max-width: 940px;
          text-align: center;
        }

        .exercise-subhead h3 {
          font-size: clamp(24px, 3.4vw, 42px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 1;
          margin: 0;
          text-transform: uppercase;
        }

        .position-scroll {
          min-width: 0;
          overflow-x: auto;
          overscroll-behavior-x: contain;
          scrollbar-width: none;
          width: 100%;
        }

        .position-scroll::-webkit-scrollbar {
          display: none;
        }

        .position-map {
          margin: 0 auto;
          min-width: 1236px;
          width: 1236px;
        }

        .position-board {
          display: block;
          height: auto;
          width: 100%;
        }

        .large-board {
          display: block;
          height: auto;
          max-width: none;
          width: 100%;
        }

        .mini-title,
        .mini-name,
        .mini-row-label {
          fill: #080808;
          font-size: 18px;
          font-weight: 650;
          text-anchor: middle;
        }

        .mini-degree {
          font-size: 20px;
          font-weight: 950;
        }

        .mini-row-label {
          font-size: 18px;
          font-weight: 950;
          text-anchor: start;
        }

        .mini-name {
          font-size: 14px;
          font-weight: 950;
        }

        .mini-title {
          text-decoration: underline;
          text-decoration-thickness: 1px;
          text-underline-offset: 3px;
        }

        .mini-bg,
        .board-bg {
          fill: #27313d;
        }

        .mini-string,
        .string-line {
          stroke: #aab3bf;
          stroke-width: 3;
        }

        .mini-fret,
        .fret-line {
          stroke: #d6dce4;
          stroke-width: 4;
        }

        .mini-nut,
        .nut-line {
          stroke: #edf1f5;
          stroke-width: 8;
        }

        .mini-position,
        .fret-number,
        .string-label {
          fill: #080808;
          font-size: 16px;
          font-weight: 950;
          text-anchor: middle;
        }

        .mini-position {
          font-size: 12px;
          text-anchor: start;
        }

        .mini-note,
        .note-voiced {
          fill: #f8fafc;
          stroke: #a1a1aa;
          stroke-width: 3;
        }

        .mini-note-shape,
        .note-voiced {
          fill: #f6c453;
          stroke: #9a6b00;
          stroke-width: 4;
        }

        .mini-note-tonic {
          fill: #f8fafc;
          stroke: #2563eb;
          stroke-width: 4;
        }

        .mini-guide-dot {
          fill: #cad2dc;
          opacity: 0.78;
        }

        .mini-seventh,
        .note-seventh {
          fill: #fecaca;
          stroke: #dc2626;
          stroke-width: 5;
        }

        .mini-note-label,
        .note-label {
          fill: #080808;
          font-size: 15px;
          font-weight: 950;
          text-anchor: middle;
        }

        .fret-number,
        .string-label {
          font-size: 16px;
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
          fill: #f8fafc;
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
          font-size: 17px;
        }

        @media (max-width: 760px) {
          .seventh-header,
          .section-header,
          .exercise-subhead,
          .rule-box,
          .sequence-box {
            text-align: left;
          }
        }

        @media (max-width: 520px) {
          .seventh-chords-content,
          .lesson-pager-wrap {
            max-width: 320px;
          }
        }
      `}</style>
    </main>
  );
}
