import Link from 'next/link';
import FourierWave from './FourierWave';
import StringHarmonics from './StringHarmonics';

export default function SoundInMusicPage() {
  return (
    <main className="sound-page">
      <article className="sound-content">
        <Link href="/lecciones/temario/conceptos-basicos" className="back-link">
          Volver a conceptos básicos
        </Link>

        <header className="sound-header">
          <p className="sound-kicker">Saber más</p>
          <h1>El sonido en la música</h1>
        </header>

        <section className="sound-block">
          <div className="sound-copy">
            <p className="sound-kicker">Idea 1</p>
            <h2>Sonidos complejos</h2>
            <p>
              Casi nunca escuchamos el sonido como una onda perfecta (como en la página anterior), a menos que lo fabriquemos con tecnología, como el ordenador.
            </p>
            <p>
              Los sonidos complejos son lo que escuchamos siempre: una onda &quot;imperfecta&quot; que, por dentro, mezcla varias ondas perfectas.
            </p>
            <p>
              La onda principal nos da la altura de la nota, y las ondas más pequeñas que se suman encima son las responsables de que cada cosa tenga un &quot;sonido propio&quot;.
            </p>
          </div>

          <figure className="sound-figure complex-wave">
            <figcaption>Construcción de una onda cuadrada</figcaption>
            <FourierWave />
          </figure>
        </section>

        <section className="sound-block sound-block-reverse">
          <div className="sound-copy">
            <p className="sound-kicker">Idea 2</p>
            <h2>La serie armónica ordena esas ondas</h2>
            <p>
              Si una nota tiene una frecuencia fundamental, también aparecen vibraciones relacionadas: el doble, el triple, el cuádruple...
            </p>
            <p>
              No todas suenan igual de fuertes y eso hace que cada instrumento suene como suene, porque combinan sus armónicos de formas distintas.
            </p>
          </div>

          <figure className="sound-figure harmonics">
            <figcaption>Serie armónica de una cuerda vibrante</figcaption>
            <StringHarmonics />
          </figure>
        </section>

        <section className="sound-summary">
          <h2>¿Y la guitarra?</h2>
          <p>
            Cuando tocamos una cuerda, no solo importa qué nota pulsamos.
          </p>
          <p>
            También influye con qué fuerza, cómo vibra la guitarra junto a las cuerdas, la forma de la caja, cómo dejamos sonar o apagamos la cuerda... incluso el tipo de madera y tipo de cuerdas. Cada pieza de la guitarra influye en cómo vibra y el sonido que terminará sacando.
          </p>
        </section>

        <section className="sound-video" aria-labelledby="sound-video-title">
          
          <a href="https://www.youtube.com/watch?v=xcHbm0vXFFE" rel="noreferrer" target="_blank">
            Vídeo sobre sonido en música
          </a>
        </section>
      </article>

      <style>{`
        .sound-page {
          background: #ffffff;
          color: #080808;
          min-height: 100vh;
          overflow-x: clip;
          padding: clamp(28px, 5vw, 72px) clamp(20px, 7vw, 108px);
          width: 100%;
        }

        .sound-content {
          margin: 0 auto;
          max-width: 1120px;
          min-width: 0;
          width: 100%;
        }

        .back-link,
        .sound-kicker {
          color: #047857;
          font-size: 13px;
          font-weight: 950;
          letter-spacing: 0.2em;
          text-transform: uppercase;
        }

        .back-link {
          display: inline-flex;
          margin-bottom: clamp(34px, 6vw, 72px);
          text-decoration: none;
        }

        .back-link:hover {
          color: #064e3b;
          text-decoration: underline;
          text-underline-offset: 0.24em;
        }

        .sound-header {
          margin: 0 auto clamp(44px, 8vw, 92px);
          max-width: 900px;
          text-align: center;
        }

        .sound-kicker {
          margin: 0 0 14px;
        }

        .sound-header h1 {
          font-size: clamp(42px, 7vw, 92px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 0.95;
          margin: 0;
        }

        .sound-header p {
          color: #303030;
          font-size: clamp(19px, 2vw, 27px);
          font-weight: 650;
          line-height: 1.42;
          margin: 14px auto 0;
          max-width: 820px;
        }

        .sound-header h1 + p {
          margin-top: clamp(24px, 4vw, 36px);
        }

        .sound-block {
          align-items: center;
          display: grid;
          gap: clamp(28px, 5vw, 64px);
          grid-template-columns: minmax(0, 0.74fr) minmax(0, 1fr);
          margin-top: clamp(44px, 8vw, 92px);
        }

        .sound-block-reverse {
          grid-template-columns: minmax(0, 1fr) minmax(0, 0.74fr);
        }

        .sound-block-reverse .sound-copy {
          order: 2;
        }

        .sound-copy {
          display: grid;
          gap: 16px;
          min-width: 0;
        }

        .sound-copy h2,
        .sound-summary h2 {
          font-size: clamp(32px, 4vw, 58px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 1;
          margin: 0 0 4px;
        }

        .sound-copy p:not(.sound-kicker),
        .sound-summary p {
          color: #303030;
          font-size: 18px;
          line-height: 1.62;
          margin: 0;
        }

        .sound-figure {
          border: 1px solid #d4d4d8;
          margin: 0;
          min-width: 0;
          padding: clamp(16px, 3vw, 28px);
        }

        .sound-figure figcaption {
          color: #18181b;
          font-size: 14px;
          font-weight: 950;
          letter-spacing: 0.16em;
          margin-bottom: 16px;
          text-align: center;
          text-transform: uppercase;
        }

        .sound-figure svg {
          display: block;
          height: auto;
          width: 100%;
        }

        .sound-figure text {
          fill: #52525b;
          font-size: 18px;
          font-weight: 800;
        }


        .sound-summary,
        .sound-video {
          border-top: 1px solid #d4d4d8;
          margin-top: clamp(56px, 9vw, 108px);
          padding-top: clamp(28px, 5vw, 48px);
          text-align: center;
        }

        .sound-summary p {
          margin: 14px auto 0;
          max-width: 760px;
        }

        .sound-video {
          display: grid;
          gap: 18px;
          justify-items: center;
        }

        .sound-video h2 {
          font-size: clamp(32px, 4vw, 58px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 1;
          margin: 0;
        }

        .sound-video a {
          color: #080808;
          font-size: clamp(20px, 2.4vw, 30px);
          font-weight: 950;
          line-height: 1.16;
          max-width: 100%;
          overflow-wrap: anywhere;
          text-decoration-color: #047857;
          text-decoration-thickness: 3px;
          text-underline-offset: 6px;
        }

        .sound-video a:hover,
        .sound-video a:focus-visible {
          color: #047857;
        }

        .sound-video a:focus-visible {
          outline: 3px solid #047857;
          outline-offset: 4px;
        }

        @media (max-width: 820px) {
          .sound-header {
            text-align: left;
          }

          .sound-block,
          .sound-block-reverse {
            grid-template-columns: 1fr;
          }

          .sound-block-reverse .sound-copy {
            order: 0;
          }

          .sound-summary,
          .sound-video {
            text-align: left;
          }

          .sound-video {
            justify-items: start;
          }
        }
      `}</style>
    </main>
  );
}
