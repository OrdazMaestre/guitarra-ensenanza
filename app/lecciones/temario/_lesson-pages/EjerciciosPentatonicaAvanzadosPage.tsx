import AlphaTabPlayer from '../../../components/guitar/AlphaTabPlayer';
import { ReducedFretboardDiagram } from '../../../components/guitar/ReducedFretboardDiagram';
import TemarioPager from '../TemarioPager';
import type { LessonPageProps } from './types';

const pentatonicNotes = ['G', 'A', 'B', 'D', 'E'];
const chromaticNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const stringTunings = [
  { label: 'E', open: 4 },
  { label: 'B', open: 11 },
  { label: 'G', open: 7 },
  { label: 'D', open: 2 },
  { label: 'A', open: 9 },
  { label: 'E', open: 4 },
];

type PentatonicFigureNote = {
  fret: number;
  label: string;
  string: number;
  tone?: 'minor' | 'root';
};

const figureThree = {
  endFret: 8,
  startFret: 4,
  title: 'Figura 2',
};

const advancedExercises = [
  {
    note: 'Ejercicio 1 y 2',
    source: '/tabs/ejerciciopent1.gp',
    text: ['Primero subimos.', 'Luego bajamos.', 'Misma figura. Dos direcciones.'],
    title: 'Ascendente y descendente',
  },
  {
    note: 'Ejercicio 3 y 4',
    source: '/tabs/ejerciciopent2.gp',
    text: ['Subimos 2 y bajamos 1.', 'Después bajamos 2 y subimos 1.', 'Aquí empieza el movimiento de verdad.'],
    title: 'Patrones de tres notas',
  },
];

function notesForFigure(startFret: number, endFret: number) {
  return stringTunings.flatMap((string, stringIndex) =>
    Array.from({ length: endFret - startFret + 1 }, (_, index) => {
      const fret = startFret + index;
      const label = chromaticNotes[(string.open + fret) % chromaticNotes.length];

      if (!pentatonicNotes.includes(label)) {
        return null;
      }

      const note: PentatonicFigureNote = {
        fret,
        label,
        string: stringIndex + 1,
      };

      if (label === 'G') {
        note.tone = 'root';
      }

      if (label === 'E') {
        note.tone = 'minor';
      }

      return note;
    }).filter((note): note is PentatonicFigureNote => note !== null),
  );
}

function FigureThreeDiagram() {
  return (
    <ReducedFretboardDiagram
      ariaLabel="Figura 2 de la pentatónica de Sol Mayor y Mi menor"
      endFret={figureThree.endFret}
      guideDots={[5, 7].map((fret) => ({ fret }))}
      notes={notesForFigure(figureThree.startFret, figureThree.endFret)}
      startFret={figureThree.startFret}
    />
  );
}

export default function EjerciciosPentatonicaAvanzadosPage({ previous, next }: LessonPageProps) {
  return (
    <main className="advanced-pentatonic-page">
      <article className="advanced-pentatonic-content">
        <header className="advanced-pentatonic-header">
          <p className="lesson-kicker">Ejercicios de verdad</p>
          <h1>Practicando la pentatónica</h1>
          <div className="short-copy">
            <p>En la página anterior tocamos las notas una a una.</p>
            <p>De más grave a más agudo.</p>
            <p>A eso lo llamamos ascendente.</p>
          </div>
        </header>

        <section className="rule-box" aria-label="Regla para practicar todas las figuras">
          <p>Usamos ahora de ejemplo la figura 2.</p>
          <p>
            Pero luego habrá que hacer los mismos ejercicios con <strong>todas las demás figuras</strong> de la página anterior.
          </p>
        </section>

        <section className="exercise-list" aria-label="Ejercicios avanzados de pentatónica">
          {advancedExercises.map((exercise) => (
            <article className="advanced-exercise" key={exercise.source}>
              <div className="figure-panel">
                <p className="figure-kicker">
                  {figureThree.title} <span>trastes {figureThree.startFret}-{figureThree.endFret}</span>
                </p>
                <FigureThreeDiagram />
              </div>

              <div className="exercise-panel">
                <div className="exercise-copy">
                  <p className="exercise-note">{exercise.note}</p>
                  <h2>{exercise.title}</h2>
                  <div>
                    {exercise.text.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                </div>
                <AlphaTabPlayer compact layout="horizontal" minHeight={210} source={exercise.source} title={exercise.title} />
              </div>
            </article>
          ))}
        </section>

        <section className="practice-box" aria-label="Cómo practicar">
          <p>No corras.</p>
          <p>Hazlo limpio.</p>
          <p>Cuando salga con la figura 2, prueba con las figuras 0, 1, 3 y 4.</p>
        </section>
      </article>

      <div className="lesson-pager-wrap">
        <TemarioPager previous={previous} next={next} />
      </div>

      <style>{`
        .advanced-pentatonic-page {
          background: #ffffff;
          box-sizing: border-box;
          color: #080808;
          min-height: 100vh;
          overflow-x: clip;
          padding: clamp(76px, 9vw, 116px) clamp(16px, 5vw, 84px) clamp(28px, 5vw, 72px);
          width: 100%;
        }

        .advanced-pentatonic-content,
        .lesson-pager-wrap {
          box-sizing: border-box;
          margin: 0 auto;
          max-width: 1220px;
          min-width: 0;
          width: 100%;
        }

        .advanced-pentatonic-content {
          display: grid;
          gap: clamp(34px, 6vw, 70px);
          padding-bottom: clamp(34px, 6vw, 72px);
        }

        .lesson-kicker,
        .figure-kicker,
        .exercise-note {
          color: #047857;
          font-size: 13px;
          font-weight: 950;
          letter-spacing: 0.18em;
          margin: 0;
          text-transform: uppercase;
        }

        .advanced-pentatonic-header {
          margin: 0 auto;
          max-width: 980px;
          text-align: center;
        }

        .advanced-pentatonic-header h1 {
          font-size: clamp(42px, 7vw, 92px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 0.94;
          margin: 12px 0 0;
          overflow-wrap: break-word;
          text-transform: uppercase;
          text-decoration: underline;
          text-decoration-thickness: 0.06em;
          text-underline-offset: 0.11em;
        }

        .short-copy {
          display: grid;
          gap: 10px;
          margin: clamp(20px, 4vw, 32px) auto 0;
          max-width: 760px;
        }

        .short-copy p,
        .rule-box p,
        .practice-box p,
        .exercise-copy p {
          color: #303030;
          font-size: clamp(18px, 2vw, 24px);
          font-weight: 650;
          line-height: 1.42;
          margin: 0;
          overflow-wrap: anywhere;
        }

        .rule-box,
        .practice-box {
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

        .rule-box strong {
          color: #080808;
          font-weight: 950;
        }

        .exercise-list {
          display: grid;
          gap: clamp(26px, 5vw, 48px);
          min-width: 0;
        }

        .advanced-exercise {
          align-items: start;
          border-top: 1px solid #d4d4d8;
          display: grid;
          gap: clamp(18px, 4vw, 38px);
          grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
          min-width: 0;
          padding-top: clamp(24px, 4vw, 42px);
        }

        .figure-panel,
        .exercise-panel {
          min-width: 0;
        }

        .figure-kicker {
          margin-bottom: 14px;
        }

        .figure-kicker span {
          color: #303030;
          letter-spacing: 0;
          text-transform: none;
        }

        .exercise-panel {
          display: grid;
          gap: 16px;
          overflow-x: auto;
          overscroll-behavior-x: contain;
        }

        .exercise-panel > div:not(.exercise-copy) {
          min-width: min(100%, 620px);
        }

        .exercise-copy {
          display: grid;
          gap: 10px;
          min-width: 0;
        }

        .exercise-copy h2 {
          font-size: clamp(26px, 3.4vw, 46px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 1;
          margin: 0;
          overflow-wrap: anywhere;
          text-transform: uppercase;
        }

        .exercise-copy div {
          display: grid;
          gap: 6px;
        }

        .exercise-copy .exercise-note {
          color: #047857;
          font-size: 13px;
          letter-spacing: 0.18em;
        }

        .practice-box {
          border-color: #047857;
        }

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

        @media (max-width: 840px) {
          .advanced-exercise {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 760px) {
          .advanced-pentatonic-header,
          .rule-box,
          .practice-box {
            text-align: left;
          }
        }

        @media (max-width: 520px) {
          .advanced-pentatonic-content,
          .lesson-pager-wrap {
            max-width: 320px;
          }
        }
      `}</style>
    </main>
  );
}
