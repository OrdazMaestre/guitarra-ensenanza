import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import * as at from '@coderline/alphatab';
import { autoDrumPlan, autoDrums, autoDrumSteps, riffStarts } from '../app/lib/riff/autoDrums';
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

const OFFBEATS = [0.25, 0.75, 1.25, 1.75, 2.25, 2.75, 3.25, 3.75];
const SHIFTED = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 0.25];
const OTHER = [0, 0.25, 1, 1.25, 2, 2.25, 3, 3.25];
const FIFTH = [0.125, 0.625, 1.125, 1.625, 2.125, 2.625, 3.125, 3.625];
const SIXTH = [0.375, 0.875, 1.375, 1.875, 2.375, 2.875, 3.375, 3.875];
const riffs = (bpm: number, sections: Array<[number[], number]>) => synthChart(sections.flatMap(([onsets, bars]) => Array.from({ length: bars }, () => ({ quarters: 4, bpm, onsets }))));

test('riffs: detecta el cambio, no un compás suelto, y un riff de varios compases sigue siendo uno', () => {
  expect(riffStarts(riffs(150, [[EIGHTHS, 4], [OFFBEATS, 4]])).starts).toEqual([0, 4]);
  // Un compás distinto suelto (relleno) no es un riff.
  expect(riffStarts(riffs(150, [[EIGHTHS, 4], [OFFBEATS, 1], [EIGHTHS, 4]])).starts).toEqual([0]);
  // Riff de 4 compases distintos, repetido.
  const four: Array<[number[], number]> = [[EIGHTHS, 1], [OFFBEATS, 1], [OTHER, 1], [SHIFTED, 1]];
  expect(riffStarts(riffs(150, [...four, ...four, ...four])).starts).toEqual([0]);
  // A, B, A: el tercero es el primero que vuelve.
  const back = riffStarts(riffs(150, [[EIGHTHS, 4], [OFFBEATS, 4], [EIGHTHS, 4]]));
  expect(back.starts).toEqual([0, 4, 8]);
  expect(back.labels).toEqual([0, 1, 0]);
});

test('escalones: suben con cada riff nuevo; el que vuelve recupera el suyo', () => {
  const steps = (chart: Chart) => autoDrumSteps(chart).steps;
  expect(steps(riffs(150, [[EIGHTHS, 4], [OFFBEATS, 4]]))).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
  expect(steps(riffs(150, [[EIGHTHS, 4], [OFFBEATS, 4], [EIGHTHS, 4]]))).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0]);
  // La escalera de 4 vuelve al principio con el quinto riff.
  const many = steps(riffs(150, [[EIGHTHS, 4], [OFFBEATS, 4], [OTHER, 4], [FIFTH, 4], [SIXTH, 4]]));
  expect([many[0], many[4], many[8], many[12], many[16]]).toEqual([0, 1, 2, 3, 0]);
  // Un riff largo: sube cada 16 compases, si quedan 4 o más.
  const long = (bars: number) => autoDrumSteps(riffs(150, [[EIGHTHS, bars]]));
  expect([...long(20).changes]).toEqual([16]);
  expect([...long(18).changes]).toEqual([]);
  // Con riffs cada poco, un riff que vuelve igual (A A) no cuenta como cambio.
  expect([...autoDrumSteps(riffs(150, [[EIGHTHS, 4], [OFFBEATS, 1], [EIGHTHS, 3]])).changes]).toEqual([]);
  // Cortas: sin cambios.
  expect([...long(8).changes]).toEqual([]);
});

test('escalones: dos riffs distintos seguidos nunca llevan la misma batería, y se oye un plato fuerte', () => {
  const chart = riffs(150, [[EIGHTHS, 4], [OFFBEATS, 4], [EIGHTHS, 4], [OFFBEATS, 4], [OTHER, 4]]);
  const { steps } = autoDrumSteps(chart);
  for (const bar of [4, 8, 12, 16]) expect(steps[bar]).not.toBe(steps[bar - 1]);
  const strong = autoDrums(chart).filter((hit) => hit.sound === 'cymbal' && hit.volume > 0.5).map((hit) => hit.t);
  expect(strong).toEqual([4, 8, 12, 16].map((bar) => chart.bars[bar].t));
  expect(autoDrums(chart)).toEqual(autoDrums(chart));
});

test('escalera de cada ritmo: blast, skank y corcheas', () => {
  const soundsAt = (chart: Chart, bar: number) => soundsOfBar(chart, bar).join(' ');
  // Skank a 150: normal, plato en cada negra, galope, y bombo, plato, caja, plato.
  const skank = riffs(150, [[EIGHTHS, 4], [OFFBEATS, 4], [OTHER, 4], [FIFTH, 4]]);
  expect(soundsOfBar(skank, 0).filter((sound) => sound === 'cymbal')).toHaveLength(0);
  expect(soundsOfBar(skank, 5).filter((sound) => sound === 'cymbal')).toHaveLength(4);
  // Galope: 3 golpes por negra, con la caja en los tiempos 2 y 4.
  expect(soundsOfBar(skank, 9)).toEqual(['kick', 'kick', 'kick', 'snare', 'kick', 'kick', 'kick', 'kick', 'kick', 'snare', 'kick', 'kick']);
  expect(soundsOfBar(skank, 13)).toHaveLength(16);
  expect(soundsAt(skank, 13).startsWith('kick cymbal snare cymbal')).toBe(true);
  // Más rápido que 180: sin semicorcheas, plato en cada corchea.
  const fast = riffs(200, [[EIGHTHS, 4], [OFFBEATS, 4], [OTHER, 4], [FIFTH, 4]]);
  expect(soundsOfBar(fast, 13).filter((sound) => sound !== 'cymbal')).toHaveLength(8);
  expect(soundsOfBar(fast, 13).filter((sound) => sound === 'cymbal')).toHaveLength(8);
  // Corcheas a 120: el tercer escalón son las semicorcheas del metrónomo.
  const mid = riffs(120, [[EIGHTHS, 4], [OFFBEATS, 4], [OTHER, 4]]);
  expect(soundsOfBar(mid, 0)).toHaveLength(8);
  expect(soundsOfBar(mid, 9)).toEqual(Array.from({ length: 4 }, () => ['snare', 'cymbal', 'kick', 'cymbal']).flat());
  // Blast: se alterna con el doble bombo y acaba en medio tiempo (skank con plato en cada negra).
  const moved = (by: number) => SIXTEENTHS.map((q) => q + by);
  const fourth = [0.75, 1.75, 2.75, 3.75, 0.875, 1.875, 2.875, 3.875, 0.625, 1.625];
  const blast = riffs(220, [[SIXTEENTHS, 4], [moved(0.125), 4], [moved(1 / 24), 4], [fourth, 4]]);
  expect(autoDrumPlan(blast).every((rhythm) => rhythm === 'blast')).toBe(true);
  const doubleKick = soundsOfBar(blast, 5).filter((sound) => sound !== 'cymbal');
  expect(doubleKick).toEqual(Array.from({ length: 16 }, (_, k) => (k === 4 || k === 12 ? 'snare' : 'kick')));
  expect(soundsOfBar(blast, 5).filter((sound) => sound === 'cymbal')).toHaveLength(4);
  // Tercer escalón: blast de nuevo, con plato en cada bombo.
  expect(soundsOfBar(blast, 9).filter((sound) => sound === 'snare')).toHaveLength(8);
  expect(soundsOfBar(blast, 9).filter((sound) => sound === 'cymbal')).toHaveLength(8);
  expect(soundsOfBar(blast, 13).filter((sound) => sound !== 'cymbal')).toHaveLength(8);
  // Los bombos del doble bombo van más suaves que la caja.
  const inBar = autoDrums(blast).filter((hit) => hit.t >= blast.bars[5].t - 1e-6 && hit.t < blast.bars[5].end - 1e-6);
  expect(Math.max(...inBar.filter((hit) => hit.sound === 'kick').map((hit) => hit.volume))).toBeLessThan(Math.min(...inBar.filter((hit) => hit.sound === 'snare').map((hit) => hit.volume)));
});

test('el galope no pasa de 12 golpes por segundo a 240 bpm', () => {
  const chart = riffs(240, [[EIGHTHS, 4], [OFFBEATS, 4], [OTHER, 4]]);
  const bar = chart.bars[9];
  const instants = new Set(autoDrums(chart).filter((hit) => hit.t >= bar.t - 1e-6 && hit.t < bar.end - 1e-6).map((hit) => hit.t.toFixed(4)));
  expect(instants.size / (bar.end - bar.t)).toBeLessThanOrEqual(12);
});

test('una melodía en fusas no se confunde con tresillos', () => {
  expect(autoDrumPlan(fourBars(120, [0.125, 0.375, 0.625, 0.875, 1.125, 1.375, 1.625, 1.875, 2.625, 3.625]))[0]).toBe('eighth');
});

test('7/8: sin escalera en el patrón, solo plato en el 1', () => {
  const bars = (onsets: number[], count: number) => Array.from({ length: count }, () => ({ quarters: 3.5, bpm: 120, timeSig: [7, 8] as [number, number], onsets }));
  const chart = synthChart([...bars([0, 0.5, 1, 1.5, 2, 2.5, 3], 4), ...bars([0.25, 0.75, 1.25, 1.75, 2.25, 2.75, 3.25], 4)]);
  expect(autoDrumSteps(chart).steps[4]).toBe(1);
  expect(soundsOfBar(chart, 5).filter((sound) => sound !== 'cymbal')).toHaveLength(7);
  expect(soundsOfBar(chart, 5).filter((sound) => sound === 'cymbal')).toHaveLength(1);
});

test('4/4 a 110: corcheas, caja/bombo', () => {
  const chart = fourBars(110);
  expect(autoDrumPlan(chart)[0]).toBe('eighth');
  expect(soundsOfBar(chart, 0)).toEqual(['snare', 'kick', 'snare', 'kick', 'snare', 'kick', 'snare', 'kick']);
});

test('4/4 rápido con música densa: blast, 16 golpes por compás, empieza por bombo, con plato en cada negra', () => {
  const chart = fourBars(220, SIXTEENTHS);
  expect(autoDrumPlan(chart)[0]).toBe('blast');
  expect(soundsOfBar(chart, 0).filter((sound) => sound !== 'cymbal')).toEqual(Array.from({ length: 16 }, (_, k) => (k % 2 === 0 ? 'kick' : 'snare')));
  // Plato a la vez que el bombo, en cada negra.
  const barHits = autoDrums(chart).filter((hit) => hit.t < chart.bars[0].end - 1e-6);
  const cymbals = barHits.filter((hit) => hit.sound === 'cymbal');
  expect(cymbals).toHaveLength(4);
  cymbals.forEach((cymbal, k) => {
    expect(cymbal.t).toBeCloseTo(chart.beats[k].t, 6);
    expect(barHits.some((hit) => hit.sound === 'kick' && Math.abs(hit.t - cymbal.t) < 1e-6)).toBe(true);
  });
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
