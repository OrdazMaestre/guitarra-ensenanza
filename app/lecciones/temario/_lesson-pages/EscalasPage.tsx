import Image from 'next/image';
import Link from 'next/link';
import TemarioPager from '../TemarioPager';
import type { LessonPageProps } from './types';

export default function EscalasPage({ previous, next }: LessonPageProps) {
  return (
    <main className="scales-page">
      <article className="scales-content">
        <header className="scales-header">
          <p className="lesson-kicker">Teoria</p>
          <h1>
            <Link className="scales-title-link" href="/lecciones/temario/patrones-griegos">
              Escalas
            </Link>
          </h1>
          <div className="short-copy">
            <p>Una escala es un patron de tonos y semitonos.</p>
            <p>Un tono son dos semitonos.</p>
            <p>Un semitono es la distancia que hay entre los trastes de nuestra guitarra.</p>
          </div>
        </header>

        <section className="pattern-section" aria-labelledby="pattern-title">
          <header className="section-header">
            <p className="lesson-kicker">Do Mayor</p>
          </header>
          <Image
            className="scale-pattern-image"
            src="/images/figuras-acordes/patron-tonos-semitonos.svg"
            alt="Patron de tonos y semitonos de Do Mayor"
            width={700}
            height={127}
          />
          <div className="pattern-box">
            <strong>Escala Mayor:</strong>
            <span>
              1T, 1T, <em>T/2</em>, 1T, 1T, 1T, <em>T/2</em>
            </span>
          </div>
          <div className="pattern-box">
            <strong>Escala menor:</strong>
            <span>
              1T, <em>T/2</em>, 1T, 1T, <em>T/2</em>, 1T, 1T
            </span>
            <p>Igual que la escala Mayor pero empezando desde DOS NOTAS ANTES.</p>
            <p><strong>Do Mayor: C, D, E, F, G, A, B.</strong></p>
            <p><strong>La Menor: A, B, C, D, E, F, G.</strong></p>
            <p>Como usan las mismas notas, decimos que La menor es el RELATIVO MENOR de Do Mayor</p>
          </div>
        </section>

        <section className="question-box" aria-label="Alteraciones">
          <h2>¿Que notas hay entre medias?</h2>
          <p>Los cuadrados amarillos son las alteraciones.</p>
          <p>Las alteraciones son los bemoles (b) y los sostenidos (#).</p>
          <p>Bemol es la nota anterior - Sostenido es la nota siguiente.</p>
          <p>La nota entre Do y Re es Do# y Reb a la vez.</p>
        </section>

        <section className="g-major-box" aria-label="Por que usamos Sol Mayor">
          <h2>Do Mayor vs Sol Mayor</h2>
          <p>Do Mayor y La menor son las unicas escalas SIN alteraciones.</p>
          <p>Pero nuestra guitarra esta afinada en Mi estandar y no tenemos Do en las cuerdas al aire.</p>
          <p>Por eso usaremos mucho más la escala de Sol Mayor y Mi menor.</p>
          <p>Usan las mismas notas pero una da protagonismo a Sol y la otra a Mi.</p>
          <p>
            La unica alteracion de <strong>G Mayor</strong> y <strong>E menor</strong> es <strong>F#</strong>.
          </p>
        </section>

        <section className="memory-box" aria-label="Dato importante">
          <p>Datos para recordar:</p>
          <p>Hay 12 notas y tenemos 12 trastes.</p>
          <p>El traste 12 tiene las mismas notas que las cuerdas al aire.</p>
          <p>Solo suenan mas agudo.</p>
        </section>

        <section className="final-warning" aria-label="Aviso final del temario">
          <p>Ultima unidad del camino principal.</p>
          <p>Probablemente te dejaste atras ampliaciones de muchas unidades anteriores.</p>
          <p>Ahora estas mas preparado para volver a ellas.</p>
          <p>A partir de aqui toca investigar la web a tu ritmo.</p>
          <p>Entiende, asimila y practica poco a poco.</p>
          <p>Practica tempo con el metronomo.</p>
          <p>Hay enlaces secretos.</p>
          <p>Explora, aprende y diviertete.</p>
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

        .scales-title-link {
          color: inherit;
          display: inline-block;
          max-width: 100%;
          text-underline-offset: 0.12em;
          transition: color 180ms ease, text-decoration-color 180ms ease;
        }

        .scales-title-link:hover,
        .scales-title-link:focus-visible {
          text-decoration: underline;
        }

        .scales-title-link:focus-visible {
          outline: 3px solid #047857;
          outline-offset: 8px;
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
        .memory-box p,
        .final-warning p {
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

        .final-warning {
          background: #fef2f2;
          border: 4px solid #dc2626;
          border-radius: 10px;
          display: grid;
          gap: 10px;
          margin: 0 auto;
          max-width: 960px;
          padding: clamp(18px, 3vw, 28px);
          text-align: center;
          width: 100%;
        }

        .final-warning p {
          color: #991b1b;
          font-weight: 800;
        }

        .final-warning p:first-child {
          color: #dc2626;
          font-weight: 950;
          text-transform: uppercase;
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
          .memory-box,
          .final-warning {
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
