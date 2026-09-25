'use client';

import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { DEGREES_PER_STEP } from '@/app/lib/tuningGame/pitch';

interface TuningPegProps {
  x: number;
  y: number;
  radius?: number;
  /** Cents acumulados (entero) respecto a la afinación estándar -- ver DEGREES_PER_STEP en pitch.ts. */
  stepValue: number;
  onStepChange: (nextStepValue: number) => void;
  ariaLabel: string;
}

// "Un octavo de tono" por flecha -- paso más grueso que el arrastre (pensado para nudges rápidos
// con teclado), coincide con el propio ejemplo del usuario ("octavo de tono cada 45 grados").
const KEYBOARD_STEP_CENTS = 25;

function angleAt(clientX: number, clientY: number, centerX: number, centerY: number): number {
  return Math.atan2(clientY - centerY, clientX - centerX) * (180 / Math.PI);
}

// Clavija de afinación: arrastre CIRCULAR alrededor de su propio centro, a diferencia del arrastre
// vertical de Knob.tsx (mesa de mezclas) -- gira sin límite, como una clavija de verdad, en vez de
// estar acotada entre dos topes. En cada pointermove se mide el ángulo del puntero respecto al
// centro de la clavija (medido una sola vez, en pointerdown, vía getBoundingClientRect -- la
// clavija no se desplaza en pantalla, solo gira su indicador) y se acumula la DIFERENCIA respecto
// al ángulo anterior, normalizada a (-180, 180] para que cruzar la frontera -180/180 no produzca un
// salto brusco de casi 360deg.
//
// El acumulador (dragRef.current.exactDegrees) guarda el ángulo EXACTO sin cuantizar -- solo al
// convertirlo al valor que sale hacia fuera (onStepChange) se redondea al paso más cercano
// (Math.round(exactDegrees / DEGREES_PER_STEP)). Si se cuantizase el propio acumulador en vez del
// ángulo exacto, un arrastre lento y preciso podría perder movimientos más pequeños que un paso
// entero y la clavija se quedaría "pegada" pese a estar moviendo el dedo/ratón de verdad.
export default function TuningPeg({ x, y, radius = 15, stepValue, onStepChange, ariaLabel }: TuningPegProps) {
  const dragRef = useRef<{
    pointerId: number;
    centerX: number;
    centerY: number;
    lastAngle: number;
    exactDegrees: number;
  } | null>(null);

  function onPointerDown(e: PointerEvent<SVGGElement>) {
    // Evita que este gesto también dispare el manejador de "pulsar un traste para oír la nota" del
    // <svg> padre (TuningBoard.tsx) -- son áreas visualmente separadas pero un pointerdown sobre la
    // clavija SÍ hace bubbling hasta el <svg>.
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    dragRef.current = {
      pointerId: e.pointerId,
      centerX,
      centerY,
      lastAngle: angleAt(e.clientX, e.clientY, centerX, centerY),
      exactDegrees: stepValue * DEGREES_PER_STEP,
    };
  }

  function onPointerMove(e: PointerEvent<SVGGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.stopPropagation();
    const angle = angleAt(e.clientX, e.clientY, drag.centerX, drag.centerY);
    let delta = angle - drag.lastAngle;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    drag.lastAngle = angle;
    drag.exactDegrees += delta;
    onStepChange(Math.round(drag.exactDegrees / DEGREES_PER_STEP));
  }

  function endDrag(e: PointerEvent<SVGGElement>) {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    e.stopPropagation();
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // el navegador puede haber liberado ya la captura; se puede ignorar con seguridad
    }
  }

  function onKeyDown(e: KeyboardEvent<SVGGElement>) {
    // stopPropagation: TuningBoard.tsx tiene su propio listener GLOBAL de flechas (para el toggle
    // de rango grave/agudo del modo teclado) -- sin esto, una flecha pulsada con esta clavija
    // enfocada movería la clavija Y ADEMÁS cambiaría de rango a la vez.
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      onStepChange(stepValue + KEYBOARD_STEP_CENTS);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault();
      e.stopPropagation();
      onStepChange(stepValue - KEYBOARD_STEP_CENTS);
    } else if (e.key === 'Home') {
      e.preventDefault();
      e.stopPropagation();
      onStepChange(0);
    }
  }

  const visualAngle = (((stepValue * DEGREES_PER_STEP) % 360) + 360) % 360;

  return (
    <g
      className="tuning-peg"
      transform={`translate(${x}, ${y})`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      role="slider"
      aria-label={ariaLabel}
      aria-valuenow={stepValue}
      aria-valuetext={`${(stepValue / 100).toFixed(2)} semitonos`}
      tabIndex={0}
      style={{ touchAction: 'none' }}
    >
      <circle className="tuning-peg-hit-area" r={radius + 8} fill="transparent" />
      <circle className="tuning-peg-body" r={radius} />
      <line
        className="tuning-peg-indicator"
        x1={0}
        y1={0}
        x2={0}
        y2={-radius + 4}
        transform={`rotate(${visualAngle})`}
      />
    </g>
  );
}
