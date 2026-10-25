'use client';
import { type ReactNode, useEffect, useRef } from 'react';

// Protección contra toques accidentales (petición del usuario): mientras `active` (una partida del
// juego en curso), los botones y deslizadores de dentro solo responden si se MANTIENEN pulsados
// HOLD_MS. Un toque corto no hace nada; mientras se mantiene, una barrita de progreso crece bajo el
// botón; al completarse, el botón se activa (un `click()` normal, así que no hay que tocar sus
// manejadores). Un deslizador (input range) queda desbloqueado al completarse y sigue al mismo dedo
// mientras no se suelte. Con teclado: mantener Enter o Espacio. Fuera de `active`, todo responde al
// instante, como siempre. Las notas del instrumento no pasan por aquí: ninguna latencia añadida.
//
// Es un envoltorio `display: contents`, así que no altera la fila de botones donde se pone.

// 1 s (decisión del usuario; antes eran 2).
export const HOLD_MS = 1000;

interface Props {
  active: boolean;
  children: ReactNode;
}

type Arming = {
  el: HTMLElement;
  range: HTMLInputElement | null;
  pointerId: number | null;
  timer: number;
  unlocked: boolean;
};

const ARMING_CLASS = 'hold-arming';

function setRangeFromX(range: HTMLInputElement, clientX: number) {
  const rect = range.getBoundingClientRect();
  const min = Number(range.min || 0);
  const max = Number(range.max || 100);
  const step = Number(range.step || 1);
  const k = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)));
  const value = Math.round((min + k * (max - min)) / step) * step;
  // Valor "nativo" + evento input: así React ejecuta el onChange del propio deslizador.
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(range, String(Math.min(max, Math.max(min, value))));
  range.dispatchEvent(new Event('input', { bubbles: true }));
}

export default function HoldGuard({ active, children }: Props) {
  const armingRef = useRef<Arming | null>(null);
  // Durante el click() que dispara la propia protección, el click sí debe pasar.
  const allowClickRef = useRef(false);
  // ...y el click "real" que el navegador manda al soltar tras activarlo, no: si no, un botón que
  // al activarse apaga la protección (PAUSA) recibiría un segundo click ya sin protección.
  const swallowClickRef = useRef(false);

  function cancel() {
    const arming = armingRef.current;
    if (!arming) return;
    window.clearTimeout(arming.timer);
    arming.el.classList.remove(ARMING_CLASS);
    armingRef.current = null;
  }

  useEffect(() => {
    if (!active) cancel();
    return cancel;
  }, [active]);

  function start(el: HTMLElement, range: HTMLInputElement | null, pointerId: number | null) {
    cancel();
    el.classList.add(ARMING_CLASS);
    el.style.setProperty('--hold-ms', `${HOLD_MS}ms`);
    const arming: Arming = { el, range, pointerId, unlocked: false, timer: 0 };
    arming.timer = window.setTimeout(() => {
      el.classList.remove(ARMING_CLASS);
      if (range) {
        arming.unlocked = true;
        return;
      }
      armingRef.current = null;
      allowClickRef.current = true;
      el.click();
      allowClickRef.current = false;
      if (pointerId !== null) swallowClickRef.current = true;
    }, HOLD_MS);
    armingRef.current = arming;
  }

  // El control (botón o deslizador) sobre el que cae un evento, si es de los protegidos.
  function controlOf(target: EventTarget | null): { el: HTMLElement; range: HTMLInputElement | null } | null {
    if (!(target instanceof Element)) return null;
    const button = target.closest('button');
    if (button && !button.disabled) return { el: button, range: null };
    // Los deslizadores protegidos no reciben el puntero (CSS): llega a su <label>.
    const label = target.closest('label');
    const range = (target instanceof HTMLInputElement && target.type === 'range' ? target : label?.querySelector<HTMLInputElement>('input[type="range"]')) ?? null;
    if (range && !range.disabled) return { el: label ?? range, range };
    return null;
  }

  return (
    <div
      className={active ? 'hold-guard is-active' : 'hold-guard'}
      // En línea (no solo en HoldGuardStyles, que únicamente se monta con el juego): sin esto, en
      // los mástiles sin juego el envoltorio sería un bloque y la píldora se partiría en 3 líneas.
      style={{ display: 'contents' }}
      onClickCapture={(e) => {
        if (allowClickRef.current) return;
        if (swallowClickRef.current) {
          swallowClickRef.current = false;
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        if (!active) return;
        if (controlOf(e.target)?.range === null) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onKeyDownCapture={(e) => {
        if (!active || (e.key !== 'Enter' && e.key !== ' ')) return;
        const control = controlOf(e.target);
        if (!control || control.range) return;
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat && armingRef.current?.el !== control.el) start(control.el, null, null);
      }}
      onKeyUpCapture={(e) => {
        if (!active || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        cancel();
      }}
      onPointerCancelCapture={() => { if (active) cancel(); }}
      onPointerDownCapture={(e) => {
        swallowClickRef.current = false;
        if (!active) return;
        const control = controlOf(e.target);
        if (!control) return;
        e.preventDefault();
        (e.target as Element).setPointerCapture?.(e.pointerId);
        start(control.el, control.range, e.pointerId);
      }}
      onPointerMoveCapture={(e) => {
        const arming = armingRef.current;
        if (!active || !arming?.unlocked || !arming.range || arming.pointerId !== e.pointerId) return;
        setRangeFromX(arming.range, e.clientX);
      }}
      onPointerUpCapture={(e) => {
        if (!active) return;
        const arming = armingRef.current;
        if (arming?.unlocked && arming.range && arming.pointerId === e.pointerId) setRangeFromX(arming.range, e.clientX);
        cancel();
      }}
    >
      {children}
    </div>
  );
}

export function HoldGuardStyles() {
  return (
    <style>{`
      .hold-guard {
        display: contents;
      }

      /* En partida: sin menú contextual ni selección al mantener el dedo, y los deslizadores no
         reciben el puntero directamente (lo gestiona HoldGuard desde su <label>). */
      .hold-guard.is-active button,
      .hold-guard.is-active label {
        -webkit-touch-callout: none;
        touch-action: none;
        user-select: none;
      }

      .hold-guard.is-active input[type='range'] {
        pointer-events: none;
      }

      /* Barrita de progreso bajo el control mientras se mantiene pulsado. */
      .hold-arming {
        position: relative;
      }

      .hold-arming::after {
        animation: hold-progress var(--hold-ms, 2s) linear forwards;
        background: #047857;
        border-radius: 2px;
        bottom: -5px;
        content: '';
        height: 3px;
        left: 0;
        position: absolute;
        width: 0;
      }

      @keyframes hold-progress {
        to {
          width: 100%;
        }
      }
    `}</style>
  );
}
