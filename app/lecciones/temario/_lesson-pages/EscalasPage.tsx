import Image from 'next/image';
import TemarioPager from '../TemarioPager';
import type { LessonPageProps } from './types';

export default function EscalasPage({ previous, next }: LessonPageProps) {
  return (
    <main className="scales-page">
      <article className="scales-content">
        <header className="scales-header">
          <p className="lesson-kicker">Teoria</p>
          <h1>Escalas</h1>
          <div className="short-copy">
            <p>Una escala es un patron de tonos y semitonos.</p>
            <p>Un tono es como saltar dos medios pasos.</p>
            <p>Un semitono es el medio paso mas pequeno.</p>
          </div>
        </header>

        <section className="pattern-section" aria-labelledby="pattern-title">
          <header className="section-header">
            <p className="lesson-kicker">Do Mayor</p>
            <h2 id="pattern-title">Patron griego</h2>
            <p>Lo vemos primero en Do Mayor porque no usa alteraciones.</p>
          </header>
          <Image
            className="scale-pattern-image"
            src="/images/figuras-acordes/patron-tonos-semitonos.svg"
            alt="Patron de tonos y semitonos de Do Mayor"
            width={700}
            height={127}
          />
          <div className="pattern-box">
            <strong>Patron griego:</strong>
            <span>
              1T, 1T, <em>T/2</em>, 1T, 1T, 1T, <em>T/2</em>
            </span>
          </div>
        </section>

        <section className="question-box" aria-label="Alteraciones">
          <h2>¿Que notas hay entre medias?</h2>
          <p>Los cuadrados amarillos son las alteraciones.</p>
          <p>Las alteraciones son los bemoles (b) y los sostenidos (#).</p>
          <p>Bemol es la nota anterior.</p>
          <p>Sostenido es la nota siguiente.</p>
          <p>Entre Do y Re vive Do#.</p>
          <p>Tambien se puede llamar Reb.</p>
        </section>

        <section className="g-major-box" aria-label="Por que usamos Sol Mayor">
          <h2>Sol Mayor nos viene muy bien</h2>
          <p>Do Mayor y La menor son las unicas escalas sin alteraciones.</p>
          <p>Pero nuestra guitarra esta afinada en Mi estandar.</p>
          <p>Por eso usaremos mucho la escala de Sol Mayor.</p>
          <p>Sol Mayor se parece mucho a Mi menor.</p>
          <p>Y Mi menor aparece de forma muy facil en la guitarra.</p>
          <p>
            La unica alteracion de <strong>G Mayor</strong> y <strong>E menor</strong> es <strong>F#</strong>.
          </p>
        </section>

        <section className="memory-box" aria-label="Dato importante">
          <p>Dato para recordar:</p>
          <p>El traste 12 tiene las mismas notas que las cuerdas al aire.</p>
          <p>Solo suena mas agudo.</p>
        </section>
      </article>

      <div className="lesson-pager-wrap">
        <TemarioPager previous={previous} next={next} />
      </div>

      <style>{`
        .scales-page {
          background: #ffffff;
          box-sizing: border-box;
          color: #080808;
          min-height: 100vh;
          overflow-x: clip;
          padding: clamp(28px, 5vw, 72px) clamp(16px, 5vw, 84px);
          width: 100%;
        }

        .scales-content,
        .lesson-pager-wrap {
          box-sizing: border-box;
          margin: 0 auto;
          max-width: 1100px;
          min-width: 0;
          width: 100%;
        }

        .scales-content {
          display: grid;
          gap: clamp(34px, 6vw, 72px);
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

        .scales-header,
        .section-header {
          margin: 0 auto;
          max-width: 920px;
          text-align: center;
        }

        .scales-header h1 {
          font-size: clamp(54px, 8vw, 108px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 0.9;
          margin: 0;
          overflow-wrap: break-word;
          text-transform: uppercase;
        }

        .section-header h2,
        .question-box h2,
        .g-major-box h2 {
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
        .section-header p,
        .question-box p,
        .g-major-box p,
        .memory-box p {
          color: #303030;
          font-size: clamp(18px, 2vw, 24px);
          font-weight: 650;
          line-height: 1.42;
          margin: 0;
          overflow-wrap: anywhere;
        }

        .pattern-section {
          border-top: 1px solid #d4d4d8;
          display: grid;
          gap: clamp(20px, 3vw, 32px);
          min-width: 0;
          padding-top: clamp(24px, 4vw, 42px);
        }

        .scale-pattern-image {
          display: block;
          height: auto;
          margin: 0 auto;
          max-width: 100%;
          width: min(100%, 700px);
        }

        .pattern-box,
        .question-box,
        .g-major-box,
        .memory-box {
          border: 4px solid #2f65ad;
          border-radius: 10px;
          display: grid;
          gap: 12px;
          margin: 0 auto;
          max-width: 960px;
          padding: clamp(18px, 3vw, 28px);
          text-align: center;
          width: 100%;
        }

        .pattern-box {
          align-items: baseline;
          display: flex;
          flex-wrap: wrap;
          gap: 12px 18px;
          justify-content: center;
        }

        .pattern-box strong,
        .pattern-box span {
          color: #080808;
          font-size: clamp(22px, 3vw, 34px);
          font-weight: 950;
          line-height: 1.18;
        }

        .pattern-box em {
          color: #dc2626;
          font-style: normal;
        }

        .g-major-box {
          border-radius: 48px;
        }

        .g-major-box strong {
          color: #080808;
          font-weight: 950;
        }

        .memory-box {
          border-color: #047857;
        }

        .memory-box p:first-child {
          color: #080808;
          font-weight: 950;
          text-transform: uppercase;
        }

        @media (max-width: 760px) {
          .scales-header,
          .section-header,
          .question-box,
          .g-major-box,
          .memory-box {
            text-align: left;
          }

          .pattern-box {
            justify-content: flex-start;
          }

          .g-major-box {
            border-radius: 10px;
          }
        }

        @media (max-width: 520px) {
          .scales-content,
          .lesson-pager-wrap {
            max-width: 320px;
          }
        }
      `}</style>
    </main>
  );
}
