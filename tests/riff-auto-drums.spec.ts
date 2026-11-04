import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import * as at from '@coderline/alphatab';
import { autoDrumPlan, autoDrums } from '../app/lib/riff/autoDrums';
import { buildChart, listGuitarTracks, type Chart, type ChartNote } from '../app/lib/riff/chart';
import { RiffSession } from '../app/lib/riff/session';

// Batería automática (app/lib/riff/autoDrums.ts): el ritmo sale del tempo, el compás y lo que toca la
// música (d = ataques distintos por negra). Binario: >140 blast si d ≥ 2,25, si no skank; 100-140
// corcheas; <100 semicorcheas si d ≥ 2,25, si no corcheas. Ternario: tresillos. Nunca negras de caja.

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

const EIGHTHS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5];
const SIXTEENTHS = [0, 0.25, 0.5, 1, 1.25, 1.5, 2, 2.25, 2.5, 3];

test('4/4 rápido sin semicorcheas: skank, bombo en el pulso y caja a contratiempo', () => {
  for (const onsets of [[0, 1, 2, 3], EIGHTHS]) {
    const chart = fourBars(150, onsets);
    expect(autoDrumPlan(chart)).toEqual(['skank', 'skank', 'skank', 'skank']);
    expect(soundsOfBar(chart, 0)).toEqual(['kick', 'snare', 'kick', 'snare', 'kick', 'snare', 'kick', 'snare']);
  }
  // Los bombos, sobre cada pulso.
  const chart = fourBars(150);
  const kicks = autoDrums(chart).filter((hit) => hit.sound === 'kick').slice(0, 4).map((hit) => hit.t);
  kicks.forEach((value, k) => expect(value).toBeCloseTo(chart.beats[k].t, 6));
});

test('4/4 a 110: corcheas, caja/bombo', () => {
  const chart = fourBars(110);
  expect(autoDrumPlan(chart)[0]).toBe('eighth');
  expect(soundsOfBar(chart, 0)).toEqual(['snare', 'kick', 'snare', 'kick', 'snare', 'kick', 'snare', 'kick']);
});

test('4/4 rápido con música densa: blast, 16 golpes por compás, empieza por bombo', () => {
  const chart = fourBars(220, SIXTEENTHS);
  expect(autoDrumPlan(chart)[0]).toBe('blast');
  expect(soundsOfBar(chart, 0)).toEqual(Array.from({ length: 16 }, (_, k) => (k % 2 === 0 ? 'kick' : 'snare')));
  expect(autoDrumPlan(fourBars(141, SIXTEENTHS))[0]).toBe('blast');
  expect(autoDrumPlan(fourBars(260, SIXTEENTHS))[0]).toBe('blast');
  // Hasta 140 incluidos, corcheas, también con música densa.
  expect(autoDrumPlan(fourBars(140, SIXTEENTHS))[0]).toBe('eighth');
  expect(autoDrumPlan(fourBars(140))[0]).toBe('eighth');
});

test('un acorde o un unísono cuentan como un solo ataque', () => {
  const chart = fourBars(200, EIGHTHS);
  chart.notes = chart.notes.flatMap((note) => [note, { ...note, id: note.id + 1000, string: 5 }, { ...note, id: note.id + 2000, string: 4 }]);
  expect(autoDrumPlan(chart)[0]).toBe('skank');
});

test('4/4 lento (<100) con música densa: semicorcheas, caja, plato, bombo, plato', () => {
  const chart = fourBars(80, SIXTEENTHS);
  expect(autoDrumPlan(chart)[0]).toBe('sixteenth');
  expect(soundsOfBar(chart, 0).slice(0, 4)).toEqual(['snare', 'cymbal', 'kick', 'cymbal']);
  expect(soundsOfBar(chart, 0)).toHaveLength(16);
});

test('4/4 lento con música escasa: corcheas; a 100 exactos, nunca semicorcheas', () => {
  expect(autoDrumPlan(fourBars(80))[0]).toBe('eighth');
  expect(autoDrumPlan(fourBars(100, SIXTEENTHS))[0]).toBe('eighth');
});

test('6/8 a 100: tresillos sobre sus corcheas, bombo en cada negra con puntillo', () => {
  const chart = synthChart(Array.from({ length: 4 }, () => ({ quarters: 3, bpm: 100, timeSig: [6, 8] as [number, number] })));
  expect(autoDrumPlan(chart)[0]).toBe('triplet');
  expect(soundsOfBar(chart, 0)).toEqual(['kick', 'snare', 'snare', 'kick', 'snare', 'snare']);
});

test('12/8 rápido: tresillos a cualquier tempo', () => {
  const bars = (bpm: number) => synthChart(Array.from({ length: 4 }, () => ({ quarters: 6, bpm, timeSig: [12, 8] as [number, number] })));
  expect(autoDrumPlan(bars(150))[0]).toBe('triplet');
  expect(autoDrumPlan(bars(250))[0]).toBe('triplet');
});

test('melodía en tresillos: tresillos a cualquier tempo', () => {
  const triplets = [0, 1 / 3, 2 / 3, 1, 4 / 3, 5 / 3, 2, 7 / 3, 8 / 3, 3];
  const slow = fourBars(100, triplets);
  expect(autoDrumPlan(slow)[0]).toBe('triplet');
  expect(soundsOfBar(slow, 0)).toHaveLength(12);
  expect(autoDrumPlan(fourBars(200, triplets))[0]).toBe('triplet');
  // Un 3/4 binario (Cumpleaños feliz) no es ternario: corcheas a 110.
  expect(autoDrumPlan(synthChart(Array.from({ length: 4 }, () => ({ quarters: 3, bpm: 110, onsets: [0, 1, 2] }))))[0]).toBe('eighth');
});

test('sin parpadeos: dentro de una franja de tempo, el ritmo cambia solo si gana 2 tramos seguidos', () => {
  const at150 = (onsets: number[][]) => synthChart(onsets.map((list) => ({ quarters: 4, bpm: 150, onsets: list })));
  // Un solo tramo escaso entre densos: sigue el blast.
  expect(autoDrumPlan(at150([SIXTEENTHS, SIXTEENTHS, EIGHTHS, EIGHTHS, SIXTEENTHS, SIXTEENTHS]))).toEqual(Array(6).fill('blast'));
  // Dos tramos escasos seguidos: cambia, desde el primero de ellos.
  expect(autoDrumPlan(at150([SIXTEENTHS, SIXTEENTHS, EIGHTHS, EIGHTHS, EIGHTHS, EIGHTHS]))).toEqual(['blast', 'blast', 'skank', 'skank', 'skank', 'skank']);
});

test('salto de franja de tempo: el ritmo cambia en ese mismo tramo', () => {
  // Un solo tramo a 150 entre dos a 110: el tempo cambia de verdad, y el ritmo con él.
  const blip = synthChart([110, 110, 150, 150, 110, 110].map((bpm) => ({ quarters: 4, bpm, onsets: [0, 1, 2, 3] })));
  expect(autoDrumPlan(blip)).toEqual(['eighth', 'eighth', 'skank', 'skank', 'eighth', 'eighth']);
  // De 108 a 225 con la densidad alternando (Fall From Grace): skank, nunca las corcheas de antes.
  const alternating = synthChart([
    { quarters: 4, bpm: 108, onsets: EIGHTHS },
    { quarters: 4, bpm: 108, onsets: EIGHTHS },
    ...[SIXTEENTHS, SIXTEENTHS, EIGHTHS, EIGHTHS, SIXTEENTHS, SIXTEENTHS].map((onsets) => ({ quarters: 4, bpm: 225, onsets })),
  ]);
  expect(autoDrumPlan(alternating)).toEqual(['eighth', 'eighth', ...Array(6).fill('skank')]);
  // Sin duda entre blast y skank, el ritmo del tramo.
  const dense = synthChart([108, 108, 225, 225, 225, 225].map((bpm) => ({ quarters: 4, bpm, onsets: SIXTEENTHS })));
  expect(autoDrumPlan(dense).slice(2)).toEqual(Array(4).fill('blast'));
  // 4 compases a 150 (dos tramos): cambia, desde el primero de ellos.
  const change = synthChart([110, 110, 150, 150, 150, 150].map((bpm) => ({ quarters: 4, bpm, onsets: [0, 1, 2, 3] })));
  expect(autoDrumPlan(change)).toEqual(['eighth', 'eighth', 'skank', 'skank', 'skank', 'skank']);
  // Y cada bombo cae sobre una línea de pulso aunque el tempo cambie.
  const beatTimes = change.beats.map((beat) => beat.t);
  for (const hit of autoDrums(change).filter((h) => h.t >= change.bars[2].t && h.sound === 'kick')) expect(beatTimes.some((t) => Math.abs(t - hit.t) < 1e-6)).toBe(true);
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

// Canción CON batería (petición del usuario, 2026-11-04): silenciando la real en "Pistas", la automática
// la sustituye; sin silenciarla suenan las dos. Un compás de batería sola no se queda mudo.
test('canción con batería: la automática sustituye a la real silenciada, o suena con ella', () => {
  const plain = synthChart([{ quarters: 4, bpm: 110 }, { quarters: 4, bpm: 110, onsets: [] }]);
  const bar2 = plain.bars[1].t;
  const chart: Chart = {
    ...plain,
    notes: plain.notes.filter((note) => note.t < bar2),
    drums: [{ t: 0, sound: 'cymbal' }, { t: bar2, sound: 'cymbal' }],
    bandTracks: [{ index: 3, name: 'Drums', kind: 'drums' }],
  };
  expect(autoDrumPlan(plain)[1]).toBeNull();
  expect(autoDrumPlan(chart)[1]).not.toBeNull();
  const sounds = (muted: number[]) => {
    const s = new RiffSession(chart, { speed: 1, mode: 'ritmo', loop: false, fromBar: 1, toBar: 2 }, 0, { click: 'auto', muted });
    return s.takeClicks(0, 60).slice(4).map((c) => c.sound);
  };
  expect(sounds([3])).not.toContain('cymbal');
  expect(sounds([3]).length).toBeGreaterThan(8);
  expect(sounds([]).filter((sound) => sound === 'cymbal')).toHaveLength(2);
  expect(sounds([]).length).toBe(sounds([3]).length + 2);
});

// Canciones reales sin batería: el ritmo elegido por tramo, para revisarlo a oído.
test('canciones reales sin batería: un ritmo razonable', () => {
  const expectations: Record<string, Array<string>> = {
    'cumpleanos-feliz.gp': ['eighth', 'sixteenth'],
    'let-it-be-verso.gp': ['eighth', 'sixteenth'],
    'feliz-navidad.gp': ['eighth', 'sixteenth'],
    'carol-of-the-bells.gp': ['triplet', 'eighth'],
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
