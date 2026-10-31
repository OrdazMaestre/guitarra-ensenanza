import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import * as at from '@coderline/alphatab';
import { buildChart, listGuitarTracks, type Chart } from '../app/lib/riff/chart';
import { chartDifficultyScore, songDifficulty } from '../app/lib/riff/difficulty';

// Dificultad de las canciones del disco (app/lib/riff/difficulty.ts), calibrada con la clasificación
// del usuario (2026-10-31): velocidad de las notas normales × rebaja si va todo en una cuerda.

function chartOf(path: string, trackName?: string): Chart {
  const score = at.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(fs.readFileSync(path)), new at.Settings());
  const guitars = listGuitarTracks(score);
  const track = guitars.find((g) => g.name === trackName) ?? guitars[0];
  return buildChart(at, score, track.index, 24);
}

const USER_RANKING: Array<[string, string, 'facil' | 'normal' | 'dificil', string?]> = [
  ['Let it be', 'public/tabs/let-it-be-verso.gp', 'facil'],
  ['Feliz Navidad', 'public/tabs/feliz-navidad.gp', 'facil'],
  ['Carol of the Bells', 'public/tabs/carol-of-the-bells.gp', 'facil'],
  ['Cumpleaños feliz', 'public/tabs/cumpleanos-feliz.gp', 'facil'],
  ['Black Gilmur', 'public/tabs/black-gilmur.gp', 'facil'],
  ['Electric Warlock', 'public/tabs/electric-warlock.gp', 'normal'],
  // Tapping sobre una sola cuerda: rápido, pero baja de nivel (razón del usuario).
  ['Thunderstruck', 'public/tabs/thunderstruck.gp', 'normal'],
  ['Iron Rain', 'public/tabs/iron-rain.gp', 'dificil', 'MAIkael'],
  ['Master of Puppets', 'public/tabs/prueba-master-of-puppets.gp', 'dificil', 'Rhythm Guitar (Kirk)'],
  ['Canción de estrés', 'tests/fixtures/stress-4-instrumentos.musicxml', 'dificil'],
];

test('dificultad: la clasificación del usuario, y en orden fácil < normal < difícil', () => {
  const scores = USER_RANKING.map(([name, path, expected, track]) => {
    const score = chartDifficultyScore(chartOf(path, track));
    expect(songDifficulty(score), `${name} (${score.toFixed(2)})`).toBe(expected);
    return { expected, score };
  });
  const rank = { facil: 0, normal: 1, dificil: 2 };
  for (const a of scores) for (const b of scores) if (rank[a.expected] < rank[b.expected]) expect(a.score).toBeLessThan(b.score);
});

test('dificultad: los silencios largos no la cambian', () => {
  const real = chartOf('public/tabs/electric-warlock.gp');
  // Un silencio de 10 s a mitad de la canción.
  const half = real.notes[Math.floor(real.notes.length / 2)].t;
  const withRest = { notes: real.notes.map((n) => (n.t >= half ? { ...n, t: n.t + 10 } : n)) };
  expect(chartDifficultyScore(withRest)).toBeCloseTo(chartDifficultyScore(real), 5);
});

test('dificultad: todo en una cuerda rebaja como mucho un 30 %', () => {
  const note = (t: number, string: number) => ({ id: t, t, dur: 0.1, string, fret: 0, midi: 40, palmMute: false, tech: [] });
  const oneString = { notes: [0, 1, 2, 3, 4, 5].map((i) => note(i * 0.2, 2)) };
  const changing = { notes: [0, 1, 2, 3, 4, 5].map((i) => note(i * 0.2, i % 2 ? 2 : 3)) };
  expect(chartDifficultyScore(changing)).toBeCloseTo(5);
  expect(chartDifficultyScore(oneString)).toBeCloseTo(3.5);
  expect(chartDifficultyScore({ notes: [] })).toBe(0);
});

// Se mide en segundo plano, de una en una, y NUNCA durante una partida (gameInProgress.ts).
test('medición en segundo plano: espera a que acabe la partida y mide la canción del dispositivo', async () => {
  const { addLocalFiles, getLocalSongs, resetLocalSongsForTests } = await import('../app/lib/localSongs');
  const { getDifficulties, requestDifficulties, resetDifficultiesForTests } = await import('../app/lib/songDifficulty');
  const { setGameInProgress } = await import('../app/lib/gameInProgress');
  resetLocalSongsForTests();
  resetDifficultiesForTests();
  const file = new File([fs.readFileSync('public/tabs/feliz-navidad.gp')], 'feliz-navidad.gp', { lastModified: 1 });
  await addLocalFiles([{ file, path: 'feliz-navidad.gp' }]);
  const local = getLocalSongs().songs[0];
  setGameInProgress(true);
  requestDifficulties([{ id: local.id, title: local.title, source: '', local: true }]);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  expect(local.id in getDifficulties()).toBe(false);
  setGameInProgress(false);
  await expect.poll(() => getDifficulties()[local.id]?.difficulty, { timeout: 10000 }).toBe('facil');
});
