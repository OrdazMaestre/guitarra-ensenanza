// Animaciones del mástil durante la partida, calculadas SOLO a partir del tiempo de canción (el
// mismo reloj que mueve las gemas): sin temporizadores propios, así nunca se desincronizan y se
// congelan en pausa. Puro (sin React ni canvas) para poder probarlo en Node.

import type { ChartNote } from './chart';

// Transparencia mínima de una cuerda que no se va a usar (para que el mástil se siga leyendo).
export const STRING_MIN_ALPHA = 0.15;
// Una cuerda que deja de usarse se apaga en 0,5 s (reales) tras acabar su última nota...
export const FADE_OUT_SECONDS = 0.5;
// ...y vuelve a su tono normal durante el segundo (real) anterior a la llegada de su próxima nota.
export const FADE_IN_SECONDS = 1;
// Cuerdas: se quedan encendidas mientras tengan alguna nota en los próximos 4 compases (petición
// del usuario: antes se encendían y apagaban demasiadas veces y demasiado rápido).
export const STRING_LOOKAHEAD_BARS = 4;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

// Brillo (0..1) de algo que se usa con estas notas en el instante `songPos`: sube durante
// FADE_IN_SECONDS antes de cada nota, se queda arriba mientras suena y baja en FADE_OUT_SECONDS
// después. Notas solapadas o muy seguidas: se queda arriba (el máximo de las dos curvas).
// `aheadSeconds` (de canción): se adelanta ese tiempo -- la subida termina cuando a la próxima
// nota le quedan `aheadSeconds`, así que mientras haya una nota dentro de esa ventana se queda
// arriba. `notes` ordenadas por tiempo.
export function usageLevel(notes: ChartNote[], songPos: number, speed: number, aheadSeconds = 0): number {
  // Primera nota que aún no ha empezado.
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid].t <= songPos) lo = mid + 1;
    else hi = mid;
  }
  let level = 0;
  const next = notes[lo];
  if (next) level = clamp01(1 - (next.t - aheadSeconds - songPos) / speed / FADE_IN_SECONDS);
  // Notas ya empezadas: la que acaba más tarde (una larga puede seguir sonando tras otras cortas).
  let lastEnd = Number.NEGATIVE_INFINITY;
  for (let i = lo - 1; i >= 0 && i >= lo - 8; i--) lastEnd = Math.max(lastEnd, notes[i].t + notes[i].dur);
  if (lastEnd > Number.NEGATIVE_INFINITY) {
    const since = (songPos - lastEnd) / speed;
    // Hueco corto hasta la siguiente (menos de FADE_IN_SECONDS): la cuerda sigue haciendo falta,
    // se queda encendida en vez de apagarse a medias y volver a encenderse (parpadeo).
    if (next && (next.t - lastEnd) / speed <= FADE_IN_SECONDS) return 1;
    level = Math.max(level, since <= 0 ? 1 : clamp01(1 - since / FADE_OUT_SECONDS));
  }
  return level;
}

// Transparencia de la cuerda: STRING_MIN_ALPHA si no se usa, 1 si se usa (o se va a usar dentro
// de `aheadSeconds` de canción; ver `barsAheadSeconds`).
export function stringAlpha(notes: ChartNote[], songPos: number, speed: number, aheadSeconds = 0): number {
  return STRING_MIN_ALPHA + (1 - STRING_MIN_ALPHA) * usageLevel(notes, songPos, speed, aheadSeconds);
}

// Duración (de canción) de `count` compases medida con el compás que suena ahora: una ventana que
// avanza suave con la canción (sin saltos al cambiar de compás).
export function barsAheadSeconds(bars: Array<{ t: number; end: number }>, songPos: number, count: number, fallback: number): number {
  let lo = 0;
  let hi = bars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (bars[mid].t <= songPos) lo = mid;
    else hi = mid - 1;
  }
  const bar = bars[lo];
  return bar ? count * (bar.end - bar.t) : fallback;
}

// Notas agrupadas por cuerda (y por traste), cacheadas por chart: se consultan en cada frame.
const byStringCache = new WeakMap<ChartNote[], Map<number, ChartNote[]>>();
const byFretCache = new WeakMap<ChartNote[], Map<number, ChartNote[]>>();

function groupBy(notes: ChartNote[], cache: WeakMap<ChartNote[], Map<number, ChartNote[]>>, key: (note: ChartNote) => number) {
  let map = cache.get(notes);
  if (!map) {
    map = new Map();
    for (const note of notes) {
      const k = key(note);
      const list = map.get(k);
      if (list) list.push(note);
      else map.set(k, [note]);
    }
    cache.set(notes, map);
  }
  return map;
}

export function notesOnString(notes: ChartNote[], string: number): ChartNote[] {
  return groupBy(notes, byStringCache, (note) => note.string).get(string) ?? [];
}

export function notesOnFret(notes: ChartNote[], fret: number): ChartNote[] {
  return groupBy(notes, byFretCache, (note) => note.fret).get(fret) ?? [];
}
