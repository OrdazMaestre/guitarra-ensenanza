import type { NextRequest } from 'next/server';
import {
  autoAvanzarSiToca,
  getJugadores,
  getMarcador,
  getPreguntas,
  getRespuestas,
  puedeRevelarAhora,
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

  // autoAvanzarSiToca (no getControl a secas): CUALQUIER sondeo -- del anfitrión o de un jugador
  // cualquiera -- dispara los avances por tiempo (revelar sola a los 60s, siguiente sola a los 10s
  // de revelada), así que no dependen de que la pestaña del anfitrión siga abierta.
  const control = await autoAvanzarSiToca(codigo);
  if (!control) {
    return Response.json({ error: 'Esa sala no existe (puede que haya expirado)' }, { status: 404 });
  }

  const anfitrionToken = request.nextUrl.searchParams.get('anfitrionToken');
  const esAnfitrion = !!anfitrionToken && anfitrionToken === control.anfitrionToken;

  const jugadorId = request.nextUrl.searchParams.get('jugadorId');
  const jugadores = await getJugadores(codigo);
  if (jugadorId && !esAnfitrion && !jugadores.some((j) => j.id === jugadorId)) {
    return Response.json({ error: 'Ese jugador no pertenece a esta sala' }, { status: 404 });
  }

  const marcador = await getMarcador(codigo);

  let pregunta: RuntimeQuestion | null = null;
  let miRespuesta = null;
  let respondieron = 0;
  // Lista en vivo de "quién ha contestado ya" (ver SalaJugadoresLive.tsx): todos ven la misma,
  // anfitrión incluido, ahora que también contesta como un jugador más.
  let jugadoresEstado: { id: string; nombre: string; orden: number | null }[] = [];
  let puedeRevelar = false;
  if (control.indice >= 0 && control.estado !== 'lobby') {
    const preguntas = await getPreguntas(codigo);
    const raw = preguntas?.[control.indice] ?? null;
    if (raw) pregunta = sanitizeQuestion(raw, esAnfitrion || control.revelada);
    const respuestas = await getRespuestas(codigo, control.indice);
    respondieron = Object.keys(respuestas).length;
    if (jugadorId) miRespuesta = respuestas[jugadorId] ?? null;
    jugadoresEstado = jugadores.map((j) => ({ id: j.id, nombre: j.nombre, orden: respuestas[j.id]?.orden ?? null }));
    puedeRevelar = puedeRevelarAhora(control, respondieron, jugadores.length);
  }

  return Response.json({
    esAnfitrion,
    estado: control.estado,
    indice: control.indice,
    jugadores,
    jugadoresEstado,
    marcador,
    miRespuesta,
    modo: control.modo,
    pregunta,
    puedeRevelar,
    respondieron,
    revelada: control.revelada,
    totalJugadores: jugadores.length,
    totalPreguntas: control.totalPreguntas,
  });
}
