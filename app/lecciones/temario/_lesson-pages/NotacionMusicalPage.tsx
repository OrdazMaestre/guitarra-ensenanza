'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import MiniKeyboard from '../../../components/guitar/MiniKeyboard';
import { playNote, preloadSamples, releaseNote, switchNote } from '@/app/lib/guitarAudioEngine';
import { FRETBOARD_KEYMAP, FRETBOARD_KEYMAP_UPPER, hasKeyboardGhosting } from '@/app/lib/fretboardKeymap';
import QuizButton from '../QuizButton';
import TemarioPager from '../TemarioPager';
import type { LessonPageProps } from './types';
import { useMetronome } from '@/app/lib/useMetronome';
import MetronomeControls from '@/app/components/guitar/MetronomeControls';
import MidiInstrumentChrome from '@/app/components/guitar/MidiInstrumentChrome';
import HorizontalScrollbar from '@/app/components/guitar/HorizontalScrollbar';
import { NoteMarksOverlay, PaletteToggleButton } from '@/app/components/guitar/NoteMarksOverlay';
import { useNoteMarks } from '@/app/lib/useNoteMarks';

const OPEN_STRING_MIDI: Record<number, number> = {
  1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40,
};

const chromaticNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function noteNameForFret(string: number, fret: number) {
  return chromaticNotes[(OPEN_STRING_MIDI[string] + fret) % chromaticNotes.length];
}

function getFullFretSvgCoords(
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

const chromaticLetters = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const fretboardStrings = [
  { label: 'E', open: 4, fullRange: true },
  { label: 'B', open: 11, fullRange: true, highlight: true },
  { label: 'G', open: 7, fullRange: false },
  { label: 'D', open: 2, fullRange: false },
  { label: 'A', open: 9, fullRange: false },
  { label: 'E', open: 4, fullRange: true },
];

// Rainbow order starts at E (open string 1/6, fret 0) instead of the usual
// C-start chromatic order, so walking up either E string from the nut reads
// as one smooth 12-hue rainbow: E, F, F#, G, ..., D# at fret 11, wrapping
// back to the same red-ish E hue at fret 12.
const rainbowNotes = ['E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'C', 'C#', 'D', 'D#'];

function rainbowColorForNote(note: string) {
  const index = rainbowNotes.indexOf(note);
  return `hsl(${index * 30}, 90%, 58%)`;
}

// Extra call-outs on top of the rainbow, independent of the string-2 "every
// fret" highlight: E2/G2 on string 6, plus every other string's open note
// (A2 on string 5, D3 on string 4, G3 on string 3, B3 on string 2, E4 on
// string 1) — marks all six open strings at fret 0, given by their
// scientific pitch name (matches OPEN_STRING_MIDI).
const extraHighlights = [
  { fret: 0, string: 6 }, // E2 (open low E)
  { fret: 3, string: 6 }, // G2
  { fret: 0, string: 5 }, // A2 (open A)
  { fret: 0, string: 4 }, // D3 (open D)
  { fret: 0, string: 3 }, // G3 (open G)
  { fret: 0, string: 2 }, // B3 (open B)
  { fret: 0, string: 1 }, // E4 (open high E)
];

function isExtraHighlight(string: number, fret: number) {
  return extraHighlights.some((h) => h.string === string && h.fret === fret);
}

// Explicit per-phase delay, applied inline on each ring below, so every
// member of a phase group shares the exact same animation start point
// regardless of class cascade or per-element mount timing.
const phaseDelays: Record<string, string> = { open: '0s', string2: '-1s', g2: '-2s' };

const fretboardNotes = fretboardStrings.flatMap((string, stringIndex) => {
  const frets = string.fullRange ? Array.from({ length: 13 }, (_, fret) => fret) : [0, 12];
  // Only strings 1 and 6 (both tuned to E) get the full rainbow, plus frets 0
  // and 12 on every string — together they show that both E strings play
  // identical notes, and that fret 0 and fret 12 are the same note an octave
  // apart, wherever you are on the neck.
  const isRainbowString = stringIndex === 0 || stringIndex === 5;

  return frets.map((fret) => {
    const note = chromaticLetters[(string.open + fret) % 12];
    const stringNumber = stringIndex + 1;
    const callout = isExtraHighlight(stringNumber, fret);
    const highlight = Boolean(string.highlight) && fret > 0;
    // Three memorization zones, each cycling color on its own phase (see
    // .fretboard-phase-* below) so they read as visually distinct groups
    // even though they share the same 12-hue animation: every open string
    // (fret 0), the rest of string 2 (frets 1-12), and G2 on its own.
    const phase = fret === 0 && callout
      ? 'open'
      : stringNumber === 6 && fret === 3
        ? 'g2'
        : highlight
          ? 'string2'
          : undefined;

    return {
      callout,
      fret,
      highlight,
      note,
      phase,
      rainbowColor: isRainbowString || fret === 0 || fret === 12 ? rainbowColorForNote(note) : undefined,
      string: stringNumber,
    };
  });
});

function FullFretboardDiagram() {
  const boardX = 54;
  const boardY = 56;
  const fretWidth = 56;
  const boardWidth = fretWidth * 12;
  const boardHeight = 174;
  const stringGap = boardHeight / 5;
  const stringY = (string: number) => boardY + (string - 1) * stringGap;
  const fretX = (fret: number) => (fret === 0 ? boardX - 26 : boardX + (fret - 0.5) * fretWidth);
  const viewBoxWidth = boardX + boardWidth + 30;
  const viewBoxHeight = boardY + boardHeight + 42;

  const svgRef = useRef<SVGSVGElement>(null);
  const scrollRef = useRef<HTMLElement>(null);
  const ptHeldRef = useRef(new Map<number, { string: number; fret: number; midi: number }>());
  const ptStringVoiceRef = useRef(new Map<number, { pid: number; voiceId: number }>());
  const [ptPositions, setPtPositions] = useState<{ string: number; fret: number }[]>([]);
  const [volume, setVolume] = useState(1.0);
  const [kbMode, setKbMode] = useState(false);
  const [kbRange, setKbRange] = useState<'lower' | 'upper'>('lower');
  const [paintMode, setPaintMode] = useState(false);
  const paintModeRef = useRef(paintMode);
  useEffect(() => { paintModeRef.current = paintMode; }, [paintMode]);
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
      if (paintModeRef.current) toggleMark(noteNameForFret(entry.string, entry.fret));
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
    const coords = getFullFretSvgCoords(e, svg);
    if (!coords) return null;
    const { x, y } = coords;
    const halfGap = stringGap / 2;
    if (y < boardY - halfGap || y > boardY + boardHeight + halfGap) return null;
    const string = Math.max(1, Math.min(6, Math.round((y - boardY) / stringGap) + 1));
    let fret: number;
    if (x < boardX) {
      if (x < boardX - 42) return null;
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
    if (paintMode) toggleMark(noteNameForFret(pos.string, pos.fret));
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
          const noteIsMarked = fretboardNotes.some(n => n.string === string && n.fret === fret);
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
                r="16"
              />
              <text x={markerX} y={sy + 4} fill="#b45309" fontSize="12" fontWeight="900" textAnchor="middle">
                {noteNameForFret(string, fret)}
              </text>
            </g>
          );
        })}
      </>
    );
  }

  return (
    <div className="midi-instrument-host">
    <figure className="fretboard-wrap" ref={scrollRef}>
      <svg
        ref={svgRef}
        className="fretboard-board"
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        role="img"
        aria-label="Las doce notas en el mastil, con todas las notas de las cuerdas Mi agudo, Si y Mi grave, y las notas de la cuerda Si del traste 1 al 12 marcadas en rojo"
        style={{ touchAction: 'none', cursor: 'pointer', userSelect: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <text className="fretboard-fret-number" key="number-0" x={fretX(0)} y="26">
          0
        </text>
        {Array.from({ length: 12 }, (_, fret) => (
          <text className="fretboard-fret-number" key={`number-${fret + 1}`} x={boardX + fret * fretWidth + fretWidth / 2} y="26">
            {fret + 1}
          </text>
        ))}
        <rect className="fretboard-bg" x={boardX} y={boardY} width={boardWidth} height={boardHeight} />
        {fretboardStrings.map((_, index) => (
          <line
            className="fretboard-string-line"
            key={`string-${index}`}
            x1={boardX}
            x2={boardX + boardWidth}
            y1={stringY(index + 1)}
            y2={stringY(index + 1)}
          />
        ))}
        {Array.from({ length: 13 }, (_, fret) => (
          <line
            className={fret === 0 ? 'fretboard-nut-line' : 'fretboard-fret-line'}
            key={`fret-${fret}`}
            x1={boardX + fret * fretWidth}
            x2={boardX + fret * fretWidth}
            y1={boardY}
            y2={boardY + boardHeight}
          />
        ))}
        {[3, 5, 7, 9].map((fret) => (
          <circle className="fretboard-guide-dot" cx={fretX(fret)} cy={stringY(3.5)} key={`guide-${fret}`} r="8" />
        ))}
        <circle className="fretboard-guide-dot" cx={fretX(12)} cy={stringY(2)} key="guide-12-top" r="8" />
        <circle className="fretboard-guide-dot" cx={fretX(12)} cy={stringY(5)} key="guide-12-bottom" r="8" />
        {([3, 5, 7, 9, 12] as const).map((fret) => (
          <text className="roman-fret" key={`roman-${fret}`} x={fretX(fret)} y={boardY + boardHeight + 28}>
            {({ 3: 'III', 5: 'V', 7: 'VII', 9: 'IX', 12: 'XII' } as Record<number, string>)[fret]}
          </text>
        ))}
        {fretboardNotes.map((item) => (
          <g key={`${item.string}-${item.fret}`}>
            <circle
              className={item.rainbowColor ? 'fretboard-note fretboard-note-vivid' : 'fretboard-note'}
              cx={fretX(item.fret)}
              cy={stringY(item.string)}
              r="16"
              style={item.rainbowColor ? { fill: item.rainbowColor } : undefined}
            />
            {item.highlight || item.callout ? (
              // A separate stroke-only ring, on its own element: it needs the
              // dark-mode counter-invert (see .fretboard-note-callout below)
              // so its animated color reads the same in both themes, but the
              // circle underneath must NOT get that filter, or its plain fill
              // would stop following the page's normal dark-mode inversion.
              <circle
                className="fretboard-note-callout fretboard-note-vivid"
                cx={fretX(item.fret)}
                cy={stringY(item.string)}
                fill="none"
                pointerEvents="none"
                r="16"
                style={item.phase ? { animationDelay: phaseDelays[item.phase] } : undefined}
              />
            ) : null}
            <text className="fretboard-note-label" x={fretX(item.fret)} y={stringY(item.string) + 5}>
              {item.note}
            </text>
          </g>
        ))}
        <NoteMarksOverlay
          endFret={12}
          getNoteName={noteNameForFret}
          getX={fretX}
          getY={stringY}
          marks={marks}
          startFret={0}
        />
        {interactionOverlay()}
      </svg>
    </figure>
    <HorizontalScrollbar targetRef={scrollRef} />
    <MidiInstrumentChrome
      warning={kbMode && kbGhostWarn && (
        <span style={{ fontSize: '11px', color: '#92400e', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '4px', padding: '2px 6px', whiteSpace: 'nowrap' }}>
          ⚠ Necesitas teclado gaming para tocar ciertos acordes
        </span>
      )}
    >
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

export default function NotacionMusicalPage({ previous, next, quizHref }: LessonPageProps) {
  const naturalNotes = [
    ['DO', 'C'],
    ['RE', 'D'],
    ['MI', 'E'],
    ['FA', 'F'],
    ['SOL', 'G'],
    ['LA', 'A'],
    ['SI', 'B'],
  ];

  const chromaticNotes = [
    ['DO', 'C'],
    ['DO#', 'C#'],
    ['RE', 'D'],
    ['RE#', 'D#'],
    ['MI', 'E'],
    ['FA', 'F'],
    ['FA#', 'F#'],
    ['SOL', 'G'],
    ['SOL#', 'G#'],
    ['LA', 'A'],
    ['LA#', 'A#'],
    ['SI', 'B'],
  ];

  return (
    <main className="notes-page">
      <article className="notes-content">
        <header className="notes-header">
          <h1>Notas musicales</h1>
          <h3>(Do, Re, Mi, Fa, Sol, La y Si)</h3>
          <div className="rule-box">
            <p>
              <strong>NOTACIÓN INTERNACIONAL:</strong> Nombrar a las notas musicales con las letras del <strong>ABECEDARIO</strong> o, como lo llamo aqui;
            </p>
            <h2>ABCDEFGario: <strong>A,  B,  C,  D,  E,  F  y  G.</strong></h2>
          </div>
        </header>

        <section className="note-section" aria-labelledby="natural-notes-title">
          <header className="note-section-header">
            <h2 id="natural-notes-title">7 notas naturales</h2>
          </header>

          <div className="note-grid natural-grid" aria-label="Equivalencia entre notas en espanol y letras">
            {naturalNotes.map(([spanish, letter]) => (
              <div className="note-card" key={letter}>
                <strong>{spanish}</strong>
                <span>{letter}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="note-section chromatic-section" aria-labelledby="chromatic-title">
          <header className="note-section-header">
            <p>12 en total</p>
            <h3 id="chromatic-title">7 naturales + 5 alteraciones</h3>
          </header>

          <div className="note-grid chromatic-grid" aria-label="Escala cromatica de doce semitonos">
            {chromaticNotes.map(([spanish, letter]) => (
              <div className={letter.includes('#') ? 'note-card altered-note' : 'note-card'} key={letter}>
                <strong>{spanish}</strong>
                <span>{letter}</span>
              </div>
            ))}
          </div>
        <h3>Prueba a tocar los instrumentos de abajo</h3>
          <MiniKeyboard className="keyboard-image" />
        </section>

        <section className="note-section fretboard-section" aria-labelledby="fretboard-title">
          <header className="note-section-header">
          </header>
       
          <div className="fretboard-copy">
            
          </div>

          <FullFretboardDiagram />
          
          <section className="lesson-close" aria-label="Resumen">
          <h2>POCO A POCO MEMORIZAREMOS LA POSICION DE VARIAS NOTAS EN LA GUITARRA</h2>
          <p>Trastes 0 y 12 son iguales.</p>
          <p>Cuerdas 1 y 6 son iguales.</p>
          <p>TRUCOS: Empieza aprendiendo las notas del traste 0 de abajo a arriba.</p>
          <p>Memoriza que la cuerda 2 contiene de Do a Si en orden por toda la cuerda.</p>
          <p>El resto de posiciones las sacaremos cada vez más rápido sabiéndonos el abecedefgario.</p>
          </section>
        </section>

        <section className="branch-link-section" aria-label="Rama de afinación">
          <Link href="/lecciones/temario/afinacion">Afinación</Link>
          <p>Ajustar las cuerdas con las clavijas</p>
          <p>hasta tener el patrón de la izquierda en el mástil de arriba</p>
          <p>para que la guitarra suene bien.</p>
        </section>
      </article>

      <div className="lesson-pager-wrap">
        <QuizButton quizHref={quizHref} />
        <TemarioPager previous={previous} next={next} />
      </div>

      <style>{`
        .notes-page {
          background: #ffffff;
          color: #080808;
          min-height: 100vh;
          overflow-x: clip;
          padding: clamp(28px, 5vw, 72px) clamp(20px, 7vw, 108px);
          width: 100%;
        }

        .notes-content,
        .lesson-pager-wrap {
          margin: 0 auto;
          max-width: 1120px;
          min-width: 0;
          width: 100%;
        }

        .notes-content {
          padding-bottom: clamp(34px, 6vw, 72px);
        }

        .notes-header {
          margin: 0 auto clamp(46px, 8vw, 94px);
          max-width: 900px;
          text-align: center;
        }

        .lesson-kicker {
          color: #047857;
          font-size: 13px;
          font-weight: 950;
          letter-spacing: 0.22em;
          margin: 0 0 14px;
          text-transform: uppercase;
        }

        .notes-header h1 {
          font-size: clamp(44px, 7vw, 92px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 0.95;
          margin: 0;
        }

        .notes-header p {
          color: #303030;
          font-size: clamp(19px, 2vw, 27px);
          font-weight: 650;
          line-height: 1.42;
          margin: clamp(24px, 4vw, 36px) auto 0;
        }

        .rule-box p {
          color: #303030;
          font-size: clamp(18px, 2vw, 24px);
          font-weight: 650;
          line-height: 1.42;
          margin: 0;
          overflow-wrap: anywhere;
        }

        .rule-box {
          border: 4px solid #2f65ad;
          border-radius: 10px;
          display: grid;
          gap: 10px;
          margin: clamp(24px, 4vw, 36px) auto 0;
          max-width: 980px;
          padding: clamp(18px, 3vw, 28px);
          text-align: center;
          width: 100%;
        }

        .rule-box strong {
          color: #080808;
          font-weight: 950;
        }

        .note-section {
          display: grid;
          gap: clamp(26px, 4vw, 44px);
          justify-items: center;
          margin-top: clamp(52px, 8vw, 96px);
          text-align: center;
        }

        .note-section:first-of-type {
          margin-top: 0;
        }

        .chromatic-section {
          border-top: 1px solid #d4d4d8;
          padding-top: clamp(46px, 8vw, 82px);
        }

        .note-section-header {
          display: grid;
          gap: 8px;
          justify-items: center;
        }

        .note-section-header p,
        .note-section-header h2 {
          color: #047857;
          font-size: clamp(34px, 5.6vw, 60px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 0.95;
          margin: 0;
          text-transform: uppercase;
        }

        .note-section-header h2 {
          color: #080808;
        }

        .note-section:first-of-type .note-section-header h2 {
          color: #047857;
        }

        .note-grid {
          display: grid;
          gap: 12px;
          justify-content: center;
          width: 100%;
        }

        .natural-grid {
          grid-template-columns: repeat(7, minmax(0, 1fr));
          max-width: 380px;
        }

        .chromatic-grid {
          grid-template-columns: repeat(12, minmax(0, 1fr));
          max-width: 980px;
        }

        .note-card {
          border: 1px solid #d4d4d8;
          display: grid;
          min-height: 75px;
          min-width: 0;
          padding: 9px 5px;
          place-items: center;
          text-align: center;
        }

        .note-card strong {
          color: #111111;
          font-size: clamp(11px, 1.3vw, 16px);
          font-weight: 950;
        }

        .note-card span {
          color: #047857;
          font-size: clamp(20px, 3vw, 34px);
          font-weight: 950;
          line-height: 1;
          margin-top: 8px;
        }

        .altered-note {
          background: #d1d5db;
          border-color: #047857;
        }

        .keyboard-image {
          display: block;
          height: auto;
          margin: clamp(8px, 2vw, 18px) auto 0;
          max-width: 100%;
          width: min(100%, 700px);
        }

        .fretboard-section {
          gap: clamp(18px, 3vw, 28px);
          grid-template-columns: minmax(0, 1fr);
          justify-items: stretch;
          min-width: 0;
        }

        .fretboard-copy {
          display: grid;
          gap: 8px;
          margin: 0 auto;
          max-width: 640px;
          text-align: center;
        }

        .fretboard-copy p {
          color: #303030;
          font-size: clamp(16px, 1.8vw, 21px);
          font-weight: 650;
          line-height: 1.4;
          margin: 0;
        }

        .highlight-note {
          color: #dc2626;
          font-weight: 950;
        }

        .fretboard-wrap {
          margin: 0;
          min-width: 0;
          overflow-x: auto;
          scrollbar-width: none;
          width: 100%;
        }

        .fretboard-wrap::-webkit-scrollbar {
          display: none;
        }

        .fretboard-board {
          display: block;
          height: auto;
          margin: 0 auto;
          min-width: 640px;
          width: min(100%, 980px);
        }

        .fretboard-bg {
          fill: #26313d;
        }

        .fretboard-string-line {
          stroke: #aab3bf;
          stroke-width: 3;
        }

        .fretboard-fret-line {
          stroke: #d6dce4;
          stroke-width: 4;
        }

        .fretboard-nut-line {
          stroke: #edf1f5;
          stroke-width: 8;
        }

        .fretboard-guide-dot {
          fill: #cad2dc;
          opacity: 0.78;
        }

        .roman-fret {
          fill: #080808;
          font-size: 15px;
          font-weight: 950;
          text-anchor: middle;
        }

        .fretboard-note {
          fill: #f8fafc;
          stroke: #a1a1aa;
          stroke-width: 3;
        }

        /* Every highlighted note — string 2's B, all fret/octave (the old
           static red ring), plus the four extra call-outs (E2/G2 on string
           6, A2 on string 5, D3 on string 4) — gets this same ring, drawn as
           a separate stroke-only circle on top so its animated color can be
           counter-inverted in dark mode (see .fretboard-note-vivid below)
           without also pinning the note's own fill away from the page's
           normal dark-mode inversion. All rings share one animation starting
           from the same render, so they cycle through the 12 rainbow hues
           perfectly in sync — a static red ring barely stood out against
           some of the rainbow fills, but a fast color sweep is unmissable
           regardless of what's underneath. */
        /* Three memorization zones share the same cycle but start at a
           different point in it (see the inline animationDelay set per
           item.phase above — open strings, the rest of string 2, and G2
           each land on a distinct color at any given moment, while every
           member of the same zone always matches its own group exactly). */
        .fretboard-note-callout {
          animation: fretboard-callout-cycle 3s linear infinite;
          stroke-width: 6;
        }

        @keyframes fretboard-callout-cycle {
          0%     { stroke: hsl(0, 90%, 58%); }
          8.3%   { stroke: hsl(30, 90%, 58%); }
          16.7%  { stroke: hsl(60, 90%, 58%); }
          25%    { stroke: hsl(90, 90%, 58%); }
          33.3%  { stroke: hsl(120, 90%, 58%); }
          41.7%  { stroke: hsl(150, 90%, 58%); }
          50%    { stroke: hsl(180, 90%, 58%); }
          58.3%  { stroke: hsl(210, 90%, 58%); }
          66.7%  { stroke: hsl(240, 90%, 58%); }
          75%    { stroke: hsl(270, 90%, 58%); }
          83.3%  { stroke: hsl(300, 90%, 58%); }
          91.7%  { stroke: hsl(330, 90%, 58%); }
          100%   { stroke: hsl(360, 90%, 58%); }
        }

        /* Dark mode inverts the whole page so notes/keyboards keep contrast
           (see globals.css) — these two classes carry deliberately-chosen
           colors (the rainbow fill, the call-out ring's cycle) that must
           read the same in both themes, so counter-invert them right back,
           the same trick globals.css already uses for <img>. */
        html[data-theme='dark'] .fretboard-note-vivid {
          filter: invert(1) hue-rotate(180deg);
        }

        .fretboard-note-label {
          fill: #080808;
          font-size: 16px;
          font-weight: 950;
          paint-order: stroke;
          stroke: #ffffff;
          stroke-width: 3px;
          text-anchor: middle;
        }

        .fretboard-fret-number {
          fill: #080808;
          font-size: 15px;
          font-weight: 950;
          text-anchor: middle;
        }

        .semitone-note {
          color: #303030;
          font-size: 18px;
          font-weight: 760;
          line-height: 1.55;
          margin: 0;
        }

        .lesson-close {
          border-left: 5px solid #047857;
          display: grid;
          gap: 21px;
          margin: clamp(28px, 5vw, 48px) auto 0;
          max-width: 860px;
          padding-left: clamp(16px, 3vw, 24px);
        }

        .lesson-close p {
          margin: 0;
        }

        .branch-link-section {
          border-top: 1px solid #d4d4d8;
          display: grid;
          justify-items: center;
          margin: clamp(46px, 8vw, 82px) auto 0;
          max-width: 760px;
          min-width: 0;
          padding-top: clamp(24px, 4vw, 38px);
          text-align: center;
        }

        .branch-link-section a {
          color: #080808;
          font-size: clamp(28px, 4.8vw, 54px);
          font-weight: 950;
          line-height: 1;
          max-width: 100%;
          overflow-wrap: anywhere;
          text-decoration-color: #047857;
          text-decoration-thickness: 0.12em;
          text-underline-offset: 0.14em;
          text-transform: uppercase;
        }

        .branch-link-section a:hover,
        .branch-link-section a:focus-visible {
          color: #047857;
        }

        .branch-link-section a:focus-visible {
          outline: 3px solid #047857;
          outline-offset: 6px;
        }

        @media (max-width: 920px) {
          .chromatic-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .natural-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        @media (max-width: 1040px) and (min-width: 921px) {
          .chromatic-grid {
            grid-template-columns: repeat(6, minmax(0, 1fr));
            max-width: 490px;
          }
        }

        @media (max-width: 820px) {
          .notes-header,
          .note-section {
            text-align: left;
          }

          .note-section,
          .note-section-header,
          .branch-link-section {
            justify-items: start;
          }

          .fretboard-section {
            justify-items: stretch;
          }

          .branch-link-section {
            text-align: left;
          }
        }

        @media (max-width: 520px) {
          .natural-grid,
          .chromatic-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .note-card {
            min-height: 68px;
          }
        }
      `}</style>
    </main>
  );
}
