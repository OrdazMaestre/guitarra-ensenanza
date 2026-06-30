'use client';
import { useRef, useEffect, useState } from 'react';

const PASTEL = [
  '#A8C8EE','#F4A8C0','#7ACFB0','#F5C97A','#C0BAF0','#F0AC88','#A8D48A','#C8B4E0',
  '#A8D8D8','#F0C0A0','#B8E0A8','#E0B8C8','#A8C0F0','#F0E0A8','#C0E0B8','#E0C0A8',
  '#B8C8F0','#F0B8D8','#A8E0C0','#D8D8A8',
];

const N = 450;
const XS = Array.from({ length: N + 1 }, (_, i) => (i / N) * 4 * Math.PI);

function makeWaves(n: number) {
  return Array.from({ length: n }, () => ({
    freq:  0.3 + Math.random() * 3.7,
    amp:   0.15 + Math.random() * 0.55,
    phase: Math.random() * 2 * Math.PI,
  }));
}

function chartColors(isDark: boolean) {
  return {
    grid: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)',
    tick: isDark ? '#7a7a84' : '#888888',
  };
}

interface Wave { freq: number; amp: number; phase: number; }

function buildDatasets(waves: Wave[]) {
  const sums = new Float64Array(N + 1);

  const datasets: unknown[] = waves.map((w, i) => {
    const data: number[] = [];
    for (let j = 0; j <= N; j++) {
      const v = w.amp * Math.sin(w.freq * XS[j] + w.phase);
      sums[j] += v;
      data.push(v);
    }
    return {
      data,
      borderColor: PASTEL[i % PASTEL.length] + '80',
      borderWidth: 1.3,
      pointRadius: 0,
      tension: 0,
    };
  });

  const peak = Array.from(sums).reduce((m, v) => Math.max(m, Math.abs(v)), 0);

  datasets.push({
    data: Array.from(sums),
    borderColor: '#E8410A',
    borderWidth: 3,
    pointRadius: 0,
    tension: 0,
  });

  return { datasets, yMax: Math.max(peak * 1.25, 0.1) };
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

export default function NoiseFormation({ isDark }: { isDark: boolean }) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const chartRef   = useRef<{ destroy(): void; data: { datasets: unknown[] }; options: Record<string, unknown>; update(mode?: string): void } | null>(null);
  const wavesRef   = useRef<Wave[]>(makeWaves(5));
  const countRef   = useRef(5);
  const isDarkRef  = useRef(isDark);
  const [count, setCount] = useState(5);

  // Mantiene el ref sincronizado con la prop en cada render
  isDarkRef.current = isDark;

  // ── Inicialización de Chart.js ───────────────────────────────────────────
  useEffect(() => {
    let alive = true;

    function init() {
      if (!alive || !canvasRef.current) return;
      const ChartCtor = (window as Window & { Chart?: new (...a: unknown[]) => typeof chartRef.current }).Chart;
      if (!ChartCtor) return;
      chartRef.current?.destroy();
      const waves = wavesRef.current.slice(0, countRef.current);
      const { datasets, yMax } = buildDatasets(waves);
      const { grid, tick } = chartColors(isDarkRef.current);
      chartRef.current = new ChartCtor(canvasRef.current, {
        type: 'line',
        data: { labels: Array.from({ length: N + 1 }, (_, i) => i), datasets },
        options: {
          animation: false,
          responsive: true,
          maintainAspectRatio: true,
          aspectRatio: 2.5,
          plugins: { legend: { display: false } },
          scales: {
            x: { display: false },
            y: {
              min: -yMax,
              max:  yMax,
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

  // ── Helpers ──────────────────────────────────────────────────────────────
  function refreshChart() {
    const c = chartRef.current;
    if (!c) return;
    const waves = wavesRef.current.slice(0, countRef.current);
    const { datasets, yMax } = buildDatasets(waves);
    c.data.datasets = datasets;
    const opts = c.options as { scales: { y: { min: number; max: number } } };
    opts.scales.y.min = -yMax;
    opts.scales.y.max =  yMax;
    c.update('none');
  }

  function changeCount(n: number) {
    countRef.current = n;
    while (wavesRef.current.length < n) {
      wavesRef.current.push({
        freq:  0.3 + Math.random() * 3.7,
        amp:   0.15 + Math.random() * 0.55,
        phase: Math.random() * 2 * Math.PI,
      });
    }
    setCount(n);
    refreshChart();
  }

  function regenerate() {
    wavesRef.current = makeWaves(countRef.current);
    refreshChart();
  }

  return (
    <div className="nf">
      <canvas ref={canvasRef} className="nf-cv" />

      <div className="nf-row">
        <label className="nf-lbl">
          Número de ondas:&nbsp;<strong>{count}</strong>
          <input
            type="range" min={1} max={20} value={count}
            onChange={e => changeCount(+e.target.value)}
            className="nf-range"
            aria-label="Número de ondas"
          />
        </label>
        <button onClick={regenerate} className="nf-regen">↻ Regenerar</button>
      </div>

      <div className="nf-legend">
        {Array.from({ length: count }, (_, i) => (
          <span key={i} className="nf-leg">
            <span className="nf-sw" style={{ background: PASTEL[i % PASTEL.length] }} />
            Onda {i + 1}
          </span>
        ))}
        <span className="nf-leg">
          <span className="nf-sw" style={{ background: '#E8410A' }} />
          Suma (ruido)
        </span>
      </div>

      <style>{`
        .nf { display: grid; gap: 10px; }
        .nf-cv { display: block; height: auto; width: 100%; }
        .nf-row { align-items: center; display: flex; flex-wrap: wrap; gap: 10px; }
        .nf-lbl {
          align-items: center;
          color: var(--subtext, #666);
          display: flex;
          flex: 1;
          font-size: 13px;
          font-weight: 700;
          gap: 8px;
          min-width: 180px;
        }
        .nf-lbl strong { color: var(--text, #222); }
        .nf-range { accent-color: #E8410A; cursor: pointer; flex: 1; min-width: 60px; }
        .nf-regen {
          background: var(--btn-bg, #f0f0f0);
          border: 1px solid var(--border, #ccc);
          border-radius: 6px;
          color: var(--text, #222);
          cursor: pointer;
          font-size: 13px;
          font-weight: 700;
          padding: 5px 12px;
          white-space: nowrap;
        }
        .nf-regen:hover { background: var(--btn-hov, #e0e0e0); }
        .nf-legend { display: flex; flex-wrap: wrap; gap: 4px 12px; }
        .nf-leg { align-items: center; color: var(--subtext, #666); display: flex; font-size: 11px; font-weight: 700; gap: 4px; }
        .nf-sw { border-radius: 2px; display: inline-block; height: 7px; width: 18px; }
      `}</style>
    </div>
  );
}
