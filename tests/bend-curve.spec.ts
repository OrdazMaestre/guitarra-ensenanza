import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import * as at from '@coderline/alphatab';
import { buildChart } from '../app/lib/riff/chart';
import { RiffSession } from '../app/lib/riff/session';
import {
  applyBend,
  BEND_FAST_SECONDS,
  BEND_MAX_CENTS,
  BEND_RAMP_CAP_SECONDS,
  bendAutomation,
  buildBendCurve,
  centsAt,
  type BendNoteLike,
} from '../app/lib/bendCurve';

// Curvas de bend (app/lib/bendCurve.ts): reglas de alphaTab 1.8.2 (offset 0..60, valor en cuartos
// de tono, estilos Gradual/Fast, prebend, extensión por ligaduras) + tope de 180 ms por subida y
// ±2 tonos (guitar-music-advisor). Ver "Bends y ligaduras" en AlphaTabPlayer.NOTES.md.

const T = { Custom: 1, Bend: 2, Release: 3, BendRelease: 4, Hold: 5, Prebend: 6, PrebendBend: 7, PrebendRelease: 8 };
const S = { Default: 0, Gradual: 1, Fast: 2 };
const dur1 = () => 1; // cada nota dura 1 unidad

const bend = (type: number, style: number, points: Array<[number, number]>, extra: Partial<BendNoteLike> = {}): BendNoteLike => ({
  bendType: type,
  bendStyle: style,
  bendPoints: points.map(([offset, value]) => ({ offset, value })),
  ...extra,
});

test('full = 4 cuartos de tono = +200 cents; nota sin bend = sin curva', () => {
  const curve = buildBendCurve(bend(T.Bend, S.Default, [[0, 0], [15, 4]]), dur1);
  const auto = bendAutomation(curve, 0.4); // nota de 0,4 s
  expect(auto[0]).toEqual({ t: 0, cents: 0 });
  expect(centsAt(auto, 0.4)).toBe(200);
  expect(buildBendCurve({ bendType: 0, bendPoints: [] }, dur1)).toBeNull();
  expect(bendAutomation(null, 1)).toEqual([]);
});

test('Default: puntos tal cual, proporcionales a la nota cuando la subida es corta', () => {
  // Subida de 0 a 15/60 de una nota de 0,4 s = 0,1 s (< 180 ms): sin tope.
  const auto = bendAutomation(buildBendCurve(bend(T.Bend, S.Default, [[0, 0], [15, 4], [60, 4]]), dur1), 0.4);
  expect(centsAt(auto, 0.05)).toBeCloseTo(100, 5);
  expect(centsAt(auto, 0.1)).toBeCloseTo(200, 5);
});

test('nota larga: la subida dura como mucho 180 ms y luego se mantiene', () => {
  // Gradual en una nota de 2 s: alphaTab subiría durante 2 s; nosotros en 0,18 s.
  const auto = bendAutomation(buildBendCurve(bend(T.Bend, S.Gradual, [[0, 0], [60, 4]]), dur1), 2);
  expect(centsAt(auto, BEND_RAMP_CAP_SECONDS)).toBeCloseTo(200, 5);
  expect(centsAt(auto, BEND_RAMP_CAP_SECONDS / 2)).toBeCloseTo(100, 5);
  expect(centsAt(auto, 1.5)).toBe(200);
  // A media velocidad el tope también se estira (práctica lenta = todo más lento).
  const slow = bendAutomation(buildBendCurve(bend(T.Bend, S.Gradual, [[0, 0], [60, 4]]), dur1), 2, 0.5);
  expect(centsAt(slow, BEND_RAMP_CAP_SECONDS)).toBeCloseTo(100, 5);
});

test('Gradual BendRelease = sube hasta la mitad y baja hasta el final', () => {
  const auto = bendAutomation(buildBendCurve(bend(T.BendRelease, S.Gradual, [[0, 0], [20, 2], [40, 2], [60, 0]]), dur1), 0.3);
  expect(centsAt(auto, 0.15)).toBeCloseTo(100, 5);
  expect(centsAt(auto, 0.3)).toBeCloseTo(0, 5);
});

test('Fast: el bend ocurre en los últimos 75 ms', () => {
  const auto = bendAutomation(buildBendCurve(bend(T.Bend, S.Fast, [[0, 0], [60, 4]]), dur1), 1);
  expect(centsAt(auto, 1 - BEND_FAST_SECONDS - 0.001)).toBe(0);
  expect(centsAt(auto, 1)).toBe(200);
});

test('Prebend: la nota ya suena doblada desde el ataque', () => {
  const auto = bendAutomation(buildBendCurve(bend(T.Prebend, S.Default, [[0, 4], [60, 4]]), dur1), 0.5);
  expect(auto[0]).toEqual({ t: 0, cents: 200 });
  const release = bendAutomation(buildBendCurve(bend(T.PrebendRelease, S.Default, [[0, 4], [30, 4], [60, 0]]), dur1), 0.5);
  expect(centsAt(release, 0)).toBe(200);
  expect(centsAt(release, 0.5)).toBe(0);
});

test('ligadura: la curva se estira por las notas ligadas sin bend; la continuación sigue desde arriba', () => {
  // Cabeza con bend de 0 a full en todo su recorrido + 1 nota ligada sin bend: la curva cubre 2 unidades.
  const tail: BendNoteLike = { bendType: 0 };
  const head = bend(T.Bend, S.Default, [[0, 0], [60, 4]], { isTieOrigin: true, tieDestination: tail });
  const curve = buildBendCurve(head, dur1)!;
  expect(curve.segments).toEqual([{ start: 0, dur: 2, points: [{ at: 0, cents: 0 }, { at: 1, cents: 200 }] }]);

  // Cabeza sin bend + ligada con su propio release (de full a 0): sin salto, empieza en la segunda unidad.
  const releaseTail = bend(T.Release, S.Default, [[0, 4], [60, 0]]);
  const holdHead: BendNoteLike = { bendType: 0, isTieOrigin: true, tieDestination: releaseTail };
  const auto = bendAutomation(buildBendCurve(holdHead, dur1), 0.1);
  expect(centsAt(auto, 0.05)).toBeCloseTo(0, 5);
  expect(centsAt(auto, 0.2)).toBeCloseTo(0, 5);

  // Bend en la cabeza y release propio en la ligada: la ligada parte de full, sin volver a 0.
  const head2 = bend(T.Bend, S.Default, [[0, 0], [60, 4]], { isTieOrigin: true, tieDestination: releaseTail });
  const auto2 = bendAutomation(buildBendCurve(head2, dur1), 0.1);
  expect(centsAt(auto2, 0.1)).toBe(200);
  expect(centsAt(auto2, 0.2)).toBeCloseTo(0, 5);
});

test('valores extremos se recortan a ±2 tonos; puntos desordenados se ordenan', () => {
  const auto = bendAutomation(buildBendCurve(bend(T.Custom, S.Default, [[60, 12], [0, 0]]), dur1), 0.1);
  expect(Math.max(...auto.map((p) => p.cents))).toBe(BEND_MAX_CENTS);
  for (let i = 1; i < auto.length; i++) expect(auto[i].t).toBeGreaterThanOrEqual(auto[i - 1].t);
});

test('applyBend: empieza a la altura del instante en que arranca el sonido y nunca lanza', () => {
  const calls: string[] = [];
  const param = {
    setValueAtTime: (v: number, t: number) => calls.push(`set ${v.toFixed(0)}@${t.toFixed(2)}`),
    linearRampToValueAtTime: (v: number, t: number) => calls.push(`ramp ${v.toFixed(0)}@${t.toFixed(2)}`),
  } as unknown as AudioParam;
  const auto = bendAutomation(buildBendCurve(bend(T.Bend, S.Gradual, [[0, 0], [60, 4]]), dur1), 0.1); // 0→200 en 0,1 s
  applyBend(param, 10, auto, 0.05); // el sonido empieza a mitad de la subida
  expect(calls[0]).toBe('set 100@10.00');
  expect(calls).toContain('ramp 200@10.05');

  const broken = { setValueAtTime: () => { throw new Error('x'); } } as unknown as AudioParam;
  expect(() => applyBend(broken, 0, auto)).not.toThrow();
});

// Archivo real: la Canción de prueba (Master of Puppets) es la única de public/tabs con bends
// (29, todos estilo Default; los "bend & release" traen 4 puntos: sube, mantiene, baja).
test('Riff-Hero: el chart lleva los bends reales (pista propia y banda), en segundos de canción', () => {
  const score = at.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(fs.readFileSync('public/tabs/prueba-master-of-puppets.gp')), new at.Settings());
  const kirk = score.tracks.findIndex((track) => /Kirk/.test(track.name));
  const chart = buildChart(at, score, kirk);
  const bent = chart.notes.filter((note) => note.bend);
  expect(bent.length).toBeGreaterThan(5);
  // Toda nota con curva estaba marcada como 'bend' y la curva cabe en su duración.
  for (const note of bent) {
    expect(note.tech).toContain('bend');
    for (const segment of note.bend!.segments) expect(segment.start + segment.dur).toBeLessThanOrEqual(note.dur + 1e-6);
  }
  // Algún bend "full" de verdad: llega a +200 cents.
  const peaks = bent.map((note) => Math.max(...bendAutomation(note.bend, 1).map((point) => point.cents)));
  expect(peaks).toContain(200);
  // Notas sin bend: sin la clave (los objetos no cambian de forma).
  expect(chart.notes.filter((note) => !note.bend).every((note) => !('bend' in note))).toBe(true);
  // La banda (James y el bajo) también lleva sus bends si los tiene, nunca curvas vacías.
  for (const note of chart.band ?? []) if (note.bend) expect(note.bend.segments.length).toBeGreaterThan(0);
});

test('Riff-Hero: las notas de fondo programadas llevan su curva (también a media velocidad)', () => {
  const score = at.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(fs.readFileSync('public/tabs/prueba-master-of-puppets.gp')), new at.Settings());
  const kirk = score.tracks.findIndex((track) => /Kirk/.test(track.name));
  const chart = buildChart(at, score, kirk);
  for (const speed of [1, 0.5]) {
    const session = new RiffSession(chart, { speed, mode: 'ritmo', loop: false, fromBar: 27, toBar: 29 }, 100, 'bateria');
    const scheduled: Array<{ duration: number; bend?: { automation: Array<{ t: number; cents: number }>; offset?: number } }> = [];
    for (let real = 100; real < 140 && session.status !== 'finished'; real += 0.025) {
      session.advance(real);
      scheduled.push(...session.takeGuideNotes(real, 0.3));
    }
    const bent = scheduled.filter((note) => note.bend);
    expect(bent.length).toBeGreaterThan(3);
    for (const note of bent) {
      const cents = note.bend!.automation.map((point) => point.cents);
      expect(Math.max(...cents.map(Math.abs))).toBeLessThanOrEqual(400);
      // La curva cabe en la duración REAL de la nota (ya dividida por la velocidad).
      expect(note.bend!.automation[note.bend!.automation.length - 1].t).toBeLessThanOrEqual(note.duration + 1e-6);
    }
    // Las que no doblan no llevan la clave.
    expect(scheduled.filter((note) => !note.bend).every((note) => !('bend' in note))).toBe(true);
  }
});
