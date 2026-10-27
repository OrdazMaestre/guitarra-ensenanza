// Altura (en el mástil) a la que caen las notas del juego en cada nivel. Pura, para probarla en Node.
//
// Experto: cada nota cae en su cuerda real. El resto de niveles (decisión del usuario,
// 2026-10-27) usa una distribución optimizada: sus cuerdas se reparten en el espacio que ocupan La
// grave (A2, fila de la cuerda 5) -> Si (B3, fila de la cuerda 2), centradas, y las filas de los
// dos Mi (E2 y E4) quedan reservadas para Experto:
// - 1 cuerda (modo trastes): en el centro.
// - 2 cuerdas: una por encima del centro y otra por debajo.
// - 3: arriba, centro y abajo (filas de la Si y la La).
// - 4: dos arriba y dos abajo (filas de Si, Sol, Re y La).
// Separación entre cuerdas: como mucho 1,5 filas, y nunca salirse de ese espacio. La casilla de
// cada cuerda llega hasta la mitad del camino a la vecina (y hasta el borde del mástil en las de
// fuera), así que se aprovecha todo el alto.
//
// "Fila" = posición vertical en unidades de cuerda real: fila 1 = cuerda 1 (Mi agudo, arriba),
// fila 6 = cuerda 6 (Mi grave, abajo).

const CENTER_ROW = 3.5;
const SPAN_ROWS = 3; // de la fila 2 (Si) a la 5 (La)
const MAX_GAP_ROWS = 1.5;

// Fila de cada cuerda usada (las graves, abajo).
export function laneRows(strings: number[]): Map<number, number> {
  const sorted = [...new Set(strings)].sort((a, b) => b - a); // 6 (grave) primero
  const n = sorted.length;
  const gap = n <= 1 ? 0 : Math.min(MAX_GAP_ROWS, SPAN_ROWS / (n - 1));
  return new Map(sorted.map((string, k) => [string, CENTER_ROW + gap * ((n - 1) / 2 - k)]));
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
