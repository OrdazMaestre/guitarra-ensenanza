import Link from 'next/link';
import { ReducedFretboardDiagram, ReducedFretboardStyles } from '../../../components/guitar/ReducedFretboardDiagram';
import MiniKeyboard from '../../../components/guitar/MiniKeyboard';
import AlphaTabPlayer from '../../../components/guitar/AlphaTabPlayer';

export default function SalaDePruebasPage() {
  return (
    <main className="test-room-page">
      <header className="test-room-header">
        <p className="test-room-kicker">Zona aparte</p>
        <h1>Sala de pruebas</h1>
        <p>Aquí no hay lección.</p>
        <p>Es un espacio libre para probar cosas.</p>
        <p>Tienes un mástil, un teclado y un trozo de tablatura.</p>
      </header>

      <section className="test-room-instruments">
        <div className="test-room-fretboard">
          <ReducedFretboardDiagram
            ariaLabel="Mástil de guitarra interactivo del 0 al 12"
            startFret={0}
            endFret={12}
            fretLabels
            notes={[]}
          />
        </div>

        <MiniKeyboard className="test-room-keyboard" />
      </section>

      <section className="test-room-tab">
        <AlphaTabPlayer source="/tabs/prueba-master-of-puppets.gp" multiTrack layout="horizontal" />
      </section>

      <Link href="/lecciones/temario/pasos" className="test-room-back">
        Volver a Pasos
      </Link>

      <ReducedFretboardStyles />
      <style>{`
        .test-room-page {
          background: #ffffff;
          box-sizing: border-box;
          color: #080808;
          min-height: 100vh;
          overflow-x: clip;
          padding: clamp(28px, 5vw, 72px) clamp(20px, 7vw, 108px);
          width: 100%;
        }

        .test-room-header {
          margin: 0 auto clamp(36px, 6vw, 64px);
          max-width: 900px;
          min-width: 0;
        }

        .test-room-kicker {
          color: #047857;
          font-size: 13px;
          font-weight: 950;
          letter-spacing: 0.2em;
          margin: 0 0 14px;
          text-transform: uppercase;
        }

        .test-room-header h1 {
          font-size: clamp(38px, 6vw, 68px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 0.98;
          margin: 0;
        }

        .test-room-header p:not(.test-room-kicker) {
          color: #303030;
          font-size: clamp(18px, 2vw, 22px);
          font-weight: 600;
          line-height: 1.5;
          margin: 12px 0 0;
        }

        .test-room-instruments {
          display: grid;
          gap: clamp(28px, 5vw, 56px);
          margin: 0 auto clamp(36px, 6vw, 64px);
          max-width: 1080px;
          min-width: 0;
          width: 100%;
        }

        .test-room-fretboard {
          min-width: 0;
        }

        .test-room-tab {
          margin: 0 auto clamp(36px, 6vw, 64px);
          max-width: 1080px;
          min-width: 0;
          width: 100%;
        }

        .test-room-back {
          display: inline-block;
          font-size: 16px;
          font-weight: 800;
          margin: 0 auto;
          max-width: 1080px;
          width: 100%;
        }
      `}</style>
    </main>
  );
}
