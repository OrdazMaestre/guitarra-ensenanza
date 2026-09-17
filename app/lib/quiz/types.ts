import type { QuizTopic } from '../../lecciones/temario/quizTemarioMap';
import type { QuestionBankEntry } from './questionBank.types';
import type { Rng } from './shuffle';

export type QuizMode = 'facil' | 'dificil' | 'mini-torneo' | 'campeonato';

export interface QuizOption {
  correcta: boolean;
  texto: string;
}

// Datos suficientes para que QuestionCard (Fase 4, UI) sepa qué dibujar — el motor no renderiza
// nada, solo describe la forma. 'fretboard-marks' cubre tanto una única posición (6.3) como varias
// (9.1, 9.1.2); 'string-marker' es el caso simple de 3.2 (solo importa el número de cuerda).
export type QuizDiagram =
  | { endFret: number; /** true = las posiciones se muestran en orden (arpegio), no todas a la vez (acorde/escala). */ ordered?: boolean; positions: { fret: number; string: number }[]; startFret: number; type: 'fretboard-marks' }
  | { string: number; type: 'string-marker' }
  | { chordEnglish: string; quality: 'mayor' | 'menor' | 'power'; type: 'chord-diagram' };

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
