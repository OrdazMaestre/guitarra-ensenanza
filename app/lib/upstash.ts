// Extraído de app/lib/maikaelLimits.ts (que lo usaba en privado solo para el contador diario de
// MAIkael) para poder reutilizar el mismo store de Upstash Redis en app/lib/quiz/redisRanking.ts,
// con un prefijo de clave distinto (`ranking:*` vs `maikael:count:*`) que convive sin conflicto.

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

export async function upstashCommand(...args: (string | number)[]): Promise<unknown> {
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
