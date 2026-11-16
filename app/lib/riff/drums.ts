// BATERÍA JUGABLE en Riff-Hero (usuario, 2026-11-16; puro, sin React ni audio).
//
// La batería se toca en el mástil como un TECLADO, no como una guitarra: una sola "cuerda" (la 6) y seis
// columnas fijas, una por pad (siempre en su sitio, en todos los niveles, para que lo aprendido valga):
//   0 Plato (Z) · 1 Bombo (X) · 2 Caja (C) · 3 Tom agudo (V) · 4 Tom grave (B) · 5 Plato fuerte (N)
// (orden del usuario, 2026-11-16: el de una batería vista de frente; el plato normal, el que más se toca, en la Z).
// Sin hammer-on, pull-off ni tapping: cada golpe es independiente y lo que se toca a la vez suena a la vez.
//
// TRADUCCIÓN (regla del usuario: la misma en las tabs, en Riff-Hero y en un futuro instrumento MIDI): el
// plato "normal" es un hihat cerrado; los platos se reparten entre él y el plato fuerte (lo abierto:
// crash, china, splash, hihat abierto); los toms graves van al tom grave y los agudos al tom agudo; y
// donde no hay toms ni plato fuerte (3 pads), los toms graves son bombo, los agudos caja y todos los
// platos, el plato normal. El reproductor de tablatura ya sigue esa regla con sus 3 sonidos
// (KICK_MIDI/SNARE_MIDI/CYMBAL_MIDI en chart.ts).
import type { Chart, ChartNote } from './chart';

export type DrumPad = 0 | 1 | 2 | 3 | 4 | 5;
export const HIHAT: DrumPad = 0;
export const KICK: DrumPad = 1;
export const SNARE: DrumPad = 2;
export const HIGH_TOM: DrumPad = 3;
export const LOW_TOM: DrumPad = 4;
export const CRASH: DrumPad = 5;

export const DRUM_PADS: Array<{ pad: DrumPad; name: string; short: string; key: string }> = [
  { pad: HIHAT, name: 'Plato', short: 'Plato', key: 'Z' },
  { pad: KICK, name: 'Bombo', short: 'Bombo', key: 'X' },
  { pad: SNARE, name: 'Caja', short: 'Caja', key: 'C' },
  { pad: HIGH_TOM, name: 'Tom agudo', short: 'Tom A.', key: 'V' },
  { pad: LOW_TOM, name: 'Tom grave', short: 'Tom G.', key: 'B' },
  { pad: CRASH, name: 'Plato fuerte', short: 'Plato F.', key: 'N' },
];

const KICKS = new Set([35, 36]);
const SNARES = new Set([31, 33, 34, 37, 38, 40]);
const LOW_TOMS = new Set([41, 43, 45]);
const HIGH_TOMS = new Set([47, 48, 50]);
// Platos de ACENTO -> plato fuerte: crash, china, splash. El hihat abierto (46) marca el tiempo como el
// cerrado (corcheas de un riff) y va al plato normal (usuario, 2026-11-16: el plato fuerte salía demasiado;
// en Master of Puppets eran 306 golpes de N y 1 de Z, casi todos hihat abierto).
const OPEN_CYMBALS = new Set([49, 52, 55, 57]);
// Un crash a menos de esto del anterior golpe de plato fuerte marca el tiempo (un "ride" sobre el crash):
// va al plato normal, y el fuerte queda para los acentos sueltos.
export const CRASH_RUN_SECONDS = 0.4;

// Pad de un golpe (número de percusión General MIDI). Lo que no es bombo, caja, tom ni plato abierto
// (hihat cerrado y de pedal, ride, campana, palmas, pandereta, cencerro...) marca el tiempo: plato.
export function padOfMidi(midi: number): DrumPad {
  if (KICKS.has(midi)) return KICK;
  if (SNARES.has(midi)) return SNARE;
  if (LOW_TOMS.has(midi)) return LOW_TOM;
  if (HIGH_TOMS.has(midi)) return HIGH_TOM;
  if (OPEN_CYMBALS.has(midi)) return CRASH;
  return HIHAT;
}

// Reparto de los platos de la batería que se toca (en orden de tiempo): ver CRASH_RUN_SECONDS.
export function spreadCymbals(notes: Array<{ t: number; fret: number }>): void {
  let lastCrash = -Infinity;
  for (const note of notes) {
    if (note.fret !== CRASH) continue;
    const t = note.t;
    if (t - lastCrash < CRASH_RUN_SECONDS) note.fret = HIHAT;
    lastCrash = t;
  }
}

// Con solo bombo, caja y plato (Medio, Avanzado y el juego de ritmo de Conceptos básicos).
export function threePad(pad: DrumPad): DrumPad {
  if (pad === CRASH) return HIHAT;
  if (pad === LOW_TOM) return KICK;
  if (pad === HIGH_TOM) return SNARE;
  return pad;
}

// Niveles de batería: qué pads se tocan y cuántos a la vez (el resto de la tab sigue sonando de fondo).
// Sin aligerar (usuario): todos los golpes de esos pads, al ritmo de la tab.
export interface DrumLevelRule {
  pads: DrumPad[];
  // Pads de más -> estos (null = no se toca, suena de fondo).
  map: (pad: DrumPad) => DrumPad | null;
  maxHits: number;
  // Prioridad si un golpe tiene más pads que `maxHits`.
  priority: DrumPad[];
}

export const DRUM_LEVEL_RULES: Record<'facil' | 'medio' | 'avanzado' | 'dificil', DrumLevelRule> = {
  // "Bombo o caja": uno a la vez; si van juntos, la caja (el acento).
  facil: { pads: [KICK, SNARE], map: (pad) => { const p = threePad(pad); return p === HIHAT ? null : p; }, maxHits: 1, priority: [SNARE, KICK] },
  // Bombo, caja y plato, de dos en dos.
  medio: { pads: [KICK, SNARE, HIHAT], map: threePad, maxHits: 2, priority: [KICK, SNARE, HIHAT] },
  // Los mismos tres; de momento también de dos en dos (usuario, 2026-11-16: máximo 2 golpes a la vez en
  // todos los niveles), así que hoy es igual que Medio.
  avanzado: { pads: [KICK, SNARE, HIHAT], map: threePad, maxHits: 2, priority: [KICK, SNARE, HIHAT] },
  // Los seis, de dos en dos (de momento). Cuál se queda cuando la tab junta 3 o más: como una batería de
  // verdad, un PIE y una MANO -- el bombo siempre (la base del ritmo) y el golpe de mano más importante:
  // el plato fuerte (el acento que abre una frase), la caja (el contratiempo), los toms (los redobles) y
  // por último el plato normal (el relleno continuo, lo que menos se echa en falta). Sin bombo, las dos
  // primeras manos de esa lista. Lo que se quita sigue sonando de fondo.
  dificil: { pads: [CRASH, LOW_TOM, KICK, SNARE, HIGH_TOM, HIHAT], map: (pad) => pad, maxHits: 2, priority: [KICK, CRASH, SNARE, HIGH_TOM, LOW_TOM, HIHAT] },
};

// El chart de un nivel de batería a partir del chart REAL de la pista (chart.ts: cada golpe es una nota
// en la cuerda 6 con traste = su pad de los 6). Cada nota del nivel es "dueña" (`sourceIds`) de los
// golpes reales de su pad en ese instante; los golpes que el nivel no toca no tienen dueña y suenan de
// fondo a volumen normal (session.ts). `sourceNotes` = los golpes reales.
export function reduceDrums(chart: Chart, rule: DrumLevelRule): Chart {
  const notes: ChartNote[] = [];
  for (let i = 0; i < chart.notes.length;) {
    let end = i + 1;
    while (end < chart.notes.length && Math.abs(chart.notes[end].t - chart.notes[i].t) < 0.005) end++;
    const onset = chart.notes.slice(i, end);
    const owners = new Map<DrumPad, ChartNote[]>();
    for (const note of onset) {
      const pad = rule.map(note.fret as DrumPad);
      if (pad === null) continue;
      owners.set(pad, [...(owners.get(pad) ?? []), note]);
    }
    const chosen = rule.priority.filter((pad) => owners.has(pad)).slice(0, rule.maxHits).sort((a, b) => a - b);
    for (const pad of chosen) {
      const real = owners.get(pad)!;
      notes.push({
        id: 0,
        t: onset[0].t,
        dur: Math.max(...real.map((note) => note.dur)),
        string: 6,
        fret: pad,
        midi: real[0].midi,
        palmMute: false,
        tech: [],
        sourceIds: real.map((note) => note.id),
      });
    }
    i = end;
  }
  notes.forEach((note, index) => { note.id = index; });
  return { ...chart, notes, sourceNotes: chart.notes };
}
