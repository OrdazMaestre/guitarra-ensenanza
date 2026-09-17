// Extraído del patrón duplicado en 10+ páginas de _lesson-pages (ej. NotacionMusicalPage.tsx,
// AcordesSeptimaPage.tsx, AcordesEscalaSolMayorPage.tsx). Fuente nueva para el quiz — las páginas
// de lección existentes no se tocan aquí, siguen con su propia copia local.

export const OPEN_STRING_MIDI: Record<number, number> = {
  1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40,
};

export const CHROMATIC_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Nota en la cuerda/traste dado, en notación internacional (C, C#, D...). */
export function noteNameForFret(string: number, fret: number): string {
  return CHROMATIC_NOTES[(OPEN_STRING_MIDI[string] + fret) % CHROMATIC_NOTES.length];
}

/** Igual que noteNameForFret pero a partir de la clase de altura (pitch class 0-11) de la cuerda al aire. */
export function noteNameForOpen(open: number, fret: number): string {
  return CHROMATIC_NOTES[(open + fret) % CHROMATIC_NOTES.length];
}

/** Distancia en semitonos entre dos notas MIDI (o dos posiciones ya convertidas a MIDI). */
export function semitoneDistance(midiA: number, midiB: number): number {
  return Math.abs(midiB - midiA);
}

// Mismo listado que usa NotacionMusicalPage.tsx (notación española en mayúsculas, solo sostenidos —
// el sitio no usa nombres con bemol, ej. "DO#" no "DO#/REb"). Orden = índice cromático 0-11.
export const SPANISH_NOTE_NAMES: [string, string][] = [
  ['DO', 'C'],
  ['DO#', 'C#'],
  ['RE', 'D'],
  ['RE#', 'D#'],
  ['MI', 'E'],
  ['FA', 'F'],
  ['FA#', 'F#'],
  ['SOL', 'G'],
  ['SOL#', 'G#'],
  ['LA', 'A'],
  ['LA#', 'A#'],
  ['SI', 'B'],
];

export const NATURAL_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/** Notación internacional -> notación española (DO, RE, MI...). */
export function spanishForInternational(note: string): string {
  const entry = SPANISH_NOTE_NAMES.find(([, intl]) => intl === note);
  if (!entry) throw new Error(`Nota internacional desconocida: ${note}`);
  return entry[0];
}

/** Notación española (DO, RE...) -> notación internacional. */
export function internationalForSpanish(note: string): string {
  const entry = SPANISH_NOTE_NAMES.find(([spanish]) => spanish === note);
  if (!entry) throw new Error(`Nota española desconocida: ${note}`);
  return entry[1];
}

/** Sube o baja semitonos sobre el índice cromático 0-11, envolviendo la octava. */
export function transposeNote(note: string, semitones: number): string {
  const index = CHROMATIC_NOTES.indexOf(note);
  if (index < 0) throw new Error(`Nota desconocida: ${note}`);
  return CHROMATIC_NOTES[(index + semitones + 12 * 10) % 12];
}
