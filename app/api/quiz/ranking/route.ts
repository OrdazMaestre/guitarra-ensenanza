import type { NextRequest } from 'next/server';
import { containsProfanity } from '@/app/lib/quiz/profanityFilter';
import { getTop, insertScore } from '@/app/lib/quiz/redisRanking';
import type { QuizMode } from '@/app/lib/quiz/types';
import { QUIZ_TOPIC_ORDER, type QuizTopic } from '@/app/lecciones/temario/quizTemarioMap';

const VALID_MODES: QuizMode[] = ['facil', 'dificil', 'mini-torneo', 'campeonato'];
const MAX_NAME_LENGTH = 20;

function isValidMode(value: unknown): value is QuizMode {
  return typeof value === 'string' && (VALID_MODES as string[]).includes(value);
}

function isValidTopic(value: unknown): value is QuizTopic {
  return typeof value === 'string' && (QUIZ_TOPIC_ORDER as readonly string[]).includes(value);
}

function needsTopic(mode: QuizMode): boolean {
  return mode === 'facil' || mode === 'dificil';
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('mode');
  const topic = request.nextUrl.searchParams.get('topic');

  if (!isValidMode(mode)) {
    return Response.json({ error: 'Parametro "mode" invalido' }, { status: 400 });
  }
  if (needsTopic(mode) && !isValidTopic(topic)) {
    return Response.json({ error: 'Parametro "topic" invalido o ausente para este modo' }, { status: 400 });
  }

  const entries = await getTop(mode, needsTopic(mode) ? (topic as QuizTopic) : undefined);
  return Response.json({ entries });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  const mode = body?.mode;
  if (!isValidMode(mode)) {
    return Response.json({ error: 'Parametro "mode" invalido' }, { status: 400 });
  }

  const topic = body?.topic;
  if (needsTopic(mode) && !isValidTopic(topic)) {
    return Response.json({ error: 'Parametro "topic" invalido o ausente para este modo' }, { status: 400 });
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

  const entry = await insertScore(mode, needsTopic(mode) ? (topic as QuizTopic) : undefined, nombre, puntos, tiempoSeg, totalQuestions);
  return Response.json({ entry });
}
