// Motor del juego tipo Rocksmith, SIN React ni audio (todo entra por parámetros: el reloj `now` en
// segundos del AudioContext) para poder probarlo en Node con un reloj simulado. `useRiffGame` lo
// envuelve con el reloj real, el metrónomo y el estado de React.
//
// De momento no hay puntos ni descalificación (petición explícita): cada nota que toca el alumno
// se juzga solo para decidir su VOLUMEN -- acertada a tiempo (misma cuerda y traste, ±0,3 s) suena
// normal; cualquier otra cosa suena bajito.

import type { Chart, ChartNote, DrumSound } from './chart';
import { isAdjacentSlide, type PracticeNoteEvent } from '../useFretboardPractice';

export const HIT_WINDOW_SECONDS = 0.3;
export const HIT_GAIN = 1;
export const MISS_GAIN = 0.25;
export const COUNT_IN_BEATS = 4;
// Volumen de las notas de fondo (la canción sonando sola en modo 'ritmo').
export const GUIDE_GAIN = 0.35;
// Niveles traducidos: volumen de los sonidos de la canción "abiertos" por un acierto.
export const OPEN_GAIN = 1;
// Tras la última nota del tramo, cuánto se deja correr antes de terminar o volver a empezar.
const END_TAIL_SECONDS = 1;

// 'ritmo': la canción avanza sola. 'paso': la canción se para en cada nota hasta tocarla.
export type RiffMode = 'ritmo' | 'paso';
export type RiffStatus = 'countin' | 'playing' | 'paused' | 'finished';
// Acompañamiento: clic de metrónomo en cada pulso, la batería del propio .gp, o nada. La cuenta de
// entrada (4 clics) suena siempre.
export type RiffBacking = 'metronomo' | 'bateria' | 'nada';

export interface RiffOptions {
  // Velocidad de la canción (0.5 = mitad).
  speed: number;
  mode: RiffMode;
  loop: boolean;
  // Tramo a tocar, en números de compás (1 = el primero), ambos incluidos.
  fromBar: number;
  toBar: number;
}

export interface ScheduledClick {
  // Tiempo del AudioContext en el que debe sonar.
  at: number;
  sound: DrumSound;
  volume: number;
}

export interface ScheduledGuideNote {
  // id de la nota real de la canción (para poder subirle el volumen después, ver `openedBy`).
  id: number;
  at: number;
  // Duración en segundos reales.
  duration: number;
  midi: number;
  // Niveles traducidos: true si su nota traducida "dueña" ya se acertó -> sale a OPEN_GAIN.
  open: boolean;
}

export interface JudgeResult {
  // Volumen relativo de la nota que suena en el propio mástil (0 en niveles traducidos: allí lo
  // que suena es la canción real).
  gain: number;
  // Nota del chart acertada, o null.
  hit: ChartNote | null;
  // Niveles traducidos: tocar algo incorrecto suena a "clac" apagado, sin afinación.
  deadNote: boolean;
  // Niveles traducidos en 'paso a paso' (sin fondo): notas reales que deben sonar YA al acertar.
  playNow: { midi: number; duration: number }[];
}

type Click = { t: number; sound: DrumSound; volume: number };

export class RiffSession {
  readonly notes: ChartNote[];
  readonly startT: number;
  readonly endT: number;
  // id de nota -> tiempo de canción en el que se acertó.
  readonly hitAt = new Map<number, number>();
  songPos: number;
  status: RiffStatus = 'countin';
  // Cuántas veces se ha reiniciado el tramo en bucle (la vista lo usa para limpiar efectos).
  loopCount = 0;
  // Instante de canción al que lleva la cuenta de entrada en curso: el inicio del tramo, o el
  // compás desde el que se continúa tras una pausa (ver `resume`).
  countInTarget: number;

  private lastReal: number;
  private readonly songClicks: Click[];
  private clickTimes: Click[];
  private nextClick = 0;
  private nextGuide = 0;
  // Lo que suena de fondo: las notas reales (en niveles traducidos, `chart.sourceNotes`).
  private readonly guideNotes: ChartNote[];
  // Niveles traducidos: id de nota real -> id de la nota traducida "dueña".
  private readonly ownerOf = new Map<number, number>();
  readonly translated: boolean;

  constructor(readonly chart: Chart, readonly options: RiffOptions, now: number, backing: RiffBacking) {
    const first = chart.bars.find((bar) => bar.number >= options.fromBar) ?? chart.bars[0];
    const lastIndex = findLastIndex(chart.bars, (bar) => bar.number <= options.toBar);
    const last = chart.bars[lastIndex] ?? chart.bars[chart.bars.length - 1];
    this.startT = first?.t ?? 0;
    this.endT = last?.end ?? chart.duration;
    this.notes = chart.notes.filter((note) => note.t >= this.startT - 1e-6 && note.t < this.endT - 1e-6);
    this.translated = !!chart.sourceNotes;
    this.guideNotes = (chart.sourceNotes ?? chart.notes).filter((note) => note.t >= this.startT - 1e-6 && note.t < this.endT - 1e-6);
    for (const note of this.notes) {
      for (const sourceId of note.sourceIds ?? []) this.ownerOf.set(sourceId, note.id);
    }

    const beatSeconds = 60 / chart.bpm;
    const inRange = (t: number) => t >= this.startT - 1e-6 && t < this.endT - 1e-6;
    let songClicks: Click[] = [];
    if (backing === 'metronomo') {
      songClicks = chart.beats.filter((beat) => inRange(beat.t)).map((beat) => ({ t: beat.t, sound: 'snare', volume: beat.isBarStart ? 1 : 0.65 }));
    } else if (backing === 'bateria') {
      songClicks = chart.drums.filter((hit) => inRange(hit.t)).map((hit) => ({ t: hit.t, sound: hit.sound, volume: 0.8 }));
    }
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

  // CONTINUAR tras una pausa: retrocede UN compás (al inicio del compás anterior al de la pausa,
  // sin salirse del tramo), con cuenta de entrada. Las notas desde ahí vuelven a estar por tocar.
  resume(now: number): void {
    if (this.status !== 'paused') return;
    const bars = this.chart.bars.filter((bar) => bar.t >= this.startT - 1e-6 && bar.t < this.endT - 1e-6);
    let current = 0;
    bars.forEach((bar, i) => { if (bar.t <= this.songPos + 1e-6) current = i; });
    const target = bars[Math.max(0, current - 1)]?.t ?? this.startT;
    for (const note of this.notes) {
      if (note.t >= target - 1e-6) this.hitAt.delete(note.id);
    }
    this.countInTarget = target;
    this.songPos = target - COUNT_IN_BEATS * (60 / this.chart.bpm);
    this.clickTimes = [...this.countInClicks(target), ...this.songClicks.filter((click) => click.t >= target - 1e-6)];
    this.nextClick = 0;
    this.nextGuide = this.guideNotes.findIndex((note) => note.t >= target - 1e-6);
    if (this.nextGuide < 0) this.nextGuide = this.guideNotes.length;
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
    this.songPos = next;
    this.status = this.songPos >= this.countInTarget ? 'playing' : 'countin';

    const lastNoteEnd = this.notes.reduce((max, note) => Math.max(max, note.t + note.dur), this.startT);
    const finishAt = Math.max(this.endT, lastNoteEnd) + END_TAIL_SECONDS;
    if (this.songPos >= finishAt) {
      if (this.options.loop) {
        this.restart(now);
      } else {
        this.status = 'finished';
      }
    }
  }

  private restart(now: number) {
    this.hitAt.clear();
    this.songPos = this.startT - COUNT_IN_BEATS * (60 / this.chart.bpm);
    this.status = 'countin';
    this.countInTarget = this.startT;
    this.clickTimes = [...this.countInClicks(this.startT), ...this.songClicks];
    this.nextClick = 0;
    this.nextGuide = 0;
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
          midi: note.midi,
          open: owner !== undefined && this.hitAt.has(owner),
        });
      }
      this.nextGuide++;
    }
    return out;
  }

  // ids de las notas reales que "abre" acertar la nota traducida `chartNoteId`.
  openedBy(chartNoteId: number): number[] {
    return this.notes.find((note) => note.id === chartNoteId)?.sourceIds ?? [];
  }

  // Juzga una nota que acaba de tocar el alumno. Experto: devuelve el volumen de SU nota (normal si
  // acierta, bajito si no). Niveles traducidos: su nota no suena (gain 0); un acierto abre la
  // canción real y un fallo suena a "clac". Los slides solo cuentan si son a una nota pegada.
  judge(event: PracticeNoteEvent, now: number): JudgeResult {
    this.advance(now);
    const miss: JudgeResult = { gain: this.translated ? 0 : MISS_GAIN, hit: null, deadNote: this.translated, playNow: [] };
    // En pausa (o terminada) el mástil suena normal y no se juzga nada.
    if (this.status === 'finished' || this.status === 'paused') return { gain: 1, hit: null, deadNote: false, playNow: [] };
    if (event.kind === 'slide' && (!event.from || !isAdjacentSlide(event.from, event))) return miss;

    const window = HIT_WINDOW_SECONDS * this.options.speed;
    let best: ChartNote | null = null;
    for (const note of this.notes) {
      if (note.t > this.songPos + window) break;
      if (this.hitAt.has(note.id) || note.string !== event.string || note.fret !== event.fret) continue;
      if (Math.abs(note.t - this.songPos) > window) continue;
      if (!best || Math.abs(note.t - this.songPos) < Math.abs(best.t - this.songPos)) best = note;
    }
    // Paso a paso no exige ritmo: la siguiente nota pendiente (o acorde) vale aunque se toque antes
    // de que la canción llegue a ella; la canción salta hasta ahí.
    if (!best && this.options.mode === 'paso') {
      const pending = this.pendingTime();
      best = this.notes.find((note) => pending !== null && Math.abs(note.t - pending) < 0.005 && !this.hitAt.has(note.id)
        && note.string === event.string && note.fret === event.fret) ?? null;
      if (best) this.songPos = Math.max(this.songPos, best.t);
    }
    if (!best) return miss;
    this.hitAt.set(best.id, this.songPos);
    const hitNote = best;
    // Sin fondo ('paso'), el acierto hace sonar ya las notas reales de su golpe.
    const playNow = this.translated && this.options.mode === 'paso'
      ? this.guideNotes
        .filter((note) => Math.abs(note.t - hitNote.t) < 0.005)
        .map((note) => ({ midi: note.midi, duration: Math.max(0.15, note.dur / this.options.speed) }))
      : [];
    return { gain: this.translated ? 0 : HIT_GAIN, hit: hitNote, deadNote: false, playNow };
  }
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let i = items.length - 1; i >= 0; i--) {
    if (predicate(items[i])) return i;
  }
  return -1;
}
