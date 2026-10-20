'use client';

import type { PracticeExercise, PracticeFeedbackKind, PracticeNote } from '@/app/lib/useFretboardPractice';

// Piezas visuales del modo "Practicar ejercicio" (ver useFretboardPractice.ts).

export function PracticeButtons({
  activeIndex,
  exercises,
  onToggle,
}: {
  activeIndex: number | null;
  exercises: PracticeExercise[];
  onToggle: (index: number) => void;
}) {
  if (exercises.length === 0) return null;
  return (
    <div className="practice-buttons">
      {exercises.map((exercise, index) => {
        const active = activeIndex === index;
        return (
          <button
            aria-pressed={active}
            className={`practice-button${active ? ' is-active' : ''}`}
            key={exercise.label}
            onClick={() => onToggle(index)}
            type="button"
          >
            {exercise.label}
          </button>
        );
      })}
    </div>
  );
}

// Aro verde que late (solo opacidad: escalarlo recortaba el traste 0, que va pegado al borde
// del viewBox) sobre la nota que toca ahora. Va dentro del <svg> del mástil, antes del
// interactionOverlay(), y usa las mismas getX/getY del mástil (así respeta el modo zurdo).
export function PracticeTargetMarker({
  getX,
  getY,
  radius = 16,
  target,
}: {
  getX: (fret: number) => number;
  getY: (string: number) => number;
  radius?: number;
  target: PracticeNote | null;
}) {
  if (!target) return null;
  const cx = getX(target.fret);
  const cy = getY(target.string);
  return (
    <g
      className="practice-target"
      data-fret={target.fret}
      data-string={target.string}
      data-testid="practice-target"
      pointerEvents="none"
    >
      <circle className="practice-target-glow" cx={cx} cy={cy} r={radius + 2} />
      <circle className="practice-target-dot" cx={cx} cy={cy} r={radius} />
    </g>
  );
}

// Mensaje grande DELANTE del mástil (petición del usuario: no en el centro de la pantalla, que
// podía quedar debajo). Se renderiza dentro de `.midi-instrument-host` (position: relative) con
// `position: absolute` centrado y z-index por encima de los flotantes de MidiInstrumentChrome;
// `pointer-events: none`: no mueve la página ni bloquea el mástil.
export function PracticeFeedback({ feedback }: { feedback: PracticeFeedbackKind }) {
  if (!feedback) return null;
  return (
    <div
      aria-live="assertive"
      className={`practice-feedback ${feedback === 'success' ? 'is-success' : 'is-fail'}`}
      data-testid="practice-feedback"
      role="status"
    >
      {feedback === 'success' ? '¡ENHORABUENA!' : 'OTRA VEZ'}
    </div>
  );
}

// Estilos propios (no en globals.css) para que cualquier mástil que use el modo práctica los
// tenga sin depender de nada más: renderizar <FretboardPracticeStyles /> una vez junto al mástil.
export function FretboardPracticeStyles() {
  return (
    <style>{`
      .practice-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 10px 14px;
        justify-content: center;
        margin: 0 0 14px;
        max-width: 100%;
        min-width: 0;
      }

      .practice-button {
        background: #ffffff;
        border: 2px solid #047857;
        border-radius: 999px;
        color: #047857;
        cursor: pointer;
        font-size: 14px;
        font-weight: 900;
        letter-spacing: 0.08em;
        max-width: 100%;
        min-height: 44px;
        padding: 8px 18px;
        text-transform: uppercase;
      }

      .practice-button.is-active {
        background: #047857;
        color: #ffffff;
      }

      .practice-target-glow {
        animation: practice-pulse 900ms ease-in-out infinite;
        fill: none;
        stroke: #34d399;
        stroke-width: 4;
      }

      .practice-target-dot {
        fill: #34d399;
        opacity: 0.85;
      }

      @keyframes practice-pulse {
        0%, 100% { opacity: 1; }
        50%      { opacity: 0.25; }
      }

      .practice-feedback {
        animation: practice-pop 260ms ease-out;
        /* cqw = ancho del mástil (el ancla tiene container-type): así cabe en mástiles estrechos. */
        font-size: clamp(22px, 9.5cqw, 96px);
        font-weight: 950;
        left: 50%;
        letter-spacing: 0.02em;
        line-height: 1;
        max-width: 100%;
        white-space: nowrap;
        width: max-content;
        pointer-events: none;
        position: absolute;
        text-align: center;
        text-shadow: 0 4px 0 #ffffff, 0 0 24px #ffffff;
        top: 50%;
        transform: translate(-50%, -50%);
        z-index: 30;
      }

      .practice-feedback.is-success { color: #16a34a; }
      .practice-feedback.is-fail { color: #dc2626; }

      @keyframes practice-pop {
        0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.6); }
        100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      }
    `}</style>
  );
}
