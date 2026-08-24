import type { NextRequest } from 'next/server';
import { MAIKAEL_DAILY_LIMIT, incrementDailyCount } from '@/app/lib/maikaelLimits';

// El chequeo del tope de sesión (50) vive solo en el navegador (sessionStorage),
// por diseño: es un contador puramente de cliente, no hace falta duplicarlo aquí.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message) {
    return Response.json({ error: 'Falta el campo "message"' }, { status: 400 });
  }

  const dailyCount = await incrementDailyCount();
  if (dailyCount > MAIKAEL_DAILY_LIMIT) {
    return Response.json({ blocked: 'daily' });
  }

  // Stub de la Fase 2: la llamada real a Gemini con el prompt se conecta en la Fase 5.
  return Response.json({ reply: `(stub) MAIkael recibió: "${message}"` });
}
