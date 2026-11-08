// Colores del juego de tablatura (sin React, para poder probarlos en Node).

// Colores por cuerda, de grave a aguda (decisión del usuario, 2026-10-27; cambiados el 2026-11-08
// porque el naranja se confundía con el rojo, y el morado con el azul): rojo, verde, azul,
// amarillo, morado y naranja. Es el patrón de TODO el modo cuerdas: Medio (Mi + La) usa rojo y verde,
// el siguiente añade azul... y Experto los seis. Dentro del juego el rojo es el de la cuerda 6;
// por eso un fallo se pinta en GRIS.
export const RIFF_STRING_COLORS: Record<number, string> = {
  1: '#f97316',
  2: '#a855f7',
  3: '#facc15',
  4: '#3b82f6',
  5: '#22c55e',
  6: '#ef4444',
  // Cuerdas graves de los instrumentos de más de 6 (solo en Experto).
  7: '#ec4899',
  8: '#14b8a6',
  9: '#84cc16',
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

// Niveles con cuerdas (petición del usuario, 2026-11-08): la gema toma el color de su cuerda, muy
// OSCURO en el traste 0, VIVO a mitad del tope de esa cuerda en el nivel y muy CLARO en el tope
// (Mi con tope 10: vivo en el 5; con tope 12, en el 6; Híbrido, tope 5: en el 2-3).
// Suavizado (usuario, 2026-11-08): con 0,4 / 0,7 los extremos de cuerdas distintas se parecían.
const DARK_SHADE = 0.65;
const LIGHT_MIX = 0.4;

export function stringFretColor(string: number, fret: number, maxFret: number): string {
  const base = RIFF_STRING_COLORS[string] ?? '#ffffff';
  const rgb = [1, 3, 5].map((j) => parseInt(base.slice(j, j + 2), 16));
  const t = Math.min(1, Math.max(0, fret / Math.max(1, maxFret)));
  const mixed = t <= 0.5
    ? rgb.map((c) => c * (DARK_SHADE + (1 - DARK_SHADE) * (t / 0.5)))
    : rgb.map((c) => c + (255 - c) * LIGHT_MIX * ((t - 0.5) / 0.5));
  return `#${mixed.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}
