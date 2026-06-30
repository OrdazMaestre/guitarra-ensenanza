import Link from 'next/link';
import AlphaTabPlayer from '../../../components/guitar/AlphaTabPlayer';
import { ReducedFretboardDiagram, ReducedFretboardStyles } from '../../../components/guitar/ReducedFretboardDiagram';
import TemarioPager from '../TemarioPager';
import type { LessonPageProps } from './types';

export default function TablaturasPage({ previous, next }: LessonPageProps) {
  return (
    <main className="tablature-page">
      <article className="tablature-content">
        <header className="tablature-header">
          <h1>
            <span>Aprendiendo a</span>
            <span>leer tablaturas</span>
          </h1>
        </header>

        <section className="frets-overview" aria-labelledby="frets-title">
          <div className="frets-copy">
            <p className="lesson-kicker">Trastes</p>
            <h2 id="frets-title">Cada número marca un lugar del mástil</h2>
            <p>
              El <strong>0</strong> significa cuerda al aire: tocamos sin pisar ningún traste. El <strong>1</strong>, el <strong>2</strong>, el <strong>3</strong> y los demás números nos mandan avanzar por el mástil.
            </p>
            
              <p>Intentamos memorizar este mapa de notas para aprender más fácil la canción.</p>
          </div>

          <div className="fretboard-diagram">
            <ReducedFretboardDiagram
              ariaLabel="Mástil con las notas de Cumpleaños feliz, cuerda 1, trastes 0 al 12"
              startFret={0}
              endFret={12}
              fretLabelsAbove
              notes={[
                { fret: 0, string: 1, label: '' },
                { fret: 2, string: 1, label: '' },
                { fret: 4, string: 1, label: '' },
                { fret: 5, string: 1, label: '' },
                { fret: 7, string: 1, label: '' },
                { fret: 9, string: 1, label: '' },
                { fret: 10, string: 1, label: '' },
                { fret: 12, string: 1, label: '' },
              ]}
            />
          </div>
        </section>

        <section className="exercise-section" aria-labelledby="birthday-title">
          <div className="exercise-heading">
            <p className="lesson-kicker">Ejercicio 1</p>
            <h2 id="birthday-title">Cumpleaños feliz</h2>
            
          </div>

          <div className="player-frame">
            <AlphaTabPlayer compact layout="horizontal" minHeight={190} source="/tabs/cumpleanos-feliz-dos-compases.gp" title="Cumpleaños feliz" />
          </div>
              <p>
               Elegí estas canciones porque tarde o temprano se aprenden, son muy fáciles y ayudan a aprender.
              </p>
              <p>
               Parte del trabajo de un músico es tocar lo que piden los demás y lo mínimo que deberíamos sabernos son estas canciones.
              </p>
          <div className="extra-practice-link-wrap">
            <Link href="/lecciones/temario/tablaturas-dos-cuerdas" className="extra-practice-link">
              Feliz Navidad y más punteos cortos
            </Link>
            <a
              className="extra-practice-link"
              href="https://www.youtube.com/watch?v=BM09di1bJRc&list=PLPLmt3H5xszTeOdQyDUlMdWgCoI7lJ3rS&index=9"
              rel="noreferrer"
              target="_blank"
            >
              Hay que tener paciencia al empezar a tocar la guitarra
            </a>
          </div>
        </section>
      </article>

      <div className="lesson-pager-wrap">
        <TemarioPager previous={previous} next={next} />
      </div>

      <ReducedFretboardStyles />

      <style>{`
        .tablature-page {
          background: #ffffff;
          color: #080808;
          min-height: 100vh;
          overflow-x: clip;
          padding: clamp(28px, 5vw, 72px) clamp(20px, 7vw, 108px);
          width: 100%;
        }

        .tablature-content,
        .lesson-pager-wrap {
          margin: 0 auto;
          max-width: 1120px;
          min-width: 0;
          width: 100%;
        }

        .tablature-content {
          padding-bottom: clamp(34px, 6vw, 72px);
        }

        .lesson-kicker {
          color: #047857;
          font-size: 13px;
          font-weight: 950;
          letter-spacing: 0.22em;
          margin: 0 0 14px;
          text-transform: uppercase;
        }

        .tablature-header {
          margin: 0 auto clamp(46px, 8vw, 86px);
          max-width: 920px;
          text-align: center;
        }

        .tablature-header h1 {
          font-size: clamp(42px, 7vw, 86px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 0.95;
          margin: 0;
          max-width: 100%;
          overflow-wrap: break-word;
          text-transform: uppercase;
        }

        .tablature-header h1 span {
          display: block;
        }

        .tablature-header p:last-child,
        .frets-copy p,
        .exercise-heading p {
          color: #303030;
          font-size: 18px;
          line-height: 1.62;
          margin: 0 0 16px;
        }

        .tablature-header p:last-child {
          font-size: clamp(19px, 2vw, 27px);
          font-weight: 650;
          line-height: 1.42;
          margin: clamp(24px, 4vw, 36px) auto 0;
          max-width: 820px;
        }

        .frets-overview {
          display: grid;
          gap: clamp(20px, 3vw, 36px);
          grid-template-columns: minmax(0, 1fr);
        }

        .frets-copy {
          max-width: 840px;
          min-width: 0;
        }

        .frets-copy h2,
        .exercise-heading h2 {
          font-size: clamp(34px, 4.6vw, 58px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 0.98;
          margin: 0 0 14px;
          max-width: 100%;
          overflow-wrap: break-word;
        }

        .frets-copy strong {
          color: #047857;
          font-weight: 950;
        }

        .practice-note {
          border-left: 5px solid #047857;
          display: grid;
          gap: 8px;
          margin-top: 12px;
          max-width: 100%;
          min-width: 0;
          padding: 2px 0 2px 18px;
        }

        .practice-note strong {
          color: #080808;
          font-size: 16px;
          letter-spacing: 0.1em;
          overflow-wrap: anywhere;
          text-transform: uppercase;
        }

        .practice-note span {
          color: #303030;
          font-size: 18px;
          line-height: 1.5;
          overflow-wrap: anywhere;
        }

        .fretboard-diagram {
          margin: 0 auto;
          max-width: 1040px;
          min-width: 0;
          width: min(100%, 1040px);
        }

        .exercise-section {
          border-top: 1px solid #d4d4d8;
          margin-top: clamp(26px, 4vw, 46px);
          min-width: 0;
          padding-top: clamp(22px, 3vw, 36px);
        }

        .exercise-heading {
          margin: 0 auto clamp(14px, 2vw, 22px);
          max-width: 880px;
          text-align: center;
        }

        .exercise-heading h2 {
          text-transform: uppercase;
        }

        .player-frame {
          margin: 0 auto;
          max-width: 100%;
          min-width: 0;
          overflow-x: auto;
          overscroll-behavior-x: contain;
          padding-bottom: 6px;
          width: 100%;
        }

        .player-frame > div {
          min-width: min(100%, 980px);
        }

        .extra-practice-link-wrap {
          display: flex;
          flex-wrap: wrap;
          gap: 14px 24px;
          justify-content: center;
          margin-top: clamp(18px, 3vw, 34px);
          min-width: 0;
          width: 100%;
        }

        .extra-practice-link {
          color: #047857;
          font-size: 13px;
          font-weight: 950;
          letter-spacing: 0.14em;
          max-width: 100%;
          overflow-wrap: anywhere;
          text-align: center;
          text-decoration: none;
          text-transform: uppercase;
          transition: color 160ms ease;
        }

        .extra-practice-link:hover {
          color: #080808;
        }

        .alphatab-container {
          max-width: 100%;
          overflow-x: auto;
        }

        @media (max-width: 860px) {
          .tablature-header {
            text-align: left;
          }

          .frets-overview {
            grid-template-columns: 1fr;
          }

          .exercise-heading {
            text-align: left;
          }
        }

        @media (max-width: 700px) {
          .tablature-page {
            padding-left: 16px;
            padding-right: 16px;
          }

          .tablature-content,
          .lesson-pager-wrap {
            max-width: 100%;
          }

          .tablature-header h1 {
            font-size: clamp(28px, 8.5vw, 32px);
            line-height: 1.08;
          }

          .frets-copy h2,
          .exercise-heading h2 {
            font-size: clamp(30px, 11vw, 40px);
          }

          .practice-note {
            padding-left: 14px;
          }

          .practice-note strong {
            font-size: 12px;
            letter-spacing: 0.06em;
          }

          .open-fret {
            left: 2px;
            top: 40%;
            transform: none;
          }
        }

        @media (max-width: 520px) {
          .tablature-content,
          .lesson-pager-wrap {
            max-width: 320px;
          }
        }
      `}</style>
    </main>
  );
}
