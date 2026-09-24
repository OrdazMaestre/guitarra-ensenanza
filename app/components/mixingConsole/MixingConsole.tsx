'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ChannelStrip from './ChannelStrip';
import { useMixingConsole } from '../../lib/mixingConsole/useMixingConsole';
import { MIXING_SONGS, type MixingConsoleEngine, type SongId } from '../../lib/mixingConsole/audioEngine';

declare global {
  interface Window {
    // Solo para verificación en Playwright (tests/mixing-console.spec.ts), gateado a modo
    // desarrollo -- ver getDebugSnapshot() en audioEngine.ts. No se usa en la UI de producción.
    __mixingConsoleEngine?: MixingConsoleEngine;
  }
}

// Mesa de mezclas de toda la web. Nació pensada solo para sala-de-pruebas, pero ahora se monta UNA
// SOLA VEZ en app/layout.tsx (junto a ThemeToggle/MaikaelWidget) para estar disponible en
// cualquier página del sitio -- nunca dentro de una página individual, o se duplicaría el
// AudioContext/los <audio>. No tiene relación alguna con AlphaTabPlayer.tsx (aquel sintetiza notas;
// esto reproduce archivos MP3 ya grabados) ni con guitarAudioEngine.ts (motor de audio nuevo y
// dedicado, ver app/lib/mixingConsole/audioEngine.ts).
//
// Punto clave de diseño: `useMixingConsole()` (que crea/posee el AudioContext y todos los <audio>)
// se llama aquí, en el componente que SIEMPRE está montado mientras el sitio lo está (una sola
// instancia para toda la navegación, sobrevive a los cambios de página vía next/link). `open` solo
// controla si el JSX del panel se renderiza -- nunca desmonta el hook. Por eso colapsar el panel
// (pulsar el botón de nuevo) oculta la interfaz pero el audio sigue sonando exactamente igual, y
// navegar a otra página con el panel abierto/la música sonando la deja tal cual.
//
// El botón y el panel se renderizan vía createPortal en document.body -- FUERA de .site-shell --
// en vez de inline en el árbol normal. Ver el bloque de comentarios de estilos más abajo para el
// porqué (containing block de position:fixed bajo el filter de modo oscuro de .site-shell).
export default function MixingConsole() {
  const [open, setOpen] = useState(false);
  const [songListOpen, setSongListOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { state, engine } = useMixingConsole();
  // Play automático: solo la PRIMERA vez que se despliega el panel (no en aperturas
  // posteriores), y cada vez que se elige una canción (flechas o lista). Ambos disparos ocurren
  // dentro de un gesto de click real, requisito de las políticas de autoplay del navegador.
  const hasAutoPlayedOnOpenRef = useRef(false);

  const songIndex = MIXING_SONGS.findIndex(s => s.id === state.songId);
  const currentSong = MIXING_SONGS[songIndex] ?? MIXING_SONGS[0];

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    window.__mixingConsoleEngine = engine;
    return () => {
      delete window.__mixingConsoleEngine;
    };
  }, [engine]);

  // createPortal necesita un document.body real -- no existe durante el render de servidor, así
  // que se retrasa un tick hasta que el componente esté montado en el cliente (patrón estándar de
  // React para portales, mismo que QuizRunner.tsx). El hook de arriba (useMixingConsole) sigue
  // llamándose siempre en el primer render igualmente -- lo único condicionado es el JSX portado,
  // no el motor de audio.
  // Excepción deliberada: es el patrón estándar de React para detectar que ya se hidrató en el
  // cliente antes de llamar a createPortal (document no existe en el render de servidor), no hay
  // forma de leerlo de otra fuente externa a la que "suscribirse".
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setMounted(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function selectSong(songId: SongId) {
    engine.selectSong(songId);
    engine.play();
    setSongListOpen(false);
  }

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && !hasAutoPlayedOnOpenRef.current) {
      hasAutoPlayedOnOpenRef.current = true;
      engine.play();
    }
  }

  function prevSong() {
    const next = MIXING_SONGS[(songIndex - 1 + MIXING_SONGS.length) % MIXING_SONGS.length];
    selectSong(next.id);
  }

  function nextSong() {
    const next = MIXING_SONGS[(songIndex + 1) % MIXING_SONGS.length];
    selectSong(next.id);
  }

  return (
    <>
      {mounted && createPortal(
        <>
          <button
            type="button"
            aria-label={open ? 'Cerrar mesa de mezclas' : 'Abrir mesa de mezclas'}
            aria-expanded={open}
            onClick={toggleOpen}
            className="mixing-console-toggle-button"
          >
            <span aria-hidden="true">🎚️</span>
          </button>

          {open && (
            <div className="mixing-console-panel" role="region" aria-label="Mesa de mezclas">
              <div className="mc-topbar">
                <div className="mc-song-selector">
                  <button
                    type="button"
                    aria-label="Canción anterior"
                    onClick={prevSong}
                    className="mc-song-arrow"
                  >
                    ◀
                  </button>
                  <div className="mc-song-name-wrap">
                    <button
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={songListOpen}
                      onClick={() => setSongListOpen(o => !o)}
                      className="mc-song-name"
                    >
                      {currentSong.label}
                    </button>
                    {songListOpen && (
                      <div className="mc-song-list" role="listbox" aria-label="Elegir canción">
                        {MIXING_SONGS.map(song => (
                          <button
                            key={song.id}
                            type="button"
                            role="option"
                            aria-selected={song.id === state.songId}
                            onClick={() => selectSong(song.id)}
                            className="mc-song-option"
                            style={song.id === state.songId ? { color: '#34d399', fontWeight: 800 } : undefined}
                          >
                            {song.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label="Canción siguiente"
                    onClick={nextSong}
                    className="mc-song-arrow"
                  >
                    ▶
                  </button>
                </div>

                <span className="mc-song-scale">{currentSong.scale}</span>

                <button
                  type="button"
                  aria-label={state.playing ? 'Pausar' : 'Reproducir'}
                  onClick={() => (state.playing ? engine.pause() : engine.play())}
                  className="mc-play-button"
                >
                  {state.playing ? '⏸' : '▶'}
                </button>

                <label className="mc-master-volume">
                  <span>Master</span>
                  <input
                    type="range"
                    aria-label="Volumen máster"
                    min={0}
                    max={1}
                    step={0.01}
                    value={state.masterVolume}
                    onChange={e => engine.setMasterVolume(Number(e.target.value))}
                  />
                  <span className="mc-master-volume-value">{Math.round(state.masterVolume * 100)}</span>
                </label>
              </div>

              <div className="mc-channels">
                {currentSong.instruments.map(inst => {
                  const channel = state.channels[inst.id];
                  if (!channel) return null;
                  return (
                    <ChannelStrip
                      key={inst.id}
                      instrument={inst}
                      channel={channel}
                      isSolo={state.soloId === inst.id}
                      onVolume={v => engine.setChannelVolume(inst.id, v)}
                      onPan={v => engine.setChannelPan(inst.id, v)}
                      onEQ={(band, v) => engine.setChannelEQ(inst.id, band, v)}
                      onToggleMute={() => engine.toggleMute(inst.id)}
                      onToggleSolo={() => engine.toggleSolo(inst.id)}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </>,
        document.body,
      )}

      <style>{`
        /*
         * El botón y el panel se portan a document.body (createPortal, ver arriba) -- FUERA de
         * .site-shell -- exactamente por lo mismo que .theme-toggle-button en globals.css vive como
         * hermano directo de <body> en vez de dentro de .site-shell: html[data-theme='dark']
         * .site-shell { filter: invert(1) hue-rotate(180deg); } (ver globals.css) invierte
         * automáticamente TODO lo que esté dentro, pero como efecto secundario de la spec de CSS
         * también convierte a .site-shell en el "containing block" de cualquier position:fixed que
         * viva dentro de él. Eso rompía DOS cosas a la vez cuando el botón/panel vivían dentro de
         * .site-shell: (1) su posición quedaba desplazada respecto al modo claro (.site-shell no
         * arranca en (0,0): margin de <body> + margin-top de .site-home-link colapsando hacia
         * arriba), y (2) al ser .site-shell un bloque normal que SE DESPLAZA con el scroll de la
         * página, el botón/panel dejaban de estar realmente "pegados" al viewport -- se movían con
         * el contenido, con el retraso justo de que algo (JS) tuviera que perseguir el offset en
         * cada frame de scroll en vez de que el navegador los mantenga fijos de forma nativa. Un
         * primer intento compensó la posición con un useEffect (medir el offset de .site-shell y
         * restarlo vía variables CSS, reaplicando en cada resize/scroll/cambio de tema) y funcionaba,
         * pero con ese retraso perceptible de un frame detrás del scroll real. Portar fuera de
         * .site-shell elimina el problema de raíz: fixed vuelve a ser relativo al viewport de
         * verdad, sin ningún JS de por medio, cero retraso -- igual que .theme-toggle-button.
         *
         * El precio de estar fuera de .site-shell es que YA NO se benefician del invert() automático,
         * así que (a diferencia del resto de páginas del sitio, y a diferencia de como estaba esto
         * mismo antes de portarlo) SÍ necesitan su propia paleta oscura explícita bajo
         * html[data-theme='dark'] -- el mismo patrón que ya usa .theme-toggle-button.
         */
        :root {
          --mc-bg-panel: #ffffff;
          --mc-border-panel: #d4d4d8;
          --mc-bg-box: #f4f4f5;
          --mc-bg-control: #e4e4e7;
          --mc-border-control: #a1a1aa;
          --mc-text-title: #09090b;
          --mc-text-primary: #18181b;
          --mc-text-secondary: #52525b;
          --mc-knob-from: #d4d4d8;
          --mc-knob-to: #f4f4f5;
        }

        html[data-theme='dark'] {
          --mc-bg-panel: #09090b;
          --mc-border-panel: #3f3f46;
          --mc-bg-box: #18181b;
          --mc-bg-control: #27272a;
          --mc-border-control: #52525b;
          --mc-text-title: #ffffff;
          --mc-text-primary: #e4e4e7;
          --mc-text-secondary: #a1a1aa;
          --mc-knob-from: #52525b;
          --mc-knob-to: #18181b;
        }

        .mixing-console-toggle-button {
          align-items: center;
          background: rgba(255, 255, 255, 0.92);
          border: 2px solid #080808;
          border-radius: 999px;
          box-shadow: 0 14px 34px rgba(0, 0, 0, 0.16);
          cursor: pointer;
          display: flex;
          font-size: 20px;
          height: 44px;
          justify-content: center;
          left: 12px;
          line-height: 1;
          padding: 0;
          position: fixed;
          top: 12px;
          transition: background-color 160ms ease, border-color 160ms ease, transform 160ms ease;
          width: 44px;
          z-index: 200;
        }

        .mixing-console-toggle-button:hover,
        .mixing-console-toggle-button:focus-visible {
          border-color: #047857;
          transform: scale(1.06);
        }

        .mixing-console-toggle-button:focus-visible {
          outline: 3px solid #047857;
          outline-offset: 4px;
        }

        html[data-theme='dark'] .mixing-console-toggle-button {
          background: rgba(24, 24, 27, 0.92);
          border-color: #f1f5f9;
        }

        @media (max-width: 620px) {
          .mixing-console-toggle-button {
            height: 40px;
            left: 8px;
            top: 8px;
            width: 40px;
          }
        }

        .mixing-console-panel {
          background: var(--mc-bg-panel);
          border: 1px solid var(--mc-border-panel);
          border-radius: 10px;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
          box-sizing: border-box;
          left: 12px;
          max-height: calc(100vh - 80px);
          max-width: calc(100vw - 24px);
          overflow-y: auto;
          padding: 14px;
          position: fixed;
          top: 64px;
          transition: background-color 160ms ease, border-color 160ms ease;
          z-index: 199;
        }

        @media (max-width: 620px) {
          .mixing-console-panel {
            left: 8px;
            top: 54px;
          }
        }

        .mc-topbar {
          align-items: center;
          display: flex;
          flex-wrap: wrap;
          gap: 14px;
          margin-bottom: 14px;
          min-width: 0;
        }

        .mc-song-selector {
          align-items: center;
          display: flex;
          gap: 6px;
        }

        .mc-song-arrow {
          background: var(--mc-bg-control);
          border: 1px solid var(--mc-border-control);
          border-radius: 4px;
          color: var(--mc-text-primary);
          cursor: pointer;
          font-size: 12px;
          font-weight: 800;
          padding: 6px 8px;
        }

        .mc-song-name-wrap {
          position: relative;
        }

        .mc-song-name {
          background: var(--mc-bg-box);
          border: 1px solid var(--mc-border-control);
          border-radius: 4px;
          color: var(--mc-text-title);
          cursor: pointer;
          font-size: 14px;
          font-weight: 800;
          min-width: 110px;
          padding: 6px 12px;
          text-align: center;
        }

        .mc-song-list {
          background: var(--mc-bg-box);
          border: 1px solid var(--mc-border-control);
          border-radius: 6px;
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.25);
          display: flex;
          flex-direction: column;
          left: 0;
          margin-top: 4px;
          min-width: 140px;
          padding: 4px;
          position: absolute;
          top: 100%;
          z-index: 210;
        }

        .mc-song-option {
          background: transparent;
          border: none;
          border-radius: 4px;
          color: var(--mc-text-primary);
          cursor: pointer;
          font-size: 13px;
          padding: 8px 10px;
          text-align: left;
        }

        .mc-song-option:hover {
          background: var(--mc-bg-control);
        }

        .mc-song-scale {
          background: var(--mc-bg-control);
          border: 1px solid var(--mc-border-control);
          border-radius: 4px;
          color: var(--mc-text-secondary);
          font-size: 11px;
          font-weight: 700;
          padding: 5px 8px;
          white-space: nowrap;
        }

        .mc-play-button {
          background: #34d399;
          border: 1px solid #6ee7b7;
          border-radius: 999px;
          color: #09090b;
          cursor: pointer;
          font-size: 16px;
          height: 40px;
          width: 40px;
        }

        .mc-master-volume {
          align-items: center;
          color: var(--mc-text-secondary);
          display: flex;
          font-size: 12px;
          font-weight: 700;
          gap: 8px;
          min-width: 0;
        }

        .mc-master-volume input[type='range'] {
          accent-color: #34d399;
          cursor: pointer;
          width: 120px;
        }

        .mc-master-volume-value {
          color: var(--mc-text-primary);
          min-width: 24px;
          text-align: right;
        }

        .mc-channels {
          display: flex;
          gap: 10px;
          overflow-x: auto;
          padding-bottom: 4px;
        }
      `}</style>
    </>
  );
}
