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

// Huecos de la rejilla del nivel, en negras, contados desde el inicio de cada compás.
function gridSlots(chart: Chart, gridBeats: number): number[] {
  const slots: number[] = [];
  let barStartQ = 0;
  chart.beats.forEach((beat, i) => {
    if (beat.isBarStart) barStartQ = beat.q;
    const nextQ = chart.beats[i + 1]?.q ?? beat.q + 1;
    for (let q = beat.q; q < nextQ - 1e-6; q += Math.min(gridBeats, 1)) {
      const rel = q - barStartQ;
      if (Math.abs(rel / gridBeats - Math.round(rel / gridBeats)) < 1e-6) slots.push(q);
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
function splitPhrases(kept: Onset[], profile: LevelProfile, beatSeconds: (t: number) => number): number[] {
  const phrase: number[] = [];
  let current = 0;
  let startPos = kept[0]?.pos ?? 0;
  kept.forEach((onset, i) => {
    if (i > 0) {
      const gap = onset.pos - kept[i - 1].pos;
      const usualGap = Math.max(profile.minGapBeats, profile.minGapSeconds / beatSeconds(onset.t));
      if (gap > usualGap + 1.5 || onset.pos - startPos >= Math.max(PHRASE_MAX_BEATS, usualGap * 4)) {
        current++;
        startPos = onset.pos;
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
// cambiar de cuerda. No están puestos a ojo: son los que más se parecen a un guitarrista real,
// medidos colocando SIN restricciones las 1716 notas sueltas de las tabs de public/tabs y
// comparando con dónde las puso el tabulador (74 % idénticas; 70 % con los pesos iniciales).
export interface PlaceWeights {
  fret: number; // por traste que la mano tiene que moverse fuera de la caja
  string: number; // por cuerda que se cambia
  box: number; // trastes alcanzables sin mover la mano (además del de partida)
  hurry: number; // segundos "cómodos" para un cambio; con menos tiempo cuesta más (de ×0,5 a ×3)
  tab: number; // por NO poner la nota donde la puso la tablatura real (si allí se puede)
  high: number; // por traste por encima del 5 (los trastes bajos son más fáciles)
  open: number; // premio por cuerda al aire (no hace falta mover la mano)
  pattern: number; // por colocar un trozo ya visto (3 alturas seguidas) distinto de la primera vez
}

export const PLACE_WEIGHTS: PlaceWeights = { fret: 1, string: 1, box: 3, hurry: 0.2, tab: 1.5, high: 0.1, open: 1, pattern: 3 };
// La MISMA altura dos veces seguidas no cambia de sitio (así funciona "mantener pulsado").
const SAME_PITCH_MOVE_COST = 50;

export interface PlaceItem {
  pitch: number;
  t: number;
  // Dónde la puso la tablatura real (solo si es la misma altura).
  real?: { string: number; fret: number };
}

// Camino de menor coste (Viterbi). El estado es (posición, traste de la mano): una cuerda al aire
// no mueve la mano, así que el salto se mide desde la última nota pisada. null si alguna altura no
// tiene sitio.
export function placeSequence(
  items: PlaceItem[],
  positions: LanePosition[],
  weights: PlaceWeights = PLACE_WEIGHTS,
  unary?: (index: number, place: LanePosition) => number,
): { path: LanePosition[]; cost: number } | null {
  if (items.length === 0) return { path: [], cost: 0 };
  type State = { cost: number; place: LanePosition; hand: number | null; back: State | null };
  const hurry = (dt: number) => Math.min(3, Math.max(0.5, weights.hurry / Math.max(dt, 1e-3)));
  const noteCost = (item: PlaceItem, index: number, place: LanePosition) => {
    let cost = weights.high * Math.max(0, place.fret - 5);
    if (place.fret === 0) cost -= weights.open;
    if (item.real && (item.real.string !== place.string || item.real.fret !== place.fret)) cost += weights.tab;
    return cost + (unary ? unary(index, place) : 0);
  };
  let layer: State[] = [];
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const places = positions.filter((p) => p.pitch === item.pitch);
    const next = new Map<string, State>();
    for (const place of places) {
      const own = noteCost(item, index, place);
      if (index === 0) {
        const hand = place.fret === 0 ? null : place.fret;
        next.set(`${place.string}:${place.fret}:${hand}`, { cost: own, place, hand, back: null });
        continue;
      }
      const prevItem = items[index - 1];
      const h = hurry(item.t - prevItem.t);
      for (const prev of layer) {
        let move: number;
        if (item.pitch === prevItem.pitch && (prev.place.string !== place.string || prev.place.fret !== place.fret)) {
          move = SAME_PITCH_MOVE_COST;
        } else {
          const handJump = place.fret === 0 || prev.hand === null ? 0 : Math.abs(place.fret - prev.hand);
          move = (weights.fret * Math.max(0, handJump - weights.box) + weights.string * Math.abs(place.string - prev.place.string)) * h;
        }
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

// Coloca una frase en varias cuerdas. Alturas candidatas (cada una con un coste extra pequeño):
// - la real y sus octavas;
// - "trasladar de cuerda": la frase entera pasa de una cuerda real a una del nivel CON LA MISMA
//   FORMA (mismos trastes), p. ej. el pedal de Thunderstruck en la Si al aire (2/0 2/4 2/0 2/7)
//   -> en la La al aire (5/0 5/4 5/0 5/7), en vez de bajarlo una octava y tener que alternar
//   cuerdas. Ahí la "posición real" que se intenta respetar es la trasladada;
// - si nada cabe, el desplazamiento exacto más corto, y si tampoco, el contorno.
// Se queda con lo más barato (coste del camino + extra).
const OCTAVE_SHIFT_COST = 2;
const STRING_TRANSFER_COST = 3;
const SEMITONE_SHIFT_COST = 6;

function placePhraseMulti(
  phrase: Onset[],
  layout: ReturnType<typeof laneLayout>,
  available: Set<number>,
  unary: (index: number, place: LanePosition) => number,
): LanePosition[] {
  const pitches = phrase.map((onset) => onset.lead.midi);
  const levelStrings = [...new Set(layout.positions.map((p) => p.string))];
  const shifts = new Map<number, number>();
  const offer = (shift: number, extra: number) => {
    if (pitches.every((p) => available.has(p + shift)) && extra < (shifts.get(shift) ?? Infinity)) shifts.set(shift, extra);
  };
  for (let k = -4; k <= 4; k++) offer(12 * k, OCTAVE_SHIFT_COST * Math.abs(k));
  for (const realString of new Set(phrase.map((onset) => onset.lead.string))) {
    for (const string of levelStrings) offer(OPEN_MIDI[string] - OPEN_MIDI[realString], STRING_TRANSFER_COST);
  }
  const candidates: Array<{ pitches: number[]; extra: number; shift: number | null }> = [...shifts].map(([shift, extra]) => ({
    pitches: pitches.map((p) => p + shift),
    extra,
    shift,
  }));
  if (candidates.length === 0) {
    const shift = exactShift(pitches, available);
    if (shift !== null) candidates.push({ pitches: pitches.map((p) => p + shift), extra: SEMITONE_SHIFT_COST, shift: null });
  }
  if (candidates.length === 0) {
    const lanes = contourLanes(pitches, layout.pitches.length);
    const laneSeq = pitches.map((p) => lanes.get(p)!);
    for (let k = 1; k < laneSeq.length; k++) {
      if (pitches[k] !== pitches[k - 1] && laneSeq[k] === laneSeq[k - 1]) {
        laneSeq[k] = Math.min(layout.pitches.length - 1, Math.max(0, laneSeq[k] + Math.sign(pitches[k] - pitches[k - 1])));
      }
    }
    candidates.push({ pitches: laneSeq.map((lane) => layout.pitches[lane]), extra: SEMITONE_SHIFT_COST, shift: null });
  }
  let best: { path: LanePosition[]; cost: number } | null = null;
  for (const candidate of candidates) {
    // Posición real (trasladada a la cuerda que da exactamente este desplazamiento, mismo traste).
    const realOf = (onset: Onset) => {
      if (candidate.shift === null) return undefined;
      const string = candidate.shift === 0 ? onset.lead.string : levelStrings.find((s) => OPEN_MIDI[s] - OPEN_MIDI[onset.lead.string] === candidate.shift);
      return string === undefined ? undefined : { string, fret: onset.lead.fret };
    };
    const items: PlaceItem[] = phrase.map((onset, k) => ({ pitch: candidate.pitches[k], t: onset.t, real: realOf(onset) }));
    const placed = placeSequence(items, layout.positions, PLACE_WEIGHTS, unary);
    if (placed && (!best || placed.cost + candidate.extra < best.cost)) best = { path: placed.path, cost: placed.cost + candidate.extra };
  }
  return best!.path;
}

// Clave de una frase para reconocer un riff repetido: alturas + ritmo (huecos en negras, a la
// semicorchea).
function phraseKey(phrase: Onset[]): string {
  return phrase.map((onset, k) => `${onset.lead.midi}@${k === 0 ? 0 : Math.round((onset.pos - phrase[k - 1].pos) * 4)}`).join(' ');
}

const PATTERN_LENGTH = 3;

function placeAllMulti(kept: Onset[], phraseOf: number[], profile: LevelProfile): LanePosition[] {
  const layout = laneLayout(profile);
  const available = new Set(layout.pitches);
  const placed: LanePosition[] = new Array(kept.length);
  // Riffs repetidos (decisión del usuario): una frase igual que otra anterior se copia tal cual; y
  // cada trozo de 3 alturas seguidas ya colocado "tira" de las frases nuevas hacia la misma forma.
  const byKey = new Map<string, LanePosition[]>();
  const patterns = new Map<string, LanePosition[]>();
  let i = 0;
  while (i < kept.length) {
    let end = i;
    while (end < kept.length && phraseOf[end] === phraseOf[i]) end++;
    const phrase = kept.slice(i, end);
    const key = phraseKey(phrase);
    let path = byKey.get(key);
    if (!path) {
      const pitchesOf = (from: number) => phrase.slice(from, from + PATTERN_LENGTH).map((onset) => onset.lead.midi).join(',');
      const unary = (index: number, place: LanePosition) => {
        let cost = 0;
        for (let w = Math.max(0, index - PATTERN_LENGTH + 1); w <= index && w + PATTERN_LENGTH <= phrase.length; w++) {
          const was = patterns.get(pitchesOf(w))?.[index - w];
          // Solo cuenta a la misma altura (la frase puede ir a otra octava).
          if (was && was.pitch === place.pitch && (was.string !== place.string || was.fret !== place.fret)) cost += PLACE_WEIGHTS.pattern;
        }
        return cost;
      };
      path = placePhraseMulti(phrase, layout, available, unary);
      byKey.set(key, path);
      for (let w = 0; w + PATTERN_LENGTH <= phrase.length; w++) {
        const pattern = pitchesOf(w);
        if (!patterns.has(pattern)) patterns.set(pattern, path.slice(w, w + PATTERN_LENGTH));
      }
    }
    path.forEach((place, k) => { placed[i + k] = place; });
    i = end;
  }
  return placed;
}

export function reduceChart(chart: Chart, profile: LevelProfile): Chart {
  const { pos, beatSeconds } = makeBeatPosition(chart);
  const onsets = groupOnsets(chart, pos);
  const kept = pickByGrid(onsets, gridSlots(chart, profile.gridBeats), profile);
  const phraseOf = splitPhrases(kept, profile, beatSeconds);
  const layout = laneLayout(profile);
  const available = new Set(layout.pitches);
  const multiPlaces = profile.strings.length > 1 ? placeAllMulti(kept, phraseOf, profile) : null;

  // Altura traducida de cada nota, frase a frase (con varias cuerdas ya va en multiPlaces).
  const targetPitch: number[] = new Array(kept.length);
  let i = 0;
  while (!multiPlaces && i < kept.length) {
    let end = i;
    while (end < kept.length && phraseOf[end] === phraseOf[i]) end++;
    const pitches = kept.slice(i, end).map((onset) => onset.lead.midi);
    const shift = exactShift(pitches, available);
    if (shift !== null) {
      pitches.forEach((p, k) => { targetPitch[i + k] = p + shift; });
    } else {
      const lanes = contourLanes(pitches, layout.pitches.length);
      const laneSeq = pitches.map((p) => lanes.get(p)!);
      // Si dos alturas distintas seguidas acabaron en el mismo botón, se separan en su dirección.
      for (let k = 1; k < laneSeq.length; k++) {
        if (pitches[k] !== pitches[k - 1] && laneSeq[k] === laneSeq[k - 1]) {
          const dir = Math.sign(pitches[k] - pitches[k - 1]);
          laneSeq[k] = Math.min(layout.pitches.length - 1, Math.max(0, laneSeq[k] + dir));
        }
      }
      laneSeq.forEach((lane, k) => { targetPitch[i + k] = layout.pitches[lane]; });
    }
    i = end;
  }

  let prevFret = profile.minFret;
  const notes: ChartNote[] = kept.map((onset, k) => {
    const next = kept[k + 1];
    let place: LanePosition;
    if (multiPlaces) {
      place = multiPlaces[k];
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
