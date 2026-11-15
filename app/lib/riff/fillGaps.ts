// Rellenar los RATOS LARGOS SIN TOCAR de la pista que se juega con COMPASES ENTEROS de otra pista
// (petición del usuario, 2026-11-15). No es para subir la dificultad: muchas tablaturas parten la parte
// de un guitarrista en varias pistas solo porque cambia el sonido (una intro limpia, "Oriental Intro
// (Drop D)", "Clean 1") o ponen los solos en pistas aparte y la rítmica en otra, y en el juego eso deja
// compases y compases sin nada que tocar.
//
// Reglas (siempre por compases enteros, para no arriesgar una mala mezcla):
// - Solo se rellenan TRAMOS de al menos MIN_GAP_BARS compases vacíos seguidos de la pista que se toca
//   (un compás de respiro es música, no un rato largo).
// - En cada compás rellenado entra UNA sola pista, entera; esos compases de la donante salen de la
//   banda (chart.ts): nunca suena lo mismo dos veces ni se suman voces.
// - A. TROZOS: una pista de la misma familia (guitarra/bajo) COMPLEMENTARIA a la que se toca (como mucho
//   el 25 % de sus compases con notas coinciden con los de esta) y más pequeña que ella. Dos guitarras
//   principales que se turnan (duelo de solos dentro de sus pistas) no se rellenan entre sí.
// - B. SOLOS EN SUS PISTAS + UNA RÍTMICA: con UNA sola guitarra grande, una pista pequeña que suena
//   ENCIMA de ella (≥ 75 % de sus compases coinciden: solos, leads) recibe en sus huecos los compases de
//   esa rítmica: "2 solos + 1 rítmica" pasan a ser "2 rítmicas con su solo cada una". Con 2+ guitarras
//   grandes no se sabe de quién es cada solo: no se toca.
//
// Puro (solo lee el Score), para probarlo en Node.

import type * as AlphaTab from '@coderline/alphatab';

type Score = AlphaTab.model.Score;
type Track = AlphaTab.model.Track;

export const MIN_GAP_BARS = 2;
// A: como mucho esta parte de los compases con notas de la donante coinciden con los de la que se toca.
export const FRAGMENT_MAX_OVERLAP = 0.25;
// B: al menos esta parte de los compases con notas de un solo coinciden con los de la rítmica.
export const LAYER_MIN_OVERLAP = 0.75;
// B: "grande" = al menos esta parte de los compases con notas de la guitarra más llena.
export const BIG_TRACK_SHARE = 0.5;

type Family = 'guitar' | 'bass';

// Solo guitarras y bajos DE VERDAD: además de la afinación, su instrumento MIDI (General MIDI 24-31
// guitarras, 32-39 bajos). Muchas tablaturas escriben la voz, el coro o un teclado en un pentagrama de
// guitarra (Pink Floyd - Time: "Voice", "Choir", "Keyboard 2"); esos nunca se mezclan.
function familyOf(track: Track): Family | null {
  const staff = track.staves[0];
  if (!staff || staff.isPercussion) return null;
  const program = track.playbackInfo.program;
  const bass = staff.tuning.length > 0 && Math.max(...staff.tuning) < 55;
  if (bass) return staff.tuning.length >= 4 && program >= 32 && program <= 39 ? 'bass' : null;
  return staff.tuning.length >= 6 && program >= 24 && program <= 31 ? 'guitar' : null;
}

// Notas que suenan en cada compás (por índice de MasterBar), 0 = compás vacío.
function notesPerBar(track: Track, barCount: number): number[] {
  const out = new Array<number>(barCount).fill(0);
  const bars = track.staves[0]?.bars ?? [];
  for (let i = 0; i < barCount; i++) {
    const bar = bars[i];
    if (!bar) continue;
    for (const voice of bar.voices) {
      for (const beat of voice.beats) {
        if (beat.isRest) continue;
        for (const note of beat.notes) if (!note.isDead && !note.isTieDestination) out[i]++;
      }
    }
  }
  return out;
}

export interface GapFillPlan {
  // Índice de MasterBar → pista cuyos compases enteros pasan a la que se toca.
  bars: Map<number, number>;
  // Las pistas que donan algo.
  donors: Set<number>;
}

const EMPTY_PLAN: GapFillPlan = { bars: new Map(), donors: new Set() };

export function gapFillPlan(score: Score, recipient: number): GapFillPlan {
  const target = score.tracks[recipient];
  const family = target ? familyOf(target) : null;
  if (!target || !family) return EMPTY_PLAN;
  const barCount = score.masterBars.length;
  const counts = new Map<number, number[]>();
  for (const track of score.tracks) {
    if (familyOf(track) === family) counts.set(track.index, notesPerBar(track, barCount));
  }
  const used = (index: number) => (counts.get(index) ?? []).filter((n) => n > 0).length;
  const own = counts.get(recipient)!;
  const ownUsed = used(recipient);
  const overlap = (a: number[], b: number[]) => a.reduce((sum, n, i) => sum + (n > 0 && b[i] > 0 ? 1 : 0), 0);

  // A: trozos complementarios y más pequeños.
  const fragments: number[] = [];
  for (const [index, donor] of counts) {
    if (index === recipient) continue;
    const donorUsed = used(index);
    if (donorUsed === 0 || donorUsed >= ownUsed) continue;
    if (overlap(donor, own) / donorUsed <= FRAGMENT_MAX_OVERLAP) fragments.push(index);
  }
  // B (solo guitarras): una sola guitarra grande, y la que se toca es una capa pequeña encima de ella.
  let rhythm: number | null = null;
  const most = Math.max(...[...counts.keys()].map(used));
  const big = [...counts.keys()].filter((index) => used(index) >= most * BIG_TRACK_SHARE);
  if (family === 'guitar' && big.length === 1 && big[0] !== recipient && ownUsed > 0) {
    const candidate = counts.get(big[0])!;
    if (overlap(own, candidate) / ownUsed >= LAYER_MIN_OVERLAP) rhythm = big[0];
  }
  if (fragments.length === 0 && rhythm === null) return EMPTY_PLAN;

  const bars = new Map<number, number>();
  const donors = new Set<number>();
  for (let start = 0; start < barCount;) {
    if (own[start] > 0) {
      start++;
      continue;
    }
    let end = start;
    while (end < barCount && own[end] === 0) end++;
    if (end - start >= MIN_GAP_BARS) {
      // Trozos por notas en el tramo (el que más, primero); la rítmica (B), detrás.
      const inRun = (index: number) => counts.get(index)!.slice(start, end).reduce((a, b) => a + b, 0);
      const order = fragments.filter((index) => inRun(index) > 0).sort((a, b) => inRun(b) - inRun(a) || a - b);
      if (rhythm !== null) order.push(rhythm);
      for (let bar = start; bar < end; bar++) {
        const donor = order.find((index) => counts.get(index)![bar] > 0);
        if (donor === undefined) continue;
        bars.set(bar, donor);
        donors.add(donor);
      }
    }
    start = end;
  }
  return { bars, donors };
}

// Un trozo (A) cuya música cabe ENTERA en los huecos de otra pista ya no se ofrece para tocar: ya está
// dentro de esa (p. ej. "Oriental Intro" dentro de las guitarras de Nile - User Maat Re).
// Las que reciben se miran de mayor a menor, y una pista ya absorbida no absorbe a otra (un trozo
// metido solo en otro trozo oculto se quedaría sin poder tocarse).
export function absorbedTracks(score: Score): Set<number> {
  const out = new Set<number>();
  const barCount = score.masterBars.length;
  const size = (track: Track) => notesPerBar(track, barCount).filter((n) => n > 0).length;
  const recipients = score.tracks.filter((track) => familyOf(track)).sort((a, b) => size(b) - size(a) || a.index - b.index);
  for (const track of recipients) {
    if (out.has(track.index)) continue;
    const plan = gapFillPlan(score, track.index);
    for (const donor of plan.donors) {
      if (out.has(donor)) continue;
      const counts = notesPerBar(score.tracks[donor], barCount);
      const own = notesPerBar(track, barCount);
      // Solo los trozos (A, más pequeños que la que los recibe), nunca la rítmica de la regla B.
      if (counts.filter((n) => n > 0).length >= own.filter((n) => n > 0).length) continue;
      if (counts.every((n, bar) => n === 0 || plan.bars.get(bar) === donor)) out.add(donor);
    }
  }
  return out;
}
