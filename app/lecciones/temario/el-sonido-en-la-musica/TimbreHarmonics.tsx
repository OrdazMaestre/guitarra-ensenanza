'use client';
import { useRef, useEffect, useState } from 'react';

const N = 450;
const XS = Array.from({ length: N + 1 }, (_, i) => (i / N) * 4 * Math.PI);

const HARM_COLORS = [
  '#378ADD','#D4537E','#1D9E75','#BA7517','#7F77DD',
  '#D85A30','#639922','#3a9bb0','#b05ad0','#9a8030',
];

const INSTRUMENTS = [
  { name: 'Guitarra', amps: [0.65, 1.00, 0.32, 0.10, 0.15, 0.20, 0.15, 0.10, 0.15, 0.20] },
  { name: 'Piano',    amps: [1.00, 1.00, 0.65, 0.65, 0.75, 0.75, 0.60, 0.70, 0.60, 0.50] },
  { name: 'Flauta',   amps: [0.75, 1.00, 0.80, 0.60, 0.60, 0.60, 0.12, 0.18, 0.10, 0.05] },
  { name: 'Trompeta', amps: [0.80, 0.90, 1.00, 0.83, 0.85, 0.70, 0.70, 0.70, 0.70, 0.40] },
];

function chartColors(isDark: boolean) {
  return {
    grid: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)',
    tick: isDark ? '#7a7a84' : '#888888',
  };
}

function detectInstrument(amps: number[]): number | null {
  for (let i = 0; i < INSTRUMENTS.length; i++) {
    if (INSTRUMENTS[i].amps.every((a, j) => Math.abs(a - amps[j]) <= 0.02)) return i;
  }
  return null;
}

function buildDatasets(amps: number[]) {
  const harmData: (number | null)[][] = Array.from({ length: 10 }, () => []);
  const sums: number[] = [];

  for (let j = 0; j <= N; j++) {
    let sum = 0;
    for (let h = 0; h < 10; h++) {
      if (amps[h] > 0) {
        const v = amps[h] * Math.sin((h + 1) * XS[j]);
        harmData[h].push(v);
        sum += v;
      } else {
        harmData[h].push(null);
      }
    }
    sums.push(sum);
  }

  // Normaliza la suma para que toque exactamente ±1 en sus extremos
  const peak = sums.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  const normSums = peak > 0 ? sums.map(v => v / peak) : sums.map(() => 0);

  const datasets: unknown[] = harmData.map((data, h) => ({
    data,
    borderColor: HARM_COLORS[h] + '80',
    borderWidth: 1.1,
    pointRadius: 0,
    tension: 0,
    spanGaps: false,
  }));

  // Onda resultante normalizada (roja, gruesa)
  datasets.push({
    data: normSums,
    borderColor: '#E8410A',
    borderWidth: 3,
    pointRadius: 0,
    tension: 0,
  });

  return datasets;
}

function loadChartJs(cb: () => void) {
  if ((window as Window & { Chart?: unknown }).Chart) { cb(); return; }
  let el = document.getElementById('cjs') as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement('script');
    el.id  = 'cjs';
    el.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
    document.head.appendChild(el);
  }
  el.addEventListener('load', cb, { once: true });
}

export default function TimbreHarmonics({ isDark }: { isDark: boolean }) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const chartRef     = useRef<{ destroy(): void; data: { datasets: unknown[] }; options: Record<string, unknown>; update(mode?: string): void } | null>(null);
  const isDarkRef    = useRef(isDark);
  // Estado inicial: H1 = 100%, H10 = 20%, resto apagados
  const INIT_AMPS = [1.0, 0, 0, 0, 0, 0, 0, 0, 0, 0.20];

  const ampsRef      = useRef<number[]>([...INIT_AMPS]);
  const btnRefs      = useRef<(HTMLButtonElement | null)[]>(Array(10).fill(null));

  const [amps, setAmps]           = useState<number[]>([...INIT_AMPS]);
  const [activeInst, setActiveInst] = useState<number | null>(null);

  isDarkRef.current = isDark;

  // ── Ref al handler de rueda (evita closures obsoletas) ──────────────────
  const wheelHandlerRef = useRef<(i: number, dy: number) => void>(() => {});
  wheelHandlerRef.current = (i: number, dy: number) => {
    const next = [...ampsRef.current];
    const delta = dy > 0 ? -0.05 : 0.05;
    next[i] = Math.round(Math.max(0, Math.min(1, next[i] + delta)) * 100) / 100;
    ampsRef.current = next;
    setAmps([...next]);
    setActiveInst(detectInstrument(next));
    const c = chartRef.current;
    if (c) { c.data.datasets = buildDatasets(next); c.update('none'); }
  };

  // ── Adjunta listeners de rueda no pasivos (una sola vez) ────────────────
  useEffect(() => {
    const cleanups: (() => void)[] = [];
    btnRefs.current.forEach((btn, i) => {
      if (!btn) return;
      const handler = (e: WheelEvent) => {
        e.preventDefault();
        wheelHandlerRef.current(i, e.deltaY);
      };
      btn.addEventListener('wheel', handler, { passive: false });
      cleanups.push(() => btn.removeEventListener('wheel', handler));
    });
    return () => cleanups.forEach(c => c());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Inicialización de Chart.js ───────────────────────────────────────────
  useEffect(() => {
    let alive = true;

    function init() {
      if (!alive || !canvasRef.current) return;
      const ChartCtor = (window as Window & { Chart?: new (...a: unknown[]) => typeof chartRef.current }).Chart;
      if (!ChartCtor) return;
      chartRef.current?.destroy();
      const { grid, tick } = chartColors(isDarkRef.current);
      chartRef.current = new ChartCtor(canvasRef.current, {
        type: 'line',
        data: {
          labels: Array.from({ length: N + 1 }, (_, i) => i),
          datasets: buildDatasets(ampsRef.current),
        },
        options: {
          animation: false,
          responsive: true,
          maintainAspectRatio: true,
          aspectRatio: 2.5,
          plugins: { legend: { display: false } },
          scales: {
            x: { display: false },
            y: {
              min: -1.1,
              max:  1.1,
              grid:  { color: grid },
              ticks: { color: tick },
            },
          },
        },
      }) as typeof chartRef.current;
    }

    loadChartJs(init);
    return () => {
      alive = false;
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actualiza colores del grid al cambiar de tema ────────────────────────
  useEffect(() => {
    const c = chartRef.current;
    if (!c) return;
    const { grid, tick } = chartColors(isDark);
    const opts = c.options as { scales: { y: { grid: { color: string }; ticks: { color: string } } } };
    opts.scales.y.grid.color  = grid;
    opts.scales.y.ticks.color = tick;
    c.update('none');
  }, [isDark]);

  // ── Interacciones ────────────────────────────────────────────────────────
  function clickHarmonic(i: number) {
    const next = [...ampsRef.current];
    next[i] = next[i] > 0 ? 0 : 1.0;
    ampsRef.current = next;
    setAmps([...next]);
    setActiveInst(detectInstrument(next));
    const c = chartRef.current;
    if (c) { c.data.datasets = buildDatasets(next); c.update('none'); }
  }

  function applyInstrument(idx: number) {
    // Si ya estaba seleccionado, deseleccionar y poner todo a 0
    const next = activeInst === idx ? Array(10).fill(0) : [...INSTRUMENTS[idx].amps];
    ampsRef.current = next;
    setAmps([...next]);
    setActiveInst(activeInst === idx ? null : idx);
    const c = chartRef.current;
    if (c) { c.data.datasets = buildDatasets(next); c.update('none'); }
  }

  return (
    <div className="th">
      <canvas ref={canvasRef} className="th-cv" />

      {/* 10 casillas de armónicos */}
      <div className="th-hgrid">
        {amps.map((a, i) => (
          <button
            key={i}
            ref={el => { btnRefs.current[i] = el; }}
            className={`th-harm ${a > 0 ? 'th-on' : 'th-off'}`}
            onClick={() => clickHarmonic(i)}
            style={{
              borderColor: HARM_COLORS[i],
              background: a > 0 ? HARM_COLORS[i] + '28' : undefined,
            }}
            aria-label={`Armónico ${i + 1}: ${Math.round(a * 100)}%`}
          >
            <span className="th-hn">H{i + 1}</span>
            {a > 0 && <span className="th-hp">{Math.round(a * 100)}%</span>}
          </button>
        ))}
      </div>

      {/* Botones de instrumento */}
      <div className="th-irow">
        {INSTRUMENTS.map((inst, i) => (
          <button
            key={i}
            className={`th-ibtn ${activeInst === i ? 'th-iactive' : ''}`}
            onClick={() => applyInstrument(i)}
          >
            {inst.name}
          </button>
        ))}
      </div>

      <p className="th-caption">
        La línea roja es la onda resultante (timbre). Las líneas finas de colores son cada armónico individual.
      </p>

      <style>{`
        .th { display: grid; gap: 12px; }
        .th-cv { display: block; height: auto; width: 100%; }

        /* Rejilla de 10 armónicos */
        .th-hgrid {
          display: grid;
          gap: 6px;
          grid-template-columns: repeat(5, 1fr);
        }
        .th-harm {
          border-radius: 6px;
          border-style: solid;
          border-width: 2px;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          padding: 6px 2px;
          transition: opacity 0.12s;
        }
        .th-on  { opacity: 1; }
        .th-off { background: var(--btn-bg, #f0f0f0) !important; opacity: 0.4; }
        .th-hn  { color: var(--text, #222); font-size: 12px; font-weight: 800; }
        .th-hp  { color: var(--subtext, #666); font-size: 11px; font-weight: 700; }

        /* Fila de instrumentos */
        .th-irow { display: flex; flex-wrap: wrap; gap: 8px; }
        .th-ibtn {
          background: var(--btn-bg, #f0f0f0);
          border: 1px solid var(--border, #ccc);
          border-radius: 6px;
          color: var(--text, #222);
          cursor: pointer;
          font-size: 13px;
          font-weight: 700;
          padding: 6px 14px;
          transition: background 0.12s;
        }
        .th-ibtn:hover { background: var(--btn-hov, #e0e0e0); }
        .th-iactive {
          background: #E8410A !important;
          border-color: #E8410A !important;
          color: #fff !important;
        }

        .th-caption {
          color: var(--subtext, #666);
          font-size: 12px;
          line-height: 1.5;
          margin: 0;
        }

        @media (max-width: 360px) {
          .th-hgrid { grid-template-columns: repeat(5, 1fr); }
        }
      `}</style>
    </div>
  );
}
