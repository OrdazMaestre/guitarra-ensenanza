// Medidor de fluidez del juego (usuario, 2026-11-15: tirones en el móvil con canciones densas). Solo se
// enciende con `?medir=1` en la dirección; si no, cada función vuelve al instante (sin coste).
//
// Mide: lo que dura cada fotograma (rAF a rAF), lo que tarda el dibujo de la autopista, lo que tarda el
// tick de audio de 25 ms y cuánto se retrasa, y las tareas largas del navegador. `perfSummary()` da el
// resumen que el usuario copia y nos pasa (y que lee el banco de pruebas: `window.__riffPerf`).

type Kind = 'draw' | 'tick' | 'input';

interface Store {
  frames: number[];
  draw: number[];
  tick: number[];
  tickLate: number[];
  input: number[];
  longTasks: number[];
  lastFrame: number;
  lastTick: number;
  canvas: string;
}

let enabled: boolean | null = null;
const store: Store = { frames: [], draw: [], tick: [], tickLate: [], input: [], longTasks: [], lastFrame: 0, lastTick: 0, canvas: '' };
const MAX_SAMPLES = 20000;

export function perfEnabled(): boolean {
  if (enabled !== null) return enabled;
  if (typeof window === 'undefined') return false;
  try {
    enabled = new URLSearchParams(window.location.search).get('medir') === '1';
  } catch {
    enabled = false;
  }
  if (enabled) {
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) push(store.longTasks, entry.duration);
      }).observe({ type: 'longtask', buffered: false });
    } catch {
      // Navegador sin 'longtask' (Safari): el resto sigue midiendo.
    }
    (window as unknown as { __riffPerf: unknown }).__riffPerf = { summary: perfSummary, reset: perfReset };
  }
  return enabled;
}

function push(list: number[], value: number) {
  if (list.length < MAX_SAMPLES) list.push(value);
}

// Al empezar cada fotograma de la autopista: devuelve el instante para `perfEnd`, o -1 si no se mide.
export function perfFrameStart(): number {
  if (!perfEnabled()) return -1;
  const now = performance.now();
  if (store.lastFrame > 0) push(store.frames, now - store.lastFrame);
  store.lastFrame = now;
  return now;
}

// Al empezar cada tick de audio: también apunta su retraso respecto a `periodMs`.
export function perfTickStart(periodMs: number): number {
  if (!perfEnabled()) return -1;
  const now = performance.now();
  if (store.lastTick > 0) push(store.tickLate, Math.max(0, now - store.lastTick - periodMs));
  store.lastTick = now;
  return now;
}

export function perfEnd(kind: Kind, start: number) {
  if (start < 0) return;
  push(store[kind], performance.now() - start);
}

// Retraso de un toque (ms) entre que ocurre y que el juego lo atiende (ver RiffSession.judge).
export function perfInput(lagMs: number) {
  if (!perfEnabled()) return;
  push(store.input, lagMs);
}

export function perfCanvas(width: number, height: number, dpr: number) {
  if (!perfEnabled()) return;
  store.canvas = `${width}×${height} px (dpr ${dpr.toFixed(2)})`;
}

// Nueva partida: empieza a contar de cero (el rAF y el tick sueltan su "último" para no contar la espera).
export function perfReset() {
  store.frames = [];
  store.draw = [];
  store.tick = [];
  store.tickLate = [];
  store.input = [];
  store.longTasks = [];
  store.lastFrame = 0;
  store.lastTick = 0;
}

function stats(list: number[]) {
  if (list.length === 0) return null;
  const sorted = [...list].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return { n: list.length, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: sorted[sorted.length - 1] };
}

const ms = (value: number) => value.toFixed(1);

export interface PerfSummary {
  frames: ReturnType<typeof stats>;
  over20: number;
  over33: number;
  draw: ReturnType<typeof stats>;
  tick: ReturnType<typeof stats>;
  tickLate: ReturnType<typeof stats>;
  input: ReturnType<typeof stats>;
  longTasks: { n: number; total: number; max: number };
  canvas: string;
  text: string;
}

export function perfSummary(): PerfSummary {
  const frames = stats(store.frames);
  const share = (limit: number) => (store.frames.length ? (100 * store.frames.filter((f) => f > limit).length) / store.frames.length : 0);
  const over20 = share(20);
  const over33 = share(33);
  const draw = stats(store.draw);
  const tick = stats(store.tick);
  const tickLate = stats(store.tickLate);
  const input = stats(store.input);
  const longTasks = { n: store.longTasks.length, total: store.longTasks.reduce((a, b) => a + b, 0), max: Math.max(0, ...store.longTasks) };
  const line = (name: string, s: ReturnType<typeof stats>) => (s ? `${name}: mediana ${ms(s.p50)} · p95 ${ms(s.p95)} · p99 ${ms(s.p99)} · máx ${ms(s.max)} ms (${s.n})` : `${name}: —`);
  const text = [
    line('Fotograma', frames),
    `Fotogramas > 20 ms: ${over20.toFixed(1)} % · > 33 ms: ${over33.toFixed(1)} %`,
    line('Dibujo', draw),
    line('Tick audio', tick),
    line('Retraso tick', tickLate),
    line('Retraso toque', input),
    `Tareas largas: ${longTasks.n} (total ${ms(longTasks.total)} ms, máx ${ms(longTasks.max)} ms)`,
    `Canvas: ${store.canvas || '—'}`,
    `Pantalla: ${typeof window === 'undefined' ? '' : `${window.innerWidth}×${window.innerHeight}`} · ${typeof navigator === 'undefined' ? '' : navigator.userAgent}`,
  ].join('\n');
  return { frames, over20, over33, draw, tick, tickLate, input, longTasks, canvas: store.canvas, text };
}
