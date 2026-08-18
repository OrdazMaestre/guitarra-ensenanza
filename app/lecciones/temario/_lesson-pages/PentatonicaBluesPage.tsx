'use client';

import Link from 'next/link';
import React, { useEffect, useRef, useState } from 'react';
import TemarioPager from '../TemarioPager';
import { playNote, preloadSamples, releaseNote, switchNote } from '../../../lib/guitarAudioEngine';
import { FRETBOARD_KEYMAP, FRETBOARD_KEYMAP_UPPER, hasKeyboardGhosting } from '../../../lib/fretboardKeymap';
import type { LessonPageProps } from './types';
import { useMetronome } from '../../../lib/useMetronome';
import MetronomeControls from '../../../components/guitar/MetronomeControls';
import MidiInstrumentChrome from '../../../components/guitar/MidiInstrumentChrome';

const chromaticNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const stringTunings = [
  { label: 'E', open: 4 },
  { label: 'B', open: 11 },
  { label: 'G', open: 7 },
  { label: 'D', open: 2 },
  { label: 'A', open: 9 },
  { label: 'E', open: 4 },
];

const eMinorPentatonicNotes = ['E', 'G', 'A', 'B', 'D'];
const eMinorBluesNotes = ['E', 'G', 'A', 'A#', 'B', 'D'];
const blueNoteLabel = 'Bb';

function noteNameForFret(open: number, fret: number) {
  return chromaticNotes[(open + fret) % chromaticNotes.length];
}

function displayNote(note: string) {
  return note === 'A#' ? blueNoteLabel : note;
}

const OPEN_STRING_MIDI: Record<number, number> = { 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40 };

function FretboardMap({
  ariaLabel,
  blues = false,
  notes,
}: {
  ariaLabel: string;
  blues?: boolean;
  notes: string[];
}) {
  const boardX = 58;
  const boardY = 54;
  const fretWidth = 70;
  const boardWidth = fretWidth * 12;
  const boardHeight = 178;
  const viewBoxWidth = boardX + boardWidth + 64;
  const viewBoxHeight = boardY + boardHeight + 56;
  const stringGap = boardHeight / 5;
  const stringY = (string: number) => boardY + (string - 1) * stringGap;
  const fretX = (fret: number) => (fret === 0 ? boardX - 28 : boardX + (fret - 0.5) * fretWidth);
  const fretNotes = stringTunings.flatMap((string, stringIndex) =>
    Array.from({ length: 13 }, (_, fret) => {
      const note = noteNameForFret(string.open, fret);
      return notes.includes(note) ? { fret, note, string: stringIndex + 1 } : null;
    }).filter((item): item is { fret: number; note: string; string: number } => item !== null),
  );

  const svgRef = useRef<SVGSVGElement>(null);
  const ptHeldRef = useRef(new Map<number, { string: number; fret: number; midi: number }>());
  const ptStringVoiceRef = useRef(new Map<number, { pid: number; voiceId: number }>());
  const [ptPositions, setPtPositions] = useState<{ string: number; fret: number }[]>([]);
  const [volume, setVolume] = useState(1.0);
  const [kbMode, setKbMode] = useState(false);
  const [kbRange, setKbRange] = useState<'lower' | 'upper'>('lower');

  useEffect(() => {
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => preloadSamples());
    } else {
      setTimeout(() => preloadSamples(), 200);
    }
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

  function svgCoords(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    if (!m) return null;
    return pt.matrixTransform(m.inverse());
  }

  function getPos(e: React.PointerEvent<SVGSVGElement>, held?: { string: number; fret: number } | null): { string: number; fret: number } | null {
    const coords = svgCoords(e);
    if (!coords) return null;
    const { x, y } = coords;
    const halfGap = stringGap / 2;
    if (y < boardY - halfGap || y > boardY + boardHeight + halfGap) return null;
    const string = Math.max(1, Math.min(6, Math.round((y - boardY) / stringGap) + 1));
    let fret: number;
    if (x < boardX && x >= boardX - 44) {
      fret = 0;
    } else if (x >= boardX) {
      const colIndex = Math.floor((x - boardX) / fretWidth);
      if (colIndex < 0 || colIndex >= 12) return null;
      fret = colIndex + 1;
    } else {
      return null;
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
    e.currentTarget.setPointerCapture(e.pointerId);
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
          const markerY = stringY(string);
          const noteIsMarked = fretNotes.some(n => n.string === string && n.fret === fret);
          return (
            <g key={`ko-${string}-${fret}`} pointerEvents="none" style={{ animation: 'fretboard-string-vibrate 80ms linear infinite' }}>
              <line
                x1={markerX} x2={boardX + boardWidth} y1={markerY} y2={markerY}
                stroke="#fbbf24" strokeLinecap="round" strokeWidth="3" opacity="0.85"
              />
              <circle cx={markerX} cy={markerY} fill="#fbbf24" opacity={noteIsMarked ? 0.5 : 0.9} r="17" />
              <text x={markerX} y={markerY + 4} fill="#b45309" fontSize="13" fontWeight="900" textAnchor="middle">
                {displayNote(noteNameForFret(stringTunings[string - 1].open, fret))}
              </text>
            </g>
          );
        })}
      </>
    );
  }

  return (
    <div className="midi-instrument-host">
    <figure className="blues-map-wrap">
      <svg
        ref={svgRef}
        className="blues-map"
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        role="img"
        aria-label={ariaLabel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ touchAction: 'none', cursor: 'crosshair' }}
      >
        <rect className="map-bg" x={boardX} y={boardY} width={boardWidth} height={boardHeight} />
        {stringTunings.map((string, index) => (
          <g key={`${string.label}-${index}`}>
            <line className="map-string" x1={boardX} x2={boardX + boardWidth} y1={stringY(index + 1)} y2={stringY(index + 1)} />
          </g>
        ))}
        {Array.from({ length: 13 }, (_, fret) => (
          <line
            className={fret === 0 ? 'map-nut' : 'map-fret'}
            key={`fret-${fret}`}
            x1={boardX + fret * fretWidth}
            x2={boardX + fret * fretWidth}
            y1={boardY}
            y2={boardY + boardHeight}
          />
        ))}
        {[3, 5, 7, 9].map((fret) => (
          <circle className="map-guide-dot" cx={boardX + (fret - 0.5) * fretWidth} cy={stringY(3.5)} key={`guide-${fret}`} r="8" />
        ))}
        <circle className="map-guide-dot" cx={boardX + 11.5 * fretWidth} cy={stringY(2)} key="guide-12-top" r="8" />
        <circle className="map-guide-dot" cx={boardX + 11.5 * fretWidth} cy={stringY(5)} key="guide-12-bottom" r="8" />
        {([3, 5, 7, 9, 12] as const).map((fret) => (
          <text className="roman-fret" key={`roman-${fret}`} x={boardX + (fret - 0.5) * fretWidth} y={boardY + boardHeight + 22}>
            {({ 3: 'III', 5: 'V', 7: 'VII', 9: 'IX', 12: 'XII' } as Record<number, string>)[fret]}
          </text>
        ))}
        {fretNotes.map((item) => {
          const isBlueNote = item.note === 'A#';
          return (
            <g key={`${item.string}-${item.fret}-${item.note}`}>
              <circle
                className={isBlueNote ? 'map-note map-note-special' : item.note === 'E' ? 'map-note map-note-e' : item.note === 'G' ? 'map-note map-note-g' : 'map-note'}
                cx={fretX(item.fret)}
                cy={stringY(item.string)}
                r={isBlueNote ? 15 : 17}
              />
              <text className="map-note-label" x={fretX(item.fret)} y={stringY(item.string) + 5}>
                {displayNote(item.note)}
              </text>
            </g>
          );
        })}
        {blues ? (
          <text className="map-note-hint" x={boardX + boardWidth / 2} y={boardY + boardHeight + 44}>
            Bb también puede llamarse A#
          </text>
        ) : null}
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

const evolutionItems = [
  {
    body: (
      <>
        <p>
          <a className="musician-link" href="https://www.youtube.com/watch?v=_tIZ2Savx60" rel="noreferrer" target="_blank">
            Johann Sebastian Bach
          </a>{' '}
          crea en torno al año 1700 el conjunto teórico musical que estudiamos hoy en día.
        </p>
        <p>Sus reglas son como los mandamientos para los músicos clásicos.</p>
        <p>Son muy amplias, pero algo restrictivas.</p>
      </>
    ),
    period: 'Siglos XVII-XIX',
    title: (
      <a className="timeline-title-link" href="https://www.youtube.com/watch?v=E1HHKGlBugA" rel="noreferrer" target="_blank">
        Música clásica
      </a>
    ),
    titleKey: 'Música clásica',
  },
  {
    body: (
      <>
        <p>Se crea la Blue Note.</p>
        <p>
          <a className="musician-link" href="https://www.youtube.com/watch?v=-zZinzoPOak" rel="noreferrer" target="_blank">
            W. C. Handy
          </a>{' '}
          se considera el “padre del blues”.
        </p>
        <p>
          <a className="musician-link" href="https://www.youtube.com/watch?v=MEsQikthT3Q" rel="noreferrer" target="_blank">
            Robert Johnson
          </a>{' '}
          fue un guitarrista de blues que inspiró al rock.
        </p>
      </>
    ),
    period: 'Finales siglo XIX',
    title: 'Blues',
    titleKey: 'Blues',
  },
  {
    body: (
      <>
        <p>Basado en experimentar, mezclar escalas, improvisar... el opuesto literal de la música clásica.</p>
        <p>
          <a className="musician-link" href="https://www.youtube.com/watch?v=wyLjbMBpGDA" rel="noreferrer" target="_blank">
            Louis Armstrong
          </a>{' '}
          y{' '}
          <a className="musician-link" href="https://www.youtube.com/watch?v=3R0JQ7X4000" rel="noreferrer" target="_blank">
            Duke Ellington
          </a>{' '}
          son dos de los creadores del jazz.
        </p>
      </>
    ),
    period: 'Principios del siglo XX',
    title: (
      <a className="timeline-title-link" href="https://www.youtube.com/shorts/l87WjFlE86Q" rel="noreferrer" target="_blank">
        Jazz
      </a>
    ),
    titleKey: 'Jazz',
  },
  {
    body: (
      <>
        <p>
          <a className="musician-link" href="https://www.youtube.com/watch?v=wcW8SvbnJYE" rel="noreferrer" target="_blank">
            Chuck Berry
          </a>{' '}
          lo crea y{' '}
          <a className="musician-link" href="https://www.youtube.com/watch?v=gj0Rz-uP4Mk" rel="noreferrer" target="_blank">
            Elvis Presley
          </a>{' '}
          lo populariza.
        </p>
        <p>
          <a className="musician-link" href="https://www.youtube.com/watch?v=M4vbJQ-MrKo" rel="noreferrer" target="_blank">
            Los Beatles
          </a>{' '}
          superaron en fama a Elvis y convirtieron el rock en un fenómeno global.
        </p>
        <p>
          <a className="musician-link" href="https://www.youtube.com/watch?v=EX5phFmbrU8" rel="noreferrer" target="_blank">
            Jimi Hendrix
          </a>{' '}
          llegaría para inspirar al Hard Rock y al Metal.
        </p>
      </>
    ),
    period: 'Mediados del siglo XX',
    title: 'Rock&Roll',
    titleKey: 'Rock&Roll',
  },
];

export default function PentatonicaBluesPage({ previous, next }: LessonPageProps) {
  return (
    <main className="blues-page">
      <article className="blues-content">
        <header className="blues-header">
          <p className="lesson-kicker">Ampliación de la pentatónica</p>
          <h1>Pentatónica de blues</h1>
          <div className="short-copy">
            <p>Vamos a centrarnos en Mi menor.</p>
            <p>Es una escala muy usada en blues.</p>
            <p>Y sale de la pentatónica que ya conocemos.</p>
          </div>
        </header>

        <section className="map-section" aria-labelledby="minor-title">
          <header className="section-header">
            <p className="lesson-kicker">Mi menor</p>
            <h2 id="minor-title">Pentatónica de Mi menor</h2>
            <p>E, G, A, B y D.</p>
            <p>Son las mismas notas que Sol Mayor.</p>
          </header>
          <FretboardMap ariaLabel="Pentatónica de Mi menor en los doce primeros trastes" notes={eMinorPentatonicNotes} />
        </section>

        <section className="map-section" aria-labelledby="blues-title">
          <header className="section-header">
            <h2 id="blues-title">Pentatónica de blues</h2>
            <p>Ahora añadimos una nota rara: <strong>Bb</strong>.
            </p>
          </header>
          <FretboardMap ariaLabel="Pentatónica de blues de Mi menor con Bb en los doce primeros trastes" blues notes={eMinorBluesNotes} />
        </section>

        <section className="formula-box" aria-label="Fórmula de la escala de blues">
          <p>
            <strong>La pentatónica de blues usa 6 notas, no 5.</strong>
          </p>
          <p>E, G, A, Bb, B y D.</p>
          <p>La nota extra no suena tranquila.</p>
          <p>Eso es lo especial que tiene el sonido del blues entre otras cosas.</p>
        </section>

        <section className="practice-link" aria-label="Volver a ejercicios">
          <Link href="/lecciones/temario/ejercicios-pentatonica">Antes de correr: repasar las 5 figuras</Link>
        </section>

        <section className="practice-link" aria-label="Ejercicios de pentatónica blues">
          <Link href="/lecciones/temario/ejercicios-pentatonica-blues">Ejercicios de pentatónica de blues</Link>
        </section>

        <section className="history-box" aria-labelledby="history-title">
          <div className="history-copy">
            <p>Los músicos de blues dominaban la música folk de su tierra además de la teoría y técnica de la música clásica.</p>
            <p>
              Ellos fueron los primeros en proponer una música compleja y distinta a como{' '}
              <span className="underlined">se creía en aquella época que era la única manera de hacer música bien</span>.
            </p>
            <p>
              <strong>Muy pocos clásicos</strong> usaron antes estos recursos “raros” como{' '}
              <a className="musician-link" href="https://www.youtube.com/watch?v=8ZQAcu6vJ5o" rel="noreferrer" target="_blank">
                Carlo Gesualdo
              </a>{' '}
              o{' '}
              <a className="musician-link" href="https://www.youtube.com/watch?v=KTi-QXenilQ" rel="noreferrer" target="_blank">
                Domenico Scarlatti
              </a>{' '}
              entre los siglos XVI y XVII.
            </p>
            <p>
              <a className="musician-link" href="https://www.youtube.com/watch?v=hufCZZw58mk" rel="noreferrer" target="_blank">
                Claude Debussy
              </a>{' '}
              e Igor Stravinsky se influenciaron mucho de estos en el siglo XX.
            </p>
            <p>
              <span className="underlined">Así nace la <strong>música moderna</strong>, diferenciándose</span> de forma fundamental con la{' '}
              <span className="underlined"><strong>música clásica</strong></span>.
            </p>
            <p>Aclaro que con "música clásica" nos referimos al conjunto Barroco, Rococó, Clasicismo y Romanticismo principalmente.</p>
          <p>El Jazz fue la cúspide de esa experimentación musical: escalas de 7 a 12 notas, múltiples escalas en la misma canción... etc.</p>
          </div>

          <div className="timeline-heading">
            <p className="lesson-kicker">Evolución de la música</p>
            <h2 id="history-title">De los clásicos al rock</h2>
            </div>

          <div className="timeline-grid">
            {evolutionItems.map((item, index) => (
              <article className="timeline-card" key={item.titleKey}>
                <h3>
                  {item.title} <span>({item.period})</span>
                </h3>
                <div className="timeline-card-copy">{item.body}</div>
                {index < evolutionItems.length - 1 ? <span className="timeline-arrow" aria-hidden="true">→</span> : null}
              </article>
            ))}
          </div>
        </section>

        <section className="band-section" aria-labelledby="band-title">
          <div className="band-heading">
            <p className="lesson-kicker">Formación de</p>
            <h2 id="band-title">La banda de blues y rock.</h2>
            <p>Principalmente juntan batería, bajo y guitarra.</p>
            <p>Aqui veremos a 3 grandes exponentes actuales, uno de cada instrumento.</p>
            <p>Merecen tu respeto, tu like y tu suscripción a su canal si lo tienen.</p>
          
          </div>
          <div className="band-grid">
            <a
              className="band-card"
              href="https://www.youtube.com/watch?v=BQoxYdEpoQQ&list=PLPLmt3H5xszTeOdQyDUlMdWgCoI7lJ3rS&index=16"
              rel="noreferrer"
              target="_blank"
            >
              <strong>Guitarra</strong>
              <p>La melodía y los acordes.</p>
              <p>Es el instrumento que estamos aprendiendo.</p>
              <span className="band-card-watch">Ver video</span>
            </a>
            <a
              className="band-card"
              href="https://www.youtube.com/watch?v=VMycOhwjhQg&list=PLPLmt3H5xszTeOdQyDUlMdWgCoI7lJ3rS&index=17"
              rel="noreferrer"
              target="_blank"
            >
              <strong>Bajo</strong>
              <p>Las notas más graves de la banda.</p>
              <p>Se parece a la guitarra pero suena mucho más bajo.</p>
              <span className="band-card-watch">Ver video</span>
            </a>
            <a
              className="band-card"
              href="https://www.youtube.com/watch?v=jKH0Ik5gu5s&list=PLPLmt3H5xszTeOdQyDUlMdWgCoI7lJ3rS&index=15"
              rel="noreferrer"
              target="_blank"
            >
              <strong>Batería</strong>
              <p>El ritmo de la banda.</p>
              <p>Sin ella, todo sonaría desorganizado.</p>
              <span className="band-card-watch">Ver video</span>
            </a>
          </div>
          
        </section>

      </article>

      <div className="lesson-pager-wrap">
        <TemarioPager previous={previous} next={next} />
      </div>

      <style>{`
        .blues-page {
          background: #ffffff;
          box-sizing: border-box;
          color: #080808;
          min-height: 100vh;
          overflow-x: clip;
          padding: clamp(76px, 9vw, 116px) clamp(16px, 5vw, 84px) clamp(28px, 5vw, 72px);
          width: 100%;
        }

        .blues-content,
        .lesson-pager-wrap {
          box-sizing: border-box;
          margin: 0 auto;
          max-width: 1220px;
          min-width: 0;
          width: 100%;
        }

        .blues-content {
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

        .blues-header,
        .section-header {
          margin: 0 auto;
          max-width: 960px;
          text-align: center;
        }

        .blues-header h1 {
          font-size: clamp(42px, 7vw, 96px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 0.92;
          margin: 0;
          overflow-wrap: break-word;
          text-transform: uppercase;
          text-decoration: underline;
          text-decoration-thickness: 0.06em;
          text-underline-offset: 0.11em;
        }

        .section-header h2 {
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
        .history-box p,
        .timeline-card p {
          color: #303030;
          font-size: clamp(18px, 2vw, 24px);
          font-weight: 650;
          line-height: 1.42;
          margin: 0;
          overflow-wrap: anywhere;
        }

        .section-header strong,
        .formula-box strong {
          color: #080808;
          font-weight: 950;
        }

        .map-section {
          border-top: 1px solid #d4d4d8;
          display: grid;
          gap: clamp(18px, 3vw, 30px);
          min-width: 0;
          padding-top: clamp(24px, 4vw, 42px);
        }

        .blues-map-wrap {
          margin: 0;
          min-width: 0;
          overflow-x: auto;
          width: 100%;
        }

        .blues-map {
          display: block;
          height: auto;
          margin: 0 auto;
          min-width: 760px;
          width: min(100%, 1120px);
        }

        .map-bg {
          fill: #27313d;
        }

        .map-string {
          stroke: #aab3bf;
          stroke-width: 3;
        }

        .map-fret {
          stroke: #d6dce4;
          stroke-width: 4;
        }

        .map-nut {
          stroke: #edf1f5;
          stroke-width: 8;
        }

        .map-guide-dot {
          fill: #cad2dc;
          opacity: 0.78;
        }

        .roman-fret {
          fill: #080808;
          font-size: 15px;
          font-weight: 950;
          text-anchor: middle;
        }

        .map-note {
          fill: #f1f5f9;
          stroke: #a1a1aa;
          stroke-width: 3;
        }

        .map-note-e {
          stroke: #059669;
          stroke-width: 6;
        }

        .map-note-g {
          stroke: #2563eb;
          stroke-width: 6;
        }

        .map-note-special {
          stroke: #dc2626;
          stroke-width: 6;
        }

        .map-note-label {
          fill: #080808;
          font-size: 18px;
          font-weight: 950;
          text-anchor: middle;
        }

        .map-note-hint {
          fill: #303030;
          font-size: 15px;
          font-weight: 850;
          text-anchor: middle;
        }

        .formula-box,
        .history-box,
        .practice-link {
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

        .formula-box {
          border-color: #047857;
        }

        .history-box {
          border-radius: 48px;
          gap: clamp(28px, 5vw, 52px);
          max-width: 1120px;
          padding: clamp(24px, 4vw, 42px);
        }

        .history-copy {
          display: grid;
          gap: clamp(18px, 3vw, 28px);
          margin: 0 auto;
          max-width: 980px;
          text-align: center;
        }

        .history-copy p {
          color: #18181b;
          font-size: clamp(18px, 2vw, 25px);
          font-weight: 620;
          line-height: 1.5;
        }

        .history-copy strong,
        .timeline-card strong {
          color: #080808;
          font-weight: 950;
        }

        .musician-link {
          animation: none !important;
          color: #080808 !important;
          display: inline !important;
          font-weight: 950;
          text-decoration-color: #047857 !important;
          text-decoration-thickness: 2px !important;
          text-underline-offset: 0.16em !important;
        }

        .musician-link:hover,
        .musician-link:focus-visible {
          color: #047857 !important;
        }

        .underlined {
          text-decoration: underline;
          text-decoration-thickness: 0.08em;
          text-underline-offset: 0.16em;
        }

        .timeline-heading {
          margin: 0 auto;
          max-width: 760px;
          text-align: center;
        }

        .timeline-heading h2 {
          font-size: clamp(24px, 3.6vw, 46px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 1;
          margin: 0;
          overflow-wrap: break-word;
          text-transform: uppercase;
        }

        .timeline-grid {
          display: grid;
          gap: 18px;
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .timeline-card {
          border: 2px solid #080808;
          border-radius: 8px;
          display: grid;
          gap: 12px;
          min-width: 0;
          padding: 18px;
          position: relative;
        }

        .timeline-card h3 {
          color: #047857;
          font-size: clamp(17px, 1.8vw, 22px);
          font-weight: 950;
          line-height: 1.08;
          margin: 0;
          overflow-wrap: anywhere;
          text-transform: uppercase;
        }

        .timeline-card h3 span {
          color: #18181b;
          display: block;
          font-size: 14px;
          line-height: 1.2;
          margin-top: 6px;
          text-transform: none;
        }

        .timeline-title-link {
          color: inherit;
          text-decoration-color: #047857;
          text-decoration-thickness: 2px;
          text-underline-offset: 0.16em;
        }

        .timeline-title-link:hover,
        .timeline-title-link:focus-visible {
          color: #080808;
        }

        .timeline-card-copy {
          display: grid;
          gap: 8px;
        }

        .timeline-card p {
          color: #303030;
          font-size: 16px;
          font-weight: 650;
          line-height: 1.35;
        }

        .timeline-arrow {
          align-items: center;
          background: #ffffff;
          border: 2px solid #080808;
          border-radius: 999px;
          display: inline-flex;
          font-size: 20px;
          font-weight: 950;
          height: 34px;
          justify-content: center;
          position: absolute;
          right: -27px;
          top: 24px;
          width: 34px;
          z-index: 2;
        }

        .practice-link {
          border-color: #047857;
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

        .practice-link a:hover {
          color: #047857;
        }

        @media (max-width: 900px) {
          .evolution-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 760px) {
          .blues-header,
          .section-header,
          .formula-box,
          .history-box,
          .practice-link {
            text-align: left;
          }

          .history-box {
            border-radius: 10px;
          }

          .history-copy,
          .timeline-heading {
            text-align: left;
          }
        }

        @media (max-width: 900px) {
          .timeline-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .timeline-arrow {
            display: none;
          }
        }

        @media (max-width: 560px) {
          .timeline-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 520px) {
          .blues-content,
          .lesson-pager-wrap {
            max-width: 320px;
          }
        }

        .band-section {
          display: grid;
          gap: clamp(24px, 4vw, 40px);
          margin: 0 auto;
          max-width: 1120px;
          width: 100%;
        }

        .band-heading {
          margin: 0 auto;
          max-width: 920px;
          text-align: center;
        }

        .band-heading h2 {
          font-size: clamp(24px, 3.6vw, 46px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 1;
          margin: 0;
          overflow-wrap: break-word;
          text-transform: uppercase;
        }

        .band-grid {
          display: grid;
          gap: 18px;
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .band-card {
          border: 2px solid #080808;
          border-radius: 10px;
          color: #080808;
          display: grid;
          gap: 10px;
          min-width: 0;
          padding: clamp(20px, 3vw, 32px);
          text-decoration: none;
          transition: border-color 160ms ease, background 160ms ease;
        }

        .band-card:hover,
        .band-card:focus-visible {
          background: #f0fdf4;
          border-color: #047857;
        }

        .band-card:focus-visible {
          outline: 3px solid #047857;
          outline-offset: 4px;
        }

        .band-card strong {
          color: #080808;
          font-size: clamp(22px, 2.8vw, 34px);
          font-weight: 950;
          line-height: 1.08;
          overflow-wrap: anywhere;
          text-transform: uppercase;
        }

        .band-card p {
          color: #303030;
          font-size: clamp(15px, 1.6vw, 19px);
          font-weight: 650;
          line-height: 1.38;
          margin: 0;
          overflow-wrap: anywhere;
        }

        .band-card-watch {
          color: #047857;
          font-size: 13px;
          font-weight: 950;
          letter-spacing: 0.18em;
          margin-top: 6px;
          overflow-wrap: anywhere;
          text-transform: uppercase;
        }

        .band-note {
          border: 3px dashed #cbd5e1;
          border-radius: 10px;
          display: grid;
          gap: 8px;
          margin: 0 auto;
          max-width: 900px;
          overflow-wrap: anywhere;
          padding: clamp(14px, 2vw, 22px);
          text-align: center;
          width: 100%;
        }

        .band-note p {
          color: #303030;
          font-size: clamp(16px, 1.8vw, 20px);
          font-weight: 650;
          line-height: 1.5;
          margin: 0;
          overflow-wrap: anywhere;
        }

        @media (max-width: 900px) {
          .band-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 560px) {
          .band-grid {
            grid-template-columns: 1fr;
          }

          .band-heading,
          .band-note {
            text-align: left;
          }
        }
      `}</style>
    </main>
  );
}
