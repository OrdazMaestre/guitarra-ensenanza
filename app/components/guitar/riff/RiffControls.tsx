'use client';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { levelLabel, RIFF_LEVEL_ORDER, RIFF_LEVELS } from '@/app/lib/riff/levels';
import type { RiffBacking, RiffMode } from '@/app/lib/riff/session';
import type { RiffController } from './useRiffController';

// Panel del juego tipo Rocksmith que se despliega desde el botón "JUGAR" de la barra de controles
// del mástil MIDI (ReducedFretboardDiagram, prop `riffGame`): desplegables de ajustes + "Empezar"
// / "Volver a empezar" y "Continuar". Ver app/lib/riff/ y useRiffController.ts.

const SPEEDS = [0.5, 0.75, 1] as const;
const MODE_LABEL: Record<RiffMode, string> = { ritmo: 'Con ritmo', paso: 'Paso a paso' };
const BACKING_LABEL: Record<RiffBacking, string> = { metronomo: 'Metrónomo', bateria: 'Batería', nada: 'Sin nada' };
type MenuId = 'nivel' | 'pista' | 'velocidad' | 'ritmo' | 'compases' | 'modo';

// "Rhythm Guitar (James)" -> "James", para que el botón del desplegable sea corto.
function shortTrackName(name: string) {
  return name.match(/\(([^)]+)\)/)?.[1] ?? name;
}

// Orden (decisión del usuario): Pista, Nivel, Velocidad, Ritmo, Compases/bucle, acompañamiento.
// Las notas que pasan del último traste se siguen recolocando (chart.ts), pero ya sin aviso.
interface Props {
  // Al pulsar "Empezar" (el mástil lo usa para centrarse en pantalla).
  onStart?: () => void;
  riff: RiffController;
}

export function RiffControls({ onStart, riff }: Props) {
  // Solo un desplegable abierto a la vez; se cierra al pulsar fuera o con Escape.
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { chart, playing } = riff;

  useEffect(() => {
    if (!openMenu) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpenMenu(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenMenu(null); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openMenu]);

  // Elegir una opción cierra el desplegable (salvo "Compases", que tiene campos que rellenar).
  function pick(apply: () => void) {
    apply();
    setOpenMenu(null);
  }

  function start() {
    setOpenMenu(null);
    riff.start();
    onStart?.();
  }

  function continueGame() {
    setOpenMenu(null);
    riff.resume();
    onStart?.();
  }

  const currentTrack = riff.tracks.find((track) => track.index === riff.trackIndex);
  const menuProps = (id: MenuId) => ({
    disabled: playing,
    id,
    onToggle: () => setOpenMenu((open) => (open === id ? null : id)),
    open: openMenu === id && !playing,
  });
  const from = Math.min(riff.fromBar, riff.toBar);
  const to = Math.max(riff.fromBar, riff.toBar);

  return (
    <div aria-label="Ajustes de la partida" className="riff-panel" ref={panelRef} role="group">
      <div className="riff-controls">
        {riff.tracks.length > 1 && (
          <RiffDropdown {...menuProps('pista')} label="Pista" value={currentTrack ? shortTrackName(currentTrack.name) : '—'}>
            {riff.tracks.map((track) => (
              <button aria-pressed={riff.trackIndex === track.index} className="riff-chip" key={track.index} onClick={() => pick(() => riff.setTrackIndex(track.index))} type="button">
                {track.name}
              </button>
            ))}
          </RiffDropdown>
        )}
        <RiffDropdown {...menuProps('nivel')} label="Nivel" value={levelLabel(riff.level)}>
          {RIFF_LEVEL_ORDER.map((value) => {
            const available = value === 'experto' || RIFF_LEVELS[value].available;
            return (
              <button aria-pressed={riff.level === value} className="riff-chip" disabled={!available} key={value} onClick={() => pick(() => riff.setLevel(value))} type="button">
                {levelLabel(value)}{available ? '' : ' (pronto)'}
              </button>
            );
          })}
        </RiffDropdown>
        <RiffDropdown {...menuProps('velocidad')} label="Velocidad" value={`${Math.round(riff.speed * 100)}%`}>
          {SPEEDS.map((value) => (
            <button aria-pressed={riff.speed === value} className="riff-chip" key={value} onClick={() => pick(() => riff.setSpeed(value))} type="button">
              {Math.round(value * 100)}%
            </button>
          ))}
        </RiffDropdown>
        <RiffDropdown {...menuProps('ritmo')} label="Ritmo" value={MODE_LABEL[riff.mode]}>
          {(['ritmo', 'paso'] as const).map((value) => (
            <button aria-pressed={riff.mode === value} className="riff-chip" key={value} onClick={() => pick(() => riff.setMode(value))} type="button">
              {MODE_LABEL[value]}
            </button>
          ))}
        </RiffDropdown>
        <RiffDropdown {...menuProps('compases')} label="Compases" value={`${from}–${to}${riff.loop ? ' ↻' : ''}`}>
          <div className="riff-bars">
            <label>
              Del
              <input aria-label="Desde el compás" max={riff.maxBar} min={1} onChange={(e) => riff.setFromBar(clampBar(e.target.value, riff.maxBar))} type="number" value={riff.fromBar} />
            </label>
            <label>
              al
              <input aria-label="Hasta el compás" max={riff.maxBar} min={1} onChange={(e) => riff.setToBar(clampBar(e.target.value, riff.maxBar))} type="number" value={riff.toBar} />
            </label>
          </div>
          <button aria-pressed={riff.loop} className="riff-chip" onClick={() => riff.setLoop((l) => !l)} type="button">Repetir en bucle</button>
        </RiffDropdown>
        <RiffDropdown {...menuProps('modo')} label="Modo" value={BACKING_LABEL[riff.backing]}>
          {(['metronomo', 'bateria', 'nada'] as const).map((value) => (
            <button
              aria-pressed={riff.backing === value}
              className="riff-chip"
              disabled={value === 'bateria' && !!chart && chart.drums.length === 0}
              key={value}
              onClick={() => pick(() => riff.setBacking(value))}
              type="button"
            >
              {BACKING_LABEL[value]}
            </button>
          ))}
        </RiffDropdown>
      </div>

      <div className="riff-actions">
        <button className="riff-action riff-action-start" disabled={!riff.canStart} onClick={start} type="button">
          {riff.hasStarted ? 'Volver a empezar' : 'Empezar'}
        </button>
        {/* Continuar: retoma la partida en pausa un compás antes, con cuenta de entrada. */}
        <button className="riff-action riff-action-stop" disabled={!riff.paused} onClick={continueGame} type="button">Continuar</button>
      </div>

      {riff.loadError && <p className="riff-note">No se pudo cargar la tablatura.</p>}
      {riff.narrow && (
        <p className="riff-narrow-warning" role="status">
          Esta pantalla es muy estrecha para jugar.
          <br />
          Gira el móvil o haz la ventana más grande.
        </p>
      )}
    </div>
  );
}

interface DropdownProps {
  children: ReactNode;
  disabled: boolean;
  id: MenuId;
  label: string;
  onToggle: () => void;
  open: boolean;
  value: string;
}

// Desplegable de los ajustes: un botón "Etiqueta valor ▾" y, debajo, una columna flotante con
// las opciones.
function RiffDropdown({ children, disabled, id, label, onToggle, open, value }: DropdownProps) {
  return (
    <div className="riff-dd">
      <button
        aria-controls={`riff-menu-${id}`}
        aria-expanded={open}
        aria-label={`${label}: ${value}`}
        className="riff-dd-toggle"
        disabled={disabled}
        onClick={onToggle}
        type="button"
      >
        <span className="riff-dd-label">{label}</span>
        <span className="riff-dd-value">{value}</span>
        <span aria-hidden="true" className="riff-dd-caret">▾</span>
      </button>
      {open && (
        <div className="riff-dd-menu" id={`riff-menu-${id}`} role="group" aria-label={label}>
          {children}
        </div>
      )}
    </div>
  );
}

function clampBar(value: string, maxBar: number) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 1;
  return Math.min(maxBar, Math.max(1, n));
}

export function RiffStyles() {
  return (
    <style>{`
      /* Mástil durante la partida (petición del usuario): madera algo transparente; separaciones de
         trastes, cejuela y círculos en AMARILLO, opacos y con un brillo moderado; las cuerdas del
         <svg> se esconden porque las dibuja la autopista (RiffHighway) con su color y su
         transparencia sincronizada con la música. */
      .riff-live .reduced-board-bg {
        fill-opacity: 0.78;
      }

      .riff-live .reduced-string {
        opacity: 0;
      }

      .riff-live .reduced-fret,
      .riff-live .reduced-nut {
        filter: drop-shadow(0 0 3px rgba(250, 204, 21, 0.75));
        stroke: #facc15;
      }

      .riff-live .reduced-guide-dot {
        fill: #facc15;
        filter: drop-shadow(0 0 4px rgba(250, 204, 21, 0.8));
        opacity: 1;
      }

      .riff-open-toggle {
        background: transparent;
        border: 1.5px solid #047857;
        border-radius: 5px;
        color: #047857;
        cursor: pointer;
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.06em;
        line-height: 1.4;
        padding: 3px 10px;
      }

      .riff-open-toggle[aria-pressed='true'] {
        background: #047857;
        color: #ffffff;
      }

      /* PAUSA: mismo aspecto que los botones de la barra del mástil (KEYBOARD, CLEAN...). */
      .riff-pause-toggle {
        background: transparent;
        border: 1.5px solid #9ca3af;
        border-radius: 5px;
        color: #6b7280;
        cursor: pointer;
        font-size: 12px;
        font-weight: 700;
        line-height: 1.4;
        padding: 3px 8px;
      }

      .riff-pause-toggle[aria-pressed='true'] {
        background: #047857;
        border-color: #047857;
        color: #ffffff;
      }

      /* Panel de ajustes de la partida: DELANTE del juego (encima de la autopista), no colgando de la
         barra de controles. Se pliega al empezar/continuar y se despliega al pausar o terminar. */
      .riff-overlay {
        background: #ffffff;
        border: 1px solid #d1d5db;
        border-radius: 12px;
        box-shadow: 0 14px 32px rgba(0, 0, 0, 0.35);
        left: 50%;
        max-width: calc(100% - 16px);
        padding: 12px;
        position: absolute;
        top: 10px;
        transform: translateX(-50%);
        width: max-content;
        z-index: 30;
      }

      .riff-panel {
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-width: 0;
      }

      .riff-controls {
        align-items: center;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: center;
        min-width: 0;
      }

      .riff-dd {
        position: relative;
      }

      .riff-dd-toggle {
        align-items: baseline;
        background: #ffffff;
        border: 1.5px solid #9ca3af;
        border-radius: 999px;
        color: #374151;
        cursor: pointer;
        display: inline-flex;
        font-size: 12px;
        gap: 6px;
        line-height: 1.3;
        padding: 6px 12px;
      }

      .riff-dd-toggle[aria-expanded='true'] {
        border-color: #047857;
      }

      .riff-dd-toggle:disabled {
        cursor: default;
        opacity: 0.55;
      }

      .riff-dd-label {
        color: #6b7280;
        font-weight: 700;
      }

      .riff-dd-value {
        color: #047857;
        font-weight: 900;
      }

      .riff-dd-caret {
        color: #6b7280;
        font-size: 10px;
      }

      .riff-dd-menu {
        align-items: stretch;
        background: #ffffff;
        border: 1.5px solid #d1d5db;
        border-radius: 12px;
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
        display: flex;
        flex-direction: column;
        gap: 6px;
        left: 50%;
        margin-top: 6px;
        max-width: calc(100vw - 32px);
        padding: 8px;
        position: absolute;
        top: 100%;
        transform: translateX(-50%);
        white-space: nowrap;
        z-index: 20;
      }

      .riff-chip {
        background: transparent;
        border: 1.5px solid #9ca3af;
        border-radius: 999px;
        color: #374151;
        cursor: pointer;
        font-size: 12px;
        font-weight: 800;
        line-height: 1.3;
        padding: 5px 11px;
      }

      .riff-chip[aria-pressed='true'] {
        background: #047857;
        border-color: #047857;
        color: #ffffff;
      }

      .riff-chip:disabled {
        cursor: default;
        opacity: 0.55;
      }

      .riff-bars {
        display: flex;
        gap: 10px;
      }

      .riff-bars label {
        align-items: center;
        color: #374151;
        display: flex;
        font-size: 12px;
        font-weight: 800;
        gap: 6px;
      }

      .riff-bars input {
        border: 1.5px solid #9ca3af;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 700;
        padding: 3px 6px;
        width: 64px;
      }

      .riff-actions {
        display: flex;
        gap: 10px;
        justify-content: center;
      }

      .riff-action {
        border-radius: 999px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 950;
        letter-spacing: 0.08em;
        min-height: 40px;
        padding: 6px 22px;
        text-transform: uppercase;
      }

      .riff-action-start {
        background: #047857;
        border: 2px solid #047857;
        color: #ffffff;
      }

      .riff-action-stop {
        background: #ffffff;
        border: 2px solid #047857;
        color: #047857;
      }

      .riff-action:disabled {
        background: #e5e7eb;
        border-color: #d1d5db;
        color: #9ca3af;
        cursor: default;
      }

      .riff-note {
        color: #4b5563;
        font-size: 12px;
        line-height: 1.4;
        margin: 0;
        text-align: center;
        white-space: normal;
      }

      .riff-narrow-warning {
        background: #fef3c7;
        border: 2px solid #f59e0b;
        border-radius: 10px;
        color: #92400e;
        font-size: 13px;
        font-weight: 800;
        line-height: 1.4;
        margin: 0;
        padding: 8px 12px;
        text-align: center;
        white-space: normal;
      }

      .riff-highway-space {
        height: clamp(220px, 30vw, 380px);
      }

      .riff-highway {
        left: 0;
        pointer-events: none;
        position: absolute;
        top: 0;
        z-index: 1;
      }

      /* Modo oscuro de la web (invierte .site-shell): la autopista se contra-invierte, como las
         imágenes, para conservar sus colores reales (oscura). */
      html[data-theme='dark'] .riff-highway {
        filter: invert(1) hue-rotate(180deg);
      }

      /* ...y durante la partida también el mástil, para que encaje con la autopista (madera oscura,
         trastes amarillos). Sus números de traste, en blanco: así se leen sobre la página oscura. */
      html[data-theme='dark'] .riff-live svg.reduced-fretboard {
        filter: invert(1) hue-rotate(180deg);
      }

      html[data-theme='dark'] .riff-live .reduced-fret-number,
      html[data-theme='dark'] .riff-live .reduced-roman-fret {
        fill: #ffffff;
      }
    `}</style>
  );
}
