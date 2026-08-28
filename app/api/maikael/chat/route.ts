import type { NextRequest } from 'next/server';
import { MAIKAEL_DAILY_LIMIT, incrementDailyCount } from '@/app/lib/maikaelLimits';
import { MAIKAEL_INTRO_LINE, MAIKAEL_SYSTEM_PROMPT } from '@/app/lib/maikaelPrompt';
import { detectarDatosPersonales, PERSONAL_DATA_REPLY } from '@/app/lib/maikaelPrivacyFilter';

// Historial de proveedor (los tres tuvieron un motivo real para descartarse,
// no caprichos):
// 1) Gemini Flash-Lite — descartado: su free tier no se puede usar para
//    servir a usuarios finales en el EEE/Suiza/Reino Unido (términos de
//    Google, ai.google.dev/gemini-api/terms). España está en el EEE.
// 2) Mistral Small — descartado antes de probarse: su tier gratuito
//    ("Experiment") parece pensado para evaluación, no producción real
//    (varias fuentes coinciden, sin confirmación 100% oficial encontrada).
// 3) Groq (actual) — openai/gpt-oss-20b, modelo de PRODUCCIÓN (no preview)
//    en su free tier. Sin restricción geográfica EEE encontrada en sus
//    términos (console.groq.com/docs/legal/services-agreement); de hecho
//    tienen entidad contratante propia para EEE/Suiza. Tope real del free
//    tier ~1.000 peticiones/día (console.groq.com/docs/rate-limits) — por
//    eso MAIKAEL_DAILY_LIMIT bajó de 1500 a 900 (maikaelLimits.ts). El
//    manejo de datos de menores queda bajo nuestra responsabilidad según
//    sus términos — pendiente de los detalles que va a pasar Ordaz.
const GROQ_MODEL = 'openai/gpt-oss-20b';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// gpt-oss-20b es un modelo "razonador": antes de responder gasta tokens
// pensando en un campo aparte (`reasoning`, invisible para el alumno) que
// cuenta contra el mismo `max_tokens` que la respuesta visible. Detectado
// probando "dibújame un acorde de Do mayor": con max_tokens=400 y sin
// reasoning_effort, gastó los 400 enteros pensando (reasoning_tokens=398) y
// la respuesta visible quedó vacía (finish_reason="length"). Solución:
// - reasoning_effort:'low' recorta ese gasto a ~15-20 tokens.
// - max_tokens más alto (900) da margen para respuestas largas de verdad
//   como un SVG completo, sin animar a respuestas más largas de lo normal
//   (el propio prompt ya pide brevedad; esto es solo margen para no cortar
//   a media respuesta, no un objetivo a rellenar).
const MAX_OUTPUT_TOKENS = 900;
const REASONING_EFFORT = 'low';

// El límite real que más aprieta en Groq no es el diario, es el de tokens
// por minuto (8.000, rolling) — con ~4 mensajes combinados de todos los
// alumnos por minuto ya se puede agotar. En vez de fallar a la primera,
// esperamos un poco y reintentamos: Groq nos dice en sus propias cabeceras
// cuánto falta para tener hueco de nuevo (a petición de Ordaz: "el mensaje
// puede esperar unos segundos"). Mientras se espera, la cara de MAIkael se
// queda en "analizando" sola (ver MaikaelWidget.tsx: se pone al enviar y no
// cambia hasta que llega la respuesta real, sea cual sea el tiempo que tarde).
// Probado con 5 peticiones simultáneas reales: con 2 reintentos / 3s de tope
// cada uno, solo 2 de las 5 pasaban — varias a la vez piden hueco al mismo
// tiempo y chocan otra vez al reintentar juntas ("thundering herd"). Con más
// presupuesto (4 reintentos, hasta 4s cada uno) y jitter (aleatoriedad en la
// espera, para que no todas reintenten en el mismo instante) pasan 3 de 5.
// 5 peticiones literalmente simultáneas es un caso extremo para este sitio;
// subir mucho más el presupuesto alarga la espera de todo el mundo a cambio
// de un caso raro — este es el punto donde se dejó, revisar si hace falta más.
const MAX_RETRIES = 4;
const MAX_WAIT_PER_RETRY_MS = 4000;
const DEFAULT_WAIT_MS = 1500;
const JITTER_MAX_MS = 400;

// Groq expresa el tiempo de esta forma en sus cabeceras: "615ms", "1.109s",
// "1m26.4s". Si no se puede interpretar, se usa una espera prudente por defecto.
function parseGroqWaitMs(value: string | null): number {
  if (!value) return DEFAULT_WAIT_MS;
  const conMinutos = value.match(/^(\d+)m([\d.]+)s$/);
  if (conMinutos) return Number(conMinutos[1]) * 60_000 + Number(conMinutos[2]) * 1000;
  const enSegundos = value.match(/^([\d.]+)s$/);
  if (enSegundos) return Number(enSegundos[1]) * 1000;
  const enMs = value.match(/^([\d.]+)ms$/);
  if (enMs) return Number(enMs[1]);
  return DEFAULT_WAIT_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const maxDuration = 25; // margen para los reintentos en Vercel (Render no es serverless)

interface HistoryTurn {
  role: 'user' | 'model';
  text: string;
}

function parseHistory(value: unknown): HistoryTurn[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (turn): turn is HistoryTurn =>
      turn && (turn.role === 'user' || turn.role === 'model') && typeof turn.text === 'string'
  );
}

// El chequeo del tope de sesión (50) vive solo en el navegador (sessionStorage),
// por diseño: es un contador puramente de cliente, no hace falta duplicarlo aquí.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message) {
    return Response.json({ error: 'Falta el campo "message"' }, { status: 400 });
  }
  // Recorte autoritativo a los 2 últimos mensajes (1 intercambio), pase lo
  // que pase con lo que mande el cliente — el historial completo era el
  // mayor consumidor de tokens de la petición contra el límite compartido
  // de Groq (8.000 tokens/min entre todos los alumnos), y crecía sin tope
  // hasta los 50 turnos de una sesión.
  const history = parseHistory(body?.history).slice(-2);

  // Filtro de datos personales — ANTES de tocar el contador diario y sin
  // llamar a Groq en absoluto, igual que el pósit de cuota: gratis para el
  // alumno, no resta de ningún límite (encargo de Ordaz, protección de menores).
  const tipoDetectado = detectarDatosPersonales(message);
  if (tipoDetectado) {
    return Response.json({ blocked: 'personal-data', reply: PERSONAL_DATA_REPLY });
  }

  const dailyCount = await incrementDailyCount();
  if (dailyCount > MAIKAEL_DAILY_LIMIT) {
    return Response.json({ blocked: 'daily' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'MAIkael no está configurado (falta la clave de Groq)' }, { status: 500 });
  }

  // Groq usa el mismo formato de mensajes compatible con OpenAI que Mistral:
  // system/user/assistant — no hizo falta tocar esta parte al cambiar de proveedor.
  const messages = [
    { role: 'system', content: MAIKAEL_SYSTEM_PROMPT },
    { role: 'assistant', content: MAIKAEL_INTRO_LINE },
    ...history.map((turn) => ({ role: turn.role === 'model' ? 'assistant' : 'user', content: turn.text })),
    { role: 'user', content: message },
  ];

  let groqRes: Response | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages,
          max_tokens: MAX_OUTPUT_TOKENS,
          reasoning_effort: REASONING_EFFORT,
        }),
      });
    } catch {
      return Response.json({ error: 'MAIkael no ha podido conectar ahora mismo, prueba otra vez.' }, { status: 502 });
    }

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const waitMs =
        Math.min(
          parseGroqWaitMs(res.headers.get('retry-after') ?? res.headers.get('x-ratelimit-reset-tokens')),
          MAX_WAIT_PER_RETRY_MS
        ) + Math.random() * JITTER_MAX_MS;
      await sleep(waitMs);
      continue;
    }
    groqRes = res;
    break;
  }

  if (!groqRes || !groqRes.ok) {
    // No revienta ante un 429/5xx de Groq — el contador diario ya se
    // incrementó por diseño (el orden de chequeo pedido por Ordaz), así que
    // este intento fallido no se "devuelve" al alumno.
    return Response.json({ error: 'MAIkael está saturado ahora mismo, prueba otra vez en un momento.' }, { status: 502 });
  }

  const data = await groqRes.json().catch(() => null);
  const reply: string | undefined = data?.choices?.[0]?.message?.content;
  if (!reply) {
    return Response.json({ error: 'MAIkael no ha sabido qué responder, prueba a reformular.' }, { status: 502 });
  }

  return Response.json({ reply });
}
