import Link from 'next/link';
import SpotlightFlank from './SpotlightFlank';

// Componente hermano de TemarioPager (no se integra dentro de él, para no tocar su contrato
// {previous, next} ni su spacing ya probado en ~25 páginas). `quizHref` ya viene resuelto por
// quien llama (el slug de la propia página, vía `[slug]/page.tsx` o el archivo suelto de la
// lección) -- si no hay quizHref no se renderiza nada, igual que TemarioPager cuando no tiene
// ni previous ni next.
//
// Los focos flanqueantes viven en SpotlightFlank (compartido con el boton MULTIJUGADOR de
// QuizRunner.tsx) -- aqui solo queda el estilo propio del boton QUIZ y el margen superior que lo
// separa del contenido de la leccion (ese margen es especifico de esta pagina, por eso no vive en
// SpotlightFlank: el boton MULTIJUGADOR ya esta dentro de una tarjeta con su propio padding y no
// lo necesita).
export default function QuizButton({ quizHref }: { quizHref?: string }) {
  if (!quizHref) return null;

  return (
    <>
      <SpotlightFlank className="quiz-button-margin">
        <Link href={quizHref} className="quiz-button-link">
          QUIZ
        </Link>
      </SpotlightFlank>
      <style>{`
        .quiz-button-margin {
          margin-top: clamp(64px, 9vw, 96px);
        }

        .quiz-button-link {
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

        .quiz-button-link:hover,
        .quiz-button-link:focus-visible {
          background: #065f46;
          border-color: #065f46;
        }

        .quiz-button-link:focus-visible {
          outline: 3px solid #065f46;
          outline-offset: 4px;
        }
      `}</style>
    </>
  );
}
