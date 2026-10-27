// Colores del juego de tablatura (sin React, para poder probarlos en Node).

// Colores por cuerda, de grave a aguda (decisión del usuario, 2026-10-27): rojo, verde, naranja,
// azul, amarillo y morado. Es el patrón de TODO el modo cuerdas: Medio (Mi + La) usa rojo y verde,
// el siguiente añade naranja... y Experto los seis. Dentro del juego el rojo es el de la cuerda 6;
// por eso un fallo se pinta en GRIS.
export const RIFF_STRING_COLORS: Record<number, string> = {
  1: '#a855f7',
  2: '#facc15',
  3: '#3b82f6',
  4: '#f97316',
  5: '#22c55e',
  6: '#ef4444',
};

// Niveles por traste (colorBy 'fret', modo trastes): arcoíris rojo, naranja, amarillo, verde,
// azul, morado repartido sobre los trastes del nivel. Con 0-5 cada traste tiene exactamente uno de
// esos 6 colores (decisión del usuario); con más trastes (0-10) salen tonos intermedios mezclando
// los dos vecinos. Es independiente de los colores de cuerda (que tienen otro orden).
const RAINBOW = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#a855f7'];

export function fretColor(fret: number, minFret: number, maxFret: number): string {
  const span = Math.max(1, maxFret - minFret);
  const pos = (Math.min(maxFret, Math.max(minFret, fret)) - minFret) / span * (RAINBOW.length - 1);
  const i = Math.min(RAINBOW.length - 2, Math.floor(pos));
  const k = pos - i;
  const rgb = (hex: string) => [1, 3, 5].map((j) => parseInt(hex.slice(j, j + 2), 16));
  const a = rgb(RAINBOW[i]);
  const b = rgb(RAINBOW[i + 1]);
  return `#${a.map((c, j) => Math.round(c + (b[j] - c) * k).toString(16).padStart(2, '0')).join('')}`;
}
