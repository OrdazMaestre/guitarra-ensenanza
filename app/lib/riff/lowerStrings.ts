// BAJAR UNA CUERDA (usuario, 2026-11-15; pura, sin React): en los niveles de varias cuerdas, una pista
// que casi no usa la cuerda más grave del nivel (Vektor - Fast Paced Society: en Si, sus riffs viven en
// las cuerdas 5 y 4, la 6 solo el 3 % de las notas) se coloca como si la tab estuviera UNA CUERDA más
// abajo con los MISMOS trastes (5/7 -> 6/7, 4/7 -> 5/7, 5/0 -> 6/0): las notas que más usa la canción van
// a la zona grave de nuestro mástil, con su mismo dibujo. Los tramos que sí usan la cuerda grave real se
// quedan como en la tab. Se devuelve un chart VIRTUAL que el motor de colocación (reduce.ts) trata como
// si fuera la tab; el sonido sigue siendo el real (reduceChart devuelve `sourceNotes` reales).
import type { Chart, ChartNote } from './chart';
import { leadOf } from './lead';
import type { LevelProfile } from './levels';

// La cuerda más grave del nivel, como mucho en este porcentaje de las notas de la tab...
export const FREE_STRING_MAX_SHARE = 0.1;
// ...y la siguiente (justo encima), con al menos este (el peso de la canción está ahí, no en las
// cuerdas agudas: las melodías de los villancicos ya se recolocan por registro).
export const NEXT_STRING_MIN_SHARE = 0.25;
// Solo tramos de al menos estos compases seguidos sin la cuerda grave: un riff que la toca un compás sí
// y otro no se queda como en la tab, sin partirse.
export const MIN_SHIFT_BARS = 4;
// Solo bajan los golpes MEDIOS: su nota guía (la raíz de un power chord, si no la más aguda) como mucho en
// MIDDLE_MAX_PITCH (Mi4: el 3/9) y en el traste MAX_SHIFT_FRET. Los agudos (melodía en la 1, el 4/19 de
// Vektor c100, acordes con 2/10 arriba) se quedan en su cuerda real y, además, el motor no los puede poner
// en la cuerda más grave (`keepUp`): bajando solo la base de un compás, la melodía acababa plegada encima,
// en la misma cuerda (6/0 con 6/5). Usuario: "las notas suficientemente agudas deben seguir quedando en
// las cuerdas de arriba".
export const MIDDLE_MAX_PITCH = 64;
export const MAX_SHIFT_FRET = 12;

// Afinación estándar del juego, incluidas las cuerdas de más (7: Si grave) para la altura virtual.
const OPEN: Record<number, number> = { 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40, 7: 35, 8: 30, 9: 25 };

// Golpes (notas a la vez) de un chart, en orden.
function onsetsOf(notes: ChartNote[]): ChartNote[][] {
  const out: ChartNote[][] = [];
  for (const note of notes) {
    const last = out[out.length - 1];
    if (last && Math.abs(note.t - last[0].t) < 0.005) last.push(note);
    else out.push([note]);
  }
  return out;
}

function isMiddle(onset: ChartNote[]): boolean {
  const lead = leadOf(onset);
  return lead.midi <= MIDDLE_MAX_PITCH && lead.fret <= MAX_SHIFT_FRET;
}

// Índices de `chart.bars` (orden de reproducción) que se bajan; vacío si la pista no cumple la puerta.
export function lowerBars(chart: Chart, profile: LevelProfile): Set<number> {
  const out = new Set<number>();
  if (profile.strings.length < 2 || chart.notes.length === 0) return out;
  const low = Math.max(...profile.strings);
  const onLow = chart.notes.filter((note) => note.string >= low).length;
  const onNext = chart.notes.filter((note) => note.string === low - 1).length;
  if (onLow > chart.notes.length * FREE_STRING_MAX_SHARE || onNext < chart.notes.length * NEXT_STRING_MIN_SHARE) return out;
  // Por compás: sin notas (no corta el tramo), libre (sin la cuerda grave) o con ella.
  const state: Array<'empty' | 'free' | 'low'> = chart.bars.map(() => 'empty');
  let b = 0;
  for (const note of chart.notes) {
    while (b + 1 < chart.bars.length && chart.bars[b + 1].t <= note.t + 1e-6) b++;
    if (note.string >= low) state[b] = 'low';
    else if (state[b] === 'empty') state[b] = 'free';
  }
  for (let i = 0; i < state.length;) {
    if (state[i] === 'low') { i++; continue; }
    let end = i;
    while (end < state.length && state[end] !== 'low') end++;
    const run = Array.from({ length: end - i }, (_, k) => i + k).filter((k) => state[k] === 'free');
    if (run.length >= MIN_SHIFT_BARS) run.forEach((k) => out.add(k));
    i = end;
  }
  return out;
}

// El chart virtual: en los compases elegidos, cada golpe MEDIO una cuerda más abajo con el mismo traste.
// `keepUp`: ids de las notas guía de los golpes agudos de esos compases (no van a la cuerda más grave).
export function lowerToFreeString(chart: Chart, profile: LevelProfile): { chart: Chart; keepUp: Set<number> } {
  const keepUp = new Set<number>();
  const bars = lowerBars(chart, profile);
  if (bars.size === 0) return { chart, keepUp };
  const lowered = new Map<number, ChartNote>();
  let b = 0;
  for (const onset of onsetsOf(chart.notes)) {
    while (b + 1 < chart.bars.length && chart.bars[b + 1].t <= onset[0].t + 1e-6) b++;
    if (!bars.has(b)) continue;
    if (!isMiddle(onset)) {
      keepUp.add(leadOf(onset).id);
      continue;
    }
    for (const note of onset) {
      if (OPEN[note.string + 1] === undefined) continue;
      lowered.set(note.id, { ...note, string: note.string + 1, midi: note.midi - (OPEN[note.string] - OPEN[note.string + 1]) });
    }
  }
  return { chart: { ...chart, notes: chart.notes.map((note) => lowered.get(note.id) ?? note) }, keepUp };
}
