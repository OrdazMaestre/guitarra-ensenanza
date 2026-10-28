'use client';
import { type MutableRefObject, useCallback, useRef, useState } from 'react';
import { getAudioCurrentTime, type GuideNoteHandle, playBassNote, playMetronomeClick, preloadSamples, scheduleGuideNote, touchAudioContext } from '@/app/lib/guitarAudioEngine';
import type { PracticeNoteEvent } from '@/app/lib/useFretboardPractice';
import type { Chart, ChartNote } from './chart';
import { GUIDE_GAIN, OPEN_GAIN, RiffSession, type RiffBacking, type RiffOptions, type RiffStatus } from './session';

// Envuelve RiffSession con el reloj real (AudioContext), el metrónomo y el estado de React.
// El dibujo (RiffHighway) lee `sessionRef` en cada frame; aquí solo cambia el estado cuando
// cambia el `status`, nunca por frame.

const TICK_MS = 25;
// Volumen de la banda (las otras pistas). La otra guitarra, bastante por debajo de las notas de fondo
// de la propia pista (GUIDE_GAIN) para que se distinga lo que toca el alumno: 0,195 = el 75 % del
// 0,26 de antes (petición del usuario, 2026-10-27: tocando James, el solo de Kirk se oía demasiado).
// El bajo, como el del reproductor de tablaturas (BASS_TRACK_VOLUME_MULTIPLIER = 0,5).
const BAND_GUITAR_GAIN = 0.195;
const BAND_BASS_GAIN = 0.5;
const CLICK_LOOKAHEAD_SECONDS = 0.15;

export type RiffGameStatus = 'idle' | RiffStatus;

// Posiciones que suenan AHORA en el mástil (las publica ReducedFretboardDiagram), para las notas
// repetidas con la pulsación mantenida (RiffSession.autoHold).
export type HeldPositionsRef = MutableRefObject<() => { string: number; fret: number }[]>;

export function useRiffGame(chart: Chart | null, heldRef?: HeldPositionsRef) {
  const sessionRef = useRef<RiffSession | null>(null);
  const [status, setStatus] = useState<RiffGameStatus>('idle');
  // Solo para tests/depuración (atributos data-hits / data-score): la puntuación se VE en la
  // autopista, que la lee de la sesión en cada frame.
  const [hitCount, setHitCount] = useState(0);
  const [score, setScore] = useState(0);
  // Vuelta del tramo en curso (con `repeats`, "2/6"); null sin partida.
  const [repetition, setRepetition] = useState<string | null>(null);
  // Parada automática en la que espera (RiffOptions.breaks), o null.
  const [atBreak, setAtBreak] = useState<number | null>(null);
  // Si la partida en curso puntúa ("Con ritmo"; "Paso a paso" no).
  const [scoring, setScoring] = useState(false);
  const timerRef = useRef<number | null>(null);
  // Notas de fondo ya programadas (id de nota real -> control de volumen + cuándo acaba), para
  // poder "abrirlas" cuando se acierta su nota traducida (todos los niveles menos Experto).
  const guideHandlesRef = useRef(new Map<number, { handle: GuideNoteHandle; end: number }>());
  // Notas de la otra guitarra ya programadas (para callarlas en PAUSA).
  const bandHandlesRef = useRef<{ handle: GuideNoteHandle; end: number }[]>([]);

  // Un acierto "abre" sus notas reales: las ya programadas suben de volumen (las siguientes saldrán
  // ya abiertas) y, en 'paso', suenan ya las de su golpe. El mástil no suena durante la partida.
  const applyHit = useCallback((session: RiffSession, hit: ChartNote, now: number) => {
    for (const id of session.openedBy(hit.id)) guideHandlesRef.current.get(id)?.handle.setVolume(OPEN_GAIN);
    for (const note of session.playNowFor(hit)) void scheduleGuideNote(note.midi, now, note.duration, OPEN_GAIN);
  }, []);

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
    setScore(0);
    setRepetition(null);
    setAtBreak(null);
  }, [clearTimer]);

  // Pone en marcha una sesión: el temporizador que la avanza, programa los sonidos y publica su estado.
  const run = useCallback((session: RiffSession) => {
    clearTimer();
    touchAudioContext();
    void preloadSamples();
    sessionRef.current = session;
    setScoring(session.scoring);
    const handles = guideHandlesRef.current;
    handles.clear();
    setStatus(session.status);
    timerRef.current = window.setInterval(() => {
      const now = getAudioCurrentTime();
      session.advance(now);
      for (const note of session.autoHold(heldRef?.current() ?? [])) applyHit(session, note, now);
      for (const click of session.takeClicks(now, CLICK_LOOKAHEAD_SECONDS)) {
        playMetronomeClick(click.at, click.volume, click.sound);
      }
      for (const note of session.takeGuideNotes(now, CLICK_LOOKAHEAD_SECONDS)) {
        void scheduleGuideNote(note.midi, note.at, note.duration, note.open ? OPEN_GAIN : GUIDE_GAIN).then((handle) => {
          if (handle && sessionRef.current === session) handles.set(note.id, { handle, end: note.at + note.duration });
        });
      }
      for (const note of session.takeBandNotes(now, CLICK_LOOKAHEAD_SECONDS)) {
        if (note.kind === 'bass') {
          playBassNote(note.at, note.midi, note.duration, BAND_BASS_GAIN, note.palmMute);
        } else {
          void scheduleGuideNote(note.midi, note.at, note.duration, BAND_GUITAR_GAIN).then((handle) => {
            if (handle && sessionRef.current === session) bandHandlesRef.current.push({ handle, end: note.at + note.duration });
          });
        }
      }
      bandHandlesRef.current = bandHandlesRef.current.filter((entry) => entry.end >= now - 1);
      for (const [id, entry] of handles) {
        if (entry.end < now - 1) handles.delete(id);
      }
      setStatus(session.status);
      setHitCount(session.hitAt.size);
      setScore(session.totalScore);
      setRepetition(`${session.repetition}/${session.repeats}`);
      setAtBreak(session.stoppedAtBreak);
      if (session.status === 'finished') clearTimer();
    }, TICK_MS);
  }, [applyHit, clearTimer, heldRef]);

  const start = useCallback((options: RiffOptions, backing: RiffBacking) => {
    if (!chart) return;
    run(new RiffSession(chart, options, getAudioCurrentTime(), backing));
  }, [chart, run]);

  // PAUSA: congela la canción y calla las notas de fondo ya programadas.
  const pause = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    session.pause(getAudioCurrentTime());
    for (const { handle } of guideHandlesRef.current.values()) handle.setVolume(0);
    guideHandlesRef.current.clear();
    for (const { handle } of bandHandlesRef.current) handle.setVolume(0);
    bandHandlesRef.current = [];
    setStatus(session.status);
  }, []);

  // CONTINUAR: dos compases atrás, con cuenta de entrada (ver RiffSession.resume). Con `next` (los
  // ajustes actuales), si algo cambió durante la pausa -- velocidad, pista, acompañamiento, ritmo,
  // compases... -- sigue con una sesión nueva que hereda la pausada (RiffSession.continueFrom).
  const resume = useCallback((next?: { chart: Chart; options: RiffOptions; backing: RiffBacking }) => {
    const session = sessionRef.current;
    if (!session) return;
    const now = getAudioCurrentTime();
    const same = !next || (next.chart === session.chart && next.backing === session.backing
      && (['speed', 'mode', 'loop', 'fromBar', 'toBar', 'freeStrings'] as const).every((key) => next.options[key] === session.options[key]));
    if (same || session.status !== 'paused' || session.stoppedAtBreak !== null) {
      session.resume(now);
      setStatus(session.status);
      setAtBreak(session.stoppedAtBreak);
      setHitCount(session.hitAt.size);
      setScore(session.totalScore);
      return;
    }
    const continued = new RiffSession(next.chart, next.options, now, next.backing);
    continued.continueFrom(session, now);
    run(continued);
  }, [run]);

  // Para el mástil: volumen relativo de su propia nota -- 0 mientras hay partida en curso (lo que
  // suena es la canción real; un acierto "abre" sus notas), 1 en pausa o terminada.
  const onNoteEvent = useCallback((event: PracticeNoteEvent) => {
    const session = sessionRef.current;
    if (!session || session.status === 'finished') return undefined;
    const now = getAudioCurrentTime();
    const result = session.judge(event, now);
    if (result.hit) applyHit(session, result.hit, now);
    return result.gain;
  }, [applyHit]);

  return { sessionRef, status, hitCount, score, scoring, repetition, atBreak, start, stop, pause, resume, onNoteEvent };
}
