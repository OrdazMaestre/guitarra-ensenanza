// Dificultad de las canciones de los discos (la carita delante del título, ver app/lib/riff/difficulty.ts),
// medida en segundo plano de UNA en UNA: lee la canción con alphaTab, mide su guitarra y se queda solo con
// el número. Las del dispositivo se leen con una URL `blob:` temporal que se borra al acabar (nada sale del
// dispositivo ni se guarda: el resultado vive solo en la memoria de la pestaña). No mide mientras se está
// jugando una partida (gameInProgress.ts). Sin React: un almacén para useSyncExternalStore.

import { getGameInProgress, subscribeGameInProgress } from './gameInProgress';
import { getLocalSongs } from './localSongs';
import { buildChart, forgetScore, listGuitarTracks, loadScore } from './riff/chart';
import { chartDifficultyScore, songDifficulty, type SongDifficulty } from './riff/difficulty';
import type { SongEntry } from './songs';

export interface MeasuredDifficulty {
  // Sin guitarra de 6 cuerdas no hay dificultad (no se puede jugar).
  score?: number;
  difficulty?: SongDifficulty;
  // Lo que trae el archivo (petición del usuario, 2026-11-01: batería / guitarra tachadas en las
  // canciones del dispositivo que no las tienen).
  hasGuitar: boolean;
  hasDrums: boolean;
}

// id de la canción -> su dificultad, o null si no se pudo medir (sin guitarra, archivo roto...).
type DifficultyMap = Record<string, MeasuredDifficulty | null>;

let state: DifficultyMap = {};
const listeners = new Set<() => void>();
const queue: SongEntry[] = [];
const queued = new Set<string>();
let running = false;
// La primera medición espera un poco: no compite con la carga de la página.
const START_DELAY_MS = 1000;
let started = false;

export function subscribeDifficulties(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDifficulties() {
  return state;
}

const EMPTY: DifficultyMap = {};
export function getServerDifficulties() {
  return EMPTY;
}

// Pide medir las canciones que aún no se han medido (ni están en cola).
export function requestDifficulties(songs: SongEntry[]) {
  for (const song of songs) {
    if (song.id in state || queued.has(song.id)) continue;
    queued.add(song.id);
    queue.push(song);
  }
  void pump();
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function untilNoGame() {
  if (!getGameInProgress()) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const stop = subscribeGameInProgress(() => {
      if (getGameInProgress()) return;
      stop();
      resolve();
    });
  });
}

async function measure(song: SongEntry): Promise<MeasuredDifficulty | null> {
  const file = song.local ? getLocalSongs().songs.find((entry) => entry.id === song.id)?.file : undefined;
  if (song.local && !file) return null;
  const url = file ? URL.createObjectURL(file) : song.source;
  try {
    const { at, score } = await loadScore(url);
    const guitars = listGuitarTracks(score);
    const track = guitars.find((g) => g.name === song.initialTrack) ?? guitars[0];
    // La misma regla que buildChart para la batería: una pista de percusión.
    const hasDrums = score.tracks.some((candidate) => candidate.staves[0]?.isPercussion);
    if (!track) return { hasGuitar: false, hasDrums };
    const value = chartDifficultyScore(buildChart(at, score, track.index, 24));
    return { score: value, difficulty: songDifficulty(value), hasGuitar: true, hasDrums };
  } catch {
    return null;
  } finally {
    if (file) {
      forgetScore(url);
      URL.revokeObjectURL(url);
    }
  }
}

async function pump() {
  if (running) return;
  running = true;
  try {
    if (!started) {
      started = true;
      await wait(START_DELAY_MS);
    }
    while (queue.length > 0) {
      await untilNoGame();
      const song = queue.shift()!;
      const result = await measure(song);
      queued.delete(song.id);
      state = { ...state, [song.id]: result };
      listeners.forEach((listener) => listener());
      // Respiro entre canciones para que la página siga fluida.
      await wait(0);
    }
  } finally {
    running = false;
  }
}

// Solo para tests: vuelve al estado inicial.
export function resetDifficultiesForTests() {
  state = {};
  queue.length = 0;
  queued.clear();
  started = false;
}
