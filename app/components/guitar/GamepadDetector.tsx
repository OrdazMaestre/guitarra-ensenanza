'use client';
import { useEffect, useState } from 'react';

// Detector de mandos (fase de investigación, usuario 2026-11-13): para cuando haya una guitarra de PC tipo
// Guitar Hero / Rock Band. Enseña en vivo qué botones y ejes mueve cada mando que ve el navegador (Gamepad
// API) y el mapeo PROPUESTO para los niveles de trastes 0-5: púa sola = traste 0, púa + botón de color 1-5 =
// trastes 1-5. NO cambia el juego todavía.
//
// Lo que dice la especificación (w3c.github.io/gamepad): con `mapping === 'standard'` los botones tienen
// número fijo (0-3 botones de la derecha, 4-7 gatillos, 12-15 cruceta...); con `mapping === ''` el navegador
// no reconoce el mando y el orden es el suyo: hay que mirarlo aquí con cada modelo. Por privacidad, ningún
// mando aparece hasta que se pulsa uno de sus botones con la página delante.

interface PadView {
  index: number;
  id: string;
  mapping: string;
  pressed: number[];
  axes: number[];
}

// Propuesta para un mando con mapeo estándar (guitarras de Xbox 360 vistas como XInput): verde = 0 (A),
// rojo = 1 (B), amarillo = 3 (Y), azul = 2 (X), naranja = 4 (LB); púa = cruceta arriba/abajo (12/13).
const STANDARD_GUESS = [
  { label: 'Traste 1 (verde)', button: 0 },
  { label: 'Traste 2 (rojo)', button: 1 },
  { label: 'Traste 3 (amarillo)', button: 3 },
  { label: 'Traste 4 (azul)', button: 2 },
  { label: 'Traste 5 (naranja)', button: 4 },
  { label: 'Púa (arriba / abajo)', button: 12, alt: 13 },
];

function readPads(): PadView[] {
  const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
  return Array.from(pads)
    .filter((pad): pad is Gamepad => !!pad)
    .map((pad) => ({
      index: pad.index,
      id: pad.id,
      mapping: pad.mapping,
      pressed: pad.buttons.flatMap((button, k) => (button.pressed ? [k] : [])),
      axes: pad.axes.map((value) => Math.round(value * 100) / 100),
    }));
}

export default function GamepadDetector() {
  const [pads, setPads] = useState<PadView[]>([]);

  useEffect(() => {
    let raf = 0;
    let last = '';
    const tick = () => {
      const next = readPads();
      const key = JSON.stringify(next);
      if (key !== last) {
        last = key;
        setPads(next);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="gamepad-detector" data-testid="gamepad-detector">
      {pads.length === 0 ? (
        <p>Conecta un mando o una guitarra y pulsa cualquiera de sus botones.</p>
      ) : (
        pads.map((pad) => (
          <div className="gamepad-card" data-mapping={pad.mapping || 'desconocido'} key={pad.index}>
            <p className="gamepad-name">{pad.id}</p>
            <p>Mapeo: {pad.mapping === 'standard' ? 'estándar (botones con número fijo)' : 'desconocido (el orden lo decide el navegador)'}</p>
            <p>Botones pulsados: {pad.pressed.length > 0 ? pad.pressed.join(', ') : 'ninguno'}</p>
            <p>Ejes: {pad.axes.map((value, k) => `${k}: ${value.toFixed(2)}`).join(' · ')}</p>
            {pad.mapping === 'standard' && (
              <ul>
                {STANDARD_GUESS.map((entry) => {
                  const on = pad.pressed.includes(entry.button) || (entry.alt !== undefined && pad.pressed.includes(entry.alt));
                  return <li data-on={on} key={entry.label}>{entry.label}: botón {entry.button}{entry.alt !== undefined ? `/${entry.alt}` : ''}{on ? ' ✔' : ''}</li>;
                })}
              </ul>
            )}
          </div>
        ))
      )}
      <style>{`
        .gamepad-detector {
          display: grid;
          font-size: 14px;
          gap: 8px;
        }
        .gamepad-detector p {
          margin: 0;
        }
        .gamepad-card {
          border: 1px solid #3f3f46;
          border-radius: 12px;
          display: grid;
          gap: 4px;
          min-width: 0;
          overflow-wrap: anywhere;
          padding: 10px 12px;
        }
        .gamepad-name {
          font-weight: 900;
        }
        .gamepad-card li[data-on='true'] {
          color: #34d399;
          font-weight: 900;
        }
      `}</style>
    </div>
  );
}
