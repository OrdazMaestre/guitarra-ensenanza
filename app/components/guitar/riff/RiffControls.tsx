'use client';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { levelLabel, RIFF_LEVEL_GROUPS, RIFF_LEVELS } from '@/app/lib/riff/levels';
import type { RiffBacking, RiffMode } from '@/app/lib/riff/session';
import type { RiffController } from './useRiffController';
import { RIFF_PANEL_TOUR, TutorialButton } from '../ButtonTour';
import { trackRole } from '@/app/lib/riff/roles';
import { BackingIcon, DiscIcon, LevelIcon, LoopIcon, ModeIcon, SpeedIcon, TrackIcon, type TrackRole } from './RiffIcons';
import type { SongEntry } from '@/app/lib/songs';

// Panel del juego tipo Rocksmith que se despliega desde el botón "JUGAR" de la barra de controles
// del mástil MIDI (ReducedFretboardDiagram, prop `riffGame`): desplegables de ajustes + "Empezar"
// / "Volver a empezar" y "Continuar". Ver app/lib/riff/ y useRiffController.ts.

const SPEEDS = [0.5, 0.75, 1] as const;
const MODE_LABEL: Record<RiffMode, string> = { ritmo: 'Con ritmo', paso: 'Paso a paso' };
const BACKING_LABEL: Record<RiffBacking, string> = { metronomo: 'Metrónomo', bateria: 'Batería', nada: 'Sin nada' };
type MenuId = 'cancion' | 'nivel' | 'pista' | 'velocidad' | 'ritmo' | 'compases' | 'modo';
const ROLE_LABEL: Record<TrackRole, string> = { S: 'Guitarra solista', R: 'Guitarra rítmica' };

// Orden (decisión del usuario): Canción (el disco, a la izquierda del todo), Pista, Nivel, acompañamiento, Velocidad, Ritmo, Compases/bucle.
// Las notas que pasan del último traste se siguen recolocando (chart.ts), pero ya sin aviso.
// En el panel solo se ven ICONOS (petición del usuario: ahorrar espacio); el nombre de cada ajuste
// y su valor siguen en aria-label, en `title` y en texto oculto. En los menús, icono + nombre.
interface Props {
  // Al pulsar "Empezar" (el mástil lo usa para centrarse en pantalla).
  onStart?: () => void;
  // Elegir otra canción (botón del disco). Cambiar de canción para la partida.
  onSong?: (id: string) => void;
  riff: RiffController;
  song?: SongEntry;
  songs?: SongEntry[];
  // Papel de cada pista (nombre de pista -> S solista / R rítmica), sin el nombre del músico. Si
  // falta, se deduce del nombre ("Lead"/"Solo" = S; lo demás, R).
  trackRoles?: Record<string, TrackRole>;
}

export function RiffControls({ onSong, onStart, riff, song, songs = [], trackRoles }: Props) {
  const roleOf = (name: string): TrackRole => trackRole(name, trackRoles);
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
        {songs.length > 1 && (
          <RiffDropdown {...menuProps('cancion')} icon={<DiscIcon />} label="Canción" value={song?.title ?? '—'}>
            {songs.map((entry) => (
              <button aria-pressed={song?.id === entry.id} className="riff-chip" key={entry.id} onClick={() => pick(() => onSong?.(entry.id))} type="button">
                <DiscIcon />
                {entry.title}
              </button>
            ))}
          </RiffDropdown>
        )}
        {riff.tracks.length > 1 && (
          <RiffDropdown {...menuProps('pista')} icon={<TrackIcon role={currentTrack ? roleOf(currentTrack.name) : 'R'} />} label="Pista" value={currentTrack ? ROLE_LABEL[roleOf(currentTrack.name)] : '—'}>
            {riff.tracks.map((track) => (
              <button aria-pressed={riff.trackIndex === track.index} className="riff-chip" key={track.index} onClick={() => pick(() => riff.setTrackIndex(track.index))} type="button">
                <TrackIcon role={roleOf(track.name)} />
                {ROLE_LABEL[roleOf(track.name)]}
              </button>
            ))}
          </RiffDropdown>
        )}
        <RiffDropdown {...menuProps('nivel')} icon={<LevelIcon level={riff.level} />} label="Nivel" value={levelLabel(riff.level)}>
          {/* Dos modos, uno por columna: Trastes (vale cualquier cuerda) y Cuerdas. */}
          <div className="riff-level-groups">
            {RIFF_LEVEL_GROUPS.map((group) => (
              <div aria-label={group.label} className="riff-level-group" key={group.id} role="group">
                <span className="riff-level-heading">{group.label}</span>
                {group.levels.map((value) => {
                  const available = value === 'experto' || RIFF_LEVELS[value].available;
                  return (
                    <button aria-pressed={riff.level === value} className="riff-chip" disabled={!available} key={value} onClick={() => pick(() => riff.setLevel(value))} type="button">
                      <LevelIcon level={value} />
                      {levelLabel(value)}{available ? '' : ' (pronto)'}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </RiffDropdown>
        <RiffDropdown {...menuProps('modo')} icon={<BackingIcon backing={riff.backing} />} label="Modo" value={BACKING_LABEL[riff.backing]}>
          {(['metronomo', 'bateria', 'nada'] as const).map((value) => (
            <button
              aria-pressed={riff.backing === value}
              className="riff-chip"
              disabled={value === 'bateria' && !!chart && chart.drums.length === 0}
              key={value}
              onClick={() => pick(() => riff.setBacking(value))}
              type="button"
            >
              <BackingIcon backing={value} />
              {BACKING_LABEL[value]}
            </button>
          ))}
        </RiffDropdown>
        <RiffDropdown {...menuProps('velocidad')} icon={<SpeedIcon speed={riff.speed} />} label="Velocidad" value={`${Math.round(riff.speed * 100)}%`}>
          {SPEEDS.map((value) => (
            <button aria-pressed={riff.speed === value} className="riff-chip" key={value} onClick={() => pick(() => riff.setSpeed(value))} type="button">
              <SpeedIcon speed={value} />
              {Math.round(value * 100)}%
            </button>
          ))}
        </RiffDropdown>
        <RiffDropdown {...menuProps('ritmo')} icon={<ModeIcon mode={riff.mode} />} label="Ritmo" value={MODE_LABEL[riff.mode]}>
          {(['ritmo', 'paso'] as const).map((value) => (
            <button aria-pressed={riff.mode === value} className="riff-chip" key={value} onClick={() => pick(() => riff.setMode(value))} type="button">
              <ModeIcon mode={value} />
              {MODE_LABEL[value]}
            </button>
          ))}
        </RiffDropdown>
        {/* Solo el icono del bucle: normal si se repite, tachado si no. */}
        <RiffDropdown {...menuProps('compases')} icon={<LoopIcon loop={riff.loop} />} label="Compases" value={`${from}–${to}${riff.loop ? ' en bucle' : ''}`}>
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
          <button aria-pressed={riff.loop} className="riff-chip" onClick={() => riff.setLoop((l) => !l)} type="button">
            <LoopIcon loop={riff.loop} />
            Repetir en bucle
          </button>
        </RiffDropdown>
      </div>

      <div className="riff-actions">
        <button className="riff-action riff-action-start" disabled={!riff.canStart} onClick={start} type="button">
          {riff.hasStarted ? 'Volver a empezar' : 'Empezar'}
        </button>
        {/* Continuar: retoma la partida en pausa un compás antes, con cuenta de entrada. */}
        <button className="riff-action riff-action-stop" disabled={!riff.paused} onClick={continueGame} type="button">Continuar</button>
        {/* Tutorial del panel: antes, vuelve a la configuración de base (petición del usuario). */}
        <TutorialButton
          // Al final, la partida tutorial de mecánicas (riffTutorial.ts).
          finish={{ label: '¡A jugar!', run: () => { onStart?.(); riff.startTutorial(); } }}
          onStart={() => {
            setOpenMenu(null);
            riff.resetDefaults();
          }}
          rootRef={panelRef}
          steps={RIFF_PANEL_TOUR}
        />
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
  icon: ReactNode;
  id: MenuId;
  label: string;
  onToggle: () => void;
  open: boolean;
  value: string;
}

// Desplegable de los ajustes: un botón "icono ▾" (nombre y valor ocultos a la vista) y, encima,
// una columna flotante con las opciones.
function RiffDropdown({ children, disabled, icon, id, label, onToggle, open, value }: DropdownProps) {
  return (
    <div className="riff-dd">
      <button
        aria-controls={`riff-menu-${id}`}
        aria-expanded={open}
        aria-label={`${label}: ${value}`}
        className="riff-dd-toggle"
        disabled={disabled}
        onClick={onToggle}
        title={`${label}: ${value}`}
        type="button"
      >
        {icon}
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
      /* Con JUGAR activado, el botón KEYBOARD del mástil resplandece como los botones "Tutorial"
         (petición del usuario: que se vea que con teclado se juega mejor) -- mismo brillo que late,
         verde; en modo oscuro, el dorado (ver .tour-launch en ButtonTour.tsx). En pantallas táctiles
         el botón ni se ve (.midi-kb-toggle, globals.css). */
      .riff-kb-glow {
        position: relative;
      }
      .riff-kb-glow::before,
      .riff-kb-arrow {
        --riff-kb-glow: rgba(16, 185, 129, 0.8);
      }
      html[data-theme='dark'] .riff-kb-glow::before,
      html[data-theme='dark'] .riff-kb-arrow {
        --riff-kb-glow: rgb(144, 105, 0);
      }
      .riff-kb-glow::before {
        animation: riff-kb-glow 2s ease-in-out infinite;
        border-radius: inherit;
        content: '';
        inset: 0;
        pointer-events: none;
        position: absolute;
      }
      @keyframes riff-kb-glow {
        0%, 100% { box-shadow: 0 0 2px 0 var(--riff-kb-glow); }
        50% { box-shadow: 0 0 14px 4px var(--riff-kb-glow); }
      }

      /* Flecha en la fila de los números de traste, justo encima del botón KEYBOARD mientras no está
         activado (petición del usuario). Se coloca midiendo el botón (ReducedFretboardDiagram), así que
         lo sigue en cualquier ancho. Resplandece con el mismo brillo que el botón. Sin teclado
         físico, fuera, igual que el botón. */
      .riff-kb-arrow {
        animation: riff-kb-arrow 1.2s ease-in-out infinite, riff-kb-arrow-glow 2s ease-in-out infinite;
        color: #047857;
        font-size: 15px;
        font-weight: 900;
        line-height: 1;
        pointer-events: none;
        position: absolute;
        transform: translate(-50%, -50%);
        z-index: 5;
      }
      @keyframes riff-kb-arrow {
        0%, 100% { transform: translate(-50%, -50%); }
        50% { transform: translate(-50%, -20%); }
      }
      @keyframes riff-kb-arrow-glow {
        0%, 100% { filter: drop-shadow(0 0 1px var(--riff-kb-glow)); }
        50% { filter: drop-shadow(0 0 6px var(--riff-kb-glow)) drop-shadow(0 0 3px var(--riff-kb-glow)); }
      }
      @media (prefers-reduced-motion: reduce) {
        .riff-kb-glow::before {
          animation: none;
          box-shadow: 0 0 10px 3px var(--riff-kb-glow);
        }
        .riff-kb-arrow {
          animation: none;
          filter: drop-shadow(0 0 5px var(--riff-kb-glow));
        }
      }
      @media (hover: none) and (pointer: coarse) {
        .riff-kb-arrow {
          display: none;
        }
      }

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
      /* Compacto y ENCIMA del mástil (centrado sobre sus cuerdas; ReducedFretboardDiagram calcula
         el 'top'), dejando la autopista libre por encima. */
      .riff-overlay {
        background: #ffffff;
        border: 1px solid #d1d5db;
        border-radius: 12px;
        box-shadow: 0 14px 32px rgba(0, 0, 0, 0.35);
        left: 50%;
        max-width: calc(100% - 16px);
        padding: 8px 10px;
        position: absolute;
        top: 10px;
        transform: translate(-50%, -50%);
        width: max-content;
        z-index: 30;
      }

      .riff-panel {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 0;
      }

      .riff-controls {
        align-items: center;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        justify-content: center;
        min-width: 0;
      }

      .riff-dd {
        position: relative;
      }

      .riff-dd-toggle,
      .riff-chip,
      .riff-action {
        white-space: nowrap;
      }

      .riff-dd-toggle {
        align-items: center;
        background: #ffffff;
        border: 1.5px solid #9ca3af;
        border-radius: 999px;
        color: #374151;
        cursor: pointer;
        display: inline-flex;
        font-size: 12px;
        gap: 5px;
        line-height: 1.3;
        padding: 4px 10px 4px 8px;
      }

      .riff-icon {
        color: #047857;
        display: block;
        flex: none;
      }

      .riff-chip[aria-pressed='true'] .riff-icon {
        color: #ffffff;
      }

      /* La letra S/R va recortada en el clavijero: toma el color del fondo del botón. */
      .riff-track-letter {
        fill: #ffffff;
      }

      .riff-chip[aria-pressed='true'] .riff-track-letter {
        fill: #047857;
      }

      .riff-dd-toggle[aria-expanded='true'] {
        border-color: #047857;
      }

      .riff-dd-toggle:disabled {
        cursor: default;
        opacity: 0.55;
      }

      /* Nombre y valor, solo para lectores de pantalla (y para el 'title'): se ve el icono. */
      .riff-dd-label,
      .riff-dd-value {
        clip: rect(0 0 0 0);
        clip-path: inset(50%);
        height: 1px;
        overflow: hidden;
        position: absolute;
        white-space: nowrap;
        width: 1px;
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
        /* Hacia ARRIBA: el panel está sobre el mástil y encima hay sitio (la autopista). */
        bottom: 100%;
        left: 50%;
        margin-bottom: 6px;
        max-width: calc(100vw - 32px);
        padding: 8px;
        /* Ancho por su contenido, no por el botón que lo ancla (si no, las dos columnas de Nivel
           se apilaban). */
        width: max-content;
        position: absolute;
        transform: translateX(-50%);
        white-space: nowrap;
        z-index: 20;
      }

      /* Puntos de la partida, bajo el mástil (ReducedFretboardDiagram): rojo intenso con brillo
         amarillo (decisión del usuario). Altura fija: la fila no cambia al aparecer el número. */
      .riff-score {
        color: #dc2626;
        font-size: 22px;
        font-weight: 950;
        letter-spacing: 0.02em;
        line-height: 30px;
        margin: 2px 0 0;
        min-height: 30px;
        text-align: center;
        text-shadow: 0 0 6px #facc15, 0 0 14px rgba(250, 204, 21, 0.85);
      }

      .riff-level-groups {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        justify-content: center;
      }

      .riff-level-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .riff-level-heading {
        color: #047857;
        font-size: 12px;
        font-weight: 900;
        text-align: center;
        text-transform: uppercase;
      }

      .riff-chip {
        align-items: center;
        background: transparent;
        display: inline-flex;
        gap: 8px;
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
        align-items: center;
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        justify-content: center;
      }

      .riff-action {
        border-radius: 999px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 950;
        letter-spacing: 0.08em;
        min-height: 34px;
        padding: 4px 18px;
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
      html[data-theme='dark'] .riff-highway,
      html[data-theme='dark'] .riff-score,
      html[data-theme='dark'] .riff-level-face {
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
