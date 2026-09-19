interface QuizSpeedrunScreenProps {
  onRetry: () => void;
  score: number;
  totalSeconds: number;
}

function formatSeconds(seconds: number): string {
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return minutes > 0 ? `${minutes} min ${rest} s` : `${rest} s`;
}

// Se muestra en vez de QuizResults cuando se detecta "a boleo": la mitad o más de las preguntas
// contestadas en <=1s Y el resultado igual llega a bronce. Ni puntúa ni entra en el ranking a
// propósito -- ver QuizRunner.tsx (nunca se llama a QuizResults, que es quien manda el POST al
// ranking, así que no hace falta "bloquear" nada aquí, simplemente no se ofrece la opción).
export default function QuizSpeedrunScreen({ onRetry, score, totalSeconds }: QuizSpeedrunScreenProps) {
  return (
    <section className="quiz-speedrun" aria-live="polite">
      <p className="quiz-speedrun-message">¡Enhorabuena, te pasaste el juego! 👏😑</p>
      <p className="quiz-speedrun-score">{score} puntos</p>
      <p className="quiz-speedrun-time">{formatSeconds(totalSeconds)}</p>
      <div className="quiz-results-actions">
        <button type="button" className="quiz-next-button" onClick={onRetry}>
          Repetir este modo
        </button>
      </div>
    </section>
  );
}
