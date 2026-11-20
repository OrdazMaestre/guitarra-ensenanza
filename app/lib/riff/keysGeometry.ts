// Geometría pura del mástil en modo teclado (ver KeysNeck.tsx para el dibujo). Sacado de KeysNeck.tsx
// porque `keyAt`/`keyRect` se llaman de forma imperativa fuera del JSX, dentro del manejo de puntero de
// ReducedFretboardDiagram.tsx -- y ese archivo ahora carga KeysNeck.tsx con next/dynamic (componentes
// resueltos de forma asíncrona), así que las funciones que necesita de forma síncrona viven aparte.
import { isBlackKey } from './keys';

export interface KeysNeckGeometry {
  // Borde izquierdo de la columna de una tecla y su ancho (ya con el modo zurdo: `x(fret)` es el borde
  // lógico izquierdo, que `drawX` refleja).
  colLeft: (fret: number) => number;
  colWidth: number;
  drawX: (x: number) => number;
  top: number;
  height: number;
  // MIDI de la columna 0 y número de columnas.
  low: number;
  count: number;
}

// Las negras ocupan la parte de arriba de la tabla.
export const BLACK_KEY_DEPTH = 0.56;

// Rectángulo de una tecla en coordenadas del viewBox (ya reflejado en zurdo).
export function keyRect(fret: number, g: KeysNeckGeometry): { x: number; y: number; w: number; h: number } {
  const midi = g.low + fret;
  let from = fret;
  let to = fret + 1;
  if (!isBlackKey(midi)) {
    if (fret > 0 && isBlackKey(midi - 1)) from -= 0.5;
    if (fret < g.count - 1 && isBlackKey(midi + 1)) to += 0.5;
  }
  const a = g.drawX(g.colLeft(0) + from * g.colWidth);
  const b = g.drawX(g.colLeft(0) + to * g.colWidth);
  const h = isBlackKey(midi) ? g.height * BLACK_KEY_DEPTH : g.height;
  return { x: Math.min(a, b), y: g.top, w: Math.abs(b - a), h };
}

// Qué tecla hay en un punto (x lógica, sin reflejar; y del viewBox): arriba, la negra si la columna es
// negra; si no (o abajo), la blanca de ese trozo. null = fuera.
export function keyAt(x: number, y: number, g: KeysNeckGeometry): number | null {
  const col = (x - g.colLeft(0)) / g.colWidth;
  if (col < 0 || col >= g.count || y < g.top - 20 || y > g.top + g.height + 20) return null;
  const fret = Math.floor(col);
  const midi = g.low + fret;
  if (!isBlackKey(midi)) return fret;
  if (y <= g.top + g.height * BLACK_KEY_DEPTH) return fret;
  // Debajo de una negra: la blanca de su lado.
  const side = col - fret < 0.5 ? fret - 1 : fret + 1;
  return Math.max(0, Math.min(g.count - 1, side));
}
