import Link from 'next/link';
import TemarioPager from '../TemarioPager';
import type { LessonPageProps } from './types';

const chromaticNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const stringTunings = [
  { label: 'E', open: 4 },
  { label: 'B', open: 11 },
  { label: 'G', open: 7 },
  { label: 'D', open: 2 },
  { label: 'A', open: 9 },
  { label: 'E', open: 4 },
];

const eMinorPentatonicNotes = ['E', 'G', 'A', 'B', 'D'];
const eMinorBluesNotes = ['E', 'G', 'A', 'A#', 'B', 'D'];
const blueNoteLabel = 'Bb';

function noteNameForFret(open: number, fret: number) {
  return chromaticNotes[(open + fret) % chromaticNotes.length];
}

function displayNote(note: string) {
  return note === 'A#' ? blueNoteLabel : note;
}

function FretboardMap({
  ariaLabel,
  blues = false,
  notes,
}: {
  ariaLabel: string;
  blues?: boolean;
  notes: string[];
}) {
  const boardX = 58;
  const boardY = 54;
  const fretWidth = 70;
  const boardWidth = fretWidth * 12;
  const boardHeight = 178;
  const viewBoxWidth = boardX + boardWidth + 64;
  const viewBoxHeight = boardY + boardHeight + 28;
  const stringGap = boardHeight / 5;
  const stringY = (string: number) => boardY + (string - 1) * stringGap;
  const fretX = (fret: number) => (fret === 0 ? boardX - 28 : boardX + (fret - 0.5) * fretWidth);
  const fretNotes = stringTunings.flatMap((string, stringIndex) =>
    Array.from({ length: 13 }, (_, fret) => {
      const note = noteNameForFret(string.open, fret);

      return notes.includes(note)
        ? {
            fret,
            note,
            string: stringIndex + 1,
          }
        : null;
    }).filter((item): item is { fret: number; note: string; string: number } => item !== null),
  );

  return (
    <figure className="blues-map-wrap">
      <svg className="blues-map" viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`} role="img" aria-label={ariaLabel}>
        <rect className="map-bg" x={boardX} y={boardY} width={boardWidth} height={boardHeight} />
        {stringTunings.map((string, index) => (
          <g key={`${string.label}-${index}`}>
            <line className="map-string" x1={boardX} x2={boardX + boardWidth} y1={stringY(index + 1)} y2={stringY(index + 1)} />
          </g>
        ))}
        {Array.from({ length: 13 }, (_, fret) => (
          <line
            className={fret === 0 ? 'map-nut' : 'map-fret'}
            key={`fret-${fret}`}
            x1={boardX + fret * fretWidth}
            x2={boardX + fret * fretWidth}
            y1={boardY}
            y2={boardY + boardHeight}
          />
        ))}
        {[3, 5, 7, 9, 12].map((fret) => (
          <circle className="map-guide-dot" cx={boardX + (fret - 0.5) * fretWidth} cy={stringY(3.5)} key={`guide-${fret}`} r="8" />
        ))}
        {fretNotes.map((item) => {
          const isBlueNote = item.note === 'A#';

          return (
            <g key={`${item.string}-${item.fret}-${item.note}`}>
              <circle
                className={isBlueNote ? 'map-note map-note-special' : item.note === 'E' ? 'map-note map-note-e' : item.note === 'G' ? 'map-note map-note-g' : 'map-note'}
                cx={fretX(item.fret)}
                cy={stringY(item.string)}
                r={isBlueNote ? 15 : 17}
              />
              <text className="map-note-label" x={fretX(item.fret)} y={stringY(item.string) + 5}>
                {displayNote(item.note)}
              </text>
            </g>
          );
        })}
        {blues ? (
          <text className="map-note-hint" x={boardX + boardWidth / 2} y={boardY + boardHeight + 22}>
            Bb tambien puede llamarse A#
          </text>
        ) : null}
      </svg>
    </figure>
  );
}

const evolutionItems = [
  {
    body: (
      <>
        <p>
          <a className="musician-link" href="https://www.youtube.com/watch?v=_tIZ2Savx60" rel="noreferrer" target="_blank">
            Johann Sebastian Bach
          </a>{' '}
          crea en torno al año 1700 el conjunto teórico musical que estudiamos hoy en día.
        </p>
        <p>Sus reglas son como los mandamientos para los músicos clásicos.</p>
        <p>Son muy amplias, pero algo restrictivas.</p>
      </>
    ),
    period: 'Siglos XVII-XIX',
    title: 'Música clásica',
  },
  {
    body: (
      <>
        <p>Se crea la Blue Note.</p>
        <p>
          <a className="musician-link" href="https://www.youtube.com/watch?v=-zZinzoPOak" rel="noreferrer" target="_blank">
            W. C. Handy
          </a>{' '}
          se considera el “padre del blues”.
        </p>
        <p>
          <a className="musician-link" href="https://www.youtube.com/watch?v=MEsQikthT3Q" rel="noreferrer" target="_blank">
            Robert Johnson
          </a>{' '}
          fue un guitarrista de blues que inspiró al rock.
        </p>
      </>
    ),
    period: 'Finales siglo XIX',
    title: 'Blues',
  },
  {
    body: (
      <>
        <p>Basado en experimentar, mezclar escalas, improvisar... el opuesto literal de la música clásica.</p>
        <p>
          <a className="musician-link" href="https://www.youtube.com/watch?v=wyLjbMBpGDA" rel="noreferrer" target="_blank">
            Louis Armstrong
          </a>{' '}
          y{' '}
          <a className="musician-link" href="https://www.youtube.com/watch?v=3R0JQ7X4000" rel="noreferrer" target="_blank">
            Duke Ellington
          </a>{' '}
          son dos de los creadores del jazz.
        </p>
      </>
    ),
    period: 'Principios del siglo XX',
    title: 'Jazz',
  },
  {
    body: (
      <>
        <p>
          <a className="musician-link" href="https://www.youtube.com/watch?v=wcW8SvbnJYE" rel="noreferrer" target="_blank">
            Chuck Berry
          </a>{' '}
          lo crea y{' '}
          <a className="musician-link" href="https://www.youtube.com/watch?v=gj0Rz-uP4Mk" rel="noreferrer" target="_blank">
            Elvis Presley
          </a>{' '}
          lo populariza.
        </p>
        <p>
          <a className="musician-link" href="https://www.youtube.com/watch?v=M4vbJQ-MrKo" rel="noreferrer" target="_blank">
            Los Beatles
          </a>{' '}
          superaron en fama a Elvis y convirtieron el rock en un fenómeno global.
        </p>
        <p>
          <a className="musician-link" href="https://www.youtube.com/watch?v=EX5phFmbrU8" rel="noreferrer" target="_blank">
            Jimi Hendrix
          </a>{' '}
          llegaría para inspirar al Hard Rock y al Metal.
        </p>
      </>
    ),
    period: 'Mediados del siglo XX',
    title: 'Rock&Roll',
  },
];

export default function PentatonicaBluesPage({ previous, next }: LessonPageProps) {
  return (
    <main className="blues-page">
      <article className="blues-content">
        <header className="blues-header">
          <p className="lesson-kicker">Ampliacion de la pentatonica</p>
          <h1>Pentatonica de blues</h1>
          <div className="short-copy">
            <p>Vamos a centrarnos en Mi menor.</p>
            <p>Es una escala muy usada en blues.</p>
            <p>Y sale de la pentatonica que ya conocemos.</p>
          </div>
        </header>

        <section className="map-section" aria-labelledby="minor-title">
          <header className="section-header">
            <p className="lesson-kicker">Mi menor</p>
            <h2 id="minor-title">Pentatonica de Mi menor</h2>
            <p>E, G, A, B y D.</p>
            <p>Son las mismas notas que Sol Mayor.</p>
          </header>
          <FretboardMap ariaLabel="Pentatonica de Mi menor en los doce primeros trastes" notes={eMinorPentatonicNotes} />
        </section>

        <section className="map-section" aria-labelledby="blues-title">
          <header className="section-header">
            <h2 id="blues-title">Pentatonica de blues</h2>
            <p>Ahora anadimos una nota rara: <strong>Bb</strong>.
            </p>
          </header>
          <FretboardMap ariaLabel="Pentatonica de blues de Mi menor con Bb en los doce primeros trastes" blues notes={eMinorBluesNotes} />
        </section>

        <section className="formula-box" aria-label="Formula de la escala de blues">
          <p>
            <strong>La pentatónica de blues usa 6 notas, no 5.</strong>
          </p>
          <p>E, G, A, Bb, B y D.</p>
          <p>La nota extra no suena tranquila.</p>
          <p>Eso es lo especial que tiene el sonido del blues entre otras cosas.</p>
        </section>

        <section className="practice-link" aria-label="Volver a ejercicios">
          <Link href="/lecciones/temario/ejercicios-pentatonica">Antes de correr: repasar las 5 figuras</Link>
        </section>

        <section className="practice-link" aria-label="Ejercicios de pentatonica blues">
          <Link href="/lecciones/temario/ejercicios-pentatonica-blues">Ejercicios de pentatonica de blues</Link>
        </section>

        <section className="history-box" aria-labelledby="history-title">
          <div className="history-copy">
            <p>El blues salió de la mezcla entre la música folclórica del lugar con la complejidad armónica que presentaba la música clásica.</p>
            <p>Los músicos de blues dominaban la música de su tierra y la teoría musical del clasicismo.</p>
            <p>
              Ellos fueron los primeros en proponer una música compleja y distinta a como{' '}
              <span className="underlined">se creía en aquella época que era la única manera de hacer música bien</span>.
            </p>
            <p>Muy pocos clásicos (como Claude Debussy o Igor Stravinsky) usaban estos recursos “raros”.</p>
            <p>
              <span className="underlined">Así nace la <strong>música moderna</strong>, diferenciandose</span> de forma fundamental con la{' '}
              <span className="underlined"><strong>música clásica</strong></span>.
            </p>
            <p>El Jazz fue la cúspide de esa experimentación musical: escalas de 7 a 12 notas, múltiples escalas en la misma canción... etc.</p>
          </div>

          <div className="timeline-heading">
            <p className="lesson-kicker">Evolución de la música</p>
            <h2 id="history-title">De los clásicos al rock</h2>
          </div>

          <div className="timeline-grid">
            {evolutionItems.map((item, index) => (
              <article className="timeline-card" key={item.title}>
                <h3>
                  {item.title} <span>({item.period})</span>
                </h3>
                <div className="timeline-card-copy">{item.body}</div>
                {index < evolutionItems.length - 1 ? <span className="timeline-arrow" aria-hidden="true">→</span> : null}
              </article>
            ))}
          </div>
        </section>

      
      </article>

      <div className="lesson-pager-wrap">
        <TemarioPager previous={previous} next={next} />
      </div>

      <style>{`
        .blues-page {
          background: #ffffff;
          box-sizing: border-box;
          color: #080808;
          min-height: 100vh;
          overflow-x: clip;
          padding: clamp(76px, 9vw, 116px) clamp(16px, 5vw, 84px) clamp(28px, 5vw, 72px);
          width: 100%;
        }

        .blues-content,
        .lesson-pager-wrap {
          box-sizing: border-box;
          margin: 0 auto;
          max-width: 1220px;
          min-width: 0;
          width: 100%;
        }

        .blues-content {
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

        .blues-header,
        .section-header {
          margin: 0 auto;
          max-width: 960px;
          text-align: center;
        }

        .blues-header h1 {
          font-size: clamp(42px, 7vw, 96px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 0.92;
          margin: 0;
          overflow-wrap: break-word;
          text-transform: uppercase;
          text-decoration: underline;
          text-decoration-thickness: 0.06em;
          text-underline-offset: 0.11em;
        }

        .section-header h2 {
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
        .history-box p,
        .timeline-card p {
          color: #303030;
          font-size: clamp(18px, 2vw, 24px);
          font-weight: 650;
          line-height: 1.42;
          margin: 0;
          overflow-wrap: anywhere;
        }

        .section-header strong,
        .formula-box strong {
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

        .blues-map-wrap {
          margin: 0;
          min-width: 0;
          overflow-x: auto;
          width: 100%;
        }

        .blues-map {
          display: block;
          height: auto;
          margin: 0 auto;
          min-width: 760px;
          width: min(100%, 1120px);
        }

        .map-bg {
          fill: #27313d;
        }

        .map-string {
          stroke: #aab3bf;
          stroke-width: 3;
        }

        .map-fret {
          stroke: #d6dce4;
          stroke-width: 4;
        }

        .map-nut {
          stroke: #edf1f5;
          stroke-width: 8;
        }

        .map-guide-dot {
          fill: #cad2dc;
          opacity: 0.78;
        }

        .map-note {
          fill: #f1f5f9;
          stroke: #a1a1aa;
          stroke-width: 3;
        }

        .map-note-e {
          stroke: #059669;
          stroke-width: 6;
        }

        .map-note-g {
          stroke: #2563eb;
          stroke-width: 6;
        }

        .map-note-special {
          stroke: #dc2626;
          stroke-width: 6;
        }

        .map-note-label {
          fill: #080808;
          font-size: 18px;
          font-weight: 950;
          text-anchor: middle;
        }

        .map-note-hint {
          fill: #303030;
          font-size: 15px;
          font-weight: 850;
          text-anchor: middle;
        }

        .formula-box,
        .history-box,
        .practice-link {
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

        .formula-box {
          border-color: #047857;
        }

        .history-box {
          border-radius: 48px;
          gap: clamp(28px, 5vw, 52px);
          max-width: 1120px;
          padding: clamp(24px, 4vw, 42px);
        }

        .history-copy {
          display: grid;
          gap: clamp(18px, 3vw, 28px);
          margin: 0 auto;
          max-width: 980px;
          text-align: center;
        }

        .history-copy p {
          color: #18181b;
          font-size: clamp(18px, 2vw, 25px);
          font-weight: 620;
          line-height: 1.5;
        }

        .history-copy strong,
        .timeline-card strong {
          color: #080808;
          font-weight: 950;
        }

        .musician-link {
          animation: none !important;
          color: #080808 !important;
          display: inline !important;
          font-weight: 950;
          text-decoration-color: #047857 !important;
          text-decoration-thickness: 2px !important;
          text-underline-offset: 0.16em !important;
        }

        .musician-link:hover,
        .musician-link:focus-visible {
          color: #047857 !important;
        }

        .underlined {
          text-decoration: underline;
          text-decoration-thickness: 0.08em;
          text-underline-offset: 0.16em;
        }

        .timeline-heading {
          margin: 0 auto;
          max-width: 760px;
          text-align: center;
        }

        .timeline-heading h2 {
          font-size: clamp(24px, 3.6vw, 46px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 1;
          margin: 0;
          overflow-wrap: break-word;
          text-transform: uppercase;
        }

        .timeline-grid {
          display: grid;
          gap: 18px;
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .timeline-card {
          border: 2px solid #080808;
          border-radius: 8px;
          display: grid;
          gap: 12px;
          min-width: 0;
          padding: 18px;
          position: relative;
        }

        .timeline-card h3 {
          color: #047857;
          font-size: clamp(17px, 1.8vw, 22px);
          font-weight: 950;
          line-height: 1.08;
          margin: 0;
          overflow-wrap: anywhere;
          text-transform: uppercase;
        }

        .timeline-card h3 span {
          color: #18181b;
          display: block;
          font-size: 14px;
          line-height: 1.2;
          margin-top: 6px;
          text-transform: none;
        }

        .timeline-card-copy {
          display: grid;
          gap: 8px;
        }

        .timeline-card p {
          color: #303030;
          font-size: 16px;
          font-weight: 650;
          line-height: 1.35;
        }

        .timeline-arrow {
          align-items: center;
          background: #ffffff;
          border: 2px solid #080808;
          border-radius: 999px;
          display: inline-flex;
          font-size: 20px;
          font-weight: 950;
          height: 34px;
          justify-content: center;
          position: absolute;
          right: -27px;
          top: 24px;
          width: 34px;
          z-index: 2;
        }

        .practice-link {
          border-color: #047857;
        }

        .practice-link a {
          color: #080808;
          font-size: clamp(20px, 2.4vw, 30px);
          font-weight: 950;
          line-height: 1.16;
          overflow-wrap: anywhere;
          text-decoration-color: #047857;
          text-decoration-thickness: 3px;
          text-underline-offset: 6px;
        }

        .practice-link a:hover {
          color: #047857;
        }

        @media (max-width: 900px) {
          .evolution-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 760px) {
          .blues-header,
          .section-header,
          .formula-box,
          .history-box,
          .practice-link {
            text-align: left;
          }

          .history-box {
            border-radius: 10px;
          }

          .history-copy,
          .timeline-heading {
            text-align: left;
          }
        }

        @media (max-width: 900px) {
          .timeline-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .timeline-arrow {
            display: none;
          }
        }

        @media (max-width: 560px) {
          .timeline-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 520px) {
          .blues-content,
          .lesson-pager-wrap {
            max-width: 320px;
          }
        }
      `}</style>
    </main>
  );
}
