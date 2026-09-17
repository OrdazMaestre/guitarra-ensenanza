// Módulo sin dependencias de servidor (sin upstashCommand, sin process.env) a propósito: se
// importa tanto desde el backend (app/lib/quiz/redisRanking.ts) como desde el cliente
// (QuizResults.tsx) para calcular la insignia con la MISMA fórmula en los dos sitios.
//
// Bronce = tantos puntos como preguntas tenía el test (1 punto/pregunta, sin bonus de rapidez).
// Plata = el doble (equivale, conceptualmente, a acertar todo Y responder cada una en <10s).
// Oro = el triple (equivale a acertar todo Y responder cada una en <5s).
// Pero la insignia se calcula SOLO comparando puntos totales contra estos umbrales, no
// comprobando el tiempo pregunta a pregunta -- da más margen (una respuesta lenta se puede
// compensar con otra rápida) en vez de exigir que TODAS bajen de 10s/5s.
export type RankingTier = 'bronce' | 'plata' | 'oro' | null;

export function tierFor(puntos: number, totalQuestions: number): RankingTier {
  if (totalQuestions <= 0) return null;
  if (puntos >= totalQuestions * 3) return 'oro';
  if (puntos >= totalQuestions * 2) return 'plata';
  if (puntos >= totalQuestions) return 'bronce';
  return null;
}
