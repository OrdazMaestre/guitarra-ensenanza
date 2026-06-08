import Link from 'next/link';

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
            <figcaption>Suma de ondas sinusoidales</figcaption>
            <svg viewBox="0 0 720 360" role="img" aria-label="Tres ondas sinusoidales se suman para formar una onda compleja">
              <line className="axis" x1="52" y1="82" x2="668" y2="82" />
              <path className="wave wave-one" d="M52 82 C92 32 132 32 172 82 S252 132 292 82 S372 32 412 82 S492 132 532 82 S628 32 668 82" />
              <text x="52" y="40">onda principal</text>

              <line className="axis" x1="52" y1="156" x2="668" y2="156" />
              <path className="wave wave-two" d="M52 156 C72 126 92 126 112 156 S152 186 172 156 S212 126 232 156 S272 186 292 156 S332 126 352 156 S392 186 412 156 S452 126 472 156 S512 186 532 156 S568 126 588 156 S648 126 668 156" />
              <text x="52" y="122">otra onda</text>

              <line className="axis" x1="52" y1="230" x2="668" y2="230" />
              <path className="wave wave-three" d="M52 230 C65 210 78 210 91 230 S117 250 130 230 S156 210 169 230 S195 250 208 230 S234 210 247 230 S273 250 286 230 S312 210 325 230 S351 250 364 230 S390 210 403 230 S429 250 442 230 S468 210 481 230 S507 250 520 230 S546 210 559 230 S585 250 598 230 S642 210 668 230" />
              <text x="52" y="196">otra onda</text>

              <line className="axis axis-final" x1="52" y1="304" x2="668" y2="304" />
              <path className="wave wave-sum" d="M52 304 L74 246 L96 276 L118 234 L145 330 L169 350 L206 304 L228 246 L250 276 L272 234 L299 330 L323 350 L360 304 L382 246 L404 276 L426 234 L453 330 L477 350 L514 304 L536 246 L558 276 L580 234 L607 330 L631 350 L668 304" />
              <text x="52" y="276">sonido complejo</text>
            </svg>
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
            <figcaption>Serie armónica de una frecuencia fundamental</figcaption>
            <svg viewBox="0 0 720 360" role="img" aria-label="Serie armónica con frecuencia fundamental y armónicos superiores">
              <line className="spectrum-axis" x1="64" y1="286" x2="656" y2="286" />
              <g className="partials">
                <line x1="98" y1="94" x2="98" y2="286" />
                <line x1="196" y1="142" x2="196" y2="286" />
                <line x1="294" y1="178" x2="294" y2="286" />
                <line x1="392" y1="204" x2="392" y2="286" />
                <line x1="490" y1="226" x2="490" y2="286" />
                <line x1="588" y1="242" x2="588" y2="286" />
              </g>
              <g className="partial-dots">
                <circle cx="98" cy="94" r="9" />
                <circle cx="196" cy="142" r="8" />
                <circle cx="294" cy="178" r="7" />
                <circle cx="392" cy="204" r="6" />
                <circle cx="490" cy="226" r="5" />
                <circle cx="588" cy="242" r="5" />
              </g>
              <g className="partial-labels">
                <text x="98" y="318">f</text>
                <text x="196" y="318">2f</text>
                <text x="294" y="318">3f</text>
                <text x="392" y="318">4f</text>
                <text x="490" y="318">5f</text>
                <text x="588" y="318">6f</text>
              </g>
              <text className="fundamental-label" x="98" y="62">fundamental</text>
              <text className="harmonic-label" x="310" y="62">armónicos</text>
            </svg>
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

        .axis,
        .spectrum-axis {
          stroke: #d4d4d8;
          stroke-width: 2;
        }

        .axis-final {
          stroke: #a1a1aa;
        }

        .wave {
          fill: none;
          stroke-linecap: round;
        }

        .wave-one {
          stroke: #047857;
          stroke-width: 5;
        }

        .wave-two,
        .wave-three {
          stroke: #71717a;
          stroke-width: 4;
        }

        .wave-sum {
          stroke: #111111;
          stroke-linejoin: round;
          stroke-width: 7;
        }

        .partials line {
          stroke: #111111;
          stroke-linecap: round;
          stroke-width: 8;
        }

        .partial-dots circle {
          fill: #047857;
        }

        .partial-labels text {
          fill: #111111;
          font-size: 22px;
          font-weight: 950;
          text-anchor: middle;
        }

        .fundamental-label,
        .harmonic-label {
          fill: #047857;
          font-size: 18px;
          font-weight: 950;
          text-anchor: middle;
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
