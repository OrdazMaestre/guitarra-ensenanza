// Traducción de un chart real (Experto) a un nivel más sencillo, al estilo de las "reducciones" de
// Guitar Hero / Rock Band: los niveles bajos se sacan del Experto quitando densidad y llevando la
// melodía a pocos botones. Es pura (sin audio ni React) para poder probarla en Node.
//
// 4 pasos:
// 1) Golpes: notas agrupadas por instante; cada golpe tiene UNA nota guía (en un power chord, la
//    grave, que define el riff; en cualquier otro acorde, la aguda).
// 2) Densidad: un golpe por hueco de la rejilla del nivel (blancas, negras...), el más cercano, y
//    nunca dos notas a menos de `minGapBeats` (así los "chugs" rápidos quedan en una sola nota).
// 3) Frases: se cortan en los silencios largos o cada 2 compases, para recolocar el patrón.
// 4) Botón de cada nota, por frase: EXACTO si la frase cabe en los botones del nivel (intervalos
//    reales, subiendo/bajando la frase en bloque, mejor por octavas); si no, CONTORNO: misma nota
//    -> mismo botón, si sube va a la derecha y si baja a la izquierda, saltos proporcionales.
//
// Con VARIAS cuerdas (modo cuerdas) el paso 4 elige además la CUERDA de cada nota: la misma altura
// puede estar en dos sitios (cuerdas en cuartas: una cuerda más aguda = 5 trastes menos), y decidir
// entre "traste lejano" y "cuerda siguiente" se hace con el camino de MENOR COSTE de toda la frase
// (programación dinámica / Viterbi, como en la digitación automática clásica: Sayegh 1989), ver
// `placeSequence`. Los riffs repetidos se colocan siempre igual (decisión del usuario).
//
// Cada nota traducida es "dueña" (`sourceIds`) de las notas reales de la canción desde su golpe
// hasta la siguiente nota traducida: al acertarla, esas suenan fuerte (ver session.ts).

import type { Chart, ChartNote } from './chart';
import { RIFF_LEVELS, type LevelProfile } from './levels';

// Afinación estándar: altura de cada cuerda al aire (cuerda 1 = Mi agudo).
export const OPEN_MIDI: Record<number, number> = { 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40 };
const POWER_CHORD_INTERVALS = new Set([0, 5, 7, 12, 17, 19, 24]);
const PHRASE_MAX_BEATS = 8;
const PHRASE_MAX_BARS = 2;

interface Onset {
  t: number;
  pos: number;
  notes: ChartNote[];
  lead: ChartNote;
}

export interface LanePosition {
  string: number;
  fret: number;
  pitch: number;
}

function leadOf(notes: ChartNote[]): ChartNote {
  if (notes.length === 1) return notes[0];
  const sorted = [...notes].sort((a, b) => a.midi - b.midi);
  const low = sorted[0];
  const isPowerChord = sorted.every((note) => POWER_CHORD_INTERVALS.has(note.midi - low.midi));
  return isPowerChord ? low : sorted[sorted.length - 1];
}

// Posición en negras (con decimales) de un instante, según las líneas de pulso del chart (`q`).
export function makeBeatPosition(chart: Chart) {
  const beats = chart.beats;
  const quarterFallback = 60 / chart.bpm;
  const indexAt = (t: number) => {
    let lo = 0;
    let hi = beats.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (beats[mid].t <= t + 1e-6) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  // Segundos por negra alrededor de la línea i (tramo hasta la siguiente, o el anterior al final).
  const secondsPerQuarter = (i: number) => {
    const a = beats[i + 1] ? i : i - 1;
    if (a < 0 || !beats[a + 1]) return quarterFallback;
    return (beats[a + 1].t - beats[a].t) / (beats[a + 1].q - beats[a].q);
  };
  const pos = (t: number) => {
    if (beats.length === 0) return t / quarterFallback;
    const i = indexAt(t);
    return beats[i].q + (t - beats[i].t) / secondsPerQuarter(i);
  };
  const beatSeconds = (t: number) => (beats.length === 0 ? quarterFallback : secondsPerQuarter(indexAt(t)));
  return { pos, beatSeconds };
}

// Huecos de la rejilla del nivel, en negras, contados desde el inicio de cada compás. Con
// `minSlotSeconds`, la rejilla se ensancha (semicorcheas -> corcheas -> negras) en los pulsos donde
// un hueco duraría menos que eso en tiempo real: así una canción muy rápida pierde las notas de más,
// siempre las mismas en cada repetición, y una lenta se queda entera.
function gridSlots(chart: Chart, gridBeats: number, minSlotSeconds = 0): number[] {
  const slots: number[] = [];
  let barStartQ = 0;
  chart.beats.forEach((beat, i) => {
    if (beat.isBarStart) barStartQ = beat.q;
    const next = chart.beats[i + 1];
    const nextQ = next?.q ?? beat.q + 1;
    const secondsPerQuarter = next ? (next.t - beat.t) / Math.max(1e-6, next.q - beat.q) : 60 / chart.bpm;
    let grid = gridBeats;
    while (grid < 1 && grid * secondsPerQuarter < minSlotSeconds - 1e-6) grid *= 2;
    for (let q = beat.q; q < nextQ - 1e-6; q += Math.min(grid, 1)) {
      const rel = q - barStartQ;
      if (Math.abs(rel / grid - Math.round(rel / grid)) < 1e-6) slots.push(q);
    }
  });
  return slots;
}

function groupOnsets(chart: Chart, pos: (t: number) => number): Onset[] {
  const onsets: Onset[] = [];
  for (const note of chart.notes) {
    const last = onsets[onsets.length - 1];
    if (last && Math.abs(note.t - last.t) < 0.005) last.notes.push(note);
    else onsets.push({ t: note.t, pos: pos(note.t), notes: [note], lead: note });
  }
  for (const onset of onsets) onset.lead = leadOf(onset.notes);
  return onsets;
}

function pickByGrid(onsets: Onset[], slots: number[], profile: LevelProfile): Onset[] {
  // Cada golpe va al hueco más cercano; cada hueco se queda con el golpe más cercano a él.
  const best = new Map<number, Onset>();
  let j = 0;
  for (const onset of onsets) {
    while (j + 1 < slots.length && Math.abs(slots[j + 1] - onset.pos) <= Math.abs(slots[j] - onset.pos)) j++;
    const slot = slots[j];
    if (slot === undefined) continue;
    const current = best.get(slot);
    if (!current || Math.abs(onset.pos - slot) < Math.abs(current.pos - slot)) best.set(slot, onset);
  }
  const picked = [...best.values()].sort((a, b) => a.t - b.t);
  // Aire entre notas: en pulsos (rejilla del nivel) Y en segundos reales -- a 212 bpm una blanca
  // dura 0,57 s, demasiado poco para un principiante. Una nota que REPITE la anterior (los "chugs"
  // rápidos) necesita aún más hueco. Lo que se quita no se pierde: sigue sonando con la canción
  // real al acertar la nota anterior, que es su dueña (ver reduceChart).
  const kept: Onset[] = [];
  for (const onset of picked) {
    const prev = kept[kept.length - 1];
    if (prev) {
      if (onset.pos - prev.pos < profile.minGapBeats - 0.05) continue;
      const gapSeconds = onset.t - prev.t;
      if (gapSeconds < profile.minGapSeconds - 1e-3) continue;
      if (onset.lead.midi === prev.lead.midi && gapSeconds < profile.repeatGapSeconds - 1e-3) continue;
    }
    kept.push(onset);
  }
  return kept;
}

// Tope de densidad por ventana del compás (`profile.fastWindow`, la reducción del "Hard" de Guitar
// Hero): en cada tramo de `quarters` negras contado desde el inicio del compás, como mucho `max`
// notas, pero solo si el tramo va rápido (algún hueco de menos de `belowSeconds`). Depende solo de la
// posición en el compás y de las notas, así que un riff repetido pierde siempre las mismas (un tope de
// notas por segundo deslizante quitaba notas distintas en cada repetición). Se quitan primero las que
// REPITEN la nota anterior (siguen sonando con la canción, su dueña es la anterior), luego las de
// posición más débil (contratiempos de semicorchea, luego de corchea) y, si empatan, las más tardías.
// La primera nota del tramo no se quita nunca.
function capFastWindows(kept: Onset[], chart: Chart, profile: LevelProfile): Onset[] {
  const window = profile.fastWindow;
  if (!window) return kept;
  const barStarts = chart.beats.filter((b) => b.isBarStart).map((b) => b.q);
  const barStartOf = (pos: number) => {
    let start = barStarts[0] ?? 0;
    for (const q of barStarts) {
      if (q <= pos + 1e-6) start = q;
      else break;
    }
    return start;
  };
  const groups = new Map<number, number[]>();
  kept.forEach((onset, i) => {
    const barStart = barStartOf(onset.pos);
    const key = barStart + Math.floor((onset.pos - barStart) / window.quarters + 1e-6) * window.quarters;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(i);
  });
  const weakness = (onset: Onset) => {
    const frac = (onset.pos - barStartOf(onset.pos)) % 1;
    if (Math.min(frac, 1 - frac) < 0.05) return 0;
    return Math.abs(frac - 0.5) < 0.05 ? 1 : 2;
  };
  const drop = new Set<number>();
  for (const group of groups.values()) {
    if (group.length <= window.max) continue;
    const fast = group.slice(1).some((i, k) => kept[i].t - kept[group[k]].t < window.belowSeconds - 1e-3);
    if (!fast) continue;
    const candidates = group.slice(1).map((i, k) => ({ i, repeats: kept[i].lead.midi === kept[group[k]].lead.midi, weak: weakness(kept[i]) }));
    candidates.sort((a, b) => Number(b.repeats) - Number(a.repeats) || b.weak - a.weak || b.i - a.i);
    for (const c of candidates.slice(0, group.length - window.max)) drop.add(c.i);
  }
  return kept.filter((_, i) => !drop.has(i));
}

// Frase nueva tras un silencio claramente más largo que el hueco normal del nivel, o cada 2 compases.
// Con `barOf` (niveles de varias cuerdas) la frase se corta cada 2 COMPASES exactos en vez de cada
// 8 pulsos: cada compás tiene su propio límite de cuerdas, y una frase que se metiera en el compás
// siguiente le impondría su transporte (p. ej. el barrido de Kirk, compases 11-12, no podía ir en
// La+Re porque la frase se comía el principio del 13, de una sola cuerda).
function splitPhrases(kept: Onset[], profile: LevelProfile, beatSeconds: (t: number) => number, barOf?: number[]): number[] {
  const phrase: number[] = [];
  let current = 0;
  let startPos = kept[0]?.pos ?? 0;
  let startBar = barOf?.[0] ?? 0;
  kept.forEach((onset, i) => {
    if (i > 0) {
      const gap = onset.pos - kept[i - 1].pos;
      const usualGap = Math.max(profile.minGapBeats, profile.minGapSeconds / beatSeconds(onset.t));
      const tooLong = barOf ? barOf[i] - startBar >= PHRASE_MAX_BARS : onset.pos - startPos >= Math.max(PHRASE_MAX_BEATS, usualGap * 4);
      if (gap > usualGap + 1.5 || tooLong) {
        current++;
        startPos = onset.pos;
        if (barOf) startBar = barOf[i];
      }
    }
    phrase.push(current);
  });
  return phrase;
}

// Alturas que se pueden tocar en este nivel, de grave a agudo, sin repetir.
function laneLayout(profile: LevelProfile) {
  const positions: LanePosition[] = [];
  for (const string of profile.strings) {
    const maxFret = Math.min(profile.maxFret, profile.maxFretByString?.[string] ?? profile.maxFret);
    for (let fret = profile.minFret; fret <= maxFret; fret++) {
      positions.push({ string, fret, pitch: OPEN_MIDI[string] + fret });
    }
  }
  const pitches = [...new Set(positions.map((p) => p.pitch))].sort((a, b) => a - b);
  return { positions, pitches };
}

// Desplazamiento (en semitonos) que mete TODA la frase en los botones del nivel con sus intervalos
// reales; primero por octavas (suena igual), luego por semitonos. null si no cabe.
function exactShift(pitches: number[], available: Set<number>): number | null {
  const fits = (shift: number) => pitches.every((p) => available.has(p + shift));
  for (let k = 0; k <= 6; k++) {
    for (const shift of k === 0 ? [0] : [-12 * k, 12 * k]) if (fits(shift)) return shift;
  }
  for (let s = 1; s <= 48; s++) {
    for (const shift of [-s, s]) if (fits(shift)) return shift;
  }
  return null;
}

// Contorno: reparte las alturas de la frase entre los N botones, proporcional a la distancia entre
// notas, con un botón distinto para cada altura distinta siempre que quepan (orden estricto).
function contourLanes(pitches: number[], laneCount: number): Map<number, number> {
  const unique = [...new Set(pitches)].sort((a, b) => a - b);
  const map = new Map<number, number>();
  if (unique.length === 1) {
    map.set(unique[0], Math.floor((laneCount - 1) / 2));
    return map;
  }
  const min = unique[0];
  const span = unique[unique.length - 1] - min;
  const lanes = unique.map((p) => Math.round(((p - min) / span) * (laneCount - 1)));
  if (unique.length <= laneCount) {
    for (let k = 1; k < lanes.length; k++) lanes[k] = Math.max(lanes[k], lanes[k - 1] + 1);
    for (let k = lanes.length - 1; k >= 0; k--) lanes[k] = Math.min(lanes[k], laneCount - 1 - (lanes.length - 1 - k));
  }
  unique.forEach((p, k) => map.set(p, lanes[k]));
  return map;
}

// ---- Colocación por menor coste (niveles con varias cuerdas) ----

// Pesos de la regla "traste lejano vs. cuerda siguiente": dentro de la "caja" de la mano (los
// trastes que se alcanzan sin moverla) moverse es gratis; fuera, cada traste cuesta lo mismo que
// cambiar de cuerda. PLACE_WEIGHTS no está puesto a ojo: es lo que más se parece a un guitarrista
// real, medido colocando SIN restricciones las 1716 notas sueltas de las tabs de public/tabs y
// comparando con dónde las puso el tabulador (74 % idénticas; 70 % con los pesos iniciales).
export interface PlaceWeights {
  fret: number; // por traste que la mano tiene que moverse fuera de la caja
  string: number; // por cuerda que se cambia
  box: number; // trastes alcanzables sin mover la mano (además del de partida)
  hurry: number; // segundos "cómodos" para un cambio; con menos tiempo cuesta más (de ×0,5 a ×3)
  tab: number; // por NO poner la nota donde la puso la tablatura real (si allí se puede)
  high: number; // por traste por encima del 5 (los trastes bajos son más fáciles)
  open: number; // premio por cuerda al aire (no hace falta mover la mano)
  pattern: number; // por colocar una nota de un motivo repetido distinto de su versión elegida
  leap: number; // por (traste fuera de la caja)²: los saltos largos dentro de la frase, carísimos
  zone: number; // por traste de distancia a la zona de su altura (graves izquierda, agudas derecha)
  register: number; // por semitono de distancia a la altura que le toca en el mapa de registro
  order?: number; // por dos notas seguidas en cuerdas distintas con la más aguda en la cuerda más grave
}

export const PLACE_WEIGHTS: PlaceWeights = { fret: 1, string: 1, box: 3, hurry: 0.2, tab: 1.5, high: 0.1, open: 1, pattern: 3, leap: 0, zone: 0, register: 0 };

// Pesos del JUEGO (niveles con varias cuerdas; decisión del usuario, 2026-10-27): no se busca
// imitar a un guitarrista sino que se lea bien jugando -- figuras compactas aunque cambien de
// cuerda (cambiar de cuerda, barato), saltos largos dentro de la frase casi prohibidos (como en el
// modo trastes, donde la melodía avanza traste a traste), cada altura en su zona del mástil y los
// motivos repetidos siempre con el mismo dibujo. Ajustados midiendo en tests/riff-reduce.spec.ts.
// Rejilla (2026-10-27) sobre 6 canciones: con estos valores no queda ningún salto de más de 5
// trastes dentro de una frase, la altura real y el traste van de la mano (Spearman 0,85-0,89) y en
// Kirk el solo cae de media en el traste ~6 y los riffs en el ~2.
// `tab` 3 (2026-10-27): con la fidelidad bien aplicada (ver placePhraseMulti), 1,5 dejaba transportes
// innecesarios; con 3, las notas cuya posición real cabe en el nivel salen idénticas a la tab en el
// 98,8-99,7 % (James y Kirk, Medio y Avanzado cuerdas). Con 5 casi no cambia.
export const LEVEL_WEIGHTS: PlaceWeights = { ...PLACE_WEIGHTS, string: 0.5, box: 2, leap: 1, zone: 0.7, pattern: 8, tab: 3, register: 1.5, order: 6 };
// Riffs compartidos con la guitarra que manda (ver `followPins`): ir a otro sitio cuesta esto por
// nota, mucho más que cualquier otro término.
const PIN_COST = 30;

// La MISMA altura dos veces seguidas no cambia de sitio (así funciona "mantener pulsado").
const SAME_PITCH_MOVE_COST = 50;
// Trastes de margen alrededor de la zona preferida sin coste (la zona orienta, no obliga: los
// tappings pueden abrirse).
const ZONE_TOLERANCE = 2;
// Semitonos de margen alrededor de la altura que marca el mapa de registro, sin coste.
const REGISTER_TOLERANCE = 3;

export interface PlaceItem {
  pitch: number;
  t: number;
  // Dónde la puso la tablatura real (solo si es la misma altura).
  real?: { string: number; fret: number };
  // Traste preferido para esta nota (zonas: graves a la izquierda, agudas a la derecha).
  zoneFret?: number;
  // Altura que le toca según el mapa de registro de la pista (ver `registerMap`).
  registerPitch?: number;
}

// Coste de pasar de `prev` (con la mano en `prevHand`) a `place`, `dt` segundos después.
function moveCost(prev: LanePosition, prevHand: number | null, place: LanePosition, samePitch: boolean, dt: number, weights: PlaceWeights) {
  if (samePitch && (prev.string !== place.string || prev.fret !== place.fret)) return SAME_PITCH_MOVE_COST;
  const hurry = Math.min(3, Math.max(0.5, weights.hurry / Math.max(dt, 1e-3)));
  const handJump = place.fret === 0 || prevHand === null ? 0 : Math.abs(place.fret - prevHand);
  const out = Math.max(0, handJump - weights.box);
  // ORDEN VERTICAL (kids-ux-advisor, 2026-11-02): la nota más aguda, en la cuerda más aguda (carril de
  // arriba), para que lo que se ve siga lo que se oye. Las tabs reales lo cumplen al 100 %; el juego no
  // siempre (James en Medio cuerdas, 84 %; Carol of the Bells en Difícil, 65 %).
  const inverted = weights.order && place.string !== prev.string && place.pitch !== prev.pitch
    && (place.pitch > prev.pitch) !== (place.string < prev.string) ? weights.order : 0;
  return (weights.fret * out + weights.leap * out * out + weights.string * Math.abs(place.string - prev.string)) * hurry + inverted;
}

// Camino de menor coste (Viterbi). El estado es (posición, traste de la mano): una cuerda al aire
// no mueve la mano, así que el salto se mide desde la última nota pisada. null si alguna altura no
// tiene sitio.
export function placeSequence(
  items: PlaceItem[],
  positions: LanePosition[],
  weights: PlaceWeights = PLACE_WEIGHTS,
  unary?: (index: number, place: LanePosition) => number,
  // Posiciones permitidas para cada nota (límite de cuerdas por compás, mitad derecha de un pasaje
  // rápido...); sin él, todas.
  allowedAt?: (index: number, place: LanePosition) => boolean,
): { path: LanePosition[]; cost: number } | null {
  if (items.length === 0) return { path: [], cost: 0 };
  type State = { cost: number; place: LanePosition; hand: number | null; back: State | null };
  const noteCost = (item: PlaceItem, index: number, place: LanePosition) => {
    let cost = weights.high * Math.max(0, place.fret - 5);
    if (place.fret === 0) cost -= weights.open;
    if (item.real && (item.real.string !== place.string || item.real.fret !== place.fret)) cost += weights.tab;
    if (item.zoneFret !== undefined) cost += weights.zone * Math.max(0, Math.abs(place.fret - item.zoneFret) - ZONE_TOLERANCE);
    if (item.registerPitch !== undefined) cost += weights.register * Math.max(0, Math.abs(place.pitch - item.registerPitch) - REGISTER_TOLERANCE);
    return cost + (unary ? unary(index, place) : 0);
  };
  let layer: State[] = [];
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const places = positions.filter((p) => p.pitch === item.pitch && (!allowedAt || allowedAt(index, p)));
    const next = new Map<string, State>();
    for (const place of places) {
      const own = noteCost(item, index, place);
      if (index === 0) {
        const hand = place.fret === 0 ? null : place.fret;
        next.set(`${place.string}:${place.fret}:${hand}`, { cost: own, place, hand, back: null });
        continue;
      }
      const prevItem = items[index - 1];
      for (const prev of layer) {
        const move = moveCost(prev.place, prev.hand, place, item.pitch === prevItem.pitch, item.t - prevItem.t, weights);
        const hand = place.fret === 0 ? prev.hand : place.fret;
        const key = `${place.string}:${place.fret}:${hand}`;
        const cost = prev.cost + move + own;
        const known = next.get(key);
        if (!known || cost < known.cost) next.set(key, { cost, place, hand, back: prev });
      }
    }
    layer = [...next.values()];
    if (layer.length === 0) return null;
  }
  const best = layer.reduce((a, b) => (b.cost < a.cost ? b : a));
  const path: LanePosition[] = [];
  for (let state: State | null = best; state; state = state.back) path.push(state.place);
  return { path: path.reverse(), cost: best.cost };
}

// Dificultad interna de un trozo ya colocado (solo movimientos), para elegir la versión más
// sencilla de un motivo repetido.
function pathCost(places: LanePosition[], times: number[], weights: PlaceWeights) {
  let cost = 0;
  let hand: number | null = places[0].fret === 0 ? null : places[0].fret;
  for (let k = 1; k < places.length; k++) {
    cost += moveCost(places[k - 1], hand, places[k], places[k].pitch === places[k - 1].pitch, times[k] - times[k - 1], weights);
    if (places[k].fret !== 0) hand = places[k].fret;
  }
  return cost;
}

// Coloca una frase en varias cuerdas. Alturas candidatas (cada una con un coste extra pequeño):
// - la real (0) y sus octavas (1 por octava);
// - "trasladar de cuerda" (1,5, + 1 por octava): la frase pasa de una cuerda real a una del nivel
//   CON LA MISMA FORMA, p. ej. el pedal de Thunderstruck en la Si al aire (2/0 2/4 2/0 2/7) -> en la
//   La al aire (5/0 5/4 5/0 5/7), o el barrido del solo de Kirk en las cuerdas 1-2 (1/17 1/12 2/13
//   2/12) -> dos cuerdas del nivel, una o más octavas más abajo. Ahí la "posición real" que se
//   intenta respetar es la trasladada;
// - cualquier otro desplazamiento por semitonos que quepa (3): así la zona y la figura deciden;
// - si nada cabe, el contorno (6): misma dirección, saltos proporcionales ("cromatismos").
// LÍMITE DE CUERDAS POR COMPÁS (decisión del usuario, 2026-10-27): si la tab usa 1 o 2 cuerdas en
// un compás, el juego usa como mucho esas mismas, CONTIGUAS (con 3 cuerdas: Mi+La o La+Re, nunca
// Mi+Re); un barrido de 2 cuerdas repartido en 3 no se lee. Es obligatorio: se prueban todas las
// combinaciones de grupos de cuerdas de los compases de la frase (`groupOptions`) y, para cada una,
// los candidatos de arriba sobre las alturas de ese grupo. Se queda con lo más barato (coste del
// camino + extra).
const OCTAVE_SHIFT_COST = 1;
const STRING_TRANSFER_COST = 1.5;
const SEMITONE_SHIFT_COST = 3;
const CONTOUR_COST = 6;
// Trastes que una nota puede pasarse del máximo de su cuerda y aun así quedarse en ella, bajada (ver
// "posición de partida" en placePhraseMulti).
const MAX_CLAMP_FRETS = 3;
// Distancia entre cuerdas vecinas en las que usa modo cuerdas (6-5-4-3, cuartas justas).
const STRING_INTERVAL = 5;

// PASAJES RÁPIDOS TOCABLES (petición del usuario, 2026-11-02, al quitar el límite de 0,1 s del modo
// cuerdas): en cada tiempo de negra cuyas notas van a menos de 0,1 s, todas caben en una caja de 4
// trastes (un dedo por traste; las cuerdas al aire, si la caja empieza en el 0 o el 1), salvo como mucho
// UNA posición fuera (la típica cuerda al aire en un punteo, aunque se repita). La tab real lo cumple
// casi siempre (Death 151/154 tiempos, Vektor 376/380); lo que no, se paga caro al elegir candidato.
const FAST_NOTE_SECONDS = 0.1;
const HAND_BOX_FRETS = 4;
const UNPLAYABLE_COST = 40;
export function outsideHandBox(positions: Array<{ string: number; fret: number }>): number {
  const distinct = [...new Map(positions.map((p) => [`${p.string}/${p.fret}`, p])).values()];
  let best = Infinity;
  for (let from = 0; from <= 24; from++) {
    const out = distinct.filter((p) => !(p.fret >= from && p.fret < from + HAND_BOX_FRETS) && !(p.fret === 0 && from <= 1)).length;
    best = Math.min(best, out);
  }
  return best;
}
function unplayableBeats(phrase: Onset[], path: LanePosition[]): number {
  let count = 0;
  for (let i = 0; i < phrase.length;) {
    const beat = Math.floor(phrase[i].pos + 1e-6);
    let end = i + 1;
    while (end < phrase.length && Math.floor(phrase[end].pos + 1e-6) === beat) end++;
    let fast = end - i >= 3;
    for (let k = i + 1; fast && k < end; k++) if (phrase[k].t - phrase[k - 1].t >= FAST_NOTE_SECONDS - 1e-6) fast = false;
    if (fast && outsideHandBox(path.slice(i, end)) > 1) count++;
    i = end;
  }
  return count;
}

// NO DAR LA VUELTA A LOS RIFFS (petición del usuario, 2026-11-02; regla revisada con guitar-music-advisor
// y kids-ux-advisor): en el estribillo de Death - Crystal Mountain (4/10 5/7 5/0 5/7, la línea Do-Si sobre
// el Mi y la La al aire), Medio y Avanzado cuerdas bajaban SOLO el Do de octava (6/8) y quedaba por
// debajo del Mi: otro riff, y lo que el niño ve ya no sigue lo que oye. Cada intervalo de la frase cuyo
// SENTIDO cambia respecto a la tab cuesta: invertir (sube <-> baja) 16 si alguno de los dos mide 3
// semitonos o más (el agente proponía 8; con 16 el orden vertical de Kirk en Medio sube del 78 al 92 %
// sin empeorar nada, y más no gana), 4 si los dos son pasos pequeños; aplanar (en la tab sube o baja y
// aquí queda igual) 4. Igual en la tab y distinto aquí no cuenta (ya lo cubre SAME_PITCH_MOVE_COST). La tab, los
// transportes y el contorno no invierten nada: solo pagan los candidatos que mueven unas notas sí y
// otras no. Así gana el riff entero una cuerda más abajo (Medio: 5/10 6/7 6/0 6/7) o la tab exacta.
const CONTOUR_FLIP_COST = 16;
const CONTOUR_STEP_FLIP_COST = 4;
const CONTOUR_FLATTEN_COST = 4;
function contourFlipCost(real: number[], game: number[]): number {
  let cost = 0;
  for (let k = 1; k < real.length; k++) {
    const r = real[k] - real[k - 1];
    const g = game[k] - game[k - 1];
    if (r === 0) continue;
    if (g === 0) cost += CONTOUR_FLATTEN_COST;
    else if (Math.sign(g) !== Math.sign(r)) cost += Math.abs(r) >= 3 || Math.abs(g) >= 3 ? CONTOUR_FLIP_COST : CONTOUR_STEP_FLIP_COST;
  }
  return cost;
}

function placePhraseMulti(
  phrase: Onset[],
  layout: ReturnType<typeof laneLayout>,
  zoneOf: (pitch: number) => number,
  registerOf: ((pitch: number) => number) | null,
  // Para cada nota, el grupo de compás al que pertenece; y para cada grupo, sus opciones de cuerdas.
  groupOf: number[],
  groupOptions: number[][][],
  unary?: (index: number, place: LanePosition) => number,
  // Ventana de trastes [de, a] de cada grupo (pasaje rápido aislado en una cuerda); si no, todos.
  groupFrets: Array<[number, number]> = [],
): LanePosition[] {
  const maxFretOf = new Map<number, number>();
  for (const p of layout.positions) maxFretOf.set(p.string, Math.max(maxFretOf.get(p.string) ?? 0, p.fret));
  const minOf = (g: number) => groupFrets[g]?.[0] ?? 0;
  const maxOf = (g: number) => groupFrets[g]?.[1] ?? Infinity;
  const pitchesOn = (strings: number[], minFret = 0, maxFret = Infinity) => [...new Set(layout.positions.filter((p) => strings.includes(p.string) && p.fret >= minFret && p.fret <= maxFret).map((p) => p.pitch))].sort((a, b) => a - b);

  // Cuerdas que cada grupo de compás puede llegar a usar (en alguna de sus opciones).
  const reachable = groupOptions.map((options) => new Set(options.flat()));

  // POSICIÓN DE PARTIDA de cada nota: la de la tab, salvo las que se pasan POR POCO (1 a
  // MAX_CLAMP_FRETS trastes) del máximo de su cuerda, que se quedan EN SU CUERDA y bajan (petición del
  // usuario, 2026-11-02: Death - Lack Of Comprehension, riff principal, pedal 6/8 con 5/12 encima; la
  // cuerda 5 llega al 11 y la 5/12 acababa en 5/0, por debajo del pedal). Por frase y por cuerda bajan
  // JUNTAS (por compás, una misma nota repetida podía bajar distinto en dos compases seguidos), lo justo para que la más alta quede en el máximo, y conservan sus distancias (5/12 y 5/14
  // -> 5/9 y 5/11). Cambia la altura un poco, pero no el dibujo. Todos los candidatos y la fidelidad a la
  // tab parten de aquí, como si la tab dijera eso.
  const clampShift = new Map<string, number>();
  phrase.forEach((onset, k) => {
    const { string, fret } = onset.lead;
    const cap = maxFretOf.get(string);
    if (cap === undefined || !reachable[groupOf[k]].has(string) || fret <= cap || fret > cap + MAX_CLAMP_FRETS) return;
    const key = `${string}`;
    clampShift.set(key, Math.max(clampShift.get(key) ?? 0, fret - cap));
  });
  const start = phrase.map((onset, k) => {
    const { string, fret } = onset.lead;
    const cap = maxFretOf.get(string);
    const shift = clampShift.get(`${string}`);
    const clamped = shift !== undefined && cap !== undefined && reachable[groupOf[k]].has(string) && fret > cap && fret <= cap + MAX_CLAMP_FRETS;
    return { string, fret: clamped ? fret - shift : fret };
  });
  const pitches = start.map((p) => OPEN_MIDI[p.string] + p.fret);
  let best: { path: LanePosition[]; cost: number } | null = null;
  const tryCombo = (combo: number[][]) => {
    const stringsOf = phrase.map((_, k) => combo[groupOf[k]]);
    const sets = stringsOf.map((strings) => new Set(strings));
    // FIDELIDAD (petición del usuario): si la posición real de la tab se puede usar en este compás
    // (su cuerda está en ALGUNA de las opciones de cuerdas del compás, dentro de su traste máximo),
    // esa es el objetivo de la nota para TODOS los candidatos y TODAS las combinaciones -- uno que
    // transporte la frase o la mueva a otras cuerdas sin necesidad paga `tab` por cada nota que se
    // aparta. (Antes solo pagaban los candidatos que conservaban la forma en la combinación probada,
    // y el resto se libraba entero: James salía 6/0 donde la tab dice 6/2, o el compás 33 en la Re.)
    const fixedReal = start.map((p, k) => (reachable[groupOf[k]].has(p.string) && p.fret <= maxFretOf.get(p.string)! && p.fret >= minOf(groupOf[k]) && p.fret <= maxOf(groupOf[k])
      ? { string: p.string, fret: p.fret }
      : undefined));
    const pitchSets = new Map<string, Set<number>>();
    const availableAt = stringsOf.map((strings, k) => {
      const key = `${strings.join()}|${groupOf[k]}`;
      let set = pitchSets.get(key);
      if (!set) pitchSets.set(key, (set = new Set(pitchesOn(strings, minOf(groupOf[k]), maxOf(groupOf[k])))));
      return set;
    });
    const fits = (k: number, pitch: number) => availableAt[k].has(pitch);
    const shifts = new Map<number, number>();
    const offer = (shift: number, extra: number) => {
      if (pitches.every((p, k) => fits(k, p + shift)) && extra < (shifts.get(shift) ?? Infinity)) shifts.set(shift, extra);
    };
    const all = pitchesOn([...new Set(stringsOf.flat())], Math.min(...combo.map((_, g) => minOf(g))));
    const lo = Math.min(...pitches);
    const hi = Math.max(...pitches);
    for (let shift = all[0] - lo; shift <= all[all.length - 1] - hi; shift++) offer(shift, SEMITONE_SHIFT_COST + Math.abs(shift) * 0.01);
    for (let k = -4; k <= 4; k++) {
      offer(12 * k, OCTAVE_SHIFT_COST * Math.abs(k));
      for (const realString of new Set(phrase.map((onset) => onset.lead.string))) {
        for (const string of all.length ? [...maxFretOf.keys()] : []) offer(OPEN_MIDI[string] - OPEN_MIDI[realString] + 12 * k, STRING_TRANSFER_COST + OCTAVE_SHIFT_COST * Math.abs(k));
      }
    }
    // `octaveMoved`: notas que ese candidato baja o sube de octava una a una (no pagan el mapa de
    // registro: es justo lo que se hace con las pocas que no caben).
    const candidates: Array<{ pitches: number[]; extra: number; shift: number | null; octaveMoved?: boolean[] }> = [...shifts].map(([shift, extra]) => ({
      pitches: pitches.map((p) => p + shift),
      extra,
      shift,
    }));
    // La tab tal cual, con las notas que no están en su sitio real movidas SOLO ELLAS de octava (a la
    // octava que cabe más cerca de la nota anterior): si a una frase le sobra alguna nota (James en
    // Medio: unas pocas en la Re), el resto se queda como en la tab en vez de transportarlo todo o
    // de mandarla lejos por el mástil.
    // Solo en frases que son MAYORITARIAMENTE la tab en su sitio (si casi nada cabe, como un solo en
    // las cuerdas agudas, no es "la tab con alguna nota movida" y mandan el resto de candidatos).
    const inPlace = fixedReal.filter((real, k) => real && sets[k].has(real.string)).length;
    if (inPlace < pitches.length && inPlace * 2 >= pitches.length) {
      let folded = 0;
      const out: number[] = [];
      let ok = true;
      pitches.forEach((p, k) => {
        if (fixedReal[k] && sets[k].has(fixedReal[k]!.string)) {
          out.push(p);
          return;
        }
        const ref = out.length > 0 ? out[out.length - 1] : (fixedReal.findIndex(Boolean) >= 0 ? pitches[fixedReal.findIndex(Boolean)] : p);
        let best: number | null = null;
        for (let oct = -4; oct <= 4; oct++) {
          const q = p + 12 * oct;
          if (fits(k, q) && (best === null || Math.abs(q - ref) < Math.abs(best - ref))) best = q;
        }
        if (best === null) ok = false;
        else {
          if (best !== p) folded++;
          out.push(best);
        }
      });
      const octaveMoved = out.map((q, k) => q !== pitches[k]);
      if (ok && folded > 0) candidates.push({ pitches: out, extra: OCTAVE_SHIFT_COST * folded, shift: 0, octaveMoved });
      else if (ok && !shifts.has(0)) candidates.push({ pitches: out, extra: 0, shift: 0, octaveMoved });
      // ...y la misma idea por CÉLULAS rápidas (pasajes tocables): en un tiempo de negra rápido donde
      // una nota ha cambiado de octava, cambian con ella las demás notas pisadas de ese tiempo (si
      // caben); las cuerdas al aire, como un pedal, se quedan. Vektor c43: 5/13 5/11 sobre 6/0 -> 6/6 6/4
      // sobre 6/0, en vez de 6/6 junto a 5/11.
      if (ok && folded > 0) {
        const cell = [...out];
        let moved = folded;
        for (let i = 0; i < phrase.length;) {
          const beat = Math.floor(phrase[i].pos + 1e-6);
          let end = i + 1;
          while (end < phrase.length && Math.floor(phrase[end].pos + 1e-6) === beat) end++;
          let fast = end - i >= 3;
          for (let k = i + 1; fast && k < end; k++) if (phrase[k].t - phrase[k - 1].t >= FAST_NOTE_SECONDS - 1e-6) fast = false;
          const shifted = Array.from({ length: end - i }, (_, j) => i + j).find((k) => out[k] !== pitches[k]);
          if (fast && shifted !== undefined) {
            const delta = out[shifted] - pitches[shifted];
            for (let k = i; k < end; k++) {
              if (cell[k] !== pitches[k] || phrase[k].lead.fret === 0) continue;
              if (fits(k, pitches[k] + delta)) {
                cell[k] = pitches[k] + delta;
                moved++;
              }
            }
          }
          i = end;
        }
        if (moved > folded) candidates.push({ pitches: cell, extra: OCTAVE_SHIFT_COST * moved, shift: 0, octaveMoved: cell.map((q, k) => q !== pitches[k]) });
      }
    }
    // La tab tal cual, con las notas que no están en su sitio movidas a la cuerda más cercana del compás
    // SIN CAMBIAR DE TRASTE: el dibujo de la tab, aplastado sobre las cuerdas que hay. Bajarlas de octava
    // da la vuelta al riff y transportar la frase mueve las notas que sí cabían (James 25-26: 4/4 -> 5/4,
    // con el 6/2 en su sitio). Si el riff ENTERO cabe una cuerda más abajo o más arriba, conserva mejor su
    // forma y gana eso (Crystal Mountain en Medio: 5/10 6/7 6/0 6/7, decisión del 2026-11-02).
    const wholeRiffFits = shifts.has(-STRING_INTERVAL) || shifts.has(STRING_INTERVAL);
    if (!wholeRiffFits && inPlace < pitches.length && inPlace * 2 >= pitches.length) {
      let moved = 0;
      const out = pitches.map((p, k) => {
        if (fixedReal[k] && sets[k].has(fixedReal[k]!.string)) return p;
        const near = [...sets[k]].sort((a, b) => Math.abs(a - start[k].string) - Math.abs(b - start[k].string))[0];
        moved++;
        return OPEN_MIDI[near] + start[k].fret;
      });
      if (out.every((p, k) => fits(k, p))) candidates.push({ pitches: out, extra: OCTAVE_SHIFT_COST * moved, shift: 0, octaveMoved: out.map((q, k) => q !== pitches[k]) });
    }
    if (candidates.length === 0) {
      // Contorno sobre las alturas de cada tramo de compases seguidos con las MISMAS cuerdas (si
      // todos usan las mismas, la frase entera, como siempre). Si un tramo empieza repitiendo la
      // última nota del anterior, se desplaza entero para que esa nota siga en la misma altura (y en
      // el mismo sitio: así se puede mantener pulsada) siempre que quepa.
      const out = new Array<number>(pitches.length);
      const segmentOf: number[] = [];
      pitches.forEach((_, k) => {
        // Mismas cuerdas Y misma ventana de trastes (un pasaje rápido aislado tiene la suya): si no,
        // las alturas de un tramo podrían no caber en los compases del otro.
        const same = k > 0 && combo[groupOf[k]].join() === combo[groupOf[k - 1]].join()
          && minOf(groupOf[k]) === minOf(groupOf[k - 1]) && maxOf(groupOf[k]) === maxOf(groupOf[k - 1]);
        segmentOf.push(k === 0 ? 0 : same ? segmentOf[k - 1] : segmentOf[k - 1] + 1);
      });
      for (let g = 0; g <= segmentOf[segmentOf.length - 1]; g++) {
        const idx = pitches.map((_, k) => k).filter((k) => segmentOf[k] === g);
        if (idx.length === 0) continue;
        const lanePitches = pitchesOn(combo[groupOf[idx[0]]], minOf(groupOf[idx[0]]), maxOf(groupOf[idx[0]]));
        const seg = idx.map((k) => pitches[k]);
        const lanes = contourLanes(seg, lanePitches.length);
        let laneSeq = seg.map((p) => lanes.get(p)!);
        for (let k = 1; k < laneSeq.length; k++) {
          const dir = Math.sign(seg[k] - seg[k - 1]);
          if (dir !== 0 && Math.sign(laneSeq[k] - laneSeq[k - 1]) !== dir) {
            laneSeq[k] = Math.min(lanePitches.length - 1, Math.max(0, laneSeq[k - 1] + dir));
          }
          // La misma altura justo repetida, en el mismo sitio (para mantener pulsado): el ajuste de arriba
          // es por aparición y podía mover solo una de las dos (Kirk, con la ventana de 5 trastes).
          else if (seg[k] === seg[k - 1]) laneSeq[k] = laneSeq[k - 1];
        }
        const first = idx[0];
        if (first > 0 && pitches[first] === pitches[first - 1] && out[first - 1] !== undefined) {
          const anchor = lanePitches.indexOf(out[first - 1]);
          const offset = anchor - laneSeq[0];
          if (anchor >= 0 && laneSeq.every((lane) => lane + offset >= 0 && lane + offset < lanePitches.length)) laneSeq = laneSeq.map((lane) => lane + offset);
          // Si el tramo entero no cabe desplazado, al menos esa altura se queda donde estaba; y si el tramo
          // nuevo ni la tiene (un pasaje rápido traspuesto, con su ventana), es la nota repetida del tramo
          // ANTERIOR la que se pone donde empieza el nuevo, si allí cabe (Kirk c18 -> c19 en Medio cuerdas).
          else if (anchor >= 0) laneSeq = laneSeq.map((lane, j) => (seg[j] === seg[0] ? anchor : lane));
          else {
            const startPitch = lanePitches[laneSeq[0]];
            for (let k = first - 1; k >= 0 && pitches[k] === pitches[first] && out[k] !== undefined; k--) {
              if (pitchesOn(combo[groupOf[k]], minOf(groupOf[k]), maxOf(groupOf[k])).includes(startPitch)) out[k] = startPitch;
            }
          }
        }
        idx.forEach((k, j) => { out[k] = lanePitches[laneSeq[j]]; });
      }
      candidates.push({ pitches: out, extra: CONTOUR_COST, shift: null });
    }
    for (const candidate of candidates) {
      // Si no, la posición real TRASLADADA: la cuerda permitida que, con este desplazamiento (y
      // alguna octava), conserva la forma de la tab (mismo traste, o ±12).
      const translated = (k: number) => {
        if (candidate.shift === null) return undefined;
        for (const string of stringsOf[k]) {
          const rest = candidate.shift - (OPEN_MIDI[string] - OPEN_MIDI[start[k].string]);
          const fret = start[k].fret + rest;
          if (rest % 12 === 0 && fret >= 0 && fret <= maxFretOf.get(string)!) return { string, fret };
        }
        return undefined;
      };
      const realOf = (_onset: Onset, k: number) => fixedReal[k] ?? translated(k);
      // La zona (graves a la izquierda, agudas a la derecha) solo orienta las notas que hay que MOVER: una
      // que cabe tal cual en la tab ya tiene su sitio (si no, un pedal grave en el 8 -- Death, 6/8 -- pagaba
      // zona en cada golpe y salía más barato transportar todo el compás).
      const items: PlaceItem[] = phrase.map((onset, k) => ({ pitch: candidate.pitches[k], t: onset.t, real: realOf(onset, k), zoneFret: fixedReal[k] ? undefined : zoneOf(onset.lead.midi), registerPitch: candidate.octaveMoved?.[k] ? undefined : registerOf?.(onset.lead.midi) }));
      const placed = placeSequence(items, layout.positions, LEVEL_WEIGHTS, unary, (k, place) => sets[k].has(place.string) && place.fret >= minOf(groupOf[k]) && place.fret <= maxOf(groupOf[k]));
      const cost = placed
        ? placed.cost + candidate.extra + UNPLAYABLE_COST * unplayableBeats(phrase, placed.path) + contourFlipCost(pitches, placed.path.map((p) => p.pitch))
        : Infinity;
      if (placed && (!best || cost < best.cost)) best = { path: placed.path, cost };
    }
  };
  // Todas las combinaciones de opciones de los grupos (≤ 2-3 compases por frase).
  const combo: number[][] = [];
  const walk = (g: number) => {
    if (g === groupOptions.length) {
      tryCombo([...combo]);
      return;
    }
    for (const option of groupOptions[g]) {
      combo.push(option);
      walk(g + 1);
      combo.pop();
    }
  };
  walk(0);
  return best!.path;
}

// Opciones de cuerdas de un compás en el que la tab usa las cuerdas `used`: grupos CONTIGUOS de
// min(|used|, cuerdas del nivel) y, además, las MISMAS cuerdas que la tab si están todas en el nivel
// aunque no sean contiguas (James, compás 48: Sol y La sin la Re -- lo más fiel es usar esas dos; si
// no, una nota tenía que cambiar de octava). Si la tab usa tantas o más que el nivel, todas.
function stringGroups(levelStrings: number[], used: Set<number>): number[][] {
  const sorted = [...levelStrings].sort((a, b) => a - b);
  const size = Math.max(1, Math.min(used.size, sorted.length));
  if (size >= sorted.length) return [sorted];
  const groups: number[][] = [];
  for (let i = 0; i + size <= sorted.length; i++) {
    const group = sorted.slice(i, i + size);
    if (group[group.length - 1] - group[0] === size - 1) groups.push(group);
  }
  const real = [...used].sort((a, b) => a - b);
  if (real.every((string) => sorted.includes(string)) && !groups.some((group) => group.join() === real.join())) groups.push(real);
  return groups;
}

// Clave de una frase para reconocer un riff repetido: alturas + ritmo (huecos en negras, a la
// semicorchea).
function phraseKey(phrase: Onset[]): string {
  return phrase.map((onset, k) => `${onset.lead.midi}@${k === 0 ? 0 : Math.round((onset.pos - phrase[k - 1].pos) * 4)}`).join(' ');
}

// Motivo: trozo de MOTIF_LENGTH notas seguidas (dentro de una frase) con las mismas alturas reales
// y el mismo ritmo.
const MOTIF_LENGTH = 4;
// Diferencia de altura (en el mapa de registro) que abre un tramo nuevo dentro de un pasaje rápido.
const PASSAGE_STRETCH_SEMITONES = 1;
// Hueco medio entre notas (s reales, a velocidad normal) por debajo del cual un compás es "rápido".
const FAST_GAP_SECONDS = 0.16;
const MOTIF_PASSES = 4;
const MOTIF_COST_TOLERANCE = 0.5;

// Zona preferida de cada altura real (decisión del usuario): las graves a la izquierda del mástil y
// las agudas a la derecha, repartiendo del percentil 5 al 95 de las alturas de la pista sobre los
// trastes del nivel. Así los riffs caen en el centro-izquierda y los solos a la derecha.
function zoneMap(kept: Onset[], profile: LevelProfile) {
  const sorted = kept.map((onset) => onset.lead.midi).sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))] ?? 40;
  const lo = at(0.05);
  const hi = Math.max(lo + 1, at(0.95));
  return (pitch: number) => profile.minFret + Math.min(1, Math.max(0, (pitch - lo) / (hi - lo))) * (profile.maxFret - profile.minFret);
}

// `barOf`: compás (índice en chart.bars) de cada nota; `stringsUsed`: qué cuerdas usa
// la tab real en cada compás.
// MAPA DE REGISTRO (petición del usuario, 2026-10-29): altura real -> altura que le toca en el juego,
// para conservar el ORDEN de alturas entre frases (lo agudo arriba, lo grave abajo, lo medio en
// medio). Antes cada frase se colocaba por su cuenta y una que cabía tal cual (el compás 17 de Kirk,
// en la Sol en Difícil) quedaba por ENCIMA de otra más aguda que había que bajar dos octavas (el 14).
// Si la pista cabe en lo que toca el nivel, el mapa es la identidad (James: la fidelidad a la tab no cambia). Si no, la
// mitad GRAVE del registro del nivel se queda tal cual (los riffs siguen en su sitio real) y todo lo
// que queda por encima se comprime, en orden, en la mitad aguda (el solo de Kirk).
function registerMap(kept: Onset[], levelPitches: number[]) {
  const sorted = kept.map((onset) => onset.lead.midi).sort((a, b) => a - b);
  const hi = sorted[sorted.length - 1] ?? 64;
  const levelLo = levelPitches[0];
  const levelHi = levelPitches[levelPitches.length - 1];
  // Cabe (como mucho un 5 % de notas por encima del nivel, que se bajan de octava una a una sin pagar
  // el mapa -- James en Medio, con unas pocas en la Re): IDENTIDAD, cada nota quiere su altura real
  // (así tampoco se va cada frase por su lado cuando ninguna nota está en su sitio de la tab, como
  // la melodía de Feliz Navidad en las cuerdas agudas). Si se pasan más, se comprime por arriba.
  if (sorted.filter((pitch) => pitch > levelHi).length <= sorted.length * 0.05) return (pitch: number) => pitch;
  const knee = (levelLo + levelHi) / 2;
  return (pitch: number) => (pitch <= knee ? pitch : knee + Math.min(1, (pitch - knee) / (hi - knee)) * (levelHi - knee));
}

function placeAllMulti(kept: Onset[], phraseOf: number[], profile: LevelProfile, barOf: number[], stringsUsed: Map<number, Set<number>>, pins: Array<LanePosition | null>): LanePosition[] {
  const layout = laneLayout(profile);
  const zoneOf = zoneMap(kept, profile);
  const registerOf = registerMap(kept, laneLayout(profile).pitches);
  const phrases: Array<[number, number]> = [];
  for (let i = 0; i < kept.length;) {
    let end = i;
    while (end < kept.length && phraseOf[end] === phraseOf[i]) end++;
    phrases.push([i, end]);
    i = end;
  }
  const samePlace = (a: LanePosition, b: LanePosition) => a.string === b.string && a.fret === b.fret && a.pitch === b.pitch;
  // Compases de PASAJE RÁPIDO TRANSPORTADO (ver abajo), aislados en una sola cuerda: compás -> cuerda
  // y traste mínimo. Vacío en la primera pasada.
  const fastBars = new Map<number, { string: number; frets: [number, number] }>();
  // Una pasada: cada frase por su cuenta; una frase igual que otra anterior se copia tal cual. Las
  // notas ancladas a la guitarra que manda pagan PIN_COST si van a otro sitio.
  const pass = (unaryAt?: (index: number, place: LanePosition) => number) => {
    const unary = (index: number, place: LanePosition) => (pins[index] && !samePlace(pins[index]!, place) ? PIN_COST : 0) + (unaryAt ? unaryAt(index, place) : 0);
    const placed: LanePosition[] = new Array(kept.length);
    const byKey = new Map<string, LanePosition[]>();
    // Cuerdas ya usadas en cada compás: un compás partido entre dos frases sigue con las mismas.
    const usedInBar = new Map<number, Set<number>>();
    for (const [i, end] of phrases) {
      const phrase = kept.slice(i, end);
      // Grupos de compás de la frase y sus opciones de cuerdas.
      const bars = [...new Set(barOf.slice(i, end))];
      const groupOf = barOf.slice(i, end).map((bar) => bars.indexOf(bar));
      const groupOptions = bars.map((bar) => {
        const isolated = fastBars.get(bar);
        if (isolated) return [[isolated.string]];
        const options = stringGroups(profile.strings, stringsUsed.get(bar) ?? new Set(profile.strings));
        const used = usedInBar.get(bar);
        const compatible = used ? options.filter((option) => [...used].every((string) => option.includes(string))) : options;
        return compatible.length > 0 ? compatible : options;
      });
      const groupFrets = bars.map((bar): [number, number] => fastBars.get(bar)?.frets ?? [0, Infinity]);
      const pinKey = pins.slice(i, end).map((pin) => (pin ? `${pin.string}/${pin.fret}` : '-')).join(',');
      const key = `${phraseKey(phrase)}|${groupOf.join(',')}|${JSON.stringify(groupOptions)}|${JSON.stringify(groupFrets)}|${pinKey}`;
      let path = byKey.get(key);
      if (!path) {
        path = placePhraseMulti(phrase, layout, zoneOf, registerOf, groupOf, groupOptions, (index, place) => unary(i + index, place), groupFrets);
        byKey.set(key, path);
      }
      path.forEach((place, k) => {
        placed[i + k] = place;
        const set = usedInBar.get(barOf[i + k]) ?? new Set<number>();
        set.add(place.string);
        usedInBar.set(barOf[i + k], set);
      });
    }
    return placed;
  };
  // Motivos repetidos (decisión del usuario): la misma melodía (alturas reales + ritmo) que sale
  // varias veces, aunque sea en frases distintas o cortadas de otra forma, se dibuja SIEMPRE igual,
  // con su versión MÁS SENCILLA (a igualdad, la primera que sale). Cada pasada tira fuerte de cada nota
  // hacia esa versión (sin obligar: un salto imposible sigue pudiendo ganar) y se repite mientras
  // cambie algo (motivos que se solapan se van poniendo de acuerdo), como mucho MOTIF_PASSES veces.
  const occurrences = new Map<string, number[]>();
  for (const [i, end] of phrases) {
    for (let w = i; w + MOTIF_LENGTH <= end; w++) {
      const key = kept.slice(w, w + MOTIF_LENGTH).map((onset, k) => `${onset.lead.midi}@${k === 0 ? 0 : Math.round((onset.pos - kept[w + k - 1].pos) * 4)}`).join(' ');
      const list = occurrences.get(key);
      if (list) list.push(w);
      else occurrences.set(key, [w]);
    }
  }
  const repeated = [...occurrences.values()].filter((starts) => starts.length >= 2);
  // (También las que se pasan por poco del máximo de su cuerda: bajan en ella, ver MAX_CLAMP_FRETS.)
  const fitsAsTabbed = kept.map((onset) => profile.strings.includes(onset.lead.string) && onset.lead.fret <= Math.min(profile.maxFret, profile.maxFretByString?.[onset.lead.string] ?? profile.maxFret) + MAX_CLAMP_FRETS);
  const placeKey = (place: LanePosition) => `${place.string}/${place.fret}`;
  let placed = pass();

  // PASAJES RÁPIDOS TRANSPORTADOS (petición del usuario, 2026-10-29): un compás muy rápido (hueco
  // medio ≤ FAST_GAP_SECONDS) cuya mayoría de notas queda FUERA del registro del nivel (hay que
  // transportarlas sí o sí; los riffs de James, igual de rápidos, caben y no cuentan) se aísla en la cuerda que más
  // notas lleva en él y en su MITAD DERECHA (de la mitad de su tope al tope), como el "cromatismo de
  // una cuerda" del modo trastes: el barrido del solo de Kirk (compases 9-12) ya no salta de cuerda.
  const levelPitches = laneLayout(profile).pitches;
  const levelBottom = levelPitches[0];
  const levelTop = levelPitches[levelPitches.length - 1];
  const capOf = new Map<number, number>();
  for (const position of laneLayout(profile).positions) capOf.set(position.string, Math.max(capOf.get(position.string) ?? 0, position.fret));
  const notesOfBar = new Map<number, number[]>();
  kept.forEach((_, k) => notesOfBar.set(barOf[k], [...(notesOfBar.get(barOf[k]) ?? []), k]));
  const fast = [...notesOfBar].filter(([, indices]) => {
    if (indices.length < 3) return false;
    const meanGap = (kept[indices[indices.length - 1]].t - kept[indices[0]].t) / (indices.length - 1);
    // Fuera del registro del nivel: la mayoría de sus notas no podría sonar a su altura real en
    // ninguna de sus cuerdas (el solo de Kirk, 71-81, por encima de todo lo que tocan Medio, Avanzado
    // y Difícil; un riff de James en la Re sí cabe en alguna, aunque no en su cuerda).
    const outside = indices.filter((k) => !pins[k] && (kept[k].lead.midi > levelTop || kept[k].lead.midi < levelBottom)).length;
    return meanGap <= FAST_GAP_SECONDS && outside * 2 > indices.length;
  }).map(([bar]) => bar).sort((a, b) => a - b);
  // Compases rápidos SEGUIDOS = un solo pasaje, todo en la misma cuerda (la que más notas lleva en él).
  for (let i = 0; i < fast.length;) {
    let end = i + 1;
    while (end < fast.length && fast[end] === fast[end - 1] + 1) end++;
    const passage = fast.slice(i, end);
    const count = new Map<number, number>();
    for (const bar of passage) for (const k of notesOfBar.get(bar)!) count.set(placed[k].string, (count.get(placed[k].string) ?? 0) + 1);
    const notes = passage.flatMap((bar) => notesOfBar.get(bar)!);
    // Tantos trastes como alturas distintas tiene el pasaje (mín. 3, máx. media cuerda): justo lo que
    // necesita su cromatismo, y así un pasaje más grave cabe más a la izquierda que uno más agudo.
    const distinct = new Set(notes.map((k) => kept[k].lead.midi)).size;
    const registerTarget = (indices: number[]) => (registerOf ? indices.reduce((sum, k) => sum + registerOf(kept[k].lead.midi), 0) / indices.length : Infinity);
    // Ventana SIEMPRE en la mitad derecha de su cuerda (petición del usuario), centrada lo mejor
    // posible en la altura que le toca al pasaje en el mapa de registro. Se elige la cuerda donde esa
    // ventana queda más cerca de su altura (si empatan, la que más notas lleva): así la altura decide
    // también la CUERDA y no se invierte el orden entre pasajes.
    const windowOn = (string: number, target: number) => {
      const cap = capOf.get(string)!;
      const lowest = profile.rightHalfFrom?.[string] ?? Math.ceil(cap / 2);
      // Como mucho media cuerda (la figura sigue compacta) y lo que cubre una mano en un pasaje rápido
      // tocable: su caja de 4 trastes + 1 (ver unplayableBeats); `rightHalfFrom` solo deja empezar antes.
      const size = Math.min(cap - Math.ceil(cap / 2) + 1, cap - lowest + 1, HAND_BOX_FRETS + 1, Math.max(3, distinct));
      const center = Number.isFinite(target) ? target - OPEN_MIDI[string] : cap;
      const half = (size - 1) / 2;
      const miss = Math.abs(center - Math.min(cap - half, Math.max(lowest + half, center)));
      const from = Math.min(cap - size + 1, Math.max(lowest, Math.round(center - half)));
      return { string, frets: [from, from + size - 1] as [number, number], miss, votes: count.get(string) ?? 0 };
    };
    const passageTarget = registerTarget(notes);
    const choice = [...capOf.keys()].map((string) => windowOn(string, passageTarget)).sort((a, b) => (Math.abs(a.miss - b.miss) > 0.5 ? a.miss - b.miss : b.votes - a.votes))[0];
    // La CUERDA es la del pasaje entero; la ventana, la de cada TRAMO de compases de altura parecida. Con
    // una sola ventana por pasaje, el promedio igualaba pasajes largos (Kirk: 9-16 y 21-26) y el 21
    // quedaba tan arriba como el 13-14, lo más agudo. Compases casi iguales siguen en el mismo tramo: la
    // misma nota no cambia de traste dentro del barrido.
    let stretch: number[] = [];
    const closeStretch = () => {
      const frets = windowOn(choice.string, registerTarget(stretch.flatMap((bar) => notesOfBar.get(bar)!))).frets;
      for (const bar of stretch) fastBars.set(bar, { string: choice.string, frets });
      stretch = [];
    };
    for (const bar of passage) {
      const barTarget = registerTarget(notesOfBar.get(bar)!);
      if (stretch.length > 0 && Math.abs(barTarget - registerTarget(stretch.flatMap((b) => notesOfBar.get(b)!))) >= PASSAGE_STRETCH_SEMITONES) closeStretch();
      stretch.push(bar);
    }
    closeStretch();
    i = end;
  }
  if (fastBars.size > 0) placed = pass();
  for (let round = 0; round < MOTIF_PASSES && repeated.length > 0; round++) {
    const targets = new Map<number, LanePosition[]>();
    for (const starts of repeated) {
      const versions = starts.map((w) => placed.slice(w, w + MOTIF_LENGTH));
      const costs = versions.map((version, j) => pathCost(version, kept.slice(starts[j], starts[j] + MOTIF_LENGTH).map((onset) => onset.t), LEVEL_WEIGHTS));
      // Entre las versiones casi igual de sencillas, la de la PRIMERA aparición: así los trozos que
      // se solapan eligen todos la misma (si cada uno eligiera por su cuenta, unos tirarían hacia un
      // dibujo y otros hacia otro, y los tirones se anularían).
      const cheapest = Math.min(...costs);
      const simplest = versions[costs.findIndex((cost) => cost <= cheapest + MOTIF_COST_TOLERANCE)];
      for (const w of starts) {
        for (let k = 0; k < MOTIF_LENGTH; k++) {
          const list = targets.get(w + k);
          if (list) list.push(simplest[k]);
          else targets.set(w + k, [simplest[k]]);
        }
      }
    }
    const next = pass((index, place) => {
      const wanted = targets.get(index);
      // Una nota que cabe en su posición REAL no recibe el tirón: la tab ya es coherente consigo
      // misma, y si no la otra aparición (quizá transportada) se la llevaría de su sitio. Una nota
      // anclada a la guitarra que manda, tampoco.
      if (!wanted || fitsAsTabbed[index] || pins[index]) return 0;
      const misses = wanted.filter((t) => t.string !== place.string || t.fret !== place.fret || t.pitch !== place.pitch).length;
      return (LEVEL_WEIGHTS.pattern * misses) / wanted.length;
    });
    const changed = next.some((place, k) => placeKey(place) !== placeKey(placed[k]));
    placed = next;
    if (!changed) break;
  }
  return placed;
}

// Riffs compartidos (petición del usuario, 2026-10-27): si esta pista toca lo MISMO que la guitarra
// que manda (James, la rítmica) -- misma nota guía en el mismo instante --, esa nota se ancla a la
// colocación que ya tiene en `follow` (el chart de esa guitarra, traducido al mismo nivel), para que
// las dos pistas se vean iguales. null = nota no compartida.
function followPins(kept: Onset[], follow?: Chart): Array<LanePosition | null> {
  if (!follow?.sourceNotes) return kept.map(() => null);
  const key = (t: number) => Math.round(t * 1000);
  const realAt = new Map<number, ChartNote[]>();
  for (const note of follow.sourceNotes) realAt.set(key(note.t), [...(realAt.get(key(note.t)) ?? []), note]);
  const placedAt = new Map(follow.notes.map((note) => [key(note.t), note]));
  return kept.map((onset) => {
    const note = placedAt.get(key(onset.t));
    const real = realAt.get(key(onset.t));
    if (!note || !real || leadOf(real).midi !== onset.lead.midi) return null;
    return { string: note.string, fret: note.fret, pitch: note.midi };
  });
}

// Rango de alturas (nota más grave y más aguda) de un INSTRUMENTO: todas sus pistas juntas (las
// guitarras de James y de Kirk comparten rango, petición del usuario).
export function pitchRange(charts: Chart[]): [number, number] {
  const midis = charts.flatMap((chart) => chart.notes.map((note) => note.midi));
  return midis.length ? [Math.min(...midis), Math.max(...midis)] : [40, 64];
}

// Altura de corte entre graves y agudas: X octavas de rango -> la mitad baja son graves (con X
// impar, el corte cae a mitad de octava). Master of Puppets: 40-86, 4 octavas, corte 64 (Mi4).
export function octaveSplit([lo, hi]: [number, number]): number {
  return lo + 6 * Math.ceil((hi - lo + 1) / 12);
}

export interface ReduceOptions {
  // Chart ya traducido de la guitarra que manda (riffs compartidos, ver followPins).
  follow?: Chart;
  // Rango del instrumento (`pitchRange` de todas sus pistas), para las zonas de `profile.zones`.
  range?: [number, number];
}

const MAX_SEAM_LEAP = 5;

// Huella de un compás: dónde cae cada nota dentro de él y su altura. Dos compases con la misma huella
// son la misma vuelta de un riff.
function barPrint(onsets: Onset[], bar: { t: number; end: number }) {
  return onsets.map((onset) => `${Math.round(((onset.t - bar.t) / (bar.end - bar.t)) * 96)}:${onset.lead.midi}`).join(' ');
}

// TROZOS REPETIDOS (petición del usuario, 2026-11-08: NILE - Papyrus, el compás 3 es la primera mitad
// del 2 y salía con otras notas y saltos): el PRINCIPIO de un compás que repite un trozo de un compás
// anterior (misma altura real y misma posición relativa, al menos SEGMENT_MIN_NOTES notas y un tiempo,
// empezando en un tiempo de los dos) se trata como esa parte del anterior. Devuelve, para cada nota
// del compás posterior, la nota de la primera aparición que copia. Los compases enteros iguales ya los
// cubre `barPrint`.
const SEGMENT_MIN_NOTES = 4;
const SEGMENT_MIN_BEATS = 0.75;

function repeatedSegments(list: Onset[], barIndex: (t: number) => number, barStartPos: (bar: number) => number): Map<number, number> {
  const byBar = new Map<number, number[]>();
  list.forEach((onset, k) => {
    const bar = barIndex(onset.t);
    const indices = byBar.get(bar);
    if (indices) indices.push(k);
    else byBar.set(bar, [k]);
  });
  const rel = (k: number) => list[k].pos - barStartPos(barIndex(list[k].t));
  const onBeat = (value: number) => Math.abs(value - Math.round(value)) < 1e-3;
  const source = new Map<number, number>();
  const bars = [...byBar.keys()].sort((a, b) => a - b);
  const prints = new Set<string>();
  bars.forEach((bar, b) => {
    const target = byBar.get(bar)!;
    const print = target.map((k) => `${Math.round(rel(k) * 96)}:${list[k].lead.midi}`).join(' ');
    const wholeRepeat = prints.has(print);
    prints.add(print);
    if (wholeRepeat || !onBeat(rel(target[0]))) return;
    let best: { from: number[]; length: number } | null = null;
    for (let a = 0; a < b; a++) {
      const earlier = byBar.get(bars[a])!;
      for (let s = 0; s < earlier.length; s++) {
        if (!onBeat(rel(earlier[s]))) continue;
        let m = 0;
        while (
          m < target.length && s + m < earlier.length
          && list[target[m]].lead.midi === list[earlier[s + m]].lead.midi
          && Math.abs((rel(target[m]) - rel(target[0])) - (rel(earlier[s + m]) - rel(earlier[s]))) < 1e-3
        ) m++;
        const span = m > 0 ? rel(target[m - 1]) - rel(target[0]) : 0;
        if (m >= SEGMENT_MIN_NOTES && span >= SEGMENT_MIN_BEATS && (!best || m > best.length)) best = { from: earlier.slice(s, s + m), length: m };
      }
    }
    if (best) best.from.forEach((k, j) => source.set(target[j], source.get(k) ?? k));
  });
  return source;
}

// Vueltas iguales, mismas notas (petición del usuario, 2026-11-04: Lucretia): los filtros de densidad
// miran lo que viene justo antes, así que dos vueltas idénticas perdían notas distintas. Cada compás
// repetido conserva las notas (por su sitio en el compás) que conservó su primera aparición, salvo
// la que quedaría demasiado pegada a la anterior (la densidad del nivel manda en la unión).
function sameNotesInRepeatedBars(onsets: Onset[], kept: Onset[], barIndex: (t: number) => number, chart: Chart, profile: LevelProfile, barStartPos: (bar: number) => number): Onset[] {
  const keptSet = new Set(kept);
  // Trozo repetido: lo que decidió su primera aparición (ver repeatedSegments).
  const segmentSource = repeatedSegments(onsets, barIndex, barStartPos);
  const decided = new Set<Onset>();
  const byBar = new Map<number, Onset[]>();
  for (const onset of onsets) {
    const bar = barIndex(onset.t);
    const list = byBar.get(bar);
    if (list) list.push(onset);
    else byBar.set(bar, [onset]);
  }
  const firstKept = new Map<string, boolean[]>();
  const out: Onset[] = [];
  for (const [bar, barOnsets] of [...byBar].sort((a, b) => a[0] - b[0])) {
    const print = barPrint(barOnsets, chart.bars[bar]);
    const mask = firstKept.get(print);
    barOnsets.forEach((onset, k) => {
      const from = segmentSource.get(onsets.indexOf(onset));
      const wanted = mask ? mask[k] : from !== undefined ? decided.has(onsets[from]) : keptSet.has(onset);
      if (!wanted) return;
      const prev = out[out.length - 1];
      const gap = prev ? onset.t - prev.t : Number.POSITIVE_INFINITY;
      const tooClose = gap < profile.minGapSeconds - 1e-3 || (prev?.lead.midi === onset.lead.midi && gap < profile.repeatGapSeconds - 1e-3);
      if ((mask || from !== undefined) && !keptSet.has(onset) && tooClose) return;
      out.push(onset);
      decided.add(onset);
    });
    // La primera aparición guarda lo que se decidió de verdad (con sus trozos repetidos ya aplicados).
    if (!mask) firstKept.set(print, barOnsets.map((onset) => decided.has(onset)));
  }
  return out;
}

export function reduceChart(chart: Chart, profile: LevelProfile, { follow, range }: ReduceOptions = {}): Chart {
  if (profile.compose) return composeChart(chart, profile, { follow, range });
  const { pos, beatSeconds } = makeBeatPosition(chart);
  const onsets = groupOnsets(chart, pos);
  const barIndex = (t: number) => {
    let lo = 0;
    let hi = chart.bars.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (chart.bars[mid].t <= t + 1e-6) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const barStartPos = (bar: number) => pos(chart.bars[bar].t);
  const kept = sameNotesInRepeatedBars(onsets, capFastWindows(pickByGrid(onsets, gridSlots(chart, profile.gridBeats, profile.minSlotSeconds), profile), chart, profile), barIndex, chart, profile, barStartPos);
  // Niveles de varias cuerdas: compás de cada golpe y cuántas cuerdas distintas usa la tab en cada
  // compás (notas guía), para el límite de cuerdas por compás (ver placePhraseMulti).
  let barInfo: { barOf: number[]; stringsUsed: Map<number, Set<number>> } | null = null;
  if (profile.strings.length > 1) {
    const stringsOfBar = new Map<number, Set<number>>();
    for (const onset of onsets) {
      const bar = barIndex(onset.t);
      const set = stringsOfBar.get(bar) ?? new Set<number>();
      set.add(onset.lead.string);
      stringsOfBar.set(bar, set);
    }
    barInfo = { barOf: kept.map((onset) => barIndex(onset.t)), stringsUsed: stringsOfBar };
  }
  const phraseOf = splitPhrases(kept, profile, beatSeconds, barInfo?.barOf);
  const layout = laneLayout(profile);
  const pins = followPins(kept, follow);
  const multiPlaces = barInfo ? placeAllMulti(kept, phraseOf, profile, barInfo.barOf, barInfo.stringsUsed, pins) : null;


  // Altura traducida de cada nota, frase a frase (con varias cuerdas ya va en multiPlaces):
  // EXACTA (intervalos reales, desplazada en bloque) si la frase cabe en los botones; si no, CONTORNO.
  // Con `profile.zones` (Avanzado: dos "Guitar Hero" seguidos, decisión del usuario) cada nota va a
  // la zona de su altura REAL -- por debajo del corte de octavas del instrumento, graves (0-5); si no,
  // agudas (5-10) -- y lo de arriba se aplica dentro de cada zona, con sus 6 botones.
  const targetPitch: number[] = new Array(kept.length);
  const translate = (indices: number[], lanePitches: number[]) => {
    if (indices.length === 0) return;
    const pitches = indices.map((k) => kept[k].lead.midi);
    const shift = exactShift(pitches, new Set(lanePitches));
    if (shift !== null) {
      indices.forEach((k, j) => { targetPitch[k] = pitches[j] + shift; });
      return;
    }
    const lanes = contourLanes(pitches, lanePitches.length);
    const laneSeq = pitches.map((p) => lanes.get(p)!);
    // Dos alturas distintas seguidas van en su dirección, mirando el botón YA corregido de la anterior
    // (2026-11-08: separando solo los botones iguales, NILE - Papyrus subía donde la tab baja, 60 -> 59
    // en el 3 -> 4). Si una línea larga llega al borde, se queda en él.
    for (let k = 1; k < laneSeq.length; k++) {
      const dir = Math.sign(pitches[k] - pitches[k - 1]);
      if (dir !== 0 && Math.sign(laneSeq[k] - laneSeq[k - 1]) !== dir) {
        laneSeq[k] = Math.min(lanePitches.length - 1, Math.max(0, laneSeq[k - 1] + dir));
      }
    }
    indices.forEach((k, j) => { targetPitch[k] = lanePitches[laneSeq[j]]; });
  };
  const split = profile.zones ? octaveSplit(range ?? pitchRange([chart])) : 0;
  const zonePitches = profile.zones?.map(([from, to]) => [...new Set(layout.positions.filter((p) => p.fret >= from && p.fret <= to).map((p) => p.pitch))].sort((a, b) => a - b));
  let i = 0;
  while (!multiPlaces && i < kept.length) {
    let end = i;
    while (end < kept.length && phraseOf[end] === phraseOf[i]) end++;
    const indices = Array.from({ length: end - i }, (_, k) => i + k);
    if (zonePitches) {
      translate(indices.filter((k) => kept[k].lead.midi < split), zonePitches[0]);
      translate(indices.filter((k) => kept[k].lead.midi >= split), zonePitches[zonePitches.length - 1]);
    } else {
      translate(indices, layout.pitches);
    }
    i = end;
  }
  // Vueltas iguales, mismo dibujo: cada frase elige su colocación mirando TODAS sus notas, así que el
  // mismo compás salía distinto según con qué compases le tocara ir (Lucretia: la mitad de las vueltas
  // en modo trastes). Cada compás repetido copia la colocación de su primera aparición; con varias
  // cuerdas, salvo si tiene notas fijadas por la guitarra que manda (riffs compartidos), que ganan, o
  // si la unión con el compás de al lado dejaría de valer: una nota repetida no se mueve (hace falta
  // para mantenerla pulsada) y dentro de una frase no hay saltos de más de MAX_SEAM_LEAP trastes.
  const seamOk = (i: number, a: LanePosition | undefined, j: number, b: LanePosition | undefined) => {
    if (!a || !b) return true;
    if (kept[i].lead.midi === kept[j].lead.midi) return a.string === b.string && a.fret === b.fret;
    // Un salto grande vale si la música también salta (una octava o más: NILE - Papyrus, 6/5 -> 3/8).
    return phraseOf[i] !== phraseOf[j] || Math.abs(a.fret - b.fret) <= MAX_SEAM_LEAP || Math.abs(kept[i].lead.midi - kept[j].lead.midi) >= 12;
  };
  // Trozos repetidos (antes que los compases enteros, que así ya copian la versión corregida): la misma
  // colocación que su primera aparición, con las mismas condiciones que un
  // compás entero (sin notas fijadas por la guitarra que manda y con uniones válidas).
  const segmentSource = repeatedSegments(kept, barIndex, barStartPos);
  // Copias hechas (índices de `kept`): la reparación de choques las vuelve a igualar al final.
  const copiedFrom = new Map<number, number>();
  const runs: number[][] = [];
  for (const k of [...segmentSource.keys()].sort((a, b) => a - b)) {
    const run = runs[runs.length - 1];
    if (run && run[run.length - 1] === k - 1 && barIndex(kept[k].t) === barIndex(kept[run[0]].t)) run.push(k);
    else runs.push([k]);
  }
  for (const run of runs) {
    const first = run[0];
    const last = run[run.length - 1];
    if (multiPlaces) {
      const copy = run.map((k) => multiPlaces[segmentSource.get(k)!]);
      if (run.some((k) => pins[k]) || copy.some((place) => !place)) continue;
      if (!seamOk(first - 1, multiPlaces[first - 1], first, copy[0]) || !seamOk(last, copy[copy.length - 1], last + 1, multiPlaces[last + 1])) continue;
      run.forEach((k, j) => {
        multiPlaces[k] = copy[j];
        copiedFrom.set(k, segmentSource.get(k)!);
      });
    } else {
      run.forEach((k) => { targetPitch[k] = targetPitch[segmentSource.get(k)!]; });
    }
  }
  const firstPlacing = new Map<string, Array<number | LanePosition>>();
  const firstStart = new Map<string, number>();
  for (let k = 0; k < kept.length;) {
    const bar = barIndex(kept[k].t);
    let end = k + 1;
    while (end < kept.length && barIndex(kept[end].t) === bar) end++;
    const print = barPrint(kept.slice(k, end), chart.bars[bar]);
    const placing = firstPlacing.get(print);
    if (!placing) {
      firstPlacing.set(print, multiPlaces ? multiPlaces.slice(k, end) : targetPitch.slice(k, end));
      firstStart.set(print, k);
    } else if (multiPlaces) {
      const copy = placing as LanePosition[];
      const pinned = pins.slice(k, end).some(Boolean);
      const fits = seamOk(k - 1, multiPlaces[k - 1], k, copy[0]) && seamOk(end - 1, copy[copy.length - 1], end, multiPlaces[end]);
      if (!pinned && fits && copy.length === end - k) {
        copy.forEach((place, j) => {
          multiPlaces[k + j] = place;
          copiedFrom.set(k + j, firstStart.get(print)! + j);
        });
      }
    } else {
      placing.forEach((target, j) => { targetPitch[k + j] = target as number; });
    }
    k = end;
  }

  let prevFret = profile.minFret;
  // Red de seguridad (pasajes rápidos tocables, ver unplayableBeats): si, ya colocado todo, algún
  // tiempo rápido sigue sin caber en la mano (solo pasa con el CONTORNO, cuando ninguna transposición
  // cabe), ese tiempo se aligera a corcheas -- como hacía el límite de 0,1 s, pero solo ahí. Sus notas
  // siguen sonando con la canción (las anteriores son sus dueñas).
  const dropped = new Set<number>();
  if (multiPlaces) {
    // Tiempos contados desde el principio de CADA compás: tras un compás de 2 tiempos y medio (NILE -
    // Papyrus, c3) los siguientes empiezan a medio tiempo, y contando desde el principio de la canción
    // cada vuelta de un mismo riff perdía notas distintas.
    const beatKey = (k: number) => {
      const bar = barIndex(kept[k].t);
      return `${bar}:${Math.floor(kept[k].pos - barStartPos(bar) + 1e-6)}`;
    };
    for (let i = 0; i < kept.length;) {
      const beatIndex = barStartPos(barIndex(kept[i].t)) + Math.floor(kept[i].pos - barStartPos(barIndex(kept[i].t)) + 1e-6);
      let end = i + 1;
      while (end < kept.length && beatKey(end) === beatKey(i)) end++;
      let fast = end - i >= 3;
      for (let k = i + 1; fast && k < end; k++) if (kept[k].t - kept[k - 1].t >= FAST_NOTE_SECONDS - 1e-6) fast = false;
      if (fast && outsideHandBox(multiPlaces.slice(i, end)) > 1) {
        for (let k = i; k < end; k++) {
          const frac = kept[k].pos - beatIndex;
          if (Math.min(Math.abs(frac), Math.abs(frac - 0.5)) > 0.05) dropped.add(k);
        }
      }
      i = end;
    }
  }
  const order = kept.map((_, k) => k).filter((k) => !dropped.has(k));
  const noteIndexOf = new Map(order.map((k, j) => [k, j]));
  const repeats: Array<[number, number]> = [...copiedFrom].flatMap(([copy, source]) => {
    const a = noteIndexOf.get(copy);
    const b = noteIndexOf.get(source);
    return a === undefined || b === undefined ? [] : [[a, b] as [number, number]];
  });
  const notes: ChartNote[] = order.map((k, j) => {
    const onset = kept[k];
    const next = kept[order[j + 1]];
    let place: LanePosition;
    if (multiPlaces) {
      place = multiPlaces[k];
    } else if (pins[k]) {
      // Una cuerda: la nota compartida va directamente donde la tiene la guitarra que manda.
      place = pins[k]!;
      prevFret = place.fret;
    } else {
      const candidates = layout.positions.filter((p) => p.pitch === targetPitch[k]);
      place = candidates.reduce((best, p) => (Math.abs(p.fret - prevFret) < Math.abs(best.fret - prevFret) ? p : best), candidates[0]);
      prevFret = place.fret;
    }
    const beat = beatSeconds(onset.t);
    const room = next ? next.t - onset.t - beat * 0.5 : onset.lead.dur;
    const dur = Math.min(onset.lead.dur, room);
    const until = next ? next.t : Number.POSITIVE_INFINITY;
    return {
      id: j,
      t: onset.t,
      dur: dur >= beat * 0.5 ? dur : 0,
      string: place.string,
      fret: place.fret,
      midi: place.pitch,
      palmMute: false,
      tech: [],
      sourceIds: chart.notes.filter((n) => n.t >= onset.t - 0.005 && n.t < until - 0.005).map((n) => n.id),
      phrase: phraseOf[k],
    };
  });

  if (multiPlaces) {
    const pinned = new Set(order.flatMap((k, j) => (pins[k] ? [j] : [])));
    const caps = new Map<number, number>();
    for (const position of layout.positions) caps.set(position.string, Math.max(caps.get(position.string) ?? 0, position.fret));
    // Primero la misma altura en otra cuerda; si ninguna sirve, un traste al lado en su cuerda sin
    // cambiar el sentido de la melodía (escalas que bajan a la cuerda grave, NILE - Papyrus c2).
    avoidFretClashes(notes, chart.bars, pinned, (note, index) => {
      const samePitch = [...caps].filter(([string]) => string !== note.string).map(([string, cap]) => ({ string, fret: note.midi - OPEN_MIDI[string], cap }))
        .filter((place) => place.fret >= profile.minFret && place.fret <= place.cap)
        .map(({ string, fret }) => ({ string, fret, midi: note.midi }));
      const prev = notes[index - 1];
      const next = notes[index + 1];
      const nextFret = [note.fret - 1, note.fret + 1]
        .filter((fret) => fret >= profile.minFret && fret <= (caps.get(note.string) ?? profile.maxFret))
        .map((fret) => ({ string: note.string, fret, midi: OPEN_MIDI[note.string] + fret }))
        .filter((place) => (!prev || Math.sign(place.midi - prev.midi) === Math.sign(note.midi - prev.midi)) && (!next || Math.sign(next.midi - place.midi) === Math.sign(next.midi - note.midi)));
      return [...samePitch, ...nextFret.map((place) => ({ ...place, changesPitch: true }))];
    }, repeats);
  }

  return { ...chart, notes, sourceNotes: chart.notes, repeats, movedAboveMaxFret: 0, skippedAboveMaxFret: 0 };
}

// CHOQUES (petición del usuario, 2026-11-07): el mismo traste en cuerdas distintas, muy cerca en el
// tiempo, cae en la misma columna de la autopista; las gemas de la cuerda alta tapan a las de la baja
// y no se sabe en qué orden llegan, y además cuesta pulsarlas en mitad de un dibujo. Puede pasar
// suelto, pero no de forma recurrente: en un compás con CLASH_BAR_LIMIT choques o más, se cambia de
// sitio una nota de cada choque (con sus repeticiones seguidas, que se mantienen pulsadas)
// mientras queden más de CLASH_KEEP: en el modo cuerdas, la misma altura en otra cuerda; en Híbrido,
// un traste al lado en su cuerda, sin cambiar el sentido de la melodía. Las notas ancladas a la
// guitarra que manda no se tocan (riffs compartidos).
const CLASH_SECONDS = 0.4;
const CLASH_BAR_LIMIT = 3;
const CLASH_KEEP = 1;
const CLASH_MAX_LEAP = 5;

// `changesPitch`: solo como último recurso (vale más mover la nota a otra cuerda a la misma altura).
type NotePlace = { string: number; fret: number; midi: number; changesPitch?: boolean };

function avoidFretClashes(notes: ChartNote[], bars: Chart['bars'], pinned: Set<number>, alternatives: (note: ChartNote, index: number) => NotePlace[], repeats: Array<[number, number]> = []) {
  const clashes = (a: ChartNote, b: ChartNote) => a.string !== b.string && a.fret === b.fret && Math.abs(a.t - b.t) < CLASH_SECONDS;
  const clashCount = (index: number, place: NotePlace = notes[index]) => {
    let count = 0;
    const probe = { ...notes[index], ...place };
    for (let k = index - 1; k >= 0 && probe.t - notes[k].t < CLASH_SECONDS; k--) if (clashes(notes[k], probe)) count++;
    for (let k = index + 1; k < notes.length && notes[k].t - probe.t < CLASH_SECONDS; k++) if (clashes(notes[k], probe)) count++;
    return count;
  };
  // Repeticiones seguidas en el mismo sitio: se mueven juntas (para mantenerlas pulsadas).
  const unitOf = (index: number) => {
    let from = index;
    let to = index;
    const same = (a: ChartNote, b: ChartNote) => a.string === b.string && a.fret === b.fret && a.midi === b.midi;
    while (from > 0 && same(notes[from - 1], notes[index])) from--;
    while (to + 1 < notes.length && same(notes[to + 1], notes[index])) to++;
    return { from, to };
  };
  const leapOk = (index: number, place: NotePlace) => {
    const prev = notes[index - 1];
    const next = notes[index + 1];
    const near = (other?: ChartNote) => !other || other.phrase !== notes[index].phrase || Math.abs(other.fret - place.fret) <= CLASH_MAX_LEAP;
    return near(prev) && near(next);
  };
  let bar = 0;
  for (let start = 0; start < notes.length;) {
    while (bar + 1 < bars.length && bars[bar + 1].t <= notes[start].t + 1e-6) bar++;
    let end = start;
    while (end < notes.length && notes[end].t < bars[bar].end - 1e-6) end++;
    if (end === start) end = start + 1;
    const barClashes = () => {
      let count = 0;
      for (let j = start; j < end; j++) for (let k = j - 1; k >= 0 && notes[j].t - notes[k].t < CLASH_SECONDS; k--) if (clashes(notes[k], notes[j])) count++;
      return count;
    };
    if (barClashes() >= CLASH_BAR_LIMIT) {
      for (let j = start; j < end && barClashes() > CLASH_KEEP; j++) {
        if (pinned.has(j)) continue;
        // Cualquiera de las dos notas del choque: si la posterior no tiene otro sitio (una escala que baja
        // a la cuerda grave), se mueve la anterior.
        if (clashCount(j) === 0) continue;
        const { from, to } = unitOf(j);
        if ([...Array(to - from + 1).keys()].some((d) => pinned.has(from + d))) continue;
        const before = Array.from({ length: to - from + 1 }, (_, d) => clashCount(from + d)).reduce((a, b) => a + b, 0);
        let best: { place: NotePlace; score: number } | null = null;
        for (const place of alternatives(notes[j], j)) {
          if (!leapOk(from, place) || !leapOk(to, place)) continue;
          const after = Array.from({ length: to - from + 1 }, (_, d) => clashCount(from + d, place)).reduce((a, b) => a + b, 0);
          const score = after * 100 + (place.changesPitch ? 50 : 0) + Math.abs(place.fret - notes[j].fret);
          if (after < before && (!best || score < best.score)) best = { place, score };
        }
        if (best) {
          const { string, fret, midi } = best.place;
          for (let k = from; k <= to; k++) Object.assign(notes[k], { string, fret, midi });
        }
      }
    }
    start = end;
  }
  // La reparación mira lo que hay alrededor, así que pudo mover una nota en una vuelta y no en otra:
  // las copias vuelven a ser iguales que su original, salvo si eso deja su compás con choques recurrentes.
  const barOf = (t: number) => bars.findIndex((bar) => t >= bar.t - 1e-6 && t < bar.end - 1e-6);
  const clashesInBar = (bar: number) => {
    let count = 0;
    for (let j = 0; j < notes.length; j++) {
      if (barOf(notes[j].t) !== bar) continue;
      for (let k = j - 1; k >= 0 && notes[j].t - notes[k].t < CLASH_SECONDS; k--) if (clashes(notes[k], notes[j])) count++;
    }
    return count;
  };
  for (const [copy, source] of [...repeats].sort((a, b) => a[0] - b[0])) {
    const target = notes[copy];
    const original = notes[source];
    if (target.string === original.string && target.fret === original.fret && target.midi === original.midi) continue;
    const before = { string: target.string, fret: target.fret, midi: target.midi };
    Object.assign(target, { string: original.string, fret: original.fret, midi: original.midi });
    if (clashesInBar(barOf(target.t)) >= CLASH_BAR_LIMIT) Object.assign(target, before);
  }
}

// Nivel hecho de otros dos (`profile.compose`, Híbrido, petición del usuario, 2026-11-07): cada nota con
// la CUERDA de un nivel y el TRASTE de otro, en el mismo instante. Con un solo traducido propio, Híbrido
// usaba muy pocos trastes (NILE - Papyrus, intro: 3 frente a 6 en todos los demás niveles).
function composeChart(chart: Chart, profile: LevelProfile, { follow, range }: ReduceOptions): Chart {
  const { strings: stringsLevel, frets: fretsLevel } = profile.compose!;
  const byStrings = reduceChart(chart, RIFF_LEVELS[stringsLevel], { follow: follow?.parts?.strings, range });
  const byFrets = reduceChart(chart, RIFF_LEVELS[fretsLevel], { follow: follow?.parts?.frets, range });
  const fretTimes = byFrets.notes.map((note) => note.t);
  const fretAt = (t: number) => {
    let lo = 0;
    let hi = fretTimes.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (fretTimes[mid] < t - 0.005) lo = mid + 1;
      else hi = mid;
    }
    const near = [lo - 1, lo].filter((k) => k >= 0 && k < fretTimes.length).sort((a, b) => Math.abs(fretTimes[a] - t) - Math.abs(fretTimes[b] - t))[0];
    return byFrets.notes[near]?.fret ?? profile.minFret;
  };
  const notes = byStrings.notes.map((note) => {
    const fret = Math.min(profile.maxFret, Math.max(profile.minFret, fretAt(note.t)));
    return { ...note, fret, midi: OPEN_MIDI[note.string] + fret };
  });
  // La pista que sigue a otra copia sus notas compartidas (las mismas dos partes), y esas no se tocan.
  const pinned = new Set<number>();
  if (follow) {
    const key = (t: number) => Math.round(t * 1000);
    const followed = new Map(follow.notes.map((note) => [key(note.t), note]));
    notes.forEach((note, index) => {
      const other = followed.get(key(note.t));
      if (other && other.string === note.string && follow.parts) {
        const partFret = follow.parts.frets.notes.find((n) => key(n.t) === key(note.t))?.fret;
        if (partFret === note.fret) {
          Object.assign(note, { fret: other.fret, midi: other.midi });
          pinned.add(index);
        }
      }
    });
  }
  // Híbrido: uno o dos trastes al lado en su cuerda, sin cambiar el sentido con la nota anterior y la
  // siguiente (con solo 6 trastes por cuerda, uno no siempre basta: NILE - Papyrus).
  avoidFretClashes(notes, chart.bars, pinned, (note, index) => {
    const sameString = (step: number) => {
      for (let k = index + step; k >= 0 && k < notes.length; k += step) if (notes[k].string === note.string) return notes[k];
      return undefined;
    };
    const prev = sameString(-1);
    const next = sameString(1);
    return [note.fret - 1, note.fret + 1, note.fret - 2, note.fret + 2]
      .filter((fret) => fret >= profile.minFret && fret <= profile.maxFret)
      .filter((fret) => (!prev || Math.sign(fret - prev.fret) === Math.sign(note.fret - prev.fret)) && (!next || Math.sign(next.fret - fret) === Math.sign(next.fret - note.fret)))
      .map((fret) => ({ string: note.string, fret, midi: OPEN_MIDI[note.string] + fret }));
  }, byStrings.repeats);
  return { ...byStrings, notes, parts: { strings: byStrings, frets: byFrets } };
}
