import { ReducedFretboardDiagram, ReducedFretboardStyles } from '../../../components/guitar/ReducedFretboardDiagram';
import AlphaTabPlayer from '../../../components/guitar/AlphaTabPlayer';
import TemarioPager from '../TemarioPager';
import type { LessonPageProps } from './types';

const gTriadNotes = [
  { fret: 3, label: 'G', string: 1 },
  { fret: 7, label: 'B', string: 1 },
  { fret: 10, label: 'D', string: 1 },
  { fret: 0, label: 'B', string: 2 },
  { fret: 3, label: 'D', string: 2 },
  { fret: 8, label: 'G', string: 2 },
  { fret: 0, label: 'G', string: 3 },
  { fret: 4, label: 'B', string: 3 },
  { fret: 7, label: 'D', string: 3 },
  { fret: 0, label: 'D', string: 4 },
  { fret: 5, label: 'G', string: 4 },
  { fret: 9, label: 'B', string: 4 },
  { fret: 2, label: 'B', string: 5 },
  { fret: 5, label: 'D', string: 5 },
  { fret: 10, label: 'G', string: 5 },
  { fret: 3, label: 'G', string: 6 },
  { fret: 7, label: 'B', string: 6 },
  { fret: 10, label: 'D', string: 6 },
  { fret: 12, label: 'B', string: 2 },
  { fret: 12, label: 'G', string: 3 },
  { fret: 12, label: 'D', string: 4 },
];

const gSeventhNotes = [
  { fret: 2, label: 'F#', string: 1, tone: 'special' as const },
  { fret: 3, label: 'G', string: 1 },
  { fret: 7, label: 'B', string: 1 },
  { fret: 10, label: 'D', string: 1 },
  { fret: 0, label: 'B', string: 2 },
  { fret: 3, label: 'D', string: 2 },
  { fret: 7, label: 'F#', string: 2, tone: 'special' as const },
  { fret: 8, label: 'G', string: 2 },
  { fret: 0, label: 'G', string: 3 },
  { fret: 4, label: 'B', string: 3 },
  { fret: 7, label: 'D', string: 3 },
  { fret: 11, label: 'F#', string: 3, tone: 'special' as const },
  { fret: 0, label: 'D', string: 4 },
  { fret: 4, label: 'F#', string: 4, tone: 'special' as const },
  { fret: 5, label: 'G', string: 4 },
  { fret: 9, label: 'B', string: 4 },
  { fret: 2, label: 'B', string: 5 },
  { fret: 5, label: 'D', string: 5 },
  { fret: 9, label: 'F#', string: 5, tone: 'special' as const },
  { fret: 10, label: 'G', string: 5 },
  { fret: 2, label: 'F#', string: 6, tone: 'special' as const },
  { fret: 3, label: 'G', string: 6 },
  { fret: 7, label: 'B', string: 6 },
  { fret: 10, label: 'D', string: 6 },
  { fret: 12, label: 'B', string: 2 },
  { fret: 12, label: 'G', string: 3 },
  { fret: 12, label: 'D', string: 4 },
];

export default function AmpliacionArpegiosPage({ previous, next }: LessonPageProps) {
  return (
    <main className="arpeggio-extension-page">
      <article className="arpeggio-extension-content">
        <header className="extension-header">
          <p className="lesson-kicker">Ampliación</p>
          <h1>Arpegios</h1>
          <div className="warning-box" role="note">
            <p>Esta ampliación adelanta un poco de contenido del temario</p>
            <p>pero todos podemos aprender los ejercicios de las tablaturas sin problemas.</p>
          </div>
          <div className="short-copy">
            <p>En la página de arpegios practicamos una forma sencilla.</p>
            <p>Ahora vamos a completar el dibujo por el mástil.</p>
          </div>
        </header>

        <section className="rule-box" aria-label="Idea principal">
          <p>El arpegio de verdad consiste en tocar una a una todas las notas que forman parte del acorde.</p>
        </section>

        <section className="exercise-block" aria-labelledby="triad-title">
          <header className="exercise-header">
            <p className="lesson-kicker">Ejercicio 1</p>
            <h2 id="triad-title">Arpegios triada completos</h2>
            <p>
              Acorde de <span>Sol mayor: G, B y D.</span>
            </p>
          </header>
          <div className="fretboard-map-wrap">
            <ReducedFretboardDiagram
              ariaLabel="Mapa del arpegio de Sol Mayor: G, B y D"
              startFret={0}
              endFret={12}
              notes={gTriadNotes}
            />
          </div>
          <div className="compact-player-frame">
            <AlphaTabPlayer compact layout="horizontal" minHeight={190} source="/tabs/arpegios-g.gp" title="Arpegios G" />
          </div>
        </section>

        <section className="exercise-block" aria-labelledby="seventh-title">
          <header className="exercise-header">
            <p className="lesson-kicker">Ejercicio 2</p>
            <h2 id="seventh-title">Arpegios cuatriada con séptima completos</h2>
            <p>
              Acorde de <span>Sol mayor séptima: G, B, D y F#.</span>
            </p>
          </header>
          <div className="fretboard-map-wrap">
            <ReducedFretboardDiagram
              ariaLabel="Mapa del arpegio de Sol Mayor Séptima: G, B, D y F#"
              startFret={0}
              endFret={12}
              notes={gSeventhNotes}
            />
          </div>
          <div className="compact-player-frame">
            <AlphaTabPlayer compact layout="horizontal" minHeight={190} source="/tabs/arpegios-g7.gp" title="Arpegios G7" />
          </div>
        </section>

        <section className="lesson-close" aria-label="Resumen">
          <p>Podemos empezar por la figura 5 y luego hacer 1, 2, 3 y 4.</p>
          <p>La idea es no tener que retroceder nunca en el mástil al pasar del 4 al 5.</p>
          <p>Escuchamos el color del acorde mientras cambiamos de zona.</p>
          <p>Estos ejercicios y los que vienen después se llaman &quot;digitaciones&quot;: patrones de notas por cuerda.</p>
        </section>
      </article>

      <div className="lesson-pager-wrap">
        <TemarioPager previous={previous} next={next} />
      </div>

      <ReducedFretboardStyles />
      <style>{`
        .arpeggio-extension-page {
          background: #ffffff;
          box-sizing: border-box;
          color: #080808;
          min-height: 100vh;
          overflow-x: clip;
          padding: clamp(28px, 5vw, 72px) clamp(16px, 5vw, 84px);
          width: 100%;
        }

        .arpeggio-extension-content,
        .lesson-pager-wrap {
          box-sizing: border-box;
          margin: 0 auto;
          max-width: 1220px;
          min-width: 0;
          width: 100%;
        }

        .arpeggio-extension-content {
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

        .extension-header,
        .exercise-header {
          margin: 0 auto;
          max-width: 920px;
          text-align: center;
        }

        .extension-header h1 {
          font-size: clamp(54px, 8vw, 108px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 0.9;
          margin: 0;
          overflow-wrap: break-word;
          text-transform: uppercase;
        }

        .exercise-header h2 {
          font-size: clamp(30px, 4.7vw, 62px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 0.98;
          margin: clamp(12px, 2vw, 20px) 0 0;
          overflow-wrap: break-word;
          text-transform: uppercase;
        }

        .short-copy {
          display: grid;
          gap: 10px;
          margin: clamp(22px, 4vw, 34px) auto 0;
          max-width: 760px;
        }

        .warning-box {
          border: 4px solid #dc2626;
          display: grid;
          gap: 8px;
          margin: clamp(22px, 4vw, 34px) auto 0;
          max-width: 820px;
          padding: clamp(14px, 2.6vw, 22px);
          text-align: center;
        }

        .warning-box p {
          color: #991b1b;
          font-size: clamp(18px, 2vw, 25px);
          font-weight: 950;
          line-height: 1.25;
          margin: 0;
          overflow-wrap: anywhere;
        }

        .short-copy p,
        .exercise-header p,
        .lesson-close p,
        .rule-box p {
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
          margin: 0 auto;
          max-width: 980px;
          padding: clamp(18px, 3vw, 28px);
          text-align: center;
          width: 100%;
        }

        .rule-box p {
          color: #080808;
          font-weight: 900;
        }

        .exercise-block {
          border-top: 1px solid #d4d4d8;
          display: grid;
          gap: clamp(12px, 2vw, 20px);
          min-width: 0;
          padding-top: clamp(24px, 4vw, 42px);
        }

        .exercise-header {
          display: grid;
          gap: clamp(10px, 1.6vw, 16px);
        }

        .exercise-header .lesson-kicker {
          margin: 0;
        }

        .exercise-header p span {
          color: #080808;
          font-weight: 900;
          text-decoration: underline;
          text-decoration-color: #047857;
          text-decoration-thickness: 2px;
          text-underline-offset: 5px;
        }

        .fretboard-map-wrap {
          margin: clamp(8px, 1vw, 12px) auto 0;
          max-width: min(100%, 980px);
          min-width: 0;
          width: 100%;
        }

        .compact-player-frame {
          margin: clamp(4px, 0.8vw, 10px) auto 0;
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
          .extension-header,
          .exercise-header {
            text-align: left;
          }

          .rule-box {
            text-align: left;
          }

          .warning-box {
            text-align: left;
          }

        }

        @media (max-width: 520px) {
          .arpeggio-extension-content,
          .lesson-pager-wrap {
            max-width: 320px;
          }
        }
      `}</style>
    </main>
  );
}
