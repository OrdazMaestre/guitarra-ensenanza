import Image from 'next/image';
import Link from 'next/link';
import { lessonBlocks } from './temarioData';

export default function TemarioPage() {
  return (
    <main className="cover-page">
      <section className="cover-stage">
        <div className="cover-copy">
          <div className="cover-copy-inner">
            <p className="cover-eyebrow">
              Guitarra desde cero
            </p>
            <h1 className="cover-title">
              Primeros{' '}
              <Link
                href="/lecciones/temario/pasos"
                className="cover-title-link"
              >
                PASOS
              </Link>
              <span className="cover-title-line">
                con mi guitarra
              </span>
            </h1>
            <p className="cover-author">por: Enrique Ordaz</p>
            <p className="cover-intro">
              Un recorrido visual y practico con explicaciones sencillas de entender, ejercicios cortos y</p><p className="cover-intro">posibilidad (sin obligación) de profundizar en contenidos.
            </p>
          </div>
        </div>

        <div className="cover-image-wrap">
          <Image
            src="/images/guitar/cover-pencil-guitar.jpg"
            alt="Guitarra acustica dibujada a lapiz"
            width={520}
            height={940}
            priority
            className="cover-image"
          />
        </div>

        <nav
          aria-label="Bloques del temario"
          className="cover-nav"
        >
          <span className="cover-nav-label">Unidades:</span>
          <div className="cover-nav-list">
            {lessonBlocks.map((lesson) => (
              <Link
                key={lesson.slug}
                href={`/lecciones/temario/${lesson.slug}`}
                title={lesson.title}
                className="cover-nav-link"
              >
                {lesson.number}
              </Link>
            ))}
          </div>
        </nav>
      </section>
      <style>{`
        .cover-page {
          background: #ffffff;
          color: #080808;
          margin: 0;
          max-width: 100%;
          min-height: 100vh;
          overflow: hidden;
          width: 100%;
        }

        .cover-stage {
          background: #ffffff;
          min-height: 100vh;
          padding: clamp(32px, 6vh, 78px) clamp(24px, 6vw, 96px) 96px;
          position: relative;
        }

        .cover-copy {
          align-items: center;
          display: flex;
          min-height: calc(100vh - 160px);
          position: relative;
          z-index: 2;
        }

        .cover-copy-inner {
          max-width: 620px;
        }

        .cover-eyebrow {
          font-size: clamp(14px, 1.25vw, 20px);
          font-weight: 700;
          letter-spacing: 0.36em;
          margin: 0 0 32px;
          text-transform: uppercase;
        }

        .cover-title {
          font-size: clamp(54px, 7.4vw, 116px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 0.92;
          margin: 0;
        }

        .cover-title-link {
          color: #047857;
          text-decoration-color: #34d399;
          text-decoration-thickness: 0.07em;
          text-underline-offset: 0.09em;
        }

        .cover-title-link:hover {
          color: #064e3b;
        }

        .cover-title-line {
          display: block;
          font-size: clamp(42px, 5vw, 78px);
          font-weight: 760;
          line-height: 1;
          margin-top: 8px;
        }

        .cover-author {
          color: #047857;
          font-size: clamp(17px, 1.8vw, 28px);
          font-weight: 950;
          letter-spacing: 0.18em;
          line-height: 1.25;
          margin: 28px 0 0;
          max-width: 100%;
          overflow-wrap: anywhere;
          text-transform: uppercase;
        }

        .cover-intro {
          color: #2f2f2f;
          font-size: clamp(18px, 1.5vw, 24px);
          line-height: 1.55;
          margin: 36px 0 0;
          max-width: 720px;
        }

        .cover-image-wrap {
          bottom: 82px;
          display: flex;
          justify-content: flex-end;
          pointer-events: none;
          position: absolute;
          right: clamp(28px, 8vw, 132px);
          top: 36px;
          width: min(42vw, 560px);
          z-index: 1;
        }

        .cover-image {
          height: 100%;
          max-height: calc(100vh - 130px);
          object-fit: contain;
          object-position: center right;
          width: auto;
        }

        .cover-nav {
          align-items: center;
          background: rgba(255, 255, 255, 0.94);
          border-top: 1px solid #d4d4d4;
          bottom: 0;
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          left: 0;
          min-height: 72px;
          padding: 12px 20px;
          position: absolute;
          right: 0;
          z-index: 4;
        }

        .cover-nav-label {
          color: #111111;
          font-size: 14px;
          font-weight: 900;
          letter-spacing: 0.14em;
          margin-right: 16px;
          text-transform: uppercase;
        }

        .cover-nav-list {
          display: flex;
          flex-wrap: nowrap;
          gap: clamp(8px, 1.2vw, 16px);
          justify-content: center;
        }

        .cover-nav-link {
          align-items: center;
          background: #ffffff;
          border: 1px solid #111111;
          color: #111111;
          display: flex;
          font-size: 18px;
          font-weight: 800;
          height: 42px;
          justify-content: center;
          line-height: 1;
          text-decoration: none;
          transition: background 160ms ease, color 160ms ease, transform 160ms ease;
          width: 42px;
        }

        .cover-nav-link:hover {
          background: #111111;
          color: #ffffff;
          transform: translateY(-2px);
        }

        @media (max-width: 980px) {
          .cover-stage {
            padding-left: clamp(22px, 7vw, 72px);
            padding-right: clamp(22px, 7vw, 72px);
          }

          .cover-copy {
            align-items: flex-start;
            padding-top: clamp(56px, 10vh, 120px);
          }

          .cover-image-wrap {
            bottom: 84px;
            opacity: 0.34;
            right: -8vw;
            top: 74px;
            width: min(72vw, 540px);
          }

          .cover-copy-inner {
            max-width: 720px;
          }
        }

        @media (max-width: 620px) {
          .cover-stage {
            padding-bottom: 92px;
          }

          .cover-copy {
            min-height: calc(100vh - 124px);
            padding-top: 40px;
          }

          .cover-eyebrow {
            letter-spacing: 0.24em;
            margin-bottom: 24px;
          }

          .cover-title {
            font-size: clamp(44px, 16vw, 76px);
          }

          .cover-title-line {
            font-size: clamp(34px, 11vw, 54px);
          }

          .cover-intro {
            font-size: 18px;
            line-height: 1.48;
            margin-top: 28px;
          }

          .cover-author {
            font-size: 16px;
            letter-spacing: 0.12em;
            margin-top: 22px;
          }

          .cover-image-wrap {
            opacity: 0.23;
            right: -22vw;
            top: 96px;
            width: 96vw;
          }

          .cover-nav {
            min-height: 68px;
            padding-left: 12px;
            padding-right: 12px;
          }

          .cover-nav-label {
            flex-basis: 100%;
            margin: 0 0 8px;
            text-align: center;
          }

          .cover-nav-list {
            gap: 7px;
          }

          .cover-nav-link {
            height: 38px;
            width: 38px;
          }
        }
      `}</style>
    </main>
  );
}
