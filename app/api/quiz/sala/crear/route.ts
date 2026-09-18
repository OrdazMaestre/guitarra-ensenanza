import type { NextRequest } from 'next/server';
import { selectQuestions } from '@/app/lib/quiz/engine';
import { crearSala } from '@/app/lib/quiz/redisSala';
import { createRng } from '@/app/lib/quiz/shuffle';
import { isValidQuizMode } from '@/app/lib/quiz/types';
import { topicsUpToSlug } from '@/app/lecciones/temario/quizTemarioMap';

// Crea la sala con las preguntas YA GENERADAS (una sola vez, en el servidor -- aquí no hay
// problema de hidratación como en QuizRunner.tsx, esto no renderiza nada) para que todos los
// jugadores vean exactamente el mismo test, nunca uno regenerado por jugador.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  const modo = body?.modo;
  if (!isValidQuizMode(modo)) {
    return Response.json({ error: 'Parametro "modo" invalido' }, { status: 400 });
  }

  const from = typeof body?.from === 'string' ? body.from : '';
  const topics = topicsUpToSlug(from, modo);
  const questions = selectQuestions(modo, topics, createRng());
  if (questions.length === 0) {
    return Response.json({ error: 'No hay preguntas disponibles todavia para este tema' }, { status: 400 });
  }

  const { codigo, anfitrionToken } = await crearSala(modo, questions);
  return Response.json({ anfitrionToken, codigo });
}
