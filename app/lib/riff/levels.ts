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
  // Zonas de trastes (de, a) para niveles de una cuerda: la primera para las notas graves y la
  // última para las agudas, cortando por la mitad de las octavas del instrumento (ver reduce.ts).
  zones?: Array<[number, number]>;
  // Hueco mínimo de la rejilla en segundos reales: donde una semicorchea dura menos, la rejilla
  // pasa a corcheas (ver gridSlots en reduce.ts).
  minSlotSeconds?: number;
  // Traste máximo de cada cuerda, si no es el mismo para todas (modo cuerdas: lo que alcanza el
  // teclado físico, ver FRETBOARD_KEYMAP -- Mi hasta el 10, La hasta el 11, Re y Sol hasta el 12).
  maxFretByString?: Record<number, number>;
}

const KEYBOARD_MAX_FRET: Record<number, number> = { 6: 10, 5: 11, 4: 12, 3: 12 };
// Modo cuerdas (no Experto): un poco menos denso que el 100 % (petición del usuario, 2026-10-27:
// "más abrumador de lo esperado"): rejilla de semicorcheas que pasa a CORCHEAS donde una semicorchea
// dura menos de 0,1 s reales (Master of Puppets, a 212 bpm). Solo recorta lo que va de verdad
// rápido -- Kirk 89 % (su solo tenía picos de 15 notas/s), James 99 %, Thunderstruck y las canciones
// lentas 100 % --, quita siempre las mismas notas en cada repetición y se queda con las del pulso
// (el barrido del solo sigue pareciendo un barrido). Se probaron y descartaron: un tope de notas por
// segundo como el de Fácil (quitaba notas distintas cada vez y rompía los dibujos repetidos), una
// rejilla fija de corcheas (dejaba Thunderstruck en la mitad) y un hueco mínimo de 0,1 s entre notas
// (en el barrido se quedaba con 17-13-13 y perdía la forma).
const CUERDAS_MIN_SLOT_SECONDS = 0.1;

// Nombres (decisión del usuario, 2026-10-25): modo trastes = Principiante, Fácil, Medio, Avanzado;
// modo cuerdas = Medio, Avanzado, Difícil, Experto (Experto, el último: la tablatura real).
// Densidad (decisiones del usuario):
// - Principiante: quita como MUCHO la mitad de las notas; medido: 49-55 % de golpes en Master of
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
// Modo cuerdas: Medio (cuerdas 5-6), Avanzado (4-6) y Difícil (3-6), todos hechos (de uno en uno,
// decisión del usuario).
export const RIFF_LEVELS: Record<Exclude<RiffLevel, 'experto'>, LevelProfile> = {
  practica: { label: 'Principiante', available: true, strings: [6], minFret: 0, maxFret: 5, gridBeats: 0.5, minGapBeats: 0.5, minGapSeconds: 0.15, repeatGapSeconds: 0.2, maxChord: 1, colorBy: 'fret', freeStrings: true },
  facil: { label: 'Fácil', available: true, strings: [6], minFret: 0, maxFret: 5, gridBeats: 0.25, minGapBeats: 0.25, minGapSeconds: 0.1, repeatGapSeconds: 0.15, maxChord: 1, colorBy: 'fret', freeStrings: true, maxNotesPerSecond: 6 },
  medio: { label: 'Medio', available: true, strings: [6], minFret: 0, maxFret: 5, gridBeats: 0.25, minGapBeats: 0.25, minGapSeconds: 0.06, repeatGapSeconds: 0, maxChord: 1, colorBy: 'fret', freeStrings: true },
  // Avanzado: dos "Guitar Hero" seguidos (decisión del usuario, 2026-10-28) -- graves en 0-5, agudas en
  // 5-10 (el 5, en las dos).
  avanzado: { label: 'Avanzado', available: true, strings: [6], minFret: 0, maxFret: 10, zones: [[0, 5], [5, 10]], gridBeats: 0.25, minGapBeats: 0.25, minGapSeconds: 0.06, repeatGapSeconds: 0, maxChord: 1, colorBy: 'fret', freeStrings: true },
  // Modo cuerdas Medio: Mi + La (en cuartas exactas), densidad de Medio (trastes); la tab se
  // coloca en las dos cuerdas con el camino de menor coste (reduce.ts, placeSequence).
  'medio-cuerdas': { label: 'Medio', available: true, strings: [5, 6], minFret: 0, maxFret: 11, maxFretByString: KEYBOARD_MAX_FRET, gridBeats: 0.25, minSlotSeconds: CUERDAS_MIN_SLOT_SECONDS, minGapBeats: 0.25, minGapSeconds: 0.06, repeatGapSeconds: 0, maxChord: 1, colorBy: 'string', freeStrings: false },
  // Modo cuerdas Avanzado: Mi + La + Re (cuartas exactas), misma densidad y colocación que Medio.
  'avanzado-cuerdas': { label: 'Avanzado', available: true, strings: [4, 5, 6], minFret: 0, maxFret: 12, maxFretByString: KEYBOARD_MAX_FRET, gridBeats: 0.25, minSlotSeconds: CUERDAS_MIN_SLOT_SECONDS, minGapBeats: 0.25, minGapSeconds: 0.06, repeatGapSeconds: 0, maxChord: 1, colorBy: 'string', freeStrings: false },
  // Modo cuerdas Difícil: Mi + La + Re + Sol (las cuatro en cuartas exactas), mismo motor, densidad y
  // límites que Medio y Avanzado cuerdas (2026-10-28).
  dificil: { label: 'Difícil', available: true, strings: [3, 4, 5, 6], minFret: 0, maxFret: 12, maxFretByString: KEYBOARD_MAX_FRET, gridBeats: 0.25, minSlotSeconds: CUERDAS_MIN_SLOT_SECONDS, minGapBeats: 0.25, minGapSeconds: 0.06, repeatGapSeconds: 0, maxChord: 1, colorBy: 'string', freeStrings: false },
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
