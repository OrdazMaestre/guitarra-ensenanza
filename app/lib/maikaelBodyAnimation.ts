import { useEffect, useState } from 'react';

export type MaikaelBodyState = 'idle' | 'guitar';

const IDLE_DURATION_MS = 60_000;
const GUITAR_DURATION_MS = 60_000;

// Fases de la animación mientras bodyState === 'guitar'. Puro cálculo a partir de
// un timestamp — el componente visual (pendiente de los assets) las usa para
// mover cada pieza; no dependen de imágenes ni de React.
export interface GuitarPose {
  /** -1..1: posición de rasgueo de la mano derecha (arriba/abajo sobre la caja). */
  strumOffset: number;
  /** índice 0..5 de traste simulado donde "agarra" la mano izquierda. */
  leftHandFret: number;
  /** -1..1: golpeteo del pie derecho. */
  footTapOffset: number;
  /** -1..1: balanceo de cabeza, a mitad de frecuencia que el pie. */
  headBobOffset: number;
}

const STRUM_PERIOD_MS = 500; // un rasgueo abajo-arriba cada medio segundo
const FOOT_TAP_PERIOD_MS = 500; // el pie marca el mismo pulso que el rasgueo
const HEAD_BOB_PERIOD_MS = FOOT_TAP_PERIOD_MS * 2; // cabeza a la mitad de velocidad que el pie
const CHORD_CHANGE_PERIOD_MS = 1200; // cada cuánto "cambia de acorde" la mano izquierda
const LEFT_HAND_FRET_COUNT = 6;

function oscillate(elapsedMs: number, periodMs: number): number {
  return Math.sin((elapsedMs / periodMs) * Math.PI * 2);
}

/** Posición aleatoria pero estable durante todo un ciclo de "cambio de acorde". */
function leftHandFretAt(elapsedMs: number): number {
  const chordIndex = Math.floor(elapsedMs / CHORD_CHANGE_PERIOD_MS);
  // PRNG determinista a partir del índice, para que no "salte" en cada render.
  const pseudoRandom = Math.abs(Math.sin(chordIndex * 12.9898) * 43758.5453) % 1;
  return Math.floor(pseudoRandom * LEFT_HAND_FRET_COUNT);
}

export { leftHandFretAt, LEFT_HAND_FRET_COUNT };

export function guitarPoseAt(elapsedMs: number): GuitarPose {
  return {
    strumOffset: oscillate(elapsedMs, STRUM_PERIOD_MS),
    leftHandFret: leftHandFretAt(elapsedMs),
    footTapOffset: oscillate(elapsedMs, FOOT_TAP_PERIOD_MS),
    headBobOffset: oscillate(elapsedMs, HEAD_BOB_PERIOD_MS),
  };
}

const CYCLE_MS = IDLE_DURATION_MS + GUITAR_DURATION_MS;

/**
 * Ciclo idle/guitar de 60s+60s mientras el widget está abierto (`active`).
 * Al cerrar el widget el ciclo se detiene y vuelve a 'idle' (valor derivado,
 * sin tocar el estado interno).
 */
export function useMaikaelGuitarLoop(active: boolean): MaikaelBodyState {
  const [bodyState, setBodyState] = useState<MaikaelBodyState>('idle');

  useEffect(() => {
    if (!active) return;
    const activatedAt = Date.now();
    const interval = setInterval(() => {
      const elapsed = (Date.now() - activatedAt) % CYCLE_MS;
      setBodyState(elapsed < IDLE_DURATION_MS ? 'idle' : 'guitar');
    }, 1000);
    return () => clearInterval(interval);
  }, [active]);

  return active ? bodyState : 'idle';
}

/**
 * Traste 0..5 "agarrado" por la mano izquierda, actualizado cada ~200ms
 * mientras `active` (bodyState === 'guitar'). El resto de la pose (rasgueo,
 * golpeteo, balanceo) es puramente sinusoidal y se anima con CSS puro
 * (ver .maikael-strum/.maikael-foot-tap/.maikael-head-bob en globals.css),
 * así que no hace falta re-renderizar React para eso.
 */
export function useMaikaelLeftHandFret(active: boolean): number {
  const [fret, setFret] = useState(() => leftHandFretAt(0));

  useEffect(() => {
    if (!active) return;
    const startedAt = Date.now();
    const interval = setInterval(() => {
      setFret(leftHandFretAt(Date.now() - startedAt));
    }, 200);
    return () => clearInterval(interval);
  }, [active]);

  return active ? fret : 0;
}
