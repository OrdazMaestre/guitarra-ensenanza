// Dificultad de las canciones de los discos (la carita delante del título, ver app/lib/riff/difficulty.ts),
// medida en segundo plano de UNA en UNA: lee la canción con alphaTab, mide su guitarra y se queda solo con
// el número. Las del dispositivo se leen con una URL `blob:` temporal que se borra al acabar (nada sale del
// dispositivo). No mide mientras se está jugando una partida (gameInProgress.ts). Sin React: un almacén
// para useSyncExternalStore. Lo medido en las canciones del dispositivo se recuerda en este navegador
// (petición del usuario, 2026-11-05: si no, se medían todas en cada visita); si cambia la métrica de
// dificultad.ts, sube la versión de SONG_TRAITS_STORAGE_KEY en localSongs.ts.

import { getGameInProgress, subscribeGameInProgress } from './gameInProgress';
import { getLocalSongs, SONG_TRAITS_STORAGE_KEY } from './localSongs';
import { buildChart, forgetScore, listPlayableTracks, loadScore } from './riff/chart';
import { chartDensity, chartDifficultyScore, songDifficulty, type DifficultyKind, type SongDifficulty } from './riff/difficulty';
import type { SongEntry } from './songs';

export interface KindDifficulty {
  score: number;
  density: number;
  difficulty: SongDifficulty;
}

export interface MeasuredDifficulty {
  // La de la GUITARRA (sin guitarra de 6 cuerdas, nada).
  score?: number;
  difficulty?: SongDifficulty;
  // Una por instrumento (usuario, 2026-11-19: la lista se ordena por el instrumento elegido): la primera
  // pista de cada tipo (la guitarra, la inicial de la canción si es una guitarra).
  byKind?: Partial<Record<DifficultyKind, KindDifficulty>>;
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
let remembered: Record<string, MeasuredDifficulty> | null = null;

function rememberedTraits() {
  if (remembered) return remembered;
  remembered = {};
  try {
    if (typeof window !== 'undefined') remembered = JSON.parse(window.localStorage.getItem(SONG_TRAITS_STORAGE_KEY) ?? '{}');
  } catch {
    // Sin almacenamiento o datos rotos: se vuelven a medir.
  }
  return remembered!;
}

function rememberTraits(id: string, traits: MeasuredDifficulty) {
  const all = rememberedTraits();
  all[id] = traits;
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(SONG_TRAITS_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Sin sitio: vale para esta visita.
  }
}

// Al borrar una canción del dispositivo: olvida su carita (en memoria y en `localStorage`).
export function forgetDifficulty(id: string) {
  const all = rememberedTraits();
  if (!(id in all)) return;
  delete all[id];
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(SONG_TRAITS_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Sin almacenamiento: ya está fuera de la memoria.
  }
}

// Instrumento recordado del juego (`riff-ultimo-instrumento`, useRiffController): manda en la carita y el orden
// del disco del reproductor de tabs. Para useSyncExternalStore (en el servidor, la guitarra).
export const INSTRUMENT_STORAGE_KEY = 'riff-ultimo-instrumento';
export function rememberedDifficultyKind(): DifficultyKind {
  try {
    const value = window.localStorage.getItem(INSTRUMENT_STORAGE_KEY);
    return value === 'bass' || value === 'drums' || value === 'keys' ? value : 'guitar';
  } catch {
    return 'guitar';
  }
}

// La dificultad de una canción para un instrumento (sin medir o sin ese instrumento: undefined).
export function difficultyFor(info: MeasuredDifficulty | null | undefined, kind: DifficultyKind): SongDifficulty | undefined {
  return info?.byKind?.[kind]?.difficulty;
}

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
  const known: DifficultyMap = {};
  for (const song of songs) {
    if (song.id in state || queued.has(song.id)) continue;
    const traits = song.local ? rememberedTraits()[song.id] : undefined;
    if (traits) {
      known[song.id] = traits;
      continue;
    }
    queued.add(song.id);
    queue.push(song);
  }
  if (Object.keys(known).length > 0) {
    state = { ...state, ...known };
    listeners.forEach((listener) => listener());
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
    const tracks = listPlayableTracks(score);
    // La misma regla que buildChart para la batería: una pista de percusión.
    const hasDrums = score.tracks.some((candidate) => candidate.staves[0]?.isPercussion);
    const byKind: Partial<Record<DifficultyKind, KindDifficulty>> = {};
    for (const kind of ['guitar', 'bass', 'drums', 'keys'] as const) {
      const ofKind = tracks.filter((track) => (track.kind ?? 'guitar') === kind);
      const track = (kind === 'guitar' ? ofKind.find((g) => g.name === song.initialTrack) : undefined) ?? ofKind[0];
      if (!track) continue;
      const chart = buildChart(at, score, track.index, 24);
      const value = chartDifficultyScore(chart, kind);
      const density = chartDensity(chart);
      byKind[kind] = { score: value, density, difficulty: songDifficulty(value, density) };
    }
    const guitar = byKind.guitar;
    if (!guitar) return { hasGuitar: false, hasDrums, byKind };
    return { score: guitar.score, difficulty: guitar.difficulty, hasGuitar: true, hasDrums, byKind };
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
      if (song.local && result) rememberTraits(song.id, result);
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
  remembered = null;
}
