import Link from 'next/link';
import TemarioPager from '../TemarioPager';
import type { LessonPageProps } from './types';

const pentatonicNotes = ['G', 'A', 'B', 'D', 'E'];

const stringTunings = [
  { label: 'E', open: 4 },
  { label: 'B', open: 11 },
  { label: 'G', open: 7 },
  { label: 'D', open: 2 },
  { label: 'A', open: 9 },
  { label: 'E', open: 4 },
];

const chromaticNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const fretNotes = stringTunings.flatMap((string, stringIndex) =>
  Array.from({ length: 13 }, (_, fret) => {
    const note = chromaticNotes[(string.open + fret) % chromaticNotes.length];

    return pentatonicNotes.includes(note)
      ? {
          fret,
          note,
          string: stringIndex + 1,
        }
      : null;
  }).filter((item): item is { fret: number; note: string; string: number } => item !== null),
);

function PentatonicFretboard() {
  const boardX = 48;
  const boardY = 48;
  const fretWidth = 76;
  const boardWidth = fretWidth * 12;
  const boardHeight = 172;
  const stringGap = boardHeight / 5;
  const stringY = (string: number) => boardY + (string - 1) * stringGap;
  const fretX = (fret: number) => (fret === 0 ? boardX - 24 : boardX + (fret - 0.5) * fretWidth);

  return (
    <figure className="pentatonic-board-wrap">
      <svg
        className="pentatonic-board"
        viewBox="0 0 1020 292"
        role="img"
        aria-label="Mapa de la pentatonica mayor de Sol en los doce primeros trastes"
      >
        {Array.from({ length: 12 }, (_, fret) => (
          <text className="fret-number" key={`number-${fret + 1}`} x={boardX + fret * fretWidth + fretWidth / 2} y="26">
            {fret + 1}
          </text>
        ))}
        <text className="top-label" x={boardX + boardWidth / 2} y="40">
          trastes
        </text>

        <rect className="board-bg" x={boardX} y={boardY} width={boardWidth} height={boardHeight} />
        {Array.from({ length: 6 }, (_, index) => (
          <line className="string-line" key={`string-${index + 1}`} x1={boardX} x2={boardX + boardWidth} y1={stringY(index + 1)} y2={stringY(index + 1)} />
        ))}
        {Array.from({ length: 13 }, (_, fret) => (
          <line
            className={fret === 0 ? 'nut-line' : 'fret-line'}
            key={`fret-${fret}`}
            x1={boardX + fret * fretWidth}
            x2={boardX + fret * fretWidth}
            y1={boardY}
            y2={boardY + boardHeight}
          />
        ))}
        {[3, 5, 7, 9, 12].map((fret) => (
          <circle className="guide-dot" cx={boardX + (fret - 0.5) * fretWidth} cy={stringY(3.5)} key={`guide-${fret}`} r="8" />
        ))}
        {fretNotes.map((item) => (
          <g key={`${item.string}-${item.fret}-${item.note}`}>
            <circle className={item.note === 'G' ? 'note-root' : 'note-dot'} cx={fretX(item.fret)} cy={stringY(item.string)} r="17" />
            <text className={item.note === 'G' ? 'note-label root-label' : 'note-label'} x={fretX(item.fret)} y={stringY(item.string) + 5}>
              {item.note}
            </text>
          </g>
        ))}
        <text className="bottom-label" x={boardX + boardWidth / 2} y="236">
          figuras
        </text>
        {[1, 2, 3, 4, 5].map((figure, index) => (
          <text className="figure-number" key={`figure-${figure}`} x={boardX + 76 + index * 190} y="270">
            {figure}
          </text>
        ))}
      </svg>
    </figure>
  );
}

export default function PentatonicaPage({ previous, next }: LessonPageProps) {
  return (
    <main className="pentatonic-page">
      <article className="pentatonic-content">
        <header className="pentatonic-header">
          <h1>Pentatonica</h1>
          <div className="short-copy">
            <p>Al acorde de Sol Mayor le sumamos dos notas extra.</p>
            <p>Sol Mayor usa G, B y D.</p>
            <p>Ahora anadimos E y A.</p>
          </div>
        </header>

        <section className="formula-box" aria-label="Formula de la pentatonica">
          <p>Asi aparece una escala de 5 tonos.</p>
          <p>
            La llamamos <strong>pentatonica mayor de Sol</strong>.
          </p>
          <p>
            <strong>G, A, B, D y E</strong>
          </p>
        </section>

        <section className="map-section" aria-labelledby="map-title">
          <header className="section-header">
            <p className="lesson-kicker">Mapa</p>
            <h2 id="map-title">Las notas en el mastil</h2>
            <p>Los circulos verdes son la tonica: Sol.</p>
          </header>
          <PentatonicFretboard />
        </section>

        <section className="minor-box" aria-label="Relacion con Mi menor">
          <p>Aqui tambien aparece la escala de Mi menor.</p>
          <p>
            Las pentatonicas de <strong>Mi menor</strong> y <strong>Sol Mayor</strong> son iguales.
          </p>
          <p>Usan las mismas notas.</p>
          <p>Pero una coloca el centro en Mi y la otra en Sol.</p>
        </section>

        <section className="memory-section" aria-labelledby="memory-title">
          <h2 id="memory-title">Pero son muchas notas. Como las memorizo?</h2>
          <div className="short-copy">
            <p>Dividiendola en trozos.</p>
            <p>Practicando cada trozo por separado.</p>
            <p>Cada trozo coincide con una figura del acorde.</p>
          </div>
        </section>

        <section className="branch-section" aria-labelledby="branch-title">
          <p className="lesson-kicker">Ramas</p>
          <h2 id="branch-title">Caminos que salen de aqui</h2>
          <div className="branch-grid">
            <Link href="/lecciones/temario/ejercicios-pentatonica">
              <span>Ejercicios de pentatonica</span>
              <small>Para practicar las 5 figuras por partes.</small>
            </Link>
            <Link href="/lecciones/temario/pentatonica-blues">
              <span>Pentatonica de blues</span>
              <small>Para anadir la nota blues mas adelante.</small>
            </Link>
          </div>
        </section>
      </article>

      <div className="lesson-pager-wrap">
        <TemarioPager previous={previous} next={next} />
      </div>

      <style>{`
        .pentatonic-page {
          background: #ffffff;
          box-sizing: border-box;
          color: #080808;
          min-height: 100vh;
          overflow-x: clip;
          padding: clamp(28px, 5vw, 72px) clamp(16px, 5vw, 84px);
          width: 100%;
        }

        .pentatonic-content,
        .lesson-pager-wrap {
          box-sizing: border-box;
          margin: 0 auto;
          max-width: 1220px;
          min-width: 0;
          width: 100%;
        }

        .pentatonic-content {
          display: grid;
          gap: clamp(34px, 6vw, 78px);
          padding-bottom: clamp(34px, 6vw, 72px);
        }

        .lesson-kicker {
          color: #047857;
          font-size: 13px;
          font-weight: 950;
          letter-spacing: 0.22em;
          margin: 0 0 12px;
          text-transform: uppercase;
        }

        .pentatonic-header,
        .section-header,
        .memory-section,
        .branch-section {
          margin: 0 auto;
          max-width: 920px;
          text-align: center;
        }

        .pentatonic-header h1 {
          font-size: clamp(46px, 7.8vw, 104px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 0.9;
          margin: 0;
          overflow-wrap: break-word;
          text-transform: uppercase;
          text-decoration: underline;
          text-decoration-thickness: 0.06em;
          text-underline-offset: 0.11em;
        }

        .section-header h2,
        .memory-section h2,
        .branch-section h2 {
          font-size: clamp(30px, 4.7vw, 62px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 0.98;
          margin: 0;
          overflow-wrap: break-word;
          text-transform: uppercase;
        }

        .short-copy {
          display: grid;
          gap: 10px;
          margin: clamp(20px, 4vw, 32px) auto 0;
          max-width: 760px;
        }

        .short-copy p,
        .section-header p,
        .formula-box p,
        .minor-box p {
          color: #303030;
          font-size: clamp(18px, 2vw, 24px);
          font-weight: 650;
          line-height: 1.42;
          margin: 0;
          overflow-wrap: anywhere;
        }

        .formula-box,
        .minor-box {
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

        .formula-box strong,
        .minor-box strong {
          color: #080808;
          font-weight: 950;
        }

        .map-section {
          border-top: 1px solid #d4d4d8;
          display: grid;
          gap: clamp(18px, 3vw, 30px);
          min-width: 0;
          padding-top: clamp(24px, 4vw, 42px);
        }

        .pentatonic-board-wrap {
          margin: 0;
          min-width: 0;
          overflow-x: auto;
          width: 100%;
        }

        .pentatonic-board {
          display: block;
          height: auto;
          margin: 0 auto;
          min-width: 760px;
          width: min(100%, 1080px);
        }

        .board-bg {
          fill: #26313d;
        }

        .string-line {
          stroke: #aab3bf;
          stroke-width: 3;
        }

        .fret-line {
          stroke: #d6dce4;
          stroke-width: 4;
        }

        .nut-line {
          stroke: #edf1f5;
          stroke-width: 8;
        }

        .guide-dot {
          fill: #cad2dc;
          opacity: 0.78;
        }

        .note-dot,
        .note-root {
          fill: #ffffff;
        }

        .note-root {
          stroke: #047857;
          stroke-width: 6;
        }

        .note-label,
        .root-label {
          fill: #2f65ad;
          font-size: 20px;
          font-weight: 950;
          text-anchor: middle;
        }

        .root-label {
          fill: #047857;
        }

        .fret-number,
        .figure-number,
        .top-label,
        .bottom-label {
          fill: #080808;
          font-weight: 950;
          text-anchor: middle;
        }

        .fret-number,
        .figure-number {
          font-size: 16px;
        }

        .top-label,
        .bottom-label {
          font-size: 15px;
        }

        .minor-box {
          border-radius: 48px;
        }

        .memory-section {
          border-top: 1px solid #d4d4d8;
          padding-top: clamp(24px, 4vw, 42px);
        }

        .branch-section {
          border: 2px solid #bfd7ff;
          border-radius: 10px;
          display: grid;
          gap: 18px;
          padding: clamp(18px, 3vw, 28px);
          width: 100%;
        }

        .branch-grid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .branch-grid a {
          border: 2px solid #080808;
          border-radius: 8px;
          color: #080808;
          display: grid;
          gap: 8px;
          min-width: 0;
          padding: 18px;
          text-align: left;
          text-decoration: none;
          transition: border-color 160ms ease, color 160ms ease;
        }

        .branch-grid a:hover,
        .branch-grid a:focus-visible {
          border-color: #047857;
          color: #047857;
        }

        .branch-grid a:focus-visible {
          outline: 3px solid #047857;
          outline-offset: 4px;
        }

        .branch-grid span {
          font-size: clamp(18px, 2vw, 24px);
          font-weight: 950;
          line-height: 1.15;
          overflow-wrap: anywhere;
        }

        .branch-grid small {
          color: #303030;
          font-size: 15px;
          font-weight: 700;
          line-height: 1.35;
          overflow-wrap: anywhere;
        }

        @media (max-width: 760px) {
          .pentatonic-header,
          .section-header,
          .formula-box,
          .minor-box,
          .memory-section,
          .branch-section {
            text-align: left;
          }

          .minor-box {
            border-radius: 10px;
          }

          .branch-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 520px) {
          .pentatonic-content,
          .lesson-pager-wrap {
            max-width: 320px;
          }
        }
      `}</style>
    </main>
  );
}
