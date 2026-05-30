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

export function ReducedFretboardDiagram({ ariaLabel, endFret, guideDots = [], notes, startFret }: ReducedFretboardDiagramProps) {
  const fretCount = startFret === 0 ? endFret : endFret - startFret + 1;
  const boardX = 42;
  const boardY = 28;
  const fretWidth = 58;
  const boardHeight = 158;
  const boardWidth = fretCount * fretWidth;
  const bottomLabelY = boardY + boardHeight + 30;
  const viewBoxWidth = boardX + boardWidth + 42;
  const viewBoxHeight = startFret > 0 ? bottomLabelY + 18 : boardY + boardHeight + 20;
  const stringY = (string: number) => boardY + (string - 1) * (boardHeight / 5);
  const visibleRomanFrets = Object.keys(romanFretLabels)
    .map(Number)
    .filter((fret) => startFret > 0 && fret >= startFret && fret <= endFret);

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
      {guideDots.map((dot) => (
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
      {visibleRomanFrets.map((fret) => (
        <text className="reduced-roman-fret" key={`roman-${fret}`} x={fretMarkerX(boardX, fretWidth, startFret, fret)} y={bottomLabelY}>
          {romanFretLabels[fret]}
        </text>
      ))}
    </svg>
  );
}
