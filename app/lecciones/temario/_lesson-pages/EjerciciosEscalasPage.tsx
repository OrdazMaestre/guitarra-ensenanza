import Link from 'next/link';
import AlphaTabPlayer from '../../../components/guitar/AlphaTabPlayer';
import { ReducedFretboardDiagram } from '../../../components/guitar/ReducedFretboardDiagram';
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

const figures: Array<{
  endFret: number;
  notes: TabNote[];
  omittedDiagramNotes?: TabNote[];
  startFret: number;
  title: string;
}> = [
  {
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
  },
  {
    endFret: 5,
    notes: [
      { fret: 2, string: 6 },
      { fret: 3, string: 6 },
      { fret: 5, string: 6 },
      { fret: 2, string: 5 },
      { fret: 3, string: 5 },
      { fret: 5, string: 5 },
      { fret: 2, string: 4 },
      { fret: 4, string: 4 },
      { fret: 5, string: 4 },
      { fret: 2, string: 3 },
      { fret: 4, string: 3 },
      { fret: 5, string: 3 },
      { fret: 3, string: 2 },
      { fret: 5, string: 2 },
      { fret: 2, string: 1 },
      { fret: 3, string: 1 },
      { fret: 5, string: 1 },
    ],
    startFret: 2,
    title: 'Figura 1',
  },
  {
    endFret: 8,
    notes: [
      { fret: 3, string: 6 },
      { fret: 5, string: 6 },
      { fret: 7, string: 6 },
      { fret: 3, string: 5 },
      { fret: 5, string: 5 },
      { fret: 7, string: 5 },
      { fret: 4, string: 4 },
      { fret: 5, string: 4 },
      { fret: 7, string: 4 },
      { fret: 4, string: 3 },
      { fret: 5, string: 3 },
      { fret: 7, string: 3 },
      { fret: 5, string: 2 },
      { fret: 7, string: 2 },
      { fret: 8, string: 2 },
      { fret: 5, string: 1 },
      { fret: 7, string: 1 },
      { fret: 8, string: 1 },
    ],
    startFret: 4,
    title: 'Figura 2',
  },
  {
    endFret: 10,
    notes: [
      { fret: 7, string: 6 },
      { fret: 8, string: 6 },
      { fret: 10, string: 6 },
      { fret: 7, string: 5 },
      { fret: 9, string: 5 },
      { fret: 10, string: 5 },
      { fret: 7, string: 4 },
      { fret: 9, string: 4 },
      { fret: 10, string: 4 },
      { fret: 7, string: 3 },
      { fret: 9, string: 3 },
      { fret: 7, string: 2 },
      { fret: 8, string: 2 },
      { fret: 10, string: 2 },
      { fret: 7, string: 1 },
      { fret: 8, string: 1 },
      { fret: 10, string: 1 },
    ],
    startFret: 7,
    title: 'Figura 3',
  },
  {
    endFret: 13,
    notes: [
      { fret: 10, string: 6 },
      { fret: 12, string: 6 },
      { fret: 9, string: 5 },
      { fret: 10, string: 5 },
      { fret: 12, string: 5 },
      { fret: 9, string: 4 },
      { fret: 10, string: 4 },
      { fret: 12, string: 4 },
      { fret: 9, string: 3 },
      { fret: 11, string: 3 },
      { fret: 12, string: 3 },
      { fret: 10, string: 2 },
      { fret: 12, string: 2 },
      { fret: 13, string: 2 },
      { fret: 10, string: 1 },
      { fret: 12, string: 1 },
    ],
    startFret: 9,
    title: 'Figura 4',
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

function alphaTexForFigure(title: string, notes: TabNote[]) {
  const barIndex = Math.ceil(notes.length / 2);
  const body = notes
    .map((note, index) => `${index === barIndex ? '| ' : ''}${note.fret}.${note.string}`)
    .join(' ');

  return `\\title "${title}"
\\tempo 80
.
:8 ${body} |`;
}

export default function EjerciciosEscalasPage({ previous, next }: LessonPageProps) {
  return (
    <main className="scale-exercises-page">
      <article className="scale-exercises-content">
        <header className="scale-exercises-header">
          <p className="lesson-kicker">Sol Mayor y Mi menor</p>
          <h1>Ejercicios de escalas</h1>
          <div className="short-copy">
            <p>Ahora practicamos la escala completa.</p>
            <p>Sol Mayor usa G, A, B, C, D, E y F#.</p>
            <p>Mi menor usa las mismas notas.</p>
          </div>
        </header>

        <section className="note-box" aria-label="Tónica mayor y tónica menor">
          <p>
            <strong>G</strong> aparece en azul.
          </p>
          <p>
            <strong>E</strong> aparece en verde.
          </p>
          <p>El resto de notas son parte normal de la escala.</p>
        </section>

        <section className="figures-list" aria-label="Cinco figuras de la escala de Sol Mayor">
          {figures.map((figure) => (
            <article className="scale-figure" key={figure.title}>
              <div className="figure-copy">
                <p className="figure-kicker">
                  {figure.title} <span>trastes {figure.startFret}-{figure.endFret}</span>
                </p>
                <ReducedFretboardDiagram
                  ariaLabel={`${figure.title} de la escala de Sol Mayor y Mi menor`}
                  endFret={figure.endFret}
                  guideDots={[3, 5, 7, 9, 12].filter((fret) => fret >= figure.startFret && fret <= figure.endFret).map((fret) => ({ fret }))}
                  notes={notesForFigure(figure.startFret, figure.endFret, figure.omittedDiagramNotes)}
                  startFret={figure.startFret}
                />
              </div>

              <div className="figure-tab" aria-label={`Tablatura de ${figure.title}`}>
                <AlphaTabPlayer compact layout="horizontal" minHeight={190} tab={alphaTexForFigure(figure.title, figure.notes)} title={figure.title} />
              </div>
            </article>
          ))}
        </section>

        <section className="advanced-link" aria-label="Ejercicios avanzados">
          <Link href="/lecciones/temario/ejercicios-escalas-avanzados">Ejercicios avanzados de escalas</Link>
        </section>
      </article>

      <div className="lesson-pager-wrap">
        <TemarioPager previous={previous} next={next} />
      </div>

      <style>{`
        .scale-exercises-page {
          background: #ffffff;
          box-sizing: border-box;
          color: #080808;
          min-height: 100vh;
          overflow-x: clip;
          padding: clamp(76px, 9vw, 116px) clamp(16px, 5vw, 84px) clamp(28px, 5vw, 72px);
          width: 100%;
        }

        .scale-exercises-content,
        .lesson-pager-wrap {
          box-sizing: border-box;
          margin: 0 auto;
          max-width: 1220px;
          min-width: 0;
          width: 100%;
        }

        .scale-exercises-content {
          display: grid;
          gap: clamp(32px, 5vw, 60px);
          padding-bottom: clamp(34px, 6vw, 72px);
        }

        .lesson-kicker,
        .figure-kicker {
          color: #047857;
          font-size: 13px;
          font-weight: 950;
          letter-spacing: 0.18em;
          margin: 0;
          text-transform: uppercase;
        }

        .scale-exercises-header {
          margin: 0 auto;
          max-width: 980px;
          text-align: center;
        }

        .scale-exercises-header h1 {
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
        .note-box p {
          color: #303030;
          font-size: clamp(18px, 2vw, 24px);
          font-weight: 650;
          line-height: 1.42;
          margin: 0;
          overflow-wrap: anywhere;
        }

        .note-box,
        .advanced-link {
          box-sizing: border-box;
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

        .note-box strong {
          color: #080808;
          font-weight: 950;
        }

        .advanced-link {
          border-color: #047857;
        }

        .advanced-link a {
          color: #080808;
          font-size: clamp(20px, 2.4vw, 30px);
          font-weight: 950;
          line-height: 1.16;
          overflow-wrap: anywhere;
          text-decoration-color: #047857;
          text-decoration-thickness: 3px;
          text-underline-offset: 6px;
        }

        .advanced-link a:hover,
        .advanced-link a:focus-visible {
          color: #047857;
        }

        .advanced-link a:focus-visible {
          outline: 3px solid #047857;
          outline-offset: 4px;
        }

        .figures-list {
          display: grid;
          gap: clamp(22px, 4vw, 36px);
          min-width: 0;
        }

        .scale-figure {
          align-items: center;
          border-top: 1px solid #d4d4d8;
          box-sizing: border-box;
          display: grid;
          gap: clamp(18px, 4vw, 38px);
          grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
          min-width: 0;
          padding-top: clamp(22px, 4vw, 38px);
        }

        .figure-copy,
        .figure-tab {
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

        .figure-tab {
          overflow-x: auto;
          overscroll-behavior-x: contain;
        }

        .figure-tab > div {
          min-width: min(100%, 620px);
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
          .scale-figure {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 760px) {
          .scale-exercises-header,
          .note-box,
          .advanced-link {
            text-align: left;
          }
        }

        @media (max-width: 520px) {
          .scale-exercises-content,
          .lesson-pager-wrap {
            max-width: 320px;
          }
        }
      `}</style>
    </main>
  );
}
