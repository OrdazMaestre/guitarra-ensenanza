// Niveles del juego de tablatura. 'experto' es la tablatura real (chart.ts); el resto son niveles
// TRADUCIDOS a un patrón más sencillo (reduce.ts), al estilo Guitar Hero / Rock Band: cada nivel es
// solo un perfil -- qué botones (cuerda + trastes) usa, con qué densidad de notas y cuántas notas
// a la vez admite. Añadir un nivel = añadir un perfil.

export type RiffLevel = 'principiante' | 'facil' | 'medio' | 'dificil' | 'experto';

export interface LevelProfile {
  label: string;
  // false = sale en el menú como "pronto" (aún no construido).
  available: boolean;
  strings: number[];
  minFret: number;
  maxFret: number;
  // Rejilla preferida, en pulsos (2 = blancas, 1 = negras, 0.5 = corcheas...).
  gridBeats: number;
  // Distancia mínima entre dos notas seguidas, en pulsos.
  minGapBeats: number;
  // ...y en segundos reales (a tempo 100 %): en canciones rápidas la rejilla sola no basta.
  minGapSeconds: number;
  // Hueco mínimo si la nota REPITE la anterior (quita los "chugs" rápidos de la misma nota).
  repeatGapSeconds: number;
  // Notas a la vez (1 = sin acordes).
  maxChord: number;
  // Color de las gemas: por traste (Principiante: 0 rojo ... 5 morado) o por cuerda.
  colorBy: 'fret' | 'string';
}

// Densidad (decisión del usuario): quitar como MUCHO la mitad de las notas. Principiante equivale
// al "Hard" de Guitar Hero (aquí con 6 botones en vez de 5): fuera solo lo muy rápido (la mitad de
// los "chugs" de semicorchea a 212 bpm); medido: 49-55 % de golpes en Master of Puppets y 84-100 %
// en canciones lentas. Fácil tiene más botones y conserva todavía más (87-99 %).
// Fácil llega al traste 10 y no al 12: con el teclado físico la cuerda 6 solo tiene teclas hasta
// el traste 10 (ShiftRight, ver FRETBOARD_KEYMAP). Decisión del usuario.
export const RIFF_LEVELS: Record<Exclude<RiffLevel, 'experto'>, LevelProfile> = {
  principiante: { label: 'Principiante', available: true, strings: [6], minFret: 0, maxFret: 5, gridBeats: 0.5, minGapBeats: 0.5, minGapSeconds: 0.15, repeatGapSeconds: 0.2, maxChord: 1, colorBy: 'fret' },
  facil: { label: 'Fácil', available: true, strings: [6], minFret: 0, maxFret: 10, gridBeats: 0.25, minGapBeats: 0.25, minGapSeconds: 0.1, repeatGapSeconds: 0.14, maxChord: 1, colorBy: 'string' },
  medio: { label: 'Medio', available: false, strings: [5, 6], minFret: 0, maxFret: 12, gridBeats: 0.25, minGapBeats: 0.25, minGapSeconds: 0.08, repeatGapSeconds: 0.1, maxChord: 2, colorBy: 'string' },
  dificil: { label: 'Difícil', available: false, strings: [3, 4, 5, 6], minFret: 0, maxFret: 12, gridBeats: 0.125, minGapBeats: 0.125, minGapSeconds: 0.06, repeatGapSeconds: 0.08, maxChord: 3, colorBy: 'string' },
};

export const RIFF_LEVEL_ORDER: RiffLevel[] = ['principiante', 'facil', 'medio', 'dificil', 'experto'];

export function levelLabel(level: RiffLevel) {
  return level === 'experto' ? 'Experto' : RIFF_LEVELS[level].label;
}
