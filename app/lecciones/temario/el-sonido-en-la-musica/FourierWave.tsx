'use client';
import { useRef, useEffect, useState, useCallback } from 'react';

// Light mode — muted pastels
const COLORS = [
  '#6BAED6','#FDB462','#80B1D3','#BC80BD',
  '#98CAA4','#F0B880','#8EC8D0','#D0A4B4',
  '#B4CC98','#C0B4E4','#9EC8CC','#E4B898',
  '#B8CCB8','#CCB8E0','#A8CCCC',
];
// Dark mode — vivid / neon
const DARK_COLORS = [
  '#60A5FA','#FB923C','#4ADE80','#F472B6',
  '#22D3EE','#FACC15','#A78BFA','#F87171',
  '#34D399','#FCD34D','#C084FC','#67E8F9',
  '#86EFAC','#FCA5A5','#FDBA74',
];

function sub(n: number) {
  return String(n).split('').map(d => '₀₁₂₃₄₅₆₇₈₉'[+d]).join('');
}

function getIsDark() {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

export default function FourierWave() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [h, setH] = useState(3);
  const hRef = useRef(3);
  const [isDarkState, setIsDarkState] = useState(false);

  // Read theme from DOM at call time — no stale state
  const drawNow = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const harmonics = hRef.current;
    const isDark = getIsDark();

    const palette    = isDark ? DARK_COLORS : COLORS;
    const sumColor   = isDark ? '#FF5722' : '#E8410A';
    const bg         = isDark ? '#0d0d0d' : '#f6f6f6';
    const gridCenter = isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)';
    const gridMinor  = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
    const alpha      = isDark ? 0.82 : 0.75;

    const W = 800, H = 280;
    const pL = 8, pR = 8, pT = 16, pB = 16;
    const pw = W - pL - pR;
    const ph = H - pT - pB;
    const yMin = -1.6, yMax = 1.6;
    const N = 400;

    const mapX = (i: number) => pL + (i / N) * pw;
    const mapY = (v: number) => pT + ph - ((v - yMin) / (yMax - yMin)) * ph;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    for (const v of [-1, -0.5, 0, 0.5, 1]) {
      ctx.beginPath();
      ctx.strokeStyle = v === 0 ? gridCenter : gridMinor;
      ctx.lineWidth = 1;
      ctx.moveTo(pL, mapY(v));
      ctx.lineTo(pL + pw, mapY(v));
      ctx.stroke();
    }

    const sums = new Float64Array(N + 1);
    for (let k = 1; k <= harmonics; k++) {
      const f = 2 * k - 1;
      const a = 4 / (Math.PI * f);
      ctx.beginPath();
      ctx.strokeStyle = palette[(k - 1) % palette.length];
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = alpha;
      for (let i = 0; i <= N; i++) {
        const x = (i / N) * 4 * Math.PI;
        const v = a * Math.sin(f * x);
        sums[i] += v;
        if (i === 0) ctx.moveTo(mapX(i), mapY(v));
        else ctx.lineTo(mapX(i), mapY(v));
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.strokeStyle = sumColor;
    ctx.lineWidth = 3;
    for (let i = 0; i <= N; i++) {
      if (i === 0) ctx.moveTo(mapX(i), mapY(sums[i]));
      else ctx.lineTo(mapX(i), mapY(sums[i]));
    }
    ctx.stroke();
  }, []);

  // Redraw when slider changes
  useEffect(() => {
    hRef.current = h;
    drawNow();
  }, [h, drawNow]);

  // Initial draw via rAF (after theme-init script runs) + watch theme changes
  useEffect(() => {
    const onTheme = () => { setIsDarkState(getIsDark()); drawNow(); };
    const raf = requestAnimationFrame(() => { setIsDarkState(getIsDark()); drawNow(); });
    const obs = new MutationObserver(onTheme);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
    };
  }, [drawNow]);

  const legendPalette = isDarkState ? DARK_COLORS : COLORS;
  const legendSum     = isDarkState ? '#FF5722' : '#E8410A';
  const labels = Array.from({ length: h }, (_, i) => ({
    text: `f${sub(2 * i + 1)}`,
    color: legendPalette[i % legendPalette.length],
  }));

  return (
    <div className="fw">
      <canvas ref={canvasRef} width={800} height={280} className="fw-canvas" />
      <div className="fw-ctrl">
        <span className="fw-ctrl-lbl">Armónicos: <strong>{h}</strong></span>
        <input
          type="range" min={1} max={15} value={h}
          onChange={e => setH(+e.target.value)}
          aria-label="Número de armónicos"
          className="fw-range"
        />
      </div>
      <div className="fw-legend">
        {labels.map(({ text, color }) => (
          <span key={text} className="fw-leg">
            <span className="fw-sw" style={{ background: color }} />
            {text}
          </span>
        ))}
        <span className="fw-leg">
          <span className="fw-sw" style={{ background: legendSum }} />
          Suma
        </span>
      </div>
      <style>{`
        .fw { display: grid; gap: 10px; }
        .fw-canvas { border-radius: 4px; display: block; height: auto; width: 100%; }
        .fw-ctrl { align-items: center; display: flex; gap: 12px; padding: 0 2px; }
        .fw-ctrl-lbl { color: #71717a; font-size: 13px; font-weight: 700; white-space: nowrap; }
        .fw-ctrl-lbl strong { color: #18181b; }
        [data-theme="dark"] .fw-ctrl-lbl { color: #a1a1aa; }
        [data-theme="dark"] .fw-ctrl-lbl strong { color: #e4e4e7; }
        .fw-range { accent-color: #E8410A; cursor: pointer; flex: 1; }
        .fw-legend { display: flex; flex-wrap: wrap; gap: 6px 16px; padding: 0 2px; }
        .fw-leg { align-items: center; color: #71717a; display: flex; font-size: 12px; font-weight: 800; gap: 5px; }
        [data-theme="dark"] .fw-leg { color: #a1a1aa; }
        .fw-sw { border-radius: 2px; display: inline-block; height: 8px; width: 20px; }
      `}</style>
    </div>
  );
}
