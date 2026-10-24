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
// Cada nota traducida es "dueña" (`sourceIds`) de las notas reales de la canción desde su golpe
// hasta la siguiente nota traducida: al acertarla, esas suenan fuerte (ver session.ts).

import type { Chart, ChartNote } from './chart';
import type { LevelProfile } from './levels';

// Afinación estándar: altura de cada cuerda al aire (cuerda 1 = Mi agudo).
const OPEN_MIDI: Record<number, number> = { 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40 };
const POWER_CHORD_INTERVALS = new Set([0, 5, 7, 12, 17, 19, 24]);
const PHRASE_MAX_BEATS = 8;

interface Onset {
  t: number;
  pos: number;
  notes: ChartNote[];
  lead: ChartNote;
}

interface LanePosition {
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
    for (let fret = profile.minFret; fret <= profile.maxFret; fret++) {
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

export function reduceChart(chart: Chart, profile: LevelProfile): Chart {
  const { pos, beatSeconds } = makeBeatPosition(chart);
  const onsets = groupOnsets(chart, pos);
  const kept = pickByGrid(onsets, gridSlots(chart, profile.gridBeats), profile);
  const phraseOf = splitPhrases(kept, profile, beatSeconds);
  const layout = laneLayout(profile);
  const available = new Set(layout.pitches);

  // Altura traducida de cada nota, frase a frase.
  const targetPitch: number[] = new Array(kept.length);
  let i = 0;
  while (i < kept.length) {
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
    const candidates = layout.positions.filter((p) => p.pitch === targetPitch[k]);
    const place = candidates.reduce((best, p) => (Math.abs(p.fret - prevFret) < Math.abs(best.fret - prevFret) ? p : best), candidates[0]);
    prevFret = place.fret;
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
