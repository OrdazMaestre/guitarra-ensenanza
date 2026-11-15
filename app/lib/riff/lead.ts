// Nota guía de un golpe (pura): la más grave en un power chord, la más aguda en cualquier otro acorde.
// La usan reduce.ts (lo que se toca en los niveles traducidos) y lowerStrings.ts (qué compases se bajan).
import type { ChartNote } from './chart';

export const POWER_CHORD_INTERVALS = new Set([0, 5, 7, 12, 17, 19, 24]);

// `realMidi`: alturas REALES por id (tab bajada una cuerda, lowerStrings.ts): la nota guía de un golpe se
// elige con ellas, porque bajar una cuerda cambia los intervalos de un acorde que cruza la Sol y la Si
// (-4 en vez de -5) y la guía podía pasar de la melodía al bajo.
export function leadOf(notes: ChartNote[], realMidi?: Map<number, number>): ChartNote {
  if (notes.length === 1) return notes[0];
  const midi = (note: ChartNote) => realMidi?.get(note.id) ?? note.midi;
  const sorted = [...notes].sort((a, b) => midi(a) - midi(b));
  const low = sorted[0];
  const isPowerChord = sorted.every((note) => POWER_CHORD_INTERVALS.has(midi(note) - midi(low)));
  return isPowerChord ? low : sorted[sorted.length - 1];
}
