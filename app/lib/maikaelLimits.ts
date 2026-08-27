// Bajado de 1500 a 900 al cambiar de Gemini a Groq (2026-08-27): el modelo
// estable de producción en el free tier de Groq (openai/gpt-oss-20b) tiene
// un tope real de ~1.000 peticiones/día (console.groq.com/docs/rate-limits)
// — 900 deja margen de sobra sin arriesgarse a que Groq empiece a devolver
// 429 antes de que nuestro propio contador bloquee.
export const MAIKAEL_DAILY_LIMIT = 900;
export const MAIKAEL_SESSION_LIMIT = 50;

const MADRID_TIME_ZONE = 'Europe/Madrid';

function upstashCredentials(): { url: string; token: string } {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      'Faltan las variables de entorno UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN'
    );
  }
  return { url, token };
}

async function upstashCommand(...args: (string | number)[]): Promise<unknown> {
  const { url, token } = upstashCredentials();
  const path = args.map((part) => encodeURIComponent(String(part))).join('/');
  const res = await fetch(`${url}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Upstash respondió ${res.status} para el comando ${args[0]}`);
  }
  const data = (await res.json()) as { result: unknown };
  return data.result;
}

// en-CA formatea fechas como YYYY-MM-DD, que es justo la clave que necesitamos.
export function todayKeyMadrid(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MADRID_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function secondsUntilMidnightMadrid(): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MADRID_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const elapsedSeconds = get('hour') * 3600 + get('minute') * 60 + get('second');
  return 24 * 3600 - elapsedSeconds;
}

function dailyCountKey(): string {
  return `maikael:count:${todayKeyMadrid()}`;
}

/** Incrementa el contador diario compartido y devuelve el nuevo total. */
export async function incrementDailyCount(): Promise<number> {
  const key = dailyCountKey();
  const count = Number(await upstashCommand('INCR', key));
  if (count === 1) {
    await upstashCommand('EXPIRE', key, secondsUntilMidnightMadrid());
  }
  return count;
}

/** Lee el contador diario sin incrementarlo. */
export async function getDailyCount(): Promise<number> {
  const result = await upstashCommand('GET', dailyCountKey());
  return result == null ? 0 : Number(result);
}
