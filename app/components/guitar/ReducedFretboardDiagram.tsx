'use client';
import { useEffect, useRef, useState } from 'react';
import { playNote, preloadSamples, releaseNote, switchNote } from '@/app/lib/guitarAudioEngine';

// Standard tuning: MIDI for each open string (string 1 = high E)
const OPEN_STRING_MIDI: Record<number, number> = {
  1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40,
};

type FretboardNote = {
  fret: number;
  label: string;
  string: number;
  tone?: 'minor' | 'root' | 'special';
};

type GuideDot = {
  fret: number;
  string?: number;
};

interface ReducedFretboardDiagramProps {
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

export function ReducedFretboardDiagram({ ariaLabel, endFret, fretLabels, fretLabelsAbove, guideDots = [], notes, startFret }: ReducedFretboardDiagramProps) {
  const fretCount = startFret === 0 ? endFret : endFret - startFret + 1;
  const boardX = 42;
  const fretWidth = 58;
  const boardHeight = 158;
  const stringGap = boardHeight / 5;
  const allRomanFrets = Object.keys(romanFretLabels)
    .map(Number)
    .filter((fret) => fret >= startFret && fret <= endFret);
  const romansGoAbove = !!fretLabels && allRomanFrets.length > 0;
  const boardY = (fretLabelsAbove || romansGoAbove) ? 44 : 28;
  const boardWidth = fretCount * fretWidth;
  const bottomLabelY = boardY + boardHeight + 30;
  const hasBottomLabels = !!fretLabels || (allRomanFrets.length > 0 && !romansGoAbove);
  const viewBoxWidth = boardX + boardWidth + 42;
  const viewBoxHeight = hasBottomLabels ? bottomLabelY + 18 : boardY + boardHeight + 20;
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
    const coords = getSvgCoords(e, svg);
    if (!coords) return null;
    const { x, y } = coords;

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
    const markerX = fretMarkerX(boardX, fretWidth, startFret, fret);
    const sy = stringY(string);
    const noteIsMarked = notes.some(n => n.string === string && n.fret === fret);
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
          r="16"
        />
      </g>
    );
  }

  return (
    <svg
      ref={svgRef}
      className="reduced-fretboard"
      viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
      role="img"
      aria-label={ariaLabel}
      style={{ touchAction: 'none', cursor: 'pointer', userSelect: 'none' }}
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
            x1={boardX + index * fretWidth}
            x2={boardX + index * fretWidth}
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
          cx={fretMarkerX(boardX, fretWidth, startFret, dot.fret)}
          cy={stringY(dot.string ?? 3.5)}
          key={`guide-${dot.fret}-${dot.string ?? 'center'}`}
          r="7"
        />
      ))}
      {notes.map((note) => (
        <g key={`${note.string}-${note.fret}-${note.label}`}>
          <circle
            className={`reduced-note ${noteToneClass(note)}`}
            cx={fretMarkerX(boardX, fretWidth, startFret, note.fret)}
            cy={stringY(note.string)}
            r="16"
          />
          <text className="reduced-note-label" x={fretMarkerX(boardX, fretWidth, startFret, note.fret)} y={stringY(note.string) + 5}>
            {note.label}
          </text>
        </g>
      ))}
      {fretLabelsAbove && Array.from(
        { length: startFret === 0 ? endFret + 1 : endFret - startFret + 1 },
        (_, index) => {
          const fret = startFret === 0 ? index : startFret + index;
          return (
            <text className="reduced-fret-number-above" key={`fretnumtop-${fret}`} x={fretMarkerX(boardX, fretWidth, startFret, fret)} y={boardY - 20}>
              {fret}
            </text>
          );
        }
      )}
      {allRomanFrets.map((fret) => (
        <text className="reduced-roman-fret" key={`roman-${fret}`} x={fretMarkerX(boardX, fretWidth, startFret, fret)} y={romansGoAbove ? boardY - 20 : bottomLabelY}>
          {romanFretLabels[fret]}
        </text>
      ))}
      {fretLabels && Array.from(
        { length: startFret === 0 ? endFret + 1 : endFret - startFret + 1 },
        (_, index) => {
          const fret = startFret === 0 ? index : startFret + index;
          return (
            <text className="reduced-fret-number" key={`fretnum-${fret}`} x={fretMarkerX(boardX, fretWidth, startFret, fret)} y={bottomLabelY}>
              {fret}
            </text>
          );
        }
      )}
      {interactionOverlay()}
    </svg>
  );
}

export function ReducedFretboardStyles() {
  return (
    <style>{`
      .reduced-fretboard {
        display: block;
        height: auto;
        max-width: 100%;
        width: 100%;
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
