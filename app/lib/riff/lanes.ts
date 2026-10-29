// Altura (en el mástil) a la que caen las notas del juego en cada nivel. Pura, para probarla en Node.
//
// Experto: cada nota cae en su cuerda real. El resto de niveles (decisión del usuario,
// 2026-10-27/28) usa una distribución optimizada, con las cuerdas bien SEPARADAS para no depender
// de tanta precisión en el eje Y y sin llegar a los bordes del mástil (filas de los dos Mi):
// - 1 cuerda (modo trastes): en el centro (fila 3,5).
// - 2 (Medio cuerdas): a la altura de los dos puntos del traste 12 (filas 5 y 2; usuario, 2026-10-29).
// - 3 (Avanzado cuerdas): filas 5, 3,5 y 2.
// - 4 (Difícil): separación de 1,2 filas, centradas (5,3 / 4,1 / 2,9 / 1,7).
// La casilla de cada cuerda llega hasta la mitad del camino a la vecina (y hasta el borde del
// mástil en las de fuera), así que se aprovecha todo el alto.
//
// "Fila" = posición vertical en unidades de cuerda real: fila 1 = cuerda 1 (Mi agudo, arriba),
// fila 6 = cuerda 6 (Mi grave, abajo).

// Filas por número de cuerdas del nivel, de la más grave (abajo) a la más aguda.
const LANE_ROWS: Record<number, number[]> = {
  1: [3.5],
  2: [5, 2],
  3: [5, 3.5, 2],
  4: [5.3, 4.1, 2.9, 1.7],
};

// Fila de cada cuerda usada (las graves, abajo).
export function laneRows(strings: number[]): Map<number, number> {
  const sorted = [...new Set(strings)].sort((a, b) => b - a); // 6 (grave) primero
  const rows = LANE_ROWS[sorted.length] ?? sorted.map((string) => string);
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
