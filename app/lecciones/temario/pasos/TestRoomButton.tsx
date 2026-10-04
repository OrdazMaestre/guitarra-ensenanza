import Link from 'next/link';
import SpotlightFlank from '../SpotlightFlank';

// Hermano de QuizButton.tsx: mismo estilo de botón (.quiz-button-link) Y ahora también los mismos
// focos de SpotlightFlank (antes deliberadamente se omitían aquí -- a petición explícita del
// usuario, ahora SÍ se quieren). Vive en su propio archivo (en vez de inline en pasos/page.tsx)
// porque trae su propio bloque <style>, igual que QuizButton.
export default function TestRoomButton() {
  return (
    <>
      <SpotlightFlank className="test-room-button-wrap">
        <Link href="/lecciones/temario/sala-de-pruebas" className="test-room-button-link">
          SALA DE PRUEBAS
        </Link>
      </SpotlightFlank>
      <style>{`
        .test-room-button-wrap {
          margin-top: clamp(48px, 7vw, 72px);
        }

        .test-room-button-link {
          background: #047857;
          border: 2px solid #047857;
          border-radius: 8px;
          color: #ffffff;
          flex: 0 0 auto;
          font-size: clamp(18px, 2.4vw, 24px);
          font-weight: 950;
          letter-spacing: 0.08em;
          padding: 14px 40px;
          position: relative;
          text-decoration: none;
          z-index: 1;
        }

        .test-room-button-link:hover,
        .test-room-button-link:focus-visible {
          background: #065f46;
          border-color: #065f46;
        }

        .test-room-button-link:focus-visible {
          outline: 3px solid #065f46;
          outline-offset: 4px;
        }
      `}</style>
    </>
  );
}
