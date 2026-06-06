import AlphaTabPlayer from '../../../components/guitar/AlphaTabPlayer';
import { ReducedFretboardDiagram } from '../../../components/guitar/ReducedFretboardDiagram';
import TemarioPager from '../TemarioPager';
import type { LessonPageProps } from './types';

const bluesNotes = ['E', 'G', 'A', 'A#', 'B', 'D'];
const chromaticNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const stringTunings = [
  { label: 'E', open: 4 },
  { label: 'B', open: 11 },
  { label: 'G', open: 7 },
  { label: 'D', open: 2 },
  { label: 'A', open: 9 },
  { label: 'E', open: 4 },
];

type BluesFigureNote = {
  fret: number;
  label: string;
  string: number;
  tone?: 'minor' | 'root' | 'special';
};

const figures = [
  { endFret: 3, source: '/tabs/bluespent1.gp', startFret: 0, title: 'Figura 0' },
  { endFret: 6, source: '/tabs/bluespent2.gp', startFret: 2, title: 'Figura 1' },
  { endFret: 8, source: '/tabs/bluespent3.gp', startFret: 4, title: 'Figura 2' },
  { endFret: 11, source: '/tabs/bluespent4.gp', startFret: 7, title: 'Figura 3' },
  { endFret: 13, source: '/tabs/bluespent5.gp', startFret: 9, title: 'Figura 4' },
];

const bluesLick = {
  source: '/tabs/bluespent-lick.gp',
  title: 'Lick de pentatónica blues',
};

function displayNote(note: string) {
  return note === 'A#' ? 'Bb' : note;
}

function notesForFigure(startFret: number, endFret: number) {
  return stringTunings.flatMap((string, stringIndex) =>
    Array.from({ length: endFret - startFret + 1 }, (_, index) => {
      const fret = startFret + index;
      const noteName = chromaticNotes[(string.open + fret) % chromaticNotes.length];

      if (!bluesNotes.includes(noteName)) {
        return null;
      }

      const note: BluesFigureNote = {
        fret,
        label: displayNote(noteName),
        string: stringIndex + 1,
      };

      if (noteName === 'E') {
        note.tone = 'root';
      }

      if (noteName === 'A#') {
        note.tone = 'special';
      }

      return note;
    }).filter((note): note is BluesFigureNote => note !== null),
  );
}

export default function EjerciciosPentatonicaBluesPage({ previous, next }: LessonPageProps) {
  return (
    <main className="blues-exercises-page">
      <article className="blues-exercises-content">
        <header className="blues-exercises-header">
          <p className="lesson-kicker">Blue note en movimiento</p>
          <h1>Ejercicios pentatónica de blues</h1>
          <div className="short-copy">
            <p>Ahora practicamos la escala completa.</p>
            <p>E, G, A, Bb, B y D.</p>
            <p>La tónica es E.</p>
          </div>
        </header>

        <section className="legend-box" aria-label="Leyenda de colores">
          <p>
            La <strong>tónica E</strong> aparece en verde.
          </p>
          <p>
            La <strong>blue note Bb</strong> aparece en rojo.
          </p>
          <p>Toca despacio y escucha cómo la Bb pide resolver.</p>
        </section>

        <section className="figures-list" aria-label="Cinco ejercicios de pentatónica blues">
          {figures.map((figure) => (
            <article className="blues-exercise" key={figure.title}>
              <div className="figure-panel">
                <p className="figure-kicker">
                  {figure.title} <span>trastes {figure.startFret}-{figure.endFret}</span>
                </p>
                <ReducedFretboardDiagram
                  ariaLabel={`${figure.title} de la pentatónica de blues de Mi menor`}
                  endFret={figure.endFret}
                  guideDots={[3, 5, 7, 9, 12].filter((fret) => fret >= figure.startFret && fret <= figure.endFret).map((fret) => ({ fret }))}
                  notes={notesForFigure(figure.startFret, figure.endFret)}
                  startFret={figure.startFret}
                />
              </div>

              <div className="tab-panel" aria-label={`Tablatura de ${figure.title}`}>
                <AlphaTabPlayer compact layout="horizontal" minHeight={190} source={figure.source} title={figure.title} />
              </div>
            </article>
          ))}
        </section>

        <section className="lick-section" aria-labelledby="lick-title">
          <div className="lick-copy">
            <p className="lesson-kicker">Una idea musical</p>
            <h2 id="lick-title">{bluesLick.title}</h2>
            <div>
              <p>Esta es una forma de usar esa pentatónica.</p>
              <p>No es solo subir y bajar la escala.</p>
              <p>Aquí ya suena como una frase.</p>
            </div>
          </div>

          <AlphaTabPlayer compact layout="horizontal" minHeight={210} source={bluesLick.source} title={bluesLick.title} />
        </section>

      </article>

      <div className="lesson-pager-wrap">
        <TemarioPager previous={previous} next={next} />
      </div>

      <style>{`
        .blues-exercises-page {
          background: #ffffff;
          box-sizing: border-box;
          color: #080808;
          min-height: 100vh;
          overflow-x: clip;
          padding: clamp(76px, 9vw, 116px) clamp(16px, 5vw, 84px) clamp(28px, 5vw, 72px);
          width: 100%;
        }

        .blues-exercises-content,
        .lesson-pager-wrap {
          box-sizing: border-box;
          margin: 0 auto;
          max-width: 1220px;
          min-width: 0;
          width: 100%;
        }

        .blues-exercises-content {
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

        .blues-exercises-header {
          margin: 0 auto;
          max-width: 980px;
          text-align: center;
        }

        .blues-exercises-header h1 {
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
        .legend-box p,
        .practice-box p,
        .lick-copy p {
          color: #303030;
          font-size: clamp(18px, 2vw, 24px);
          font-weight: 650;
          line-height: 1.42;
          margin: 0;
          overflow-wrap: anywhere;
        }

        .legend-box,
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

        .legend-box strong,
        .practice-box strong {
          color: #080808;
          font-weight: 950;
        }

        .figures-list {
          display: grid;
          gap: clamp(22px, 4vw, 36px);
          min-width: 0;
        }

        .lick-section {
          border-top: 1px solid #d4d4d8;
          display: grid;
          gap: clamp(18px, 4vw, 34px);
          min-width: 0;
          padding-top: clamp(24px, 4vw, 42px);
        }

        .lick-copy {
          display: grid;
          gap: 10px;
          min-width: 0;
        }

        .lick-copy h2 {
          font-size: clamp(28px, 4.6vw, 56px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 1;
          margin: 0;
          overflow-wrap: anywhere;
          text-transform: uppercase;
        }

        .lick-copy div {
          display: grid;
          gap: 8px;
        }

        .blues-exercise {
          align-items: center;
          border-top: 1px solid #d4d4d8;
          display: grid;
          gap: clamp(18px, 4vw, 38px);
          grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
          min-width: 0;
          padding-top: clamp(22px, 4vw, 38px);
        }

        .figure-panel,
        .tab-panel {
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

        .tab-panel {
          overflow-x: auto;
          overscroll-behavior-x: contain;
        }

        .tab-panel > div {
          min-width: min(100%, 620px);
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

        @media (max-width: 840px) {
          .blues-exercise {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 760px) {
          .blues-exercises-header,
          .legend-box,
          .practice-box {
            text-align: left;
          }
        }

        @media (max-width: 520px) {
          .blues-exercises-content,
          .lesson-pager-wrap {
            max-width: 320px;
          }
        }
      `}</style>
    </main>
  );
}
