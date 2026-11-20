import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ReducedFretboardDiagram, ReducedFretboardStyles } from '../../../components/guitar/ReducedFretboardDiagram';
import SongTabPlayer from '../../../components/guitar/SongTabPlayer';
import TuningBoard, { TuningBoardStyles } from '../../../components/tuningGame/TuningBoard';
import SpotlightCorners from './SpotlightCorners';
import { TEST_ROOM_SONGS } from './songs';

// Perezosos (2026-11-20, rendimiento de compilación): ambos son componentes de prueba colapsados en
// <details>, ya 'use client' por su cuenta -- sin `ssr: false` porque esta página es un Server Component
// y esa opción solo es válida desde un Client Component.
const GamepadDetector = dynamic(() => import('../../../components/guitar/GamepadDetector'));
const KeyRolloverTester = dynamic(() => import('../../../components/guitar/KeyRolloverTester'));

export default function SalaDePruebasPage() {
  return (
    <main className="test-room-page">
      <SpotlightCorners />
      <header className="test-room-header">
        <p className="test-room-kicker">Zona aparte</p>
        <h1>Sala de pruebas</h1>
        <p>Aquí podrás ver un adelanto de lo que está por venir en la web.</p>
        <p>Es un espacio libre donde pruebo las ultimas novedades antes de sacarlas de aquí.</p>
        <p>Tienes varios instrumentos y un trozo de tablatura.</p>
      </header>

      <section className="test-room-instruments">
        <div className="test-room-fretboard">
          {/* JUGAR (en la barra del mástil) abre el juego tipo Rocksmith; el disco del panel elige
              la canción (TEST_ROOM_SONGS). */}
          <ReducedFretboardDiagram
            allowLeftHanded
            allowOverdrive
            allowTuning
            ariaLabel="Mástil de guitarra interactivo del 0 al 12"
            startFret={0}
            endFret={12}
            darkGameLook
            fretLabels
            instrumentChoice
            notes={[]}
            riffGame={{ songs: TEST_ROOM_SONGS, initialSong: 'black-gilmur' }}
            tutorial
          />
        </div>
      </section>

      <section className="test-room-tuning">
        <h2>APRENDIENDO A AFINAR CON EL OIDO</h2>
        <p className="test-room-kicker">Minijuego</p>
        <TuningBoard />
      </section>

      <section className="test-room-tab">
        {/* Misma lista de canciones; el disco, a la izquierda de su barra. */}
        <SongTabPlayer initialSong="black-gilmur" minHeight={240} songs={TEST_ROOM_SONGS} />
      </section>

      {/* Investigación (2026-11-13): guitarras de PC tipo Guitar Hero. Solo mira qué mueve cada mando. */}
      <details className="test-room-gamepad">
        <summary>Mandos y guitarras de PC (pruebas)</summary>
        <GamepadDetector />
      </details>

      {/* 2026-11-16: qué combinaciones de Z X C V B N (pads de la batería) recibe este teclado a la vez. */}
      <details className="test-room-rollover">
        <summary>Probador de teclas de la batería (pruebas)</summary>
        <KeyRolloverTester />
      </details>

      <Link href="/lecciones/temario/pasos" className="test-room-back">
        Volver a Pasos
      </Link>

      <ReducedFretboardStyles />
      <TuningBoardStyles />
      <style>{`
        .test-room-page {
          background: #ffffff;
          box-sizing: border-box;
          color: #080808;
          min-height: 100vh;
          overflow-x: clip;
          padding: clamp(28px, 5vw, 72px) clamp(20px, 7vw, 108px);
          position: relative;
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

        .test-room-gamepad,
        .test-room-rollover {
          margin: 24px auto 0;
          max-width: 760px;
          min-width: 0;
        }
        .test-room-gamepad summary,
        .test-room-rollover summary {
          cursor: pointer;
          font-weight: 900;
          margin-bottom: 8px;
        }
        .test-room-tuning {
          margin: 0 auto clamp(36px, 6vw, 64px);
          max-width: 1080px;
          min-width: 0;
          width: 100%;
        }

        .test-room-tuning h2 {
          font-size: clamp(24px, 3.4vw, 34px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 1.05;
          margin: 0;
        }

        .test-room-tuning .midi-instrument-host {
          margin-top: clamp(16px, 2.4vw, 24px);
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
