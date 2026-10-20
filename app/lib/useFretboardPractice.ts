'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

// Modo "Practicar ejercicio" de los mástiles MIDI: ilumina la siguiente nota del ejercicio y avanza
// cuando suena. Un fallo muestra "OTRA VEZ" (3 s) y reinicia; terminar muestra "ENHORABUENA" (2 s).
// El mástil solo tiene que llamar a `registerNote` justo donde ya decide que una nota SUENA
// (playNote/switchNote) -- ver ReducedFretboardDiagram.tsx para el patrón de referencia.

export type PracticeNote = { string: number; fret: number };
export type PracticeExercise = { label: string; notes: PracticeNote[] };
export type PracticeNoteEvent = PracticeNote & {
  kind: 'pluck' | 'hammer' | 'pulloff' | 'slide';
  // Solo para 'slide': la posición desde la que se arrastró.
  from?: PracticeNote;
};
export type PracticeFeedbackKind = 'success' | 'fail' | null;

const SUCCESS_MS = 2000;
const FAIL_MS = 3000;

// Un slide solo cuenta si llega a una nota "pegada": misma cuerda ±1 traste, o cuerda vecina en el
// mismo traste. Diagonales, saltos de más de 1 traste o de más de 1 cuerda se ignoran.
export function isAdjacentSlide(from: PracticeNote, to: PracticeNote): boolean {
  const dString = Math.abs(from.string - to.string);
  const dFret = Math.abs(from.fret - to.fret);
  return (dString === 0 && dFret === 1) || (dString === 1 && dFret === 0);
}

export function useFretboardPractice(exercises: PracticeExercise[] = []) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [step, setStep] = useState(0);
  const [feedback, setFeedback] = useState<PracticeFeedbackKind>(null);

  // Refs para que `registerNote` sea estable y se pueda llamar desde el useEffect del teclado
  // sin leer valores viejos (mismo motivo que volumeRef/paintModeRef en los mástiles).
  const exercisesRef = useRef(exercises);
  useEffect(() => { exercisesRef.current = exercises; }, [exercises]);
  const activeRef = useRef<number | null>(null);
  const stepRef = useRef(0);
  const lockedRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const setStepBoth = useCallback((value: number) => {
    stepRef.current = value;
    setStep(value);
  }, []);

  const setActiveBoth = useCallback((value: number | null) => {
    activeRef.current = value;
    setActiveIndex(value);
  }, []);

  const toggle = useCallback((index: number) => {
    clearTimer();
    lockedRef.current = false;
    setFeedback(null);
    setStepBoth(0);
    setActiveBoth(activeRef.current === index ? null : index);
  }, [clearTimer, setActiveBoth, setStepBoth]);

  const registerNote = useCallback((ev: PracticeNoteEvent) => {
    const active = activeRef.current;
    if (active === null || lockedRef.current) return;
    if (ev.kind === 'slide' && (!ev.from || !isAdjacentSlide(ev.from, ev))) return;
    const notes = exercisesRef.current[active]?.notes;
    if (!notes || notes.length === 0) return;
    const target = notes[stepRef.current];
    if (target && target.string === ev.string && target.fret === ev.fret) {
      const nextStep = stepRef.current + 1;
      if (nextStep >= notes.length) {
        setStepBoth(0);
        setActiveBoth(null);
        setFeedback('success');
        clearTimer();
        timerRef.current = window.setTimeout(() => { setFeedback(null); timerRef.current = null; }, SUCCESS_MS);
      } else {
        setStepBoth(nextStep);
      }
      return;
    }
    // Fallo: bloquear la entrada mientras se ve "OTRA VEZ" y volver a la primera nota después.
    lockedRef.current = true;
    setStepBoth(0);
    setFeedback('fail');
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      lockedRef.current = false;
      setFeedback(null);
      timerRef.current = null;
    }, FAIL_MS);
  }, [clearTimer, setActiveBoth, setStepBoth]);

  const target = activeIndex !== null && feedback !== 'fail'
    ? exercises[activeIndex]?.notes[step] ?? null
    : null;

  return { activeIndex, target, feedback, toggle, registerNote };
}
