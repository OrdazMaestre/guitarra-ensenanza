import { test, expect } from '@playwright/test';
import * as at from '@coderline/alphatab';
import { buildChart, gameStrings, isBassTuning, listGuitarTracks, listPlayableTracks } from '../app/lib/riff/chart';
import { laneRows } from '../app/lib/riff/lanes';
import { RIFF_LEVELS } from '../app/lib/riff/levels';
import { reduceChart } from '../app/lib/riff/reduce';
import { RiffSession } from '../app/lib/riff/session';

// Bajo jugable e instrumentos de cualquier número de cuerdas (petición del usuario, 2026-11-04). La
// cuerda 6 del juego es siempre la del Mi grave; en Experto, el instrumento lleva TODAS sus cuerdas;
// el resto de niveles usan las 4 del bajo o las 6 de la guitarra. Afinaciones de aguda a grave.
const BASS_4 = [43, 38, 33, 28];
const BASS_5 = [43, 38, 33, 28, 23];
const BASS_5_HIGH = [48, 43, 38, 33, 28];
const BASS_6 = [48, 43, 38, 33, 28, 23];
const GUITAR_6 = [64, 59, 55, 50, 45, 40];
const GUITAR_7 = [64, 59, 55, 50, 45, 40, 35];
const GUITAR_8 = [64, 59, 55, 50, 45, 40, 35, 30];

// Partitura con una pista por afinación: en cada una, una nota por `[cuerda de alphaTab, traste]`.
function scoreOf(tracks: Array<{ tuning: number[]; notes: Array<[number, number]> }>) {
  const { Score, Track, Staff, Bar, Voice, Beat, Note, MasterBar } = at.model;
  const score = new Score();
  const bars = Math.max(...tracks.map((track) => Math.ceil(track.notes.length / 4)));
  for (let b = 0; b < bars; b++) score.addMasterBar(new MasterBar());
  tracks.forEach(({ tuning, notes }, index) => {
    const track = new Track();
    track.name = `pista ${index}`;
    score.addTrack(track);
    const staff = new Staff();
    staff.showTablature = true;
    staff.stringTuning.tunings = tuning;
    track.addStaff(staff);
    for (let b = 0; b < bars; b++) {
      const bar = new Bar();
      staff.addBar(bar);
      const voice = new Voice();
      bar.addVoice(voice);
      for (let k = 0; k < 4; k++) {
        const beat = new Beat();
        const entry = notes[b * 4 + k];
        if (entry) {
          const note = new Note();
          note.string = entry[0];
          note.fret = entry[1];
          beat.addNote(note);
        } else {
          beat.isEmpty = false;
        }
        voice.addBeat(beat);
      }
    }
  });
  score.finish(new at.Settings());
  return score;
}

test('cuerdas del juego: la 6 es siempre la del Mi grave', () => {
  expect(gameStrings(GUITAR_6)).toEqual([1, 2, 3, 4, 5, 6]);
  expect(gameStrings(GUITAR_7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  expect(gameStrings(GUITAR_8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  expect(gameStrings(BASS_4)).toEqual([3, 4, 5, 6]);
  expect(gameStrings(BASS_5)).toEqual([3, 4, 5, 6, 7]);
  expect(gameStrings(BASS_5_HIGH)).toEqual([2, 3, 4, 5, 6]);
  expect(gameStrings(BASS_6)).toEqual([2, 3, 4, 5, 6, 7]);
  // Un bajo bajado un tono sigue siendo el mismo.
  expect(gameStrings(BASS_4.map((open) => open - 2))).toEqual([3, 4, 5, 6]);
});

test('bajo o guitarra: por su cuerda más aguda, no por la más grave', () => {
  for (const bass of [BASS_4, BASS_5, BASS_5_HIGH, BASS_6]) expect(isBassTuning(bass)).toBe(true);
  for (const guitar of [GUITAR_6, GUITAR_7, GUITAR_8]) expect(isBassTuning(guitar)).toBe(false);
  // Barítono en Si.
  expect(isBassTuning(GUITAR_6.map((open) => open - 5))).toBe(false);
});

test('pistas jugables: guitarras primero, luego bajos', () => {
  const score = scoreOf([
    { tuning: BASS_4, notes: [[1, 0]] },
    { tuning: GUITAR_8, notes: [[1, 0]] },
    { tuning: BASS_6, notes: [[1, 0]] },
    { tuning: GUITAR_6, notes: [[1, 0]] },
  ]);
  expect(listGuitarTracks(score).map((track) => track.index)).toEqual([1, 3]);
  expect(listPlayableTracks(score).map((track) => [track.index, track.kind])).toEqual([[1, 'guitar'], [3, 'guitar'], [0, 'bass'], [2, 'bass']]);
});

test('bajo de 4: cuerdas 6-3, trastes reales, suena una octava por debajo', () => {
  // alphaTab: cuerda 1 = la más grave (Mi), 4 = Sol.
  const chart = buildChart(at, scoreOf([{ tuning: BASS_4, notes: [[1, 0], [2, 3], [3, 5], [4, 7]] }]), 0, 12);
  expect(chart.notes.map((n) => `${n.string}/${n.fret}`)).toEqual(['6/0', '5/3', '4/5', '3/7']);
  expect(chart.notes.map((n) => n.midi)).toEqual([40, 48, 55, 62]);
  expect(chart.soundOffset).toBe(-12);
  expect(chart.bass).toBe(true);
  expect(chart.strings).toEqual([6, 5, 4, 3]);
});

test('bajo bajado: el mástil lo lee igual y suena en su tono', () => {
  const chart = buildChart(at, scoreOf([{ tuning: BASS_4.map((open) => open - 1), notes: [[1, 0]] }]), 0, 12);
  expect(chart.notes[0].midi).toBe(40);
  expect(chart.soundOffset).toBe(-13);
});

test('Experto: cada instrumento lleva todas sus cuerdas', () => {
  const low = buildChart(at, scoreOf([{ tuning: BASS_5, notes: [[1, 2], [2, 0], [5, 3]] }]), 0, 12);
  expect(low.notes.map((n) => `${n.string}/${n.fret}`)).toEqual(['7/2', '6/0', '3/3']);
  expect(low.strings).toEqual([7, 6, 5, 4, 3]);
  const six = buildChart(at, scoreOf([{ tuning: BASS_6, notes: [[1, 0], [6, 1]] }]), 0, 12);
  expect(six.notes.map((n) => `${n.string}/${n.fret}`)).toEqual(['7/0', '2/1']);
  expect(six.strings).toEqual([7, 6, 5, 4, 3, 2]);
  const seven = buildChart(at, scoreOf([{ tuning: GUITAR_7, notes: [[1, 0], [2, 0], [7, 0]] }]), 0, 12);
  expect(seven.notes.map((n) => `${n.string}/${n.fret}`)).toEqual(['7/0', '6/0', '1/0']);
  expect(seven.notes.map((n) => n.midi)).toEqual([35, 40, 64]);
  expect(seven.strings).toEqual([7, 6, 5, 4, 3, 2, 1]);
  expect(seven.soundOffset).toBeUndefined();
  const eight = buildChart(at, scoreOf([{ tuning: GUITAR_8, notes: [[1, 3]] }]), 0, 12);
  expect(eight.notes.map((n) => `${n.string}/${n.fret}`)).toEqual(['8/3']);
  // La guitarra de 6 sigue como siempre: el mástil no cambia.
  expect(buildChart(at, scoreOf([{ tuning: GUITAR_6, notes: [[1, 0]] }]), 0, 12).strings).toBeUndefined();
});

test('recolocar notas altas: nunca en una cuerda que el instrumento no tiene', () => {
  const chart = buildChart(at, scoreOf([{ tuning: BASS_4, notes: [[4, 15], [4, 17], [4, 15], [4, 14]] }]), 0, 12);
  for (const note of chart.notes) {
    expect(note.string).toBeGreaterThanOrEqual(3);
    expect(note.fret).toBeLessThanOrEqual(12);
  }
  expect(chart.notes).toHaveLength(4);
});

test('niveles: la cuerda extra se pliega, y la nota sigue sonando en su altura real', () => {
  // Si grave al aire (no llega a la 6): octava arriba. Si grave en el 5 = Mi al aire. Do agudo: en la 3.
  const score = scoreOf([{ tuning: BASS_6, notes: [[1, 0], [1, 5], [6, 2], [2, 3]] }]);
  const chart = buildChart(at, score, 0, 24, { fold: true });
  expect(chart.notes.map((n) => `${n.string}/${n.fret}`)).toEqual(['6/7', '6/0', '3/7', '6/3']);
  expect(chart.strings).toBeUndefined();
  const real = [23, 28, 50, 31];
  const session = new RiffSession(chart, { speed: 1, mode: 'ritmo', loop: false, fromBar: 1, toBar: 1 }, 0, { click: 'nada', muted: [] });
  session.advance(0);
  expect(session.bass).toBe(true);
  expect(session.takeGuideNotes(100, 100).map((note) => note.midi)).toEqual(real);
});

test('guitarra de 7 en los niveles: solo sus 6 cuerdas', () => {
  const notes: Array<[number, number]> = [[1, 0], [1, 7], [2, 3], [3, 2], [1, 0], [1, 7], [2, 3], [3, 2]];
  const real = buildChart(at, scoreOf([{ tuning: GUITAR_7, notes }]), 0, 24, { fold: true });
  for (const level of ['practica', 'medio', 'medio-cuerdas', 'dificil'] as const) {
    for (const note of reduceChart(real, RIFF_LEVELS[level]).notes) expect(note.string, level).toBeLessThanOrEqual(6);
  }
});

// Decisión del usuario: Difícil y Experto del bajo solo se diferencian en que Difícil no usa acordes
// ni los trastes 11 y 12 de la cuerda 4 del bajo (Mi), ni el 12 de la 3 (La).
test('bajo: Difícil es la tab, salvo acordes y los trastes que no alcanza', () => {
  const notes: Array<[number, number]> = [[1, 0], [1, 3], [2, 2], [3, 5], [4, 7], [4, 12], [3, 12], [2, 10]];
  const real = buildChart(at, scoreOf([{ tuning: BASS_4, notes }]), 0, 24, { fold: true });
  const hard = reduceChart(real, RIFF_LEVELS.dificil);
  expect(hard.notes.map((n) => `${n.string}/${n.fret}`)).toEqual(real.notes.map((n) => `${n.string}/${n.fret}`));
  const capped = buildChart(at, scoreOf([{ tuning: BASS_4, notes: [[1, 12], [1, 11], [2, 12], [1, 10], [2, 11], [1, 9], [2, 10], [1, 8]] }]), 0, 24, { fold: true });
  for (const note of reduceChart(capped, RIFF_LEVELS.dificil).notes) {
    expect(note.fret).toBeLessThanOrEqual(RIFF_LEVELS.dificil.maxFretByString![note.string]);
  }
});

test('carriles: con 6 cuerdas no cambia nada; con otras, repartidas en todo el mástil', () => {
  expect([...laneRows([6, 5, 4, 3, 2, 1])]).toEqual([[6, 6], [5, 5], [4, 4], [3, 3], [2, 2], [1, 1]]);
  expect(laneRows([6, 5, 4, 3])).toEqual(laneRows([3, 4, 5, 6]));
  const seven = laneRows([7, 6, 5, 4, 3, 2, 1]);
  expect(seven.get(7)).toBe(6);
  expect(seven.get(1)).toBe(1);
  expect(seven.get(4)).toBeCloseTo(3.5, 6);
  const five = laneRows([7, 6, 5, 4, 3]);
  expect(five.get(7)).toBe(6);
  expect(five.get(3)).toBe(1);
});
