'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getAudioCurrentTime, type GuideNoteHandle, playDeadNote, playMetronomeClick, preloadSamples, scheduleGuideNote, touchAudioContext } from '@/app/lib/guitarAudioEngine';
import type { PracticeNoteEvent } from '@/app/lib/useFretboardPractice';
import type { Chart } from './chart';
import { GUIDE_GAIN, OPEN_GAIN, RiffSession, type RiffBacking, type RiffOptions, type RiffStatus } from './session';

// Envuelve RiffSession con el reloj real (AudioContext), el metrónomo y el estado de React.
// El dibujo (RiffHighway) lee `sessionRef` en cada frame; aquí solo cambia el estado cuando
// cambia el `status`, nunca por frame.

const TICK_MS = 25;
const CLICK_LOOKAHEAD_SECONDS = 0.15;
const DEAD_NOTE_VOLUME = 0.6;

export type RiffGameStatus = 'idle' | RiffStatus;

export function useRiffGame(chart: Chart | null) {
  const sessionRef = useRef<RiffSession | null>(null);
  const [status, setStatus] = useState<RiffGameStatus>('idle');
  // Solo para tests/depuración (atributo data-hits); de momento no hay puntuación visible.
  const [hitCount, setHitCount] = useState(0);
  const timerRef = useRef<number | null>(null);
  // Notas de fondo ya programadas (id de nota real -> control de volumen + cuándo acaba), para
  // poder "abrirlas" cuando se acierta su nota traducida (niveles Principiante..Difícil).
  const guideHandlesRef = useRef(new Map<number, { handle: GuideNoteHandle; end: number }>());

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    clearTimer();
    sessionRef.current = null;
    setStatus('idle');
    setHitCount(0);
  }, [clearTimer]);

  const start = useCallback((options: RiffOptions, backing: RiffBacking) => {
    if (!chart) return;
    clearTimer();
    touchAudioContext();
    void preloadSamples();
    const session = new RiffSession(chart, options, getAudioCurrentTime(), backing);
    sessionRef.current = session;
    const handles = guideHandlesRef.current;
    handles.clear();
    setStatus(session.status);
    timerRef.current = window.setInterval(() => {
      const now = getAudioCurrentTime();
      session.advance(now);
      for (const click of session.takeClicks(now, CLICK_LOOKAHEAD_SECONDS)) {
        playMetronomeClick(click.at, click.volume, click.sound);
      }
      for (const note of session.takeGuideNotes(now, CLICK_LOOKAHEAD_SECONDS)) {
        void scheduleGuideNote(note.midi, note.at, note.duration, note.open ? OPEN_GAIN : GUIDE_GAIN).then((handle) => {
          if (handle && sessionRef.current === session) handles.set(note.id, { handle, end: note.at + note.duration });
        });
      }
      for (const [id, entry] of handles) {
        if (entry.end < now - 1) handles.delete(id);
      }
      setStatus(session.status);
      setHitCount(session.hitAt.size);
      if (session.status === 'finished') clearTimer();
    }, TICK_MS);
  }, [chart, clearTimer]);

  // PAUSA: congela la canción y calla las notas de fondo ya programadas.
  const pause = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    session.pause(getAudioCurrentTime());
    for (const { handle } of guideHandlesRef.current.values()) handle.setVolume(0);
    guideHandlesRef.current.clear();
    setStatus(session.status);
  }, []);

  // CONTINUAR: un compás atrás, con cuenta de entrada (ver RiffSession.resume).
  const resume = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    session.resume(getAudioCurrentTime());
    setStatus(session.status);
    setHitCount(session.hitAt.size);
  }, []);

  // Cambiar de pista o de canción detiene la partida en curso.
  useEffect(() => stop, [chart, stop]);

  // Para el mástil: volumen relativo de su propia nota (solo mientras hay partida). En niveles
  // traducidos es 0 y lo que suena es la canción real: un acierto "abre" sus notas (las ya
  // programadas suben de volumen; las siguientes saldrán ya abiertas), un fallo suena a "clac".
  const onNoteEvent = useCallback((event: PracticeNoteEvent) => {
    const session = sessionRef.current;
    if (!session || session.status === 'finished') return undefined;
    const now = getAudioCurrentTime();
    const result = session.judge(event, now);
    if (result.deadNote) playDeadNote(DEAD_NOTE_VOLUME);
    if (result.hit && session.translated) {
      for (const id of session.openedBy(result.hit.id)) guideHandlesRef.current.get(id)?.handle.setVolume(OPEN_GAIN);
    }
    for (const note of result.playNow) void scheduleGuideNote(note.midi, now, note.duration, OPEN_GAIN);
    return result.gain;
  }, []);

  return { sessionRef, status, hitCount, start, stop, pause, resume, onNoteEvent };
}
