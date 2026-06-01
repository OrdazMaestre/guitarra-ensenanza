import Link from 'next/link';
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

const figures = [
  { endFret: 3, source: '/tabs/pentat1.gp', startFret: 0, title: 'Figura 0' },
  { endFret: 5, source: '/tabs/pentat2.gp', startFret: 2, title: 'Figura 1' },
  { endFret: 8, source: '/tabs/pentat3.gp', startFret: 4, title: 'Figura 2' },
  { endFret: 10, source: '/tabs/pentat4.gp', startFret: 7, title: 'Figura 3' },
  { endFret: 12, source: '/tabs/pentat5.gp', startFret: 9, title: 'Figura 4' },
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

export default function EjerciciosPentatonicaPage({ previous, next }: LessonPageProps) {
  return (
    <main className="pentatonic-exercises-page">
      <article className="pentatonic-exercises-content">
        <header className="pentatonic-exercises-header">
          <p className="lesson-kicker">Sol Mayor y Mi menor</p>
          <h1>Aprendiendo la pentatonica</h1>
          <div className="short-copy">
            <p>La pentatonica usa 5 notas.</p>
            <p>La pentatónica de Sol Mayor usa G, A, B, D y E.</p>
            <p>La de Mi menor usa las mismas notas.</p>
          </div>
        </header>

        <section className="note-box" aria-label="Notas de la pentatonica">
          <p>La diferencia esta en la nota a la que damos importancia.</p>
          <p>
            Si priorizamos <strong>G</strong>, suena a Sol Mayor.
          </p>
          <p>
            Si priorizamos <strong>E</strong>, suena a Mi menor.
          </p>
        </section>

        <section className="advanced-link" aria-label="Ejercicios avanzados">
          <Link href="/lecciones/temario/ejercicios-pentatonica-avanzados">Ejercicios mas avanzados de pentatonica</Link>
        </section>

        <section className="figures-list" aria-label="Cinco figuras de la pentatonica">
          {figures.map((figure) => (
            <article className="pentatonic-figure" key={figure.title}>
              <div className="figure-copy">
                <p className="figure-kicker">
                  {figure.title} <span>trastes {figure.startFret}-{figure.endFret}</span>
                </p>
                <ReducedFretboardDiagram
                  ariaLabel={`${figure.title} de la pentatonica de Sol Mayor y Mi menor`}
                  endFret={figure.endFret}
                  guideDots={[3, 5, 7, 9, 12].filter((fret) => fret >= figure.startFret && fret <= figure.endFret).map((fret) => ({ fret }))}
                  notes={notesForFigure(figure.startFret, figure.endFret)}
                  startFret={figure.startFret}
                />
              </div>

              <div className="figure-tab" aria-label={`Tablatura de ${figure.title}`}>
                <AlphaTabPlayer compact layout="horizontal" minHeight={190} source={figure.source} title={figure.title} />
              </div>
            </article>
          ))}
        </section>

        
      </article>

      <div className="lesson-pager-wrap">
        <TemarioPager previous={previous} next={next} />
      </div>

      <style>{`
        .pentatonic-exercises-page {
          background: #ffffff;
          box-sizing: border-box;
          color: #080808;
          min-height: 100vh;
          overflow-x: clip;
          padding: clamp(76px, 9vw, 116px) clamp(16px, 5vw, 84px) clamp(28px, 5vw, 72px);
          width: 100%;
        }

        .pentatonic-exercises-content,
        .lesson-pager-wrap {
          box-sizing: border-box;
          margin: 0 auto;
          max-width: 1220px;
          min-width: 0;
          width: 100%;
        }

        .pentatonic-exercises-content {
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

        .pentatonic-exercises-header {
          margin: 0 auto;
          max-width: 980px;
          text-align: center;
        }

        .pentatonic-exercises-header h1 {
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
        .note-box p,
        .practice-note p {
          color: #303030;
          font-size: clamp(18px, 2vw, 24px);
          font-weight: 650;
          line-height: 1.42;
          margin: 0;
          overflow-wrap: anywhere;
        }

        .note-box,
        .practice-note,
        .advanced-link {
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

        .advanced-link a:hover {
          color: #047857;
        }

        .figures-list {
          display: grid;
          gap: clamp(22px, 4vw, 36px);
          min-width: 0;
        }

        .pentatonic-figure {
          align-items: center;
          border-top: 1px solid #d4d4d8;
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

        .figure-kicker span {
          color: #303030;
          letter-spacing: 0;
          text-transform: none;
        }

        .figure-kicker {
          margin-bottom: 14px;
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
          .pentatonic-figure {
            grid-template-columns: 1fr;
          }

          .tab-label {
            text-align: left;
          }
        }

        @media (max-width: 760px) {
          .pentatonic-exercises-header,
          .note-box,
          .practice-note,
          .advanced-link {
            text-align: left;
          }
        }

        @media (max-width: 520px) {
          .pentatonic-exercises-content,
          .lesson-pager-wrap {
            max-width: 320px;
          }
        }
      `}</style>
    </main>
  );
}
