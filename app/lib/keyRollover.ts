// Probador de teclas de la batería (usuario, 2026-11-16): los teclados normales pierden ciertas
// combinaciones por su circuito (ghosting/rollover) y el navegador ni recibe esa tecla. Qué combinaciones
// fallan depende de CADA teclado, así que no se deduce: se mide con `KeyRolloverTester` en la Sala de
// pruebas. Aquí va lo puro: las filas de teclas, las combinaciones a probar y las alternativas en otras filas.

// Columnas 0-5 = pads de la batería (`DRUM_PADS` en riff/drums.ts): la batería acepta CUALQUIER fila.
export const DRUM_KEY_ROWS: string[][] = [
  ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN'],
  ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH'],
  ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY'],
  ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'],
];

export const DRUM_PAD_NAMES = ['Plato', 'Bombo', 'Caja', 'Tom agudo', 'Tom grave', 'Plato fuerte'];

const ALL_CODES = new Set(DRUM_KEY_ROWS.flat());

export function isDrumTestKey(code: string): boolean {
  return ALL_CODES.has(code);
}

export function keyLabel(code: string): string {
  return code.replace(/^Key|^Digit/, '');
}

export function comboLabel(codes: string[]): string {
  return codes.map(keyLabel).join(' + ');
}

function subsets(size: number, from = 0): number[][] {
  if (size === 0) return [[]];
  const out: number[][] = [];
  for (let c = from; c <= 6 - size; c++) for (const rest of subsets(size - 1, c + 1)) out.push([c, ...rest]);
  return out;
}

// Lo que se prueba, en la fila Z: las 15 parejas, los 20 tríos y luego Z X C V, Z X C V B y las 6.
export function rolloverCombos(): number[][] {
  return [...subsets(2), ...subsets(3), [0, 1, 2, 3], [0, 1, 2, 3, 4], [0, 1, 2, 3, 4, 5]];
}

export function codesFor(columns: number[], rows: number[]): string[] {
  return columns.map((column, k) => DRUM_KEY_ROWS[rows[k]][column]);
}

// Otras formas de tocar las mismas columnas cuando la fila Z falla: primero mover UNA tecla a otra fila
// (de la última a la primera, fila A, luego Q, luego números), luego dos teclas a la fila A. Máximo `limit`.
export function rolloverAlternatives(columns: number[], limit = 4): string[][] {
  const out: string[][] = [];
  const seen = new Set<string>();
  const add = (rows: number[]) => {
    const codes = codesFor(columns, rows);
    const key = codes.join(',');
    if (!seen.has(key) && out.length < limit) {
      seen.add(key);
      out.push(codes);
    }
  };
  for (const row of [1, 2, 3]) {
    for (let k = columns.length - 1; k >= 1; k--) add(columns.map((_, i) => (i === k ? row : 0)));
  }
  for (let a = columns.length - 1; a >= 1; a--) {
    for (let b = a - 1; b >= 1; b--) add(columns.map((_, i) => (i === a || i === b ? 1 : 0)));
  }
  return out;
}

export interface RolloverResult {
  codes: string[];
  ok: boolean;
  // Con fallo: las teclas de la combinación que SÍ llegaron a la vez (lo máximo visto).
  arrived: string[];
  alternatives: { codes: string[]; ok: boolean }[];
}

export function rolloverReport(results: RolloverResult[], userAgent = ''): string {
  const works = results.filter((r) => r.ok).map((r) => comboLabel(r.codes));
  const fails = results.filter((r) => !r.ok).map((r) => {
    const arrived = r.arrived.length ? ` (llegan ${comboLabel(r.arrived)})` : '';
    const alt = r.alternatives.find((a) => a.ok);
    const tried = r.alternatives.length;
    const altText = alt ? ` → sirve ${comboLabel(alt.codes)}` : tried ? ` → ninguna alternativa (${tried} probadas)` : '';
    return `${comboLabel(r.codes)}${arrived}${altText}`;
  });
  return [
    `Funcionan (${works.length}): ${works.join(', ') || '—'}`,
    `Fallan (${fails.length}):`,
    ...fails.map((line) => `- ${line}`),
    userAgent ? `Navegador: ${userAgent}` : '',
  ].filter(Boolean).join('\n');
}
