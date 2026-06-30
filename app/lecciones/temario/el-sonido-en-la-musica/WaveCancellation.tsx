'use client';
import { useRef, useEffect, useState } from 'react';

const N = 450;
const XS = Array.from({ length: N + 1 }, (_, i) => (i / N) * 4 * Math.PI);

const PAIRS = [
  { freq: 1.0, amp: 0.7, phase: 0.0 },
  { freq: 1.8, amp: 0.5, phase: 0.8 },
  { freq: 2.7, amp: 0.6, phase: 0.3 },
  { freq: 3.5, amp: 0.4, phase: 1.2 },
];
const PASTEL_C = ['#A8C8EE', '#F4A8C0', '#7ACFB0', '#F5C97A'];
const SOLID_C  = ['#2a6fbd', '#b5274a', '#137a56', '#b87200'];

const MAX_AMP = Math.max(...PAIRS.map(p => p.amp)); // 0.7
const Y_LIM   = MAX_AMP * 1.4;                      // 0.98

function chartColors(isDark: boolean) {
  return {
    grid: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)',
    tick: isDark ? '#7a7a84' : '#888888',
  };
}

function buildDatasets(active: boolean[]) {
  const sums = new Float64Array(N + 1);
  const datasets: unknown[] = [];

  PAIRS.forEach((p, i) => {
    const onPos = active[i * 2];
    const onNeg = active[i * 2 + 1];
    const posData: (number | null)[] = [];
    const negData: (number | null)[] = [];

    for (let j = 0; j <= N; j++) {
      const v = p.amp * Math.sin(p.freq * XS[j] + p.phase);
      if (onPos) { posData.push(v);   sums[j] += v;  }
      else        { posData.push(null); }
      if (onNeg) { negData.push(-v);  sums[j] += -v; }
      else        { negData.push(null); }
    }

    // Onda en fase: trazo continuo
    datasets.push({
      data: posData,
      borderColor: PASTEL_C[i] + '80',
      borderWidth: 1.5,
      borderDash: [],
      pointRadius: 0,
      tension: 0,
      spanGaps: false,
    });
    // Contrafase: trazo discontinuo
    datasets.push({
      data: negData,
      borderColor: SOLID_C[i] + '80',
      borderWidth: 1.5,
      borderDash: [6, 3],
      pointRadius: 0,
      tension: 0,
      spanGaps: false,
    });
  });

  // Suma resultante — siempre visible
  datasets.push({
    data: Array.from(sums),
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

export default function WaveCancellation({ isDark }: { isDark: boolean }) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const chartRef   = useRef<{ destroy(): void; data: { datasets: unknown[] }; options: Record<string, unknown>; update(mode?: string): void } | null>(null);
  // Inicio: onda 1 (+) → índice 0, onda −4 (−) → índice 7
  const INIT_ACTIVE = [true, false, false, false, false, false, false, true];
  const activeRef  = useRef<boolean[]>([...INIT_ACTIVE]);
  const isDarkRef  = useRef(isDark);
  const [active, setActive] = useState<boolean[]>([...INIT_ACTIVE]);

  isDarkRef.current = isDark;

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
          datasets: buildDatasets(activeRef.current),
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
              min: -Y_LIM,
              max:  Y_LIM,
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

  // ── Toggle de una onda individual ────────────────────────────────────────
  function toggle(idx: number) {
    const next = [...activeRef.current];
    next[idx] = !next[idx];
    activeRef.current = next;
    setActive([...next]);
    const c = chartRef.current;
    if (!c) return;
    c.data.datasets = buildDatasets(next);
    c.update('none');
  }

  return (
    <div className="wc">
      <canvas ref={canvasRef} className="wc-cv" />

      {/* 4 columnas, una por par */}
      <div className="wc-grid">
        {PAIRS.map((_, i) => (
          <div key={i} className="wc-col">
            <span className="wc-par" style={{ color: SOLID_C[i] }}>Par {i + 1}</span>

            {/* Botón onda en fase (pastel, trazo continuo) */}
            <button
              className="wc-btn"
              onClick={() => toggle(i * 2)}
              style={{
                background: PASTEL_C[i],
                color: '#1a1a1a',
                opacity: active[i * 2] ? 1 : 0.32,
                filter:  active[i * 2] ? 'none' : 'grayscale(50%)',
              }}
            >
              onda {i + 1} (+)
            </button>

            {/* Botón contrafase (sólido, trazo discontinuo) */}
            <button
              className="wc-btn"
              onClick={() => toggle(i * 2 + 1)}
              style={{
                background: SOLID_C[i],
                color: '#ffffff',
                opacity: active[i * 2 + 1] ? 1 : 0.32,
                filter:  active[i * 2 + 1] ? 'none' : 'grayscale(50%)',
              }}
            >
              −onda {i + 1} (−)
            </button>
          </div>
        ))}
      </div>

      <style>{`
        .wc { display: grid; gap: 12px; }
        .wc-cv { display: block; height: auto; width: 100%; }
        .wc-grid {
          display: grid;
          gap: 8px;
          grid-template-columns: repeat(4, 1fr);
        }
        .wc-col {
          align-items: center;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .wc-par {
          font-size: 12px;
          font-weight: 800;
        }
        .wc-btn {
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 700;
          padding: 6px 4px;
          text-align: center;
          transition: opacity 0.15s, filter 0.15s;
          width: 100%;
        }
        @media (max-width: 480px) {
          .wc-grid { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>
    </div>
  );
}
