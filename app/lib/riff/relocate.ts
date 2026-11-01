// Experto: pasajes que se salen del mástil del juego (traste > maxFret, 12), movidos ENTEROS
// (petición del usuario, 2026-11-01; reglas revisadas con el agente de música). Antes se movía nota a
// nota y salían pasajes rotos y casi todo amontonado en la cuerda 1 (Kirk: 68 % -> 88 %).
//
// - Si el trozo se sale en la cuerda 2 o más grave: SUBE DE CUERDA entero (misma altura: una cuerda
//   más aguda = 5 trastes menos, 4 al pasar de la 3 a la 2). Las cuerdas al aire se quedan.
// - Si se sale en la cuerda 1: BAJA UNA OCTAVA entero MANTENIENDO LA DIGITACIÓN. En cada compás se
//   elige un único desplazamiento de cuerda k: 0 = misma cuerda, traste -12 (forma idéntica); 1 y 2 =
//   la forma en cuerdas más graves. Lo delicado son las COSTURAS: al entrar o salir de un trozo bajado,
//   un intervalo pequeño puede dar la vuelta, así que el trozo se amplía (como mucho un compás) hasta
//   la mejor costura. La capa grave (pedales en las cuerdas 4-6, más de una octava por debajo) no baja.
// - Compases reales idénticos salen idénticos.
// Puro (sin alphaTab): se prueba en Node con tests/riff-relocate.spec.ts.

import type { ChartBar, ChartBeat, ChartNote } from './chart';

type Mode = 'string' | 'octave';

interface Onset {
  t: number;
  notes: number[];
  bar: number;
}

const SAME_ONSET = 0.005;
// Golpes con notas obligadas separados por menos de esto (en compases) forman un mismo trozo.
const MERGE_BARS = 1;
// Ampliación máxima de un trozo hacia cada lado, en compases.
const EXTEND_BARS = 1;
// En modo subir de cuerda, el trozo se amplía con las notas pisadas desde este traste (la misma
// posición de la mano que las que se salen).
const STRING_UP_MIN_FRET = 8;

export interface RelocateResult {
  notes: ChartNote[];
  // Índices (en `notes`) de cada trozo movido, con su modo: para tests y depuración.
  passages: Array<{ mode: Mode; notes: number[] }>;
}

export function relocatePassages(
  input: ChartNote[],
  bars: ChartBar[],
  beats: ChartBeat[],
  maxFret: number,
  openMidi: (string: number) => number,
): RelocateResult {
  const notes = input.map((note) => ({ ...note }));
  const passages: RelocateResult['passages'] = [];
  if (!notes.some((note) => note.fret > maxFret)) return { notes, passages };

  const barIndexAt = (t: number) => {
    let lo = 0;
    let hi = bars.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (bars[mid].t <= t + 1e-6) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const barLength = (index: number) => {
    const bar = bars[index];
    return bar ? bar.end - bar.t : 2;
  };

  const onsets: Onset[] = [];
  notes.forEach((note, index) => {
    const last = onsets[onsets.length - 1];
    if (last && Math.abs(note.t - last.t) < SAME_ONSET) last.notes.push(index);
    else onsets.push({ t: note.t, notes: [index], bar: barIndexAt(note.t) });
  });
  const forced = (o: Onset) => o.notes.some((i) => notes[i].fret > maxFret);
  // Nota que lleva la melodía en un golpe: la más aguda.
  const top = (o: Onset) => Math.max(...o.notes.map((i) => notes[i].midi));
  const isBeatStart = (t: number) => beats.some((beat) => Math.abs(beat.t - t) < 0.01);

  // 1-2) Núcleos: golpes con notas obligadas, unidos si están a menos de un compás. Si cambian de clase
  // (se salen en la cuerda 1 -> octava; si no -> subir de cuerda), solo se separan si hay una negra con
  // puntillo o más entre ellos: así un riff de subir de cuerda no se va al modo octava por tener cerca un
  // pasaje en la cuerda 1 (MAIkael c36 / c37), pero un pasaje que alterna cuerdas 1 y 2 sigue entero
  // (Kirk c9, c12, c15 -> c16).
  const firstStringForced = (o: Onset) => o.notes.some((i) => notes[i].fret > maxFret && notes[i].string === 1);
  const cores: Array<[number, number]> = [];
  onsets.forEach((onset, i) => {
    if (!forced(onset)) return;
    const last = cores[cores.length - 1];
    const gap = last ? onset.t - onsets[last[1]].t : Infinity;
    const sameClass = last && firstStringForced(onsets[last[1]]) === firstStringForced(onset);
    if (last && gap < (sameClass ? MERGE_BARS * barLength(onset.bar) : (barLength(onset.bar) * 3) / 8 - 1e-3)) last[1] = i;
    else cores.push([i, i]);
  });

  // k elegido para cada compás real ya colocado (firma -> k), para repetir las mismas colocaciones.
  const kBySignature = new Map<string, number>();
  const signatureOf = (barIndex: number, indices: number[]) => {
    const bar = bars[barIndex];
    return indices.map((i) => `${Math.round((notes[i].t - bar.t) * 1000)}:${input[i].string}/${input[i].fret}`).sort().join(' ');
  };
  // Golpes ya colocados en algún trozo. Primero los trozos de OCTAVA, que necesitan elegir sus
  // costuras; después los de subir de cuerda, en lo que quede libre (si no, el de subir de cuerda se
  // comía el principio de un pasaje de octava y le dejaba una costura peor: MAIkael c37).
  const taken = onsets.map(() => false);
  // Límites (exclusivos) de un trozo: los núcleos vecinos y lo ya colocado.
  const bounds = (ci: number): [number, number] => {
    const [start, end] = cores[ci];
    let lo = ci > 0 ? cores[ci - 1][1] : -1;
    let hi = ci < cores.length - 1 ? cores[ci + 1][0] : onsets.length;
    for (let i = start - 1; i > lo; i--) if (taken[i]) { lo = i; break; }
    for (let i = end + 1; i < hi; i++) if (taken[i]) { hi = i; break; }
    return [lo, hi];
  };
  const mark = ([lo, hi]: [number, number]) => { for (let i = lo; i <= hi; i++) taken[i] = true; };
  // Clase de cada núcleo, calculada ANTES de mover nada (después, sus notas ya no se salen).
  const octaveCores = new Set(cores.filter(([start, end]) => onsets.slice(start, end + 1).some(firstStringForced)));
  const octaveClass = (core: [number, number]) => octaveCores.has(core);
  const placeOctave = (ci: number) => {
    const [lo, hi] = bounds(ci);
    const range = chooseOctaveRange(cores[ci][0], cores[ci][1], lo, hi);
    if (range && applyOctave(range[0], range[1], true)) mark(range);
  };

  // 4-6) Bajar una octava (los que se salen en la cuerda 1).
  cores.forEach((core, ci) => { if (octaveClass(core)) placeOctave(ci); });
  // 3) Subir de cuerda (el resto); si no cabe, también octava.
  cores.forEach((core, ci) => {
    if (octaveClass(core)) return;
    const [lo, hi] = bounds(ci);
    const range = extendStringUp(core[0], core[1], lo, hi);
    if (range && tryStringUp(range[0], range[1])) mark(range);
    else placeOctave(ci);
  });

  return { notes, passages };

  // --- Subir de cuerda ---------------------------------------------------------------------------

  // El núcleo, ampliado con los golpes vecinos (como mucho un compás) cuyas notas pisadas están en la
  // misma posición alta y fuera de la cuerda 1; las cuerdas al aire no cortan ni se mueven.
  function extendStringUp(start: number, end: number, limit: number, limitRight: number): [number, number] | null {
    const handOnly = (o: Onset) => {
      const fretted = o.notes.filter((i) => notes[i].fret > 0);
      return fretted.every((i) => notes[i].string !== 1 && notes[i].fret >= STRING_UP_MIN_FRET);
    };
    for (let i = start; i <= end; i++) {
      if (onsets[i].notes.some((n) => notes[n].fret > 0 && notes[n].string === 1)) return null;
    }
    let lo = start;
    while (lo - 1 > limit && onsets[start].t - onsets[lo - 1].t <= EXTEND_BARS * barLength(onsets[start].bar) && handOnly(onsets[lo - 1])) lo--;
    let hi = end;
    while (hi + 1 < limitRight && onsets[hi + 1].t - onsets[end].t <= EXTEND_BARS * barLength(onsets[end].bar) && handOnly(onsets[hi + 1])) hi++;
    return [lo, hi];
  }

  function tryStringUp(start: number, end: number): boolean {
    const span = onsets.slice(start, end + 1);
    const hand = span.flatMap((o) => o.notes).filter((i) => notes[i].fret > 0);
    for (const shift of [1, 2]) {
      const placed = new Map<number, { string: number; fret: number }>();
      let ok = true;
      for (const i of hand) {
        const string = notes[i].string - shift;
        const fret = notes[i].midi - openMidi(string);
        if (string < 1 || fret < 0 || fret > maxFret) {
          ok = false;
          break;
        }
        placed.set(i, { string, fret });
      }
      if (!ok || !span.every((o) => noCollision(o, placed))) continue;
      commit(placed, 'string');
      return true;
    }
    return false;
  }

  // --- Bajar una octava --------------------------------------------------------------------------

  // Rango [lo, hi] del trozo: el núcleo ampliado a la mejor costura de cada lado (si cabe en el mástil).
  function chooseOctaveRange(start: number, end: number, limit: number, limitRight: number): [number, number] | null {
    const left = seamCandidates(start, limit, 'left');
    const right = seamCandidates(end, limitRight, 'right');
    for (const lo of left) {
      for (const hi of right) {
        if (applyOctave(lo, hi, false)) return [lo, hi];
      }
    }
    return null;
  }

  // Posibles bordes del trozo, de mejor a peor costura. 'left': índice del primer golpe del trozo.
  // 'right': índice del último.
  function seamCandidates(core: number, limit: number, side: 'left' | 'right'): number[] {
    const out: Array<{ index: number; rank: number[] }> = [];
    const reach = EXTEND_BARS * barLength(onsets[core].bar);
    for (let k = 0; ; k++) {
      const edge = side === 'left' ? core - k : core + k;
      const outside = side === 'left' ? edge - 1 : edge + 1;
      if (side === 'left' ? edge <= limit : edge >= limit) break;
      if (Math.abs(onsets[edge].t - onsets[core].t) > reach) break;
      if (outside < 0 || outside >= onsets.length) {
        out.push({ index: edge, rank: [0, 0, 0, 0, k] });
        break;
      }
      const [before, after] = side === 'left' ? [onsets[outside], onsets[edge]] : [onsets[edge], onsets[outside]];
      const interval = top(after) - top(before);
      // Entrar en un trozo bajado conserva el sentido si el intervalo real baja; salir, si sube.
      const keepsDirection = side === 'left' ? interval < 0 : interval > 0;
      const beforeEnd = Math.max(...before.notes.map((i) => notes[i].t + notes[i].dur));
      const quarter = barLength(before.bar) / 4;
      const rest = after.t - beforeEnd;
      const restOrLong = rest >= quarter / 2 - 1e-3 || after.t - before.t >= quarter - 1e-3;
      const texture = (before.notes.length > 1) !== (after.notes.length > 1);
      // Solo en inicios de tiempo, silencios, notas largas o cambios de textura: nunca a mitad de una
      // célula (Kirk c23 cortaba en su última semicorchea). El sentido del intervalo solo ordena.
      if (restOrLong || texture || isBeatStart(after.t)) {
        // A igualdad, la más cercana (no se amplía si no se gana nada) y luego el intervalo más grande.
        out.push({ index: edge, rank: [keepsDirection ? 0 : 1, restOrLong ? 0 : 1, texture ? 0 : 1, k, -Math.abs(interval)] });
      }
      // Un silencio de negra o más cierra la frase: el trozo no lo cruza (Kirk c16 -> c17).
      if (rest >= quarter - 1e-3) break;
    }
    if (!out.some((c) => c.index === core)) out.push({ index: core, rank: [9, 9, 9, 0, 0] });
    out.sort((a, b) => {
      for (let r = 0; r < a.rank.length; r++) if (a.rank[r] !== b.rank[r]) return a.rank[r] - b.rank[r];
      return 0;
    });
    return out.map((c) => c.index);
  }

  // Baja una octava los golpes [lo, hi] (sin la capa grave), con un k por compás. Con `write` false
  // solo comprueba si cabe.
  function applyOctave(lo: number, hi: number, write: boolean): boolean {
    const span = onsets.slice(lo, hi + 1);
    const all = span.flatMap((o) => o.notes);
    const forcedMidis = all.filter((i) => notes[i].fret > maxFret).map((i) => notes[i].midi);
    const anchor = forcedMidis.length ? Math.min(...forcedMidis) : Math.min(...all.map((i) => notes[i].midi));
    // Capa grave: golpes ENTEROS en las cuerdas 4-6 y más de una octava por debajo (pedales). Un acorde
    // mixto se mueve entero, o la voz grave quedaría por encima (MAIkael c9).
    const low = (i: number) => notes[i].string >= 4 && notes[i].midi <= anchor - 12;
    const bassOnsets = new Set(span.filter((o) => o.notes.every(low)).flatMap((o) => o.notes));
    const bass = (i: number) => bassOnsets.has(i);
    const hand = all.filter((i) => !bass(i));
    const byBar = new Map<number, number[]>();
    for (const i of hand) {
      const bar = barIndexAt(notes[i].t);
      byBar.set(bar, [...(byBar.get(bar) ?? []), i]);
    }
    type Option = { k: number; deform: number; center: number; place: Map<number, { string: number; fret: number }> };
    // Opciones de cada compás: k = 0, 1 o 2 cuerdas más grave, si cabe en 0-maxFret sin choques.
    const barList = [...byBar.entries()].sort((a, b) => a[0] - b[0]);
    const optionsOf = (indices: number[]): Option[] => {
      const options: Option[] = [];
      for (const k of [0, 1, 2]) {
        const place = new Map<number, { string: number; fret: number }>();
        let ok = true;
        for (const i of indices) {
          const string = notes[i].string + k;
          const fret = notes[i].midi - 12 - openMidi(string);
          if (string > 6 || fret < 0 || fret > maxFret) {
            ok = false;
            break;
          }
          place.set(i, { string, fret });
        }
        if (!ok || !span.every((o) => noCollision(o, place))) continue;
        const strings = [...new Set(indices.map((i) => notes[i].string))];
        let deform = 0;
        for (const a of strings) for (const b of strings) {
          if (a < b && openMidi(a) - openMidi(b) !== openMidi(a + k) - openMidi(b + k)) deform++;
        }
        const fretted = [...place.values()].filter((p) => p.fret > 0).map((p) => p.fret);
        const center = fretted.length ? fretted.reduce((sum, f) => sum + f, 0) / fretted.length : 0;
        options.push({ k, deform, center, place });
      }
      return options;
    };
    const perBar = barList.map(([bar, indices]) => ({ bar, indices, options: optionsOf(indices) }));
    if (perBar.some((b) => b.options.length === 0)) return false;

    // Bloques de posición (agente de música): compases seguidos cuyo traste pisado más bajo de la
    // tablatura REAL varía 2 o menos son la misma posición de la mano, y llevan el mismo k; así el
    // salto de posición del juego cae donde el real (Kirk: entre c24 y c25, no entre c26 y c27).
    const lowestFret = (indices: number[]) => Math.min(...indices.map((i) => notes[i].fret).filter((f) => f > 0), Infinity);
    const blocks: Array<typeof perBar> = [];
    for (const entry of perBar) {
      const last = blocks[blocks.length - 1];
      const prev = last?.[last.length - 1];
      if (prev && prev.bar === entry.bar - 1 && Math.abs(lowestFret(prev.indices) - lowestFret(entry.indices)) <= 2) last.push(entry);
      else blocks.push([entry]);
    }

    const placed = new Map<number, { string: number; fret: number }>();
    let previousCenter: number | null = handCenterBefore(lo);
    const byCloseness = (a: Option, b: Option) =>
      a.deform - b.deform
      || (previousCenter === null ? 0 : Math.abs(a.center - previousCenter) - Math.abs(b.center - previousCenter))
      || a.k - b.k;
    const take = (entry: (typeof perBar)[number], option: Option) => {
      for (const [i, p] of option.place) placed.set(i, p);
      previousCenter = option.center;
      const signature = signatureOf(entry.bar, entry.indices);
      if (write && !kBySignature.has(signature) && entry.indices.length === notesInBar(entry.bar).length) kBySignature.set(signature, option.k);
    };
    for (const block of blocks) {
      // Un k que quepa en TODO el bloque (con varios compases: sin deformar y el menor; con uno solo,
      // también la mano más cerca del compás anterior).
      const shared = [0, 1, 2].filter((k) => block.every((entry) => entry.options.some((o) => o.k === k)));
      if (shared.length > 0) {
        const deformOf = (k: number) => block.reduce((sum, entry) => sum + entry.options.find((o) => o.k === k)!.deform, 0);
        const k = block.length > 1
          ? [...shared].sort((a, b) => deformOf(a) - deformOf(b) || a - b)[0]
          : [...block[0].options].sort(byCloseness)[0].k;
        for (const entry of block) {
          const repeated = kBySignature.get(signatureOf(entry.bar, entry.indices));
          take(entry, entry.options.find((o) => o.k === repeated) ?? entry.options.find((o) => o.k === k)!);
        }
        continue;
      }
      // Ningún k cabe en todo el bloque: compás a compás (MAIkael c40 -> c41).
      for (const entry of block) {
        const repeated = kBySignature.get(signatureOf(entry.bar, entry.indices));
        take(entry, entry.options.find((o) => o.k === repeated) ?? [...entry.options].sort(byCloseness)[0]);
      }
    }
    if (write) commit(placed, 'octave');
    return true;
  }

  // Centro de la mano (traste medio de las notas pisadas) en el compás anterior al trozo.
  function handCenterBefore(index: number): number | null {
    const fretted: number[] = [];
    for (let i = index - 1; i >= 0 && onsets[index].t - onsets[i].t <= barLength(onsets[index].bar); i--) {
      for (const n of onsets[i].notes) if (notes[n].fret > 0 && notes[n].fret <= maxFret) fretted.push(notes[n].fret);
    }
    return fretted.length ? fretted.reduce((s, f) => s + f, 0) / fretted.length : null;
  }

  function notesInBar(bar: number) {
    return onsets.filter((o) => o.bar === bar).flatMap((o) => o.notes);
  }

  // Dos notas de un mismo golpe nunca en la misma cuerda (las no movidas, en la suya).
  function noCollision(onset: Onset, place: Map<number, { string: number; fret: number }>) {
    const used = onset.notes.map((i) => place.get(i)?.string ?? notes[i].string);
    return new Set(used).size === used.length;
  }

  function commit(place: Map<number, { string: number; fret: number }>, mode: Mode) {
    for (const [i, p] of place) {
      if (p.string === notes[i].string && p.fret === notes[i].fret) continue;
      notes[i] = { ...notes[i], string: p.string, fret: p.fret, midi: openMidi(p.string) + p.fret, moved: mode };
    }
    passages.push({ mode, notes: [...place.keys()].sort((a, b) => a - b) });
  }
}
