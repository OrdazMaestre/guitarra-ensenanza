'use client';

import Link from 'next/link';
import React, { useEffect, useRef, useState } from 'react';
import AlphaTabPlayer from '../../../components/guitar/AlphaTabPlayer';
import TemarioPager from '../TemarioPager';
import { playNote, preloadSamples, releaseNote, switchNote } from '../../../lib/guitarAudioEngine';
import { FRETBOARD_KEYMAP, hasKeyboardGhosting } from '../../../lib/fretboardKeymap';
import type { LessonPageProps } from './types';
import { useMetronome } from '../../../lib/useMetronome';
import MetronomeControls from '../../../components/guitar/MetronomeControls';

const fretNotes = [
  { fret: 0, string: 2, note: 'B' },
  { fret: 0, string: 3, note: 'G' },
  { fret: 0, string: 4, note: 'D' },
  { fret: 2, string: 5, note: 'B' },
  { fret: 3, string: 1, note: 'G' },
  { fret: 3, string: 2, note: 'D' },
  { fret: 3, string: 6, note: 'G' },
  { fret: 4, string: 3, note: 'B' },
  { fret: 5, string: 4, note: 'G' },
  { fret: 5, string: 5, note: 'D' },
  { fret: 7, string: 1, note: 'B' },
  { fret: 7, string: 3, note: 'D' },
  { fret: 7, string: 6, note: 'B' },
  { fret: 8, string: 2, note: 'G' },
  { fret: 9, string: 4, note: 'B' },
  { fret: 10, string: 1, note: 'D' },
  { fret: 10, string: 5, note: 'G' },
  { fret: 10, string: 6, note: 'D' },
  { fret: 12, string: 2, note: 'B' },
  { fret: 12, string: 3, note: 'G' },
  { fret: 12, string: 4, note: 'D' },
];


const OPEN_STRING_MIDI: Record<number, number> = { 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40 };

function GChordFretboard() {
  const fretWidth = 74;
  const boardX = 34;
  const boardY = 36;
  const boardWidth = fretWidth * 12;
  const boardHeight = 154;
  const stringGap = boardHeight / 5;
  const stringY = (string: number) => boardY + (string - 1) * stringGap;
  const fretX = (fret: number) => (fret === 0 ? boardX - 18 : boardX + (fret - 0.5) * fretWidth);

  const svgRef = useRef<SVGSVGElement>(null);
  const ptHeldRef = useRef(new Map<number, { string: number; fret: number; midi: number }>());
  const ptStringVoiceRef = useRef(new Map<number, { pid: number; voiceId: number }>());
  const [ptPositions, setPtPositions] = useState<{ string: number; fret: number }[]>([]);
  const [volume, setVolume] = useState(1.0);
  const [kbMode, setKbMode] = useState(false);

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
  const metr = useMetronome(volumeRef);
  useEffect(() => {
    if (!kbMode) return;
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
      const entry = FRETBOARD_KEYMAP[e.code];
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
  }, [kbMode]);

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
    if (x < boardX && x >= boardX - 34) {
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
              <circle cx={markerX} cy={markerY} fill="#fbbf24" opacity={noteIsMarked ? 0.5 : 0.9} r="16" />
            </g>
          );
        })}
      </>
    );
  }

  return (
    <figure className="fretboard-figure">
      <svg
        ref={svgRef}
        className="g-fretboard"
        viewBox="0 0 980 232"
        role="img"
        aria-label="Mapa del acorde de Sol Mayor con las notas G, B y D"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ touchAction: 'none', cursor: 'crosshair' }}
      >
        <rect x={boardX} y={boardY} width={boardWidth} height={boardHeight} fill="#27313d" />
        {[1, 2, 3, 4, 5, 6].map((string) => (
          <line className="g-string" key={string} x1={boardX} x2={boardX + boardWidth} y1={stringY(string)} y2={stringY(string)} />
        ))}
        {Array.from({ length: 13 }, (_, fret) => (
          <g key={fret}>
            <line className={fret === 0 ? 'g-nut' : 'g-fret'} x1={boardX + fret * fretWidth} x2={boardX + fret * fretWidth} y1={boardY} y2={boardY + boardHeight} />
            {fret > 0 ? (
              <text className="fret-number" x={boardX + (fret - 0.5) * fretWidth} y="20">
                {fret}
              </text>
            ) : null}
          </g>
        ))}
        {[3, 5, 7, 9].map((fret) => (
          <circle className="guide-dot" cx={fretX(fret)} cy={stringY(3.5)} key={`guide-${fret}`} r="8" />
        ))}
        <circle className="guide-dot" cx={fretX(12)} cy={stringY(2)} key="guide-12-top" r="8" />
        <circle className="guide-dot" cx={fretX(12)} cy={stringY(5)} key="guide-12-bottom" r="8" />
        {([3, 5, 7, 9, 12] as const).map((fret) => (
          <text className="roman-fret" key={`roman-${fret}`} x={fretX(fret)} y={boardY + boardHeight + 20}>
            {({ 3: 'III', 5: 'V', 7: 'VII', 9: 'IX', 12: 'XII' } as Record<number, string>)[fret]}
          </text>
        ))}
        {fretNotes.map((item) => (
          <g key={`${item.fret}-${item.string}-${item.note}`}>
            <circle className={item.note === 'G' ? 'note-dot note-g' : 'note-dot'} cx={fretX(item.fret)} cy={stringY(item.string)} r="16" />
            <text className="note-label" x={fretX(item.fret)} y={stringY(item.string) + 5}>
              {item.note}
            </text>
          </g>
        ))}
        {interactionOverlay()}
      </svg>
      <div style={{ overflowX: 'auto', paddingTop: '6px' }}><div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: 'max-content', marginLeft: 'auto' }}>
        <button
          onClick={() => setKbMode(m => !m)}
          style={{ background: kbMode ? '#047857' : 'transparent', border: `1.5px solid ${kbMode ? '#047857' : '#9ca3af'}`, borderRadius: '5px', color: kbMode ? '#fff' : '#6b7280', cursor: 'pointer', fontSize: '12px', fontWeight: 700, lineHeight: 1.4, padding: '3px 8px' }}
        >
          {kbMode ? 'KB: ON' : 'KB'}
        </button>
        {kbMode && kbGhostWarn && (
          <span style={{ fontSize: '11px', color: '#92400e', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '4px', padding: '2px 6px', whiteSpace: 'nowrap' }}>
            ⚠ Necesitas teclado gaming para tocar ciertos acordes
          </span>
        )}
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
        <MetronomeControls {...metr} /></div>
      </div>
    </figure>
  );
}

export default function FigurasAcordesPage({ previous, next }: LessonPageProps) {
  return (
    <main className="figures-page">
      <article className="figures-content">
        <header className="figures-header">
          <h1>Figuras de acordes</h1>
          <div className="short-copy">
            <p>Los acordes se pueden tocar de muchas formas.</p>
            <p>Y en muchos sitios de la guitarra.</p>
            <p>Lo importante es tocar las notas correctas.</p>
          </div>
        </header>

        <section className="rule-box" aria-label="Ejemplo">
          <p>Usamos de ejemplo el acorde de Sol Mayor.</p>
          <p>Sol Mayor siempre usa las notas G, B y D.</p>
        </section>

        <section className="figures-section" aria-labelledby="map-title">
          <header className="section-header">
            <h2 id="map-title">Notas del acorde de sol mayor</h2>
            <p>G, B y D.</p>
          </header>
          <GChordFretboard />
        </section>

        <section className="figures-section" aria-labelledby="five-figures-title">
          <header className="section-header">
            <h2 id="five-figures-title">5 figuras para el mismo acorde</h2>
          </header>
          <div className="compact-player-frame">
            <AlphaTabPlayer compact layout="horizontal" minHeight={210} source="/tabs/figuras-tri.gp" title="Figuras triada" />
          </div>
        </section>

        <section className="practice-box" aria-label="Ejercicio">
          <p>
            <strong>Ejercicio:</strong> practicar la progresion de acordes de arriba.
          </p>
          <p>No hace falta tocar las 6 cuerdas a la vez desde el principio.</p>
          <p>Podemos usar solo las 3 cuerdas de arriba o solo las 3 cuerdas de abajo.</p></section><section className="practice-box" aria-label="Ejercicio">
          <p>Si estamos atentos nos damos cuenta de que son las figuras de todos los acordes mayores básicos.</p>
          <p>Cada acorde básico está en su propia figura para facilitar tocarlos todos entre los trastes 1 y 5.</p>
        </section>

        <section className="theory-link" aria-label="Enlace a teoría">
          <Link href="/lecciones/temario/escalas">¿Cómo funciona la música y por qué vamos a usar Sol Mayor para el resto de explicaciones?</Link>
        </section>
      </article>

      <div className="lesson-pager-wrap">
        <TemarioPager previous={previous} next={next} />
      </div>

      <style>{`
        .figures-page {
          background: #ffffff;
          box-sizing: border-box;
          color: #080808;
          min-height: 100vh;
          overflow-x: clip;
          padding: clamp(28px, 5vw, 72px) clamp(16px, 5vw, 84px);
          width: 100%;
        }

        .figures-content,
        .lesson-pager-wrap {
          box-sizing: border-box;
          margin: 0 auto;
          max-width: 1220px;
          min-width: 0;
          width: 100%;
        }

        .figures-content {
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

        .figures-header,
        .section-header {
          margin: 0 auto;
          max-width: 920px;
          text-align: center;
        }

        .figures-header h1 {
          font-size: clamp(42px, 7vw, 92px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 0.95;
          margin: 0;
          overflow-wrap: break-word;
          text-transform: uppercase;
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
        .rule-box p,
        .practice-box p,
        .theory-link p {
          color: #303030;
          font-size: clamp(18px, 2vw, 24px);
          font-weight: 650;
          line-height: 1.42;
          margin: 0;
          overflow-wrap: anywhere;
        }

        .rule-box,
        .practice-box,
        .theory-link {
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

        .rule-box p:first-child,
        .practice-box strong {
          color: #080808;
          font-weight: 950;
        }

        .figures-section {
          border-top: 1px solid #d4d4d8;
          display: grid;
          gap: clamp(18px, 3vw, 30px);
          min-width: 0;
          padding-top: clamp(24px, 4vw, 42px);
        }

        .compact-player-frame {
          margin: 0 auto;
          max-width: 100%;
          min-width: 0;
          overflow-x: auto;
          overscroll-behavior-x: contain;
          width: 100%;
        }

        .compact-player-frame > div {
          min-width: min(100%, 980px);
        }

        .compact-player-frame .alphatab-container {
          max-width: 100%;
          overflow-x: auto;
        }

        .fretboard-figure {
          margin: 0;
          min-width: 0;
          overflow-x: auto;
          width: 100%;
        }

        .g-fretboard {
          display: block;
          height: auto;
          margin: 0 auto;
          min-width: 760px;
          width: min(100%, 1040px);
        }

        .g-string {
          stroke: #9ca3af;
          stroke-width: 3;
        }

        .g-fret {
          stroke: #d1d5db;
          stroke-width: 4;
        }

        .g-nut {
          stroke: #e5e7eb;
          stroke-width: 8;
        }

        .fret-number {
          fill: #080808;
          font-size: 16px;
          font-weight: 850;
          text-anchor: middle;
        }

        .guide-dot {
          fill: #cbd5e1;
          opacity: 0.8;
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

        .note-g {
          stroke: #2563eb;
          stroke-width: 5;
        }

        .note-label {
          fill: #080808;
          font-size: 20px;
          font-weight: 950;
          text-anchor: middle;
        }

        .theory-link {
          border-color: #047857;
        }

        .theory-link a {
          color: #080808;
          font-size: clamp(20px, 2.4vw, 30px);
          font-weight: 950;
          line-height: 1.18;
          overflow-wrap: anywhere;
          text-decoration-color: #047857;
          text-decoration-thickness: 3px;
          text-underline-offset: 6px;
        }

        .theory-link a:hover {
          color: #047857;
        }

        @media (max-width: 760px) {
          .figures-header,
          .section-header,
          .rule-box,
          .practice-box,
          .theory-link {
            text-align: left;
          }
        }

        @media (max-width: 520px) {
          .figures-content,
          .lesson-pager-wrap {
            max-width: 320px;
          }
        }
      `}</style>
    </main>
  );
}
