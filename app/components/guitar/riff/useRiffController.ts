'use client';
import { type RefObject, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { buildChart, listGuitarTracks, listPlayableTracks, loadScore, type Chart, type GuitarTrackInfo } from '@/app/lib/riff/chart';
import { RIFF_LEVELS, type RiffLevel } from '@/app/lib/riff/levels';
import { pitchRange, reduceChart } from '@/app/lib/riff/reduce';
import { leaderTrack, type TrackRole } from '@/app/lib/riff/roles';
import type { RiffBacking, RiffClick, RiffMode } from '@/app/lib/riff/session';
import { type HeldPositionsRef, useRiffGame } from '@/app/lib/riff/useRiffGame';
import { buildRemix } from '@/app/lib/riff/remix';
import { lockGameScreen, releaseGameScreen, unlockGameOrientation } from '@/app/lib/orientationLock';
import { RIFF_TUTORIAL, RIFF_TUTORIAL_SONG } from './riffTutorial';

// Estado del juego tipo Rocksmith que vive DENTRO de un mástil MIDI (ReducedFretboardDiagram,
// prop `riffGame`): carga del .gp, pista, ajustes, aviso de pantalla estrecha y la partida.
// Si `source` es undefined el hook no hace nada (los hooks no pueden ser condicionales).

// Ancho mínimo por traste para que la autopista se lea bien. Por debajo de
// `trastes × MIN_PX_PER_FRET + margen` se muestra el aviso de pantalla estrecha.
const MIN_PX_PER_FRET = 44;
const SIDE_MARGIN_PX = 60;

const DEFAULTS = { level: 'practica' as RiffLevel, speed: 1, mode: 'ritmo' as RiffMode };

// Modos de juego (petición del usuario, 2026-11-05):
// - Práctica: el tramo elegido en bucle, sin sumar puntos.
// - Ensayo: la partida normal; tras pausar se continúa conservando los puntos.
// - Concierto: canción entera al 100 % y con ritmo, con esos ajustes bloqueados; al pausar ya no se
//   continúa. Es la partida comparable, la que servirá para futuros rankings.
export type RiffGameMode = 'practica' | 'ensayo' | 'concierto';

// Última dificultad elegida, en este navegador (petición del usuario, 2026-11-05). Puede fallar en
// modo privado: entonces el juego empieza en el nivel de base.
const LEVEL_STORAGE_KEY = 'riff-ultimo-nivel';

const neverChanges = () => () => {};
const noSavedLevel = () => null;

function savedLevel(): RiffLevel | null {
  try {
    const value = window.localStorage.getItem(LEVEL_STORAGE_KEY);
    return value && value in RIFF_LEVELS ? (value as RiffLevel) : null;
  } catch {
    return null;
  }
}

interface Options {
  source?: string;
  initialTrack?: string;
  // Papel de cada pista (S/R, por nombre): decide qué guitarra manda en los riffs compartidos.
  trackRoles?: Record<string, TrackRole>;
  startFret: number;
  endFret: number;
  // Elemento cuyo ancho decide si cabe la autopista (el host del mástil).
  measureRef: RefObject<HTMLElement | null>;
  // Posiciones que suenan ahora en el mástil (notas repetidas con la pulsación mantenida).
  heldRef?: HeldPositionsRef;
}

export function useRiffController({ source, initialTrack, trackRoles, startFret, endFret, measureRef, heldRef }: Options) {
  const [tracks, setTracks] = useState<GuitarTrackInfo[]>([]);
  const [trackIndex, setTrackIndex] = useState<number | null>(null);
  const [chart, setChart] = useState<Chart | null>(null);
  const [loadError, setLoadError] = useState(false);
  // Configuración inicial (decisión del usuario): Kirk, Principiante, 100 % (antes 75 %; usuario, 2026-10-31), Con ritmo, sin bucle y
  // batería (metrónomo si el archivo no trae batería). `resetDefaults` vuelve a ella.
  const [speed, setSpeed] = useState<number>(DEFAULTS.speed);
  const [mode, setMode] = useState<RiffMode>(DEFAULTS.mode);
  // Acompañamiento (petición del usuario, 2026-11-03): el metrónomo es un botón sí/no y la batería
  // es una pista más de "Pistas", que se puede silenciar como la otra guitarra o el bajo. Al cargar
  // una canción: con batería, batería sin metrónomo; sin batería, metrónomo.
  const [click, setClick] = useState<RiffClick>('nada');
  const [muted, setMuted] = useState<number[]>([]);
  const backing: RiffBacking = useMemo(() => ({ click, muted }), [click, muted]);
  const toggleMuted = (index: number) => setMuted((current) => (current.includes(index) ? current.filter((value) => value !== index) : [...current, index]));
  const [gameMode, setGameMode] = useState<RiffGameMode>('ensayo');
  const concert = gameMode === 'concierto';
  const loop = gameMode === 'practica';
  const [fromBar, setFromBar] = useState(1);
  const [toBar, setToBar] = useState(1);
  // Ancho real del mástil (null hasta medirlo): de él sale qué niveles caben (ver `fitsFrets`).
  const [hostWidth, setHostWidth] = useState<number | null>(null);
  // Principiante..Difícil = chart TRADUCIDO (reduce.ts); Experto = la tablatura real.
  // El nivel de esta visita manda; si aún no hay, el guardado (el servidor no conoce este navegador).
  const [visitLevel, setLevel] = useState<RiffLevel | null>(null);
  const storedLevel = useSyncExternalStore(neverChanges, savedLevel, noSavedLevel);
  const level = visitLevel ?? storedLevel ?? DEFAULTS.level;
  // Solo guarda lo que elige el usuario: el Tutorial, que vuelve a la base, no lo cambia.
  function chooseLevel(value: RiffLevel) {
    setLevel(value);
    try {
      window.localStorage.setItem(LEVEL_STORAGE_KEY, value);
    } catch {
      // Sin almacenamiento: el nivel vale para esta visita.
    }
  }
  // Partida tutorial (riffTutorial.ts): su canción remix sustituye al chart mientras dura, y sus
  // paradas automáticas (`breaks`) separan las partes. `tutorialOn` = tutorial abierto.
  // Con pantalla estrecha no hay juego: el tutorial queda apagado (y al ensancharse, vuelve a su
  // primera tarjeta, porque la partida se paró).
  const [tutorialWanted, setTutorialOn] = useState(false);
  const [remixState, setTutorialRemix] = useState<{ chart: Chart; breaks: number[] } | null>(null);
  // Cabe un mástil de `frets` trastes (contando como el estirado del juego) en el ancho medido.
  const fitsFrets = (frets: number) => hostWidth === null || hostWidth >= frets * MIN_PX_PER_FRET + SIDE_MARGIN_PX;
  const fullFretCount = startFret === 0 ? endFret : endFret - startFret + 1;
  // Trastes que dibuja un nivel: los niveles con menos trastes que el mástil lo estiran (0-5 = 5
  // columnas además de la del aire), así que en pantalla estrecha siguen cabiendo (petición del
  // usuario, 2026-11-03: Principiante, Fácil y Medio de trastes también en el móvil en vertical).
  const levelFrets = (value: RiffLevel) => {
    const maxFret = value === 'experto' ? endFret : RIFF_LEVELS[value].maxFret;
    return startFret === 0 && maxFret < endFret ? maxFret : fullFretCount;
  };
  const fitsLevel = (value: RiffLevel) => fitsFrets(levelFrets(value));
  const tutorialOn = tutorialWanted && fitsFrets(RIFF_LEVELS.medio.maxFret);
  const tutorialRemix = tutorialOn ? remixState : null;
  const activeChart = tutorialRemix?.chart ?? chart;
  // En el tutorial el mástil del juego es el de modo trastes 0-5 (Fácil y Medio).
  const profile = tutorialRemix ? RIFF_LEVELS.medio : level === 'experto' ? null : RIFF_LEVELS[level];

  const game = useRiffGame(activeChart, heldRef);
  // Partida EN CURSO (cuenta de entrada o tocando). En pausa o terminada no lo está.
  const playing = game.status === 'countin' || game.status === 'playing';
  const paused = game.status === 'paused';
  const canContinue = paused && !concert;
  // Giro bloqueado mientras se juega: se pide en los toques de empezar y continuar (ver
  // orientationLock.ts) y se suelta aquí al pausar, salir o acabar.
  useEffect(() => {
    if (game.status === 'paused') unlockGameOrientation();
    else if (game.status === 'idle' || game.status === 'finished') releaseGameScreen();
  }, [game.status]);
  useEffect(() => releaseGameScreen, []);
  // Tras la primera partida, "Empezar" pasa a llamarse "Volver a empezar".
  const [hasStarted, setHasStarted] = useState(false);
  // Cambiar la DIFICULTAD (o la canción) anula la partida: ya solo se puede volver a empezar. El
  // resto de ajustes se pueden cambiar en pausa y la partida CONTINÚA con ellos (ver `resume`;
  // petición del usuario, 2026-10-28). Excepción: con BUCLE ("modo práctica", no puntúa) también se
  // puede cambiar la dificultad y continuar; si luego se quita el bucle con otra dificultad que la
  // de la partida en pausa, se anula.
  const { stop: stopGame } = game;
  const sessionLevelRef = useRef(level);
  // Canción para la que se fijó el tramo de compases (ver la construcción del chart).
  const barsSourceRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (level !== sessionLevelRef.current && !loop) stopGame();
  }, [level, loop, stopGame]);
  useEffect(() => {
    stopGame();
  }, [source, stopGame]);

  // Cargar el .gp y elegir pista.
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    loadScore(source)
      .then(({ score }) => {
        if (cancelled) return;
        const list = listPlayableTracks(score);
        setTracks(list);
        const preferred = list.find((track) => track.name === initialTrack) ?? list[0];
        setTrackIndex(preferred ? preferred.index : null);
      })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, [source, initialTrack]);

  // Guitarra que manda en los riffs compartidos (la rítmica, si la elegida no lo es). Clave estable
  // para los efectos (los papeles llegan como objeto literal en cada render).
  const rolesKey = JSON.stringify(trackRoles ?? {});
  const leader = useMemo(
    () => (trackIndex === null ? null : leaderTrack(tracks.filter((track) => track.kind !== 'bass'), trackIndex, JSON.parse(rolesKey) as Record<string, TrackRole>)),
    [tracks, trackIndex, rolesKey],
  );

  // Construir el chart de la pista elegida. Experto: la tablatura real (lo que pasa de `endFret`
  // se recoloca, ver chart.ts). Resto: traducida al nivel desde las notas reales sin recolocar; si
  // hay una guitarra que manda, primero se traduce ella y sus riffs compartidos se copian tal cual
  // (reduceChart, `follow`).
  useEffect(() => {
    if (!source || trackIndex === null) return;
    let cancelled = false;
    loadScore(source).then(({ at, score }) => {
      if (cancelled) return;
      // Recién cambiada la canción, `trackIndex`/`leader` aún son de la anterior: se espera a que
      // la carga de arriba elija pista (este efecto vuelve a correr entonces).
      const playable = listPlayableTracks(score);
      const current = playable.find((track) => track.index === trackIndex);
      if (!current) return;
      if (leader !== null && !playable.some((track) => track.index === leader)) return;
      const translate = (index: number, profile: (typeof RIFF_LEVELS)[keyof typeof RIFF_LEVELS]) => {
        // Rango del instrumento: todas las guitarras juntas (zonas de graves/agudas compartidas); el
        // bajo, el suyo.
        const levelChart = (track: number) => buildChart(at, score, track, 24, { fold: true });
        const range = pitchRange((current.kind === 'bass' ? [current] : listGuitarTracks(score)).map((track) => levelChart(track.index)));
        const follow = leader === null ? undefined : reduceChart(levelChart(leader), profile, { range });
        return reduceChart(levelChart(index), profile, { follow, range });
      };
      const built = level === 'experto'
        ? buildChart(at, score, trackIndex, endFret)
        : translate(trackIndex, RIFF_LEVELS[level]);
      setChart(built);
      // Tramo de compases: entero al cargar OTRA canción; al cambiar de dificultad o de pista se
      // conserva el que había (bug real: en modo práctica, cambiar la dificultad devolvía el bucle a
      // la canción entera), recortado al final de la canción si hiciera falta.
      const last = Math.max(1, ...built.bars.map((bar) => bar.number));
      const newSong = barsSourceRef.current !== source;
      if (newSong) {
        barsSourceRef.current = source;
        setFromBar(1);
        setToBar(last);
      } else {
        setFromBar((value) => Math.min(value, last));
        setToBar((value) => Math.min(value, last));
      }
      // Otra canción: todas las pistas suenan; si no trae batería, la batería automática (petición
      // del usuario, 2026-11-03; antes, el metrónomo); con batería, nada.
      if (newSong) {
        setMuted([]);
        setClick(built.drums.length === 0 ? 'auto' : 'nada');
      }
    });
    return () => { cancelled = true; };
  }, [source, trackIndex, endFret, level, leader]);

  const maxBar = useMemo(() => (chart ? Math.max(1, ...chart.bars.map((bar) => bar.number)) : 1), [chart]);
  // Lo que vale de verdad: Concierto impone sus ajustes sin borrar los elegidos para otros modos.
  const playSpeed = concert ? 1 : speed;
  const playMode = concert ? 'ritmo' : mode;
  const playFrom = concert ? 1 : fromBar;
  const playTo = concert ? maxBar : toBar;
  const previewTime = useMemo(() => {
    const bar = tutorialRemix ? tutorialRemix.chart.bars[0] : chart?.bars.find((b) => b.number >= playFrom);
    return (bar?.t ?? 0) - 0.4;
  }, [chart, playFrom, tutorialRemix]);

  // Aviso de pantalla estrecha: se mide el ancho REAL del mástil (cubre móvil vertical, pantallas
  // pequeñas y ventanas estrechas por igual), no el tipo de dispositivo; cada nivel cabe o no según
  // sus trastes (`fitsLevel`).
  const narrow = !fitsLevel(level);
  useEffect(() => {
    const el = measureRef.current;
    if (!source || !el) return;
    const measure = () => setHostWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [source, measureRef]);

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
    if (!source) return;
    stopGame();
    setTutorialOn(true);
    setTutorialRemix(null);
    setHasStarted(true);
    // La canción remix: cada parte con las notas de su nivel. Siempre de la canción y pista del
    // tutorial (sus compases están elegidos para ella), sea cual sea la canción elegida.
    void loadScore(RIFF_TUTORIAL_SONG.source).then(({ at, score }) => {
      const guitars = listGuitarTracks(score);
      const track = guitars.find((candidate) => candidate.name === RIFF_TUTORIAL_SONG.track) ?? guitars[0];
      if (!track) return;
      const leaderIndex = leaderTrack(guitars, track.index, RIFF_TUTORIAL_SONG.roles);
      const real = buildChart(at, score, track.index, 24);
      const leaderReal = leaderIndex === null ? null : buildChart(at, score, leaderIndex, 24);
      const range = pitchRange(listGuitarTracks(score).map((track) => buildChart(at, score, track.index, 24)));
      const remix = buildRemix(RIFF_TUTORIAL.map((part) => {
        const profile = RIFF_LEVELS[part.level as Exclude<RiffLevel, 'experto'>];
        return {
          chart: reduceChart(real, profile, { follow: leaderReal ? reduceChart(leaderReal, profile, { range }) : undefined, range }),
          fromBar: part.fromBar,
          toBar: part.toBar,
          repeats: part.repeats,
        };
      }));
      setTutorialRemix(remix);
    });
  }

  // "¡A tocar!": la primera vez arranca la canción; en una parada, sigue desde el silencio.
  function playTutorial() {
    if (!tutorialRemix) return;
    void lockGameScreen();
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
    setGameMode('ensayo');
    setMuted([]);
    setClick(hasDrums ? 'nada' : 'auto');
    setFromBar(1);
    setToBar(maxBar);
  }

  const gameOptions = () => ({ speed: playSpeed, mode: playMode, loop, fromBar: Math.min(playFrom, playTo), toBar: Math.max(playFrom, playTo), freeStrings: !!profile?.freeStrings, timingScale: profile?.timingScale });

  // Un Concierto no se mezcla con otro modo: entrar o salir de él anula la partida en pausa.
  function chooseGameMode(value: RiffGameMode) {
    if (value !== gameMode && (value === 'concierto' || concert)) stopGame();
    setGameMode(value);
  }

  function start() {
    void lockGameScreen();
    setHasStarted(true);
    sessionLevelRef.current = level;
    game.start(gameOptions(), backing);
  }

  // Continuar (botón del panel o PAUSA otra vez): con los ajustes de AHORA, aunque se hayan cambiado
  // en la pausa (otra pista, otra velocidad...). En la partida de prueba, tal cual.
  function resume() {
    if (!canContinue) return;
    void lockGameScreen();
    if (tutorialRemix || !chart) {
      game.resume();
      return;
    }
    sessionLevelRef.current = level;
    game.resume({ chart, options: gameOptions(), backing });
  }

  return {
    level, chooseLevel, profile,
    tracks, trackIndex, setTrackIndex,
    chart: activeChart, loadError,
    speed: playSpeed, setSpeed,
    mode: playMode, setMode,
    gameMode, chooseGameMode, concert,
    click, setClick,
    muted, toggleMuted,
    fitsLevel,
    hostWidth,
    loop,
    fromBar: playFrom, setFromBar, toBar: playTo, setToBar, maxBar,
    previewTime,
    narrow,
    game,
    playing,
    paused,
    canContinue,
    hasStarted,
    canStart: !!chart && !narrow && !playing,
    pause: game.pause,
    resume,
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
