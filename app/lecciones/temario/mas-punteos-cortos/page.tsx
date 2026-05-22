import Link from 'next/link';

export default function MasPunteosCortosPage() {
  return (
    <main className="short-riffs-page">
      <section className="short-riffs-panel">
        <p className="lesson-kicker">Ampliacion</p>
        <h1>Mas punteos cortos con pocas cuerdas</h1>
        <p>
          Esta coleccion queda preparada para anadir ejercicios breves de una, dos y tres cuerdas sin mezclarla con el orden principal del temario.
        </p>
        <Link href="/lecciones/temario/tablaturas-dos-cuerdas">Volver a Feliz Navidad</Link>
      </section>

      <style>{`
        .short-riffs-page {
          align-items: center;
          background: #ffffff;
          box-sizing: border-box;
          color: #080808;
          display: grid;
          min-height: 100vh;
          overflow-x: clip;
          padding: clamp(28px, 5vw, 72px) clamp(16px, 7vw, 108px);
          width: 100%;
        }

        .short-riffs-panel {
          border-left: 5px solid #047857;
          box-sizing: border-box;
          margin: 0 auto;
          max-width: 780px;
          min-width: 0;
          padding-left: clamp(18px, 4vw, 34px);
          width: 100%;
        }

        .lesson-kicker {
          color: #047857;
          font-size: 13px;
          font-weight: 950;
          letter-spacing: 0.22em;
          margin: 0 0 14px;
          text-transform: uppercase;
        }

        .short-riffs-panel h1 {
          font-size: clamp(38px, 7vw, 82px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 0.95;
          margin: 0;
          overflow-wrap: break-word;
          text-transform: uppercase;
        }

        .short-riffs-panel p:last-of-type {
          color: #303030;
          font-size: clamp(18px, 2vw, 24px);
          font-weight: 650;
          line-height: 1.45;
          margin: clamp(22px, 4vw, 34px) 0;
        }

        .short-riffs-panel a {
          color: #047857;
          display: inline-flex;
          font-size: 14px;
          font-weight: 950;
          letter-spacing: 0.14em;
          max-width: 100%;
          overflow-wrap: anywhere;
          text-decoration: none;
          text-transform: uppercase;
        }

        .short-riffs-panel a:hover {
          color: #080808;
        }
      `}</style>
    </main>
  );
}
