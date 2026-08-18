import type { CSSProperties } from 'react';
import Link from 'next/link';
import AlphaTabPlayer from '../../../components/guitar/AlphaTabPlayer';
import TemarioPager from '../TemarioPager';
import type { LessonPageProps } from './types';

type SongPart = {
  chords: string[][];
  intro?: string[];
  kicker: string;
  redSeparatorAfter?: Array<{
    index: number;
    row: number;
  }>;
  secretLinkAfter?: Array<{
    href: string;
    index: number;
    row: number;
  }>;
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
    secretLinkAfter: [{ href: '/lecciones/prueba', index: 2, row: 1 }],
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
    intro: ['Siempre acabamos con los mismos 4 acordes.', 'El final queda mejor con este pequeño punteo entre los últimos 2 acordes.'],
    kicker: 'Final correcto',
    redSeparatorAfter: [{ index: 2, row: 0 }],
    source: '/tabs/let-it-be-final-correcto.gp',
    title: 'Final',
  },
];

function ChordPattern({
  redSeparatorAfter = [],
  rows,
  secretLinkAfter = [],
}: {
  redSeparatorAfter?: SongPart['redSeparatorAfter'];
  rows: string[][];
  secretLinkAfter?: SongPart['secretLinkAfter'];
}) {
  return (
    <div className="chord-pattern" aria-label="Patrón de acordes">
      {rows.map((row, rowIndex) => (
        <div className="chord-row" key={`row-${rowIndex}`} style={{ '--chord-count': row.length } as CSSProperties}>
          {row.map((chord, index) => {
            const isRedSeparator = redSeparatorAfter.some((separator) => separator.row === rowIndex && separator.index === index);
            const secretLink = secretLinkAfter.find((separator) => separator.row === rowIndex && separator.index === index);
            const separator = (
              <i aria-hidden="true" className={isRedSeparator ? 'is-red-separator' : undefined}>
                |
              </i>
            );

            return (
              <span className="chord-cell" key={`${rowIndex}-${chord}-${index}`}>
                <strong>{chord}</strong>
                {index < row.length - 1 ? (
                  secretLink ? (
                    <Link aria-label="Abrir canción de prueba" className="secret-separator-link" href={secretLink.href} prefetch={false}>
                      {separator}
                    </Link>
                  ) : (
                    separator
                  )
                ) : null}
              </span>
            );
          })}
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
          <h1>Let It Be</h1>
          <div className="short-copy">
            <p>Una canción a base de acordes puede leerse de las dos maneras que vemos abajo.</p>
            <p>Puedes usar la flecha atrás de la esquina para consultar los acordes.</p>
            <p>Al final del todo hay enlaces a la canción y a la versión con guitarra.</p>
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

            <ChordPattern redSeparatorAfter={part.redSeparatorAfter} rows={part.chords} secretLinkAfter={part.secretLinkAfter} />

            <div className="compact-player-frame">
              <AlphaTabPlayer compact initialSpeed={1.35} layout="horizontal" minHeight={190} source={part.source} title={part.title} />
            </div>
          </section>
        ))}

        <section className="lesson-close" aria-label="Resumen">
          <p>Estamos aprendiendo a mezclar acordes y punteo.</p>
          <p>Después del segundo estribillo hay un solo de guitarra.</p>
          <p>Otra guitarra hace un punteo muy chulo acompañando a la voz durante el último estribillo.</p>
          <a href="https://www.youtube.com/watch?v=BTDLIG0RbMQ" target="_blank" rel="noreferrer">
            CANCIÓN COMPLETA
          </a>
        </section>

        <section className="lesson-close" aria-label="Resumen">
          <p>En las siguientes páginas aprenderemos a hacer esos arreglos poco a poco.</p>
          <a href="https://www.youtube.com/watch?v=E1qyF7KqTao&list=PLPLmt3H5xszTeOdQyDUlMdWgCoI7lJ3rS&index=4" target="_blank" rel="noreferrer">
            TUTORIAL COMPLETO CON GUITARRA
          </a>
          <a href="https://www.youtube.com/watch?v=y9rxnsSQB6s" target="_blank" rel="noreferrer">
            VERSIÓN MUY PRO FREESTYLE + FINGERSTYLE
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
          max-width: 100%;
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
          max-width: 100%;
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
          max-width: 100%;
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
          grid-template-columns: repeat(var(--chord-count), minmax(0, 1fr));
          max-width: 980px;
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

        .chord-cell i.is-red-separator {
          color: #dc2626;
        }

        .song-page .chord-cell .secret-separator-link,
        .song-page .chord-cell .secret-separator-link:visited,
        .song-page .chord-cell .secret-separator-link:hover,
        .song-page .chord-cell .secret-separator-link:active,
        .song-page .chord-cell .secret-separator-link:focus,
        .song-page .chord-cell .secret-separator-link:focus-visible {
          animation: none !important;
          color: inherit !important;
          cursor: default;
          display: contents !important;
          max-width: none;
          outline: none !important;
          text-decoration: none !important;
          text-decoration-color: transparent !important;
          text-decoration-thickness: 0 !important;
          text-underline-offset: 0 !important;
          transform: none !important;
          transition: none !important;
          will-change: auto !important;
          -webkit-tap-highlight-color: transparent;
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
          margin: 0;
          max-width: 100%;
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
