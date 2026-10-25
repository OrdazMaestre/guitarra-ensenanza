import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import * as at from '@coderline/alphatab';
import { buildChart, type Chart } from '../app/lib/riff/chart';
import { RIFF_LEVELS } from '../app/lib/riff/levels';
import { reduceChart } from '../app/lib/riff/reduce';
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
