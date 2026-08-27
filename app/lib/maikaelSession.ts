'use client';

import { useState } from 'react';
import { MAIKAEL_SESSION_LIMIT } from './maikaelLimits';

const SESSION_STORAGE_KEY = 'maikael_session_count';

function readSessionCount(): number {
  if (typeof window === 'undefined') return 0;
  const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  const parsed = raw ? Number(raw) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Contador de mensajes de la sesión (sessionStorage, tope 50) — se resetea
 * al cerrar la pestaña, NO al recargar la página (comportamiento nativo de
 * sessionStorage). Cuenta solo los mensajes que envía el alumno.
 */
export function useMaikaelSessionCount() {
  const [count, setCount] = useState<number>(readSessionCount);

  function increment(): number {
    const next = readSessionCount() + 1;
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, String(next));
    setCount(next);
    return next;
  }

  return { count, limit: MAIKAEL_SESSION_LIMIT, increment };
}
