// BATERÍA JUGABLE en Riff-Hero (usuario, 2026-11-16; puro, sin React ni audio).
//
// La batería se toca en el mástil como un TECLADO, no como una guitarra: una sola "cuerda" (la 6) y seis
// columnas fijas, una por pad (siempre en su sitio, en todos los niveles, para que lo aprendido valga):
//   0 Bombo (Z) · 1 Plato (X) · 2 Caja (C) · 3 Tom agudo (V) · 4 Tom grave (B) · 5 Plato fuerte (N)
// (orden del usuario, 2026-11-16, el de una batería vista de frente; el 2026-11-17 cambió bombo y plato:
// bombo en la Z y plato en la X).
// Sin hammer-on, pull-off ni tapping: cada golpe es independiente y lo que se toca a la vez suena a la vez.
//
// TRADUCCIÓN (regla del usuario: la misma en las tabs, en Riff-Hero y en un futuro instrumento MIDI): el
// plato "normal" es un hihat cerrado; los platos se reparten entre él y el plato fuerte (lo abierto:
// crash, china, splash, hihat abierto); los toms graves van al tom grave y los agudos al tom agudo; y
// donde no hay toms ni plato fuerte (3 pads), los toms graves son bombo, los agudos caja y todos los
// platos, el plato normal. SONIDO (usuario, 2026-11-17): `drumSoundOfMidi` da a cada golpe el de su pad, y
// así suenan la batería jugable, la de fondo de Riff-Hero (chart.drums) y la de las tablaturas (AlphaTabPlayer).
import type { Chart, ChartNote, DrumSound } from './chart';

export type DrumPad = 0 | 1 | 2 | 3 | 4 | 5;
export const KICK: DrumPad = 0;
export const HIHAT: DrumPad = 1;
export const SNARE: DrumPad = 2;
export const HIGH_TOM: DrumPad = 3;
export const LOW_TOM: DrumPad = 4;
export const CRASH: DrumPad = 5;

export const DRUM_PADS: Array<{ pad: DrumPad; name: string; short: string; key: string }> = [
  { pad: KICK, name: 'Bombo', short: 'Bombo', key: 'Z' },
  { pad: HIHAT, name: 'Plato', short: 'Plato', key: 'X' },
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

// El SONIDO de un golpe General MIDI, el mismo en todas partes (usuario, 2026-11-17): la batería jugable, la
// batería de fondo de Riff-Hero y la de las tablaturas (AlphaTabPlayer) suenan igual, con toms y plato fuerte
// propios. Sigue a `padOfMidi`.
const PAD_SOUND: Record<DrumPad, DrumSound> = { [HIHAT]: 'cymbal', [KICK]: 'kick', [SNARE]: 'snare', [HIGH_TOM]: 'tomHigh', [LOW_TOM]: 'tomLow', [CRASH]: 'crash' } as Record<DrumPad, DrumSound>;
export function drumSoundOfMidi(midi: number): DrumSound {
  return PAD_SOUND[padOfMidi(midi)];
}

// Con los 3 controles de batería de las tablaturas (bombo, caja, platillo): la regla de 3 pads (`threePad`).
export function threePadSound(sound: DrumSound): 'kick' | 'snare' | 'cymbal' {
  if (sound === 'tomLow') return 'kick';
  if (sound === 'tomHigh') return 'snare';
  if (sound === 'crash') return 'cymbal';
  return sound;
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
// Medio y Avanzado: bombo, caja y SOLO el plato de la N (usuario, 2026-11-17: el plato de la X, el que marca
// el tiempo, era demasiado para estos niveles; no se juntan: sus golpes no se tocan y suenan de fondo). Los
// toms, como en `threePad`: los graves al bombo y los agudos a la caja.
// Difícil (usuario, 2026-11-17): los DOS platos, bombo y caja, sin toms (los graves al bombo y los agudos a
// la caja, como en `threePad`).
function noToms(pad: DrumPad): DrumPad {
  if (pad === LOW_TOM) return KICK;
  if (pad === HIGH_TOM) return SNARE;
  return pad;
}

function threePadCrash(pad: DrumPad): DrumPad | null {
  if (pad === HIHAT) return null;
  if (pad === CRASH) return CRASH;
  return threePad(pad);
}

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

export const DRUM_LEVEL_RULES: Record<'facil' | 'medio' | 'avanzado' | 'dificil' | 'experto', DrumLevelRule> = {
  // "Bombo o caja": uno a la vez; si van juntos, la caja (el acento).
  facil: { pads: [KICK, SNARE], map: (pad) => { const p = threePad(pad); return p === HIHAT ? null : p; }, maxHits: 1, priority: [SNARE, KICK] },
  // Bombo, caja y plato, de dos en dos.
  medio: { pads: [KICK, SNARE, CRASH], map: threePadCrash, maxHits: 2, priority: [KICK, SNARE, CRASH] },
  // Los mismos tres; de momento también de dos en dos (usuario, 2026-11-16: máximo 2 golpes a la vez en
  // todos los niveles), así que hoy es igual que Medio.
  avanzado: { pads: [KICK, SNARE, CRASH], map: threePadCrash, maxHits: 2, priority: [KICK, SNARE, CRASH] },
  // Los seis, de dos en dos (de momento). Cuál se queda cuando la tab junta 3 o más: como una batería de
  // verdad, un PIE y una MANO -- el bombo siempre (la base del ritmo) y el golpe de mano más importante:
  // el plato fuerte (el acento que abre una frase), la caja (el contratiempo), los toms (los redobles) y
  // por último el plato normal (el relleno continuo, lo que menos se echa en falta). Sin bombo, las dos
  // primeras manos de esa lista. Lo que se quita sigue sonando de fondo.
  dificil: { pads: [KICK, HIHAT, SNARE, CRASH], map: noToms, maxHits: 2, priority: [KICK, CRASH, SNARE, HIHAT] },
  // EXPERTO (usuario, 2026-11-17: el antiguo Difícil): los seis pads, de dos en dos.
  experto: { pads: [CRASH, LOW_TOM, KICK, SNARE, HIGH_TOM, HIHAT], map: (pad) => pad, maxHits: 2, priority: [KICK, CRASH, SNARE, HIGH_TOM, LOW_TOM, HIHAT] },
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
