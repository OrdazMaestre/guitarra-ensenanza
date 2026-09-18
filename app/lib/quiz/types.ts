import type { QuizTopic } from '../../lecciones/temario/quizTemarioMap';
import type { QuestionBankEntry } from './questionBank.types';
import type { Rng } from './shuffle';

export type QuizMode = 'facil' | 'dificil' | 'mini-torneo' | 'campeonato';

export const VALID_QUIZ_MODES: QuizMode[] = ['facil', 'dificil', 'mini-torneo', 'campeonato'];

export function isValidQuizMode(value: unknown): value is QuizMode {
  return typeof value === 'string' && (VALID_QUIZ_MODES as string[]).includes(value);
}

export interface QuizOption {
  correcta: boolean;
  texto: string;
}

// Datos suficientes para que QuestionCard (Fase 4, UI) sepa qué dibujar — el motor no renderiza
// nada, solo describe la forma. 'fretboard-marks' cubre tanto una única posición (6.3) como varias
// (9.1, 9.1.2); 'string-marker' es el caso simple de 3.2 (solo importa el número de cuerda).
export type QuizDiagram =
  | {
      endFret: number;
      /** true = las posiciones se muestran en orden (arpegio), no todas a la vez (acorde/escala). */
      ordered?: boolean;
      positions: { fret: number; string: number }[];
      /** true = NO pintar el nombre de la nota dentro del circulo -- imprescindible en 6.3 ("¿cual
       * es esta nota?"), donde el nombre de la nota ES la respuesta que se pregunta. Por defecto
       * (false/undefined) se sigue mostrando, como en 9.1/9.1.2, donde no hace falta ocultarlo. */
      hideNoteLabels?: boolean;
      startFret: number;
      type: 'fretboard-marks';
    }
  | { string: number; type: 'string-marker' }
  | {
      chordEnglish: string;
      /** true = el aria-label no debe nombrar el acorde -- imprescindible en 4.1 ("identificar el
       * acorde del dibujo"), donde el nombre ES la respuesta. Por defecto (false/undefined) se
       * sigue nombrando, como en 6.4/9.2.1, que no preguntan por el nombre del acorde en si. */
      hideNoteLabels?: boolean;
      quality: 'mayor' | 'menor' | 'power';
      type: 'chord-diagram';
    };

export interface RuntimeQuestion {
  diagrama?: QuizDiagram;
  dificultad: 'facil' | 'dificil';
  enunciado: string;
  /** Id único de esta instancia (distingue las 2 apariciones de una pregunta con variables en
   * dificil/mini-torneo/campeonato, o las 4 simultáneas de 9.2.1). Formato "<origenId>#<n>". */
  id: string;
  /** Siempre 5, ya barajadas. */
  opciones: QuizOption[];
  /** Id tal como aparece en questionBank.json (ej. "1.2"), sin sufijo de variante. */
  origenId: string;
  tema: QuizTopic;
}

export type QuestionGenerator = (entry: QuestionBankEntry, mode: QuizMode, rng: Rng) => RuntimeQuestion[];
