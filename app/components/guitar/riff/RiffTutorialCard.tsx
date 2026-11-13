'use client';
import { useEffect, useState } from 'react';
import { isTouchOnly } from '@/app/lib/localSongs';
import { SLIDE_STEP_MS, slideFrame, TAP_VARIANTS, type TapVariant } from './tutorialKeyFrames';
import { RIFF_TUTORIAL, RIFF_TUTORIAL_END, type TutorialAnimation } from './riffTutorial';
import type { RiffController } from './useRiffController';

// Tarjeta de la partida tutorial (riffTutorial.ts), en el sitio del panel de ajustes (delante del
// mástil) mientras no se está tocando: los mensajes de cada parte con su animación (antes de
// empezar y en cada parada automática), la pausa o el final.

export function RiffTutorialCard({ riff }: { riff: RiffController }) {
  const card = riff.tutorialCard;
  if (!card) return null;
  const sectionIndex = card.startsWith('section-') ? Number(card.slice('section-'.length)) : null;
  const section = sectionIndex !== null ? RIFF_TUTORIAL[sectionIndex] : null;

  return (
    <div aria-label="Partida de prueba" className="riff-tutorial-card" data-card={card} role="group">
      <TutorialCardStyles />
      {section && sectionIndex !== null ? (
        <>
          <h3 className="riff-tutorial-title">{section.title}</h3>
          {section.animation && <TutorialAnimationView kind={section.animation} />}
          {section.lines.map((line) => <p className="riff-tutorial-line" key={line}>{line}</p>)}
          <div className="riff-tutorial-actions">
            <button className="riff-tutorial-btn" onClick={riff.exitTutorial} type="button">Salir</button>
            <button className="riff-tutorial-btn riff-tutorial-main" disabled={!riff.tutorialReady} onClick={riff.playTutorial} type="button">¡A tocar!</button>
          </div>
        </>
      ) : card === 'pause' ? (
        <>
          <h3 className="riff-tutorial-title">Pausa</h3>
          <div className="riff-tutorial-actions">
            <button className="riff-tutorial-btn" onClick={riff.exitTutorial} type="button">Salir</button>
            <button className="riff-tutorial-btn riff-tutorial-main" onClick={riff.resume} type="button">Continuar</button>
          </div>
        </>
      ) : (
        <>
          <h3 className="riff-tutorial-title">{RIFF_TUTORIAL_END.title}</h3>
          {RIFF_TUTORIAL_END.lines.map((line) => <p className="riff-tutorial-line" key={line}>{line}</p>)}
          <div className="riff-tutorial-actions">
            <button className="riff-tutorial-btn riff-tutorial-main" onClick={riff.exitTutorial} type="button">Terminar</button>
          </div>
        </>
      )}
    </div>
  );
}

// --- Animaciones (petición del usuario), SEGÚN EL DISPOSITIVO (2026-11-13; por capacidad, `isTouchOnly`):
// - Pantalla táctil: solo dedos (mano). Mantener: un dedo quieto; tapear: dos manos, la izquierda (la nota
//   grave) mantiene y la derecha pulsa una y otra vez; deslizar: una mano que va y vuelve sin soltar.
// - PC: el teclado, con las letras Z X C V B N sobre sus trastes (0-5 de la cuerda 6, como FRETBOARD_KEYMAP)
//   y la tecla pulsada iluminada. Mantener: Z mantenida; tapear, alternando y SIEMPRE empezando por las dos
//   teclas: doble teclado Z <-> N, o Z mantenida + clic del ratón en el traste 5; deslizar: N V X Z y vuelta
//   con las teclas (normal y luego con las graves mantenidas = pull-off/hammer-on) y después el cursor
//   (tutorialKeyFrames.ts). Ya no se mezclan dedo y cursor: no se puede.
// Casillas del trozo de mástil: el aire (antes de la cejuela) y los trastes 1-5.

type Pointer = 'cursor' | 'hand';
const CELL_X = [26, 66, 106, 146, 186, 220];
const KEY_LETTERS = ['Z', 'X', 'C', 'V', 'B', 'N'];

function TutorialAnimationView({ kind }: { kind: TutorialAnimation }) {
  const touch = isTouchOnly();
  return (
    <svg aria-hidden="true" className="riff-tutorial-anim" data-animation={kind} data-device={touch ? 'touch' : 'pc'} viewBox="0 0 240 84">
      {/* Un trozo de mástil: madera, trastes y una cuerda. */}
      <rect fill="#f5e6c8" height="44" rx="6" stroke="#d6b98a" width="228" x="6" y="18" />
      {[46, 86, 126, 166, 206].map((x) => <path d={`M${x} 18V62`} key={x} stroke="#9ca3af" strokeWidth="2.5" />)}
      <path d="M6 40H234" stroke="#6b7280" strokeWidth="2.5" />
      {kind === 'hold' ? <HoldAnim touch={touch} /> : kind === 'tapping' ? <TappingAnim touch={touch} /> : <SlideAnim touch={touch} />}
    </svg>
  );
}

// Letras del teclado sobre sus trastes; `lit` = mantenidas, `blink` = pulsadas una y otra vez.
function KeyLetters({ blink = [], lit = [] }: { blink?: number[]; lit?: number[] }) {
  return (
    <g className="riff-anim-keys">
      {KEY_LETTERS.map((letter, k) => {
        const state = lit.includes(k) ? 'lit' : blink.includes(k) ? 'blink' : 'off';
        return (
          <g data-key={letter} data-state={state} key={letter}>
            <rect className={`riff-anim-key riff-anim-key-${state}`} height="14" rx="3" width="14" x={CELL_X[k] - 7} y="64" />
            <text className="riff-anim-key-letter" textAnchor="middle" x={CELL_X[k]} y="74.5">{letter}</text>
          </g>
        );
      })}
    </g>
  );
}

function HoldAnim({ touch }: { touch: boolean }) {
  return (
    <>
      <circle className="riff-anim-held" cx={CELL_X[0]} cy="40" r="10" />
      {touch ? <g transform={`translate(${CELL_X[0]} 40)`}><PointerGlyph kind="hand" /></g> : <KeyLetters lit={[0]} />}
    </>
  );
}

function TappingAnim({ touch }: { touch: boolean }) {
  const [turn, setTurn] = useState(0);
  const variant: TapVariant = TAP_VARIANTS[turn % TAP_VARIANTS.length];
  useEffect(() => {
    if (touch) return;
    const id = window.setInterval(() => setTurn((t) => t + 1), 2800);
    return () => window.clearInterval(id);
  }, [touch]);
  const right = CELL_X[5];
  return (
    <g data-variant={touch ? 'hands' : variant}>
      {/* Izquierda: la nota grave, pulsación mantenida (círculo fijo), como en el mástil. */}
      <circle className="riff-anim-held" cx={CELL_X[0]} cy="40" r="10" />
      {/* Derecha: pulsa una y otra vez (onda en cada toque). */}
      <circle className="riff-anim-ripple" cx={right} cy="40" r="10" />
      {touch ? (
        <>
          <g transform={`translate(${CELL_X[0]} 40)`}><PointerGlyph kind="hand" /></g>
          <g transform={`translate(${right} 40)`}><g className="riff-anim-tap"><PointerGlyph kind="hand" /></g></g>
        </>
      ) : variant === 'mouse' ? (
        <>
          <KeyLetters lit={[0]} />
          <g transform={`translate(${right} 40)`}><g className="riff-anim-tap"><PointerGlyph kind="cursor" /></g></g>
        </>
      ) : (
        <KeyLetters blink={[5]} lit={[0]} />
      )}
    </g>
  );
}

function SlideAnim({ touch }: { touch: boolean }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (touch) return;
    const id = window.setInterval(() => setTick((t) => t + 1), SLIDE_STEP_MS);
    return () => window.clearInterval(id);
  }, [touch]);
  const frame = touch ? null : slideFrame(tick);
  if (frame && frame.variant !== 'cursor') {
    // Teclas: la que suena, con su círculo; las graves mantenidas (legato), con un círculo tenue.
    return (
      <g data-variant={frame.variant}>
        {frame.held.filter((key) => key !== frame.sounding).map((key) => (
          <circle className="riff-anim-held-low" cx={CELL_X[key]} cy="40" key={key} r="8" />
        ))}
        {frame.sounding !== null && <circle className="riff-anim-held" cx={CELL_X[frame.sounding]} cy="40" r="10" />}
        <KeyLetters lit={frame.held} />
      </g>
    );
  }
  return (
    <g data-variant={touch ? 'hand' : 'cursor'}>
      {!touch && <KeyLetters />}
      <g className="riff-anim-slide">
        <circle className="riff-anim-held" cx="0" cy="40" r="10" />
        <g transform="translate(0 40)"><PointerGlyph kind={touch ? 'hand' : 'cursor'} /></g>
      </g>
    </g>
  );
}

// Dibujo del cursor o de la mano con su punta (el punto que pulsa) en (0, 0).
function PointerGlyph({ kind }: { kind: Pointer }) {
  if (kind === 'cursor') {
    return (
      <path
        d="M0 0L0 22L5.5 17L9.5 26L13 24.5L9 15.8L16.5 15.8Z"
        fill="#ffffff"
        stroke="#111827"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    );
  }
  return (
    <g fill="#ffe0bd" stroke="#92400e" strokeLinejoin="round" strokeWidth="1.6" transform="translate(-4 -1)">
      {/* Mano que señala con el índice (la yema arriba, en la punta). */}
      <path d="M2 2a2 2 0 0 1 4 0v11h1V9a2 2 0 0 1 4 0v4h1v-3a2 2 0 0 1 4 0v4h1v-2a2 2 0 0 1 4 0v8c0 5-3.5 8-8.5 8H11c-3 0-5-1.4-6.5-3.3L0 19.5a2 2 0 0 1 3-2.6L2 16z" />
    </g>
  );
}

function TutorialCardStyles() {
  return (
    <style>{`
      .riff-tutorial-card {
        background: #ffffff;
        border: 2px solid #047857;
        border-radius: 16px;
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.28);
        box-sizing: border-box;
        color: #1f2937;
        max-width: min(420px, calc(100vw - 32px));
        padding: 12px 16px;
        text-align: center;
      }

      .riff-tutorial-part {
        color: #047857;
        font-size: 12px;
        font-weight: 900;
        margin: 0 0 4px;
        text-transform: uppercase;
      }

      .riff-tutorial-title {
        font-size: 20px;
        font-weight: 900;
        margin: 0 0 6px;
      }

      .riff-tutorial-line {
        font-size: 15px;
        font-weight: 700;
        line-height: 1.35;
        margin: 4px 0;
      }

      .riff-tutorial-anim {
        display: block;
        height: auto;
        margin: 4px auto 8px;
        max-width: 100%;
        overflow: visible;
        width: 240px;
      }

      .riff-tutorial-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: center;
        margin-top: 10px;
      }

      .riff-tutorial-btn {
        background: #ffffff;
        border: 1.5px solid #9ca3af;
        border-radius: 999px;
        color: #374151;
        cursor: pointer;
        font-size: 14px;
        font-weight: 900;
        min-height: 40px;
        padding: 6px 18px;
      }

      .riff-tutorial-main:disabled {
        opacity: 0.5;
      }

      .riff-tutorial-main {
        background: #047857;
        border-color: #047857;
        color: #ffffff;
      }

      .riff-anim-held {
        fill: rgba(4, 120, 87, 0.35);
        stroke: #047857;
        stroke-width: 2;
      }

      .riff-anim-held-low {
        fill: rgba(4, 120, 87, 0.15);
        stroke: #047857;
        stroke-dasharray: 3 2;
        stroke-width: 1.5;
      }

      .riff-anim-ripple {
        animation: riff-anim-ripple 0.7s ease-out infinite;
        fill: none;
        stroke: #047857;
        stroke-width: 2.5;
        transform-box: fill-box;
        transform-origin: center;
      }

      .riff-anim-tap {
        animation: riff-anim-tap 0.7s ease-in-out infinite;
      }

      /* Ida y vuelta (alternate): cada pasada va al lado contrario arrastrando, sin saltar atrás. */
      .riff-anim-slide {
        animation: riff-anim-slide 2.4s ease-in-out infinite alternate;
      }

      .riff-anim-key {
        fill: #ffffff;
        stroke: #9ca3af;
        stroke-width: 1.2;
      }

      .riff-anim-key-lit {
        fill: #fbbf24;
        stroke: #b45309;
      }

      .riff-anim-key-blink {
        animation: riff-anim-key-blink 0.7s ease-in-out infinite;
        stroke: #b45309;
      }

      .riff-anim-key-letter {
        fill: #1f2937;
        font-size: 9.5px;
        font-weight: 900;
        pointer-events: none;
      }

      /* La tecla se ilumina justo cuando "pulsa" (a la vez que la onda de riff-anim-ripple). */
      @keyframes riff-anim-key-blink {
        0%, 40%, 100% { fill: #ffffff; }
        45%, 65% { fill: #fbbf24; }
      }

      @keyframes riff-anim-tap {
        0%, 100% { transform: translate(5px, -9px); }
        45%, 60% { transform: translate(0, 0); }
      }

      @keyframes riff-anim-ripple {
        0%, 40% { opacity: 0; transform: scale(0.6); }
        50% { opacity: 1; transform: scale(0.8); }
        100% { opacity: 0; transform: scale(1.8); }
      }

      /* De la casilla izquierda a la derecha, con una pausa en cada punta. */
      @keyframes riff-anim-slide {
        0%, 15% { transform: translateX(66px); }
        85%, 100% { transform: translateX(186px); }
      }

      @media (prefers-reduced-motion: reduce) {
        .riff-anim-tap,
        .riff-anim-ripple,
        .riff-anim-key-blink {
          animation: none;
        }
        .riff-anim-slide {
          animation-duration: 6s;
        }
      }
    `}</style>
  );
}
