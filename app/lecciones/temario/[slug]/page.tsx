import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import TemarioPager from '../TemarioPager';
import { getLessonBySlug, getLessonNeighbors } from '../temarioData';

interface LessonBlockPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function LessonBlockPage({ params }: LessonBlockPageProps) {
  const { slug } = await params;
  const lesson = getLessonBySlug(slug);

  if (!lesson) {
    notFound();
  }

  const neighbors = getLessonNeighbors(slug);
  const previous = neighbors.previous
    ? {
        href: `/lecciones/temario/${neighbors.previous.slug}`,
        label: neighbors.previous.title,
      }
    : {
        href: '/lecciones/temario',
        label: 'Portada',
      };
  const next = neighbors.next
    ? {
        href: `/lecciones/temario/${neighbors.next.slug}`,
        label: neighbors.next.title,
      }
    : undefined;

  if (slug === 'conceptos-basicos') {
    return (
      <main className="lesson-white-page">
        <article className="lesson-content">
          <header className="lesson-header">
            <p className="lesson-kicker">Unidad 1</p>
            <h1 className="lesson-title">
              ¿Que es la guitarra?{' '}
              <details className="music-toggle">
                <summary>¿Y la musica?</summary>
                <div className="music-panel">
                  <p>
                    Las notas musicales se producen al vibrar las cuerdas. Las notas altas son agudas y vibran mas rapido; las notas bajas son graves y vibran mas despacio.
                  </p>
                  <div className="wave-row" aria-hidden="true">
                    <span>Agudo</span>
                    <i className="wave wave-tight" />
                    <span>Grave</span>
                    <i className="wave wave-wide" />
                  </div>
                  <p>
                    Las demas partes de la guitarra estan para mantener, modificar y amplificar esa vibracion: clavijas, trastes, cuerpo y boca trabajan alrededor de las cuerdas.
                  </p>
                </div>
              </details>
            </h1>
          </header>

          <section className="guitar-overview" aria-label="Esquema de la guitarra">
            <Image
              src="/images/guitar/guitar-parts.jpg"
              alt="Esquema de las partes principales de la guitarra"
              width={640}
              height={512}
              className="guitar-diagram"
              priority
            />
            <div className="overview-notes">
              <p>
                La guitarra es un instrumento de cuerda: el sonido nace en las cuerdas y el cuerpo lo amplifica.
              </p>
              <p>
                Las clavijas ayudan a afinar, los trastes ordenan las notas y la boca proyecta el sonido.
              </p>
            </div>
          </section>

          <section className="mastil-section">
            <div className="mastil-copy">
              <p className="lesson-kicker">Lo importante</p>
              <h2>El mastil</h2>
              <p>
                El mastil es la parte alargada donde colocamos la mano izquierda. En el estan los trastes: los numeros que escribimos en las tablaturas indican en que traste hay que pisar.
              </p>
              <p>
                Entre dos trastes consecutivos hay medio tono. Cuando avanzamos dos trastes, subimos un tono entero.
              </p>
            </div>

            <Image
              src="/images/guitar/fretboard-parts.jpg"
              alt="Mastil de guitarra con trastes numerados"
              width={800}
              height={320}
              className="fretboard-image"
            />
          </section>
        </article>

        <div className="lesson-pager-wrap">
          <TemarioPager previous={previous} next={next} />
        </div>
        <style>{`
          .lesson-white-page {
            background: #ffffff;
            color: #080808;
            margin: -2rem calc(50% - 50vw);
            min-height: 100vh;
            padding: clamp(28px, 5vw, 72px) clamp(20px, 7vw, 108px);
            width: 100vw;
          }

          .lesson-content {
            margin: 0 auto;
            max-width: 1120px;
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
            display: inline;
          }

          .music-toggle summary {
            color: #047857;
            cursor: pointer;
            display: inline;
            list-style: none;
            text-decoration: underline;
            text-decoration-color: #34d399;
            text-decoration-thickness: 0.07em;
            text-underline-offset: 0.09em;
          }

          .music-toggle summary::-webkit-details-marker {
            display: none;
          }

          .music-panel {
            font-size: clamp(17px, 1.55vw, 21px);
            font-weight: 500;
            line-height: 1.55;
            margin: 26px auto 0;
            max-width: 850px;
            text-align: left;
          }

          .wave-row {
            align-items: center;
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            margin: 14px 0;
          }

          .wave-row span {
            font-weight: 900;
          }

          .wave {
            background: repeating-radial-gradient(ellipse at center, transparent 0 9px, #9ca3af 10px 11px, transparent 12px 20px);
            display: inline-block;
            height: 24px;
            opacity: 0.75;
            width: 92px;
          }

          .wave-wide {
            width: 132px;
          }

          .guitar-overview {
            align-items: center;
            display: grid;
            gap: clamp(28px, 5vw, 72px);
            grid-template-columns: minmax(260px, 0.78fr) minmax(260px, 1fr);
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
            align-items: end;
            display: grid;
            gap: 28px;
            grid-template-columns: 0.55fr 1fr;
            margin-top: clamp(44px, 7vw, 92px);
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

          .lesson-pager-wrap {
            margin: 0 auto;
            max-width: 1120px;
          }

          @media (max-width: 820px) {
            .lesson-header {
              text-align: left;
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

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/lecciones/temario" className="text-sm font-semibold text-emerald-300 hover:text-emerald-200">
        Volver a la portada
      </Link>

      <section className="mt-8 border border-zinc-700 bg-zinc-900 px-6 py-8 shadow-xl sm:px-10">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-zinc-500">
          Bloque del temario
        </p>
        <h1 className="mt-4 text-4xl font-black text-zinc-50">{lesson.title}</h1>
        <p className="mt-4 text-lg leading-8 text-zinc-300">
          Esta pagina queda preparada para escribir la leccion real cuando empecemos a desarrollar este bloque.
        </p>
      </section>

      <TemarioPager previous={previous} next={next} />
    </main>
  );
}
