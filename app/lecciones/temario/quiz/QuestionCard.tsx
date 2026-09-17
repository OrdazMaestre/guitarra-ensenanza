import type { RuntimeQuestion } from '@/app/lib/quiz/types';
import QuizDiagramView from './QuizDiagramView';

interface QuestionCardProps {
  answered: { correcta: boolean; texto: string } | null;
  onAnswer: (optionIndex: number) => void;
  onNext: () => void;
  question: RuntimeQuestion;
  questionNumber: number;
  totalQuestions: number;
}

export default function QuestionCard({ answered, onAnswer, onNext, question, questionNumber, totalQuestions }: QuestionCardProps) {
  return (
    <section className="quiz-question-card" aria-live="polite">
      <p className="quiz-progress">
        Pregunta {questionNumber} de {totalQuestions}
      </p>
      <h2 className="quiz-enunciado">{question.enunciado}</h2>

      {question.diagrama ? (
        <div className="quiz-diagram-wrap">
          <QuizDiagramView diagram={question.diagrama} />
        </div>
      ) : null}

      <div className="quiz-options" role="group" aria-label="Opciones de respuesta">
        {question.opciones.map((opcion, index) => {
          const isSelected = answered?.texto === opcion.texto;
          const showCorrect = answered && opcion.correcta;
          const showWrong = answered && isSelected && !opcion.correcta;
          return (
            <button
              key={opcion.texto}
              type="button"
              className={`quiz-option${showCorrect ? ' quiz-option-correct' : ''}${showWrong ? ' quiz-option-wrong' : ''}`}
              disabled={!!answered}
              onClick={() => onAnswer(index)}
            >
              {opcion.texto}
            </button>
          );
        })}
      </div>

      {answered ? (
        <div className="quiz-feedback">
          <p className={answered.correcta ? 'quiz-feedback-ok' : 'quiz-feedback-bad'}>
            {answered.correcta ? '¡Bien hecho!' : 'Casi. Sigue intentando.'}
          </p>
          <button type="button" className="quiz-next-button" onClick={onNext}>
            {questionNumber >= totalQuestions ? 'Ver resultado' : 'Siguiente'}
          </button>
        </div>
      ) : null}
    </section>
  );
}
