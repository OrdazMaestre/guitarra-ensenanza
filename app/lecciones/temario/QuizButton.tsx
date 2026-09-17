import Link from 'next/link';

// Componente hermano de TemarioPager (no se integra dentro de él, para no tocar su contrato
// {previous, next} ni su spacing ya probado en ~25 páginas). `quizHref` ya viene resuelto por
// quien llama (el slug de la propia página, vía `[slug]/page.tsx` o el archivo suelto de la
// lección) -- si no hay quizHref no se renderiza nada, igual que TemarioPager cuando no tiene
// ni previous ni next.
export default function QuizButton({ quizHref }: { quizHref?: string }) {
  if (!quizHref) return null;

  return (
    <>
      <div className="quiz-button-wrap">
        <Link href={quizHref} className="quiz-button-link">
          QUIZ
        </Link>
      </div>
      <style>{`
        .quiz-button-wrap {
          display: flex;
          justify-content: center;
          margin-top: clamp(64px, 9vw, 96px);
          width: 100%;
        }

        .quiz-button-link {
          background: #047857;
          border: 2px solid #047857;
          border-radius: 8px;
          color: #ffffff;
          font-size: clamp(18px, 2.4vw, 24px);
          font-weight: 950;
          letter-spacing: 0.08em;
          padding: 14px 40px;
          text-decoration: none;
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
