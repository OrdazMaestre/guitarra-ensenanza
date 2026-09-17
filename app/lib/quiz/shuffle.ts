// PRNG determinista (mulberry32) sin dependencias externas. Con seed, la misma secuencia de
// llamadas siempre da el mismo resultado — necesario para poder testear el motor del quiz
// (app/lib/quiz/engine.ts) con una seed fija en vez de aleatoriedad real.

export type Rng = () => number;

export function createRng(seed?: number): Rng {
  if (seed === undefined) return Math.random;

  let state = seed >>> 0;
  return function mulberry32() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates. No muta el array de entrada. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** n elementos distintos escogidos al azar, sin repetir. */
export function pick<T>(items: readonly T[], n: number, rng: Rng): T[] {
  return shuffle(items, rng).slice(0, Math.min(n, items.length));
}

/** Un elemento al azar. */
export function pickOne<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}

/** Entero aleatorio en [min, max], ambos incluidos. */
export function randomInt(min: number, max: number, rng: Rng): number {
  return min + Math.floor(rng() * (max - min + 1));
}
