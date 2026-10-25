// Niveles del juego de tablatura. 'experto' es la tablatura real (chart.ts); el resto son niveles
// TRADUCIDOS a un patrón más sencillo (reduce.ts), al estilo Guitar Hero / Rock Band: cada nivel es
// solo un perfil -- qué botones (cuerda + trastes) usa, con qué densidad de notas y cuántas notas
// a la vez admite. Añadir un nivel = añadir un perfil.

// Ids internos: los del modo trastes sin sufijo; los del modo cuerdas que repiten nombre, con
// '-cuerdas' (los dos modos tienen un "Medio" y un "Avanzado", decisión del usuario).
export type RiffLevel = 'practica' | 'facil' | 'medio' | 'avanzado' | 'medio-cuerdas' | 'avanzado-cuerdas' | 'dificil' | 'experto';

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
  // Color de las gemas: por traste (arcoíris: 0 rojo ... ) o por cuerda.
  colorBy: 'fret' | 'string';
  // Cuerdas libres: vale el traste correcto en CUALQUIER cuerda (solo cuenta el traste).
  freeStrings: boolean;
  // Tope opcional de notas por segundo real (densidad al estilo Guitar Hero).
  maxNotesPerSecond?: number;
}

// Nombres (decisión del usuario, 2026-10-25): modo trastes = Práctica, Fácil, Medio, Avanzado;
// modo cuerdas = Medio, Avanzado, Difícil, Experto (Experto, el último: la tablatura real).
// Densidad (decisiones del usuario):
// - Práctica: quita como MUCHO la mitad de las notas; medido: 49-55 % de golpes en Master of
//   Puppets y 84-100 % en canciones lentas.
// - Fácil (trastes; antes "Neófito"): como el "Difícil" (Hard) de Guitar Hero (en los charts
//   oficiales Hard tiene ~206 notas/min frente a ~295 en Expert, ≈70 %). Objetivo del usuario:
//   65-70 % de las notas. Medido en Master of Puppets: Kirk 65,2 %, James 69,5 %; del compás 42
//   (9 Mi seguidos) deja 5. Ahí casi todo va en corcheas (140 ms), así que los huecos mínimos solos
//   saltan de ~73 % a ~63 %; el ajuste fino lo da `maxNotesPerSecond` (6).
// - Medio y Avanzado (trastes; antes "Principiante" y "Fácil"): como Guitar Hero EXPERTO, casi
//   todas las notas, "chugs" rápidos incluidos (rejilla de semicorchea, sin hueco extra para
//   repeticiones): 100 % de golpes en Master of Puppets, compás 42 entero (9 Mi al aire seguidos).
// Avanzado (trastes) llega al traste 10 y no al 12: con el teclado físico la cuerda 6 solo tiene
// teclas hasta el traste 10 (ShiftRight, ver FRETBOARD_KEYMAP). Decisión del usuario.
// Modo cuerdas Medio (cuerdas 5-6), Avanzado (4-6) y Difícil (3-6): perfiles aún sin construir.
export const RIFF_LEVELS: Record<Exclude<RiffLevel, 'experto'>, LevelProfile> = {
  practica: { label: 'Práctica', available: true, strings: [6], minFret: 0, maxFret: 5, gridBeats: 0.5, minGapBeats: 0.5, minGapSeconds: 0.15, repeatGapSeconds: 0.2, maxChord: 1, colorBy: 'fret', freeStrings: true },
  facil: { label: 'Fácil', available: true, strings: [6], minFret: 0, maxFret: 5, gridBeats: 0.25, minGapBeats: 0.25, minGapSeconds: 0.1, repeatGapSeconds: 0.15, maxChord: 1, colorBy: 'fret', freeStrings: true, maxNotesPerSecond: 6 },
  medio: { label: 'Medio', available: true, strings: [6], minFret: 0, maxFret: 5, gridBeats: 0.25, minGapBeats: 0.25, minGapSeconds: 0.06, repeatGapSeconds: 0, maxChord: 1, colorBy: 'fret', freeStrings: true },
  avanzado: { label: 'Avanzado', available: true, strings: [6], minFret: 0, maxFret: 10, gridBeats: 0.25, minGapBeats: 0.25, minGapSeconds: 0.06, repeatGapSeconds: 0, maxChord: 1, colorBy: 'fret', freeStrings: true },
  'medio-cuerdas': { label: 'Medio', available: false, strings: [5, 6], minFret: 0, maxFret: 12, gridBeats: 0.25, minGapBeats: 0.25, minGapSeconds: 0.08, repeatGapSeconds: 0.1, maxChord: 2, colorBy: 'string', freeStrings: false },
  'avanzado-cuerdas': { label: 'Avanzado', available: false, strings: [4, 5, 6], minFret: 0, maxFret: 12, gridBeats: 0.25, minGapBeats: 0.25, minGapSeconds: 0.07, repeatGapSeconds: 0.09, maxChord: 2, colorBy: 'string', freeStrings: false },
  dificil: { label: 'Difícil', available: false, strings: [3, 4, 5, 6], minFret: 0, maxFret: 12, gridBeats: 0.125, minGapBeats: 0.125, minGapSeconds: 0.06, repeatGapSeconds: 0.08, maxChord: 3, colorBy: 'string', freeStrings: false },
};

// Dos modos de juego (decisión del usuario), cada uno con sus niveles de menos a más:
// - Trastes: cuerdas libres, solo cuenta el traste.
// - Cuerdas: cuenta la cuerda concreta.
export type RiffLevelGroup = 'trastes' | 'cuerdas';

export const RIFF_LEVEL_GROUPS: Array<{ id: RiffLevelGroup; label: string; levels: RiffLevel[] }> = [
  { id: 'trastes', label: 'Modo trastes', levels: ['practica', 'facil', 'medio', 'avanzado'] },
  { id: 'cuerdas', label: 'Modo cuerdas', levels: ['medio-cuerdas', 'avanzado-cuerdas', 'dificil', 'experto'] },
];

export const RIFF_LEVEL_ORDER: RiffLevel[] = RIFF_LEVEL_GROUPS.flatMap((g) => g.levels);

export function levelGroup(level: RiffLevel): RiffLevelGroup {
  return RIFF_LEVEL_GROUPS.find((g) => g.levels.includes(level))!.id;
}

export function levelLabel(level: RiffLevel) {
  return level === 'experto' ? 'Experto' : RIFF_LEVELS[level].label;
}
