import Link from 'next/link';

interface QuizSpeedrunScreenProps {
  backHref?: string;
  onRetry: () => void;
}

// Se muestra en vez de QuizResults cuando se detecta "a boleo": la mitad o más de las preguntas
// contestadas en <=1s Y el resultado igual llega a bronce. Ni puntúa ni entra en el ranking a
// propósito -- ver QuizRunner.tsx (nunca se llama a QuizResults, que es quien manda el POST al
// ranking, así que no hace falta "bloquear" nada aquí, simplemente no se ofrece la opción).
export default function QuizSpeedrunScreen({ backHref, onRetry }: QuizSpeedrunScreenProps) {
  return (
    <section className="quiz-speedrun" aria-live="polite">
      <p className="quiz-speedrun-message">¡Enhorabuena, te pasaste el juego! 👏</p>
      <div className="quiz-results-actions">
        <button type="button" className="quiz-next-button" onClick={onRetry}>
          Repetir este modo
        </button>
        {backHref ? (
          <Link href={backHref} className="quiz-back-link">
            Volver a la leccion
          </Link>
        ) : null}
      </div>
    </section>
  );
}
