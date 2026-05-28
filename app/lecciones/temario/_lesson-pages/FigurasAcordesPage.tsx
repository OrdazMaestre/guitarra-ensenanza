import Link from 'next/link';
import AlphaTabPlayer from '../../../components/guitar/AlphaTabPlayer';
import TemarioPager from '../TemarioPager';
import type { LessonPageProps } from './types';

const fretNotes = [
  { fret: 0, string: 2, note: 'B' },
  { fret: 0, string: 3, note: 'G' },
  { fret: 0, string: 4, note: 'D' },
  { fret: 2, string: 5, note: 'B' },
  { fret: 3, string: 1, note: 'G' },
  { fret: 3, string: 2, note: 'D' },
  { fret: 3, string: 6, note: 'G' },
  { fret: 4, string: 3, note: 'B' },
  { fret: 5, string: 4, note: 'G' },
  { fret: 5, string: 5, note: 'D' },
  { fret: 7, string: 1, note: 'B' },
  { fret: 7, string: 3, note: 'D' },
  { fret: 7, string: 6, note: 'B' },
  { fret: 8, string: 2, note: 'G' },
  { fret: 9, string: 4, note: 'B' },
  { fret: 10, string: 1, note: 'D' },
  { fret: 10, string: 5, note: 'G' },
  { fret: 10, string: 6, note: 'D' },
  { fret: 12, string: 2, note: 'B' },
  { fret: 12, string: 3, note: 'G' },
  { fret: 12, string: 4, note: 'D' },
];

const guideDots = [
  { fret: 3, string: 3 },
  { fret: 5, string: 3 },
  { fret: 7, string: 3 },
  { fret: 12, string: 5 },
];

function GChordFretboard() {
  const fretWidth = 74;
  const boardX = 34;
  const boardY = 36;
  const boardWidth = fretWidth * 12;
  const boardHeight = 154;
  const stringY = (string: number) => boardY + (string - 1) * (boardHeight / 5);
  const fretX = (fret: number) => (fret === 0 ? boardX - 18 : boardX + (fret - 0.5) * fretWidth);

  return (
    <figure className="fretboard-figure">
      <svg className="g-fretboard" viewBox="0 0 980 220" role="img" aria-label="Mapa del acorde de Sol Mayor con las notas G, B y D">
        <rect x={boardX} y={boardY} width={boardWidth} height={boardHeight} fill="#27313d" />
        {[1, 2, 3, 4, 5, 6].map((string) => (
          <line className="g-string" key={string} x1={boardX} x2={boardX + boardWidth} y1={stringY(string)} y2={stringY(string)} />
        ))}
        {Array.from({ length: 13 }, (_, fret) => (
          <g key={fret}>
            <line className={fret === 0 ? 'g-nut' : 'g-fret'} x1={boardX + fret * fretWidth} x2={boardX + fret * fretWidth} y1={boardY} y2={boardY + boardHeight} />
            {fret > 0 ? (
              <text className="fret-number" x={boardX + (fret - 0.5) * fretWidth} y="20">
                {fret}
              </text>
            ) : null}
          </g>
        ))}
        {guideDots.map((dot) => (
          <circle className="guide-dot" cx={fretX(dot.fret)} cy={stringY(dot.string)} key={`${dot.fret}-${dot.string}`} r="8" />
        ))}
        {fretNotes.map((item) => (
          <g key={`${item.fret}-${item.string}-${item.note}`}>
            <circle className="note-dot" cx={fretX(item.fret)} cy={stringY(item.string)} r="16" />
            <text className="note-label" x={fretX(item.fret)} y={stringY(item.string) + 5}>
              {item.note}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

export default function FigurasAcordesPage({ previous, next }: LessonPageProps) {
  return (
    <main className="figures-page">
      <article className="figures-content">
        <header className="figures-header">
          <p className="lesson-kicker">Unidad 9</p>
          <h1>Figuras de acordes</h1>
          <div className="short-copy">
            <p>Los acordes se pueden tocar de muchas formas.</p>
            <p>Y en muchos sitios de la guitarra.</p>
            <p>Lo importante es tocar las notas correctas.</p>
          </div>
        </header>

        <section className="rule-box" aria-label="Ejemplo">
          <p>Usamos de ejemplo el acorde de Sol Mayor.</p>
          <p>Sol Mayor siempre usa las notas G, B y D.</p>
        </section>

        <section className="figures-section" aria-labelledby="map-title">
          <header className="section-header">
            <p className="lesson-kicker">Mapa</p>
            <h2 id="map-title">Todas las notas dedel acorde mayor</h2>
            <p>Sol Mayor: G, B y D.</p>
          </header>
          <GChordFretboard />
        </section>

        <section className="figures-section" aria-labelledby="five-figures-title">
          <header className="section-header">
            <p className="lesson-kicker">Cinco zonas</p>
            <h2 id="five-figures-title">5 figuras para el mismo acorde</h2>
            <p>Son 5 dibujos para movernos por el mastil sin perdernos.</p>
          </header>
          <div className="compact-player-frame">
            <AlphaTabPlayer compact layout="horizontal" minHeight={210} source="/tabs/figuras-tri.gp" title="Figuras triada" />
          </div>
        </section>

        <section className="practice-box" aria-label="Ejercicio">
          <p>
            <strong>Ejercicio:</strong> practicar la progresion de acordes de arriba.
          </p>
          <p>No hace falta tocar las 6 cuerdas a la vez desde el principio.</p>
          <p>Podemos usar solo las 3 cuerdas de arriba.</p>
          <p>O solo las 3 cuerdas de abajo.</p></section><section className="practice-box" aria-label="Ejercicio">
          <p>Si estamos atentos nos damos cuenta de que son las figuras de todos los acordes mayores básicos.</p>
          <p>Cada acorde básico está en su propia figura para facilitar tocarlos todos entre los trastes 1 y 5.</p>
        </section>

        <section className="theory-link" aria-label="Enlace a teoria">
          <Link href="/lecciones/temario/escalas">¿Cómo funciona la música y por qué vamos a usar Sol Mayor para el resto de explicaciones?</Link>
        </section>
      </article>

      <div className="lesson-pager-wrap">
        <TemarioPager previous={previous} next={next} />
      </div>

      <style>{`
        .figures-page {
          background: #ffffff;
          box-sizing: border-box;
          color: #080808;
          min-height: 100vh;
          overflow-x: clip;
          padding: clamp(28px, 5vw, 72px) clamp(16px, 5vw, 84px);
          width: 100%;
        }

        .figures-content,
        .lesson-pager-wrap {
          box-sizing: border-box;
          margin: 0 auto;
          max-width: 1220px;
          min-width: 0;
          width: 100%;
        }

        .figures-content {
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

        .figures-header,
        .section-header {
          margin: 0 auto;
          max-width: 920px;
          text-align: center;
        }

        .figures-header h1 {
          font-size: clamp(42px, 7vw, 92px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 0.95;
          margin: 0;
          overflow-wrap: break-word;
          text-transform: uppercase;
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
        .rule-box p,
        .practice-box p,
        .theory-link p {
          color: #303030;
          font-size: clamp(18px, 2vw, 24px);
          font-weight: 650;
          line-height: 1.42;
          margin: 0;
          overflow-wrap: anywhere;
        }

        .rule-box,
        .practice-box,
        .theory-link {
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

        .rule-box p:first-child,
        .practice-box strong {
          color: #080808;
          font-weight: 950;
        }

        .figures-section {
          border-top: 1px solid #d4d4d8;
          display: grid;
          gap: clamp(18px, 3vw, 30px);
          min-width: 0;
          padding-top: clamp(24px, 4vw, 42px);
        }

        .compact-player-frame {
          margin: 0 auto;
          max-width: 100%;
          min-width: 0;
          overflow-x: auto;
          overscroll-behavior-x: contain;
          width: 100%;
        }

        .compact-player-frame > div {
          min-width: min(100%, 980px);
        }

        .compact-player-frame .alphatab-container {
          max-width: 100%;
          overflow-x: auto;
        }

        .fretboard-figure {
          margin: 0;
          min-width: 0;
          overflow-x: auto;
          width: 100%;
        }

        .g-fretboard {
          display: block;
          height: auto;
          margin: 0 auto;
          min-width: 760px;
          width: min(100%, 1040px);
        }

        .g-string {
          stroke: #9ca3af;
          stroke-width: 3;
        }

        .g-fret {
          stroke: #d1d5db;
          stroke-width: 4;
        }

        .g-nut {
          stroke: #e5e7eb;
          stroke-width: 8;
        }

        .fret-number {
          fill: #080808;
          font-size: 16px;
          font-weight: 850;
          text-anchor: middle;
        }

        .guide-dot {
          fill: #cbd5e1;
          opacity: 0.8;
        }

        .note-dot {
          fill: #ffffff;
        }

        .note-label {
          fill: #2f65ad;
          font-size: 20px;
          font-weight: 950;
          text-anchor: middle;
        }

        .theory-link {
          border-color: #047857;
        }

        .theory-link a {
          color: #080808;
          font-size: clamp(20px, 2.4vw, 30px);
          font-weight: 950;
          line-height: 1.18;
          overflow-wrap: anywhere;
          text-decoration-color: #047857;
          text-decoration-thickness: 3px;
          text-underline-offset: 6px;
        }

        .theory-link a:hover {
          color: #047857;
        }

        @media (max-width: 760px) {
          .figures-header,
          .section-header,
          .rule-box,
          .practice-box,
          .theory-link {
            text-align: left;
          }
        }

        @media (max-width: 520px) {
          .figures-content,
          .lesson-pager-wrap {
            max-width: 320px;
          }
        }
      `}</style>
    </main>
  );
}
