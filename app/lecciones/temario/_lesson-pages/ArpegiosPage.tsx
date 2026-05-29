import Link from 'next/link';
import AlphaTabPlayer from '../../../components/guitar/AlphaTabPlayer';
import TemarioPager from '../TemarioPager';
import type { LessonPageProps } from './types';

type ArpeggioExercise = {
  direction: string;
  kicker: string;
  source: string;
  steps: string[];
};

const stringX = (stringNumber: number) => 18 + (6 - stringNumber) * 20;
const fretY = (fret: number) => 22 + (fret - 0.5) * 19;

function FaMajorChordDiagram() {
  const barre = { fret: 1, from: 6, to: 1, label: '1' };
  const markers = [
    { string: 5, fret: 3, finger: '3' },
    { string: 4, fret: 3, finger: '4' },
    { string: 3, fret: 2, finger: '2' },
  ];

  return (
    <figure className="reference-chord">
      <figcaption>
        <span className="primary-chord-name">F</span> <span className="local-chord-name">(FA Mayor)</span>
      </figcaption>
      <svg className="chord-diagram" viewBox="0 0 136 124" role="img" aria-label="Acorde F FA Mayor">
        <line className="nut" x1="18" x2="118" y1="22" y2="22" />
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <line className="string-line" key={`string-${index}`} x1={18 + index * 20} x2={18 + index * 20} y1="22" y2="98" />
        ))}
        {[1, 2, 3, 4].map((index) => (
          <line className="fret-line" key={`fret-${index}`} x1="18" x2="118" y1={22 + index * 19} y2={22 + index * 19} />
        ))}
        <g>
          <rect
            className="barre"
            height="14"
            rx="7"
            width={Math.abs(stringX(barre.to) - stringX(barre.from)) + 16}
            x={Math.min(stringX(barre.from), stringX(barre.to)) - 8}
            y={fretY(barre.fret) - 7}
          />
          <text className="finger-label" x={(stringX(barre.from) + stringX(barre.to)) / 2} y={fretY(barre.fret) + 4}>
            {barre.label}
          </text>
        </g>
        {markers.map((marker) => (
          <g key={`${marker.string}-${marker.fret}-${marker.finger}`}>
            <circle className="finger-dot" cx={stringX(marker.string)} cy={fretY(marker.fret)} r="8" />
            <text className="finger-label" x={stringX(marker.string)} y={fretY(marker.fret) + 4}>
              {marker.finger}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

const exercises: ArpeggioExercise[] = [
  {
    direction: 'Arriba y abajo',
    kicker: 'Ejercicio 1',
    source: '/tabs/arpegio-fa-1.gp',
    steps: ['Primero subimos por las cuerdas.', 'Luego bajamos.'],
  },
  {
    direction: 'Solo hacia abajo',
    kicker: 'Ejercicio 2',
    source: '/tabs/arpegio-fa-2.gp',
    steps: ['Tocamos las notas una a una.', 'Siempre en la misma direccion.'],
  },
  {
    direction: 'Solo hacia arriba',
    kicker: 'Ejercicio 3',
    source: '/tabs/arpegio-fa-3.gp',
    steps: ['Tocamos las notas una a una.', 'Ahora empezamos por el otro lado.'],
  },
];

export default function ArpegiosPage({ previous, next }: LessonPageProps) {
  return (
    <main className="arpeggio-page">
      <article className="arpeggio-content">
        <header className="arpeggio-header">
          <h1>Empezando con los arpegios</h1>
          <div className="short-copy">
            <p>Un arpegio es un acorde tocado nota a nota.</p>
            <p>Cuerda a cuerda de momento.</p>
            <p>Vamos a empezar con el acorde de Fa (F).</p>
          </div>
        </header>

        <section className="lesson-focus" aria-label="Idea principal">
          <p>3 ejercicios con el acorde de Fa.</p>
          <FaMajorChordDiagram />
        </section>

        {exercises.map((exercise) => (
          <section className="arpeggio-exercise" aria-labelledby={`${exercise.kicker}-title`} key={exercise.kicker}>
            <header className="exercise-header">
              <p className="lesson-kicker">{exercise.kicker}</p>
              <h2 id={`${exercise.kicker}-title`}>{exercise.direction}</h2>
              <div className="exercise-steps">
                {exercise.steps.map((step) => (
                  <p key={step}>{step}</p>
                ))}
              </div>
            </header>

            <div className="compact-player-frame">
              <AlphaTabPlayer compact layout="horizontal" minHeight={190} source={exercise.source} title={exercise.kicker} />
            </div>
          </section>
        ))}

        <section className="lesson-close" aria-label="Resumen">
          <p>Esto lo hemos hecho con las 3 cuerdas inferiores del acorde de Fa.</p>
          <p>Tenemos que hacer lo mismo con las 3 cuerdas de arriba.</p>
          <p>Y lo mismo con los demas acordes de la pagina 4.</p>
          <p>Los arpegios se pueden hacer con 3, 4, 5 y 6 cuerdas.</p>
          <p>RETO: Tocar Let It Be arpegiando los acordes de la forma que más os guste.</p>
          <Link href="/lecciones/temario/acordes-completos">ACORDES COMPLETOS</Link>
        </section>

        <section className="lesson-close" aria-label="Resumen">
          <p>ESO FUE LO FÁCIL. Abajo verás los arpegios de verdad</p>
          <Link href="/lecciones/temario/ampliacion-arpegios">AMPLIACION ARPEGIOS</Link>
        </section>
      </article>

      <div className="lesson-pager-wrap">
        <TemarioPager previous={previous} next={next} />
      </div>

      <style>{`
        .arpeggio-page {
          background: #ffffff;
          box-sizing: border-box;
          color: #080808;
          min-height: 100vh;
          overflow-x: clip;
          padding: clamp(28px, 5vw, 72px) clamp(16px, 5vw, 84px);
          width: 100%;
        }

        .arpeggio-content,
        .lesson-pager-wrap {
          box-sizing: border-box;
          margin: 0 auto;
          max-width: 1220px;
          min-width: 0;
          width: 100%;
        }

        .arpeggio-content {
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

        .arpeggio-header {
          margin: 0 auto;
          max-width: 920px;
          text-align: center;
        }

        .arpeggio-header h1 {
          font-size: clamp(42px, 7vw, 92px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 0.95;
          margin: 0;
          overflow-wrap: break-word;
          text-transform: uppercase;
        }

        .short-copy,
        .exercise-steps {
          display: grid;
          gap: 10px;
          margin: clamp(20px, 4vw, 32px) auto 0;
          max-width: 760px;
        }

        .short-copy p,
        .exercise-steps p,
        .lesson-close p {
          color: #303030;
          font-size: clamp(18px, 2vw, 24px);
          font-weight: 650;
          line-height: 1.42;
          margin: 0;
          overflow-wrap: anywhere;
        }

        .lesson-focus {
          align-items: center;
          border-block: 1px solid #d4d4d8;
          display: grid;
          gap: clamp(18px, 4vw, 40px);
          grid-template-columns: minmax(0, 1fr) auto;
          margin: 0 auto;
          max-width: 900px;
          min-width: 0;
          padding: clamp(22px, 4vw, 34px) 0;
          width: 100%;
        }

        .lesson-focus p {
          color: #080808;
          font-size: clamp(24px, 4vw, 44px);
          font-weight: 950;
          line-height: 1.05;
          margin: 0;
          overflow-wrap: anywhere;
          text-transform: uppercase;
        }

        .arpeggio-exercise {
          border-top: 1px solid #d4d4d8;
          display: grid;
          gap: clamp(16px, 3vw, 30px);
          min-height: min(700px, calc(100vh - 42px));
          min-width: 0;
          padding-top: clamp(24px, 4vw, 40px);
        }

        .exercise-header {
          text-align: center;
        }

        .exercise-header h2 {
          font-size: clamp(34px, 5vw, 70px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 0.98;
          margin: 0;
          overflow-wrap: break-word;
          text-transform: uppercase;
        }

        .reference-chord {
          border: 3px solid #d4d4d8;
          box-sizing: border-box;
          display: grid;
          gap: 8px;
          justify-items: center;
          margin: 0;
          min-width: min(100%, 180px);
          padding: 14px 10px 12px;
        }

        .reference-chord figcaption {
          color: #080808;
          font-size: clamp(15px, 1.8vw, 21px);
          font-weight: 950;
          line-height: 1.1;
          text-decoration: underline;
          text-underline-offset: 4px;
        }

        .primary-chord-name {
          color: #047857;
          font-size: 1.18em;
        }

        .local-chord-name {
          color: #080808;
          font-size: 0.92em;
        }

        .chord-diagram {
          display: block;
          height: auto;
          max-width: 148px;
          overflow: visible;
          width: 100%;
        }

        .nut,
        .fret-line,
        .string-line {
          stroke: #0f4f5f;
          stroke-linecap: square;
        }

        .nut {
          stroke-width: 4;
        }

        .fret-line,
        .string-line {
          stroke-width: 2;
        }

        .finger-dot,
        .barre {
          fill: #ffffff;
          stroke: #047857;
          stroke-width: 2.5;
        }

        .finger-label {
          dominant-baseline: middle;
          fill: #080808;
          font-size: 10px;
          font-weight: 950;
          text-anchor: middle;
        }

        .lesson-close a {
          color: #080808;
          display: inline-flex;
          font-size: 13px;
          font-weight: 950;
          letter-spacing: 0.16em;
          margin-top: 10px;
          max-width: 100%;
          overflow-wrap: anywhere;
          text-decoration-color: #047857;
          text-decoration-thickness: 2px;
          text-underline-offset: 5px;
          width: fit-content;
        }

        .lesson-close a:hover {
          color: #047857;
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

        .lesson-close {
          border-left: 5px solid #047857;
          display: grid;
          gap: 10px;
          margin: 0 auto;
          max-width: 860px;
          padding-left: clamp(16px, 3vw, 24px);
        }

        @media (max-width: 760px) {
          .arpeggio-header,
          .exercise-header {
            text-align: left;
          }

          .lesson-focus {
            grid-template-columns: minmax(0, 1fr);
            justify-items: start;
          }

          .arpeggio-exercise {
            min-height: auto;
          }
        }

        @media (max-width: 520px) {
          .arpeggio-content,
          .lesson-pager-wrap {
            max-width: 320px;
          }
        }
      `}</style>
    </main>
  );
}
