import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import * as at from '@coderline/alphatab';
import { buildChart, listPlayableTracks, type Chart } from '../app/lib/riff/chart';
import { CRASH, DRUM_LEVEL_RULES, HIGH_TOM, HIHAT, KICK, LOW_TOM, padOfMidi, reduceDrums, SNARE, spreadCymbals, threePad } from '../app/lib/riff/drums';
import { drumVolume, RiffSession } from '../app/lib/riff/session';

// BATERÍA JUGABLE (app/lib/riff/drums.ts, usuario 2026-11-16).

const loadSong = (file: string) => at.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(fs.readFileSync(`public/tabs/${file}`)), new at.Settings());
function drumChart(file = 'prueba-master-of-puppets.gp'): Chart {
  const score = loadSong(file);
  const drums = listPlayableTracks(score).find((track) => track.kind === 'drums')!;
  return buildChart(at, score, drums.index);
}
const onsets = (chart: Chart) => {
  const by = new Map<number, number[]>();
  for (const note of chart.notes) by.set(Math.round(note.t * 1000), [...(by.get(Math.round(note.t * 1000)) ?? []), note.fret]);
  return [...by.values()];
};

test('traducción General MIDI: 6 pads (platos repartidos) y 3 pads (toms a bombo y caja, platos al plato)', () => {
  expect([35, 36].map(padOfMidi)).toEqual([KICK, KICK]);
  expect([37, 38, 40].map(padOfMidi)).toEqual([SNARE, SNARE, SNARE]);
  expect([41, 43, 45].map(padOfMidi)).toEqual([LOW_TOM, LOW_TOM, LOW_TOM]);
  expect([47, 48, 50].map(padOfMidi)).toEqual([HIGH_TOM, HIGH_TOM, HIGH_TOM]);
  // Acentos (crash, china, splash) al plato fuerte; lo que marca el tiempo -- hihat cerrado, de pedal y
  // ABIERTO (usuario, 2026-11-16), ride y campana -- al plato normal.
  expect([49, 52, 55, 57].map(padOfMidi)).toEqual([CRASH, CRASH, CRASH, CRASH]);
  expect([42, 44, 46, 51, 53, 59].map(padOfMidi)).toEqual([HIHAT, HIHAT, HIHAT, HIHAT, HIHAT, HIHAT]);
  expect([CRASH, LOW_TOM, KICK, SNARE, HIGH_TOM, HIHAT].map(threePad)).toEqual([HIHAT, KICK, KICK, SNARE, SNARE, HIHAT]);
});

test('la batería se puede tocar: es la última pista de "Tocas" y deja de sonar de fondo', () => {
  const score = loadSong('prueba-master-of-puppets.gp');
  const tracks = listPlayableTracks(score);
  expect(tracks[tracks.length - 1].kind).toBe('drums');
  expect(tracks[0].kind).toBe('guitar');
  const chart = drumChart();
  expect(chart.kit).toBe('drums');
  expect(chart.drums).toHaveLength(0);
  expect(chart.bandTracks!.some((track) => track.kind === 'drums')).toBe(false);
  expect(chart.band!.length).toBeGreaterThan(0);
  expect(chart.notes.every((note) => note.string === 6 && note.fret >= 0 && note.fret <= 5)).toBe(true);
  // Las guitarras siguen teniendo la batería de fondo.
  expect(buildChart(at, score, tracks[0].index).drums.length).toBeGreaterThan(0);
});

for (const file of ['prueba-master-of-puppets.gp', 'iron-rain.gp', 'electric-warlock.gp', 'black-gilmur.gp']) {
  test(`niveles de batería (${file}): sus pads, su límite de golpes a la vez y ningún golpe perdido`, () => {
    const real = drumChart(file);
    for (const [name, rule] of Object.entries(DRUM_LEVEL_RULES)) {
      const level = reduceDrums(real, rule);
      expect(level.notes.every((note) => rule.pads.includes(note.fret as never)), name).toBe(true);
      expect(Math.max(...onsets(level).map((pads) => pads.length)), name).toBeLessThanOrEqual(rule.maxHits);
      // Cada golpe real de un pad del nivel (traducido) tiene su nota, salvo si el límite lo quita.
      const realOnsets = onsets(real).map((pads) => [...new Set(pads.map((pad) => rule.map(pad as never)).filter((pad) => pad !== null))]);
      const expected = realOnsets.reduce((sum, pads) => sum + Math.min(rule.maxHits, pads.length), 0);
      expect(level.notes.length, name).toBe(expected);
      // Dueñas: cada nota es dueña de golpes reales de su pad, y lo real sigue sonando (sourceNotes).
      expect(level.sourceNotes).toBe(real.notes);
      for (const note of level.notes) {
        for (const id of note.sourceIds!) expect(rule.map(real.notes[id].fret as never)).toBe(note.fret);
      }
    }
    // Difícil: la tab tal cual en los golpes de 1 o 2 pads; los de 3 o más, de 2 en 2 (usuario, 2026-11-16).
    const small = new Set(onsets(real).flatMap((pads, k) => (pads.length <= 2 ? [k] : [])));
    const keyOf = (c: Chart) => onsets(c).map((pads) => [...pads].sort().join('+'));
    const realKeys = keyOf(real);
    const hardKeys = keyOf(reduceDrums(real, DRUM_LEVEL_RULES.dificil));
    expect(hardKeys.filter((_, k) => small.has(k))).toEqual(realKeys.filter((_, k) => small.has(k)));
    console.log(`${file}: golpes de 3 o más pads en la tab: ${realKeys.length - small.size}`);
  });
}

test('Difícil, como mucho 2: el bombo siempre y la mano más importante (plato fuerte > caja > toms > plato)', () => {
  const chord = (...frets: number[]) => ({ trackName: 'x', bpm: 120, duration: 4, notes: frets.map((fret, id) => ({ id, t: 1, dur: 0.1, string: 6, fret, midi: 0, palmMute: false, tech: [] })), bars: [{ number: 1, t: 0, end: 2 }], beats: [], drums: [], kit: 'drums' as const, movedAboveMaxFret: 0, skippedAboveMaxFret: 0 });
  const hard = (...frets: number[]) => reduceDrums(chord(...frets), DRUM_LEVEL_RULES.dificil).notes.map((n) => n.fret).sort();
  expect(hard(KICK, SNARE, HIHAT)).toEqual([KICK, SNARE].sort());
  expect(hard(KICK, CRASH, HIHAT)).toEqual([KICK, CRASH].sort());
  expect(hard(SNARE, CRASH, HIHAT)).toEqual([SNARE, CRASH].sort());
  expect(hard(KICK, SNARE, HIGH_TOM, HIHAT)).toEqual([KICK, SNARE].sort());
  expect(hard(HIGH_TOM, LOW_TOM, HIHAT)).toEqual([HIGH_TOM, LOW_TOM].sort());
});

test('golpes a la vez: Fácil se queda con la caja; Medio, con bombo y caja antes que el plato', () => {
  const note = (id: number, fret: number) => ({ id, t: 1, dur: 0.1, string: 6, fret, midi: 0, palmMute: false, tech: [] });
  const chart = { trackName: 'x', bpm: 120, duration: 4, notes: [note(0, KICK), note(1, SNARE), note(2, HIHAT)], bars: [{ number: 1, t: 0, end: 2 }], beats: [], drums: [], kit: 'drums' as const, movedAboveMaxFret: 0, skippedAboveMaxFret: 0 };
  expect(reduceDrums(chart, DRUM_LEVEL_RULES.facil).notes.map((n) => n.fret)).toEqual([SNARE]);
  expect(reduceDrums(chart, DRUM_LEVEL_RULES.medio).notes.map((n) => n.fret)).toEqual([KICK, SNARE]);
  // Avanzado, de momento como Medio (máximo 2).
  expect(reduceDrums(chart, DRUM_LEVEL_RULES.avanzado).notes.map((n) => n.fret)).toEqual([KICK, SNARE]);
});

test('sesión: dos pads a la vez son dos aciertos, sin puntos de "pad cercano", y el golpe suena al tocarlo', () => {
  const real = drumChart();
  const chart = reduceDrums(real, DRUM_LEVEL_RULES.avanzado);
  const chord = onsets(chart).findIndex((pads) => pads.length >= 2);
  const t = [...new Set(chart.notes.map((n) => n.t))][chord];
  const notes = chart.notes.filter((n) => Math.abs(n.t - t) < 0.001);
  const session = new RiffSession(chart, { speed: 1, mode: 'ritmo', loop: false, fromBar: 1, toBar: 999, freeStrings: true }, 0, { click: 'nada', muted: [] });
  expect(session.drums).toBe(true);
  // El reloj hasta el golpe (cuenta de entrada incluida).
  session.advance(0);
  const clockAt = (songT: number) => songT - session.songPos;
  const now = clockAt(t);
  const results = notes.map((note) => session.judge({ string: 6, fret: note.fret, kind: 'pluck' }, now));
  expect(results.every((r) => r.hit)).toBe(true);
  // Suena YA: el golpe real del pad acertado.
  expect(results[0].playNow.length).toBeGreaterThan(0);
  // ...con el sonido REAL de la tab (un tom suena a tom aunque en Avanzado se toque en el bombo).
  expect(DRUM_LEVEL_RULES.avanzado.map(results[0].playNow[0].pad as never)).toBe(notes[0].fret);
  // Un pad al lado no puntúa (en la batería no hay "casi").
  const other = chart.notes.find((n) => n.t > t + 1)!;
  const near = session.judge({ string: 6, fret: other.fret === 5 ? 4 : other.fret + 1, kind: 'pluck' }, clockAt(other.t));
  expect(near.hit).toBeNull();
  expect(session.scoreOf.has(other.id)).toBe(false);
});

test('sesión: los golpes de pads que el nivel no toca suenan de fondo a volumen normal; los acertados no se repiten', () => {
  const real = drumChart('iron-rain.gp');
  const chart = reduceDrums(real, DRUM_LEVEL_RULES.facil);
  const session = new RiffSession(chart, { speed: 1, mode: 'ritmo', loop: false, fromBar: 1, toBar: 999, freeStrings: true }, 0, { click: 'nada', muted: [] });
  session.advance(0);
  const first = chart.notes[0];
  const now = first.t - session.songPos;
  expect(session.judge({ string: 6, fret: first.fret, kind: 'pluck' }, now - 0.02).hit?.id).toBe(first.id);
  const guide = session.takeGuideNotes(now - 0.02, 4);
  // El plato no está en Fácil: suena "abierto" (como la banda), con su pad.
  const hats = guide.filter((note) => note.pad === HIHAT);
  expect(hats.length).toBeGreaterThan(0);
  expect(hats.every((note) => note.open)).toBe(true);
  // El golpe ya acertado no se vuelve a programar.
  expect(guide.some((note) => first.sourceIds!.includes(note.id))).toBe(false);
});

test('sesión: mantener un pad cuenta los golpes repetidos; el slide solo vale a la columna vecina', () => {
  const real = drumChart('iron-rain.gp');
  const chart = reduceDrums(real, DRUM_LEVEL_RULES.medio);
  // Dos golpes seguidos del plato sin nada en medio.
  const index = chart.notes.findIndex((note, k) => note.fret === HIHAT && chart.notes[k + 1]?.fret === HIHAT && chart.notes[k + 1].t > note.t + 0.05);
  expect(index).toBeGreaterThanOrEqual(0);
  const [a, b] = [chart.notes[index], chart.notes[index + 1]];
  const session = new RiffSession(chart, { speed: 1, mode: 'ritmo', loop: false, fromBar: 1, toBar: 999, freeStrings: true }, 0, { click: 'nada', muted: [] });
  session.advance(0);
  const offset = -session.songPos;
  expect(session.judge({ string: 6, fret: HIHAT, kind: 'pluck' }, a.t + offset).hit?.id).toBe(a.id);
  session.advance(b.t + offset + 0.01);
  expect(session.autoHold([{ string: 6, fret: HIHAT }]).map((n) => n.id)).toContain(b.id);
  // Slide: de la caja (3) al plato (5) no es vecino -> no cuenta.
  const later = chart.notes.find((n) => n.t > b.t + 1 && n.fret === HIHAT)!;
  expect(session.judge({ string: 6, fret: HIHAT, kind: 'slide', from: { string: 6, fret: SNARE } }, later.t + offset).hit).toBeNull();
});

test('platos: un crash seguido (menos de 0,4 s) marca el tiempo y va al plato Z; el plato Z predomina', () => {
  const notes = [0, 0.25, 0.5, 2, 4.3].map((t) => ({ t, fret: CRASH as number }));
  spreadCymbals(notes);
  expect(notes.map((n) => n.fret)).toEqual([CRASH, HIHAT, HIHAT, CRASH, CRASH]);
  for (const file of ['prueba-master-of-puppets.gp', 'iron-rain.gp', 'electric-warlock.gp', 'black-gilmur.gp']) {
    const chart = drumChart(file);
    const z = chart.notes.filter((n) => n.fret === HIHAT).length;
    const n = chart.notes.filter((note) => note.fret === CRASH).length;
    console.log(`${file}: plato Z ${z}, plato fuerte N ${n}`);
    expect(z, file).toBeGreaterThan(n * 3);
  }
});

// Mantener en carriles independientes (usuario, 2026-11-16): varios pads a la vez, cada carril con su
// propio límite de 0,5 s reales entre una nota y la siguiente del MISMO carril.
function laneChart(spec: Array<[number, number]>): Chart {
  const notes = spec.map(([t, fret], id) => ({ id, t, dur: 0.05, string: 6, fret, midi: 0, palmMute: false, tech: [] }));
  return { trackName: 'x', bpm: 120, duration: 20, notes, bars: Array.from({ length: 10 }, (_, b) => ({ number: b + 1, t: b * 2, end: b * 2 + 2 })), beats: [], drums: [], kit: 'drums' as const, movedAboveMaxFret: 0, skippedAboveMaxFret: 0 };
}
function laneSession(chart: Chart, speed = 1) {
  const session = new RiffSession(chart, { speed, mode: 'ritmo', loop: false, fromBar: 1, toBar: 10, freeStrings: true }, 0, { click: 'nada', muted: [] });
  session.advance(0);
  const offset = -session.songPos / speed;
  return { session, at: (t: number) => t / speed + offset };
}
function holdFor(session: RiffSession, at: (t: number) => number, held: { string: number; fret: number }[], from: number, to: number) {
  const counted: number[] = [];
  for (let t = from; t <= to; t += 0.01) {
    session.advance(at(t));
    counted.push(...session.autoHold(held).map((note) => note.id));
  }
  return counted.sort((a, b) => a - b);
}

test('mantener: dos carriles a la vez cuentan los dos, aunque haya notas de otro carril en medio', () => {
  // Plato en corcheas, bombo cada 0,4 s y una caja suelta en medio.
  const chart = laneChart([[2, HIHAT], [2, KICK], [2.25, HIHAT], [2.3, SNARE], [2.4, KICK], [2.5, HIHAT], [2.75, HIHAT], [2.8, KICK]]);
  const { session, at } = laneSession(chart);
  expect(session.judge({ string: 6, fret: HIHAT, kind: 'pluck' }, at(2)).hit?.id).toBe(0);
  expect(session.judge({ string: 6, fret: KICK, kind: 'pluck' }, at(2)).hit?.id).toBe(1);
  // Todas las del plato y del bombo; la caja no (no estaba pulsada).
  expect(holdFor(session, at, [{ string: 6, fret: HIHAT }, { string: 6, fret: KICK }], 2, 2.85)).toEqual([2, 4, 5, 6, 7]);
});

test('mantener: a más de 0,5 s ese carril deja de valer (hay que volver a pulsar); el otro sigue', () => {
  // Plato: 2, 2.4 y luego 3.0 (0,6 s: se corta) y 3.2. Bombo cada 0,3 s.
  const chart = laneChart([[2, HIHAT], [2, KICK], [2.3, KICK], [2.4, HIHAT], [2.6, KICK], [2.9, KICK], [3.0, HIHAT], [3.2, HIHAT], [3.2, KICK]]);
  const { session, at } = laneSession(chart);
  session.judge({ string: 6, fret: HIHAT, kind: 'pluck' }, at(2));
  session.judge({ string: 6, fret: KICK, kind: 'pluck' }, at(2));
  // Plato: solo 2.4 (id 3); 3.0 y 3.2 no. Bombo: todas (2, 4, 5, 8).
  expect(holdFor(session, at, [{ string: 6, fret: HIHAT }, { string: 6, fret: KICK }], 2, 3.25)).toEqual([2, 3, 4, 5, 8]);
});

test('mantener: el límite de 0,5 s es en segundos REALES (a media velocidad, 0,3 s de canción = 0,6 s reales)', () => {
  const chart = laneChart([[2, HIHAT], [2.2, HIHAT], [2.5, HIHAT]]);
  const { session, at } = laneSession(chart, 0.5);
  session.judge({ string: 6, fret: HIHAT, kind: 'pluck' }, at(2));
  // 0,2 de canción = 0,4 s reales: cuenta; 0,3 = 0,6 s reales: no.
  expect(holdFor(session, at, [{ string: 6, fret: HIHAT }], 2, 2.6)).toEqual([1]);
});

test('fondo: los golpes de pads que el nivel no toca suenan a la mitad; el bombo lleva su refuerzo', () => {
  const real = drumChart('iron-rain.gp');
  const chart = reduceDrums(real, DRUM_LEVEL_RULES.facil);
  const session = new RiffSession(chart, { speed: 1, mode: 'ritmo', loop: false, fromBar: 1, toBar: 999, freeStrings: true }, 0, { click: 'nada', muted: [] });
  session.advance(0);
  const guide = session.takeGuideNotes(chart.notes[0].t - session.songPos, 4);
  // En Fácil, el plato no se toca: de fondo y marcado `unplayed`; bombo y caja, no.
  expect(guide.filter((n) => n.pad === HIHAT).every((n) => n.unplayed)).toBe(true);
  expect(guide.filter((n) => n.pad === KICK || n.pad === SNARE).some((n) => n.unplayed)).toBe(false);
  expect(drumVolume(HIHAT, true, true)).toBeCloseTo(drumVolume(HIHAT, true) / 2, 6);
  expect(drumVolume(KICK, true)).toBeGreaterThan(drumVolume(SNARE, true));
});

// Fantasma de la batería (usuario, 2026-11-16): una nota fallada o que pasa sin tocar tiñe de gris su pieza un
// instante; la autopista pinta la superficie que da `drumSurfaceShapes` (los dos bombos con la X).
test('fantasma: superficies de cada pieza dentro de su columna (los bombos, dos)', async () => {
  const { drumSurfaceShapes } = await import('../app/components/guitar/riff/DrumKitNeck');
  const g = { cx: (pad: number) => 64 + pad * 128, colWidth: 128, left: 0, right: 768, top: 28, height: 158, hitY: 107, touch: false };
  expect(drumSurfaceShapes(g, KICK).ellipses).toHaveLength(2);
  for (const pad of [HIHAT, SNARE, HIGH_TOM, LOW_TOM, CRASH]) {
    const [e] = drumSurfaceShapes(g, pad).ellipses;
    expect(Math.abs(e.x - g.cx(pad))).toBeLessThan(1);
    expect(e.rx).toBeLessThanOrEqual(g.colWidth / 2);
    expect(e.y).toBeGreaterThan(g.top);
    expect(e.y).toBeLessThan(g.hitY);
  }
});
