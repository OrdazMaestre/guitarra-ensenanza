import type { NextRequest } from 'next/server';
import { containsProfanity } from '@/app/lib/quiz/profanityFilter';
import { getTop, insertScore } from '@/app/lib/quiz/redisRanking';
import { isValidQuizMode as isValidMode } from '@/app/lib/quiz/types';
import { QUIZ_TOPIC_ORDER, type QuizTopic } from '@/app/lecciones/temario/quizTemarioMap';

const MAX_NAME_LENGTH = 20;

function isValidTopic(value: unknown): value is QuizTopic {
  return typeof value === 'string' && (QUIZ_TOPIC_ORDER as readonly string[]).includes(value);
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('mode');
  const topic = request.nextUrl.searchParams.get('topic');
  const totalQuestionsRaw = request.nextUrl.searchParams.get('totalQuestions');

  if (!isValidMode(mode)) {
    return Response.json({ error: 'Parametro "mode" invalido' }, { status: 400 });
  }
  // Ahora obligatorio para TODOS los modos (antes solo facil/dificil): mini-torneo/campeonato
  // también van por tema, para que dos partidas con distinto punto de entrada (y por tanto
  // distinto número real de preguntas) nunca compartan ranking -- ver el comentario largo en
  // rankingKey() de redisRanking.ts.
  if (!isValidTopic(topic)) {
    return Response.json({ error: 'Parametro "topic" invalido o ausente' }, { status: 400 });
  }
  // Necesario para escalar los 4 fantasmas al tamaño real de ESTE test (ver ghostEntriesFor en
  // redisRanking.ts).
  const totalQuestions = Number(totalQuestionsRaw);
  if (!totalQuestionsRaw || !Number.isInteger(totalQuestions) || totalQuestions <= 0) {
    return Response.json({ error: 'Parametro "totalQuestions" invalido' }, { status: 400 });
  }

  const entries = await getTop(mode, topic, totalQuestions);
  return Response.json({ entries });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  const mode = body?.mode;
  if (!isValidMode(mode)) {
    return Response.json({ error: 'Parametro "mode" invalido' }, { status: 400 });
  }

  const topic = body?.topic;
  if (!isValidTopic(topic)) {
    return Response.json({ error: 'Parametro "topic" invalido o ausente' }, { status: 400 });
  }

  const nombre = typeof body?.nombre === 'string' ? body.nombre.trim() : '';
  if (!nombre || nombre.length > MAX_NAME_LENGTH) {
    return Response.json({ error: `El nombre debe tener entre 1 y ${MAX_NAME_LENGTH} caracteres` }, { status: 400 });
  }
  if (containsProfanity(nombre)) {
    return Response.json({ error: 'Ese nombre no vale, prueba con otro' }, { status: 400 });
  }

  const puntos = body?.puntos;
  const tiempoSeg = body?.tiempoSeg;
  const totalQuestions = body?.totalQuestions;
  if (typeof puntos !== 'number' || !Number.isFinite(puntos) || puntos < 0) {
    return Response.json({ error: 'Parametro "puntos" invalido' }, { status: 400 });
  }
  if (typeof tiempoSeg !== 'number' || !Number.isFinite(tiempoSeg) || tiempoSeg < 0) {
    return Response.json({ error: 'Parametro "tiempoSeg" invalido' }, { status: 400 });
  }
  if (typeof totalQuestions !== 'number' || !Number.isInteger(totalQuestions) || totalQuestions <= 0) {
    return Response.json({ error: 'Parametro "totalQuestions" invalido' }, { status: 400 });
  }

  const entry = await insertScore(mode, topic, nombre, puntos, tiempoSeg, totalQuestions);
  return Response.json({ entry });
}
