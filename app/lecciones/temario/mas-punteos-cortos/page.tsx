import Link from 'next/link';
import AlphaTabPlayer from '../../../components/guitar/AlphaTabPlayer';

const shortRiffs = [
  {
    artist: 'Villancico tradicional',
    barWidth: 170,
    href: 'https://www.youtube.com/watch?v=V7nSKqfBk6k',
    minHeight: 250,
    source: '/tabs/carol-of-the-bells.gp',
    title: 'Carol of the Bells',
  },
  {
    artist: 'Mana',
    barWidth: 190,
    href: 'https://www.youtube.com/watch?v=teprNzF6J1I',
    minHeight: 250,
    source: '/tabs/mana.gp',
    title: 'En El Muelle de San Blas',
  },
  {
    artist: 'AC/DC',
    barWidth: 360,
    href: 'https://www.youtube.com/watch?v=v2AC41dglnM',
    minHeight: 280,
    source: '/tabs/thunderstruck.gp',
    title: 'Thunderstruck',
  },
  {
    artist: 'Red Hot Chili Peppers',
    barWidth: 300,
    href: 'https://www.youtube.com/watch?v=8DyziWtkfBw',
    minHeight: 270,
    source: '/tabs/red-hot-chili-peppers.gp',
    title: "Can't Stop (intro)",
  },
];

export default function MasPunteosCortosPage() {
  return (
    <main className="short-riffs-page">
      <article className="short-riffs-content">
        <header className="short-riffs-header">
          <p className="lesson-kicker">Ampliación</p>
          <h1>Más punteos cortos</h1>
          <div className="short-copy">
            <p>Cuatro melodías breves.</p>
            <p>Pocas cuerdas.</p>
            <p>Mucho control con la mano derecha.</p>
          </div>
        </header>

        <section className="practice-note" aria-label="Cómo practicar los punteos cortos">
          <p>Primero toca lento.</p>
          <p>Luego sube la velocidad poco a poco.</p>
          <p>Si nos equivocamos, volvemos un paso atrás.</p>
        </section>

        <section className="riff-list" aria-label="Punteos cortos con tablatura">
          {shortRiffs.map((riff) => (
            <article className="riff-card" key={riff.source}>
              <div className="riff-copy">
                <p className="riff-note">{riff.artist}</p>
                <h2>
                  <a href={riff.href} target="_blank" rel="noreferrer">
                    {riff.title}
                  </a>
                </h2>
              </div>

              <AlphaTabPlayer
                compact
                horizontalBarWidth={riff.barWidth}
                layout="horizontal"
                minHeight={riff.minHeight}
                source={riff.source}
                title={riff.title}
              />
            </article>
          ))}
        </section>

        <div className="back-link-wrap">
          <Link href="/lecciones/temario/tablaturas-dos-cuerdas" className="back-link">
            Volver a Feliz Navidad
          </Link>
        </div>
      </article>

      <style>{`
        .short-riffs-page {
          background: #ffffff;
          box-sizing: border-box;
          color: #080808;
          min-height: 100vh;
          overflow-x: clip;
          padding: clamp(64px, 8vw, 108px) clamp(16px, 6vw, 96px) clamp(34px, 5vw, 72px);
          width: 100%;
        }

        .short-riffs-content {
          box-sizing: border-box;
          display: grid;
          gap: clamp(28px, 5vw, 58px);
          margin: 0 auto;
          max-width: 1120px;
          min-width: 0;
          width: 100%;
        }

        .short-riffs-header {
          margin: 0 auto;
          max-width: 900px;
          min-width: 0;
          text-align: center;
        }

        .lesson-kicker,
        .riff-note {
          color: #047857;
          font-size: 13px;
          font-weight: 950;
          letter-spacing: 0.18em;
          margin: 0;
          text-transform: uppercase;
        }

        .short-riffs-header h1 {
          font-size: clamp(42px, 7vw, 92px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 0.94;
          margin: 12px 0 0;
          overflow-wrap: break-word;
          text-transform: uppercase;
        }

        .short-copy,
        .practice-note,
        .riff-copy div {
          display: grid;
          gap: 9px;
        }

        .short-copy {
          margin: clamp(20px, 4vw, 32px) auto 0;
          max-width: 720px;
        }

        .short-copy p,
        .practice-note p,
        .riff-copy p {
          color: #303030;
          font-size: clamp(18px, 2vw, 23px);
          font-weight: 650;
          line-height: 1.42;
          margin: 0;
          overflow-wrap: anywhere;
        }

        .practice-note {
          border-left: 5px solid #047857;
          margin: 0 auto;
          max-width: 760px;
          min-width: 0;
          padding: 5px 0 5px clamp(16px, 3vw, 24px);
          width: 100%;
        }

        .riff-list {
          display: grid;
          gap: clamp(24px, 4vw, 42px);
          min-width: 0;
        }

        .riff-card {
          border-top: 1px solid #d4d4d8;
          display: grid;
          gap: clamp(16px, 3vw, 26px);
          min-width: 0;
          padding-top: clamp(24px, 4vw, 38px);
        }

        .riff-copy {
          display: grid;
          gap: 10px;
          min-width: 0;
        }

        .riff-copy h2 {
          font-size: clamp(28px, 4vw, 52px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 1;
          margin: 0;
          overflow-wrap: anywhere;
          text-transform: uppercase;
        }

        .riff-copy h2 a {
          color: inherit;
          text-decoration-color: #047857;
          text-decoration-thickness: 3px;
          text-underline-offset: 6px;
        }

        .riff-copy h2 a:hover,
        .riff-copy h2 a:focus-visible {
          color: #047857;
        }

        .riff-copy h2 a:focus-visible {
          outline: 3px solid #047857;
          outline-offset: 4px;
        }

        .riff-copy .riff-note {
          color: #047857;
          font-size: 13px;
          letter-spacing: 0.18em;
        }

        .riff-card > div:not(.riff-copy) {
          max-width: 100%;
          min-width: 0;
        }

        .back-link-wrap {
          display: flex;
          justify-content: center;
          min-width: 0;
          width: 100%;
        }

        .back-link {
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

        .back-link:hover {
          color: #080808;
        }

        @media (max-width: 760px) {
          .short-riffs-header,
          .practice-note {
            text-align: left;
          }
        }

        @media (max-width: 520px) {
          .short-riffs-content {
            max-width: 320px;
          }

          .short-riffs-header h1 {
            font-size: clamp(34px, 12vw, 44px);
            line-height: 1.02;
          }
        }
      `}</style>
    </main>
  );
}
