import AlphaTabPlayer from '../../../components/guitar/AlphaTabPlayer';
import TemarioPager from '../TemarioPager';
import type { LessonPageProps } from './types';

type SongPart = {
  chords: string[][];
  intro?: string[];
  kicker: string;
  source: string;
  title: string;
};

const songParts: SongPart[] = [
  {
    chords: [
      ['C', 'G', 'Am', 'F'],
      ['C', 'G', 'F', 'C'],
    ],
    kicker: 'Introduccion + versos',
    source: '/tabs/let-it-be-verso.gp',
    title: 'Versos',
  },
  {
    chords: [
      ['Am', 'G', 'F', 'C'],
      ['C', 'G', 'F', 'C'],
    ],
    kicker: 'Estribillos',
    source: '/tabs/let-it-be-estribillo.gp',
    title: 'Estribillo',
  },
  {
    chords: [['C', 'G', 'F', 'C']],
    intro: ['Siempre acabamos con los mismos 4 acordes.', 'El final queda mejor con este pequeno punteo.'],
    kicker: 'Final correcto',
    source: '/tabs/let-it-be-final-correcto.gp',
    title: 'Final',
  },
];

function ChordPattern({ rows }: { rows: string[][] }) {
  return (
    <div className="chord-pattern" aria-label="Patron de acordes">
      {rows.map((row, rowIndex) => (
        <div className="chord-row" key={`row-${rowIndex}`}>
          {row.map((chord, index) => (
            <span className="chord-cell" key={`${rowIndex}-${chord}-${index}`}>
              <strong>{chord}</strong>
              {index < row.length - 1 ? <i aria-hidden="true">|</i> : null}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function LetItBeConAcordesPage({ previous, next }: LessonPageProps) {
  return (
    <main className="song-page">
      <article className="song-content">
        <header className="song-header">
          <p className="lesson-kicker">Unidad 7</p>
          <h1>Let It Be</h1>
          <div className="short-copy">
            <p>Vamos a tocar con acordes.</p>
            <p>Luego mezclaremos acordes y punteo.</p>
          </div>
        </header>

        {songParts.map((part) => (
          <section className="song-part" aria-labelledby={`${part.title}-title`} key={part.title}>
            <header className="song-part-header">
              <p className="lesson-kicker">{part.kicker}</p>
              <h2 id={`${part.title}-title`}>{part.title}</h2>
              {part.intro ? (
                <div className="part-note">
                  {part.intro.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              ) : null}
            </header>

            <ChordPattern rows={part.chords} />

            <div className="compact-player-frame">
              <AlphaTabPlayer compact layout="horizontal" minHeight={190} source={part.source} title={part.title} />
            </div>
          </section>
        ))}

        <section className="lesson-close" aria-label="Resumen">
          <p>Estamos aprendiendo a mezclar acordes y punteo.</p>
          <p>Despues del segundo estribillo hay un solo de guitarra.</p>
          <p>Y durante el último estribillo hay un punteo muy chulo que acompaña a la voz.</p>
          <p>En las siguientes paginas lo aprenderemos poco a poco.</p>
          <a href="https://www.youtube.com/watch?v=BTDLIG0RbMQ" target="_blank" rel="noreferrer">
            CANCION COMPLETA
          </a>
        </section>
      </article>

      <div className="lesson-pager-wrap">
        <TemarioPager previous={previous} next={next} />
      </div>

      <style>{`
        .song-page {
          background: #ffffff;
          box-sizing: border-box;
          color: #080808;
          min-height: 100vh;
          overflow-x: clip;
          padding: clamp(28px, 5vw, 72px) clamp(16px, 5vw, 84px);
          width: 100%;
        }

        .song-content,
        .lesson-pager-wrap {
          box-sizing: border-box;
          margin: 0 auto;
          max-width: 1220px;
          min-width: 0;
          width: 100%;
        }

        .song-content {
          display: grid;
          gap: clamp(38px, 7vw, 88px);
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

        .song-header {
          margin: 0 auto;
          max-width: 900px;
          text-align: center;
        }

        .song-header h1 {
          font-size: clamp(54px, 8vw, 108px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 0.9;
          margin: 0;
          overflow-wrap: break-word;
          text-transform: uppercase;
        }

        .short-copy {
          display: grid;
          gap: 10px;
          margin: clamp(22px, 4vw, 34px) auto 0;
          max-width: 720px;
        }

        .short-copy p,
        .part-note p,
        .lesson-close p {
          color: #303030;
          font-size: clamp(18px, 2vw, 24px);
          font-weight: 650;
          line-height: 1.42;
          margin: 0;
          overflow-wrap: anywhere;
        }

        .song-part {
          border-top: 1px solid #d4d4d8;
          display: grid;
          gap: clamp(18px, 3vw, 34px);
          min-height: min(760px, calc(100vh - 42px));
          min-width: 0;
          padding-top: clamp(26px, 4vw, 44px);
        }

        .song-part-header {
          text-align: center;
        }

        .song-part-header h2 {
          font-size: clamp(34px, 5vw, 70px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 0.98;
          margin: 0;
          overflow-wrap: break-word;
          text-transform: uppercase;
        }

        .part-note {
          display: grid;
          gap: 8px;
          margin: 16px auto 0;
          max-width: 760px;
        }

        .chord-pattern {
          display: grid;
          gap: clamp(14px, 2.4vw, 28px);
          justify-items: center;
          min-width: 0;
          width: 100%;
        }

        .chord-row {
          display: grid;
          gap: clamp(12px, 2.8vw, 34px);
          grid-template-columns: repeat(4, minmax(0, 1fr));
          max-width: 860px;
          min-width: 0;
          width: 100%;
        }

        .chord-cell {
          align-items: center;
          display: grid;
          gap: clamp(10px, 2vw, 26px);
          grid-template-columns: minmax(0, 1fr) auto;
          min-width: 0;
        }

        .chord-cell:last-child {
          grid-template-columns: minmax(0, 1fr);
        }

        .chord-cell strong {
          color: #080808;
          font-family: Georgia, 'Times New Roman', serif;
          font-size: clamp(44px, 7vw, 88px);
          font-weight: 500;
          line-height: 0.95;
          text-align: center;
        }

        .chord-cell i {
          color: #047857;
          font-family: Georgia, 'Times New Roman', serif;
          font-size: clamp(42px, 6vw, 72px);
          font-style: normal;
          line-height: 1;
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

        .lesson-close a {
          color: #047857;
          display: inline-flex;
          font-size: 13px;
          font-weight: 950;
          letter-spacing: 0.16em;
          margin-top: 10px;
          max-width: 100%;
          overflow-wrap: anywhere;
          text-decoration: none;
          text-transform: uppercase;
          width: fit-content;
        }

        .lesson-close a:hover {
          color: #080808;
        }

        @media (max-width: 760px) {
          .song-header,
          .song-part-header {
            text-align: left;
          }

          .song-part {
            min-height: auto;
          }

          .chord-row {
            gap: 12px;
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .chord-cell:nth-child(2) {
            grid-template-columns: minmax(0, 1fr);
          }

          .chord-cell:nth-child(2) i {
            display: none;
          }
        }

        @media (max-width: 520px) {
          .song-content,
          .lesson-pager-wrap {
            max-width: 320px;
          }

          .chord-cell strong {
            font-size: clamp(40px, 17vw, 60px);
          }
        }
      `}</style>
    </main>
  );
}
