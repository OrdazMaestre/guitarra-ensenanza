import Image from 'next/image';
import AlphaTabPlayer from '../../../components/guitar/AlphaTabPlayer';
import TemarioPager from '../TemarioPager';
import type { LessonPageProps } from './types';

export default function AmpliacionArpegiosPage({ previous, next }: LessonPageProps) {
  return (
    <main className="arpeggio-extension-page">
      <article className="arpeggio-extension-content">
        <header className="extension-header">
          <p className="lesson-kicker">Ampliacion</p>
          <h1>Arpegios</h1>
          <div className="short-copy">
            <p>En la pagina de arpegios practicamos una forma sencilla.</p>
            <p>Ahora vamos a completar el dibujo por el mastil.</p>
          </div>
        </header>

        <section className="rule-box" aria-label="Idea principal">
          <p>El arpegio de verdad consiste en tocar una a una todas las notas que forman parte del acorde.</p>
        </section>

        <section className="exercise-block" aria-labelledby="triad-title">
          <header className="exercise-header">
            <p className="lesson-kicker">Ejercicio 1</p>
            <h2 id="triad-title">Arpegios triada completos</h2>
            <p>Acorde de Sol mayor: G, B y D.</p>
          </header>
          <Image
            className="fretboard-image"
            src="/images/arpegios/arpegios-g-mastil.png"
            alt="Mastil del arpegio de Sol mayor"
            width={614}
            height={111}
          />
          <div className="compact-player-frame">
            <AlphaTabPlayer compact layout="horizontal" minHeight={190} source="/tabs/arpegios-g.gp" title="Arpegios G" />
          </div>
        </section>

        <section className="exercise-block" aria-labelledby="seventh-title">
          <header className="exercise-header">
            <p className="lesson-kicker">Ejercicio 2</p>
            <h2 id="seventh-title">Arpegios cuatriada con septima completos</h2>
            <p>Acorde de Sol mayor septima: G, B, D y F#.</p>
          </header>
          <Image
            className="fretboard-image"
            src="/images/arpegios/arpegios-g7-mastil.png"
            alt="Mastil del arpegio de Sol mayor septima"
            width={614}
            height={111}
          />
          <div className="compact-player-frame">
            <AlphaTabPlayer compact layout="horizontal" minHeight={190} source="/tabs/arpegios-g7.gp" title="Arpegios G7" />
          </div>
        </section>

        <section className="lesson-close" aria-label="Resumen">
          <p>Podemos empezar por la figura 5 y luego hacer 1, 2, 3 y 4.</p>
          <p>La idea es no tener que retroceder nunca en el mastil al pasar del 4 al 5.</p>
          <p>Escuchamos el color del acorde mientras cambiamos de zona.</p>
        </section>
      </article>

      <div className="lesson-pager-wrap">
        <TemarioPager previous={previous} next={next} />
      </div>

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
          margin: 0;
          overflow-wrap: break-word;
          text-transform: uppercase;
        }

        .short-copy {
          display: grid;
          gap: 10px;
          margin: clamp(22px, 4vw, 34px) auto 0;
          max-width: 760px;
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
          gap: clamp(18px, 3vw, 32px);
          min-width: 0;
          padding-top: clamp(24px, 4vw, 42px);
        }

        .fretboard-image {
          display: block;
          height: auto;
          margin: 0 auto;
          max-width: 100%;
          width: min(100%, 1040px);
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
          .extension-header,
          .exercise-header {
            text-align: left;
          }

          .rule-box {
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
