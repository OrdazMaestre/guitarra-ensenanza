// TECLADO jugable en Riff-Hero (usuario, 2026-11-18). Puro (sin React ni audio), para probarlo en Node.
//
// Las pistas de piano, órgano o sinte (chart.ts, `isKeysTrack`) se tocan en un teclado dibujado sobre el
// mástil. Sus niveles filtran por TIEMPO como el modo trastes (la misma densidad: `thinOnsets` de
// reduce.ts), pero las notas son las REALES, recolocadas a la octava que se juega:
//   - Principiante, Fácil y Medio: Do4-Do5 (Z S X D C V G B H N J M ,), las teclas del MiniKeyboard.
//   - Avanzado: La3-Fa5 (ShiftIzq BloqMayús < Z ... , L . ; / ShiftDer).
// Notas a la vez: 1, 1, 2 y 3 (melodía = la más aguda, luego el bajo = la más grave, luego la central).
//
// Cada tecla es una posición del mástil del juego: traste = semitonos desde la tecla más grave del
// nivel; las BLANCAS van en la cuerda 6 (carril de abajo, rojo) y las NEGRAS en la 5 (carril de arriba,
// verde), como el modo dos cuerdas (usuario: "rojas las blancas y verdes las negras, con sus degradados").

import type { Chart, ChartNote } from './chart';
import type { LevelProfile } from './levels';
import { thinOnsets } from './reduce';

export interface KeysRule {
  // Tecla más grave y más aguda del nivel (MIDI).
  low: number;
  high: number;
  // Notas a la vez.
  maxChord: number;
}

// SONIDO (usuario, 2026-11-18): lo que se VE va traducido al trozo de teclado del nivel, pero suena la nota
// REAL de la tab con un solo límite, por abajo: la voz del MiniKeyboard (paso alto a 140 Hz) pierde la
// fundamental por debajo de ~Do#3 y los graves se enmascaraban (el órgano de Maybe I'm a Leo baja a Mi2). Lo
// que suene por debajo de Do3 sube de octava; los agudos, tal cual. Vale también para los teclados de fondo.
export const KEYS_MIN_SOUND_MIDI = 48;
export function keysSoundMidi(midi: number): number {
  let out = midi;
  while (out < KEYS_MIN_SOUND_MIDI) out += 12;
  return out;
}

const BLACK = new Set([1, 3, 6, 8, 10]);
export function isBlackKey(midi: number): boolean {
  return BLACK.has(((midi % 12) + 12) % 12);
}

// Cuerda del juego de una tecla: blancas abajo (6), negras arriba (5).
export const WHITE_STRING = 6;
export const BLACK_STRING = 5;
export function keyPosition(midi: number, rule: KeysRule): { string: number; fret: number } {
  return { string: isBlackKey(midi) ? BLACK_STRING : WHITE_STRING, fret: midi - rule.low };
}
export function keyMidi(fret: number, rule: KeysRule): number {
  return rule.low + fret;
}

// Una altura llevada a la octava del nivel más cercana a `target` (misma nota, otra octava).
function inRange(midi: number, rule: KeysRule): number[] {
  const out: number[] = [];
  const pc = ((midi % 12) + 12) % 12;
  for (let m = rule.low; m <= rule.high; m++) if (((m % 12) + 12) % 12 === pc) out.push(m);
  return out;
}

// Cuántas octavas (en semitonos, múltiplo de 12) mover una frase para que quepan más notas en el nivel;
// si empatan, la que menos la mueve.
function phraseShift(pitches: number[], rule: KeysRule): number {
  let best = 0;
  let bestCount = -1;
  for (let k = 0; k <= 8; k++) {
    for (const sign of k === 0 ? [1] : [-1, 1]) {
      const shift = sign * k * 12;
      const count = pitches.filter((p) => p + shift >= rule.low && p + shift <= rule.high).length;
      if (count > bestCount) {
        best = shift;
        bestCount = count;
      }
    }
  }
  return best;
}

// La MELODÍA (la nota más aguda de cada golpe) en las teclas del nivel: cada nota puede ir en cualquiera
// de sus octavas dentro del rango, y se elige el camino de menor coste (Viterbi), como `placeSequence` en
// la guitarra:
// - dar la vuelta a la melodía (sube en la canción y baja en el juego, o al revés) cuesta mucho;
// - cambiar el tamaño de un intervalo cuesta poco (una octava de más o de menos se nota);
// - alejarse de la octava de su frase (`phraseTarget`, la que deja más notas dentro) cuesta un poco.
// Entre frases (silencio largo) la dirección no cuenta: es un nuevo comienzo.
const FLIP_COST = 10;
const INTERVAL_COST = 0.15;
const PHRASE_COST = 0.4;
// - y que las demás notas del acorde quepan POR DEBAJO de la melodía (si no, el acorde se da la vuelta).
const NO_ROOM_BELOW_COST = 3;
function placeMelody(real: number[], phraseOf: number[], times: number[], phraseTarget: number[], rule: KeysRule, below: number[][] = []): number[] {
  const n = real.length;
  if (n === 0) return [];
  const options = real.map((m) => inRange(m, rule));
  const local = (i: number, m: number) => PHRASE_COST * Math.abs(m - phraseTarget[i]) / 12
    + NO_ROOM_BELOW_COST * (below[i] ?? []).filter((other) => !inRange(other, rule).some((o) => o < m)).length;
  let cost = options[0].map((m) => local(0, m));
  const back: number[][] = [options[0].map(() => -1)];
  for (let i = 1; i < n; i++) {
    const newPhrase = phraseOf[i] !== phraseOf[i - 1] && times[i] - times[i - 1] > PHRASE_GAP_SECONDS;
    const realStep = real[i] - real[i - 1];
    const next: number[] = [];
    const from: number[] = [];
    options[i].forEach((m) => {
      let best = Number.POSITIVE_INFINITY;
      let arg = 0;
      options[i - 1].forEach((p, k) => {
        const step = m - p;
        let c = cost[k] + local(i, m);
        if (!newPhrase) {
          if (Math.sign(step) !== Math.sign(realStep)) c += FLIP_COST;
          c += INTERVAL_COST * Math.abs(step - realStep);
        }
        if (c < best) {
          best = c;
          arg = k;
        }
      });
      next.push(best);
      from.push(arg);
    });
    cost = next;
    back.push(from);
  }
  const out = new Array<number>(n);
  let k = cost.indexOf(Math.min(...cost));
  for (let i = n - 1; i >= 0; i--) {
    out[i] = options[i][k];
    k = back[i][k];
  }
  return out;
}

// Notas que se quedan de un golpe: la más aguda (melodía), la más grave (bajo) y la central, sin repetir
// el nombre de nota (Do3 y Do4 juntos son "la misma tecla" en el nivel).
function chooseChord(notes: ChartNote[], maxChord: number): ChartNote[] {
  const sorted = [...notes].sort((a, b) => a.midi - b.midi);
  const order = [sorted[sorted.length - 1], sorted[0], sorted[Math.floor((sorted.length - 1) / 2)], ...sorted.slice(1, -1).reverse()];
  const out: ChartNote[] = [];
  const seen = new Set<number>();
  for (const note of order) {
    if (!note || out.length >= maxChord) break;
    const pc = ((note.midi % 12) + 12) % 12;
    if (seen.has(pc)) continue;
    seen.add(pc);
    out.push(note);
  }
  return out;
}

const PHRASE_BARS = 2;
const PHRASE_GAP_SECONDS = 1.2;

const highest = (notes: ChartNote[]) => notes.reduce((a, b) => (b.midi > a.midi ? b : a));

// El chart de un nivel de teclado a partir del chart REAL de la pista (chart.ts, `kit: 'keys'`).
export function reduceKeys(chart: Chart, profile: LevelProfile): Chart {
  const rule = profile.keys!;
  const kept = thinOnsets(chart, profile, highest);
  const barOf = (t: number) => {
    let index = 0;
    for (let i = 0; i < chart.bars.length; i++) {
      if (chart.bars[i].t <= t + 1e-6) index = i;
      else break;
    }
    return index;
  };
  // Frases: cada 2 compases, o tras un silencio largo.
  const phraseOf: number[] = [];
  let phrase = 0;
  let startBar = kept.length ? barOf(kept[0].t) : 0;
  kept.forEach((onset, i) => {
    const bar = barOf(onset.t);
    if (i > 0 && (bar - startBar >= PHRASE_BARS || onset.t - kept[i - 1].t > PHRASE_GAP_SECONDS)) {
      phrase++;
      startBar = bar;
    }
    phraseOf.push(phrase);
  });
  const chords = kept.map((onset) => chooseChord(onset.notes, rule.maxChord));
  const shifts = new Map<number, number>();
  for (let p = 0; p <= phrase; p++) {
    const pitches = chords.flatMap((chord, i) => (phraseOf[i] === p ? chord.map((note) => note.midi) : []));
    shifts.set(p, phraseShift(pitches, rule));
  }

  // Dueñas: cada nota real, de la nota del nivel de su golpe con su mismo nombre; si no, de la melodía
  // del último golpe que se queda antes que ella (como en reduce.ts: suena al acertar).
  const keptStart = new Map<number, number>();
  kept.forEach((onset, i) => keptStart.set(onset.notes[0].id, i));
  const notes: ChartNote[] = [];
  const melodyMidi = placeMelody(chords.map((chord) => chord[0].midi), phraseOf, kept.map((onset) => onset.t), chords.map((chord, i) => chord[0].midi + (shifts.get(phraseOf[i]) ?? 0)), rule, chords.map((chord) => chord.slice(1).map((note) => note.midi)));
  const placedOf: Array<Array<{ real: ChartNote; midi: number }>> = [];
  kept.forEach((onset, i) => {
    const chord = chords[i];
    const shift = shifts.get(phraseOf[i]) ?? 0;
    const top = melodyMidi[i];
    const placed = [{ real: chord[0], midi: top }];
    // Las demás, por debajo de la melodía si se puede (el acorde no se da la vuelta).
    for (const note of chord.slice(1)) {
      const options = inRange(note.midi, rule);
      const wanted = note.midi + shift;
      const below = options.filter((m) => m < top);
      const pool = below.length ? below : options;
      placed.push({ real: note, midi: pool.reduce((a, b) => (Math.abs(b - wanted) < Math.abs(a - wanted) ? b : a)) });
    }
    placedOf.push(placed);
  });

  // Notas reales de cada golpe que se queda, hasta el siguiente.
  const owned: number[][] = kept.map(() => []);
  {
    let current = -1;
    for (const note of chart.notes) {
      const start = keptStart.get(note.id);
      if (start !== undefined) current = start;
      if (current >= 0 && note.t >= kept[current].t - 0.005) owned[current].push(note.id);
    }
  }
  kept.forEach((onset, i) => {
    const placed = placedOf[i];
    const byPc = new Map<number, number>();
    placed.forEach((entry, k) => byPc.set(((entry.real.midi % 12) + 12) % 12, k));
    const ids: number[][] = placed.map(() => []);
    const ownIds = new Set(onset.notes.map((note) => note.id));
    for (const id of owned[i]) {
      const real = chart.notes[id];
      const k = ownIds.has(id) ? byPc.get(((real.midi % 12) + 12) % 12) ?? 0 : 0;
      ids[k].push(id);
    }
    placed
      .map((entry, k) => ({ entry, k }))
      .sort((a, b) => a.entry.midi - b.entry.midi)
      .forEach(({ entry, k }) => {
        const position = keyPosition(entry.midi, rule);
        // `midi + soundShift` = la altura EXACTA que suena (la real, con el suelo de graves): la que vale
        // con la fila aguda del teclado (RiffSession.matches, `exactMidi`).
        const sounding = keysSoundMidi(entry.real.midi);
        notes.push({
          id: 0,
          t: onset.t,
          dur: entry.real.dur,
          ...position,
          midi: entry.midi,
          palmMute: false,
          tech: [],
          sourceIds: ids[k],
          phrase: phraseOf[i],
          ...(sounding !== entry.midi ? { soundShift: sounding - entry.midi } : {}),
        });
      });
  });
  notes.forEach((note, index) => { note.id = index; });
  // Lo que suena de fondo y al acertar: las notas reales (mismos ids), con el suelo de graves.
  const sourceNotes = chart.notes.map((note) => {
    const shift = keysSoundMidi(note.midi) - note.midi;
    return shift ? { ...note, soundShift: shift } : note;
  });
  return { ...chart, notes, sourceNotes, kit: 'keys' };
}
