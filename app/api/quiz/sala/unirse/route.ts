import type { NextRequest } from 'next/server';
import { containsProfanity } from '@/app/lib/quiz/profanityFilter';
import { getControl, unirseSala } from '@/app/lib/quiz/redisSala';
import { isValidRoomCode, normalizeRoomCode } from '@/app/lib/quiz/salaCodigo';

const MAX_NAME_LENGTH = 20;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  const codigo = normalizeRoomCode(typeof body?.codigo === 'string' ? body.codigo : '');
  if (!isValidRoomCode(codigo)) {
    return Response.json({ error: 'Codigo de sala invalido' }, { status: 400 });
  }

  const nombre = typeof body?.nombre === 'string' ? body.nombre.trim() : '';
  if (!nombre || nombre.length > MAX_NAME_LENGTH) {
    return Response.json({ error: `El nombre debe tener entre 1 y ${MAX_NAME_LENGTH} caracteres` }, { status: 400 });
  }
  if (containsProfanity(nombre)) {
    return Response.json({ error: 'Ese nombre no vale, prueba con otro' }, { status: 400 });
  }

  const control = await getControl(codigo);
  if (!control) {
    return Response.json({ error: 'Esa sala no existe (puede que haya expirado)' }, { status: 404 });
  }
  // v1 no soporta unirse a mitad de partida -- limitacion explicita, evita que alguien entre sin
  // haber visto las preguntas anteriores y desincronice el marcador respecto al resto.
  if (control.estado !== 'lobby') {
    return Response.json({ error: 'Esta partida ya ha empezado' }, { status: 409 });
  }

  const jugadorId = await unirseSala(codigo, nombre);
  return Response.json({ jugadorId, modo: control.modo });
}
