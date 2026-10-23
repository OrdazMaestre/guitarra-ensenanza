// Colores del juego de tablatura (sin React, para poder probarlos en Node).

// Colores por cuerda (decisión del usuario): 6 rojo, 5 naranja, 4 amarillo, 3 verde, 2 azul,
// 1 morado. Dentro del juego el rojo es el de la cuerda 6; por eso un fallo se pinta en GRIS.
export const RIFF_STRING_COLORS: Record<number, string> = {
  1: '#a855f7',
  2: '#3b82f6',
  3: '#22c55e',
  4: '#facc15',
  5: '#f97316',
  6: '#ef4444',
};

// Niveles por traste (colorBy 'fret'): arcoíris con los colores de las cuerdas en orden (rojo,
// naranja, amarillo, verde, azul, morado) repartido sobre los trastes del nivel. Con 0-5 cada traste
// tiene exactamente uno de esos 6 colores (decisión del usuario); con más trastes (Fácil, 0-10) salen
// tonos intermedios mezclando los dos vecinos.
const RAINBOW = [6, 5, 4, 3, 2, 1].map((string) => RIFF_STRING_COLORS[string]);

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
