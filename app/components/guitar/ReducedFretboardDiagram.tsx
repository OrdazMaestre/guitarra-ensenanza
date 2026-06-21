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

export function ReducedFretboardDiagram({ ariaLabel, endFret, fretLabels, fretLabelsAbove, guideDots = [], notes, startFret }: ReducedFretboardDiagramProps) {
  const fretCount = startFret === 0 ? endFret : endFret - startFret + 1;
  const boardX = 42;
  const fretWidth = 58;
  const boardHeight = 158;
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
  const stringY = (string: number) => boardY + (string - 1) * (boardHeight / 5);
  const passedFrets = new Set(guideDots.map((d) => d.fret));
  const mergedGuideDots = [
    ...guideDots,
    ...[3, 5, 7, 9, 12]
      .filter((f) => f >= startFret && f <= endFret && !passedFrets.has(f))
      .map((f) => ({ fret: f })),
  ];

  return (
    <svg className="reduced-fretboard" viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`} role="img" aria-label={ariaLabel}>
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
