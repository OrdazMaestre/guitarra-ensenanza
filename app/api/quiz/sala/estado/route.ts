import type { NextRequest } from 'next/server';
import {
  contarRespuestas,
  getControl,
  getJugadores,
  getMarcador,
  getPreguntas,
  getRespuesta,
} from '@/app/lib/quiz/redisSala';
import { isValidRoomCode, normalizeRoomCode } from '@/app/lib/quiz/salaCodigo';
import type { RuntimeQuestion } from '@/app/lib/quiz/types';

// Endpoint que se SONDEA (cada 1.5-2s) desde la pantalla del anfitrión y desde la de cada
// jugador. Es el único sitio donde hay que tener cuidado con qué se revela a quién: si quien pide
// el estado es un jugador y la pregunta actual todavía no está revelada, se le quita
// `opciones[].correcta` antes de responder -- si no, cualquiera mirando la pestaña de red del
// navegador vería la respuesta antes de tiempo. El anfitrión (verificado por `anfitrionToken`)
// siempre la recibe completa, porque es quien decide cuándo revelar.
function sanitizeQuestion(pregunta: RuntimeQuestion, revelarCorrecta: boolean): RuntimeQuestion {
  if (revelarCorrecta) return pregunta;
  return { ...pregunta, opciones: pregunta.opciones.map((o) => ({ ...o, correcta: false })) };
}

export async function GET(request: NextRequest) {
  const codigo = normalizeRoomCode(request.nextUrl.searchParams.get('codigo') ?? '');
  if (!isValidRoomCode(codigo)) {
    return Response.json({ error: 'Codigo de sala invalido' }, { status: 400 });
  }

  const control = await getControl(codigo);
  if (!control) {
    return Response.json({ error: 'Esa sala no existe (puede que haya expirado)' }, { status: 404 });
  }

  const anfitrionToken = request.nextUrl.searchParams.get('anfitrionToken');
  const esAnfitrion = !!anfitrionToken && anfitrionToken === control.anfitrionToken;

  const jugadorId = request.nextUrl.searchParams.get('jugadorId');
  if (jugadorId && !esAnfitrion) {
    const jugadores = await getJugadores(codigo);
    if (!jugadores.some((j) => j.id === jugadorId)) {
      return Response.json({ error: 'Ese jugador no pertenece a esta sala' }, { status: 404 });
    }
  }

  const [jugadores, marcador] = await Promise.all([getJugadores(codigo), getMarcador(codigo)]);

  let pregunta: RuntimeQuestion | null = null;
  let miRespuesta = null;
  let respondieron = 0;
  if (control.indice >= 0 && control.estado !== 'lobby') {
    const preguntas = await getPreguntas(codigo);
    const raw = preguntas?.[control.indice] ?? null;
    if (raw) pregunta = sanitizeQuestion(raw, esAnfitrion || control.revelada);
    respondieron = await contarRespuestas(codigo, control.indice);
    if (jugadorId) miRespuesta = await getRespuesta(codigo, control.indice, jugadorId);
  }

  return Response.json({
    esAnfitrion,
    estado: control.estado,
    indice: control.indice,
    jugadores,
    marcador,
    miRespuesta,
    modo: control.modo,
    pregunta,
    respondieron,
    revelada: control.revelada,
    totalJugadores: jugadores.length,
    totalPreguntas: control.totalPreguntas,
  });
}
