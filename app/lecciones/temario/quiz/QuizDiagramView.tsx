import { majorChords, minorChords, powerChords } from '@/app/lib/quiz/chordBank';
import { noteNameForFret } from '@/app/lib/quiz/musicNotes';
import type { QuizDiagram } from '@/app/lib/quiz/types';

// Diagramas puramente decorativos para las preguntas del quiz: SIN interactividad, sin audio, sin
// MidiInstrumentChrome. No son instrumentos MIDI (no se tocan), son solo la ilustración de una
// pregunta — por eso no llevan KB/volumen/metrónomo ni viven dentro de .midi-instrument-host.

const STRING_LABELS = ['E', 'B', 'G', 'D', 'A', 'E'];

// Trastes de referencia estandar (mismos que usa ReducedFretboardDiagram en el resto de la web) —
// un punto/doble-punto con su numero romano debajo, para orientarse en el mastil sobre todo cuando
// el diagrama no muestra el nombre de la nota (ver hideNoteLabels).
const ROMAN_FRET_LABELS: Record<number, string> = { 3: 'III', 5: 'V', 7: 'VII', 9: 'IX', 12: 'XII' };
const REFERENCE_FRETS = [3, 5, 7, 9, 12];

function StringMarkerDiagram({ string }: { string: number }) {
  const gap = 24;
  const width = 220;
  const height = gap * 5 + 40;
  return (
    <svg className="quiz-diagram quiz-string-diagram" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Cuerda ${string} marcada`}>
      {[1, 2, 3, 4, 5, 6].map((s) => {
        const y = 20 + (s - 1) * gap;
        const active = s === string;
        return (
          <g key={s}>
            <line x1={40} x2={width - 20} y1={y} y2={y} className={active ? 'quiz-string-line-active' : 'quiz-string-line'} />
            <text x={20} y={y + 4} className="quiz-string-label">{STRING_LABELS[s - 1]}</text>
          </g>
        );
      })}
    </svg>
  );
}

function FretboardMarksDiagram({ startFret, endFret, positions, ordered, hideNoteLabels }: { endFret: number; hideNoteLabels?: boolean; ordered?: boolean; positions: { fret: number; string: number }[]; startFret: number }) {
  const boardX = 40;
  const fretWidth = 52;
  const boardHeight = 140;
  const stringGap = boardHeight / 5;
  const fretCount = startFret === 0 ? endFret : endFret - startFret + 1;
  const boardY = 24;
  const boardWidth = fretCount * fretWidth;
  const viewBoxWidth = boardX + boardWidth + 30;
  const viewBoxHeight = boardY + boardHeight + 30;
  const stringY = (string: number) => boardY + (string - 1) * stringGap;
  const fretX = (fret: number) => {
    if (startFret === 0 && fret === 0) return boardX - 18;
    return startFret === 0 ? boardX + (fret - 0.5) * fretWidth : boardX + (fret - startFret + 0.5) * fretWidth;
  };
  const referenceFrets = REFERENCE_FRETS.filter((f) => f >= startFret && f <= endFret);
  const romanY = boardY + boardHeight + 22;

  return (
    <svg className="quiz-diagram quiz-fretboard-diagram" viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`} role="img" aria-label="Posiciones marcadas en el mastil">
      <rect className="quiz-board-bg" x={boardX} y={boardY} width={boardWidth} height={boardHeight} />
      {[1, 2, 3, 4, 5, 6].map((s) => (
        <line key={`string-${s}`} className="quiz-string" x1={boardX} x2={boardX + boardWidth} y1={stringY(s)} y2={stringY(s)} />
      ))}
      {Array.from({ length: fretCount + 1 }, (_, index) => {
        const fret = startFret === 0 ? index : startFret + index;
        const isNut = startFret === 0 && index === 0;
        return (
          <line
            key={`fret-${fret}`}
            className={isNut ? 'quiz-nut' : 'quiz-fret'}
            x1={boardX + index * fretWidth}
            x2={boardX + index * fretWidth}
            y1={boardY}
            y2={boardY + boardHeight}
          />
        );
      })}
      {referenceFrets.flatMap((fret) => (fret === 12 ? [stringY(2), stringY(5)] : [stringY(3.5)]).map((cy) => (
        <circle key={`guide-${fret}-${cy}`} className="quiz-guide-dot" cx={fretX(fret)} cy={cy} r="6" />
      )))}
      {referenceFrets.map((fret) => (
        <text key={`roman-${fret}`} className="quiz-roman-fret" x={fretX(fret)} y={romanY}>
          {ROMAN_FRET_LABELS[fret]}
        </text>
      ))}
      {positions.map((pos, index) => (
        <g key={`${pos.string}-${pos.fret}`}>
          <circle className="quiz-note-dot" cx={fretX(pos.fret)} cy={stringY(pos.string)} r="15" />
          {hideNoteLabels ? null : (
            <text className="quiz-note-label" x={fretX(pos.fret)} y={stringY(pos.string) + 5}>
              {noteNameForFret(pos.string, pos.fret)}
            </text>
          )}
          {ordered ? (
            <text className="quiz-order-badge" x={fretX(pos.fret) + 14} y={stringY(pos.string) - 14}>
              {index + 1}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}

function findChord(chordEnglish: string, quality: 'mayor' | 'menor' | 'power') {
  if (quality === 'power') return powerChords.find((c) => c.english === chordEnglish);
  return [...majorChords, ...minorChords].find((c) => c.english === chordEnglish && c.quality === quality);
}

function ChordDiagramView({ chordEnglish, hideNoteLabels, quality }: { chordEnglish: string; hideNoteLabels?: boolean; quality: 'mayor' | 'menor' | 'power' }) {
  const chord = findChord(chordEnglish, quality);
  if (!chord) return null;

  const stringY = (s: number) => 18 + (s - 1) * 20;

  // Grid de 4 trastes solamente (nut..fret4): el unico traste de referencia estandar que cabe
  // siempre dentro es el III. Chords cuyos markers llegan a fret 5 (ej. DOm, SOLm) ya se salen del
  // grid dibujado por este diagrama, asi que V no tendria una columna real donde apoyarse aqui.
  const chordReferenceFret = 3;

  if (quality === 'power' && 'notes' in chord) {
    const fretX = (fret: number) => 24 + (fret - 0.5) * 19;
    return (
      <svg className="quiz-diagram quiz-chord-diagram" viewBox="0 0 112 136" role="img" aria-label={hideNoteLabels ? 'Diagrama de un power chord de guitarra' : `Power chord ${chord.english}`}>
        <line className="quiz-nut" x1="24" x2="24" y1="18" y2="118" />
        {[1, 2, 3, 4, 5, 6].map((s) => <line key={s} className="quiz-string" x1="24" x2="100" y1={stringY(s)} y2={stringY(s)} />)}
        {[1, 2, 3, 4].map((i) => <line key={i} className="quiz-fret" x1={24 + i * 19} x2={24 + i * 19} y1="18" y2="118" />)}
        <circle className="quiz-guide-dot" cx={fretX(chordReferenceFret)} cy={stringY(3.5)} r="5" />
        <text className="quiz-roman-fret" x={fretX(chordReferenceFret)} y="132">{ROMAN_FRET_LABELS[chordReferenceFret]}</text>
        {chord.notes.map((note) => (
          <circle key={`${note.string}-${note.fret}`} className="quiz-power-dot" cx={note.fret === 0 ? 16 : fretX(note.fret)} cy={stringY(note.string)} r="9" />
        ))}
      </svg>
    );
  }

  if (!('markers' in chord)) return null;
  const fretX = (fret: number) => 22 + (fret - 0.5) * 19;
  return (
    <svg className="quiz-diagram quiz-chord-diagram" viewBox="0 0 124 136" role="img" aria-label={hideNoteLabels ? 'Diagrama de un acorde de guitarra' : `Acorde ${chord.english}`}>
      <line className="quiz-nut" x1="22" x2="22" y1="18" y2="118" />
      {[1, 2, 3, 4, 5, 6].map((s) => <line key={s} className="quiz-string" x1="22" x2="98" y1={stringY(s)} y2={stringY(s)} />)}
      {[1, 2, 3, 4].map((i) => <line key={i} className="quiz-fret" x1={22 + i * 19} x2={22 + i * 19} y1="18" y2="118" />)}
      <circle className="quiz-guide-dot" cx={fretX(chordReferenceFret)} cy={stringY(3.5)} r="5" />
      <text className="quiz-roman-fret" x={fretX(chordReferenceFret)} y="132">{ROMAN_FRET_LABELS[chordReferenceFret]}</text>
      {/* Circulo (O) = cuerda al aire, SI entra en la tablatura como traste 0. Aspa (X) = cuerda
          muted, NO entra en la tablatura. Antes ambas dibujaban el mismo circulo -- imposible
          distinguir a simple vista si una cuerda marcada debia sonar como "0" o no sonar en
          absoluto, y la unica opcion correcta de 6.4 podia "parecer" incompleta por eso. */}
      {(chord.open ?? []).map((s) => (
        <circle key={`open-${s}`} className="quiz-open-marker" cx="14" cy={stringY(s)} r="4.5" />
      ))}
      {(chord.muted ?? []).map((s) => (
        <g key={`muted-${s}`} className="quiz-muted-marker">
          <line x1="10.5" y1={stringY(s) - 4} x2="17.5" y2={stringY(s) + 4} />
          <line x1="17.5" y1={stringY(s) - 4} x2="10.5" y2={stringY(s) + 4} />
        </g>
      ))}
      {chord.barre ? (
        <rect
          className="quiz-barre"
          width="14"
          rx="7"
          height={Math.abs(stringY(chord.barre.to) - stringY(chord.barre.from)) + 16}
          x={fretX(chord.barre.fret) - 7}
          y={Math.min(stringY(chord.barre.from), stringY(chord.barre.to)) - 8}
        />
      ) : null}
      {chord.markers.map((marker) => (
        <circle key={`${marker.string}-${marker.fret}`} className="quiz-finger-dot" cx={fretX(marker.fret)} cy={stringY(marker.string)} r="8" />
      ))}
    </svg>
  );
}

export default function QuizDiagramView({ diagram }: { diagram: QuizDiagram }) {
  if (diagram.type === 'string-marker') return <StringMarkerDiagram string={diagram.string} />;
  if (diagram.type === 'chord-diagram') return <ChordDiagramView chordEnglish={diagram.chordEnglish} hideNoteLabels={diagram.hideNoteLabels} quality={diagram.quality} />;
  return <FretboardMarksDiagram startFret={diagram.startFret} endFret={diagram.endFret} positions={diagram.positions} ordered={diagram.ordered} hideNoteLabels={diagram.hideNoteLabels} />;
}

export function QuizDiagramStyles() {
  return (
    <style>{`
      .quiz-diagram {
        display: block;
        height: auto;
        margin: 0 auto;
        max-width: 320px;
        width: 100%;
      }

      .quiz-string-diagram { max-width: 260px; }
      .quiz-chord-diagram { max-width: 160px; }

      .quiz-board-bg { fill: #27313d; }
      .quiz-string, .quiz-string-line { stroke: #9ca3af; stroke-width: 2.5; }
      .quiz-string-line-active { stroke: #fbbf24; stroke-width: 4; }
      .quiz-string-label { fill: #080808; font-size: 14px; font-weight: 900; text-anchor: middle; }
      .quiz-fret { stroke: #d1d5db; stroke-width: 3; }
      .quiz-nut { stroke: #0f4f5f; stroke-width: 6; }
      .quiz-note-dot { fill: #fbbf24; stroke: #b45309; stroke-width: 2.5; }
      .quiz-note-label { fill: #1f2937; font-size: 12px; font-weight: 900; text-anchor: middle; dominant-baseline: middle; }
      .quiz-order-badge { fill: #047857; font-size: 11px; font-weight: 950; text-anchor: middle; }
      .quiz-power-dot { fill: #f1f5f9; stroke: #a1a1aa; stroke-width: 2.5; }
      .quiz-open-marker { fill: #f1f5f9; stroke: #047857; stroke-width: 2; }
      .quiz-muted-marker line { stroke: #b91c1c; stroke-width: 2; stroke-linecap: round; }
      .quiz-barre, .quiz-finger-dot { fill: #f1f5f9; stroke: #047857; stroke-width: 2.5; }
      .quiz-guide-dot { fill: #9ca3af; opacity: 0.7; }
      .quiz-roman-fret { fill: #080808; font-size: 12px; font-weight: 900; text-anchor: middle; }
    `}</style>
  );
}
