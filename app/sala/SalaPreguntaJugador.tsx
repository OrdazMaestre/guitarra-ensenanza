import QuizDiagramView from '@/app/lecciones/temario/quiz/QuizDiagramView';
import type { RuntimeQuestion } from '@/app/lib/quiz/types';
import SalaJugadoresLive, { SalaJugadoresLiveStyles } from './SalaJugadoresLive';
import type { SalaJugadorEstado } from './useSalaEstado';

interface MiRespuesta {
  correcta: boolean;
  opcionIndex: number;
  puntos: number;
}

interface SalaPreguntaJugadorProps {
  indice: number;
  jugadoresEstado: SalaJugadorEstado[];
  miRespuesta: MiRespuesta | null;
  onAnswer: (opcionIndex: number) => void;
  pregunta: RuntimeQuestion;
  revelada: boolean;
  totalPreguntas: number;
}

// La respuesta correcta/incorrecta de las opciones solo se colorea cuando `revelada` es true (el
// anfitrión decide ese momento) -- aunque el jugador ya sepa si acertó desde que respondió
// (miRespuesta.correcta llega en la respuesta del servidor), enseñarlo antes le quitaria la
// gracia al momento de "revelar" compartido con el resto de la sala.
export default function SalaPreguntaJugador({ indice, jugadoresEstado, miRespuesta, onAnswer, pregunta, revelada, totalPreguntas }: SalaPreguntaJugadorProps) {
  return (
    <section className="quiz-question-card" aria-live="polite">
      <p className="quiz-progress">Pregunta {indice + 1} de {totalPreguntas}</p>
      <h2 className="quiz-enunciado">{pregunta.enunciado}</h2>

      {pregunta.diagrama ? (
        <div className="quiz-diagram-wrap">
          <QuizDiagramView diagram={pregunta.diagrama} />
        </div>
      ) : null}

      <div className="quiz-options">
        {pregunta.opciones.map((opcion, opcionIndex) => {
          const esMiRespuesta = miRespuesta?.opcionIndex === opcionIndex;
          const showCorrect = revelada && opcion.correcta;
          const showWrong = revelada && esMiRespuesta && !opcion.correcta;
          return (
            <button
              key={opcion.texto}
              type="button"
              className={`quiz-option${showCorrect ? ' quiz-option-correct' : ''}${showWrong ? ' quiz-option-wrong' : ''}${esMiRespuesta && !revelada ? ' sala-option-selected' : ''}`}
              disabled={!!miRespuesta}
              onClick={() => onAnswer(opcionIndex)}
            >
              {opcion.texto}
            </button>
          );
        })}
      </div>

      <SalaJugadoresLive jugadores={jugadoresEstado} />
      <SalaJugadoresLiveStyles />

      {miRespuesta && !revelada ? <p className="sala-waiting">Ya has respondido. Esperando al resto...</p> : null}
    </section>
  );
}
