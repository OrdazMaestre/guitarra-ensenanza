import type { NextRequest } from 'next/server';
import { getControl, getJugadores, getPreguntas, registrarRespuesta } from '@/app/lib/quiz/redisSala';
import { isValidRoomCode, normalizeRoomCode } from '@/app/lib/quiz/salaCodigo';
import { pointsFor } from '@/app/lib/quiz/scoring';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  const codigo = normalizeRoomCode(typeof body?.codigo === 'string' ? body.codigo : '');
  if (!isValidRoomCode(codigo)) {
    return Response.json({ error: 'Codigo de sala invalido' }, { status: 400 });
  }

  const jugadorId = typeof body?.jugadorId === 'string' ? body.jugadorId : '';
  const indice = body?.indice;
  const opcionIndex = body?.opcionIndex;
  if (!jugadorId || typeof indice !== 'number' || typeof opcionIndex !== 'number') {
    return Response.json({ error: 'Faltan datos de la respuesta' }, { status: 400 });
  }

  const control = await getControl(codigo);
  if (!control) {
    return Response.json({ error: 'Esa sala no existe (puede que haya expirado)' }, { status: 404 });
  }
  if (control.estado !== 'jugando') {
    return Response.json({ error: 'Esta pregunta ya no esta activa' }, { status: 409 });
  }
  // Rechaza respuestas tardias a una pregunta ya pasada (el anfitrion ya avanzo a la siguiente).
  if (indice !== control.indice) {
    return Response.json({ error: 'Esa pregunta ya no esta activa' }, { status: 409 });
  }

  const jugadores = await getJugadores(codigo);
  if (!jugadores.some((j) => j.id === jugadorId)) {
    return Response.json({ error: 'Ese jugador no pertenece a esta sala' }, { status: 404 });
  }

  const preguntas = await getPreguntas(codigo);
  const pregunta = preguntas?.[indice];
  const opcion = pregunta?.opciones[opcionIndex];
  if (!pregunta || !opcion) {
    return Response.json({ error: 'Opcion invalida' }, { status: 400 });
  }

  // Reloj compartido: el tiempo se mide contra el instante que fijo el anfitrion al revelar/
  // avanzar (control.preguntaInicioMs), NUNCA contra nada que mande el navegador del jugador --
  // asi el bonus de rapidez es justo aunque un jugador conecte un poco mas tarde que otro.
  const elapsedSeconds = (Date.now() - control.preguntaInicioMs) / 1000;
  const puntos = pointsFor(opcion.correcta, elapsedSeconds);

  const registrado = await registrarRespuesta(codigo, indice, jugadorId, {
    correcta: opcion.correcta,
    opcionIndex,
    puntos,
  });
  if (!registrado) {
    return Response.json({ error: 'Ya has respondido esta pregunta' }, { status: 409 });
  }

  return Response.json({ correcta: opcion.correcta, puntos });
}
