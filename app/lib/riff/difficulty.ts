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

export type SongDifficulty = 'facil' | 'normal' | 'dificil' | 'muyDificil';
// Instrumento medido (usuario, 2026-11-19: la lista se ordena por el instrumento elegido; Sarcophagus de Nile
// tiene una batería muy complicada y unas guitarras más asequibles).
export type DifficultyKind = 'guitar' | 'bass' | 'drums' | 'keys';

export const EASY_BELOW = 5;
export const HARD_FROM = 6.2;
// Cambios de cuerda a partir de los cuales no hay rebaja, y rebaja máxima (todo en una cuerda).
export const STRING_CHANGE_FULL = 0.25;
export const ONE_STRING_DISCOUNT = 0.3;
const REST_GAP_SECONDS = 1.5;

// Carita de cada dificultad: la del nivel del modo trastes que le corresponde.
// «Muy difícil» (usuario, 2026-11-19): el demonio mareado 😵‍💫, la carita de Avanzado cuerdas.
export const DIFFICULTY_LEVEL: Record<SongDifficulty, RiffLevel> = { facil: 'practica', normal: 'facil', dificil: 'medio', muyDificil: 'avanzado-cuerdas' };
export const DIFFICULTY_LABEL: Record<SongDifficulty, string> = { facil: 'fácil', normal: 'normal', dificil: 'difícil', muyDificil: 'muy difícil' };
export const DIFFICULTY_ORDER: SongDifficulty[] = ['facil', 'normal', 'dificil', 'muyDificil'];

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
// Qué cuenta como "cambiar de cuerda": en guitarra y bajo, la cuerda; en la batería, el pad (traste); en el
// teclado, la nota (no hay cuerdas).
function changeKey(kind: DifficultyKind) {
  if (kind === 'drums') return (note: ChartNote) => note.fret;
  if (kind === 'keys') return (note: ChartNote) => note.midi;
  return (note: ChartNote) => note.string;
}

export function chartDifficultyScore(chart: Pick<Chart, 'notes'>, kind: DifficultyKind = 'guitar'): number {
  const leads = leadNotes([...chart.notes].sort((a, b) => a.t - b.t));
  const key = changeKey(kind);
  if (leads.length < 2) return 0;
  const gaps: number[] = [];
  let stringChanges = 0;
  for (let i = 1; i < leads.length; i++) {
    const gap = leads[i].t - leads[i - 1].t;
    if (gap < REST_GAP_SECONDS) gaps.push(gap);
    if (key(leads[i]) !== key(leads[i - 1])) stringChanges++;
  }
  if (gaps.length === 0) return 0;
  gaps.sort((a, b) => a - b);
  const speed = 1 / gaps[gaps.length >> 1];
  const changeShare = stringChanges / (leads.length - 1);
  const strings = 1 - ONE_STRING_DISCOUNT + ONE_STRING_DISCOUNT * Math.min(1, changeShare / STRING_CHANGE_FULL);
  return speed * strings;
}

// DENSIDAD (usuario, 2026-11-19: Vektor y Nile son mucho más densas que otras "difíciles"): golpes distintos
// por segundo en la MITAD de compases más cargados (en orden de reproducción, repeticiones incluidas). Solo
// separa "muy difícil" de "difícil"; las otras tres siguen saliendo de la puntuación de arriba. La mitad y no
// el 25 %: Vektor y Nile van cargadas casi todo el rato, Master of Puppets solo en el solo de Kirk (con el 25 %,
// Kirk daba 9,9, más que varias de Vektor; con la mitad, 8,3).
const DENSE_BAR_SHARE = 0.5;
export function chartDensity(chart: Pick<Chart, 'notes' | 'bars'>, share = DENSE_BAR_SHARE): number {
  const onsets = [...new Set(chart.notes.map((note) => Math.round(note.t * 200)))].sort((a, b) => a - b).map((t) => t / 200);
  const perBar: number[] = [];
  let j = 0;
  for (const bar of chart.bars) {
    const length = bar.end - bar.t;
    if (length <= 0.05) continue;
    while (j < onsets.length && onsets[j] < bar.t - 1e-3) j++;
    let count = 0;
    for (let k = j; k < onsets.length && onsets[k] < bar.end - 1e-3; k++) count++;
    if (count > 0) perBar.push(count / length);
  }
  if (perBar.length === 0) return 0;
  perBar.sort((a, b) => b - a);
  const top = perBar.slice(0, Math.max(1, Math.round(perBar.length * share)));
  return top.reduce((a, b) => a + b, 0) / top.length;
}

// Umbral de densidad para «muy difícil», calibrado con las 117 tabs del usuario (2026-11-19, guitarras). Pasan:
// Vektor Pteropticon 11,5-11,9, Black Future 10,1-10,3, Fast Paced Society 10,1, Recharging the Void 9,8-10,0,
// Destroying the Cosmos 9,1-10,5, Tetrastructural Minds 8,6-8,7; Nile Smashing the Antiu 14,7-15,3, Howling of
// the Jinn 10,4-11,4, Kafir! 9,7-10,6, Papyrus 9,7-9,8, Fiends 9,8, Defiling 8,8-10,1, Sebek 8,6-8,7. Se quedan en
// «difícil»: Master of Puppets (Kirk 8,3, James 7,2), Iron Rain 6,7-6,8, Venus Project 8,0, Nile Hittite 7,8-8,0,
// Black Seeds 7,0-7,1, Sarcophagus 5,3, Hammer Smashed Face 6,4, Lucretia 6,2. El mismo umbral, en todos los
// instrumentos.
export const VERY_HARD_DENSITY = 8.5;

export function songDifficulty(score: number, density = 0): SongDifficulty {
  if (score >= HARD_FROM) return density >= VERY_HARD_DENSITY ? 'muyDificil' : 'dificil';
  return score >= EASY_BELOW ? 'normal' : 'facil';
}
