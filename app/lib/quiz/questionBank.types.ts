import type { QuizTopic } from '../../lecciones/temario/quizTemarioMap';

export type QuestionDifficulty = 'facil' | 'dificil' | 'facil_y_dificil';

export interface QuestionBankEntry {
  correcta: string[] | null;
  dificultad: QuestionDifficulty;
  id: string;
  nota?: string;
  nota_generacion?: string;
  opcion_graciosa: string | null;
  opciones: string[];
  pregunta: string;
  tema: QuizTopic;
  variables: string[];
}

export interface QuestionBankScoring {
  aplica_a: string;
  bonus_tiempo: {
    menos_de_10s: number;
    menos_de_5s: number;
    nota: string;
  };
  acierto: number;
}

export interface QuestionBankMeta {
  leyenda: Record<string, string>;
  proyecto: string;
  reglas_generales: {
    campeonato: string;
    excepcion_variantes: string;
    mini_torneo: string;
    modo_dificil: string;
    modo_facil: string;
    multiples_respuestas_correctas: string;
    numero_preguntas: string;
    opcion_graciosa: string;
    opciones_por_pregunta: number;
    puntuacion: QuestionBankScoring;
    variantes: string;
  };
}

export interface QuestionBank {
  decisiones_confirmadas: string[];
  meta: QuestionBankMeta;
  preguntas: QuestionBankEntry[];
}
