import Image from 'next/image';
import Link from 'next/link';
import { ReducedFretboardDiagram, ReducedFretboardStyles } from '../../../components/guitar/ReducedFretboardDiagram';
import TemarioPager from '../TemarioPager';
import type { LessonPageProps } from './types';

export default function ConceptosBasicosPage({ previous, next }: LessonPageProps) {
    return (
      <main className="lesson-white-page">
        <article className="lesson-content">
          <header className="lesson-header">
            <h1 className="lesson-title">¿Qué es la guitarra?</h1>
            <details className="music-toggle">
              <summary>¿Y la música?</summary>
              <div className="music-panel">
                <p className="music-lead">
                  Las notas musicales se producen al vibrar las cuerdas. </p>
              <p>Estas hacen vibrar el aire a su alrededor.</p>
              <p>Si la vibración es rápida, escuchamos un sonido agudo; </p>
              <p>si es lenta, escuchamos un sonido grave.
                </p>

                <div className="wave-comparison" aria-label="Comparación entre sonidos agudos y graves">
                  <figure className="wave-card">
                    <figcaption>
                      <strong>Agudo</strong>
                      <span>onda corta</span>
                    </figcaption>
                    <svg className="wave-figure" viewBox="0 0 320 92" role="img" aria-label="Onda corta de sonido agudo">
                      <line x1="10" y1="46" x2="310" y2="46" />
                      <path d="M10 46 C20 16 34 16 44 46 S68 76 78 46 S102 16 112 46 S136 76 146 46 S170 16 180 46 S204 76 214 46 S238 16 248 46 S272 76 282 46 S300 18 310 46" />
                    </svg>
                  </figure>

                  <figure className="wave-card">
                    <figcaption>
                      <strong>Grave</strong>
                      <span>onda larga</span>
                    </figcaption>
                    <svg className="wave-figure" viewBox="0 0 320 92" role="img" aria-label="Onda larga de sonido grave">
                      <line x1="10" y1="46" x2="310" y2="46" />
                      <path d="M10 46 C46 16 82 16 118 46 S190 76 226 46 S286 18 310 46" />
                    </svg>
                  </figure>
                </div>

                <p>
                  Las demás partes de la guitarra ayudan a mantener, modificar y amplificar esa vibración.
                </p>

                <Link href="/lecciones/temario/el-sonido-en-la-musica" className="music-more-link">
                  SABER MÁS
                </Link>
              </div>
            </details>
          </header>

          <section className="guitar-overview" aria-label="Esquema de la guitarra">
            {/* Provisional: imagen extraida del PDF de referencia; revisar copyright antes de publicacion final. */}
            <Image
              src="/images/guitar/guitar-parts.jpg"
              alt="Esquema de las partes principales de la guitarra"
              width={1033}
              height={1325}
              className="guitar-diagram"
              priority
            />
            <div className="overview-notes">
              <p>
                La guitarra es un instrumento de cuerda: </p>
              <p>el sonido nace en las cuerdas y el cuerpo lo amplifica.
              </p>
              <p>
                Con las clavijas afinamos las cuerdas, los trastes ordenan las notas y la caja amplifica el sonido.
              </p>
            </div>
          </section>

          <section className="mastil-section">
            <div className="mastil-copy">
              <p className="lesson-kicker">Lo importante</p>
              <h2>El mástil</h2>
              <p>
                Aquí colocamos la mano izquierda. </p>
              <p>Aquí están los trastes: </p>
              <p>los trastes son además los números que escribimos en las tablaturas </p>
              <p>indican qué traste hay que pisar con los dedos y en qué cuerda.
              </p>
              <p>
                La distancia entre los trastes 1-2 es medio tono. </p>
              <p>La distancia entre los trastes 1-3 es un tono entero.
              </p>
            </div>

            <div className="mastil-right">
              <Image
                src="/images/guitar/fretboard-parts.jpg"
                alt="Mástil de guitarra con trastes numerados"
                width={800}
                height={320}
                className="fretboard-image"
              />

              <div className="mastil-diagram">
                <ReducedFretboardDiagram
                  ariaLabel="Mástil de guitarra con los números de los trastes del 0 al 12"
                  startFret={0}
                  endFret={12}
                  fretLabels
                  notes={[]}
                />
              </div>
            </div>
          </section>
        </article>

        <div className="lesson-pager-wrap">
          <TemarioPager previous={previous} next={next} />
        </div>
        <ReducedFretboardStyles />
        <style>{`
          .lesson-white-page {
            background: #ffffff;
            color: #080808;
            margin: 0;
            max-width: 100%;
            min-height: 100vh;
            overflow-x: clip;
            padding: clamp(28px, 5vw, 72px) clamp(20px, 7vw, 108px);
            width: 100%;
          }

          .lesson-content {
            margin: 0 auto;
            max-width: 1120px;
            min-width: 0;
            width: 100%;
          }

          .lesson-header {
            text-align: center;
          }

          .lesson-kicker {
            color: #047857;
            font-size: 13px;
            font-weight: 950;
            letter-spacing: 0.22em;
            margin: 0 0 14px;
            text-transform: uppercase;
          }

          .lesson-title {
            font-size: clamp(38px, 6vw, 78px);
            font-weight: 950;
            letter-spacing: 0;
            line-height: 0.95;
            margin: 0;
          }

          .music-toggle {
            margin: clamp(22px, 4vw, 40px) auto 0;
            max-width: 900px;
            min-width: 0;
          }

          .music-toggle summary {
            align-items: center;
            border-bottom: 3px solid #34d399;
            color: #047857;
            cursor: pointer;
            display: inline-flex;
            font-size: clamp(24px, 3vw, 42px);
            font-weight: 950;
            justify-content: center;
            list-style: none;
            line-height: 1;
            padding-bottom: 5px;
          }

          .music-toggle summary::-webkit-details-marker {
            display: none;
          }

          .music-panel {
            border-bottom: 1px solid #cbd5e1;
            border-top: 1px solid #cbd5e1;
            display: grid;
            font-size: clamp(17px, 1.55vw, 21px);
            font-weight: 500;
            gap: clamp(22px, 3vw, 34px);
            line-height: 1.55;
            margin: clamp(22px, 4vw, 34px) auto 0;
            max-width: 880px;
            padding: clamp(22px, 4vw, 38px) 0;
            text-align: center;
          }

          .music-panel p {
            margin: 0 auto;
            max-width: 760px;
          }

          .music-lead {
            color: #18181b;
            font-weight: 760;
          }

          .music-more-link {
            color: #047857;
            display: inline-flex;
            font-size: 12px;
            font-weight: 950;
            justify-self: center;
            letter-spacing: 0.2em;
            line-height: 1;
            text-decoration: none;
            text-transform: uppercase;
          }

          .music-more-link:hover {
            color: #064e3b;
            text-decoration: underline;
            text-decoration-thickness: 0.12em;
            text-underline-offset: 0.24em;
          }

          .wave-comparison {
            align-items: stretch;
            display: grid;
            gap: clamp(16px, 3vw, 28px);
            grid-template-columns: repeat(2, minmax(0, 1fr));
            width: 100%;
          }

          .wave-card {
            border: 1px solid #d4d4d8;
            display: grid;
            gap: 14px;
            margin: 0;
            min-width: 0;
            padding: clamp(16px, 3vw, 24px);
            place-items: center;
            text-align: center;
          }

          .wave-card figcaption {
            display: grid;
            gap: 4px;
          }

          .wave-card strong {
            color: #047857;
            font-size: clamp(20px, 2vw, 28px);
            font-weight: 950;
          }

          .wave-card span {
            color: #52525b;
            font-size: 13px;
            font-weight: 900;
            letter-spacing: 0.16em;
            text-transform: uppercase;
          }

          .wave-figure {
            height: auto;
            max-width: 320px;
            overflow: visible;
            width: 100%;
          }

          .wave-figure line {
            stroke: #d4d4d8;
            stroke-width: 2;
          }

          .wave-figure path {
            fill: none;
            stroke: #111111;
            stroke-linecap: round;
            stroke-width: 7;
          }

          .guitar-overview {
            align-items: center;
            display: grid;
            gap: clamp(28px, 5vw, 72px);
            grid-template-columns: minmax(0, 0.78fr) minmax(0, 1fr);
            margin-top: clamp(36px, 7vw, 88px);
          }

          .guitar-diagram {
            height: auto;
            justify-self: center;
            max-height: 560px;
            object-fit: contain;
            width: min(100%, 460px);
          }

          .overview-notes {
            font-size: clamp(21px, 2vw, 30px);
            font-weight: 800;
            line-height: 1.28;
            max-width: 560px;
          }

          .overview-notes p {
            margin: 0 0 22px;
          }

          .mastil-section {
            align-items: start;
            display: grid;
            gap: 28px;
            grid-template-columns: minmax(0, 0.55fr) minmax(0, 1fr);
            margin-top: clamp(44px, 7vw, 92px);
          }

          .mastil-right {
            display: flex;
            flex-direction: column;
            gap: 16px;
            min-width: 0;
          }

          .mastil-copy h2 {
            font-size: clamp(40px, 5vw, 72px);
            font-weight: 950;
            letter-spacing: 0;
            line-height: 0.95;
            margin: 0 0 22px;
          }

          .mastil-copy p:not(.lesson-kicker) {
            color: #303030;
            font-size: 18px;
            line-height: 1.62;
            margin: 0 0 16px;
          }

          .fretboard-image {
            height: auto;
            width: 100%;
          }

          .mastil-diagram {
            max-width: 100%;
            min-width: 0;
          }

          .lesson-pager-wrap {
            margin: 0 auto;
            max-width: 1120px;
            min-width: 0;
            width: 100%;
          }

          @media (max-width: 820px) {
            .lesson-header {
              text-align: left;
            }

            .music-toggle {
              margin-left: 0;
              margin-right: 0;
            }

            .music-panel {
              text-align: left;
            }

            .music-more-link {
              justify-self: start;
            }

            .wave-comparison {
              grid-template-columns: 1fr;
            }

            .guitar-overview,
            .mastil-section {
              grid-template-columns: 1fr;
            }

            .overview-notes {
              font-size: 21px;
            }

            .mastil-section {
              margin-top: 56px;
            }
          }
        `}</style>
      </main>
    );
  }
