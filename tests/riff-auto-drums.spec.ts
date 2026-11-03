import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import * as at from '@coderline/alphatab';
import { autoDrumPlan, autoDrums } from '../app/lib/riff/autoDrums';
import { buildChart, listGuitarTracks, type Chart, type ChartNote } from '../app/lib/riff/chart';
import { RiffSession } from '../app/lib/riff/session';

// Batería automática (app/lib/riff/autoDrums.ts): los 4 ritmos del metrónomo según tempo y compás,
// con el reparto del usuario -- >130 negras; ternario ≤130 tresillos; binario 90-130 corcheas, <90
// semicorcheas.

// Chart sintético: compases de `quarters` negras cada uno (con su compás), tempo fijo por compás, y
// una nota en cada posición (en negras desde el inicio del compás) de `onsets`.
function synthChart(bars: Array<{ quarters: number; bpm: number; timeSig?: [number, number]; onsets?: number[] }>): Chart {
  const beats: Chart['beats'] = [];
  const chartBars: Chart['bars'] = [];
  const notes: ChartNote[] = [];
  let t = 0;
  let q = 0;
  bars.forEach((bar, index) => {
    const spq = 60 / bar.bpm;
    const start = t;
    for (let k = 0; k < bar.quarters; k++) beats.push({ t: t + k * spq, q: q + k, isBarStart: k === 0 });
    for (const onset of bar.onsets ?? [0]) {
      notes.push({ id: notes.length, t: start + onset * spq, dur: 0.1, string: 6, fret: 0, midi: 40, palmMute: false, tech: [] });
    }
    t += bar.quarters * spq;
    q += bar.quarters;
    chartBars.push({ number: index + 1, t: start, end: t, timeSig: bar.timeSig ?? [bar.quarters, 4] });
  });
  return { trackName: 'x', bpm: bars[0].bpm, duration: t, notes, bars: chartBars, beats, drums: [], movedAboveMaxFret: 0, skippedAboveMaxFret: 0 };
}

const fourBars = (bpm: number, onsets = [0, 1, 2, 3]) => synthChart(Array.from({ length: 4 }, () => ({ quarters: 4, bpm, onsets })));
const soundsOfBar = (chart: Chart, bar: number) => autoDrums(chart).filter((hit) => hit.t >= chart.bars[bar].t - 1e-6 && hit.t < chart.bars[bar].end - 1e-6).map((hit) => hit.sound);

test('4/4 rápido (>130): negras, solo caja', () => {
  const chart = fourBars(150);
  expect(autoDrumPlan(chart)).toEqual(['quarter', 'quarter', 'quarter', 'quarter']);
  expect(soundsOfBar(chart, 0)).toEqual(['snare', 'snare', 'snare', 'snare']);
  // En su sitio: sobre cada pulso.
  const hits = autoDrums(chart).slice(0, 4).map((hit) => hit.t);
  hits.forEach((value, k) => expect(value).toBeCloseTo(chart.beats[k].t, 6));
});

test('4/4 a 110: corcheas, caja/bombo', () => {
  const chart = fourBars(110);
  expect(autoDrumPlan(chart)[0]).toBe('eighth');
  expect(soundsOfBar(chart, 0)).toEqual(['snare', 'kick', 'snare', 'kick', 'snare', 'kick', 'snare', 'kick']);
});

test('4/4 lento (<90): semicorcheas, caja, plato, bombo, plato', () => {
  const chart = fourBars(80);
  expect(autoDrumPlan(chart)[0]).toBe('sixteenth');
  expect(soundsOfBar(chart, 0).slice(0, 4)).toEqual(['snare', 'cymbal', 'kick', 'cymbal']);
  expect(soundsOfBar(chart, 0)).toHaveLength(16);
});

test('6/8 a 100: tresillos sobre sus corcheas, bombo en cada negra con puntillo', () => {
  const chart = synthChart(Array.from({ length: 4 }, () => ({ quarters: 3, bpm: 100, timeSig: [6, 8] as [number, number] })));
  expect(autoDrumPlan(chart)[0]).toBe('triplet');
  expect(soundsOfBar(chart, 0)).toEqual(['kick', 'snare', 'snare', 'kick', 'snare', 'snare']);
});

test('melodía en tresillos: tresillos hasta 130; a 150, negras', () => {
  const triplets = [0, 1 / 3, 2 / 3, 1, 4 / 3, 5 / 3, 2, 7 / 3, 8 / 3, 3];
  const slow = fourBars(100, triplets);
  expect(autoDrumPlan(slow)[0]).toBe('triplet');
  expect(soundsOfBar(slow, 0)).toHaveLength(12);
  expect(autoDrumPlan(fourBars(150, triplets))[0]).toBe('quarter');
  // Un 3/4 binario (Cumpleaños feliz) no es ternario: corcheas a 110.
  expect(autoDrumPlan(synthChart(Array.from({ length: 4 }, () => ({ quarters: 3, bpm: 110, onsets: [0, 1, 2] }))))[0]).toBe('eighth');
});

test('sin parpadeos: el ritmo cambia solo si gana 2 tramos seguidos, al empezar un compás', () => {
  // 2 compases a 110, 2 a 150 (un solo tramo distinto) y otra vez a 110: no cambia.
  const blip = synthChart([110, 110, 150, 150, 110, 110].map((bpm) => ({ quarters: 4, bpm, onsets: [0, 1, 2, 3] })));
  expect(autoDrumPlan(blip)).toEqual(Array(6).fill('eighth'));
  // 4 compases a 150 (dos tramos): cambia, desde el primero de ellos.
  const change = synthChart([110, 110, 150, 150, 150, 150].map((bpm) => ({ quarters: 4, bpm, onsets: [0, 1, 2, 3] })));
  expect(autoDrumPlan(change)).toEqual(['eighth', 'eighth', 'quarter', 'quarter', 'quarter', 'quarter']);
  // Y cada golpe cae sobre una línea de pulso aunque el tempo cambie.
  const beatTimes = change.beats.map((beat) => beat.t);
  for (const hit of autoDrums(change).filter((h) => h.t >= change.bars[2].t)) expect(beatTimes.some((t) => Math.abs(t - hit.t) < 1e-6)).toBe(true);
});

test('silencios y compases raros: callado donde no suena nada; un 21/32, solo la caja en el 1', () => {
  const chart = synthChart([
    { quarters: 4, bpm: 110, onsets: [] },
    { quarters: 4, bpm: 110 },
    { quarters: 4, bpm: 110, onsets: [] },
    { quarters: 21 / 8, bpm: 110, timeSig: [21, 32] },
  ]);
  expect(soundsOfBar(chart, 0)).toEqual([]);
  expect(soundsOfBar(chart, 1).length).toBe(8);
  expect(soundsOfBar(chart, 2)).toEqual([]);
  expect(soundsOfBar(chart, 3)).toEqual(['snare']);
});

test('sesión: con "Batería automática" programa esos golpes; con el metrónomo, sus clics', () => {
  const chart = fourBars(110);
  const clicks = (click: 'auto' | 'metronomo') => {
    const s = new RiffSession(chart, { speed: 1, mode: 'ritmo', loop: false, fromBar: 1, toBar: 4 }, 0, { click, muted: [] });
    return s.takeClicks(0, 60).slice(4).map((c) => c.sound);
  };
  expect(clicks('auto').slice(0, 4)).toEqual(['snare', 'kick', 'snare', 'kick']);
  expect(clicks('auto')).toHaveLength(32);
  expect(clicks('metronomo')).toHaveLength(16);
});

// Canciones reales sin batería: el ritmo elegido por tramo, para revisarlo a oído.
test('canciones reales sin batería: un ritmo razonable', () => {
  const expectations: Record<string, Array<string>> = {
    'cumpleanos-feliz.gp': ['eighth', 'sixteenth', 'quarter'],
    'let-it-be-verso.gp': ['eighth', 'sixteenth'],
    'feliz-navidad.gp': ['eighth', 'quarter', 'sixteenth'],
    'carol-of-the-bells.gp': ['quarter', 'triplet', 'eighth'],
  };
  for (const [file, allowed] of Object.entries(expectations)) {
    const score = at.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(fs.readFileSync(`public/tabs/${file}`)), new at.Settings());
    const chart = buildChart(at, score, listGuitarTracks(score)[0].index, 24);
    const plan = autoDrumPlan(chart);
    const used = [...new Set(plan.filter(Boolean))];
    console.log(file, `${Math.round(chart.bpm)} bpm`, chart.bars[0].timeSig?.join('/'), used.join(', '));
    expect(used.length).toBeGreaterThan(0);
    for (const rhythm of used) expect(allowed).toContain(rhythm);
    expect(autoDrums(chart).length).toBeGreaterThan(0);
  }
});
