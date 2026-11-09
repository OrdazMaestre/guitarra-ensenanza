// Frases del juego (petición del usuario, 2026-11-09). Puras, para probarlas en Node.
import type { RiffLevel } from './levels';

// Una por nivel, en línea entre la cuenta atrás y el mástil. Suben de tono con la dificultad
// (Principiante → Fácil → Medio → Avanzado → Híbrido → Medio, Avanzado y Difícil cuerdas → Experto).
export const COUNTDOWN_PHRASES: Record<RiffLevel, string> = {
  practica: 'Practica',
  facil: 'Ensaya',
  medio: 'Diviértete',
  avanzado: 'Abre bien los ojos',
  hibrido: 'Ponte a prueba',
  'medio-cuerdas': 'Sufre',
  'avanzado-cuerdas': 'Vuelve al nivel anterior',
  dificil: 'Estás loco',
  experto: 'Se acabó el juego',
};

// Experto: además, frases que van apareciendo ENCIMA de las notas mientras se toca, en orden
// aleatorio ("Se acabó el juego" queda para la cuenta atrás). Las 8 primeras son del usuario.
export const EXPERTO_PHRASES = [
  'Visualizando tablaturas reales',
  'Es más fácil con una guitarra de verdad',
  'Es satisfactorio ver caer las notas',
  'Adaptando cualquier canción a 12 trastes',
  'Haz los tutoriales',
  'Baja la velocidad y practica con la guitarra aunque no puntúe',
  'Mola el sonido arcade que tienen las canciones',
  'Diseñado para ver, no para jugar',
  'Cada nota cae donde la escribió el autor',
  'Aquí se aprende a leer, no a ganar',
  'Mira la forma que hace la mano',
  'Toca a la vez con tu guitarra',
  'Ni los profesionales las aciertan todas',
];

// Siempre hay una frase a la vista (usuario, 2026-11-09); cada PHRASE_PERIOD_SECONDS reales cambia
// por otra, con un fundido de PHRASE_FADE_SECONDS al salir y al entrar. Función pura del tiempo de la
// canción: se congela en pausa.
export const PHRASE_PERIOD_SECONDS = 10;
export const PHRASE_FADE_SECONDS = 0.6;

function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(count: number, seed: number): number[] {
  const order = Array.from({ length: count }, (_, k) => k);
  const next = random(seed);
  for (let k = count - 1; k > 0; k--) {
    const j = Math.floor(next() * (k + 1));
    [order[k], order[j]] = [order[j], order[k]];
  }
  return order;
}

// Frase que se ve en el segundo real `realPos` de la partida. Cada vuelta por
// la lista es una nueva permutación de la semilla; nunca sale la misma frase dos veces seguidas.
export function ambientPhrase(phrases: string[], realPos: number, seed: number): { text: string; alpha: number } | null {
  if (phrases.length === 0 || realPos < 0) return null;
  const cycle = Math.floor(realPos / PHRASE_PERIOD_SECONDS);
  const t = realPos - cycle * PHRASE_PERIOD_SECONDS;
  const n = phrases.length;
  const round = Math.floor(cycle / n);
  const order = shuffled(n, seed + round);
  // Costura entre vueltas: si la primera de esta vuelta es la última de la anterior, se cambian.
  if (round > 0 && n > 1 && order[0] === shuffled(n, seed + round - 1)[n - 1]) [order[0], order[1]] = [order[1], order[0]];
  const alpha = Math.min(1, t / PHRASE_FADE_SECONDS, (PHRASE_PERIOD_SECONDS - t) / PHRASE_FADE_SECONDS);
  return { text: phrases[order[cycle % n]], alpha };
}
