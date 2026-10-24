'use client';
import { useEffect, useState } from 'react';
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
          <p className="riff-tutorial-part">Partida de prueba · Parte {sectionIndex + 1} de {RIFF_TUTORIAL.length}</p>
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

// --- Animaciones (petición del usuario).
// Cada "dedo" es un cursor de ratón o una mano (pantalla táctil). Tapping: dos, a izquierda y
// derecha; cambian de aspecto al azar, pero NUNCA hay dos cursores a la vez (con un ratón solo se
// puede pulsar un sitio): cursor+mano, mano+cursor o mano+mano. El de la izquierda (la nota
// grave) MANTIENE el clic; el de la derecha pulsa una y otra vez. Slide: uno solo, que alterna cursor/mano en cada pasada
// y va de izquierda a derecha manteniendo el clic.

type Pointer = 'cursor' | 'hand';
const TAPPING_FORMS: Array<[Pointer, Pointer]> = [['cursor', 'hand'], ['hand', 'cursor'], ['hand', 'hand']];

function TutorialAnimationView({ kind }: { kind: TutorialAnimation }) {
  return (
    <svg aria-hidden="true" className="riff-tutorial-anim" data-animation={kind} viewBox="0 0 240 84">
      {/* Un trozo de mástil: madera, trastes y una cuerda. */}
      <rect fill="#f5e6c8" height="44" rx="6" stroke="#d6b98a" width="228" x="6" y="18" />
      {[46, 86, 126, 166, 206].map((x) => <path d={`M${x} 18V62`} key={x} stroke="#9ca3af" strokeWidth="2.5" />)}
      <path d="M6 40H234" stroke="#6b7280" strokeWidth="2.5" />
      {kind === 'tapping' ? <TappingPointers /> : <SlidePointer />}
    </svg>
  );
}

function TappingPointers() {
  const [form, setForm] = useState(0);
  useEffect(() => {
    // Al azar, pero siempre distinto del anterior para que se note el cambio.
    const id = window.setInterval(() => {
      setForm((current) => (current + 1 + Math.floor(Math.random() * (TAPPING_FORMS.length - 1))) % TAPPING_FORMS.length);
    }, 1400);
    return () => window.clearInterval(id);
  }, []);
  const [left, right] = TAPPING_FORMS[form];
  return (
    <>
      {/* Izquierda: la nota grave, pulsación mantenida (círculo fijo), como en el mástil. */}
      <circle className="riff-anim-held" cx="66" cy="40" r="10" />
      <g transform="translate(66 40)"><PointerGlyph kind={left} /></g>
      {/* Derecha: pulsa una y otra vez (onda en cada toque). */}
      <circle className="riff-anim-ripple" cx="186" cy="40" r="10" />
      <g transform="translate(186 40)">
        <g className="riff-anim-tap"><PointerGlyph kind={right} /></g>
      </g>
    </>
  );
}

function SlidePointer() {
  const [form, setForm] = useState<Pointer>('cursor');
  return (
    <g className="riff-anim-slide" onAnimationIteration={() => setForm((f) => (f === 'cursor' ? 'hand' : 'cursor'))}>
      <circle className="riff-anim-held" cx="0" cy="40" r="10" />
      <g transform="translate(0 40)"><PointerGlyph kind={form} /></g>
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

      .riff-anim-slide {
        animation: riff-anim-slide 2.4s ease-in-out infinite;
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
        75%, 100% { transform: translateX(186px); }
      }

      @media (prefers-reduced-motion: reduce) {
        .riff-anim-tap,
        .riff-anim-ripple {
          animation: none;
        }
        .riff-anim-slide {
          animation-duration: 6s;
        }
      }
    `}</style>
  );
}
