'use client';

import { useRef, type KeyboardEvent, type PointerEvent } from 'react';

interface KnobProps {
  ariaLabel: string;
  label: string;
  value: number;
  min: number;
  max: number;
  /** Valor al que vuelve con doble-click / tecla Home (normalmente 0). */
  defaultValue?: number;
  formatValue?: (value: number) => string;
  onChange: (value: number) => void;
  accentColor?: string;
  /**
   * Mapeo opcional valor<->ratio (0..1 a lo largo del giro de la perilla) para perillas con taper
   * no lineal, como el EQ (ver eqRatioToDb/eqDbToRatio en audioEngine.ts). Si se omiten, el mapeo
   * es lineal a partir de min/max (comportamiento de siempre, usado por pan y volumen).
   */
  valueToRatio?: (value: number) => number;
  ratioToValue?: (ratio: number) => number;
}

function clampRatio(ratio: number): number {
  return Math.min(1, Math.max(0, ratio));
}

// Perilla rotativa de arrastre vertical: arriba = sube, abajo = baja. Mismo patrón de
// pointer-capture que HorizontalScrollbar.tsx (setPointerCapture en pointerdown, seguir en
// pointermove solo para el mismo pointerId, liberar en pointerup/pointercancel) adaptado a un
// arrastre vertical en vez de horizontal.
export default function Knob({
  ariaLabel,
  label,
  value,
  min,
  max,
  defaultValue = 0,
  formatValue,
  onChange,
  accentColor = '#34d399',
  valueToRatio,
  ratioToValue,
}: KnobProps) {
  const dragRef = useRef<{ pointerId: number; startY: number; startRatio: number } | null>(null);

  // Píxeles de arrastre vertical para recorrer el rango completo (ratio 0 a 1). Un valor fijo es
  // más predecible al tacto que uno basado en el tamaño del propio knob.
  const DRAG_RANGE_PX = 140;

  function toRatio(v: number): number {
    return clampRatio(valueToRatio ? valueToRatio(v) : (v - min) / (max - min));
  }

  function toValue(ratio: number): number {
    const r = clampRatio(ratio);
    return ratioToValue ? ratioToValue(r) : min + r * (max - min);
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { pointerId: e.pointerId, startY: e.clientY, startRatio: toRatio(value) };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const deltaY = drag.startY - e.clientY;
    const nextRatio = drag.startRatio + deltaY / DRAG_RANGE_PX;
    onChange(toValue(nextRatio));
  }

  function endDrag(e: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // el navegador puede haber liberado ya la captura; se puede ignorar con seguridad
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // Paso en espacio de ratio (no de valor) para que cada pulsación gire la perilla lo mismo
    // visualmente sin importar el taper -- en un mapeo no lineal como el de EQ, un paso fijo en dB
    // avanzaría un ángulo distinto según el tramo.
    const step = 1 / 40;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      onChange(toValue(toRatio(value) + step));
      e.preventDefault();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      onChange(toValue(toRatio(value) - step));
      e.preventDefault();
    } else if (e.key === 'Home') {
      onChange(defaultValue);
      e.preventDefault();
    }
  }

  const ratio = toRatio(value);
  const angle = -135 + ratio * 270;
  const isAtDefault = Math.abs(value - defaultValue) < 0.001;

  return (
    <div style={{ alignItems: 'center', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(value * 100) / 100}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => onChange(defaultValue)}
        onKeyDown={onKeyDown}
        title={`${label}: arrastra verticalmente, doble-click para restablecer`}
        style={{
          background: 'radial-gradient(circle at 35% 30%, var(--mc-knob-from), var(--mc-knob-to) 70%)',
          border: `1.5px solid ${isAtDefault ? 'var(--mc-border-control)' : accentColor}`,
          borderRadius: '999px',
          cursor: 'ns-resize',
          height: 34,
          position: 'relative',
          touchAction: 'none',
          width: 34,
        }}
      >
        <div
          style={{
            background: accentColor,
            borderRadius: '2px',
            bottom: '50%',
            height: '13px',
            left: '50%',
            position: 'absolute',
            transform: `translateX(-50%) rotate(${angle}deg)`,
            transformOrigin: '50% 100%',
            width: '2px',
          }}
        />
      </div>
      <span style={{ color: 'var(--mc-text-secondary)', fontSize: 10, fontWeight: 700, letterSpacing: '0.02em' }}>{label}</span>
      <span style={{ color: 'var(--mc-text-primary)', fontSize: 10, minHeight: 12 }}>
        {formatValue ? formatValue(value) : value.toFixed(1)}
      </span>
    </div>
  );
}
