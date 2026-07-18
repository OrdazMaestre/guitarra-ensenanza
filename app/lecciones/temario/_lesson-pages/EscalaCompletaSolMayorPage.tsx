'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { playNote, preloadSamples, releaseNote, switchNote } from '@/app/lib/guitarAudioEngine';
import TemarioPager from '../TemarioPager';
import type { LessonPageProps } from './types';

const OPEN_STRING_MIDI: Record<number, number> = {
  1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40,
};

function getScaleSvgCoords(
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

const chromaticNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const stringTunings = [
  { label: 'E', open: 4 },
  { label: 'B', open: 11 },
  { label: 'G', open: 7 },
  { label: 'D', open: 2 },
  { label: 'A', open: 9 },
  { label: 'E', open: 4 },
];

const gMajorChord = ['G', 'B', 'D'];
const gMajorPentatonic = ['G', 'A', 'B', 'D', 'E'];
const gMajorSeventh = ['G', 'A', 'B', 'D', 'E', 'F#'];
const gMajorScale = ['G', 'A', 'B', 'C', 'D', 'E', 'F#'];

function noteNameForFret(open: number, fret: number) {
  return chromaticNotes[(open + fret) % chromaticNotes.length];
}

function ScaleFretboard({
  ariaLabel,
  notes,
  showFretNumbers = false,
}: {
  ariaLabel: string;
  notes: string[];
  showFretNumbers?: boolean;
}) {
  const boardX = 58;
  const boardY = showFretNumbers ? 56 : 34;
  const fretWidth = 70;
  const boardWidth = fretWidth * 12;
  const boardHeight = 174;
  const stringGap = boardHeight / 5;
  const stringY = (string: number) => boardY + (string - 1) * stringGap;
  const fretX = (fret: number) => (fret === 0 ? boardX - 28 : boardX + (fret - 0.5) * fretWidth);
  const viewBoxWidth = boardX + boardWidth + 64;
  const viewBoxHeight = boardY + boardHeight + 42;
  const fretNotes = stringTunings.flatMap((string, stringIndex) =>
    Array.from({ length: 13 }, (_, fret) => {
      const note = noteNameForFret(string.open, fret);

      return notes.includes(note)
        ? {
            fret,
            note,
            string: stringIndex + 1,
          }
        : null;
    }).filter((item): item is { fret: number; note: string; string: number } => item !== null),
  );

  const svgRef = useRef<SVGSVGElement>(null);
  const voiceIdRef = useRef(-1);
  const curPosRef = useRef<{ string: number; fret: number } | null>(null);
  const isHeldRef = useRef(false);
  const [pressedPos, setPressedPos] = useState<{ string: number; fret: number } | null>(null);

  useEffect(() => {
    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(() => preloadSamples());
      return () => cancelIdleCallback(id);
    }
    const id = window.setTimeout(() => preloadSamples(), 300);
    return () => window.clearTimeout(id);
  }, []);

  function getPos(e: React.PointerEvent<SVGSVGElement>): { string: number; fret: number } | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const coords = getScaleSvgCoords(e, svg);
    if (!coords) return null;
    const { x, y } = coords;
    const halfGap = stringGap / 2;
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
    return { string, fret };
  }

  async function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const pos = getPos(e);
    if (!pos) return;
    const svg = svgRef.current;
    if (!svg) return;
    svg.setPointerCapture(e.pointerId);
    isHeldRef.current = true;
    curPosRef.current = pos;
    setPressedPos(pos);
    const id = await playNote(OPEN_STRING_MIDI[pos.string] + pos.fret, false);
    voiceIdRef.current = id;
    if (!isHeldRef.current) {
      releaseNote(id);
      voiceIdRef.current = -1;
    }
  }

  async function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!isHeldRef.current) return;
    const pos = getPos(e);
    if (!pos) return;
    const cur = curPosRef.current;
    if (cur && cur.string === pos.string && cur.fret === pos.fret) return;
    curPosRef.current = pos;
    setPressedPos(pos);
    const id = await switchNote(voiceIdRef.current, OPEN_STRING_MIDI[pos.string] + pos.fret, false);
    voiceIdRef.current = id;
    if (!isHeldRef.current) {
      releaseNote(id);
      voiceIdRef.current = -1;
    }
  }

  function onPointerUp() {
    if (!isHeldRef.current) return;
    isHeldRef.current = false;
    curPosRef.current = null;
    setPressedPos(null);
    if (voiceIdRef.current >= 0) {
      releaseNote(voiceIdRef.current);
      voiceIdRef.current = -1;
    }
  }

  function interactionOverlay() {
    if (!pressedPos) return null;
    const { string, fret } = pressedPos;
    const markerX = fretX(fret);
    const sy = stringY(string);
    const noteIsMarked = fretNotes.some(n => n.string === string && n.fret === fret);
    return (
      <g
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
  }

  return (
    <figure className="scale-board-wrap">
      <svg
        ref={svgRef}
        className="scale-board"
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        role="img"
        aria-label={ariaLabel}
        style={{ touchAction: 'none', cursor: 'pointer', userSelect: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {showFretNumbers
          ? Array.from({ length: 12 }, (_, fret) => (
              <text className="fret-number" key={`number-${fret + 1}`} x={boardX + fret * fretWidth + fretWidth / 2} y="26">
                {fret + 1}
              </text>
            ))
          : null}

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
          <text className="roman-fret" key={`roman-${fret}`} x={boardX + (fret - 0.5) * fretWidth} y={boardY + boardHeight + 28}>
            {({ 3: 'III', 5: 'V', 7: 'VII', 9: 'IX', 12: 'XII' } as Record<number, string>)[fret]}
          </text>
        ))}
        {fretNotes.map((item) => (
          <g key={`${item.string}-${item.fret}-${item.note}`}>
            <circle className={item.note === 'G' ? 'note-dot note-g' : item.note === 'E' ? 'note-dot note-e' : 'note-dot'} cx={fretX(item.fret)} cy={stringY(item.string)} r="17" />
            <text className="note-label" x={fretX(item.fret)} y={stringY(item.string) + 5}>
              {item.note}
            </text>
          </g>
        ))}
        {interactionOverlay()}
      </svg>
    </figure>
  );
}

export default function EscalaCompletaSolMayorPage({ previous, next }: LessonPageProps) {
  return (
    <main className="complete-scale-page">
      <article className="complete-scale-content">
        <header className="complete-scale-header">
          <p className="lesson-kicker">Escalas de Sol Mayor y Mi menor</p>
          <h1>Escala completa de Sol Mayor</h1>
        </header>

        <section className="map-section" aria-labelledby="chord-title">
          <header className="section-header">
            <h2 id="chord-title">Arpegio de Sol Mayor</h2>
            <p>Ya vimos el mapa del arpegio de Sol Mayor.</p>
            <p>G, B y D.</p>
          </header>
          <ScaleFretboard ariaLabel="Notas del arpegio triada de Sol Mayor en los doce primeros trastes" notes={gMajorChord} />
        </section>

        <section className="map-section dashed-section" aria-labelledby="pentatonic-title">
          <header className="section-header">
            <h2 id="pentatonic-title">Pentatónica de Sol Mayor</h2>
            <p>Añadimos A y E.</p>
            <p>Así aparece la pentatónica mayor de Sol.</p>
            <p>Es igual que la pentatónica menor de Mi.</p>
          </header>
          <ScaleFretboard ariaLabel="Pentatónica mayor de Sol y pentatónica menor de Mi en los doce primeros trastes" notes={gMajorPentatonic} />
          <div className="formula-box">
            <p>
              <strong>Sol Mayor pentatónica:</strong> G, A, B, D, E.
            </p>
            <p>
              <strong>Mi menor pentatónica:</strong> E, G, A, B, D.
            </p>
          </div>
        </section>

        <section className="map-section dashed-section" aria-labelledby="seventh-title">
          <header className="section-header">
            <h2 id="seventh-title">Pentatónica + séptima</h2>
            <p>Añadimos la séptima nota de Sol Mayor: <strong>F#</strong>.</p>
          </header>
          <ScaleFretboard ariaLabel="Pentatónica de Sol Mayor con la séptima F# en los doce primeros trastes" notes={gMajorSeventh} />
          
        </section>

        <section className="map-section dashed-section" aria-labelledby="complete-title">
          <header className="section-header">
            <h2 id="complete-title">Escala de Sol Mayor</h2>
            <p>Ahora añadimos la nota que faltaba: C (la cuarta nota de esta escala).</p>
          </header>
          <ScaleFretboard ariaLabel="Escala completa de Sol Mayor en los doce primeros trastes" notes={gMajorScale} />
          <div className="formula-box formula-green">
            <p>
              <strong>Sol Mayor:</strong> G, A, B, C, D, E, F#.
            </p>
            <p>
              <strong>Mi menor:</strong> E, F#, G, A, B, C, D.
            </p>
          </div>
        </section>

        <section className="memory-box" aria-label="Idea importante">
          <p>Mi menor es igual que Sol Mayor.</p>
          <p>Pero usamos la tónica E en lugar de la tónica G.</p>
          <p>Este mapa lo aprenderemos igual que el de la pentatónica: con ejercicios en las siguientes 2 páginas.</p>
        </section>

        <section className="practice-link" aria-label="Ramas de la escala completa">
          <Link href="/lecciones/temario/acordes-escala-sol-mayor">Acordes de la escala de Sol Mayor</Link>
          <Link href="/lecciones/temario/ejercicios-escalas">Ejercicios de escalas</Link>
        </section>
      </article>

      <div className="lesson-pager-wrap">
        <TemarioPager previous={previous} next={next} />
      </div>

      <style>{`
        .complete-scale-page {
          background: #ffffff;
          box-sizing: border-box;
          color: #080808;
          min-height: 100vh;
          overflow-x: clip;
          padding: clamp(34px, 5vw, 76px) clamp(16px, 5vw, 84px);
          width: 100%;
        }

        .complete-scale-content,
        .lesson-pager-wrap {
          box-sizing: border-box;
          margin: 0 auto;
          max-width: 1220px;
          min-width: 0;
          width: 100%;
        }

        .complete-scale-content {
          display: grid;
          gap: clamp(34px, 6vw, 72px);
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

        .complete-scale-header,
        .section-header {
          margin: 0 auto;
          max-width: 940px;
          text-align: center;
        }

        .complete-scale-header h1 {
          font-size: clamp(38px, 7vw, 88px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 0.94;
          margin: 0;
          overflow-wrap: break-word;
          text-transform: uppercase;
          text-decoration: underline;
          text-decoration-thickness: 0.06em;
          text-underline-offset: 0.12em;
        }

        .section-header h2 {
          font-size: clamp(28px, 4.6vw, 56px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 1;
          margin: 0;
          overflow-wrap: break-word;
          text-transform: uppercase;
        }

        .short-copy {
          display: grid;
          gap: 8px;
          margin: clamp(20px, 4vw, 32px) auto 0;
          max-width: 760px;
        }

        .short-copy p,
        .section-header p,
        .formula-box p,
        .memory-box p {
          color: #303030;
          font-size: clamp(18px, 2vw, 24px);
          font-weight: 650;
          line-height: 1.42;
          margin: 0;
          overflow-wrap: anywhere;
        }

        .map-section {
          display: grid;
          gap: clamp(18px, 3vw, 30px);
          min-width: 0;
          padding-top: clamp(24px, 4vw, 42px);
        }

        .dashed-section {
          border-top: 2px dashed #8a8f98;
        }

        .scale-board-wrap {
          margin: 0;
          min-width: 0;
          overflow-x: auto;
          width: 100%;
        }

        .scale-board {
          display: block;
          height: auto;
          margin: 0 auto;
          min-width: 760px;
          width: min(100%, 1120px);
        }

        .board-bg {
          fill: #26313d;
        }

        .string-label,
        .fret-number {
          fill: #080808;
          font-size: 16px;
          font-weight: 950;
          text-anchor: middle;
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
          fill: #080808;
          font-size: 17px;
          font-weight: 950;
          text-anchor: middle;
        }

        .formula-box,
        .memory-box,
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

        .formula-green,
        .memory-box {
          border-color: #047857;
        }

        .formula-box strong,
        .memory-box strong {
          color: #080808;
          font-weight: 950;
        }

        .memory-box {
          border-radius: 48px;
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

        .practice-link a:hover,
        .practice-link a:focus-visible {
          color: #047857;
        }

        .practice-link a:focus-visible {
          outline: 3px solid #047857;
          outline-offset: 4px;
        }

        @media (max-width: 760px) {
          .complete-scale-header,
          .section-header,
          .formula-box,
          .memory-box,
          .practice-link {
            text-align: left;
          }

          .memory-box {
            border-radius: 10px;
          }
        }

        @media (max-width: 520px) {
          .complete-scale-content,
          .lesson-pager-wrap {
            max-width: 320px;
          }
        }
      `}</style>
    </main>
  );
}
