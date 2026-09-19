import type { NextRequest } from 'next/server';
import { avanzarSala, contarRespuestas, getControl, getJugadores, puedeRevelarAhora, type SalaAccion } from '@/app/lib/quiz/redisSala';
import { isValidRoomCode, normalizeRoomCode } from '@/app/lib/quiz/salaCodigo';

const VALID_ACCIONES: SalaAccion[] = ['empezar', 'revelar', 'siguiente', 'terminar'];

function isValidAccion(value: unknown): value is SalaAccion {
  return typeof value === 'string' && (VALID_ACCIONES as string[]).includes(value);
}

// Solo el anfitrión puede avanzar la sala -- verificado con `anfitrionToken`, no con el código de
// sala (que es corto y pensado para escribirse a mano, no como credencial de control).
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  const codigo = normalizeRoomCode(typeof body?.codigo === 'string' ? body.codigo : '');
  if (!isValidRoomCode(codigo)) {
    return Response.json({ error: 'Codigo de sala invalido' }, { status: 400 });
  }

  const accion = body?.accion;
  if (!isValidAccion(accion)) {
    return Response.json({ error: 'Parametro "accion" invalido' }, { status: 400 });
  }

  const control = await getControl(codigo);
  if (!control) {
    return Response.json({ error: 'Esa sala no existe (puede que haya expirado)' }, { status: 404 });
  }

  const anfitrionToken = typeof body?.anfitrionToken === 'string' ? body.anfitrionToken : '';
  if (anfitrionToken !== control.anfitrionToken) {
    return Response.json({ error: 'No eres el anfitrion de esta sala' }, { status: 403 });
  }

  // Defensa en profundidad: el botón ya sale deshabilitado en el cliente hasta que todos han
  // contestado y pasan 30s (ver puedeRevelarAhora), pero se repite aquí por si alguien salta el
  // cliente. No hace falta comprobar el límite de 60s: si ya se pasó, autoAvanzarSiToca (disparado
  // por cualquier sondeo de /estado) ya lo habrá revelado solo antes de que esto se llegue a pedir.
  if (accion === 'revelar' && control.estado === 'jugando' && !control.revelada) {
    const [respondieron, jugadores] = await Promise.all([
      contarRespuestas(codigo, control.indice),
      getJugadores(codigo),
    ]);
    if (!puedeRevelarAhora(control, respondieron, jugadores.length)) {
      return Response.json({ error: 'Todavia no se puede revelar la respuesta' }, { status: 409 });
    }
  }

  const updated = await avanzarSala(codigo, accion);
  return Response.json({ control: updated });
}
