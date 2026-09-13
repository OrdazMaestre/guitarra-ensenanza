'use client';

import type { NoteMarks } from '@/app/lib/useNoteMarks';

export function PaletteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="7" cy="7" r="2" fill="#ef4444" />
      <circle cx="13" cy="7" r="2" fill="#3b82f6" />
      <circle cx="7" cy="13" r="2" fill="#eab308" />
      <circle cx="13" cy="13" r="2" fill="#22c55e" />
    </svg>
  );
}

export function PaletteToggleButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={active ? 'Desactivar marcador de notas' : 'Activar marcador de notas'}
      aria-pressed={active}
      style={{
        alignItems: 'center',
        background: active ? '#047857' : 'transparent',
        border: `1.5px solid ${active ? '#047857' : '#9ca3af'}`,
        borderRadius: '5px',
        color: active ? '#fff' : '#6b7280',
        cursor: 'pointer',
        display: 'inline-flex',
        justifyContent: 'center',
        lineHeight: 1,
        padding: '3px 8px',
      }}
    >
      <PaletteIcon />
    </button>
  );
}

export function NoteMarksOverlay({
  endFret,
  fontSize = 12,
  getNoteName,
  getX,
  getY,
  marks,
  radius = 16,
  startFret,
  stringCount = 6,
}: {
  endFret: number;
  fontSize?: number;
  getNoteName: (string: number, fret: number) => string;
  getX: (fret: number) => number;
  getY: (string: number) => number;
  marks: NoteMarks;
  radius?: number;
  startFret: number;
  stringCount?: number;
}) {
  if (Object.keys(marks).length === 0) return null;

  const elements: React.ReactNode[] = [];
  for (let string = 1; string <= stringCount; string++) {
    for (let fret = startFret; fret <= endFret; fret++) {
      const name = getNoteName(string, fret);
      const color = marks[name];
      if (!color) continue;
      const cx = getX(fret);
      const cy = getY(string);
      elements.push(
        <g key={`note-mark-${string}-${fret}`} pointerEvents="none">
          <circle cx={cx} cy={cy} fill={color} r={radius} stroke="#080808" strokeWidth="2" />
          <text
            fill="#080808"
            fontSize={fontSize}
            fontWeight="900"
            paintOrder="stroke"
            stroke="#ffffff"
            strokeWidth="3"
            textAnchor="middle"
            x={cx}
            y={cy + fontSize * 0.35}
          >
            {name}
          </text>
        </g>,
      );
    }
  }

  return <>{elements}</>;
}
