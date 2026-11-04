// Altura (en el mástil) a la que caen las notas del juego en cada nivel. Pura, para probarla en Node.
//
// Experto: cada nota cae en su cuerda real. El resto de niveles (decisión del usuario,
// 2026-10-27/28) usa una distribución optimizada, con las cuerdas bien SEPARADAS para no depender
// de tanta precisión en el eje Y y sin llegar a los bordes del mástil (filas de los dos Mi):
// - 1 cuerda (modo trastes): en el centro (fila 3,5).
// - 2 (Medio cuerdas): junto a los dos puntos del traste 12, por DENTRO (usuario, 2026-10-29 y
//   2026-11-02): el borde de cada cuerda dibujada pasa a 1 px del borde de su punto, así quedan algo
//   más juntas pero no tanto como dos cuerdas normales (filas ~4,7 y ~2,3; antes, 5 y 2).
// - 3 (Avanzado cuerdas): filas 5, 3,5 y 2.
// - 4 (Difícil, y Experto de un bajo de 4): separación de 1,2 filas, centradas (5,3 / 4,1 / 2,9 / 1,7).
// La casilla de cada cuerda llega hasta la mitad del camino a la vecina (y hasta el borde del
// mástil en las de fuera), así que se aprovecha todo el alto.
//
// "Fila" = posición vertical en unidades de cuerda real: fila 1 = cuerda 1 (Mi agudo, arriba),
// fila 6 = cuerda 6 (Mi grave, abajo).

// Medio cuerdas: cuánto se acercan al centro sus dos carriles desde los puntos del traste 12, en filas.
// Radio del punto (7) + 1 px de hueco + media cuerda dibujada (3 px / 2), sobre los 158 / 5 = 31,6 de
// alto de cada fila del mástil (ReducedFretboardDiagram: `r="7"`, `boardHeight` 158; RiffHighway:
// cuerdas de 3 px).
const DOT_RADIUS = 7;
const DOT_GAP = 1;
const DRAWN_STRING_HALF = 1.5;
const ROW_HEIGHT = 158 / 5;
const DOT_INSET_ROWS = (DOT_RADIUS + DOT_GAP + DRAWN_STRING_HALF) / ROW_HEIGHT;

// Filas por número de cuerdas del nivel, de la más grave (abajo) a la más aguda.
const LANE_ROWS: Record<number, number[]> = {
  1: [3.5],
  2: [5 - DOT_INSET_ROWS, 2 + DOT_INSET_ROWS],
  3: [5, 3.5, 2],
  4: [5.3, 4.1, 2.9, 1.7],
};

// Fila de cada cuerda usada (las graves, abajo).
export function laneRows(strings: number[]): Map<number, number> {
  const sorted = [...new Set(strings)].sort((a, b) => b - a); // 6 (grave) primero
  // Más cuerdas (Experto con un instrumento de 5, 7 u 8): repartidas por igual en el alto del mástil, que
  // siempre mide lo mismo. Con 6 da su fila real.
  const rows = LANE_ROWS[sorted.length] ?? sorted.map((_, k) => 6 - (k * 5) / (sorted.length - 1));
  return new Map(sorted.map((string, k) => [string, rows[k]]));
}

// Cuerda cuya casilla contiene la fila `row` (la de centro más cercano).
export function laneAt(rows: Map<number, number>, row: number): number {
  let best = 6;
  let bestDistance = Infinity;
  for (const [string, laneRow] of rows) {
    const distance = Math.abs(row - laneRow);
    if (distance < bestDistance) {
      best = string;
      bestDistance = distance;
    }
  }
  return best;
}
