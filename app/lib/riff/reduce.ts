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
import type { LevelProfile } from './levels';

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
function makeBeatPosition(chart: Chart) {
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
      // Tope de densidad (notas por segundo real, la medida de Guitar Hero): en 1 s nunca más de
      // `maxNotesPerSecond`. Solo frena los pasajes más densos; el resto queda igual.
      if (profile.maxNotesPerSecond) {
        let inWindow = 0;
        for (let k = kept.length - 1; k >= 0 && onset.t - kept[k].t < 1 - 1e-3; k--) inWindow++;
        if (inWindow >= profile.maxNotesPerSecond) continue;
      }
    }
    kept.push(onset);
  }
  return kept;
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
export const LEVEL_WEIGHTS: PlaceWeights = { ...PLACE_WEIGHTS, string: 0.5, box: 2, leap: 1, zone: 0.7, pattern: 8, tab: 3, register: 1.5 };
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
  return (weights.fret * out + weights.leap * out * out + weights.string * Math.abs(place.string - prev.string)) * hurry;
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
  const pitches = phrase.map((onset) => onset.lead.midi);
  const maxFretOf = new Map<number, number>();
  for (const p of layout.positions) maxFretOf.set(p.string, Math.max(maxFretOf.get(p.string) ?? 0, p.fret));
  const minOf = (g: number) => groupFrets[g]?.[0] ?? 0;
  const maxOf = (g: number) => groupFrets[g]?.[1] ?? Infinity;
  const pitchesOn = (strings: number[], minFret = 0, maxFret = Infinity) => [...new Set(layout.positions.filter((p) => strings.includes(p.string) && p.fret >= minFret && p.fret <= maxFret).map((p) => p.pitch))].sort((a, b) => a - b);

  // Cuerdas que cada grupo de compás puede llegar a usar (en alguna de sus opciones).
  const reachable = groupOptions.map((options) => new Set(options.flat()));
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
    const fixedReal = phrase.map((onset, k) => (reachable[groupOf[k]].has(onset.lead.string) && onset.lead.fret <= maxFretOf.get(onset.lead.string)! && onset.lead.fret >= minOf(groupOf[k]) && onset.lead.fret <= maxOf(groupOf[k])
      ? { string: onset.lead.string, fret: onset.lead.fret }
      : undefined));
    const availableOf = combo.map((strings, g) => new Set(pitchesOn(strings, minOf(g), maxOf(g))));
    const fits = (k: number, pitch: number) => availableOf[groupOf[k]].has(pitch);
    const shifts = new Map<number, number>();
    const offer = (shift: number, extra: number) => {
      if (pitches.every((p, k) => fits(k, p + shift)) && extra < (shifts.get(shift) ?? Infinity)) shifts.set(shift, extra);
    };
    const all = pitchesOn([...new Set(combo.flat())], Math.min(...combo.map((_, g) => minOf(g))));
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
    }
    if (candidates.length === 0) {
      // Contorno sobre las alturas de cada tramo de compases seguidos con las MISMAS cuerdas (si
      // todos usan las mismas, la frase entera, como siempre). Si un tramo empieza repitiendo la
      // última nota del anterior, se desplaza entero para que esa nota siga en la misma altura (y en
      // el mismo sitio: así se puede mantener pulsada) siempre que quepa.
      const out = new Array<number>(pitches.length);
      const segmentOf: number[] = [];
      pitches.forEach((_, k) => {
        const same = k > 0 && combo[groupOf[k]].join() === combo[groupOf[k - 1]].join();
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
          if (seg[k] !== seg[k - 1] && laneSeq[k] === laneSeq[k - 1]) {
            laneSeq[k] = Math.min(lanePitches.length - 1, Math.max(0, laneSeq[k] + Math.sign(seg[k] - seg[k - 1])));
          }
        }
        const first = idx[0];
        if (first > 0 && pitches[first] === pitches[first - 1] && out[first - 1] !== undefined) {
          const anchor = lanePitches.indexOf(out[first - 1]);
          const offset = anchor - laneSeq[0];
          if (anchor >= 0 && laneSeq.every((lane) => lane + offset >= 0 && lane + offset < lanePitches.length)) laneSeq = laneSeq.map((lane) => lane + offset);
        }
        idx.forEach((k, j) => { out[k] = lanePitches[laneSeq[j]]; });
      }
      candidates.push({ pitches: out, extra: CONTOUR_COST, shift: null });
    }
    for (const candidate of candidates) {
      // Si no, la posición real TRASLADADA: la cuerda permitida que, con este desplazamiento (y
      // alguna octava), conserva la forma de la tab (mismo traste, o ±12).
      const realOf = (onset: Onset, k: number) => {
        if (fixedReal[k]) return fixedReal[k];
        if (candidate.shift === null) return undefined;
        for (const string of stringsOf[k]) {
          const rest = candidate.shift - (OPEN_MIDI[string] - OPEN_MIDI[onset.lead.string]);
          const fret = onset.lead.fret + rest;
          if (rest % 12 === 0 && fret >= 0 && fret <= maxFretOf.get(string)!) return { string, fret };
        }
        return undefined;
      };
      const items: PlaceItem[] = phrase.map((onset, k) => ({ pitch: candidate.pitches[k], t: onset.t, real: realOf(onset, k), zoneFret: zoneOf(onset.lead.midi), registerPitch: candidate.octaveMoved?.[k] ? undefined : registerOf?.(onset.lead.midi) }));
      const placed = placeSequence(items, layout.positions, LEVEL_WEIGHTS, unary, (k, place) => sets[k].has(place.string) && place.fret >= minOf(groupOf[k]) && place.fret <= maxOf(groupOf[k]));
      if (placed && (!best || placed.cost + candidate.extra < best.cost)) best = { path: placed.path, cost: placed.cost + candidate.extra };
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
  const fitsAsTabbed = kept.map((onset) => profile.strings.includes(onset.lead.string) && onset.lead.fret <= Math.min(profile.maxFret, profile.maxFretByString?.[onset.lead.string] ?? profile.maxFret));
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
    const target = registerOf ? notes.reduce((sum, k) => sum + registerOf(kept[k].lead.midi), 0) / notes.length : Infinity;
    // Ventana SIEMPRE en la mitad derecha de su cuerda (petición del usuario), centrada lo mejor
    // posible en la altura que le toca al pasaje en el mapa de registro. Se elige la cuerda donde esa
    // ventana queda más cerca de su altura (si empatan, la que más notas lleva): así la altura decide
    // también la CUERDA y no se invierte el orden entre pasajes (Kirk en Difícil: el 14, lo más
    // agudo, en la Sol; el barrido y el 21, en la Re).
    const windowOn = (string: number) => {
      const cap = capOf.get(string)!;
      const lowest = Math.ceil(cap / 2);
      const size = Math.min(cap - lowest + 1, Math.max(3, distinct));
      const center = Number.isFinite(target) ? target - OPEN_MIDI[string] : cap;
      const half = (size - 1) / 2;
      const miss = Math.abs(center - Math.min(cap - half, Math.max(lowest + half, center)));
      const from = Math.min(cap - size + 1, Math.max(lowest, Math.round(center - half)));
      return { string, frets: [from, from + size - 1] as [number, number], miss, votes: count.get(string) ?? 0 };
    };
    const choice = [...capOf.keys()].map(windowOn).sort((a, b) => (Math.abs(a.miss - b.miss) > 0.5 ? a.miss - b.miss : b.votes - a.votes))[0];
    for (const bar of passage) fastBars.set(bar, { string: choice.string, frets: choice.frets });
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

export function reduceChart(chart: Chart, profile: LevelProfile, { follow, range }: ReduceOptions = {}): Chart {
  const { pos, beatSeconds } = makeBeatPosition(chart);
  const onsets = groupOnsets(chart, pos);
  const kept = pickByGrid(onsets, gridSlots(chart, profile.gridBeats, profile.minSlotSeconds), profile);
  // Niveles de varias cuerdas: compás de cada golpe y cuántas cuerdas distintas usa la tab en cada
  // compás (notas guía), para el límite de cuerdas por compás (ver placePhraseMulti).
  let barInfo: { barOf: number[]; stringsUsed: Map<number, Set<number>> } | null = null;
  if (profile.strings.length > 1) {
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
    // Si dos alturas distintas seguidas acabaron en el mismo botón, se separan en su dirección.
    for (let k = 1; k < laneSeq.length; k++) {
      if (pitches[k] !== pitches[k - 1] && laneSeq[k] === laneSeq[k - 1]) {
        const dir = Math.sign(pitches[k] - pitches[k - 1]);
        laneSeq[k] = Math.min(lanePitches.length - 1, Math.max(0, laneSeq[k] + dir));
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

  let prevFret = profile.minFret;
  const notes: ChartNote[] = kept.map((onset, k) => {
    const next = kept[k + 1];
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
      id: k,
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

  return { ...chart, notes, sourceNotes: chart.notes, movedAboveMaxFret: 0, skippedAboveMaxFret: 0 };
}
