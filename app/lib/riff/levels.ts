// Niveles del juego de tablatura. 'experto' es la tablatura real (chart.ts); el resto son niveles
// TRADUCIDOS a un patrón más sencillo (reduce.ts), al estilo Guitar Hero / Rock Band: cada nivel es
// solo un perfil -- qué botones (cuerda + trastes) usa, con qué densidad de notas y cuántas notas
// a la vez admite. Añadir un nivel = añadir un perfil.

// Ids internos: los del modo trastes sin sufijo; los del modo cuerdas que repiten nombre, con
// '-cuerdas' (los dos modos tienen un "Medio" y un "Avanzado", decisión del usuario).
export type RiffLevel = 'practica' | 'facil' | 'medio' | 'avanzado' | 'medio-cuerdas' | 'avanzado-cuerdas' | 'dificil' | 'hibrido' | 'experto';

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
  // Tope opcional de notas por ventana del compás (`quarters` negras desde el inicio del compás):
  // como mucho `max`, solo si van rápido (algún hueco de menos de `belowSeconds` reales). Ligado a
  // la posición en el compás, así un riff repetido pierde siempre las mismas notas (ver reduce.ts).
  fastWindow?: { quarters: number; max: number; belowSeconds: number };
  // Factor de los márgenes de tiempo para puntuar y acertar (session.ts, `RiffOptions.timingScale`):
  // 0,6 = todos al 60 %. Sin él, los márgenes normales.
  timingScale?: number;
  // Zonas de trastes (de, a) para niveles de una cuerda: la primera para las notas graves y la
  // última para las agudas, cortando por la mitad de las octavas del instrumento (ver reduce.ts).
  zones?: Array<[number, number]>;
  // Primer traste de la "mitad derecha" de cada cuerda (pasajes rápidos traspuestos, ver reduce.ts),
  // si no es la mitad de su tope.
  rightHalfFrom?: Record<number, number>;
  // Hueco mínimo de la rejilla en segundos reales: donde una semicorchea dura menos, la rejilla
  // pasa a corcheas (ver gridSlots en reduce.ts).
  minSlotSeconds?: number;
  // Nivel hecho de otros dos (ver reduce.ts): la cuerda de cada nota sale de `strings` y su traste,
  // de `frets`.
  compose?: { strings: Exclude<RiffLevel, 'experto'>; frets: Exclude<RiffLevel, 'experto'> };
  // Traste máximo de cada cuerda, si no es el mismo para todas (modo cuerdas: lo que alcanza el
  // teclado físico, ver FRETBOARD_KEYMAP -- Mi hasta el 10, La hasta el 11, Re y Sol hasta el 12).
  maxFretByString?: Record<number, number>;
}

const KEYBOARD_MAX_FRET: Record<number, number> = { 6: 10, 5: 11, 4: 12, 3: 12 };
// Modo cuerdas (no Experto): la MISMA densidad que Medio y Avanzado trastes (decisión del usuario,
// 2026-11-02: no cuadraba que el modo trastes tuviera más notas). Antes, la rejilla pasaba a corcheas
// donde una semicorchea duraba menos de 0,1 s (2026-10-27, "más abrumador de lo esperado"); a cambio,
// ahora los pasajes rápidos tienen que ser TOCABLES (ver unplayableBeats en reduce.ts).

// Nombres (decisión del usuario, 2026-10-25): modo trastes = Principiante, Fácil, Medio, Avanzado;
// modo cuerdas = Medio, Avanzado, Difícil, Experto (Experto, el último: la tablatura real).
// Rejilla de FUSAS (1/8 de negra) en Medio y Avanzado trastes y en todo el modo cuerdas menos Experto
// (decisión del usuario, 2026-11-02): con semicorcheas, dos notas en el mismo hueco de semicorchea
// (fusas, tresillos y seisillos de semicorchea) se quedaban en una. En el modo cuerdas la rejilla se
// sigue ensanchando donde un hueco dura menos de `minSlotSeconds` (0,1 s).
// Densidad (decisiones del usuario; revisada el 2026-10-31 con las canciones de la web: en Electric
// Warlock e Iron Rain, que van en corcheas a 150-175 ms, Principiante y Fácil salían casi iguales que
// Medio, porque la rejilla en pulsos no les quitaba nada). Ahora los filtros van en SEGUNDOS reales:
// - Principiante: como entre el "Fácil" y el "Medio" de Guitar Hero. Nunca dos notas a menos de
//   0,25 s; donde una corchea dura menos de 0,24 s la rejilla pasa a negras (`minSlotSeconds`).
//   Medido: Master of Puppets 38-40 %, Iron Rain 37-39 %, Electric Warlock 60 %, Black Gilmur 57 %.
// - Fácil (trastes; antes "Neófito"): como el "Difícil" (Hard) de Guitar Hero (en los charts
//   oficiales Hard tiene ~206 notas/min frente a ~295 en Expert, ≈70 %). Repeticiones a menos de
//   0,22 s fuera, y en las partes rápidas como mucho 3 notas por cada 2 negras (`fastWindow`).
//   Medido: Master of Puppets 62-68 %, Iron Rain 70-72 %; del compás 42 (9 Mi seguidos) deja 5.
//   Las canciones poco densas (Electric Warlock, Black Gilmur, ~3 notas/s) quedan en 90-96 %.
// - Medio y Avanzado (trastes; antes "Principiante" y "Fácil"): como Guitar Hero EXPERTO, casi
//   todas las notas, "chugs" rápidos incluidos (rejilla de semicorchea, sin hueco extra para
//   repeticiones): 100 % de golpes en Master of Puppets, compás 42 entero (9 Mi al aire seguidos).
// Avanzado (trastes) llega al traste 10 y no al 12: con el teclado físico la cuerda 6 solo tiene
// teclas hasta el traste 10 (ShiftRight, ver FRETBOARD_KEYMAP). Decisión del usuario.
// Modo cuerdas: Medio (cuerdas 5-6), Avanzado (4-6) y Difícil (3-6), todos hechos (de uno en uno,
// decisión del usuario).
export const RIFF_LEVELS: Record<Exclude<RiffLevel, 'experto'>, LevelProfile> = {
  practica: { label: 'Principiante', available: true, strings: [6], minFret: 0, maxFret: 5, gridBeats: 0.5, minSlotSeconds: 0.24, minGapBeats: 0.5, minGapSeconds: 0.25, repeatGapSeconds: 0.35, maxChord: 1, colorBy: 'fret', freeStrings: true },
  facil: { label: 'Fácil', available: true, strings: [6], minFret: 0, maxFret: 5, gridBeats: 0.25, minSlotSeconds: 0.13, minGapBeats: 0.25, minGapSeconds: 0.13, repeatGapSeconds: 0.22, maxChord: 1, colorBy: 'fret', freeStrings: true, fastWindow: { quarters: 2, max: 3, belowSeconds: 0.2 } },
  // Medio y Avanzado (trastes): márgenes de puntuación al 60 % (petición del usuario, 2026-10-31: los
  // dos primeros niveles del modo trastes han de ser fáciles y motivadores, y el modo cuerdas ya es
  // bastante difícil, así que esos se quedan con los márgenes normales).
  medio: { label: 'Medio', available: true, strings: [6], minFret: 0, maxFret: 5, gridBeats: 0.125, minGapBeats: 0.125, minGapSeconds: 0.06, repeatGapSeconds: 0, maxChord: 1, colorBy: 'fret', freeStrings: true, timingScale: 0.6 },
  // Avanzado: dos "Guitar Hero" seguidos (decisión del usuario, 2026-10-28) -- graves a la izquierda,
  // agudas a la derecha --, SOLAPADOS (2026-11-02): graves en 0-6 y agudas en 4-10 (4, 5 y 6 en las dos),
  // porque la cuerda 6 solo llega al 10 con el teclado y dos mitades justas dejaban poco sitio.
  avanzado: { label: 'Avanzado', available: true, strings: [6], minFret: 0, maxFret: 10, zones: [[0, 6], [4, 10]], gridBeats: 0.125, minGapBeats: 0.125, minGapSeconds: 0.06, repeatGapSeconds: 0, maxChord: 1, colorBy: 'fret', freeStrings: true, timingScale: 0.6 },
  // Modo cuerdas Medio: Mi + La (en cuartas exactas), densidad de Medio (trastes); la tab se
  // coloca en las dos cuerdas con el camino de menor coste (reduce.ts, placeSequence).
  // Sus cuerdas (6 y 5) llegan solo al 10 y al 11 con el teclado: la mitad derecha de cada una (pasajes
  // rápidos traspuestos) empieza en el traste 4, solapada con la izquierda (decisión del usuario, 2026-11-02).
  'medio-cuerdas': { label: 'Medio', available: true, strings: [5, 6], minFret: 0, maxFret: 11, maxFretByString: KEYBOARD_MAX_FRET, rightHalfFrom: { 5: 4, 6: 4 }, gridBeats: 0.125, minGapBeats: 0.125, minGapSeconds: 0.06, repeatGapSeconds: 0, maxChord: 1, colorBy: 'string', freeStrings: false },
  // Modo cuerdas Avanzado: Mi + La + Re (cuartas exactas), misma densidad y colocación que Medio.
  'avanzado-cuerdas': { label: 'Avanzado', available: true, strings: [4, 5, 6], minFret: 0, maxFret: 12, maxFretByString: KEYBOARD_MAX_FRET, gridBeats: 0.125, minGapBeats: 0.125, minGapSeconds: 0.06, repeatGapSeconds: 0, maxChord: 1, colorBy: 'string', freeStrings: false },
  // Modo cuerdas Difícil: Mi + La + Re + Sol (las cuatro en cuartas exactas), mismo motor, densidad y
  // límites que Medio y Avanzado cuerdas (2026-10-28).
  dificil: { label: 'Difícil', available: true, strings: [3, 4, 5, 6], minFret: 0, maxFret: 12, maxFretByString: KEYBOARD_MAX_FRET, gridBeats: 0.125, minGapBeats: 0.125, minGapSeconds: 0.06, repeatGapSeconds: 0, maxChord: 1, colorBy: 'string', freeStrings: false },
  // Híbrido (petición del usuario, 2026-11-07): la cuerda de cada nota, la de Medio (cuerdas); su
  // traste, el de Medio (trastes), en Mi y La con los trastes 0-5. Cuenta la cuerda, como el modo cuerdas.
  hibrido: { label: 'Híbrido', available: true, strings: [5, 6], minFret: 0, maxFret: 5, compose: { strings: 'medio-cuerdas', frets: 'medio' }, gridBeats: 0.125, minGapBeats: 0.125, minGapSeconds: 0.06, repeatGapSeconds: 0, maxChord: 1, colorBy: 'string', freeStrings: false },
};

// Dos modos de juego (decisión del usuario), cada uno con sus niveles de menos a más:
// - Trastes: cuerdas libres, solo cuenta el traste.
// - Cuerdas: cuenta la cuerda concreta.
export type RiffLevelGroup = 'trastes' | 'cuerdas';

export const RIFF_LEVEL_GROUPS: Array<{ id: RiffLevelGroup; label: string; levels: RiffLevel[] }> = [
  { id: 'trastes', label: 'Modo trastes', levels: ['practica', 'facil', 'medio', 'avanzado'] },
  { id: 'cuerdas', label: 'Modo cuerdas', levels: ['medio-cuerdas', 'avanzado-cuerdas', 'dificil', 'experto'] },
];

// Nivel que va debajo de las dos columnas: no es de ningún modo.
export const RIFF_HYBRID_LEVEL: RiffLevel = 'hibrido';

export const RIFF_LEVEL_ORDER: RiffLevel[] = [...RIFF_LEVEL_GROUPS.flatMap((g) => g.levels), RIFF_HYBRID_LEVEL];

export function levelGroup(level: RiffLevel): RiffLevelGroup {
  return RIFF_LEVEL_GROUPS.find((g) => g.levels.includes(level))?.id ?? 'cuerdas';
}

export function levelLabel(level: RiffLevel) {
  return level === 'experto' ? 'Experto' : RIFF_LEVELS[level].label;
}

// Carril ESTIRADO (petición del usuario, 2026-10-31): desde Fácil en modo trastes y en todo el modo
// cuerdas, por encima del 75 % de velocidad los compases se ven MÁS LARGOS en la autopista y las notas
// caen más deprisa (al 100 %: compases un 33 % más largos que al 75 %; notas más separadas en pasajes
// rápidos, se ve mejor el orden). Principiante ya tiene pocas notas y se queda igual.
export const STRETCH_LANE_SPEED = 0.75;
export function stretchesLane(level: RiffLevel) {
  return level !== 'practica';
}

// Segundos REALES que caben en la autopista. Un segundo de canción ocupa 1 / (speed × lookahead) del
// carril: con el factor (0,75 / speed) a secas, a 100 % ocupaba lo mismo que a 75 % (compases iguales,
// el usuario no veía diferencia); al CUADRADO, a 100 % ocupa 4/3 (1,8 s reales en pantalla, caída
// ×1,78). Hasta 75 %, igual que siempre.
export function laneLookaheadSeconds(base: number, speed: number, stretch: boolean) {
  return stretch && speed > STRETCH_LANE_SPEED ? base * (STRETCH_LANE_SPEED / speed) ** 2 : base;
}
