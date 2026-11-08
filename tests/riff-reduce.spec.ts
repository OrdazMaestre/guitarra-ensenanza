import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import * as at from '@coderline/alphatab';
import { buildChart, listGuitarTracks, type Chart } from '../app/lib/riff/chart';
import { RIFF_LEVELS } from '../app/lib/riff/levels';
import { OPEN_MIDI, octaveSplit, outsideHandBox, pitchRange, placeSequence, reduceChart } from '../app/lib/riff/reduce';
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
// Canciones de la web (Sala de pruebas), por ahora solo en el test de densidad.
const WEB_SONGS: Array<[string, string, number]> = [
  ['Black Gilmur', 'black-gilmur.gp', 0],
  ['Electric Warlock', 'electric-warlock.gp', 0],
  ['Iron Rain (MAIkael)', 'iron-rain.gp', 0],
  ['Iron Rain (Ordaz)', 'iron-rain.gp', 1],
];

// Densidad (decisión del usuario, 2026-10-31): Principiante como entre el Fácil y el Medio de Guitar
// Hero, Fácil como su Difícil y Medio como su Experto. En las canciones densas (Master of Puppets,
// Iron Rain) los tres niveles tienen que ser claramente distintos.
const DENSE = new Set(['prueba-master-of-puppets.gp', 'iron-rain.gp']);

for (const [name, file, track] of [...SONGS, ...WEB_SONGS]) {
  test(`${name}: Principiante < Fácil < Medio (trastes) en número de notas`, () => {
    const real = chartOf(file, track);
    const onsets = new Set(real.notes.map((n) => Math.round(n.t * 1000))).size;
    const [p, f, m] = (['practica', 'facil', 'medio'] as const).map((level) => reduceChart(real, RIFF_LEVELS[level]).notes.length / onsets);
    expect(m).toBeGreaterThanOrEqual(0.99);
    if (DENSE.has(file)) {
      expect(p).toBeGreaterThanOrEqual(0.3);
      expect(p).toBeLessThanOrEqual(0.5);
      expect(f).toBeGreaterThanOrEqual(0.55);
      expect(f).toBeLessThanOrEqual(0.75);
    }
    // Electric Warlock y Black Gilmur (corcheas de 175 ms, semicorcheas de 217 ms): Principiante
    // pierde de verdad notas, aunque la canción no sea densa.
    if (file === 'electric-warlock.gp' || file === 'black-gilmur.gp') expect(p).toBeLessThanOrEqual(0.65);
    expect(p).toBeLessThanOrEqual(f);
    expect(f).toBeLessThanOrEqual(m);
  });
}

for (const [name, file, track] of SONGS) {
  for (const level of ['practica', 'facil', 'medio', 'avanzado'] as const) {
    test(`${name} en ${level}: botones del nivel, aire entre notas, dirección y repeticiones`, () => {
      const real = chartOf(file, track);
      const profile = RIFF_LEVELS[level];
      const chart = reduceChart(real, profile);
      const beat = 60 / real.bpm;

      expect(chart.notes.length).toBeGreaterThan(0);
      expect(chart.notes.length).toBeLessThanOrEqual(real.notes.length);
      // Medio y Avanzado, como Guitar Hero Experto, casi no quitan golpes (las proporciones de
      // Principiante y Fácil, en el test de arriba).
      const onsets = new Set(real.notes.map((n) => Math.round(n.t * 1000))).size;
      if (level === 'medio' || level === 'avanzado') expect(chart.notes.length / onsets).toBeGreaterThanOrEqual(0.9);
      // Tope por ventana del compás: en las partes rápidas, nunca más de `max` notas por tramo.
      const window = profile.fastWindow;
      if (window) {
        const barStarts = real.beats.filter((b) => b.isBarStart);
        const groups = new Map<string, number[]>();
        for (const note of chart.notes) {
          const bar = [...barStarts].reverse().find((b) => b.t <= note.t + 1e-6) ?? barStarts[0];
          const beatsFromBar = real.beats.filter((b) => b.t >= bar.t - 1e-6 && b.t <= note.t + 1e-6);
          const last = beatsFromBar[beatsFromBar.length - 1];
          const key = `${bar.q}:${Math.floor((last.q - bar.q) / window.quarters + 1e-6)}`;
          groups.set(key, [...(groups.get(key) ?? []), note.t]);
        }
        for (const times of groups.values()) {
          const fast = times.slice(1).some((t, k) => t - times[k] < window.belowSeconds - 1e-3);
          if (fast) expect(times.length).toBeLessThanOrEqual(window.max);
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

// Con dos zonas (graves 0-6, agudas 4-10), los intervalos exactos se conservan DENTRO de cada zona;
// entre una grave y una aguda la distancia cambia a propósito.
test('Avanzado (trastes): dentro de cada zona, una frase que cabe se coloca EXACTA (mismos intervalos)', () => {
  const real = chartOf('feliz-navidad.gp', 0);
  const chart = reduceChart(real, RIFF_LEVELS.avanzado);
  const split = octaveSplit(pitchRange([real]));
  // Feliz Navidad va en corcheas: Avanzado (negras) se queda con las notas de cada pulso.
  expect(chart.notes.length).toBeGreaterThan(real.notes.length / 3);
  const realAt = (i: number) => real.notes.find((n) => Math.abs(n.t - chart.notes[i].t) < 0.005)!.midi;
  let compared = 0;
  for (let i = 1; i < chart.notes.length; i++) {
    if (chart.notes[i].phrase !== chart.notes[i - 1].phrase) continue;
    if ((realAt(i) < split) !== (realAt(i - 1) < split)) continue;
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
    // Fácil quita parte de los "chugs", pero menos que Principiante.
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
// Niveles del modo cuerdas ya construidos (Medio: Mi + La; Avanzado: + Re; Difícil: + Sol).
const CUERDAS_LEVELS = [['medio-cuerdas', 'Medio (cuerdas)'], ['avanzado-cuerdas', 'Avanzado (cuerdas)'], ['dificil', 'Difícil']] as const;

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
  // Compacta: cabe en la mitad derecha de una cuerda (hasta 7 trastes en la Re y el Sol, 6-12).
  expect(Math.max(...frets) - Math.min(...frets)).toBeLessThanOrEqual(6);
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
    // Con muy pocas repeticiones (Feliz Navidad en Difícil: 4) una sola cambiada ya es un 25 %: el
    // tirón de los motivos es suave y ahí compite con el límite de cuerdas y el mapa de registro.
    if (total >= 8) expect(same / total).toBeGreaterThanOrEqual(0.9);
  }
});

// Límite de cuerdas por compás (decisión del usuario, 2026-10-27): si la tab usa 1 o 2 cuerdas en un
// compás, el juego usa como mucho esas, contiguas o exactamente las mismas que la tab.
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
      // Contiguas, o exactamente las mismas cuerdas que la tab (aunque se salte alguna).
      const sameAsTab = [...realStrings].sort((a, b) => a - b).join() === used.join();
      if (!sameAsTab) expect(used[used.length - 1] - used[0], `compás ${bar.number}`).toBe(used.length - 1);
    }
  });
}

// Pasaje rápido transportado (petición del usuario, 2026-10-29): el barrido del solo de Kirk
// (compases 9-12) va entero en UNA cuerda, en su mitad derecha, como el cromatismo del modo trastes.
for (const [level, levelName] of CUERDAS_LEVELS) test(`${levelName}, Kirk: barrido (9-12) en una sola cuerda, en su mitad derecha, e igual en 9 y 11; compases 23-26 en una sola cuerda`, () => {
  const real = chartOf('prueba-master-of-puppets.gp', 2);
  const profile = RIFF_LEVELS[level];
  const chart = reduceChart(real, profile);
  const firstBar = (number: number) => real.bars.find((b) => b.number === number)!;
  const inBar = (number: number) => chart.notes.filter((n) => n.t >= firstBar(number).t - 1e-6 && n.t < firstBar(number).end - 1e-6);
  const sweep = [9, 10, 11, 12].flatMap(inBar);
  const strings = new Set(sweep.map((n) => n.string));
  expect(strings.size).toBe(1);
  const string = [...strings][0];
  const cap = Math.min(profile.maxFret, profile.maxFretByString![string]);
  for (const note of sweep) expect(note.fret).toBeGreaterThanOrEqual(profile.rightHalfFrom?.[note.string] ?? Math.ceil(cap / 2));
  // Misma altura real -> mismo traste.
  const fretOf = new Map<number, number>();
  for (const note of sweep) {
    const lead = Math.max(...real.notes.filter((n) => Math.abs(n.t - note.t) < 0.005).map((n) => n.midi));
    if (fretOf.has(lead)) expect(note.fret).toBe(fretOf.get(lead));
    else fretOf.set(lead, note.fret);
  }
  expect(inBar(11).map((n) => `${n.string}/${n.fret}`)).toEqual(inBar(9).map((n) => `${n.string}/${n.fret}`));
  for (const number of [23, 24, 25, 26]) expect(new Set(inBar(number).map((n) => n.string)).size, `compás ${number}`).toBe(1);
  // La misma densidad que Medio trastes (sin el límite de 0,1 s, decisión del usuario 2026-11-02).
  expect(chart.notes.length).toBe(reduceChart(real, RIFF_LEVELS.medio).notes.length);
});

// Fidelidad (petición del usuario, 2026-10-27): si una nota de la tab ya cabe en el nivel (su cuerda
// y su traste), sale tal cual -- sin transportes innecesarios. Solo la tónica de los power chords.
for (const [level, levelName] of CUERDAS_LEVELS) test(`${levelName}: las notas de la tab que caben salen idénticas (≥ 95 %)`, () => {
  const profile = RIFF_LEVELS[level];
  for (const [name, file, track] of CUERDAS_SONGS) {
    const real = chartOf(file, track);
    const chart = reduceChart(real, profile);
    // Solo en frases donde la tab cabe al menos a medias: en una frase que va casi entera por
    // cuerdas que el nivel no tiene (la melodía de Carol of the Bells en la Si y el Mi agudo) la
    // frase entera se traslada, y dejar en su sitio las pocas notas que caben la rompería.
    const leadOf = (note: (typeof chart.notes)[number]) => {
      const group = real.notes.filter((n) => Math.abs(n.t - note.t) < 0.005).sort((a, b) => a.midi - b.midi);
      const power = group.every((n) => [0, 5, 7, 12, 17, 19, 24].includes(n.midi - group[0].midi));
      return power ? group[0] : group[group.length - 1];
    };
    const fits = (note: (typeof chart.notes)[number]) => {
      const lead = leadOf(note);
      return profile.strings.includes(lead.string) && lead.fret <= profile.maxFretByString![lead.string];
    };
    const phraseFit = new Map<number, [number, number]>();
    for (const note of chart.notes) {
      const [inside, total] = phraseFit.get(note.phrase!) ?? [0, 0];
      phraseFit.set(note.phrase!, [inside + (fits(note) ? 1 : 0), total + 1]);
    }
    let fit = 0;
    let exact = 0;
    for (const note of chart.notes) {
      const [inside, total] = phraseFit.get(note.phrase!)!;
      if (!fits(note) || inside * 2 < total) continue;
      const lead = leadOf(note);
      fit++;
      if (lead.string === note.string && lead.fret === note.fret) exact++;
    }
    console.log(`${name} (${levelName}): ${exact}/${fit} notas que caben (en frases que caben a medias o más), idénticas a la tab`);
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
    const range = pitchRange([james, kirk]);
    const followed = reduceChart(james, RIFF_LEVELS[level], { range });
    const chart = reduceChart(kirk, RIFF_LEVELS[level], { follow: followed, range });
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

// Avanzado (modo trastes): dos "Guitar Hero" seguidos (decisión del usuario, 2026-10-28) -- graves a la
// izquierda y agudas a la derecha, cortando por la mitad de las octavas del instrumento (todas sus
// pistas) --, solapados desde 2026-11-02: graves en 0-6, agudas en 4-10.
test('Avanzado (trastes): graves en los trastes 0-6 y agudas en 4-10, con el corte de octavas del instrumento', () => {
  const [[, lowTo], [highFrom]] = RIFF_LEVELS.avanzado.zones!;
  expect([lowTo, highFrom]).toEqual([6, 4]);
  expect(octaveSplit([40, 86])).toBe(64);
  for (const [name, file, track] of CUERDAS_SONGS) {
    const score = at.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(fs.readFileSync(`public/tabs/${file}`)), new at.Settings());
    const guitars = score.tracks.map((t, index) => ({ t, index })).filter(({ t }) => t.staves[0] && !t.staves[0].isPercussion && t.staves[0].tuning.length === 6);
    const range = pitchRange(guitars.map(({ index }) => buildChart(at, score, index, 24)));
    const split = octaveSplit(range);
    const real = chartOf(file, track);
    const chart = reduceChart(real, RIFF_LEVELS.avanzado, { range });
    let pairs = 0;
    let sameDirection = 0;
    chart.notes.forEach((note, i) => {
      const group = real.notes.filter((n) => Math.abs(n.t - note.t) < 0.005).sort((a, b) => a.midi - b.midi);
      const power = group.every((n) => [0, 5, 7, 12, 17, 19, 24].includes(n.midi - group[0].midi));
      const lead = (power ? group[0] : group[group.length - 1]).midi;
      if (lead < split) expect(note.fret, `${name}: grave ${lead}`).toBeLessThanOrEqual(lowTo);
      else expect(note.fret, `${name}: aguda ${lead}`).toBeGreaterThanOrEqual(highFrom);
      const prev = chart.notes[i - 1];
      if (prev && prev.phrase === note.phrase) {
        const prevGroup = real.notes.filter((n) => Math.abs(n.t - prev.t) < 0.005).sort((a, b) => a.midi - b.midi);
        const prevPower = prevGroup.every((n) => [0, 5, 7, 12, 17, 19, 24].includes(n.midi - prevGroup[0].midi));
        const prevLead = (prevPower ? prevGroup[0] : prevGroup[prevGroup.length - 1]).midi;
        pairs++;
        if (Math.sign(note.fret - prev.fret) === Math.sign(lead - prevLead)) sameDirection++;
      }
    });
    if (pairs > 0) expect(sameDirection / pairs, name).toBeGreaterThanOrEqual(0.95);
  }
});

test('Avanzado (trastes), Master of Puppets: James entero en 0-6; el solo de Kirk (compases 9-12) en 4-10', () => {
  const james = chartOf('prueba-master-of-puppets.gp', 1);
  const kirk = chartOf('prueba-master-of-puppets.gp', 2);
  const range = pitchRange([james, kirk]);
  const jamesChart = reduceChart(james, RIFF_LEVELS.avanzado, { range });
  expect(Math.max(...jamesChart.notes.map((n) => n.fret))).toBeLessThanOrEqual(6);
  const kirkChart = reduceChart(kirk, RIFF_LEVELS.avanzado, { follow: jamesChart, range });
  const solo = kirk.bars.filter((b) => b.number >= 9 && b.number <= 12).slice(0, 4);
  const inSolo = kirkChart.notes.filter((n) => solo.some((b) => n.t >= b.t - 1e-6 && n.t < b.end - 1e-6));
  expect(inSolo.length).toBeGreaterThan(20);
  expect(Math.min(...inSolo.map((n) => n.fret))).toBeGreaterThanOrEqual(4);
});

// Orden de alturas entre frases (mapa de registro, petición del usuario 2026-10-29): lo agudo de la
// tab va arriba en el juego, lo grave abajo y lo medio en medio, aunque haya que transportar.
for (const [level, levelName] of CUERDAS_LEVELS) test(`${levelName}: se conserva el ORDEN de alturas entre frases (Kirk: 13-14 > 21 > 17-19)`, () => {
  const lead = (real: Chart, t: number) => {
    const group = real.notes.filter((n) => Math.abs(n.t - t) < 0.005).sort((a, b) => a.midi - b.midi);
    const power = group.every((n) => [0, 5, 7, 12, 17, 19, 24].includes(n.midi - group[0].midi));
    return (power ? group[0] : group[group.length - 1]).midi;
  };
  const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
  for (const [name, file, track] of CUERDAS_SONGS) {
    const real = chartOf(file, track);
    const chart = reduceChart(real, RIFF_LEVELS[level]);
    const byPhrase = new Map<number, [number[], number[]]>();
    for (const note of chart.notes) {
      const entry = byPhrase.get(note.phrase!) ?? [[], []];
      entry[0].push(lead(real, note.t));
      entry[1].push(note.midi);
      byPhrase.set(note.phrase!, entry);
    }
    // Pares de frases con alturas reales claramente distintas (≥ 3 semitonos de media): la más aguda
    // en la tab también debe quedar más aguda (o igual) en el juego.
    const phrases = [...byPhrase.values()].map((p) => [mean(p[0]), mean(p[1])]);
    let pairs = 0;
    let kept = 0;
    for (let a = 0; a < phrases.length; a++) {
      for (let b = a + 1; b < phrases.length; b++) {
        const realDiff = phrases[a][0] - phrases[b][0];
        if (Math.abs(realDiff) < 3) continue;
        pairs++;
        if (Math.sign(phrases[a][1] - phrases[b][1]) !== -Math.sign(realDiff)) kept++;
      }
    }
    if (pairs > 0) expect(kept / pairs, name).toBeGreaterThanOrEqual(0.9);
  }
  const kirk = chartOf('prueba-master-of-puppets.gp', 2);
  const chart = reduceChart(kirk, RIFF_LEVELS[level]);
  const bars = (...numbers: number[]) => numbers.flatMap((number) => {
    const bar = kirk.bars.find((b) => b.number === number)!;
    return chart.notes.filter((n) => n.t >= bar.t - 1e-6 && n.t < bar.end - 1e-6).map((n) => n.midi);
  });
  expect(mean(bars(13, 14))).toBeGreaterThan(mean(bars(21)));
  expect(mean(bars(21))).toBeGreaterThan(mean(bars(17, 18, 19)));
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

// Canciones de la Sala de pruebas (botón del disco). Black Gilmur y Electric Warlock están en Do#
// e Iron Rain en Mi♭: el chart las lee como en afinación estándar (soundOffset, chart.ts). Todas
// sus guitarras se traducen a TODOS los niveles sin romperse (Iron Rain rompía el contorno de un
// tramo con pasaje rápido aislado y compás normal en la misma cuerda), dentro de las cuerdas y
// trastes del nivel.
test('canciones de la Sala de pruebas: todas las guitarras, todos los niveles', () => {
  for (const [file, offset] of [['black-gilmur.gp', -3], ['electric-warlock.gp', -3], ['iron-rain.gp', -1]] as const) {
    const score = at.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(fs.readFileSync(`public/tabs/${file}`)), new at.Settings());
    const guitars = score.tracks.map((track, index) => ({ track, index })).filter(({ track }) => !track.staves[0].isPercussion && track.staves[0].tuning.length === 6);
    const charts = guitars.map(({ index }) => buildChart(at, score, index, 24));
    const range = pitchRange(charts);
    for (const real of charts) {
      expect(real.soundOffset, file).toBe(offset);
      for (const [id, profile] of Object.entries(RIFF_LEVELS)) {
        if (!profile.available) continue;
        const reduced = reduceChart(real, profile, { range });
        const onsets = new Set(real.notes.map((n) => Math.round(n.t * 1000))).size;
        expect(reduced.notes.length, `${file} ${id}`).toBeGreaterThan(onsets * 0.3);
        expect(reduced.soundOffset, `${file} ${id}`).toBe(offset);
        for (const note of reduced.notes) {
          if (!profile.freeStrings) expect(profile.strings, `${file} ${id}`).toContain(note.string);
          expect(note.fret, `${file} ${id}`).toBeGreaterThanOrEqual(profile.minFret);
          expect(note.fret, `${file} ${id}`).toBeLessThanOrEqual(profile.maxFretByString?.[note.string] ?? profile.maxFret);
        }
      }
    }
  }
});

// Rejilla de fusas (decisión del usuario, 2026-11-02) en Medio y Avanzado trastes y en Medio, Avanzado y
// Difícil cuerdas: fusas y seisillos de semicorchea ya no se quedan en una nota por semicorchea. A 60 bpm
// una fusa dura 0,125 s (más que el `minSlotSeconds` 0,1 del modo cuerdas): se quedan todas.
test('rejilla de fusas: fusas y seisillos de semicorchea enteros a 60 bpm (Fácil sigue quitando)', () => {
  const notes: Chart['notes'] = [];
  const add = (t: number, k: number) => notes.push({ id: notes.length, t, dur: 0.1, string: 6, fret: [0, 2, 3, 5][k % 4], midi: 40 + [0, 2, 3, 5][k % 4], palmMute: false, tech: [] });
  for (let k = 0; k < 32; k++) add(k * 0.125, k); // compás 1: 32 fusas
  for (let k = 0; k < 24; k++) add(4 + k / 6, k); // compás 2: seisillos de semicorchea
  const chart: Chart = {
    trackName: 'prueba',
    bpm: 60,
    duration: 8,
    notes,
    bars: [{ number: 1, t: 0, end: 4 }, { number: 2, t: 4, end: 8 }],
    beats: Array.from({ length: 8 }, (_, q) => ({ t: q, q, isBarStart: q % 4 === 0 })),
    drums: [],
    movedAboveMaxFret: 0,
    skippedAboveMaxFret: 0,
  };
  for (const level of ['medio', 'avanzado', 'medio-cuerdas', 'avanzado-cuerdas', 'dificil'] as const) {
    expect(reduceChart(chart, RIFF_LEVELS[level]).notes.length, level).toBe(notes.length);
  }
  expect(reduceChart(chart, RIFF_LEVELS.facil).notes.length).toBeLessThan(notes.length);
});

// Modo cuerdas sin el límite de 0,1 s (decisión del usuario, 2026-11-02): la MISMA densidad que Medio y
// Avanzado trastes, y a cambio los pasajes rápidos tienen que ser TOCABLES: en cada tiempo de negra con
// notas a menos de 0,1 s, todas en una caja de 4 trastes salvo como mucho una posición (outsideHandBox).
// Calibrado con Death - Lack Of Comprehension y Vektor - Pteropticon (canciones del usuario): su tab real
// lo cumple en el 98-99 % de esos tiempos, y el juego en el 100 %.
for (const [level, levelName] of CUERDAS_LEVELS) test(`${levelName}: la misma densidad que el modo trastes y pasajes rápidos tocables`, () => {
  const songs: Array<[string, string, number]> = [...CUERDAS_SONGS, ...WEB_SONGS, ['Canción de estrés', '../../tests/fixtures/stress-4-instrumentos.musicxml', 0]];
  for (const [name, file, track] of songs) {
    const real = chartOf(file, track);
    const chart = reduceChart(real, RIFF_LEVELS[level]);
    // La misma densidad que Medio trastes, salvo los tiempos que la red de seguridad aligera por no ser
    // tocables (solo en la canción de estrés: saltos de cuerda en semicorcheas a 220 bpm).
    const medio = reduceChart(real, RIFF_LEVELS.medio).notes.length;
    expect(chart.notes.length, name).toBeLessThanOrEqual(medio);
    expect(chart.notes.length, name).toBeGreaterThanOrEqual(name === 'Canción de estrés' ? medio * 0.9 : medio);
    const beats = new Map<number, Chart['notes']>();
    for (const note of chart.notes) {
      const beat = real.beats.findLastIndex((b) => b.t <= note.t + 0.005);
      beats.set(beat, [...(beats.get(beat) ?? []), note]);
    }
    for (const notes of beats.values()) {
      const fast = notes.length >= 3 && notes.every((n, k) => k === 0 || n.t - notes[k - 1].t < 0.1 - 1e-6);
      if (fast) expect(outsideHandBox(notes), `${name}, ${notes.map((n) => `${n.string}/${n.fret}`).join(' ')}`).toBeLessThanOrEqual(1);
    }
  }
});

// Notas que se pasan POR POCO del máximo de su cuerda (petición del usuario, 2026-11-02): se quedan en su
// cuerda y bajan, juntas por frase, lo justo para que la más alta quede en el máximo. Riff principal de
// Death - Lack Of Comprehension (canción del usuario), copiado: pedal 6/8 con 5/12 y 5/10; pedal 6/0 con
// 5/9 y 5/10; y, ya en la frase siguiente (las frases son de 2 compases), pedal 6/0 con 5/12 y 5/14. La
// cuerda 5 llega al 11: antes la 5/12 acababa en 5/0, por debajo del pedal.
test('modo cuerdas: las notas que se pasan por poco del máximo de su cuerda bajan en ella (riff de Death)', () => {
  const beat = 60 / 108;
  const notes: Chart['notes'] = [];
  const bar = (start: number, pedal: number, high: [number, number]) => {
    for (let k = 0; k < 16; k++) {
      if (k === 2 || k === 6 || k === 10 || k === 14) continue;
      const [string, fret] = k === 4 ? [5, high[0]] : k === 12 ? [5, high[1]] : [6, pedal];
      notes.push({ id: notes.length, t: start + (k * beat) / 4, dur: beat / 4, string, fret, midi: OPEN_MIDI[string] + fret, palmMute: false, tech: [] });
    }
  };
  bar(0, 8, [12, 10]);
  bar(4 * beat, 0, [9, 10]);
  bar(8 * beat, 0, [12, 14]);
  const chart: Chart = {
    trackName: 'riff',
    bpm: 108,
    duration: 12 * beat,
    notes,
    bars: [1, 2, 3].map((number) => ({ number, t: (number - 1) * 4 * beat, end: number * 4 * beat })),
    beats: Array.from({ length: 12 }, (_, q) => ({ t: q * beat, q, isBarStart: q % 4 === 0 })),
    drums: [],
    movedAboveMaxFret: 0,
    skippedAboveMaxFret: 0,
  };
  for (const [level] of CUERDAS_LEVELS) {
    const out = reduceChart(chart, RIFF_LEVELS[level]).notes.map((n) => `${n.string}/${n.fret}`);
    expect(out.slice(0, 12), level).toEqual(['6/8', '6/8', '6/8', '5/11', '6/8', '6/8', '6/8', '6/8', '6/8', '5/10', '6/8', '6/8']);
    expect(out.slice(24), level).toEqual(['6/0', '6/0', '6/0', '5/9', '6/0', '6/0', '6/0', '6/0', '6/0', '5/11', '6/0', '6/0']);
  }
});

// No dar la vuelta a los riffs (petición del usuario, 2026-11-02; con guitar-music-advisor y kids-ux-advisor):
// estribillo de Death - Crystal Mountain (canción del usuario), copiado: la línea Do-Si (4/10, 4/9) sobre el
// Mi (5/7) y la La al aire, y luego un punteo agudo (que hace comprimir el mapa de registro). Antes, Medio y
// Avanzado cuerdas bajaban SOLO el Do de octava (6/8, por debajo del Mi).
test('modo cuerdas: un riff no se da la vuelta (estribillo de Crystal Mountain)', () => {
  const beat = 60 / 180;
  const notes: Chart['notes'] = [];
  const add = (t: number, string: number, fret: number) => notes.push({ id: notes.length, t, dur: beat / 4, string, fret, midi: OPEN_MIDI[string] + fret, palmMute: false, tech: [] });
  const riff = [[4, 10], [5, 7], [5, 0], [5, 7], [4, 9], [5, 7], [5, 0], [5, 7]];
  const lead = [[5, 12], [5, 14], [5, 15], [4, 12], [4, 14], [5, 15], [4, 12], [5, 14], [5, 15], [4, 12], [4, 14], [4, 15], [3, 14], [4, 15], [3, 14], [2, 12]];
  for (let bar = 0; bar < 4; bar++) for (let k = 0; k < 16; k++) add((bar * 4 + k / 4) * beat, riff[k % 8][0], riff[k % 8][1]);
  for (let bar = 4; bar < 8; bar++) for (let k = 0; k < 16; k++) add((bar * 4 + k / 4) * beat, lead[k][0], lead[k][1]);
  const chart: Chart = {
    trackName: 'estribillo',
    bpm: 180,
    duration: 32 * beat,
    notes,
    bars: Array.from({ length: 8 }, (_, b) => ({ number: b + 1, t: b * 4 * beat, end: (b + 1) * 4 * beat })),
    beats: Array.from({ length: 32 }, (_, q) => ({ t: q * beat, q, isBarStart: q % 4 === 0 })),
    drums: [],
    movedAboveMaxFret: 0,
    skippedAboveMaxFret: 0,
  };
  const firstBar = (level: (typeof CUERDAS_LEVELS)[number][0]) => reduceChart(chart, RIFF_LEVELS[level]).notes.slice(0, 8).map((n) => `${n.string}/${n.fret}`).join(' ');
  // Medio (cuerdas 6 y 5): el riff entero una cuerda más abajo, con la misma forma y la cuerda al aire de abajo.
  expect(firstBar('medio-cuerdas')).toBe('5/10 6/7 6/0 6/7 5/9 6/7 6/0 6/7');
  // Avanzado y Difícil (tienen la cuerda 4): la tab exacta.
  expect(firstBar('avanzado-cuerdas')).toBe('4/10 5/7 5/0 5/7 4/9 5/7 5/0 5/7');
  expect(firstBar('dificil')).toBe('4/10 5/7 5/0 5/7 4/9 5/7 5/0 5/7');
});

// Orden vertical (kids-ux-advisor): en golpes seguidos de una frase en cuerdas distintas, el carril más agudo
// lleva la nota más aguda de la tab, para que lo que se ve siga lo que se oye. Las tabs reales lo cumplen al
// 100 %; el agente pedía ≥ 95 %, pero lo que queda (88-95 %: Black Gilmur, James en Medio) son notas sueltas
// en cuerdas que el nivel no tiene, que bajan de octava sin alternativa mejor dentro del resto de reglas.
for (const [level, levelName] of CUERDAS_LEVELS) test(`${levelName}: orden vertical -- la nota más aguda de la tab va en la cuerda más aguda (≥ 88 %)`, () => {
  for (const [name, file, track] of [...CUERDAS_SONGS, ...WEB_SONGS]) {
    const real = chartOf(file, track);
    const chart = reduceChart(real, RIFF_LEVELS[level]);
    const lead = (t: number) => {
      const group = real.notes.filter((n) => Math.abs(n.t - t) < 0.005).sort((a, b) => a.midi - b.midi);
      const power = group.every((n) => [0, 5, 7, 12, 17, 19, 24].includes(n.midi - group[0].midi));
      return (power ? group[0] : group[group.length - 1]).midi;
    };
    let pairs = 0;
    let ordered = 0;
    for (let i = 1; i < chart.notes.length; i++) {
      const [a, b] = [chart.notes[i - 1], chart.notes[i]];
      if (a.phrase !== b.phrase || a.string === b.string) continue;
      const [ra, rb] = [lead(a.t), lead(b.t)];
      if (ra === rb) continue;
      pairs++;
      if (rb > ra === b.string < a.string) ordered++;
    }
    if (pairs >= 10) expect(ordered / pairs, name).toBeGreaterThanOrEqual(0.88);
  }
});

// Lucretia (petición del usuario, 2026-11-04): el mismo compás caía en frases distintas según la vuelta
// y salía con otro dibujo, o perdía otras notas. Un compás repetido copia su primera aparición.
test('vueltas iguales: un compás repetido sale igual aunque le acompañen compases distintos', () => {
  const quarter = 0.5;
  const barsMidi = [[50, 52, 54, 52], [40, 42, 44, 45], [50, 52, 54, 52], [60, 64, 70, 76], [50, 52, 54, 52], [47, 49, 47, 49]];
  const notes = barsMidi.flatMap((bar, b) => bar.map((midi, k) => ({ id: b * 4 + k, t: (b * 4 + k) * quarter, dur: quarter * 0.9, string: 6, fret: Math.max(0, midi - 40), midi, palmMute: false, tech: [] })));
  const chart = {
    trackName: 'x',
    bpm: 120,
    duration: barsMidi.length * 4 * quarter,
    notes,
    bars: barsMidi.map((_, b) => ({ number: b + 1, t: b * 4 * quarter, end: (b + 1) * 4 * quarter })),
    beats: Array.from({ length: barsMidi.length * 4 }, (_, q) => ({ t: q * quarter, q, isBarStart: q % 4 === 0 })),
    drums: [],
    movedAboveMaxFret: 0,
    skippedAboveMaxFret: 0,
  };
  for (const level of ['practica', 'facil', 'medio', 'avanzado', 'medio-cuerdas', 'avanzado-cuerdas', 'dificil'] as const) {
    const game = reduceChart(chart, RIFF_LEVELS[level]);
    const drawing = (bar: number) => game.notes
      .filter((note) => note.t >= chart.bars[bar].t - 1e-6 && note.t < chart.bars[bar].end - 1e-6)
      .map((note) => `${(note.t - chart.bars[bar].t).toFixed(2)}:${note.string}/${note.fret}`)
      .join(' ');
    expect(drawing(0), level).not.toBe('');
    expect(drawing(2), level).toBe(drawing(0));
    expect(drawing(4), level).toBe(drawing(0));
  }
});

// Nivel Híbrido: la cuerda de cada nota es la de Medio (cuerdas) y su traste el de Medio (trastes).
const HIBRIDO_SONGS: Array<[string, string, number]> = [
  ['Master of Puppets', 'prueba-master-of-puppets.gp', 1],
  ['Iron Rain', 'iron-rain.gp', 0],
  ['Electric Warlock', 'electric-warlock.gp', 0],
  ['Black Gilmur', 'black-gilmur.gp', 0],
  ['Thunderstruck', 'thunderstruck.gp', 0],
  ['Carol of the Bells', 'carol-of-the-bells.gp', 0],
];

function hibrido(file: string, track: number) {
  const score = at.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(fs.readFileSync(`public/tabs/${file}`)), new at.Settings());
  const guitars = listGuitarTracks(score);
  const range = pitchRange(guitars.map((guitar) => buildChart(at, score, guitar.index, 24)));
  const real = buildChart(at, score, guitars[track].index, 24);
  return { chart: reduceChart(real, RIFF_LEVELS.hibrido, { range }), split: octaveSplit(range) };
}

for (const [name, file, track] of HIBRIDO_SONGS) {
  test(`Híbrido (${name}): cuerdas de Medio cuerdas y trastes de Medio trastes`, () => {
    const score = at.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(fs.readFileSync(`public/tabs/${file}`)), new at.Settings());
    const guitars = listGuitarTracks(score);
    const range = pitchRange(guitars.map((guitar) => buildChart(at, score, guitar.index, 24)));
    const real = buildChart(at, score, guitars[track].index, 24);
    const { chart } = hibrido(file, track);
    const byStrings = reduceChart(real, RIFF_LEVELS['medio-cuerdas'], { range });
    const byFrets = reduceChart(real, RIFF_LEVELS.medio, { range });
    const key = (t: number) => Math.round(t * 1000);
    const fretAt = new Map(byFrets.notes.map((note) => [key(note.t), note.fret]));
    expect(chart.notes.map((note) => [note.t, note.string])).toEqual(byStrings.notes.map((note) => [note.t, note.string]));
    let same = 0;
    for (const note of chart.notes) {
      expect(note.fret).toBeGreaterThanOrEqual(0);
      expect(note.fret).toBeLessThanOrEqual(5);
      if (fretAt.get(key(note.t)) === note.fret) same++;
    }
    // Solo cambian las notas que se mueven para no chocar con el mismo traste en la otra cuerda.
    expect(same / chart.notes.length).toBeGreaterThan(0.9);
    // La intro usa tantos trastes como Medio (trastes), salvo uno como mucho.
    const introEnd = real.bars[Math.min(8, real.bars.length - 1)].t;
    const frets = (notes: Chart['notes']) => new Set(notes.filter((note) => note.t < introEnd).map((note) => note.fret)).size;
    expect(frets(chart.notes)).toBeGreaterThanOrEqual(frets(byFrets.notes) - 1);
  });
}

// CHOQUES (petición del usuario, 2026-11-07): el mismo traste en cuerdas distintas, a menos de 0,4 s,
// cae en la misma columna de la autopista y las gemas se tapan. Suelto puede pasar; tres o más en un
// mismo compás, nunca.
for (const level of ['medio-cuerdas', 'avanzado-cuerdas', 'dificil', 'hibrido'] as const) {
  test(`choques: en ${level} ningún compás tiene 3 o más notas en el mismo traste de otra cuerda`, () => {
    for (const [, file, track] of HIBRIDO_SONGS) {
      const score = at.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(fs.readFileSync(`public/tabs/${file}`)), new at.Settings());
      const guitars = listGuitarTracks(score);
      const range = pitchRange(guitars.map((guitar) => buildChart(at, score, guitar.index, 24)));
      const real = buildChart(at, score, guitars[track].index, 24);
      const notes = reduceChart(real, RIFF_LEVELS[level], { range }).notes;
      const perBar = new Map<number, number>();
      for (let k = 0; k < notes.length; k++) {
        for (let m = k + 1; m < notes.length && notes[m].t - notes[k].t < 0.4; m++) {
          if (notes[m].fret !== notes[k].fret || notes[m].string === notes[k].string) continue;
          const bar = real.bars.findIndex((b) => notes[m].t >= b.t - 1e-6 && notes[m].t < b.end - 1e-6);
          perBar.set(bar, (perBar.get(bar) ?? 0) + 1);
        }
      }
      const worst = Math.max(0, ...perBar.values());
      expect(worst, `${file}`).toBeLessThan(3);
    }
  });
}

test('Híbrido: las notas repetidas no se mueven y el resultado no cambia entre dos cálculos', () => {
  const { chart } = hibrido('prueba-master-of-puppets.gp', 1);
  // Dos notas iguales seguidas, en el mismo sitio (hace falta para mantener pulsado).
  const notes = chart.notes;
  for (let k = 1; k < notes.length; k++) {
    if (notes[k].midi === notes[k - 1].midi) expect([notes[k].string, notes[k].fret]).toEqual([notes[k - 1].string, notes[k - 1].fret]);
  }
  // El mismo chart en el mismo nivel da lo mismo dos veces.
  expect(hibrido('prueba-master-of-puppets.gp', 1).chart.notes).toEqual(notes);
});

// Chart sintético en semicorcheas a 120 bpm: cada compás, sus alturas en orden (y cuántas negras dura).
function sixteenths(bars: Array<{ quarters: number; midis: number[] }>): Chart {
  const spq = 0.5;
  const notes: Chart['notes'] = [];
  const chartBars: Chart['bars'] = [];
  const beats: Chart['beats'] = [];
  let t = 0;
  let q = 0;
  bars.forEach((bar, index) => {
    const start = t;
    for (let k = 0; k < bar.quarters; k++) beats.push({ t: t + k * spq, q: q + k, isBarStart: k === 0 });
    bar.midis.forEach((midi, k) => {
      const string = [6, 5, 4, 3, 2, 1].find((s) => midi - OPEN_MIDI[s] <= 9 && midi - OPEN_MIDI[s] >= 0) ?? 1;
      notes.push({ id: notes.length, t: start + (k * spq) / 4, dur: spq / 4, string, fret: midi - OPEN_MIDI[string], midi, palmMute: false, tech: [] });
    });
    t += bar.quarters * spq;
    q += bar.quarters;
    chartBars.push({ number: index + 1, t: start, end: t, timeSig: [bar.quarters, 4] });
  });
  return { trackName: 'x', bpm: 120, duration: t, notes, bars: chartBars, beats, drums: [], movedAboveMaxFret: 0, skippedAboveMaxFret: 0 };
}

// TROZOS REPETIDOS (petición del usuario, 2026-11-08, NILE - Papyrus): un compás que repite la primera
// mitad de otro, en otra frase, se dibuja igual que esa mitad.
test('trozos repetidos: un compás que repite la mitad de otro se dibuja igual', () => {
  const line = [63, 62, 60, 59, 56, 55, 56, 59, 56, 55, 54, 51, 50, 49, 46, 45];
  const chart = sixteenths([
    { quarters: 4, midis: [40, 43, 45, 47, 40, 43, 45, 47, 40, 43, 45, 47, 40, 43, 45, 47] },
    { quarters: 4, midis: line },
    { quarters: 2.5, midis: line.slice(0, 10) },
    { quarters: 4, midis: [45, 47, 48, 50, 45, 47, 48, 50, 45, 47, 48, 50, 45, 47, 48, 50] },
  ]);
  for (const level of ['medio', 'medio-cuerdas', 'dificil', 'hibrido'] as const) {
    const notes = reduceChart(chart, RIFF_LEVELS[level], { range: [40, 64] }).notes;
    const inBar = (bar: number) => notes.filter((note) => note.t >= chart.bars[bar].t - 1e-6 && note.t < chart.bars[bar].end - 1e-6).map((note) => `${note.string}/${note.fret}`);
    expect(inBar(2), level).toEqual(inBar(1).slice(0, 10));
  }
});

// CONTORNO (2026-11-08): cuando una frase no cabe en los trastes del nivel, una nota que baja nunca sube.
test('contorno: una línea que baja nunca sube en el modo trastes', () => {
  const line = [63, 62, 60, 59, 56, 55, 56, 59, 56, 55, 54, 51, 50, 49, 46, 45];
  const chart = sixteenths([{ quarters: 4, midis: line }, { quarters: 4, midis: line }]);
  for (const level of ['facil', 'medio'] as const) {
    const notes = reduceChart(chart, RIFF_LEVELS[level], { range: [40, 64] }).notes;
    const real = (note: Chart['notes'][number]) => chart.notes.find((source) => Math.abs(source.t - note.t) < 0.005)!.midi;
    for (let k = 1; k < notes.length; k++) {
      const music = Math.sign(real(notes[k]) - real(notes[k - 1]));
      const game = Math.sign(notes[k].fret - notes[k - 1].fret);
      if (music !== 0 && game !== 0) expect(game, `${level} nota ${k}`).toBe(music);
    }
  }
});
