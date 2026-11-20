'use client';
import { type MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createMixRouter, getAudioCurrentTime, getMixBus, type GuideNoteHandle, type MixRouter, playBassNote, playDrumPad, playMetronomeClick, preloadSamples, scheduleGuideNote, scheduleKeyNote, type ScheduledBend, setGameMix, touchAudioContext } from '@/app/lib/guitarAudioEngine';
import { drumPadTarget, drumSoundTarget, type MixContext, type MixTarget } from '@/app/lib/soundCheck';
import { CRASH, HIGH_TOM, KICK, LOW_TOM, SNARE } from './drums';
import type { PracticeNoteEvent } from '@/app/lib/useFretboardPractice';
import { perfEnd, perfInput, perfReset, perfTickStart } from './perfMeter';
import type { Chart, ChartNote } from './chart';
import { keysSoundMidi } from './keys';
import { DRUM_LEVEL, drumVolume, GUIDE_GAIN, KICK_BOOST, OPEN_GAIN, RiffSession, sameBacking, type RiffBacking, type RiffOptions, type RiffStatus, type ScheduledGuideNote } from './session';

// Envuelve RiffSession con el reloj real (AudioContext), el metrónomo y el estado de React.
// El dibujo (RiffHighway) lee `sessionRef` en cada frame; aquí solo cambia el estado cuando
// cambia el `status`, nunca por frame.

const TICK_MS = 25;
// Volumen de la banda (las otras pistas). La otra guitarra, bastante por debajo de las notas de fondo
// de la propia pista (GUIDE_GAIN) para que se distinga lo que toca el alumno: 0,195 = el 75 % del
// 0,26 de antes (petición del usuario, 2026-10-27: tocando James, el solo de Kirk se oía demasiado).
// El bajo, como el del reproductor de tablaturas (BASS_TRACK_VOLUME_MULTIPLIER = 0,425: 0,5 hasta el
// 2026-11-15, el usuario lo bajó un 15 % en las dos partes).
const BAND_GUITAR_GAIN = 0.195;
const BAND_BASS_GAIN = 0.425;
// TECLADOS (usuario, 2026-11-18: suenan como el MiniKeyboard): la voz de oscilador sostiene y la guitarra
// decae, así que a igual pico el teclado sonaba más fuerte (ver keyboard-audio-loudness). Medido en LUFS
// con tests/riff-keys-loudness.spec.ts frente a la guitarra de fondo: con 0,5 el teclado quedaba +2,5 LU en
// cascos, +4,6 en portátil y +6,6 en móvil; con 0,35, ≈ −0,6 / +1,5 / +3,5 (los altavoces pequeños no
// reproducen los graves de la guitarra, así que ahí el teclado siempre destaca algo).
export const KEYS_GAIN = 0.35;
const BAND_KEYS_GAIN = BAND_GUITAR_GAIN * KEYS_GAIN;

// La pista propia cuando se toca el bajo (mismo sintetizador que el bajo de la banda). `volume` en la
// escala de GUIDE_GAIN/OPEN_GAIN, como la guitarra: abierta suena como el bajo de la banda.
function playOwnBass(note: { midi: number; palmMute: boolean; bend?: ScheduledBend }, at: number, duration: number, volume: number, out?: AudioNode): GuideNoteHandle | null {
  const handle = playBassNote(at, note.midi, duration, volume * BAND_BASS_GAIN, note.palmMute, note.bend, out);
  return handle && { setVolume: (next) => handle.setVolume(next * BAND_BASS_GAIN), stopAt: handle.stopAt };
}
// El volumen de una nota de teclado va en la escala de GUIDE_GAIN/OPEN_GAIN × KEYS_GAIN.
function keyHandle(handle: GuideNoteHandle | null): GuideNoteHandle | null {
  return handle && { setVolume: (next) => handle.setVolume(next * KEYS_GAIN), stopAt: handle.stopAt };
}
// Cuánto se programa por adelantado (segundos reales). 0,3 s (antes 0,15): con canciones muy densas
// el temporizador llegaba a retrasarse 130 ms, y una nota programada tarde se oye a destiempo.
const CLICK_LOOKAHEAD_SECONDS = 0.3;

export type RiffGameStatus = 'idle' | RiffStatus;

// MESA DE SONIDO (soundCheck.ts, usuario 2026-11-19): con `listen`, esta partida solo ESCUCHA la canción (sin
// entrada ni puntos) y programa cada nota de la pista TRES veces, una por volumen (normal a OPEN_GAIN, fallo a
// GUIDE_GAIN, fondo al nivel de la banda), cada una a su bus; el Solo de la mesa decide cuál se oye. En la
// batería, solo la pieza abierta (`piece`) va por triplicado; las demás suenan en normal.
export type ListenFocusRef = MutableRefObject<{ piece: MixTarget | null } | null>;

// Instrumento de mesa de lo que toca esta partida (la batería va por piezas, ver drumTarget).
function ownTarget(session: RiffSession): MixTarget {
  return session.bass ? 'bass' : session.keys ? 'keys' : 'guitar';
}
const DRUM_PADS_FOR_MIX = { KICK, SNARE, HIGH_TOM, LOW_TOM, CRASH };
const drumTarget = (pad: number | undefined) => drumPadTarget(pad ?? SNARE, DRUM_PADS_FOR_MIX);
// La batería de fondo (session.ts: la real y la automática): 0,8 × DRUM_LEVEL, el bombo × KICK_BOOST.
const drumBandVolume = (pad: number | undefined) => 0.8 * DRUM_LEVEL * (pad === KICK ? KICK_BOOST : 1);

// Posiciones que suenan AHORA en el mástil (las publica ReducedFretboardDiagram), para las notas
// repetidas con la pulsación mantenida (RiffSession.autoHold).
export type HeldPositionsRef = MutableRefObject<() => { string: number; fret: number }[]>;

// `volume`: el volumen de la partida (barra del panel, 0-2; 1 = el de siempre, usuario 2026-11-15).
// Ya NO multiplica cada nota (subía la saturación del bajo y aplastaba la batería): se aplica a la
// salida, en el bus de mezcla de la partida (setGameMix en guitarAudioEngine.ts: compresor + limitador),
// abierto mientras se TOCA (cuenta de entrada o tocando).
export function useRiffGame(chart: Chart | null, heldRef?: HeldPositionsRef, volume = 1, listen?: ListenFocusRef) {
  const sessionRef = useRef<RiffSession | null>(null);
  const [status, setStatus] = useState<RiffGameStatus>('idle');
  // Bus de mezcla de la partida: abierto (con la barra) mientras se toca; en pausa, al terminar o
  // al salir, la salida vuelve al camino directo (el mástil suena entonces como siempre).
  const mixing = status === 'countin' || status === 'playing';
  useEffect(() => {
    setGameMix(mixing, volume);
  }, [mixing, volume]);
  useEffect(() => () => setGameMix(false), []);
  // Aciertos y puntos, FUERA del estado de React (usuario, 2026-11-09: en el móvil, cada nota daba un
  // tirón): cambian con cada acierto y, como estado, redibujaban el mástil ENTERO. Se suscriben solo
  // la línea de puntos y los atributos data-hits / data-score del escenario (ver `stats`).
  const statsRef = useRef({ hits: 0, score: 0 });
  const statsListenersRef = useRef(new Set<() => void>());
  const setStats = useCallback((hits: number, score: number) => {
    const current = statsRef.current;
    if (current.hits === hits && current.score === score) return;
    statsRef.current = { hits, score };
    statsListenersRef.current.forEach((listener) => listener());
  }, []);
  const stats = useMemo(() => ({
    subscribe(listener: () => void) {
      statsListenersRef.current.add(listener);
      return () => { statsListenersRef.current.delete(listener); };
    },
    get: () => statsRef.current,
  }), []);
  // Vuelta del tramo en curso (con `repeats`, "2/6"); null sin partida.
  const [repetition, setRepetition] = useState<string | null>(null);
  // Parada automática en la que espera (RiffOptions.breaks), o null.
  const [atBreak, setAtBreak] = useState<number | null>(null);
  // Si la partida en curso puntúa ("Con ritmo"; "Paso a paso" no).
  const [scoring, setScoring] = useState(false);
  const timerRef = useRef<number | null>(null);
  // Notas de fondo ya programadas (id de nota real -> control de volumen + cuándo acaba), para
  // poder "abrirlas" cuando se acierta su nota traducida (todos los niveles menos Experto).
  const guideHandlesRef = useRef(new Map<number, { handle: GuideNoteHandle; end: number; router?: MixRouter }>());
  // Notas de la otra guitarra ya programadas (para callarlas en PAUSA).
  const bandHandlesRef = useRef<{ handle: GuideNoteHandle; end: number }[]>([]);
  // Última nota de fondo de cada cuerda (de la propia pista o de la banda): la siguiente en la misma
  // cuerda la corta, como en una guitarra de verdad (si no, con notas muy rápidas se amontonaban).
  const lastOnVoiceRef = useRef(new Map<string, GuideNoteHandle>());
  const onVoice = useCallback((voice: string | undefined, handle: GuideNoteHandle, at: number) => {
    if (!voice) return;
    lastOnVoiceRef.current.get(voice)?.stopAt(at);
    lastOnVoiceRef.current.set(voice, handle);
  }, []);

  // Un acierto "abre" sus notas reales: las ya programadas suben de volumen (las siguientes saldrán
  // ya abiertas) y, en 'paso', suenan ya las de su golpe. El mástil no suena durante la partida.
  const applyHit = useCallback((session: RiffSession, hit: ChartNote, now: number) => {
    const open = OPEN_GAIN;
    // Batería (drums.ts): el golpe suena YA, al tocarlo, como un instrumento; si su golpe de fondo aún no
    // ha sonado, se calla (no suena dos veces).
    if (session.drums) {
      for (const id of session.openedBy(hit.id)) guideHandlesRef.current.get(id)?.handle.stopAt(now);
      for (const note of session.playNowFor(hit)) playDrumPad(note.pad ?? 3, now, drumVolume(note.pad, true), getMixBus(drumTarget(note.pad), 'normal'));
      return;
    }
    for (const id of session.openedBy(hit.id)) {
      const entry = guideHandlesRef.current.get(id);
      entry?.handle.setVolume(open);
      // Acertada: de "fallo" a "normal" en la mesa de sonido.
      entry?.router?.setContext('normal');
    }
    const normalBus = getMixBus(ownTarget(session), 'normal');
    for (const note of session.playNowFor(hit)) {
      if (session.bass) playOwnBass(note, now, note.duration, open, normalBus);
      else if (session.keys) scheduleKeyNote(note.midi, now, note.duration, open * KEYS_GAIN, normalBus);
      else void scheduleGuideNote(note.midi, now, note.duration, open, note.bend, normalBus);
    }
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Calla las notas de fondo y de la banda ya programadas (PAUSA, parar y salir de la página).
  const silence = useCallback(() => {
    for (const { handle } of guideHandlesRef.current.values()) handle.setVolume(0);
    guideHandlesRef.current.clear();
    for (const { handle } of bandHandlesRef.current) handle.setVolume(0);
    bandHandlesRef.current = [];
    lastOnVoiceRef.current.clear();
  }, []);

  // Cada "Empezar" tiene su turno: si se para (o se vuelve a empezar) mientras se cargan los sonidos,
  // el arranque anterior ya no sigue.
  const startTokenRef = useRef(0);

  const stop = useCallback(() => {
    startTokenRef.current++;
    clearTimer();
    silence();
    sessionRef.current = null;
    setStatus('idle');
    setStats(0, 0);
    setRepetition(null);
    setAtBreak(null);
  }, [clearTimer, setStats, silence]);

  // Al salir de la página con la partida en marcha: sin esto el temporizador seguía vivo (el
  // AudioContext es de toda la web) y la canción seguía sonando hasta el final.
  useEffect(() => () => {
    clearTimer();
    silence();
    sessionRef.current = null;
  }, [clearTimer, silence]);

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
      const perfStart = perfTickStart(TICK_MS);
      try {
        tick();
      } finally {
        perfEnd('tick', perfStart);
      }
    }, TICK_MS);
    // Mesa de sonido: la nota de la pista por cada volumen, a su nivel de siempre y a su bus.
    function scheduleListenCopies(current: RiffSession, note: ScheduledGuideNote, piece: MixTarget | null) {
      const keep = (handle: GuideNoteHandle | null, context: MixContext) => {
        if (!handle) return;
        if (sessionRef.current !== current) handle.setVolume(0);
        else {
          bandHandlesRef.current.push({ handle, end: note.at + note.duration + 1.5 });
          onVoice(`${note.voice}/${context}`, handle, note.at);
        }
      };
      if (current.drums) {
        const target = drumTarget(note.pad);
        const pad = note.pad ?? 3;
        // Las piezas que no son la pestaña abierta, solo en normal (si no, sonarían triplicadas).
        keep(playDrumPad(pad, note.at, drumVolume(note.pad, true), getMixBus(target, 'normal')), 'normal');
        if (target !== piece) return;
        keep(playDrumPad(pad, note.at, drumVolume(note.pad, false), getMixBus(target, 'fallo')), 'fallo');
        keep(playDrumPad(pad, note.at, drumBandVolume(note.pad), getMixBus(target, 'fondo')), 'fondo');
        return;
      }
      const target = ownTarget(current);
      const levels: Array<[MixContext, number]> = [['normal', OPEN_GAIN], ['fallo', GUIDE_GAIN], ['fondo', 0]];
      for (const [context, level] of levels) {
        const out = getMixBus(target, context);
        if (current.bass) keep(playOwnBass(note, note.at, note.duration, context === 'fondo' ? 1 : level, out), context);
        else if (current.keys) {
          keep(scheduleKeyNote(context === 'fondo' ? keysSoundMidi(note.midi) : note.midi, note.at, note.duration, context === 'fondo' ? BAND_KEYS_GAIN : level * KEYS_GAIN, out), context);
        } else {
          void scheduleGuideNote(note.midi, note.at, note.duration, context === 'fondo' ? BAND_GUITAR_GAIN : level, note.bend, out).then((handle) => keep(handle, context));
        }
      }
    }
    function tick() {
      const now = getAudioCurrentTime();
      session.advance(now);
      for (const note of session.autoHold(heldRef?.current() ?? [])) applyHit(session, note, now);
      for (const click of session.takeClicks(now, CLICK_LOOKAHEAD_SECONDS)) {
        // Los golpes de la batería de fondo, al bus "fondo" de su pieza; el metrónomo, como siempre.
        playMetronomeClick(click.at, click.volume, click.sound, click.drum ? getMixBus(drumSoundTarget(click.sound), 'fondo') : undefined);
      }
      const focus = listen ? listen.current : null;
      for (const note of session.takeGuideNotes(now, CLICK_LOOKAHEAD_SECONDS)) {
        if (focus) {
          scheduleListenCopies(session, note, focus.piece);
          continue;
        }
        if (session.drums) {
          const handle = playDrumPad(note.pad ?? 3, note.at, drumVolume(note.pad, note.open, note.unplayed), getMixBus(drumTarget(note.pad), note.open ? 'normal' : 'fallo'));
          if (handle) handles.set(note.id, { handle, end: note.at + 1.5 });
          continue;
        }
        const volume = note.open ? OPEN_GAIN : GUIDE_GAIN;
        // Mesa de sonido: sale por "fallo" y pasa a "normal" al acertarla (o ya "normal" si sale abierta).
        const router = createMixRouter(ownTarget(session), note.open ? 'normal' : 'fallo');
        const out = router.input;
        window.setTimeout(() => router.dispose(), Math.max(0, note.at - now + note.duration) * 1000 + 3000);
        const scheduled = session.bass ? Promise.resolve(playOwnBass(note, note.at, note.duration, volume, out)) : session.keys ? Promise.resolve(keyHandle(scheduleKeyNote(note.midi, note.at, note.duration, volume * KEYS_GAIN, out))) : scheduleGuideNote(note.midi, note.at, note.duration, volume, note.bend, out);
        void scheduled.then((handle) => {
          if (!handle) return;
          // Llegó tarde (ya se paró o se salió de la página): se calla en vez de quedarse sonando.
          if (sessionRef.current !== session) handle.setVolume(0);
          else {
            handles.set(note.id, { handle, end: note.at + note.duration, router });
            onVoice(note.voice, handle, note.at);
          }
        });
      }
      for (const note of session.takeBandNotes(now, CLICK_LOOKAHEAD_SECONDS)) {
        if (note.kind === 'bass') {
          playBassNote(note.at, note.midi, note.duration, BAND_BASS_GAIN, note.palmMute, note.bend, getMixBus('bass', 'fondo'));
        } else if (note.kind === 'keys') {
          // Con el mismo suelo de graves que el teclado que se toca (keys.ts).
          const handle = scheduleKeyNote(keysSoundMidi(note.midi), note.at, note.duration, BAND_KEYS_GAIN, getMixBus('keys', 'fondo'));
          if (handle) bandHandlesRef.current.push({ handle, end: note.at + note.duration });
        } else {
          void scheduleGuideNote(note.midi, note.at, note.duration, BAND_GUITAR_GAIN, note.bend, getMixBus('guitar', 'fondo')).then((handle) => {
            if (!handle) return;
            if (sessionRef.current !== session) handle.setVolume(0);
            else {
              bandHandlesRef.current.push({ handle, end: note.at + note.duration });
              onVoice(note.voice, handle, note.at);
            }
          });
        }
      }
      bandHandlesRef.current = bandHandlesRef.current.filter((entry) => entry.end >= now - 1);
      for (const [id, entry] of handles) {
        if (entry.end < now - 1) handles.delete(id);
      }
      setStatus(session.status);
      setStats(session.hitAt.size, session.totalScore);
      setRepetition(`${session.repetition}/${session.repeats}`);
      setAtBreak(session.stoppedAtBreak);
      if (session.status === 'finished') clearTimer();
    }
  }, [applyHit, clearTimer, heldRef, listen, onVoice, setStats]);

  // Todos los sonidos cargados ANTES de la cuenta de entrada: nada se carga a mitad de partida.
  const start = useCallback(async (options: RiffOptions, backing: RiffBacking) => {
    if (!chart) return;
    const token = ++startTokenRef.current;
    touchAudioContext();
    await preloadSamples();
    if (token !== startTokenRef.current) return;
    perfReset();
    run(new RiffSession(chart, options, getAudioCurrentTime(), backing));
  }, [chart, run]);

  // PAUSA: congela la canción y calla las notas de fondo ya programadas.
  const pause = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    session.pause(getAudioCurrentTime());
    silence();
    setStatus(session.status);
  }, [silence]);

  // CONTINUAR: dos compases atrás, con cuenta de entrada (ver RiffSession.resume). Con `next` (los
  // ajustes actuales), si algo cambió durante la pausa -- velocidad, pista, acompañamiento, ritmo,
  // compases... -- sigue con una sesión nueva que hereda la pausada (RiffSession.continueFrom).
  const resume = useCallback((next?: { chart: Chart; options: RiffOptions; backing: RiffBacking }) => {
    const session = sessionRef.current;
    if (!session) return;
    const now = getAudioCurrentTime();
    const same = !next || (next.chart === session.chart && sameBacking(next.backing, session.backing)
      && (['speed', 'mode', 'loop', 'fromBar', 'toBar', 'freeStrings'] as const).every((key) => next.options[key] === session.options[key]));
    if (same || session.status !== 'paused' || session.stoppedAtBreak !== null) {
      session.resume(now);
      setStatus(session.status);
      setAtBreak(session.stoppedAtBreak);
      setStats(session.hitAt.size, session.totalScore);
      return;
    }
    const continued = new RiffSession(next.chart, next.options, now, next.backing);
    continued.continueFrom(session, now);
    run(continued);
  }, [run, setStats]);

  // Para el mástil: volumen relativo de su propia nota -- 0 mientras hay partida en curso (lo que
  // suena es la canción real; un acierto "abre" sus notas), 1 en pausa o terminada.
  const onNoteEvent = useCallback((event: PracticeNoteEvent) => {
    const session = sessionRef.current;
    if (!session || session.status === 'finished') return undefined;
    const now = getAudioCurrentTime();
    // Cuánto tarde llega aquí el toque (ver RiffSession.judge): se juzga en el instante del toque.
    const lag = event.timeStamp !== undefined ? (performance.now() - event.timeStamp) / 1000 : 0;
    perfInput(lag * 1000);
    const result = session.judge(event, now, lag);
    if (result.hit) applyHit(session, result.hit, now);
    return result.gain;
  }, [applyHit]);

  return { sessionRef, status, stats, scoring, repetition, atBreak, start, stop, pause, resume, onNoteEvent };
}
