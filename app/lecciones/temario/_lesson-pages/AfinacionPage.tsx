import Image from 'next/image';
import TemarioPager from '../TemarioPager';
import type { LessonPageProps } from './types';

export default function AfinacionPage({ previous, next }: LessonPageProps) {
    const strings = [
      ['6', 'E', 'Mi grave'],
      ['5', 'A', 'La'],
      ['4', 'D', 'Re'],
      ['3', 'G', 'Sol'],
      ['2', 'B', 'Si'],
      ['1', 'E', 'Mi agudo'],
    ];

    const tuningSteps = [
      ['E', '+5 semitonos', 'A'],
      ['A', '+5 semitonos', 'D'],
      ['D', '+5 semitonos', 'G'],
      ['G', '+4 semitonos', 'B'],
      ['B', '+5 semitonos', 'E'],
    ];

    return (
      <main className="tuning-page">
        <article className="tuning-content">
          <header className="tuning-header">
            <h1>Aprendiendo a afinar</h1>
            <p>
              Ajustamos la tensión de las cuerdas hasta que suene en la nota correcta. </p> 
              <p>Pulsamos una cuerda, escuchamos, giramos su clavija y volvemos a escuchar.
            </p>
          </header>

          <section className="tuning-overview">
            <div className="tuning-copy">
              <p className="lesson-kicker">Afinación estándar</p>
              <h2>La guitarra empieza y termina en <strong>Mi (E)</strong></h2>
              <p>
                Decimos que la guitarra está <strong>afinada en Mi (E)</strong> porque la <strong>primera y última cuerda</strong> son <strong>Mi (E)</strong>. Una suena grave y la otra aguda.
              </p>
              
            </div>

            <figure className="headstock-figure">
              {/* Provisional: imagen extraida del PDF de referencia; revisar copyright antes de publicacion final. */}
              <Image
                src="/images/guitar/tuning-headstock.jpg"
                alt="Clavijero de guitarra con afinación estándar E A D G B E"
                width={245}
                height={252}
                className="headstock-image"
              />
              <figcaption>E A D G B E</figcaption>
            </figure>
            
          </section>

          <section className="string-section" aria-labelledby="strings-title">
            <p className="lesson-kicker">Cuerdas al aire</p>
            <h2 id="strings-title">De grave a agudo</h2>
            <div className="string-grid">
              {strings.map(([number, note, name]) => (
                <div className="string-card" key={number}>
                  <span className="string-number">Cuerda {number}</span>
                  <strong>{note}</strong>
                  <span>{name}</span>
                </div>
              ))}
            </div>
            
          </section>

          <section className="interval-section" aria-labelledby="interval-title">
            <div className="interval-copy">
              <p className="lesson-kicker">Distancias</p>
              <h2 id="interval-title">5 semitonos casi siempre entre una cuerda y la siguiente </h2>
              <p>
                </p> <p>La excepción está entre <strong>G</strong> y <strong>B</strong>, donde hay 4 semitonos.
              </p>
              <p>
                Es la afinación más habitual, por eso se llama &quot;afinación estándar&quot;. </p><p>Aprenderemos por qué más adelante.
           </p>
            </div>

            <div className="interval-row" aria-label="Distancias entre cuerdas de la afinación estándar">
              {tuningSteps.map(([from, distance, to]) => (
                <div
                  className={`interval-step${distance.startsWith('+4') ? ' interval-step-exception' : ''}`}
                  key={`${from}-${to}`}
                >
                  <strong>{from}</strong>
                  <span className="interval-move">
                    <b>{distance}</b>
                    <i aria-hidden="true">→</i>
                  </span>
                  <strong>{to}</strong>
                </div>
              ))}
            </div>
          </section>
        </article>

        <div className="lesson-pager-wrap">
          <TemarioPager previous={previous} next={next} />
        </div>

        <style>{`
          .tuning-page {
            background: #ffffff;
            color: #080808;
            min-height: 100vh;
            overflow-x: clip;
            padding: clamp(28px, 5vw, 72px) clamp(20px, 7vw, 108px);
            width: 100%;
          }

          .tuning-content,
          .lesson-pager-wrap {
            margin: 0 auto;
            max-width: 1120px;
            min-width: 0;
            width: 100%;
          }

          .tuning-content {
            padding-bottom: clamp(28px, 5vw, 64px);
          }

          .lesson-kicker {
            color: #047857;
            font-size: 13px;
            font-weight: 950;
            letter-spacing: 0.22em;
            margin: 0 0 14px;
            text-transform: uppercase;
          }

          .tuning-header {
            margin: 0 auto clamp(46px, 8vw, 94px);
            max-width: 900px;
            text-align: center;
          }

          .tuning-header h1 {
            font-size: clamp(44px, 7vw, 92px);
            font-weight: 950;
            letter-spacing: 0;
            line-height: 0.95;
            margin: 0;
          }

          .tuning-header p,
          .tuning-copy p,
          .interval-copy p {
            color: #303030;
            font-size: 18px;
            line-height: 1.62;
            margin: 0 0 16px;
          }

          .tuning-header p {
            font-size: clamp(19px, 2vw, 27px);
            font-weight: 650;
            line-height: 1.42;
            margin: clamp(24px, 4vw, 36px) auto 0;
            max-width: 800px;
          }

          .tuning-overview {
            align-items: center;
            display: grid;
            gap: clamp(28px, 5vw, 72px);
            grid-template-columns: minmax(0, 1fr) minmax(220px, 0.52fr);
          }

          .tuning-copy h2,
          .string-section h2,
          .interval-copy h2 {
            font-size: clamp(34px, 5vw, 68px);
            font-weight: 950;
            letter-spacing: 0;
            line-height: 0.98;
            margin: 0 0 20px;
          }

          .tuning-copy strong,
          .interval-copy strong {
            color: #047857;
            font-weight: 950;
          }

          .headstock-figure {
            display: grid;
            justify-items: center;
            margin: 0;
            min-width: 0;
          }

          .headstock-image {
            height: auto;
            max-width: min(100%, 360px);
            width: 100%;
          }

          .headstock-figure figcaption {
            color: #047857;
            font-size: 13px;
            font-weight: 950;
            letter-spacing: 0.24em;
            margin-top: 14px;
          }

          .string-section,
          .interval-section {
            border-top: 1px solid #d4d4d8;
            margin-top: clamp(52px, 9vw, 108px);
            padding-top: clamp(34px, 6vw, 64px);
          }

          .string-section {
            text-align: center;
          }

          .string-grid {
            display: grid;
            gap: 12px;
            grid-template-columns: repeat(6, minmax(0, 1fr));
            margin-top: 28px;
          }

          .string-card {
            border: 1px solid #d4d4d8;
            display: grid;
            gap: 8px;
            min-width: 0;
            padding: 18px 10px;
            place-items: center;
          }

          .string-number,
          .string-card span:last-child {
            color: #52525b;
            font-size: 12px;
            font-weight: 900;
            letter-spacing: 0.12em;
            text-transform: uppercase;
          }

          .string-card strong {
            color: #047857;
            font-size: clamp(34px, 5vw, 58px);
            font-weight: 950;
            line-height: 1;
          }

          .interval-section {
            display: grid;
            gap: clamp(28px, 5vw, 56px);
            grid-template-columns: minmax(0, 0.62fr) minmax(0, 1fr);
          }

          .interval-row {
            display: grid;
            gap: 12px;
          }

          .interval-step {
            align-items: center;
            border: 3px solid #d4d4d8;
            display: grid;
            gap: 12px;
            grid-template-columns: 64px minmax(0, 1fr) 64px;
            min-width: 0;
            padding: 14px 18px;
          }

          .interval-step strong {
            color: #111111;
            font-size: clamp(30px, 4vw, 42px);
            font-weight: 950;
            line-height: 1;
            text-align: center;
          }

          .interval-move {
            align-items: center;
            color: #047857;
            display: grid;
            gap: 2px;
            justify-items: center;
            min-width: 0;
          }

          .interval-move b {
            font-size: 13px;
            font-weight: 950;
            letter-spacing: 0.16em;
            text-align: center;
            text-transform: uppercase;
          }

          .interval-step-exception .interval-move b {
            color: #065f46;
            font-size: 15px;
          }

          .interval-move i {
            color: #047857;
            font-size: clamp(30px, 5vw, 54px);
            font-style: normal;
            font-weight: 950;
            line-height: 0.85;
          }

          @media (max-width: 820px) {
            .tuning-header,
            .string-section {
              text-align: left;
            }

            .tuning-overview,
            .interval-section {
              grid-template-columns: 1fr;
            }

            .headstock-figure {
              justify-items: start;
            }

            .string-grid {
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }
          }

          @media (max-width: 420px) {
            .string-grid {
              grid-template-columns: 1fr;
            }

            .interval-step {
              grid-template-columns: 44px minmax(0, 1fr) 44px;
              padding-left: 10px;
              padding-right: 10px;
            }

            .interval-move b {
              font-size: 11px;
              letter-spacing: 0.1em;
            }
          }
        `}</style>
      </main>
    );
  }
