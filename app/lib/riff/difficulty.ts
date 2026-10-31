// Dificultad de una canción para el disco de canciones (petición del usuario, 2026-10-31): una carita
// delante del título -- 😛 fácil, 😁 normal, 😈 difícil (las de Principiante, Fácil y Medio del modo
// trastes) -- y las canciones del dispositivo ordenadas de más fácil a más difícil. Puro: se prueba en Node.
//
// Calibrada con la clasificación del usuario (no con el número de notas: eso fallaba):
// 1) VELOCIDAD de las notas normales = 1 / hueco mediano entre golpes (los huecos de más de 1,5 s son
//    silencios y no cuentan). Black Gilmur va a 69 bpm: sus semicorcheas salen cada 217 ms, más despacio
//    que las corcheas de Electric Warlock (174 ms); Iron Rain 150 ms, Master of Puppets 142 ms.
// 2) CAMBIOS DE CUERDA: Thunderstruck va a 8 notas/s pero es un tapping sobre UNA sola cuerda (razón del
//    usuario), así que baja de nivel. Las demás cambian de cuerda en el 21-52 % de los golpes.
// Medido (velocidad × factor de cuerdas): Let it be 0,7, Cumpleaños 2,8, Feliz Navidad 4,0, Carol 4,0,
// Black Gilmur 4,6 -> fácil; Thunderstruck 5,6, Electric Warlock 5,7 -> normal; Iron Rain 6,7, Master of
// Puppets 6,8 y todo lo que va más deprisa -> difícil. Unos 0,4-0,5 de margen a cada lado de cada umbral.

import type { RiffLevel } from './levels';
import type { Chart, ChartNote } from './chart';

export type SongDifficulty = 'facil' | 'normal' | 'dificil';

export const EASY_BELOW = 5;
export const HARD_FROM = 6.2;
// Cambios de cuerda a partir de los cuales no hay rebaja, y rebaja máxima (todo en una cuerda).
export const STRING_CHANGE_FULL = 0.25;
export const ONE_STRING_DISCOUNT = 0.3;
const REST_GAP_SECONDS = 1.5;

// Carita de cada dificultad: la del nivel del modo trastes que le corresponde.
export const DIFFICULTY_LEVEL: Record<SongDifficulty, RiffLevel> = { facil: 'practica', normal: 'facil', dificil: 'medio' };
export const DIFFICULTY_LABEL: Record<SongDifficulty, string> = { facil: 'fácil', normal: 'normal', dificil: 'difícil' };

// Nota guía de cada golpe (la más grave, como en un power chord), en orden de tiempo.
function leadNotes(notes: ChartNote[]): ChartNote[] {
  const leads: ChartNote[] = [];
  let groupT = Number.NEGATIVE_INFINITY;
  for (const note of notes) {
    const last = leads[leads.length - 1];
    if (last && Math.abs(note.t - groupT) < 0.005) {
      if (note.midi < last.midi) leads[leads.length - 1] = note;
    } else {
      leads.push(note);
      groupT = note.t;
    }
  }
  return leads;
}

// Puntuación de dificultad (más alta = más difícil); 0 si no hay notas suficientes.
export function chartDifficultyScore(chart: Pick<Chart, 'notes'>): number {
  const leads = leadNotes([...chart.notes].sort((a, b) => a.t - b.t));
  if (leads.length < 2) return 0;
  const gaps: number[] = [];
  let stringChanges = 0;
  for (let i = 1; i < leads.length; i++) {
    const gap = leads[i].t - leads[i - 1].t;
    if (gap < REST_GAP_SECONDS) gaps.push(gap);
    if (leads[i].string !== leads[i - 1].string) stringChanges++;
  }
  if (gaps.length === 0) return 0;
  gaps.sort((a, b) => a - b);
  const speed = 1 / gaps[gaps.length >> 1];
  const changeShare = stringChanges / (leads.length - 1);
  const strings = 1 - ONE_STRING_DISCOUNT + ONE_STRING_DISCOUNT * Math.min(1, changeShare / STRING_CHANGE_FULL);
  return speed * strings;
}

export function songDifficulty(score: number): SongDifficulty {
  if (score >= HARD_FROM) return 'dificil';
  return score >= EASY_BELOW ? 'normal' : 'facil';
}
