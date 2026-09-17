// Tablas de grados I-VII (tríada + acorde con séptima) para las 4 escalas que usa el quiz:
// Sol Mayor, Mi menor, Do Mayor, La menor. Sol Mayor es una copia intencional de los datos ya
// existentes en AcordesEscalaSolMayorPage.tsx / AcordesSeptimaPage.tsx (mismos grados, mismos
// acordes) — se centraliza aquí para que el motor del quiz tenga las 4 escalas en un solo sitio,
// sin depender de un componente de página. Mi menor / Do Mayor / La menor son NUEVAS: no existían
// en el repo. Derivadas por armonización diatónica NATURAL (sin alterar el grado V), siguiendo el
// mismo criterio que el propio texto de AcordesEscalaSolMayorPage.tsx ya usa para Mi menor
// ("Mi menor: Em, F# disminuido, G, Am, Bm, C y D" — v es Bm, menor, no B7) — validado con el
// agente guitar-music-advisor antes de darlas por buenas.

export type ScaleId = 'sol-mayor' | 'mi-menor' | 'do-mayor' | 'la-menor';

export interface ScaleDegree {
  degree: '1' | '2' | '3' | '4' | '5' | '6' | '7';
  roman: string;
  seventhName: string;
  seventhNotes: [string, string, string, string];
  seventhQuality: 'Mayor' | 'menor' | 'dominante' | 'semi-disminuido';
  triadName: string;
  triadNotes: [string, string, string];
  triadQuality: 'Mayor' | 'menor' | 'disminuido';
}

export interface ScaleTable {
  degrees: ScaleDegree[];
  /** Notas de la escala, en orden, empezando por la tónica. */
  notes: string[];
  relativeOf?: ScaleId;
  tonic: string;
}

const solMayorDegrees: ScaleDegree[] = [
  { degree: '1', roman: 'I', triadName: 'G', triadQuality: 'Mayor', triadNotes: ['G', 'B', 'D'], seventhName: 'GMaj7', seventhQuality: 'Mayor', seventhNotes: ['G', 'B', 'D', 'F#'] },
  { degree: '2', roman: 'ii', triadName: 'Am', triadQuality: 'menor', triadNotes: ['A', 'C', 'E'], seventhName: 'Am7', seventhQuality: 'menor', seventhNotes: ['A', 'C', 'E', 'G'] },
  { degree: '3', roman: 'iii', triadName: 'Bm', triadQuality: 'menor', triadNotes: ['B', 'D', 'F#'], seventhName: 'Bm7', seventhQuality: 'menor', seventhNotes: ['B', 'D', 'F#', 'A'] },
  { degree: '4', roman: 'IV', triadName: 'C', triadQuality: 'Mayor', triadNotes: ['C', 'E', 'G'], seventhName: 'CMaj7', seventhQuality: 'Mayor', seventhNotes: ['C', 'E', 'G', 'B'] },
  { degree: '5', roman: 'V', triadName: 'D', triadQuality: 'Mayor', triadNotes: ['D', 'F#', 'A'], seventhName: 'D7', seventhQuality: 'dominante', seventhNotes: ['D', 'F#', 'A', 'C'] },
  { degree: '6', roman: 'vi', triadName: 'Em', triadQuality: 'menor', triadNotes: ['E', 'G', 'B'], seventhName: 'Em7', seventhQuality: 'menor', seventhNotes: ['E', 'G', 'B', 'D'] },
  { degree: '7', roman: 'vii disminuido', triadName: 'F# disminuido', triadQuality: 'disminuido', triadNotes: ['F#', 'A', 'C'], seventhName: 'F#m7b5', seventhQuality: 'semi-disminuido', seventhNotes: ['F#', 'A', 'C', 'E'] },
];

// Mi menor es la relativa natural de Sol Mayor: mismos 7 acordes, renumerados desde el vi (Em).
const miMenorDegrees: ScaleDegree[] = [
  { degree: '1', roman: 'i', triadName: 'Em', triadQuality: 'menor', triadNotes: ['E', 'G', 'B'], seventhName: 'Em7', seventhQuality: 'menor', seventhNotes: ['E', 'G', 'B', 'D'] },
  { degree: '2', roman: 'ii disminuido', triadName: 'F# disminuido', triadQuality: 'disminuido', triadNotes: ['F#', 'A', 'C'], seventhName: 'F#m7b5', seventhQuality: 'semi-disminuido', seventhNotes: ['F#', 'A', 'C', 'E'] },
  { degree: '3', roman: 'III', triadName: 'G', triadQuality: 'Mayor', triadNotes: ['G', 'B', 'D'], seventhName: 'GMaj7', seventhQuality: 'Mayor', seventhNotes: ['G', 'B', 'D', 'F#'] },
  { degree: '4', roman: 'iv', triadName: 'Am', triadQuality: 'menor', triadNotes: ['A', 'C', 'E'], seventhName: 'Am7', seventhQuality: 'menor', seventhNotes: ['A', 'C', 'E', 'G'] },
  { degree: '5', roman: 'v', triadName: 'Bm', triadQuality: 'menor', triadNotes: ['B', 'D', 'F#'], seventhName: 'Bm7', seventhQuality: 'menor', seventhNotes: ['B', 'D', 'F#', 'A'] },
  { degree: '6', roman: 'VI', triadName: 'C', triadQuality: 'Mayor', triadNotes: ['C', 'E', 'G'], seventhName: 'CMaj7', seventhQuality: 'Mayor', seventhNotes: ['C', 'E', 'G', 'B'] },
  { degree: '7', roman: 'VII', triadName: 'D', triadQuality: 'Mayor', triadNotes: ['D', 'F#', 'A'], seventhName: 'D7', seventhQuality: 'dominante', seventhNotes: ['D', 'F#', 'A', 'C'] },
];

const doMayorDegrees: ScaleDegree[] = [
  { degree: '1', roman: 'I', triadName: 'C', triadQuality: 'Mayor', triadNotes: ['C', 'E', 'G'], seventhName: 'CMaj7', seventhQuality: 'Mayor', seventhNotes: ['C', 'E', 'G', 'B'] },
  { degree: '2', roman: 'ii', triadName: 'Dm', triadQuality: 'menor', triadNotes: ['D', 'F', 'A'], seventhName: 'Dm7', seventhQuality: 'menor', seventhNotes: ['D', 'F', 'A', 'C'] },
  { degree: '3', roman: 'iii', triadName: 'Em', triadQuality: 'menor', triadNotes: ['E', 'G', 'B'], seventhName: 'Em7', seventhQuality: 'menor', seventhNotes: ['E', 'G', 'B', 'D'] },
  { degree: '4', roman: 'IV', triadName: 'F', triadQuality: 'Mayor', triadNotes: ['F', 'A', 'C'], seventhName: 'FMaj7', seventhQuality: 'Mayor', seventhNotes: ['F', 'A', 'C', 'E'] },
  { degree: '5', roman: 'V', triadName: 'G', triadQuality: 'Mayor', triadNotes: ['G', 'B', 'D'], seventhName: 'G7', seventhQuality: 'dominante', seventhNotes: ['G', 'B', 'D', 'F'] },
  { degree: '6', roman: 'vi', triadName: 'Am', triadQuality: 'menor', triadNotes: ['A', 'C', 'E'], seventhName: 'Am7', seventhQuality: 'menor', seventhNotes: ['A', 'C', 'E', 'G'] },
  { degree: '7', roman: 'vii disminuido', triadName: 'B disminuido', triadQuality: 'disminuido', triadNotes: ['B', 'D', 'F'], seventhName: 'Bm7b5', seventhQuality: 'semi-disminuido', seventhNotes: ['B', 'D', 'F', 'A'] },
];

// La menor es la relativa natural de Do Mayor: mismos 7 acordes, renumerados desde el vi (Am).
const laMenorDegrees: ScaleDegree[] = [
  { degree: '1', roman: 'i', triadName: 'Am', triadQuality: 'menor', triadNotes: ['A', 'C', 'E'], seventhName: 'Am7', seventhQuality: 'menor', seventhNotes: ['A', 'C', 'E', 'G'] },
  { degree: '2', roman: 'ii disminuido', triadName: 'B disminuido', triadQuality: 'disminuido', triadNotes: ['B', 'D', 'F'], seventhName: 'Bm7b5', seventhQuality: 'semi-disminuido', seventhNotes: ['B', 'D', 'F', 'A'] },
  { degree: '3', roman: 'III', triadName: 'C', triadQuality: 'Mayor', triadNotes: ['C', 'E', 'G'], seventhName: 'CMaj7', seventhQuality: 'Mayor', seventhNotes: ['C', 'E', 'G', 'B'] },
  { degree: '4', roman: 'iv', triadName: 'Dm', triadQuality: 'menor', triadNotes: ['D', 'F', 'A'], seventhName: 'Dm7', seventhQuality: 'menor', seventhNotes: ['D', 'F', 'A', 'C'] },
  { degree: '5', roman: 'v', triadName: 'Em', triadQuality: 'menor', triadNotes: ['E', 'G', 'B'], seventhName: 'Em7', seventhQuality: 'menor', seventhNotes: ['E', 'G', 'B', 'D'] },
  { degree: '6', roman: 'VI', triadName: 'F', triadQuality: 'Mayor', triadNotes: ['F', 'A', 'C'], seventhName: 'FMaj7', seventhQuality: 'Mayor', seventhNotes: ['F', 'A', 'C', 'E'] },
  { degree: '7', roman: 'VII', triadName: 'G', triadQuality: 'Mayor', triadNotes: ['G', 'B', 'D'], seventhName: 'G7', seventhQuality: 'dominante', seventhNotes: ['G', 'B', 'D', 'F'] },
];

export const SCALE_TABLES: Record<ScaleId, ScaleTable> = {
  'sol-mayor': { tonic: 'G', notes: ['G', 'A', 'B', 'C', 'D', 'E', 'F#'], degrees: solMayorDegrees },
  'mi-menor': { tonic: 'E', notes: ['E', 'F#', 'G', 'A', 'B', 'C', 'D'], relativeOf: 'sol-mayor', degrees: miMenorDegrees },
  'do-mayor': { tonic: 'C', notes: ['C', 'D', 'E', 'F', 'G', 'A', 'B'], degrees: doMayorDegrees },
  'la-menor': { tonic: 'A', notes: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], relativeOf: 'do-mayor', degrees: laMenorDegrees },
};

/** Grado (I-VII) que ocupa una nota dentro de una escala, o null si la nota no pertenece a ella. */
export function degreeOfNote(scale: ScaleId, note: string): ScaleDegree | null {
  const table = SCALE_TABLES[scale];
  const index = table.notes.indexOf(note);
  return index < 0 ? null : table.degrees[index];
}
