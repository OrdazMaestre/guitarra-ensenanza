// Motor del juego tipo Rocksmith, SIN React ni audio (todo entra por parámetros: el reloj `now` en
// segundos del AudioContext) para poder probarlo en Node con un reloj simulado. `useRiffGame` lo
// envuelve con el reloj real, el metrónomo y el estado de React.
//
// Sin descalificación. Durante la partida el mástil NO suena (se solapaba con la canción: decisión
// del usuario): lo que suena es la canción real, y acertar una nota la "abre" (sube su volumen).
// En "Con ritmo" cada nota también da PUNTOS (ver `points`); "Paso a paso" no puntúa nada.

import type { Chart, ChartNote, DrumSound, ChartBandNote } from './chart';
import { thinRepeatedBass } from './band';
import { autoDrums, type AutoDrumHit } from './autoDrums';

import { bendAutomation, type BendCurve } from '../bendCurve';
import type { ScheduledBend } from '../guitarAudioEngine';
import { isAdjacentSlide, type PracticeNoteEvent } from '../useFretboardPractice';

// La batería automática de cada chart, calculada una sola vez.
const autoDrumCache = new WeakMap<Chart, AutoDrumHit[]>();
function autoDrumsOf(chart: Chart): AutoDrumHit[] {
  let hits = autoDrumCache.get(chart);
  if (!hits) autoDrumCache.set(chart, (hits = autoDrums(chart)));
  return hits;
}

// Puntuación por nota (decisión del usuario), con márgenes en segundos REALES (también al 50 %):
// exacta ≤0,1 s = 4 "Perfecto", ≤0,2 = 3, ≤0,4 = 2; cercana (a una casilla) ≤0,2 = 1, ≤0,4 = 0,5;
// lejana o más tarde, 0. Cada nota puntúa UNA vez: una cercana se puede cambiar por la exacta
// (nunca se suman) y una pulsación solo cuenta para una nota. Todos los márgenes se recortaron
// 0,1 s el 2026-10-28 (eran 0,2 / 0,3 / 0,5; usuario: "demasiado fácil"); HIT_WINDOW_SECONDS también
// decide qué cuenta como acierto (abre el sonido de la canción).
export const PERFECT_SECONDS = 0.1;
export const GOOD_SECONDS = 0.2;
export const HIT_WINDOW_SECONDS = 0.4;
export const PERFECT_POINTS = 4;
// Compases que se retrocede al continuar tras una pausa.
export const RESUME_BARS_BACK = 2;
// Nota repetida con la pulsación MANTENIDA (ver `autoHold`): cuenta SIEMPRE, quede lo que quede
// hasta ella (decisión del usuario, 2026-11-05: el máximo es +4 y no era justo que una racha rápida
// mantenida valiera +1): +3, o +4 si llega a menos de 0,2 s REALES de la anterior.
const FAST_HOLD_SECONDS = 0.2;
export function holdPoints(gapSeconds: number): number {
  return gapSeconds < FAST_HOLD_SECONDS ? 4 : 3;
}
export const COUNT_IN_BEATS = 4;
// Volumen de las notas de fondo (la canción sonando sola en modo 'ritmo').
export const GUIDE_GAIN = 0.35;
// Volumen de los sonidos de la canción "abiertos" por un acierto.
export const OPEN_GAIN = 1;
// Tras la última nota del tramo, cuánto se deja correr antes de terminar o volver a empezar.
const END_TAIL_SECONDS = 1;

// 'ritmo': la canción avanza sola. 'paso': la canción se para en cada nota hasta tocarla.
export type RiffMode = 'ritmo' | 'paso';
export type RiffStatus = 'countin' | 'playing' | 'paused' | 'finished';
// Acompañamiento: el metrónomo (sí/no) y qué pistas de fondo están silenciadas; la batería del .gp
// es una pista más. La cuenta de entrada (4 clics) suena siempre.
export type RiffClick = 'nada' | 'metronomo' | 'auto';

export interface RiffBacking {
  // Clic de la canción aparte de la batería (que es una pista más): nada, el metrónomo en cada pulso,
  // o la batería automática hecha con los ritmos del metrónomo (autoDrums.ts).
  click: RiffClick;
  // Índices de las pistas de fondo silenciadas en "Pistas" (otra guitarra, bajo, batería).
  muted: number[];
}

// Mismo acompañamiento (para saber si al continuar una pausa hace falta una sesión nueva).
export function sameBacking(a: RiffBacking, b: RiffBacking): boolean {
  return a.click === b.click && [...a.muted].sort().join(',') === [...b.muted].sort().join(',');
}

export interface RiffOptions {
  // Velocidad de la canción (0.5 = mitad).
  speed: number;
  mode: RiffMode;
  loop: boolean;
  // Tramo a tocar, en números de compás (1 = el primero), ambos incluidos.
  fromBar: number;
  toBar: number;
  // Cuerdas libres (modo trastes): vale el traste correcto en CUALQUIER cuerda.
  freeStrings?: boolean;
  // Factor de TODOS los márgenes de tiempo (acierto y cada puntuación); 0,6 = al 60 % (Medio y
  // Avanzado trastes, ver `timingScale` en levels.ts). Por defecto 1.
  timingScale?: number;
  // Tocar el tramo N veces seguidas (partida tutorial); los puntos de cada vuelta se SUMAN. Sin
  // esto, una sola vez (o infinitas con `loop`, que en cada vuelta empieza de cero).
  repeats?: number;
  // Paradas automáticas (instantes de canción, de menor a mayor): al llegar a cada una la partida
  // se pone en pausa sola (`stoppedAtBreak`), y al continuar NO retrocede: arranca una cuenta de
  // entrada de 4 negras desde ahí (en un remix, el compás de silencio que hay en cada parada).
  breaks?: number[];
}

export interface ScheduledClick {
  // Tiempo del AudioContext en el que debe sonar.
  at: number;
  sound: DrumSound;
  volume: number;
}

// Nota de la banda ya programada (ver `takeBandNotes`).
export interface ScheduledBandNote {
  at: number;
  duration: number;
  midi: number;
  kind: 'guitar' | 'bass';
  palmMute: boolean;
  // Pista + cuerda (ChartBandNote.voice): una nota nueva en la misma corta la anterior.
  voice?: string;
  // Curva de bend ya en segundos reales (solo si la nota dobla).
  bend?: ScheduledBend;
}

export interface ScheduledGuideNote {
  palmMute: boolean;
  // id de la nota real de la canción (para poder subirle el volumen después, ver `openedBy`).
  id: number;
  at: number;
  // Duración en segundos reales.
  duration: number;
  midi: number;
  // Niveles traducidos: true si su nota traducida "dueña" ya se acertó -> sale a OPEN_GAIN.
  open: boolean;
  // Cuerda de la nota real: una nota nueva en la misma cuerda corta la anterior (ver useRiffGame).
  voice: string;
  // Curva de bend ya en segundos reales (solo si la nota dobla).
  bend?: ScheduledBend;
}

export interface JudgeResult {
  // Volumen relativo de la nota que suena en el propio mástil: 0 mientras hay partida en curso, en
  // TODOS los niveles (decisión del usuario: se solapaba con la canción); lo que suena es la canción
  // real, que un acierto "abre". En pausa o terminada, 1 (el mástil suena normal).
  gain: number;
  // Nota del chart acertada, o null.
  hit: ChartNote | null;
  // En 'paso a paso' (sin fondo): notas reales que deben sonar YA al acertar.
  playNow: { midi: number; duration: number }[];
}

type Click = { t: number; sound: DrumSound; volume: number };

export interface NoteScore {
  points: number;
  exact: boolean;
  // Tiempo de canción en el que se puntuó (la autopista enseña la etiqueta un rato desde ahí).
  at: number;
}

// Puntos de una nota según si es exacta o cercana y su desviación en segundos reales. Una cercana
// solo llega a +1 si está en la MISMA cuerda (modo cuerdas); en otra cuerda, o en el modo trastes
// (cuerdas libres), vale +½ siempre (decisión del usuario, 2026-10-30).
export function points(exact: boolean, deviation: number, sameString = true): number {
  if (exact) {
    if (deviation <= PERFECT_SECONDS + 1e-9) return PERFECT_POINTS;
    if (deviation <= GOOD_SECONDS + 1e-9) return 3;
    return deviation <= HIT_WINDOW_SECONDS + 1e-9 ? 2 : 0;
  }
  if (sameString && deviation <= GOOD_SECONDS + 1e-9) return 1;
  return deviation <= HIT_WINDOW_SECONDS + 1e-9 ? 0.5 : 0;
}

export class RiffSession {
  readonly notes: ChartNote[];
  readonly startT: number;
  readonly endT: number;
  // id de nota -> tiempo de canción en el que se acertó.
  readonly hitAt = new Map<number, number>();
  // id de nota -> puntos (solo en "Con ritmo"). Las exactas también están en `hitAt`.
  readonly scoreOf = new Map<number, NoteScore>();
  // Las últimas puntuaciones, en orden (para las etiquetas de la autopista: así no recorre todo
  // `scoreOf` en cada frame, que crecía con cada acierto). Se recorta sola.
  readonly recentScores: Array<{ id: number; score: NoteScore }> = [];
  private setScore(id: number, score: NoteScore) {
    this.scoreOf.set(id, score);
    this.recentScores.push({ id, score });
    if (this.recentScores.length > 32) this.recentScores.splice(0, this.recentScores.length - 32);
  }
  // Posición de cada nota en `notes` (por id) y fin de la última, calculados una vez.
  private readonly indexOfId = new Map<number, number>();
  private readonly lastNoteEnd: number;
  // Pulsación mantenida: clave de posición -> id de la última nota acertada con ella (ver `autoHold`).
  private readonly holdChains = new Map<string, number>();
  // Notas que ya puntuaron antes de una PAUSA y vuelven a pasar al continuar (los compases de margen):
  // no pueden volver a puntuar (petición del usuario). Las que no puntuaron sí se pueden recuperar.
  readonly locked = new Set<number>();
  songPos: number;
  status: RiffStatus = 'countin';
  // Cuántas veces se ha reiniciado el tramo en bucle (la vista lo usa para limpiar efectos).
  loopCount = 0;
  // Puntúa solo "Con ritmo" y SIN bucle: un bucle es un "modo práctica" (petición del usuario,
  // 2026-10-28; ahí se puede cambiar hasta la dificultad en mitad de la partida).
  get scoring(): boolean {
    return this.options.mode === 'ritmo' && !this.options.loop;
  }

  // Se VALORA cada nota (sus puntos salen sobre su traste) en "Con ritmo", también con bucle: en
  // modo práctica se ven los puntos de cada nota pero no se suman en ningún lado (petición del
  // usuario, 2026-10-28; ver `totalScore`).
  get rated(): boolean {
    return this.options.mode === 'ritmo';
  }

  get totalScore(): number {
    if (!this.scoring) return this.bankedScore;
    let total = this.bankedScore;
    for (const score of this.scoreOf.values()) total += score.points;
    return total;
  }

  get maxScore(): number {
    return this.notes.length * PERFECT_POINTS * this.repeats;
  }

  // Vueltas del tramo (`options.repeats`) y en cuál va (1 = la primera).
  get repeats(): number {
    return Math.max(1, this.options.repeats ?? 1);
  }

  get repetition(): number {
    return Math.min(this.repeats, this.loopCount + 1);
  }

  // Puntos de las vueltas ya terminadas (con `repeats`).
  private bankedScore = 0;

  // Parada automática en la que está esperando (1 = la primera de `options.breaks`), o null.
  stoppedAtBreak: number | null = null;
  private nextBreak = 0;

  // Instante de canción al que lleva la cuenta de entrada en curso: el inicio del tramo, o el
  // compás desde el que se continúa tras una pausa (ver `resume`).
  countInTarget: number;

  private lastReal: number;
  private readonly songClicks: Click[];
  private clickTimes: Click[];
  private nextClick = 0;
  private nextGuide = 0;
  // La banda (otras pistas: otra guitarra, bajo), solo con el acompañamiento "Batería".
  private readonly bandNotes: ChartBandNote[];
  private nextBand = 0;
  // Lo que suena de fondo: las notas reales (en niveles traducidos, `chart.sourceNotes`).
  private readonly guideNotes: ChartNote[];
  // Niveles traducidos: id de nota real -> id de la nota traducida "dueña".
  private readonly ownerOf = new Map<number, number>();
  readonly translated: boolean;

  constructor(readonly chart: Chart, readonly options: RiffOptions, now: number, readonly backing: RiffBacking) {
    const first = chart.bars.find((bar) => bar.number >= options.fromBar) ?? chart.bars[0];
    const lastIndex = findLastIndex(chart.bars, (bar) => bar.number <= options.toBar);
    const last = chart.bars[lastIndex] ?? chart.bars[chart.bars.length - 1];
    this.startT = first?.t ?? 0;
    this.endT = last?.end ?? chart.duration;
    this.notes = chart.notes.filter((note) => note.t >= this.startT - 1e-6 && note.t < this.endT - 1e-6);
    this.notes.forEach((note, index) => this.indexOfId.set(note.id, index));
    this.lastNoteEnd = this.notes.reduce((max, note) => Math.max(max, note.t + note.dur), this.startT);
    this.translated = !!chart.sourceNotes;
    this.guideNotes = (chart.sourceNotes ?? chart.notes).filter((note) => note.t >= this.startT - 1e-6 && note.t < this.endT - 1e-6);
    // El bajo, sin la misma nota repetida en semicorcheas (ver thinRepeatedBass).
    // Todas las pistas de fondo que no estén silenciadas, haya batería o no (petición del usuario,
    // 2026-11-03: antes la banda solo sonaba con el acompañamiento "Batería").
    const muted = new Set(backing.muted);
    this.bandNotes = thinRepeatedBass(
      (chart.band ?? []).filter((note) => note.t >= this.startT - 1e-6 && note.t < this.endT - 1e-6 && !(note.track !== undefined && muted.has(note.track))),
      chart,
      options.speed,
    );
    // Experto: cada nota es "dueña" de sí misma (acertarla sube su propio sonido de fondo).
    for (const note of this.notes) {
      for (const sourceId of note.sourceIds ?? [note.id]) this.ownerOf.set(sourceId, note.id);
    }

    const beatSeconds = 60 / chart.bpm;
    const inRange = (t: number) => t >= this.startT - 1e-6 && t < this.endT - 1e-6;
    // Metrónomo (si está encendido) y batería (si no está silenciada) pueden sonar a la vez.
    const drumTrack = chart.bandTracks?.find((track) => track.kind === 'drums');
    const songClicks: Click[] = [
      ...(backing.click === 'auto' ? autoDrumsOf(chart).filter((hit) => inRange(hit.t)) : []),
      ...(backing.click === 'metronomo' ? chart.beats.filter((beat) => inRange(beat.t)).map((beat) => ({ t: beat.t, sound: 'snare' as DrumSound, volume: beat.isBarStart ? 1 : 0.65 })) : []),
      ...(drumTrack && muted.has(drumTrack.index) ? [] : chart.drums.filter((hit) => inRange(hit.t)).map((hit) => ({ t: hit.t, sound: hit.sound, volume: 0.8 }))),
    ].sort((a, b) => a.t - b.t);
    this.songClicks = songClicks;
    this.countInTarget = this.startT;
    this.clickTimes = [...this.countInClicks(this.startT), ...songClicks];

    this.songPos = this.startT - COUNT_IN_BEATS * beatSeconds;
    this.lastReal = now;
  }

  // 4 clics de cuenta de entrada que acaban justo en `target` (el primero, acentuado).
  private countInClicks(target: number): Click[] {
    const beatSeconds = 60 / this.chart.bpm;
    return Array.from({ length: COUNT_IN_BEATS }, (_, i) => ({
      t: target - (COUNT_IN_BEATS - i) * beatSeconds,
      sound: 'snare' as DrumSound,
      volume: i === 0 ? 1 : 0.65,
    }));
  }

  // PAUSA: el reloj de la canción se congela hasta `resume`.
  pause(now: number): void {
    if (this.status === 'finished' || this.status === 'paused') return;
    this.advance(now);
    this.status = 'paused';
  }

  // CONTINUAR tras una pausa: retrocede DOS compases (al inicio del segundo compás anterior al de la
  // pausa, sin salirse del tramo), con cuenta de entrada (petición del usuario, 2026-10-28; antes,
  // uno). En ese margen, las notas que YA puntuaron no vuelven a contar (`locked`) y las que no
  // puntuaron se pueden recuperar.
  resume(now: number): void {
    if (this.status !== 'paused') return;
    if (this.stoppedAtBreak !== null) {
      this.continueFromBreak(now);
      return;
    }
    const bars = this.chart.bars.filter((bar) => bar.t >= this.startT - 1e-6 && bar.t < this.endT - 1e-6);
    let current = 0;
    bars.forEach((bar, i) => { if (bar.t <= this.songPos + 1e-6) current = i; });
    const target = bars[Math.max(0, current - RESUME_BARS_BACK)]?.t ?? this.startT;
    for (const note of this.notes) {
      if (note.t >= target - 1e-6 && (this.scoreOf.has(note.id) || this.hitAt.has(note.id))) this.locked.add(note.id);
    }
    this.holdChains.clear();
    this.countInTarget = target;
    this.songPos = target - COUNT_IN_BEATS * (60 / this.chart.bpm);
    this.clickTimes = [...this.countInClicks(target), ...this.songClicks.filter((click) => click.t >= target - 1e-6)];
    this.nextClick = 0;
    this.nextGuide = this.guideNotes.findIndex((note) => note.t >= target - 1e-6);
    if (this.nextGuide < 0) this.nextGuide = this.guideNotes.length;
    this.nextBand = this.bandIndexFrom(target);
    this.status = 'countin';
    this.lastReal = now;
  }

  // Continuar con OTROS ajustes (velocidad, pista, acompañamiento, ritmo, compases...; todo menos la
  // dificultad, petición del usuario): esta sesión nueva hereda la que estaba en pausa y sigue desde
  // donde se paró, dos compases antes. Con el mismo chart (otros ajustes) hereda nota a nota lo
  // acertado y lo puntuado; con otro chart (otra pista) guarda los puntos ya ganados y bloquea las
  // notas que caen en el mismo instante que una que ya puntuó. Si el punto de pausa queda fuera del
  // tramo nuevo, empieza al principio del tramo.
  continueFrom(old: RiffSession, now: number): void {
    if (!old.scoring) {
      // De una partida que no suma (bucle = modo práctica, o "Paso a paso") solo se hereda DÓNDE se
      // iba: lo acertado o valorado ahí no pasa a una partida que sí suma.
      this.bankedScore = old.bankedScore;
    } else if (old.chart === this.chart) {
      old.hitAt.forEach((t, id) => this.hitAt.set(id, t));
      old.scoreOf.forEach((score, id) => this.scoreOf.set(id, score));
      old.locked.forEach((id) => this.locked.add(id));
      this.bankedScore = old.bankedScore;
    } else {
      this.bankedScore = old.totalScore;
      const key = (t: number) => Math.round(t * 1000);
      const timeOf = new Map(old.notes.map((note) => [note.id, key(note.t)]));
      const scored = new Set([...old.scoreOf.keys(), ...old.hitAt.keys()].map((id) => timeOf.get(id)));
      const hit = new Set([...old.hitAt.keys()].map((id) => timeOf.get(id)));
      for (const note of this.notes) {
        if (scored.has(key(note.t))) this.locked.add(note.id);
        if (hit.has(key(note.t))) this.hitAt.set(note.id, note.t);
      }
    }
    const inside = old.songPos >= this.startT - 1e-6 && old.songPos < this.endT - 1e-6;
    this.songPos = inside ? old.songPos : this.startT;
    this.status = 'paused';
    this.resume(now);
  }

  // Tras una parada automática: cuenta de entrada de 4 negras desde donde se paró, sin retroceder.
  private continueFromBreak(now: number): void {
    const target = this.songPos + COUNT_IN_BEATS * (60 / this.chart.bpm);
    this.stoppedAtBreak = null;
    this.countInTarget = target;
    this.clickTimes = [...this.countInClicks(target), ...this.songClicks.filter((click) => click.t >= target - 1e-6)];
    this.nextClick = 0;
    this.nextGuide = this.guideNotes.findIndex((note) => note.t >= this.songPos - 1e-6);
    if (this.nextGuide < 0) this.nextGuide = this.guideNotes.length;
    this.nextBand = this.bandIndexFrom(this.songPos);
    this.status = 'countin';
    this.lastReal = now;
  }

  // La nota (o acorde) más temprana sin acertar: en modo 'paso' la canción se para ahí.
  private pendingTime(): number | null {
    for (const note of this.notes) {
      if (!this.hitAt.has(note.id)) return note.t;
    }
    return null;
  }

  // Avanza el reloj de la canción hasta `now`. Es idempotente: se puede llamar desde varios sitios
  // (el temporizador del metrónomo y el dibujo de la autopista) sin que el tiempo corra doble.
  advance(now: number): void {
    if (this.status === 'finished' || this.status === 'paused') {
      this.lastReal = now;
      return;
    }
    const dt = Math.max(0, now - this.lastReal);
    this.lastReal = now;
    let next = this.songPos + dt * this.options.speed;
    if (this.options.mode === 'paso') {
      const pending = this.pendingTime();
      if (pending !== null) next = Math.min(next, pending);
    }
    const stop = this.options.breaks?.[this.nextBreak];
    if (stop !== undefined && next >= stop - 1e-6) {
      this.songPos = stop;
      this.nextBreak++;
      this.stoppedAtBreak = this.nextBreak;
      this.status = 'paused';
      return;
    }
    this.songPos = next;
    this.status = this.songPos >= this.countInTarget ? 'playing' : 'countin';

    const finishAt = Math.max(this.endT, this.lastNoteEnd) + END_TAIL_SECONDS;
    if (this.songPos >= finishAt) {
      if (this.options.loop) {
        this.restart(now);
      } else if (this.loopCount + 1 < this.repeats) {
        this.bankedScore = this.totalScore;
        this.restart(now);
      } else {
        this.status = 'finished';
      }
    }
  }

  private restart(now: number) {
    this.nextBreak = 0;
    this.stoppedAtBreak = null;
    this.hitAt.clear();
    this.scoreOf.clear();
    this.recentScores.length = 0;
    this.locked.clear();
    this.holdChains.clear();
    this.songPos = this.startT - COUNT_IN_BEATS * (60 / this.chart.bpm);
    this.status = 'countin';
    this.countInTarget = this.startT;
    this.clickTimes = [...this.countInClicks(this.startT), ...this.songClicks];
    this.nextClick = 0;
    this.nextGuide = 0;
    this.nextBand = 0;
    this.lastReal = now;
    this.loopCount++;
  }

  // Clics del metrónomo que caen entre ahora y `now + lookahead` (segundos reales), con su hora
  // exacta del AudioContext. En modo 'paso' no se programan clics más allá de donde está parada.
  takeClicks(now: number, lookahead: number): ScheduledClick[] {
    if (this.status === 'finished' || this.status === 'paused') return [];
    const out: ScheduledClick[] = [];
    const horizon = this.songPos + lookahead * this.options.speed;
    const pending = this.options.mode === 'paso' ? this.pendingTime() : null;
    while (this.nextClick < this.clickTimes.length) {
      const click = this.clickTimes[this.nextClick];
      if (click.t > horizon) break;
      if (pending !== null && click.t > pending + 1e-6) break;
      if (click.t >= this.songPos - 0.05) {
        out.push({ at: now + Math.max(0, click.t - this.songPos) / this.options.speed, sound: click.sound, volume: click.volume });
      }
      this.nextClick++;
    }
    return out;
  }

  // Notas de fondo: en modo 'ritmo' la canción suena sola (bajito, GUIDE_GAIN), se toque o no.
  // En 'paso' no, porque la canción se para a esperar al alumno. En niveles traducidos son las
  // notas REALES, y salen ya "abiertas" (OPEN_GAIN) si su nota traducida dueña se acertó.
  takeGuideNotes(now: number, lookahead: number): ScheduledGuideNote[] {
    if (this.status === 'finished' || this.status === 'paused' || this.options.mode !== 'ritmo') return [];
    const out: ScheduledGuideNote[] = [];
    const horizon = this.songPos + lookahead * this.options.speed;
    while (this.nextGuide < this.guideNotes.length) {
      const note = this.guideNotes[this.nextGuide];
      if (note.t > horizon) break;
      if (note.t >= this.songPos - 0.05) {
        const owner = this.ownerOf.get(note.id);
        out.push({
          id: note.id,
          at: now + Math.max(0, note.t - this.songPos) / this.options.speed,
          duration: note.dur / this.options.speed,
          midi: this.soundingMidi(note),
          open: owner !== undefined && this.hitAt.has(owner),
          palmMute: note.palmMute,
          voice: `own/${note.string}`,
          ...this.scheduledBend(note.bend, note.t),
        });
      }
      this.nextGuide++;
    }
    return out;
  }

  private bandIndexFrom(t: number): number {
    const index = this.bandNotes.findIndex((note) => note.t >= t - 1e-6);
    return index < 0 ? this.bandNotes.length : index;
  }

  // La banda (petición del usuario: las otras pistas suenan de fondo "como la batería"): con el
  // acompañamiento "Batería" y en "Con ritmo" (en "Paso a paso" la canción espera, igual que las
  // notas de fondo). Siempre al mismo volumen: no depende de acertar.
  takeBandNotes(now: number, lookahead: number): ScheduledBandNote[] {
    if (this.status === 'finished' || this.status === 'paused' || this.options.mode !== 'ritmo') return [];
    const out: ScheduledBandNote[] = [];
    const horizon = this.songPos + lookahead * this.options.speed;
    while (this.nextBand < this.bandNotes.length) {
      const note = this.bandNotes[this.nextBand];
      if (note.t > horizon) break;
      if (note.t >= this.songPos - 0.05) {
        out.push({
          at: now + Math.max(0, note.t - this.songPos) / this.options.speed,
          duration: note.dur / this.options.speed,
          midi: note.midi,
          kind: note.kind,
          palmMute: note.palmMute,
          voice: note.voice,
          ...this.scheduledBend(note.bend, note.t),
        });
      }
      this.nextBand++;
    }
    return out;
  }

  // ¿La nota tocada es la del chart? Misma cuerda y traste; con cuerdas libres, solo el traste.
  private matches(note: ChartNote, event: PracticeNoteEvent): boolean {
    return note.fret === event.fret && (!!this.options.freeStrings || note.string === event.string);
  }

  // ¿A UNA casilla? Con cuerdas libres: el traste de al lado (cualquier cuerda). Si no, la misma
  // rejilla que los slides: misma cuerda ±1 traste, o cuerda vecina en el mismo traste.
  private isNear(note: ChartNote, event: PracticeNoteEvent): boolean {
    if (this.options.freeStrings) return Math.abs(note.fret - event.fret) === 1;
    return isAdjacentSlide(note, event);
  }

  // La nota sin acertar más cercana en el tiempo (dentro de la ventana) que cumple `accept`.
  private closest(window: number, accept: (note: ChartNote) => boolean): ChartNote | null {
    let best: ChartNote | null = null;
    // Desde la primera nota dentro de la ventana (búsqueda binaria), no desde el principio.
    let lo = 0;
    let hi = this.notes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.notes[mid].t < this.songPos - window) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (note.t > this.songPos + window) break;
      if (this.hitAt.has(note.id) || this.locked.has(note.id) || Math.abs(note.t - this.songPos) > window || !accept(note)) continue;
      if (!best || Math.abs(note.t - this.songPos) < Math.abs(best.t - this.songPos)) best = note;
    }
    return best;
  }

  // ids de las notas reales que "abre" acertar la nota traducida `chartNoteId`.
  openedBy(chartNoteId: number): number[] {
    const index = this.indexOfId.get(chartNoteId);
    const note = index === undefined ? undefined : this.notes[index];
    return note ? note.sourceIds ?? [note.id] : [];
  }

  // Juzga una nota que acaba de tocar el alumno. Experto: devuelve el volumen de SU nota (normal si
  // acierta, bajito si no). Niveles traducidos: su nota no suena (gain 0); un acierto abre la
  // canción real y un fallo suena a "clac". Los slides solo cuentan si son a una nota pegada.
  judge(event: PracticeNoteEvent, now: number): JudgeResult {
    this.advance(now);
    const miss: JudgeResult = { gain: 0, hit: null, playNow: [] };
    // En pausa (o terminada) el mástil suena normal y no se juzga nada.
    if (this.status === 'finished' || this.status === 'paused') return { gain: 1, hit: null, playNow: [] };
    if (event.kind === 'slide' && (!event.from || !isAdjacentSlide(event.from, event))) return miss;

    // Con `timingScale` se encogen todos los márgenes a la vez: la ventana de acierto y, al medir la
    // desviación en "márgenes normales", cada escalón de puntos (4/3/2, 1/½).
    const scale = this.options.timingScale ?? 1;
    const window = HIT_WINDOW_SECONDS * scale * this.options.speed;
    const deviation = (note: ChartNote) => Math.abs(note.t - this.songPos) / this.options.speed / scale;
    // La exacta tiene prioridad (y puede cambiar una cercana ya puntuada por sus puntos).
    let best = this.closest(window, (note) => this.matches(note, event));
    if (!best && this.rated) {
      // Cercana: solo puntos (no abre el sonido), y solo en una nota aún sin puntuar.
      const near = this.closest(window, (note) => !this.scoreOf.has(note.id) && this.isNear(note, event));
      if (near) {
        const sameString = !this.options.freeStrings && near.string === event.string;
        this.setScore(near.id, { points: points(false, deviation(near), sameString), exact: false, at: this.songPos });
      }
      return miss;
    }
    // Paso a paso no exige ritmo: la siguiente nota pendiente (o acorde) vale aunque se toque antes
    // de que la canción llegue a ella; la canción salta hasta ahí.
    if (!best && this.options.mode === 'paso') {
      const pending = this.pendingTime();
      best = this.notes.find((note) => pending !== null && Math.abs(note.t - pending) < 0.005 && !this.hitAt.has(note.id)
        && this.matches(note, event)) ?? null;
      if (best) this.songPos = Math.max(this.songPos, best.t);
    }
    if (!best) return miss;
    if (this.rated) this.setScore(best.id, { points: points(true, deviation(best)), exact: true, at: this.songPos });
    this.hitAt.set(best.id, this.songPos);
    this.holdChains.set(this.holdKey(best), best.id);
    return { gain: 0, hit: best, playNow: this.playNowFor(best) };
  }

  private soundingMidi(note: ChartNote): number {
    return note.midi + (this.chart.soundOffset ?? 0) + (note.soundShift ?? 0);
  }

  // Se toca el bajo: sus notas de fondo van con el sintetizador de bajo.
  get bass(): boolean {
    return !!this.chart.bass;
  }

  // Sin fondo ('paso'), un acierto hace sonar ya las notas reales de su golpe.
  playNowFor(hit: ChartNote): { midi: number; palmMute: boolean; duration: number; bend?: ScheduledBend }[] {
    if (this.options.mode !== 'paso') return [];
    return this.guideNotes
      .filter((note) => Math.abs(note.t - hit.t) < 0.005)
      .map((note) => ({
        midi: this.soundingMidi(note),
        palmMute: note.palmMute,
        duration: Math.max(0.15, note.dur / this.options.speed),
        ...this.scheduledBend(note.bend, note.t, 0),
      }));
  }

  // Curva de bend de una nota de fondo en segundos REALES (a la velocidad de la partida). Si la nota se
  // programa tarde (la canción ya pasó su `t`), la curva arranca igual de adelantada. Objeto vacío si
  // no dobla, para que las notas sin bend no cambien de forma (ver "Bends y ligaduras" en NOTES).
  private scheduledBend(curve: BendCurve | undefined, t: number, lateSeconds?: number): { bend?: ScheduledBend } {
    if (!curve) return {};
    const automation = bendAutomation(curve, 1 / this.options.speed, this.options.speed);
    if (automation.length === 0) return {};
    const offset = lateSeconds ?? Math.max(0, this.songPos - t) / this.options.speed;
    return { bend: { automation, offset } };
  }

  // Posición de una nota para las pulsaciones mantenidas (con cuerdas libres, solo el traste).
  private holdKey(note: { string: number; fret: number }): string {
    return this.options.freeStrings ? `f${note.fret}` : `${note.string}/${note.fret}`;
  }

  // Notas repetidas con la pulsación MANTENIDA (decisión del usuario): mientras el alumno sigue
  // pulsando la posición con la que acertó una nota, la siguiente nota del chart en esa MISMA
  // posición cuenta sola al llegar su momento (puntos según el hueco: `holdPoints`), sin límite de
  // distancia, si no hay otra nota por medio (en su cuerda; con cuerdas libres, ninguna). Así se toca, p. ej., el compás
  // 42 de Master of Puppets (9 Mi al aire rapidísimos) manteniendo el traste 0. Soltar corta la
  // cadena. `held` = posiciones que suenan ahora en el mástil. Devuelve las notas acertadas así.
  autoHold(held: { string: number; fret: number }[]): ChartNote[] {
    if (this.status !== 'playing' && this.status !== 'countin') return [];
    const heldKeys = new Set(held.map((pos) => this.holdKey(pos)));
    const out: ChartNote[] = [];
    for (const [key, lastId] of [...this.holdChains]) {
      if (!heldKeys.has(key)) {
        this.holdChains.delete(key);
        continue;
      }
      let index = this.indexOfId.get(lastId) ?? -1;
      while (index >= 0) {
        const prev = this.notes[index];
        let nextIndex = -1;
        for (let i = index + 1; i < this.notes.length; i++) {
          const note = this.notes[i];
          if (note.t < prev.t + 0.005) continue;
          if (this.holdKey(note) === key) { nextIndex = i; break; }
          // Otra nota por medio (en su cuerda, o cualquiera con cuerdas libres): se corta.
          if (this.options.freeStrings || note.string === prev.string) break;
        }
        const next = this.notes[nextIndex];
        if (!next || next.t > this.songPos + 1e-6 || this.hitAt.has(next.id) || this.locked.has(next.id)) break;
        this.hitAt.set(next.id, this.songPos);
        const points = holdPoints((next.t - prev.t) / this.options.speed);
        if (this.rated) this.setScore(next.id, { points, exact: true, at: this.songPos });
        this.holdChains.set(key, next.id);
        out.push(next);
        index = nextIndex;
      }
    }
    return out;
  }
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let i = items.length - 1; i >= 0; i--) {
    if (predicate(items[i])) return i;
  }
  return -1;
}
