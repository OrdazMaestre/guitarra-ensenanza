import QuizDiagramView from '@/app/lecciones/temario/quiz/QuizDiagramView';
import type { RuntimeQuestion } from '@/app/lib/quiz/types';

interface SalaPreguntaAnfitrionProps {
  indice: number;
  pregunta: RuntimeQuestion;
  revelada: boolean;
  respondieron: number;
  totalJugadores: number;
  totalPreguntas: number;
}

// Solo lectura: el anfitrión ve la pregunta y el progreso, pero no contesta -- los controles de
// avance (Revelar/Siguiente/Terminar) los renderiza la pantalla que envuelve este componente.
export default function SalaPreguntaAnfitrion({ indice, pregunta, revelada, respondieron, totalJugadores, totalPreguntas }: SalaPreguntaAnfitrionProps) {
  return (
    <section className="quiz-question-card" aria-live="polite">
      <p className="quiz-progress">
        Pregunta {indice + 1} de {totalPreguntas} · {respondieron} de {totalJugadores} han contestado
      </p>
      <h2 className="quiz-enunciado">{pregunta.enunciado}</h2>

      {pregunta.diagrama ? (
        <div className="quiz-diagram-wrap">
          <QuizDiagramView diagram={pregunta.diagrama} />
        </div>
      ) : null}

      <div className="quiz-options">
        {pregunta.opciones.map((opcion) => (
          <div
            key={opcion.texto}
            className={`quiz-option${revelada && opcion.correcta ? ' quiz-option-correct' : ''}`}
          >
            {opcion.texto}
          </div>
        ))}
      </div>
    </section>
  );
}
