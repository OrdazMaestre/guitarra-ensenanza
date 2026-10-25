'use client';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { buildChart, listGuitarTracks, loadScore, type Chart, type GuitarTrackInfo } from '@/app/lib/riff/chart';
import { RIFF_LEVELS, type RiffLevel } from '@/app/lib/riff/levels';
import { reduceChart } from '@/app/lib/riff/reduce';
import type { RiffBacking, RiffMode } from '@/app/lib/riff/session';
import { type HeldPositionsRef, useRiffGame } from '@/app/lib/riff/useRiffGame';
import { buildRemix } from '@/app/lib/riff/remix';
import { RIFF_TUTORIAL } from './riffTutorial';

// Estado del juego tipo Rocksmith que vive DENTRO de un mástil MIDI (ReducedFretboardDiagram,
// prop `riffGame`): carga del .gp, pista, ajustes, aviso de pantalla estrecha y la partida.
// Si `source` es undefined el hook no hace nada (los hooks no pueden ser condicionales).

// Ancho mínimo por traste para que la autopista se lea bien. Por debajo de
// `trastes × MIN_PX_PER_FRET + margen` se muestra el aviso de pantalla estrecha.
const MIN_PX_PER_FRET = 44;
const SIDE_MARGIN_PX = 60;

const DEFAULTS = { level: 'practica' as RiffLevel, speed: 0.75, mode: 'ritmo' as RiffMode, loop: false };

interface Options {
  source?: string;
  initialTrack?: string;
  startFret: number;
  endFret: number;
  // Elemento cuyo ancho decide si cabe la autopista (el host del mástil).
  measureRef: RefObject<HTMLElement | null>;
  // Posiciones que suenan ahora en el mástil (notas repetidas con la pulsación mantenida).
  heldRef?: HeldPositionsRef;
}

export function useRiffController({ source, initialTrack, startFret, endFret, measureRef, heldRef }: Options) {
  const [tracks, setTracks] = useState<GuitarTrackInfo[]>([]);
  const [trackIndex, setTrackIndex] = useState<number | null>(null);
  const [chart, setChart] = useState<Chart | null>(null);
  const [loadError, setLoadError] = useState(false);
  // Configuración inicial (decisión del usuario): Kirk, Práctica, 75 %, Con ritmo, sin bucle y
  // batería (metrónomo si el archivo no trae batería). `resetDefaults` vuelve a ella.
  const [speed, setSpeed] = useState<number>(DEFAULTS.speed);
  const [mode, setMode] = useState<RiffMode>(DEFAULTS.mode);
  const [backing, setBacking] = useState<RiffBacking>('bateria');
  const [loop, setLoop] = useState(DEFAULTS.loop);
  const [fromBar, setFromBar] = useState(1);
  const [toBar, setToBar] = useState(1);
  const [narrow, setNarrow] = useState(false);
  // Práctica..Difícil = chart TRADUCIDO (reduce.ts); Experto = la tablatura real.
  const [level, setLevel] = useState<RiffLevel>(DEFAULTS.level);
  // Partida tutorial (riffTutorial.ts): su canción remix sustituye al chart mientras dura, y sus
  // paradas automáticas (`breaks`) separan las partes. `tutorialOn` = tutorial abierto.
  // Con pantalla estrecha no hay juego: el tutorial queda apagado (y al ensancharse, vuelve a su
  // primera tarjeta, porque la partida se paró).
  const [tutorialWanted, setTutorialOn] = useState(false);
  const [remixState, setTutorialRemix] = useState<{ chart: Chart; breaks: number[] } | null>(null);
  const tutorialOn = tutorialWanted && !narrow;
  const tutorialRemix = tutorialOn ? remixState : null;
  const activeChart = tutorialRemix?.chart ?? chart;
  // En el tutorial el mástil del juego es el de modo trastes 0-5 (Fácil y Medio).
  const profile = tutorialRemix ? RIFF_LEVELS.medio : level === 'experto' ? null : RIFF_LEVELS[level];

  const game = useRiffGame(activeChart, heldRef);
  // Partida EN CURSO (cuenta de entrada o tocando). En pausa o terminada no lo está.
  const playing = game.status === 'countin' || game.status === 'playing';
  const paused = game.status === 'paused';
  // Tras la primera partida, "Empezar" pasa a llamarse "Volver a empezar".
  const [hasStarted, setHasStarted] = useState(false);
  // Cambiar un ajuste en pausa invalida esa partida: ya solo se puede volver a empezar.
  const { stop: stopGame } = game;
  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => {
    if (pausedRef.current) stopGame();
  }, [speed, mode, backing, loop, fromBar, toBar, stopGame]);

  // Cargar el .gp y elegir pista.
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    loadScore(source)
      .then(({ score }) => {
        if (cancelled) return;
        const list = listGuitarTracks(score);
        setTracks(list);
        const preferred = list.find((track) => track.name === initialTrack) ?? list[0];
        setTrackIndex(preferred ? preferred.index : null);
      })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, [source, initialTrack]);

  // Construir el chart de la pista elegida. Experto: la tablatura real (lo que pasa de `endFret`
  // se recoloca, ver chart.ts). Resto: traducida al nivel desde las notas reales sin recolocar.
  useEffect(() => {
    if (!source || trackIndex === null) return;
    let cancelled = false;
    loadScore(source).then(({ at, score }) => {
      if (cancelled) return;
      const built = level === 'experto'
        ? buildChart(at, score, trackIndex, endFret)
        : reduceChart(buildChart(at, score, trackIndex, 24), RIFF_LEVELS[level]);
      setChart(built);
      setFromBar(1);
      setToBar(Math.max(1, ...built.bars.map((bar) => bar.number)));
      // Sin pista de batería en el archivo, "Batería" no tiene nada que tocar: metrónomo.
      setBacking((current) => (current === 'bateria' && built.drums.length === 0 ? 'metronomo' : current));
    });
    return () => { cancelled = true; };
  }, [source, trackIndex, endFret, level]);

  const maxBar = useMemo(() => (chart ? Math.max(1, ...chart.bars.map((bar) => bar.number)) : 1), [chart]);
  const previewTime = useMemo(() => {
    const bar = tutorialRemix ? tutorialRemix.chart.bars[0] : chart?.bars.find((b) => b.number >= fromBar);
    return (bar?.t ?? 0) - 0.4;
  }, [chart, fromBar, tutorialRemix]);

  // Aviso de pantalla estrecha: se mide el ancho REAL del mástil (cubre móvil vertical, pantallas
  // pequeñas y ventanas estrechas por igual), no el tipo de dispositivo.
  const fretCount = startFret === 0 ? endFret : endFret - startFret + 1;
  const minWidth = fretCount * MIN_PX_PER_FRET + SIDE_MARGIN_PX;
  useEffect(() => {
    const el = measureRef.current;
    if (!source || !el) return;
    const measure = () => setNarrow(el.clientWidth < minWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [source, minWidth, measureRef]);

  const { stop } = game;
  useEffect(() => {
    if (narrow) stop();
  }, [narrow, stop]);

  // Partida tutorial de mecánicas. La tarjeta que se ve delante del mástil:
  // - 'section-k': mensajes de la parte k (antes de empezar, o parada en el silencio previo);
  // - 'pause': PAUSA pulsada a mitad de una parte; 'end': canción terminada; null: tocando.
  type TutorialCard = `section-${number}` | 'pause' | 'end';
  let tutorialCard: TutorialCard | null = null;
  if (tutorialOn) {
    if (game.status === 'idle') tutorialCard = 'section-0';
    else if (game.status === 'paused') tutorialCard = game.atBreak !== null ? `section-${game.atBreak}` : 'pause';
    else if (game.status === 'finished') tutorialCard = 'end';
  }

  function startTutorial() {
    if (trackIndex === null || !source) return;
    setTutorialOn(true);
    setTutorialRemix(null);
    setHasStarted(true);
    // La canción remix: cada parte con las notas de su nivel, de la pista elegida.
    void loadScore(source).then(({ at, score }) => {
      const real = buildChart(at, score, trackIndex, 24);
      const remix = buildRemix(RIFF_TUTORIAL.map((part) => ({
        chart: reduceChart(real, RIFF_LEVELS[part.level as Exclude<RiffLevel, 'experto'>]),
        fromBar: part.fromBar,
        toBar: part.toBar,
        repeats: part.repeats,
      })));
      setTutorialRemix(remix);
    });
  }

  // "¡A tocar!": la primera vez arranca la canción; en una parada, sigue desde el silencio.
  function playTutorial() {
    if (!tutorialRemix) return;
    if (game.status === 'paused') {
      game.resume();
      return;
    }
    const lastBar = tutorialRemix.chart.bars[tutorialRemix.chart.bars.length - 1].number;
    game.start({ speed, mode: 'ritmo', loop: false, fromBar: 1, toBar: lastBar, freeStrings: true, breaks: tutorialRemix.breaks }, backing);
  }

  function exitTutorial() {
    setTutorialOn(false);
    setTutorialRemix(null);
    stop();
  }

  const hasDrums = !!chart && chart.drums.length > 0;
  function resetDefaults() {
    const preferred = tracks.find((track) => track.name === initialTrack) ?? tracks[0];
    if (preferred) setTrackIndex(preferred.index);
    setLevel(DEFAULTS.level);
    setSpeed(DEFAULTS.speed);
    setMode(DEFAULTS.mode);
    setLoop(DEFAULTS.loop);
    setBacking(hasDrums ? 'bateria' : 'metronomo');
    setFromBar(1);
    setToBar(maxBar);
  }

  function start() {
    setHasStarted(true);
    game.start({ speed, mode, loop, fromBar: Math.min(fromBar, toBar), toBar: Math.max(fromBar, toBar), freeStrings: !!profile?.freeStrings }, backing);
  }

  return {
    level, setLevel, profile,
    tracks, trackIndex, setTrackIndex,
    chart: activeChart, loadError,
    speed, setSpeed,
    mode, setMode,
    backing, setBacking,
    loop, setLoop,
    fromBar, setFromBar, toBar, setToBar, maxBar,
    previewTime,
    narrow,
    game,
    playing,
    paused,
    hasStarted,
    canStart: !!chart && !narrow && !playing,
    pause: game.pause,
    resume: game.resume,
    resetDefaults,
    start,
    stop,
    tutorialOn,
    tutorialReady: !!tutorialRemix,
    tutorialCard,
    startTutorial,
    playTutorial,
    exitTutorial,
  };
}

export type RiffController = ReturnType<typeof useRiffController>;
