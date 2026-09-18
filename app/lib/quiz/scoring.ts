// Fórmula de puntuación compartida entre el quiz individual (QuizRunner.tsx) y el modo sala
// (endpoint /api/quiz/sala/responder) — sin dependencias de servidor ni de cliente, mismo espíritu
// que rankingTiers.ts, para que las dos modalidades puntúen exactamente igual desde un único sitio.

// meta.reglas_generales.puntuacion en questionBank.json: el bonus de <5s SUSTITUYE al de <10s (no
// se suman) -- por eso es un if/else if, no dos ifs independientes.
export function bonusFor(elapsedSeconds: number): number {
  if (elapsedSeconds < 5) return 2;
  if (elapsedSeconds < 10) return 1;
  return 0;
}

/** 1 punto por acierto + el bonus de rapidez si la opción elegida era la correcta; 0 si falló. */
export function pointsFor(correcta: boolean, elapsedSeconds: number): number {
  if (!correcta) return 0;
  return 1 + bonusFor(elapsedSeconds);
}
