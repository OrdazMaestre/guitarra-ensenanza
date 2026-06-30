'use client';
import { useState } from 'react';
import FourierWave from './FourierWave';
import NoiseFormation from './NoiseFormation';
import WaveCancellation from './WaveCancellation';
import TimbreHarmonics from './TimbreHarmonics';

const SCREENS = [
  'Formación de ruido',
  'Cancelación de ondas',
  'Construcción de onda cuadrada',
  'Timbre: suma de armónicos',
];

export default function AcousticsCarousel() {
  const [screen, setScreen] = useState(0);
  const [isDark, setIsDark] = useState(false);
  const total = SCREENS.length;

  const prev = () => setScreen(s => (s - 1 + total) % total);
  const next = () => setScreen(s => (s + 1) % total);

  return (
    <div className="ac" data-ac-theme={isDark ? 'dark' : undefined}>
      {/* Barra de navegación */}
      <div className="ac-bar">
        <button onClick={prev} className="ac-nav" aria-label="Pantalla anterior">←</button>
        <div className="ac-info">
          <span className="ac-title">{SCREENS[screen]}</span>
          <span className="ac-pager">{screen + 1} / {total}</span>
        </div>
        <button onClick={next} className="ac-nav" aria-label="Pantalla siguiente">→</button>
        <button
          onClick={() => setIsDark(d => !d)}
          className="ac-theme-btn"
          aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        >
          {isDark ? '☀' : '☾'}
        </button>
      </div>

      {/* Pantalla activa — solo se monta una a la vez */}
      <div className="ac-stage">
        {screen === 0 && <NoiseFormation isDark={isDark} />}
        {screen === 1 && <WaveCancellation isDark={isDark} />}
        {screen === 2 && <FourierWave isDark={isDark} />}
        {screen === 3 && <TimbreHarmonics isDark={isDark} />}
      </div>

      <style>{`
        /* ── Variables de tema, scoped al contenedor del carrusel ── */
        .ac {
          --bg:         #f9f9f7;
          --card:       #ffffff;
          --text:       #222222;
          --subtext:    #666666;
          --border:     #cccccc;
          --btn-bg:     #f0f0f0;
          --btn-hov:    #e0e0e0;
          --grid-line:  rgba(0,0,0,0.08);
          --tick-color: #888888;
          --shadow:     0 1px 6px rgba(0,0,0,0.07);
          display: grid;
          gap: 10px;
        }
        .ac[data-ac-theme="dark"] {
          --bg:         #14151a;
          --card:       #1e1f26;
          --text:       #e8e8e4;
          --subtext:    #9a9a94;
          --border:     #3a3a44;
          --btn-bg:     #2a2b34;
          --btn-hov:    #353640;
          --grid-line:  rgba(255,255,255,0.07);
          --tick-color: #7a7a84;
          --shadow:     0 1px 10px rgba(0,0,0,0.4);
        }

        /* ── Barra superior ── */
        .ac-bar {
          align-items: center;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 8px;
          box-shadow: var(--shadow);
          display: flex;
          gap: 6px;
          padding: 8px 10px;
        }
        .ac-info {
          align-items: center;
          display: flex;
          flex: 1;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
          overflow: hidden;
        }
        .ac-title {
          color: var(--text);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          overflow: hidden;
          text-align: center;
          text-overflow: ellipsis;
          text-transform: uppercase;
          white-space: nowrap;
          width: 100%;
        }
        .ac-pager {
          color: var(--subtext);
          font-size: 11px;
          font-weight: 600;
        }
        .ac-nav,
        .ac-theme-btn {
          background: var(--btn-bg);
          border: 1px solid var(--border);
          border-radius: 6px;
          color: var(--text);
          cursor: pointer;
          flex-shrink: 0;
          font-size: 16px;
          line-height: 1;
          padding: 6px 10px;
          transition: background 0.12s;
        }
        .ac-nav:hover,
        .ac-theme-btn:hover { background: var(--btn-hov); }

        /* ── Contenedor de la pantalla activa ── */
        .ac-stage {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 8px;
          box-shadow: var(--shadow);
          padding: 14px;
        }
      `}</style>
    </div>
  );
}
