import Link from 'next/link';
import AlphaTabPlayer from '../../../components/guitar/AlphaTabPlayer';
import { ReducedFretboardDiagram, ReducedFretboardStyles } from '../../../components/guitar/ReducedFretboardDiagram';
import TemarioPager from '../TemarioPager';
import type { LessonPageProps } from './types';

export default function TablaturasDosCuerdasPage({ previous, next }: LessonPageProps) {
  return (
    <main className="two-strings-page">
      <article className="two-strings-content">
        <header className="two-strings-header">
          <p className="lesson-kicker">Ampliacion</p>
          <h2>
            <span>Leyendo tablaturas </span>
            <span>en dos cuerdas</span>
          </h2>
      
        </header>

        <section className="reading-section" aria-labelledby="reading-title">
          <div className="reading-copy">
            <p className="lesson-kicker">Ejercicio 2</p>
            <h2 id="reading-title">Feliz Navidad</h2>
            <p>
              En esta tablatura usamos dos cuerdas. Cuando los números cambian de línea, cambiamos de cuerda, pero seguimos leyendo de izquierda a derecha.
            </p>
          </div>

          <div className="practice-note">
            <strong>Punteo</strong>
            <span>
              Esta forma de tocar se llama punteo: una melodía de notas individuales, una detrás de otra.
            </span>
          </div>

          <div className="fretboard-diagram">
            <ReducedFretboardDiagram
              ariaLabel="Mástil con las notas de Feliz Navidad, cuerdas 1 y 2, trastes 0 al 5"
              startFret={0}
              endFret={5}
              fretLabelsAbove
              notes={[
                { fret: 0, string: 1, label: '' },
                { fret: 2, string: 1, label: '' },
                { fret: 3, string: 1, label: '' },
                { fret: 5, string: 1, label: '' },
                { fret: 0, string: 2, label: '' },
                { fret: 1, string: 2, label: '' },
                { fret: 3, string: 2, label: '' },
                { fret: 5, string: 2, label: '' },
              ]}
            />
          </div>

          <div className="player-frame">
            <AlphaTabPlayer source="/tabs/feliz-navidad.gp" title="Feliz Navidad" />
          </div>

          <div className="extra-practice-link-wrap">
            <Link href="/lecciones/temario/mas-punteos-cortos" className="extra-practice-link">
              Más punteos cortos con pocas cuerdas
            </Link>
          </div>
        </section>

        <section className="davie-section" aria-label="Video de bajo">
          <p className="davie-message">Aquí va una canción para Halloween.</p>
          <div className="video-wrap">
            <iframe
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              src="https://www.youtube.com/embed/VMycOhwjhQg"
              title="Bajo - Davie504"
            />
          </div>
        </section>
      </article>

      <div className="lesson-pager-wrap">
        <TemarioPager previous={previous} next={next} />
      </div>

      <ReducedFretboardStyles />

      <style>{`
        .two-strings-page {
          background: #ffffff;
          color: #080808;
          min-height: 100vh;
          overflow-x: clip;
          padding: clamp(28px, 5vw, 72px) clamp(20px, 7vw, 108px);
          width: 100%;
        }

        .two-strings-content,
        .lesson-pager-wrap {
          margin: 0 auto;
          max-width: 1120px;
          min-width: 0;
          width: 100%;
        }

        .two-strings-content {
          padding-bottom: clamp(34px, 6vw, 72px);
        }

        .lesson-kicker {
          color: #047857;
          font-size: 13px;
          font-weight: 950;
          letter-spacing: 0.22em;
          margin: 0 0 14px;
          text-transform: uppercase;
        }

        .two-strings-header {
          margin: 0 auto clamp(42px, 7vw, 80px);
          max-width: 980px;
          text-align: center;
        }

        .two-strings-header h2 {
          font-size: clamp(42px, 7vw, 86px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 0.95;
          margin: 0;
          max-width: 100%;
          overflow-wrap: break-word;
          text-transform: uppercase;
        }

        .two-strings-header h2 span {
          display: block;
        }

        .two-strings-header p:last-child,
        .reading-copy p {
          color: #303030;
          font-size: 18px;
          line-height: 1.62;
          margin: 0;
        }

        .two-strings-header p:last-child {
          font-size: clamp(19px, 2vw, 27px);
          font-weight: 650;
          line-height: 1.42;
          margin: clamp(24px, 4vw, 36px) auto 0;
          max-width: 840px;
        }

        .reading-section {
          display: grid;
          gap: clamp(20px, 3vw, 36px);
          min-width: 0;
        }

        .fretboard-diagram {
          margin: 0 auto;
          max-width: 680px;
          min-width: 0;
          width: 100%;
        }

        .reading-copy {
          margin: 0 auto;
          max-width: 880px;
          min-width: 0;
          text-align: center;
        }

        .reading-copy h2 {
          font-size: clamp(38px, 6vw, 72px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 0.98;
          margin: 0 0 14px;
          overflow-wrap: break-word;
          text-transform: uppercase;
        }

        .practice-note {
          border-left: 5px solid #047857;
          display: grid;
          gap: 8px;
          margin: 0 auto;
          max-width: 720px;
          min-width: 0;
          padding: 4px 0 4px 18px;
          width: 100%;
        }

        .practice-note strong {
          color: #080808;
          font-size: 16px;
          font-weight: 950;
          letter-spacing: 0.1em;
          overflow-wrap: anywhere;
          text-transform: uppercase;
        }

        .practice-note span {
          color: #303030;
          font-size: 18px;
          line-height: 1.5;
          overflow-wrap: anywhere;
        }

        .player-frame {
          margin: 0 auto;
          max-width: 100%;
          min-width: 0;
          overflow-x: auto;
          overscroll-behavior-x: contain;
          padding-bottom: 6px;
          width: 100%;
        }

        .player-frame > div {
          min-width: min(100%, 760px);
        }

        .alphatab-container {
          max-width: 100%;
          overflow-x: auto;
        }

        .extra-practice-link-wrap {
          display: flex;
          justify-content: center;
          margin-top: clamp(18px, 3vw, 34px);
          min-width: 0;
          width: 100%;
        }

        .extra-practice-link {
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

        .extra-practice-link:hover {
          color: #080808;
        }

        @media (max-width: 860px) {
          .two-strings-header,
          .reading-copy {
            text-align: left;
          }

          .practice-note {
            margin-left: 0;
          }
        }

        @media (max-width: 700px) {
          .two-strings-page {
            padding-left: 16px;
            padding-right: 16px;
          }

          .two-strings-header h2 {
            font-size: clamp(28px, 8.5vw, 32px);
            line-height: 1.08;
          }

          .reading-copy h2 {
            font-size: clamp(34px, 12vw, 44px);
          }

          .practice-note {
            padding-left: 14px;
          }

          .practice-note strong {
            font-size: 12px;
            letter-spacing: 0.06em;
          }
        }

        @media (max-width: 520px) {
          .two-strings-content,
          .lesson-pager-wrap {
            max-width: 320px;
          }
        }

        .davie-section {
          display: grid;
          gap: clamp(16px, 2.5vw, 24px);
          margin: clamp(24px, 4vw, 48px) auto 0;
          max-width: 720px;
          min-width: 0;
          width: 100%;
        }

        .davie-message {
          color: #303030;
          font-size: clamp(18px, 2vw, 24px);
          font-weight: 650;
          line-height: 1.42;
          margin: 0;
          overflow-wrap: anywhere;
          text-align: center;
        }

        .video-wrap {
          aspect-ratio: 16 / 9;
          border-radius: 10px;
          min-width: 0;
          overflow: hidden;
          width: 100%;
        }

        .video-wrap iframe {
          border: 0;
          display: block;
          height: 100%;
          width: 100%;
        }

        @media (max-width: 860px) {
          .davie-message {
            text-align: left;
          }
        }
      `}</style>
    </main>
  );
}
