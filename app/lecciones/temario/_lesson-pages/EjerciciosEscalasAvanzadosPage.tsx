import AlphaTabPlayer from '../../../components/guitar/AlphaTabPlayer';
import { ReducedFretboardDiagram, ReducedFretboardStyles } from '../../../components/guitar/ReducedFretboardDiagram';
import TemarioPager from '../TemarioPager';
import type { LessonPageProps } from './types';

const gMajorNotes = ['G', 'A', 'B', 'C', 'D', 'E', 'F#'];
const chromaticNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const stringTunings = [
  { label: 'E', open: 4 },
  { label: 'B', open: 11 },
  { label: 'G', open: 7 },
  { label: 'D', open: 2 },
  { label: 'A', open: 9 },
  { label: 'E', open: 4 },
];

type ScaleFigureNote = {
  fret: number;
  label: string;
  string: number;
  tone?: 'minor' | 'root';
};

type TabNote = {
  fret: number;
  string: number;
};

const EIGHTH_NOTES_PER_BAR = 8;

const figureOne = {
  endFret: 4,
  omittedDiagramNotes: [{ fret: 4, string: 3 }],
  notes: [
    { fret: 0, string: 6 },
    { fret: 2, string: 6 },
    { fret: 3, string: 6 },
    { fret: 0, string: 5 },
    { fret: 2, string: 5 },
    { fret: 3, string: 5 },
    { fret: 0, string: 4 },
    { fret: 2, string: 4 },
    { fret: 4, string: 4 },
    { fret: 0, string: 3 },
    { fret: 2, string: 3 },
    { fret: 0, string: 2 },
    { fret: 1, string: 2 },
    { fret: 3, string: 2 },
    { fret: 0, string: 1 },
    { fret: 2, string: 1 },
    { fret: 3, string: 1 },
  ],
  startFret: 0,
  title: 'Figura 0',
};

const advancedExercises = [
  {
    buildNotes: () => [...figureOne.notes, ...[...figureOne.notes].reverse()],
    note: 'Ejercicio 1',
    text: ['Subimos la escala completa.', 'Después la bajamos.'],
    title: 'Ascendente y descendente',
  },
  {
    buildNotes: () => [...upTwoDownOne(figureOne.notes), ...upTwoDownOne([...figureOne.notes].reverse())],
    note: 'Ejercicio 2',
    text: ['Subimos dos notas, luego bajamos una.', 'Repetimos hasta arriba y luego hacemos la bajada al revés.'],
    title: 'Subimos 2 y bajamos 1',
  },
  {
    buildNotes: () => [...interleavedPairs(figureOne.notes), ...interleavedPairs([...figureOne.notes].reverse())],
    note: 'Ejercicio 3',
    text: ['Intercalamos las notas de dos en dos.'],
    title: 'Notas intercaladas',
  },
  {
    buildNotes: () => [...upTwoDownOneByPairs(figureOne.notes), ...upTwoDownOneByPairs([...figureOne.notes].reverse())],
    note: 'Ejercicio 4',
    text: ['Vuelve atrás cada tres notas.'],
    title: 'Subimos 2 y bajamos 1 por bloques',
  },
  {
    buildNotes: () => [...interleavedTriples(figureOne.notes), ...interleavedTriples([...figureOne.notes].reverse())],
    note: 'Ejercicio 5',
    text: ['Tres notas descendentes.'],
    title: 'Notas intercaladas por grupos de tres',
  },
];

function noteNameForFret(open: number, fret: number) {
  return chromaticNotes[(open + fret) % chromaticNotes.length];
}

function notesForFigure(startFret: number, endFret: number, omittedDiagramNotes: TabNote[] = []) {
  return stringTunings.flatMap((string, stringIndex) =>
    Array.from({ length: endFret - startFret + 1 }, (_, index) => {
      const fret = startFret + index;
      const stringNumber = stringIndex + 1;
      const label = noteNameForFret(string.open, fret);

      if (!gMajorNotes.includes(label)) {
        return null;
      }

      if (omittedDiagramNotes.some((note) => note.fret === fret && note.string === stringNumber)) {
        return null;
      }

      const note: ScaleFigureNote = {
        fret,
        label,
        string: stringNumber,
      };

      if (label === 'G') {
        note.tone = 'root';
      }

      if (label === 'E') {
        note.tone = 'minor';
      }

      return note;
    }).filter((note): note is ScaleFigureNote => note !== null),
  );
}

function upTwoDownOne(notes: TabNote[]) {
  const result: TabNote[] = [];

  if (notes.length < 3) {
    return result;
  }

  result.push(notes[0], notes[1], notes[2], notes[1]);

  for (let index = 1; index < notes.length - 2; index++) {
    result.push(notes[index + 1], notes[index + 2], notes[index + 1]);
  }

  return result;
}

function upTwoDownOneByPairs(notes: TabNote[]) {
  const result: TabNote[] = [];

  for (let index = 0; index < notes.length - 2; index += 2) {
    result.push(notes[index], notes[index + 1], notes[index + 2], notes[index + 1]);
  }

  return result;
}

function interleavedPairs(notes: TabNote[]) {
  const result: TabNote[] = [];

  for (let index = 0; index < notes.length - 3; index += 2) {
    result.push(notes[index], notes[index + 2], notes[index + 1], notes[index + 3]);
  }

  return result;
}

function interleavedTriples(notes: TabNote[]) {
  const result: TabNote[] = [];

  for (let index = 0; index < notes.length - 2; index++) {
    result.push(notes[index + 2], notes[index + 1], notes[index]);
  }

  return result;
}

function alphaTexForExercise(title: string, notes: TabNote[]) {
  const bars: string[] = [];

  for (let index = 0; index < notes.length; index += EIGHTH_NOTES_PER_BAR) {
    const barNotes = notes.slice(index, index + EIGHTH_NOTES_PER_BAR);
    const missingNotes = EIGHTH_NOTES_PER_BAR - barNotes.length;
    const bar = [
      ...barNotes.map((note) => `${note.fret}.${note.string}`),
      ...Array.from({ length: missingNotes }, () => 'r'),
    ].join(' ');

    bars.push(bar);
  }

  const body = bars.join(' | ');

  return `\\title "${title}"
\\tempo 80
.
:8 ${body} |`;
}

function FigureOneDiagram() {
  return (
    <ReducedFretboardDiagram
      ariaLabel="Figura 0 de la escala de Sol Mayor y Mi menor"
      endFret={figureOne.endFret}
      guideDots={[3].map((fret) => ({ fret }))}
      notes={notesForFigure(figureOne.startFret, figureOne.endFret, figureOne.omittedDiagramNotes)}
      startFret={figureOne.startFret}
    />
  );
}

export default function EjerciciosEscalasAvanzadosPage({ previous, next }: LessonPageProps) {
  return (
    <main className="advanced-scale-page">
      <article className="advanced-scale-content">
        <header className="advanced-scale-header">
          <h1>Ejercicios avanzados de escalas</h1>
          <div className="short-copy">
            <p>Usamos la figura 0 de Sol Mayor y Mi menor.</p>
          </div>
        </header>

        <section className="rule-box" aria-label="Cómo practicar estos ejercicios">
          <p>Empieza muy despacio.</p>
          <p>Escucha que cada nota suene clara.</p>
          <p>Cuando salga bien, prueba los mismos patrones con las otras figuras a tu ritmo.</p>
        </section>

        <section className="exercise-list" aria-label="Ejercicios avanzados de escalas completos">
          {advancedExercises.map((exercise) => {
            const notes = exercise.buildNotes();

            return (
              <article className="advanced-exercise" key={exercise.title}>
                <div className="figure-panel">
                  <p className="figure-kicker">
                    {figureOne.title} <span>trastes {figureOne.startFret}-{figureOne.endFret}</span>
                  </p>
                  <FigureOneDiagram />
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
                  <AlphaTabPlayer compact layout="horizontal" minHeight={230} tab={alphaTexForExercise(exercise.title, notes)} title={exercise.title} />
                </div>
              </article>
            );
          })}
        </section>
      </article>

      <div className="lesson-pager-wrap">
        <TemarioPager previous={previous} next={next} />
      </div>

      <ReducedFretboardStyles />

      <style>{`
        .advanced-scale-page {
          background: #ffffff;
          box-sizing: border-box;
          color: #080808;
          min-height: 100vh;
          overflow-x: clip;
          padding: clamp(76px, 9vw, 116px) clamp(16px, 5vw, 84px) clamp(28px, 5vw, 72px);
          width: 100%;
        }

        .advanced-scale-content,
        .lesson-pager-wrap {
          box-sizing: border-box;
          margin: 0 auto;
          max-width: 1220px;
          min-width: 0;
          width: 100%;
        }

        .advanced-scale-content {
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

        .advanced-scale-header {
          margin: 0 auto;
          max-width: 980px;
          text-align: center;
        }

        .advanced-scale-header h1 {
          font-size: clamp(38px, 6.5vw, 88px);
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
        .exercise-copy p {
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
          margin: 0 auto;
          max-width: 980px;
          padding: clamp(18px, 3vw, 28px);
          text-align: center;
          width: 100%;
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
          min-width: min(100%, 680px);
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

        @media (max-width: 840px) {
          .advanced-exercise {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 760px) {
          .advanced-scale-header,
          .rule-box {
            text-align: left;
          }
        }

        @media (max-width: 520px) {
          .advanced-scale-content,
          .lesson-pager-wrap {
            max-width: 320px;
          }
        }
      `}</style>
    </main>
  );
}
