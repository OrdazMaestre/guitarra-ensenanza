import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import * as at from '@coderline/alphatab';
import { buildChart, type Chart } from '../app/lib/riff/chart';
import { RIFF_LEVELS } from '../app/lib/riff/levels';
import { OPEN_MIDI, placeSequence, reduceChart } from '../app/lib/riff/reduce';
import { buildRemix, REMIX_GAP_QUARTERS } from '../app/lib/riff/remix';

// Traducción de la tablatura real a niveles sencillos (app/lib/riff/reduce.ts), estilo Guitar Hero.

function chartOf(file: string, track: number): Chart {
  const score = at.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(fs.readFileSync(`public/tabs/${file}`)), new at.Settings());
  return buildChart(at, score, track, 24);
}

const SONGS: Array<[string, string, number]> = [
  ['Cumpleaños feliz', 'cumpleanos-feliz-dos-compases.gp', 0],
  ['Feliz Navidad', 'feliz-navidad.gp', 0],
  ['Master of Puppets (James)', 'prueba-master-of-puppets.gp', 1],
  ['Master of Puppets (Kirk)', 'prueba-master-of-puppets.gp', 2],
];

for (const [name, file, track] of SONGS) {
  for (const level of ['practica', 'facil', 'medio', 'avanzado'] as const) {
    test(`${name} en ${level}: botones del nivel, aire entre notas, dirección y repeticiones`, () => {
      const real = chartOf(file, track);
      const profile = RIFF_LEVELS[level];
      const chart = reduceChart(real, profile);
      const beat = 60 / real.bpm;

      expect(chart.notes.length).toBeGreaterThan(0);
      expect(chart.notes.length).toBeLessThanOrEqual(real.notes.length);
      // Práctica quita como MUCHO la mitad de los golpes; Medio y Avanzado, como Guitar Hero
      // Experto, casi ninguno (decisiones del usuario).
      const onsets = new Set(real.notes.map((n) => Math.round(n.t * 1000))).size;
      // Fácil, como el "Hard" de Guitar Hero: 65-70 % de las notas en Master of Puppets (decisión
      // del usuario); las canciones lentas casi no se tocan.
      expect(chart.notes.length / onsets).toBeGreaterThanOrEqual(level === 'practica' ? 0.45 : level === 'facil' ? 0.65 : 0.9);
      if (level === 'facil' && file.includes('master-of-puppets')) expect(chart.notes.length / onsets).toBeLessThanOrEqual(0.7);
      if (profile.maxNotesPerSecond) {
        for (let i = 0; i < chart.notes.length; i++) {
          expect(chart.notes.filter((n) => n.t <= chart.notes[i].t && chart.notes[i].t - n.t < 1 - 1e-3).length).toBeLessThanOrEqual(profile.maxNotesPerSecond);
        }
      }
      expect(chart.sourceNotes).toBe(real.notes);

      for (const note of chart.notes) {
        expect(profile.strings).toContain(note.string);
        expect(note.fret).toBeGreaterThanOrEqual(profile.minFret);
        expect(note.fret).toBeLessThanOrEqual(profile.maxFret);
      }
      // Dentro de una frase: misma nota real -> mismo botón; si sube, a la derecha; si baja, a la
      // izquierda (comparando la nota guía real de cada golpe).
      const lead = (i: number) => {
        const sources = chart.notes[i].sourceIds!.map((id) => real.notes[id]).filter((n) => Math.abs(n.t - chart.notes[i].t) < 0.005);
        const sorted = sources.sort((a, b) => a.midi - b.midi);
        const low = sorted[0];
        const power = sorted.every((n) => [0, 5, 7, 12, 17, 19, 24].includes(n.midi - low.midi));
        return power ? low.midi : sorted[sorted.length - 1].midi;
      };
      // Sin acordes y nunca más juntas que `minGapBeats` (pulsos) ni que `minGapSeconds`; y una
      // nota que repite la anterior, nunca antes de `repeatGapSeconds` (fuera "chugs" rápidos).
      for (let i = 1; i < chart.notes.length; i++) {
        const gap = chart.notes[i].t - chart.notes[i - 1].t;
        expect(gap).toBeGreaterThanOrEqual(profile.minGapBeats * beat - 0.06 * beat);
        expect(gap).toBeGreaterThanOrEqual(profile.minGapSeconds - 0.002);
        if (lead(i) === lead(i - 1)) expect(gap).toBeGreaterThanOrEqual(profile.repeatGapSeconds - 0.002);
      }

      let violations = 0;
      for (let i = 1; i < chart.notes.length; i++) {
        if (chart.notes[i].phrase !== chart.notes[i - 1].phrase) continue;
        const dPitch = Math.sign(lead(i) - lead(i - 1));
        const dFret = Math.sign(chart.notes[i].fret - chart.notes[i - 1].fret);
        if (dPitch !== dFret) violations++;
      }
      // Solo puede romperse cuando una frase tiene más alturas distintas que botones.
      expect(violations).toBeLessThanOrEqual(Math.ceil(chart.notes.length * 0.05));

      // Cada nota real tiene como mucho un dueño, y los dueños van en orden.
      const owners = chart.notes.flatMap((n) => n.sourceIds!);
      expect(new Set(owners).size).toBe(owners.length);
    });
  }
}

test('Avanzado (trastes): una frase que cabe en la cuerda 6 (trastes 0-12) se coloca EXACTA (mismos intervalos)', () => {
  const real = chartOf('feliz-navidad.gp', 0);
  const chart = reduceChart(real, RIFF_LEVELS.avanzado);
  // Feliz Navidad va en corcheas: Avanzado (negras) se queda con las notas de cada pulso.
  expect(chart.notes.length).toBeGreaterThan(real.notes.length / 3);
  const realAt = (i: number) => real.notes.find((n) => Math.abs(n.t - chart.notes[i].t) < 0.005)!.midi;
  let compared = 0;
  for (let i = 1; i < chart.notes.length; i++) {
    if (chart.notes[i].phrase !== chart.notes[i - 1].phrase) continue;
    expect(chart.notes[i].midi - chart.notes[i - 1].midi).toBe(realAt(i) - realAt(i - 1));
    compared++;
  }
  expect(compared).toBeGreaterThan(3);
});

test('Medio y Avanzado (trastes) conservan el compás 42 de Master of Puppets entero (9 Mi al aire seguidos)', () => {
  for (const track of [1, 2]) {
    const real = chartOf('prueba-master-of-puppets.gp', track);
    const bar = real.bars.find((b) => b.number === 42)!;
    const inBar = <T extends { t: number }>(notes: T[]) => notes.filter((n) => n.t >= bar.t - 1e-6 && n.t < bar.end - 1e-6);
    const realOnsets = new Set(inBar(real.notes).map((n) => Math.round(n.t * 1000))).size;
    expect(realOnsets).toBe(9);
    for (const level of ['medio', 'avanzado'] as const) {
      const notes = inBar(reduceChart(real, RIFF_LEVELS[level]).notes);
      expect(notes).toHaveLength(9);
      // Todas la misma nota (la misma posición): se pueden tocar manteniendo pulsado.
      expect(new Set(notes.map((n) => `${n.string}/${n.fret}`)).size).toBe(1);
    }
    expect(inBar(reduceChart(real, RIFF_LEVELS.practica).notes).length).toBeLessThan(9);
    // Fácil quita parte de los "chugs", pero menos que Práctica.
    const facil = inBar(reduceChart(real, RIFF_LEVELS.facil).notes).length;
    expect(facil).toBeLessThan(9);
    expect(facil).toBeGreaterThan(inBar(reduceChart(real, RIFF_LEVELS.practica).notes).length);
  }
});

// Modo cuerdas Medio (Mi + La): la tab se coloca en las dos cuerdas por el camino de menor coste
// (reduce.ts, placeSequence). Medidas: notas reales respetadas, saltos, cambios de cuerda.
const CUERDAS_SONGS: Array<[string, string, number]> = [
  ...SONGS,
  ['Thunderstruck', 'thunderstruck.gp', 0],
  ['Carol of the Bells', 'carol-of-the-bells.gp', 0],
];
// Niveles del modo cuerdas ya construidos (Medio: Mi + La; Avanzado: + Re).
const CUERDAS_LEVELS = [['medio-cuerdas', 'Medio (cuerdas)'], ['avanzado-cuerdas', 'Avanzado (cuerdas)']] as const;

for (const [level, levelName] of CUERDAS_LEVELS) for (const [name, file, track] of CUERDAS_SONGS) {
  test(`${name} en ${levelName}: sus cuerdas, mismas alturas, repetidas quietas, sin saltos imposibles`, () => {
    const real = chartOf(file, track);
    const profile = RIFF_LEVELS[level];
    const chart = reduceChart(real, profile);
    const beat = 60 / real.bpm;
    const onsets = new Set(real.notes.map((n) => Math.round(n.t * 1000))).size;
    // Rejilla de corcheas (un poco menos que el 100 %, decisión del usuario): Kirk 89 %, James 99 %.
    expect(chart.notes.length / onsets).toBeGreaterThanOrEqual(0.85);
    for (const note of chart.notes) {
      expect(profile.strings).toContain(note.string);
      expect(note.fret).toBeGreaterThanOrEqual(0);
      expect(note.fret).toBeLessThanOrEqual(profile.maxFretByString![note.string]);
      expect(note.midi).toBe(OPEN_MIDI[note.string] + note.fret);
    }
    const leadOfNote = (i: number) => {
      const sources = chart.notes[i].sourceIds!.map((id) => real.notes[id]).filter((n) => Math.abs(n.t - chart.notes[i].t) < 0.005);
      const sorted = sources.sort((a, b) => a.midi - b.midi);
      const low = sorted[0];
      const power = sorted.every((n) => [0, 5, 7, 12, 17, 19, 24].includes(n.midi - low.midi));
      return power ? low : sorted[sorted.length - 1];
    };
    let sameDirection = 0;
    let pairs = 0;
    let stringChanges = 0;
    let bigJumps = 0;
    let keptReal = 0;
    let realInside = 0;
    let sameFret = 0;
    let lastFretted: number | null = null;
    for (let i = 0; i < chart.notes.length; i++) {
      const note = chart.notes[i];
      const lead = leadOfNote(i);
      if (lead.fret === note.fret) sameFret++;
      // Notas reales que ya caben en el nivel (y cuya frase va a su altura real).
      if (note.midi === lead.midi && profile.strings.includes(lead.string) && lead.fret <= profile.maxFretByString![lead.string]) {
        realInside++;
        if (lead.string === note.string && lead.fret === note.fret) keptReal++;
      }
      if (i > 0 && note.phrase === chart.notes[i - 1].phrase) {
        const prev = chart.notes[i - 1];
        const prevLead = leadOfNote(i - 1);
        pairs++;
        // Las alturas siguen la melodía real (sube/baja/igual), salvo frases traducidas a contorno.
        if (Math.sign(note.midi - prev.midi) === Math.sign(lead.midi - prevLead.midi)) sameDirection++;
        // La misma nota dos veces seguidas: el mismo sitio (para mantener pulsado).
        if (lead.midi === prevLead.midi) expect(`${note.string}/${note.fret}`).toBe(`${prev.string}/${prev.fret}`);
        if (note.string !== prev.string) stringChanges++;
        if (note.fret > 0 && lastFretted !== null && Math.abs(note.fret - lastFretted) > 7 && note.t - prev.t < beat * 0.5) bigJumps++;
      }
      if (i > 0 && note.phrase !== chart.notes[i - 1].phrase) lastFretted = null;
      if (note.fret > 0) lastFretted = note.fret;
    }
    console.log(`${name} (${levelName}): ${chart.notes.length} notas, dirección ${(100 * sameDirection / Math.max(1, pairs)).toFixed(1)} %, tab respetada ${keptReal}/${realInside}, mismo traste que la tab ${(100 * sameFret / chart.notes.length).toFixed(1)} %, cambios de cuerda ${(100 * stringChanges / Math.max(1, pairs)).toFixed(1)} %, saltos >7 rápidos ${bigJumps}`);
    // ≥ 90 %: la fidelidad manda (petición del usuario) -- cuando a un riff le sobran unas pocas
    // notas (James en Medio: las de la cuerda Re), solo esas se mueven de octava y el resto se queda
    // como en la tab; ahí la dirección de esas notas puede invertirse (James Medio: 93 %).
    expect(sameDirection / Math.max(1, pairs)).toBeGreaterThanOrEqual(0.9);
    expect(bigJumps).toBe(0);
    if (realInside > 0) expect(keptReal / realInside).toBeGreaterThanOrEqual(0.8);
  });
}

// Casi siempre iguales: la única excepción es el límite de cuerdas por compás, que es obligatorio --
// si la frase anterior ya puso un compás de una sola cuerda en la La, el resto de ese compás sigue en
// la La aunque el mismo riff, en otro sitio, haya ido en la Re (James, compases 44-45 vs 48-49).
for (const [level, levelName] of CUERDAS_LEVELS) test(`${levelName}: los riffs repetidos de Master of Puppets se colocan (casi) siempre igual`, () => {
  for (const track of [1, 2]) {
    const chart = reduceChart(chartOf('prueba-master-of-puppets.gp', track), RIFF_LEVELS[level]);
    const byPhrase = new Map<number, typeof chart.notes>();
    for (const note of chart.notes) byPhrase.set(note.phrase!, [...(byPhrase.get(note.phrase!) ?? []), note]);
    const seen = new Map<string, string>();
    let repeats = 0;
    let different = 0;
    for (const notes of byPhrase.values()) {
      const key = notes.map((n, k) => `${n.midi}@${k === 0 ? 0 : Math.round((n.t - notes[k - 1].t) * 100)}`).join(' ');
      const placement = notes.map((n) => `${n.string}/${n.fret}`).join(' ');
      if (seen.has(key)) {
        repeats++;
        if (placement !== seen.get(key)) different++;
      } else {
        seen.set(key, placement);
      }
    }
    console.log(`${levelName}, pista ${track}: ${repeats} frases repetidas, ${different} con otro dibujo`);
    expect(repeats).toBeGreaterThanOrEqual(3);
    expect(different).toBeLessThanOrEqual(Math.floor(repeats * 0.1));
  }
});

// Zonas, figuras compactas y motivos (decisión del usuario, 2026-10-27).
function spearman(x: number[], y: number[]) {
  const rank = (a: number[]) => {
    const order = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]);
    const r = new Array<number>(a.length);
    for (let i = 0; i < order.length;) {
      let j = i;
      while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
      for (let k = i; k <= j; k++) r[order[k][1]] = (i + j) / 2;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(x);
  const ry = rank(y);
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const mx = mean(rx);
  const my = mean(ry);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < rx.length; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}

for (const [level, levelName] of CUERDAS_LEVELS) for (const [name, file, track] of CUERDAS_SONGS) {
  test(`${name} en ${levelName}: sin saltos de más de 5 trastes dentro de una frase; graves a la izquierda, agudas a la derecha`, () => {
    const real = chartOf(file, track);
    const chart = reduceChart(real, RIFF_LEVELS[level]);
    const realPitch = chart.notes.map((note) => Math.max(...note.sourceIds!.map((id) => real.notes[id]).filter((n) => Math.abs(n.t - note.t) < 0.005).map((n) => n.midi)));
    let pairs = 0;
    let jumps = 0;
    let lastFretted: number | null = null;
    chart.notes.forEach((note, i) => {
      const samePhrase = i > 0 && note.phrase === chart.notes[i - 1].phrase;
      if (!samePhrase) lastFretted = null;
      else {
        pairs++;
        // Solo cuenta un salto que NO está en la melodía real (un salto de octava de la canción,
        // obligado a una sola cuerda, es de la canción, no de la traducción).
        if (note.fret > 0 && lastFretted !== null && Math.abs(note.fret - lastFretted) > 5 && Math.abs(realPitch[i] - realPitch[i - 1]) <= 5) jumps++;
      }
      if (note.fret > 0) lastFretted = note.fret;
    });
    // Margen para algún tapping que se abra (la zona orienta, no obliga).
    expect(jumps).toBeLessThanOrEqual(Math.floor(pairs * 0.02));
    if (new Set(realPitch).size > 2) expect(spearman(realPitch, chart.notes.map((n) => n.fret))).toBeGreaterThanOrEqual(0.5);
  });
}

for (const [level, levelName] of CUERDAS_LEVELS) test(`${levelName}, Kirk: el solo (compases 9-12) a la derecha de los riffs; compás 9 = compás 11, figura compacta`, () => {
  const real = chartOf('prueba-master-of-puppets.gp', 2);
  const chart = reduceChart(real, RIFF_LEVELS[level]);
  const bars = real.bars.filter((b) => b.number >= 9 && b.number <= 12).slice(0, 4);
  const inBar = (bar: { t: number; end: number }) => chart.notes.filter((n) => n.t >= bar.t - 1e-6 && n.t < bar.end - 1e-6);
  const shape = (bar: { t: number; end: number }) => inBar(bar).map((n) => `${n.string}/${n.fret}`).join(' ');
  // La misma melodía (compases 9 y 11, un barrido repetido) con el mismo dibujo.
  expect(shape(bars[2])).toBe(shape(bars[0]));
  const frets = inBar(bars[0]).map((n) => n.fret).filter((f) => f > 0);
  expect(Math.max(...frets) - Math.min(...frets)).toBeLessThanOrEqual(5);
  const mean = (notes: typeof chart.notes) => notes.reduce((s, n) => s + n.fret, 0) / notes.length;
  const riffs = chart.notes.filter((note) => note.sourceIds!.some((id) => Math.abs(real.notes[id].t - note.t) < 0.005 && real.notes[id].midi < 55));
  expect(mean(bars.flatMap(inBar))).toBeGreaterThan(mean(riffs) + 2);
});

for (const [level, levelName] of CUERDAS_LEVELS) test(`${levelName}: cada motivo repetido (4 notas, mismas alturas reales y ritmo) se dibuja casi siempre igual`, () => {
  for (const [, file, track] of CUERDAS_SONGS) {
    const real = chartOf(file, track);
    const chart = reduceChart(real, RIFF_LEVELS[level]);
    const realLead = (i: number) => Math.max(...chart.notes[i].sourceIds!.map((id) => real.notes[id]).filter((n) => Math.abs(n.t - chart.notes[i].t) < 0.005).map((n) => n.midi));
    const groups = new Map<string, string[]>();
    for (let w = 0; w + 4 <= chart.notes.length; w++) {
      const notes = chart.notes.slice(w, w + 4);
      if (notes.some((n) => n.phrase !== notes[0].phrase)) continue;
      const key = notes.map((n, k) => `${realLead(w + k)}@${k === 0 ? 0 : Math.round((n.t - notes[k - 1].t) * 50)}`).join(' ');
      const placement = notes.map((n) => `${n.string}/${n.fret}`).join(' ');
      groups.set(key, [...(groups.get(key) ?? []), placement]);
    }
    let total = 0;
    let same = 0;
    for (const placements of groups.values()) {
      if (placements.length < 2) continue;
      const counts = new Map<string, number>();
      for (const p of placements) counts.set(p, (counts.get(p) ?? 0) + 1);
      total += placements.length;
      same += Math.max(...counts.values());
    }
    // 90-100 % (Thunderstruck 93 %, Carol 90 %): lo que queda distinto son motivos dentro de frases
    // cuyas OTRAS notas obligan a transportarlas de otra forma (con el transporte del otro dibujo no
    // cabrían en Mi + La); tirar más fuerte no lo cambia (medido con pattern 8, 15 y 30).
    if (total > 0) expect(same / total).toBeGreaterThanOrEqual(0.9);
  }
});

// Límite de cuerdas por compás (decisión del usuario, 2026-10-27): si la tab usa 1 o 2 cuerdas en un
// compás, el juego usa como mucho esas, y contiguas.
for (const [level, levelName] of CUERDAS_LEVELS) for (const [name, file, track] of CUERDAS_SONGS) {
  test(`${name} en ${levelName}: en cada compás, como mucho las cuerdas que usa la tab, y contiguas`, () => {
    const real = chartOf(file, track);
    const profile = RIFF_LEVELS[level];
    const chart = reduceChart(real, profile);
    for (const bar of real.bars) {
      const inBar = <T extends { t: number }>(notes: T[]) => notes.filter((n) => n.t >= bar.t - 1e-6 && n.t < bar.end - 1e-6);
      const realOnsets = new Map<number, typeof real.notes>();
      for (const n of inBar(real.notes)) realOnsets.set(Math.round(n.t * 1000), [...(realOnsets.get(Math.round(n.t * 1000)) ?? []), n]);
      const realStrings = new Set([...realOnsets.values()].map((group) => {
        const sorted = [...group].sort((a, b) => a.midi - b.midi);
        const power = sorted.every((n) => [0, 5, 7, 12, 17, 19, 24].includes(n.midi - sorted[0].midi));
        return (power ? sorted[0] : sorted[sorted.length - 1]).string;
      }));
      const used = [...new Set(inBar(chart.notes).map((n) => n.string))].sort((a, b) => a - b);
      if (used.length === 0) continue;
      expect(used.length, `compás ${bar.number}`).toBeLessThanOrEqual(Math.min(realStrings.size, profile.strings.length));
      expect(used[used.length - 1] - used[0], `compás ${bar.number}`).toBe(used.length - 1);
    }
  });
}

test('Avanzado (cuerdas), Kirk: barrido (9-12) en 2 cuerdas contiguas e igual en 9 y 11; compases 23-26 en una sola cuerda', () => {
  const real = chartOf('prueba-master-of-puppets.gp', 2);
  const chart = reduceChart(real, RIFF_LEVELS['avanzado-cuerdas']);
  const firstBar = (number: number) => real.bars.find((b) => b.number === number)!;
  const inBar = (number: number) => chart.notes.filter((n) => n.t >= firstBar(number).t - 1e-6 && n.t < firstBar(number).end - 1e-6);
  for (const number of [9, 10, 11, 12]) {
    const strings = [...new Set(inBar(number).map((n) => n.string))].sort();
    expect(strings, `compás ${number}`).toHaveLength(2);
    expect(strings[1] - strings[0]).toBe(1);
  }
  expect(inBar(11).map((n) => `${n.string}/${n.fret}`)).toEqual(inBar(9).map((n) => `${n.string}/${n.fret}`));
  for (const number of [23, 24, 25, 26]) expect(new Set(inBar(number).map((n) => n.string)).size, `compás ${number}`).toBe(1);
  // Algo menos denso que la tab en el solo (rejilla de corcheas).
  const onsets = new Set(real.notes.map((n) => Math.round(n.t * 1000))).size;
  expect(chart.notes.length / onsets).toBeLessThan(0.95);
});

// Fidelidad (petición del usuario, 2026-10-27): si una nota de la tab ya cabe en el nivel (su cuerda
// y su traste), sale tal cual -- sin transportes innecesarios. Solo la tónica de los power chords.
for (const [level, levelName] of CUERDAS_LEVELS) test(`${levelName}: las notas de la tab que caben salen idénticas (≥ 95 %)`, () => {
  const profile = RIFF_LEVELS[level];
  for (const [name, file, track] of CUERDAS_SONGS) {
    const real = chartOf(file, track);
    const chart = reduceChart(real, profile);
    let fit = 0;
    let exact = 0;
    for (const note of chart.notes) {
      const group = real.notes.filter((n) => Math.abs(n.t - note.t) < 0.005).sort((a, b) => a.midi - b.midi);
      const power = group.every((n) => [0, 5, 7, 12, 17, 19, 24].includes(n.midi - group[0].midi));
      const lead = power ? group[0] : group[group.length - 1];
      if (!profile.strings.includes(lead.string) || lead.fret > profile.maxFretByString![lead.string]) continue;
      fit++;
      if (lead.string === note.string && lead.fret === note.fret) exact++;
    }
    console.log(`${name} (${levelName}): ${exact}/${fit} notas que caben, idénticas a la tab`);
    if (fit >= 20) expect(exact / fit, name).toBeGreaterThanOrEqual(0.95);
  }
});

// Riffs compartidos (petición del usuario, 2026-10-27): Kirk sigue a James (la rítmica, la que manda)
// en todo lo que tocan igual -- misma nota guía en el mismo instante --, en todos los niveles.
test('riffs compartidos: Kirk se coloca igual que James en todo lo que tocan juntos (todos los niveles)', () => {
  const james = chartOf('prueba-master-of-puppets.gp', 1);
  const kirk = chartOf('prueba-master-of-puppets.gp', 2);
  const leads = (chart: Chart) => {
    const byTime = new Map<number, typeof chart.notes>();
    for (const n of chart.notes) byTime.set(Math.round(n.t * 1000), [...(byTime.get(Math.round(n.t * 1000)) ?? []), n]);
    return new Map([...byTime].map(([t, group]) => {
      const sorted = [...group].sort((a, b) => a.midi - b.midi);
      const power = sorted.every((n) => [0, 5, 7, 12, 17, 19, 24].includes(n.midi - sorted[0].midi));
      return [t, (power ? sorted[0] : sorted[sorted.length - 1]).midi];
    }));
  };
  const jl = leads(james);
  const kl = leads(kirk);
  for (const level of ['practica', 'facil', 'medio', 'avanzado', 'medio-cuerdas', 'avanzado-cuerdas'] as const) {
    const followed = reduceChart(james, RIFF_LEVELS[level]);
    const chart = reduceChart(kirk, RIFF_LEVELS[level], followed);
    const byTime = new Map(followed.notes.map((n) => [Math.round(n.t * 1000), n]));
    let shared = 0;
    let same = 0;
    for (const note of chart.notes) {
      const t = Math.round(note.t * 1000);
      const j = byTime.get(t);
      if (!j || jl.get(t) !== kl.get(t)) continue;
      shared++;
      if (j.string === note.string && j.fret === note.fret) same++;
    }
    expect(shared, level).toBeGreaterThan(150);
    expect(same / shared, level).toBeGreaterThanOrEqual(0.99);
  }
});

test('placeSequence: salto grande rápido -> cuerda siguiente; paso cromático -> misma cuerda; la tab manda en los empates', () => {
  const profile = RIFF_LEVELS['medio-cuerdas'];
  const positions = [5, 6].flatMap((string) => Array.from({ length: profile.maxFretByString![string] + 1 }, (_, fret) => ({ string, fret, pitch: OPEN_MIDI[string] + fret })));
  // Fa (41) -> Re (50) en corchea: 9 trastes en la 6 es demasiado; Re pasa a la cuerda 5 (5/5).
  const jump = placeSequence([{ pitch: 41, t: 0 }, { pitch: 50, t: 0.15 }], positions)!;
  expect(jump.path.map((p) => `${p.string}/${p.fret}`)).toEqual(['6/1', '5/5']);
  // Fa (41) -> Fa# (42) -> Sol (43): pasito a pasito en la cuerda 6.
  const chromatic = placeSequence([{ pitch: 41, t: 0 }, { pitch: 42, t: 0.15 }, { pitch: 43, t: 0.3 }], positions)!;
  expect(chromatic.path.map((p) => `${p.string}/${p.fret}`)).toEqual(['6/1', '6/2', '6/3']);
  // La (45) cabe al aire en la 5 o en el traste 5 de la 6: la tab dice 6/5 y se respeta.
  const tab = placeSequence([{ pitch: 43, t: 0, real: { string: 6, fret: 3 } }, { pitch: 45, t: 0.3, real: { string: 6, fret: 5 } }], positions)!;
  expect(tab.path.map((p) => `${p.string}/${p.fret}`)).toEqual(['6/3', '6/5']);
});

// Canción "remix" de la partida tutorial (riffTutorial.ts), fabricada nota a nota.
test('remix: compás 42 ×6, silencio, 9-12 ×2 (Fácil), silencio, 9-12 ×2 (Medio), como una sola canción', () => {
  const real = chartOf('prueba-master-of-puppets.gp', 2);
  const facil = reduceChart(real, RIFF_LEVELS.facil);
  const medio = reduceChart(real, RIFF_LEVELS.medio);
  const { chart, breaks } = buildRemix([
    { chart: facil, fromBar: 42, toBar: 42, repeats: 6 },
    { chart: facil, fromBar: 9, toBar: 12, repeats: 2 },
    { chart: medio, fromBar: 9, toBar: 12, repeats: 2 },
  ]);
  // 6 + 1 + 8 + 1 + 8 compases, numerados 1..24, seguidos sin huecos ni solapes.
  expect(chart.bars.map((b) => b.number)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
  chart.bars.forEach((bar, i) => { if (i > 0) expect(bar.t).toBeCloseTo(chart.bars[i - 1].end, 6); });
  expect(chart.duration).toBeCloseTo(chart.bars[23].end, 6);
  // Las paradas, al principio de los dos compases de silencio, que no tienen notas.
  expect(breaks).toHaveLength(2);
  expect(breaks[0]).toBeCloseTo(chart.bars[6].t, 6);
  expect(breaks[1]).toBeCloseTo(chart.bars[15].t, 6);
  const beat = 60 / chart.bpm;
  for (const t of breaks) expect(chart.notes.filter((n) => n.t >= t - 1e-6 && n.t < t + REMIX_GAP_QUARTERS * beat - 1e-6)).toHaveLength(0);
  // Notas: ids 0..n-1 en orden, tiempos crecientes; cada tramo trae exactamente las de su nivel.
  chart.notes.forEach((n, i) => {
    expect(n.id).toBe(i);
    if (i > 0) expect(n.t).toBeGreaterThanOrEqual(chart.notes[i - 1].t);
  });
  const count = (c: typeof real, from: number, to: number) => {
    const bars = c.bars.filter((b) => b.number >= from && b.number <= to);
    return c.notes.filter((n) => n.t >= bars[0].t - 1e-6 && n.t < bars[bars.length - 1].end - 1e-6).length;
  };
  const inBars = (from: number, to: number) => chart.notes.filter((n) => n.t >= chart.bars[from - 1].t - 1e-6 && n.t < chart.bars[to - 1].end - 1e-6).length;
  expect(inBars(1, 6)).toBe(6 * count(facil, 42, 42));
  expect(inBars(8, 15)).toBe(2 * count(facil, 9, 12));
  expect(inBars(17, 24)).toBe(2 * count(medio, 9, 12));
  // Las notas reales de fondo, renumeradas: cada `sourceIds` apunta a una nota real del remix
  // que suena desde su golpe (nunca antes).
  for (const n of chart.notes) {
    for (const id of n.sourceIds ?? []) {
      expect(chart.sourceNotes![id].id).toBe(id);
      expect(chart.sourceNotes![id].t).toBeGreaterThanOrEqual(n.t - 1e-6);
    }
  }
});
