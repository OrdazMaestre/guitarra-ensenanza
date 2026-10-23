'use client';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { buildChart, listGuitarTracks, loadScore, type Chart, type GuitarTrackInfo } from '@/app/lib/riff/chart';
import { RIFF_LEVELS, type RiffLevel } from '@/app/lib/riff/levels';
import { reduceChart } from '@/app/lib/riff/reduce';
import type { RiffBacking, RiffMode } from '@/app/lib/riff/session';
import { type HeldPositionsRef, useRiffGame } from '@/app/lib/riff/useRiffGame';

// Estado del juego tipo Rocksmith que vive DENTRO de un mástil MIDI (ReducedFretboardDiagram,
// prop `riffGame`): carga del .gp, pista, ajustes, aviso de pantalla estrecha y la partida.
// Si `source` es undefined el hook no hace nada (los hooks no pueden ser condicionales).

// Ancho mínimo por traste para que la autopista se lea bien. Por debajo de
// `trastes × MIN_PX_PER_FRET + margen` se muestra el aviso de pantalla estrecha.
const MIN_PX_PER_FRET = 44;
const SIDE_MARGIN_PX = 60;

const DEFAULTS = { level: 'practica' as RiffLevel, speed: 0.5, mode: 'ritmo' as RiffMode, loop: false };

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
  // Configuración inicial (decisión del usuario): Kirk, Práctica, 50 %, Con ritmo, sin bucle y
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
  const profile = level === 'experto' ? null : RIFF_LEVELS[level];

  const game = useRiffGame(chart, heldRef);
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
    const bar = chart?.bars.find((b) => b.number >= fromBar);
    return (bar?.t ?? 0) - 0.4;
  }, [chart, fromBar]);

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
    chart, loadError,
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
  };
}

export type RiffController = ReturnType<typeof useRiffController>;
