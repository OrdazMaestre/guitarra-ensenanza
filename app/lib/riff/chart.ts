// "Chart" del juego tipo Rocksmith: la lista de notas de UNA pista de guitarra de un .gp, con su
// tiempo real en segundos (respeta tempo, cambios de tempo y repeticiones). Lo construye el propio
// alphaTab (ya instalado) -- `ScoreLoader` para leer el archivo y `MidiFileGenerator`/tickLookup
// para el orden REAL de reproducción (compases repetidos incluidos). Mismas convenciones que
// AlphaTabPlayer.tsx (cuerda = 7 - note.string, sin notas muertas ni silencios, las ligaduras no
// son notas nuevas), pero sin tocar ese componente.
//
// `buildChart` es pura (recibe el módulo de alphaTab y el Score) para poder probarla en Node; el
// navegador usa `loadChart`, que hace el import dinámico y el fetch.

import type * as AlphaTab from '@coderline/alphatab';
import { relocatePassages } from './relocate';
import { buildBendCurve, type BendCurve, type BendNoteLike } from '../bendCurve';

type AlphaTabModule = typeof AlphaTab;
type Score = AlphaTab.model.Score;
type Note = AlphaTab.model.Note;

export type ChartTech = 'hammer' | 'pull' | 'slide' | 'bend';

export interface ChartNote {
  id: number;
  // Segundos desde el principio de la canción.
  t: number;
  // Duración en segundos (incluye las notas ligadas).
  dur: number;
  string: number;
  fret: number;
  // Altura de la nota en su posición con el mástil en afinación ESTÁNDAR (la del mástil del juego).
  // Con una pista afinada más grave (todas las cuerdas igual, p. ej. Do#), lo que SUENA es
  // `midi + chart.soundOffset`.
  midi: number;
  palmMute: boolean;
  tech: ChartTech[];
  // Curva de bend de la nota que SUENA (cadena ligada incluida), en segundos de canción a velocidad
  // 1 desde `t` (ver app/lib/bendCurve.ts). Solo se oye: la puntuación va por traste pisado.
  bend?: BendCurve;
  // Si la nota original no cabía en el mástil (traste > maxFret) y se recolocó: 'string' = misma
  // altura en una cuerda más aguda; 'octave' = una octava más grave.
  moved?: 'string' | 'octave';
  // Semitonos que hay que sumar al SONAR además de `chart.soundOffset`: una nota de una cuerda extra
  // subida de octava para caber en los niveles (ver `foldToStandard`) sigue sonando en su altura real.
  soundShift?: number;
  // Solo en charts TRADUCIDOS (todos los niveles menos Experto, ver reduce.ts): ids de las notas de
  // la canción original (`Chart.sourceNotes`) que "son de" esta nota -- desde su golpe hasta la
  // siguiente nota traducida -- y la frase a la que pertenece.
  sourceIds?: number[];
  phrase?: number;
}

export interface ChartBar {
  // Número de compás tal como se ve en la partitura (1, 2, 3...). Con repeticiones, un mismo
  // número puede aparecer varias veces en `bars`, en orden de reproducción.
  number: number;
  // Compás de la partitura ([numerador, denominador]): con los pulsos solos, un 3/4 y un 6/8 son
  // iguales (3 negras). Lo usa la batería automática (autoDrums.ts).
  timeSig?: [number, number];
  t: number;
  end: number;
}

export type DrumSound = 'kick' | 'snare' | 'cymbal';

export interface ChartDrumHit {
  t: number;
  sound: DrumSound;
}

// Una línea por NEGRA (no por la figura del denominador: en un 21/32 eso daría 21 "pulsos"
// diminutos por compás). `q` = posición exacta en negras desde el principio, para que las
// rejillas de los niveles traducidos (reduce.ts) funcionen también en compases irregulares.
export interface ChartBeat {
  t: number;
  q: number;
  isBarStart: boolean;
}

// Nota de la BANDA: las demás pistas con altura (la otra guitarra, el bajo...), que suenan de fondo
// con el acompañamiento "Batería" (petición del usuario: "como la batería"). Solo se oyen, no se tocan.
export interface ChartBandNote {
  t: number;
  dur: number;
  midi: number;
  kind: 'guitar' | 'bass';
  palmMute: boolean;
  // Índice de su pista en el archivo (para silenciarla desde "Pistas").
  track?: number;
  // Pista + cuerda ("2/5"): en una guitarra de verdad, una nota nueva en la misma cuerda corta la
  // anterior. El juego hace lo mismo con el sonido de fondo (ver useRiffGame) para no amontonar notas.
  voice?: string;
  // Igual que ChartNote.bend.
  bend?: BendCurve;
}

export interface ChartBandTrack {
  index: number;
  name: string;
  kind: 'guitar' | 'bass' | 'drums';
}

export interface Chart {
  trackName: string;
  bpm: number;
  duration: number;
  notes: ChartNote[];
  bars: ChartBar[];
  beats: ChartBeat[];
  // Solo en charts traducidos: las notas reales de la canción (lo que suena de fondo).
  sourceNotes?: ChartNote[];
  // Golpes de la primera pista de batería del archivo (vacío si no tiene).
  drums: ChartDrumHit[];
  // Notas de las demás pistas con altura (ver ChartBandNote), ordenadas por tiempo.
  band?: ChartBandNote[];
  // Las pistas que suenan de fondo (las demás guitarras, el bajo y la batería), para silenciarlas
  // una a una desde "Pistas". La batería es la de `drums`.
  bandTracks?: ChartBandTrack[];
  // Semitonos entre la afinación de la pista y la estándar cuando todas sus cuerdas están bajadas
  // (o subidas) lo mismo: -3 en Do#, -1 en Mi♭. Las notas del chart van en posiciones/alturas de la
  // afinación estándar (el mástil del juego y los niveles traducidos razonan sobre él); al SONAR se
  // suma esto, para que la canción suene en su tono real. Sin él (o afinaciones mixtas), 0.
  soundOffset?: number;
  // La pista es un bajo: sus notas van una octava por encima de lo que suena (`soundOffset` lo
  // compensa) para leerse en las cuerdas 6-3 del mástil, y suena con el sintetizador de bajo.
  bass?: boolean;
  // Solo en Experto, cuando el instrumento no tiene las 6 cuerdas de siempre: sus cuerdas, de la más
  // grave a la más aguda (ver `gameStrings`). El mástil del juego dibuja justo esas.
  strings?: number[];
  // Notas que pasaban de `maxFret` y se recolocaron (ver `relocate`).
  movedAboveMaxFret: number;
  // Notas que pasaban de `maxFret` y no había forma de recolocar (se quitan).
  skippedAboveMaxFret: number;
}

export interface GuitarTrackInfo {
  index: number;
  name: string;
  kind?: 'guitar' | 'bass';
}

// Bajo: su cuerda más aguda queda por debajo de un Sol3. (No vale mirar la más grave: una guitarra
// de 8 cuerdas baja hasta un Fa#1. Las guitarras llegan como poco al Si3 de una barítono.)
export function isBassTuning(tuning: number[]): boolean {
  return tuning.length > 0 && Math.max(...tuning) < 55;
}

function pitchedTracks(score: Score) {
  return score.tracks
    .map((track, index) => ({ index, name: track.name, staff: track.staves[0] }))
    .filter(({ staff }) => staff && !staff.isPercussion);
}

// Guitarras de 6 cuerdas o más.
export function listGuitarTracks(score: Score): GuitarTrackInfo[] {
  return pitchedTracks(score)
    .filter(({ staff }) => staff.tuning.length >= 6 && !isBassTuning(staff.tuning))
    .map(({ index, name }) => ({ index, name, kind: 'guitar' as const }));
}

// Todo lo que se puede jugar: las guitarras primero (la pista inicial sigue siendo una guitarra) y
// luego los bajos de 4 cuerdas o más.
export function listPlayableTracks(score: Score): GuitarTrackInfo[] {
  const basses = pitchedTracks(score)
    .filter(({ staff }) => staff.tuning.length >= 4 && isBassTuning(staff.tuning))
    .map(({ index, name }) => ({ index, name, kind: 'bass' as const }));
  return [...listGuitarTracks(score), ...basses];
}

// Cuerdas al aire de la afinación estándar, de la 1 (Mi agudo) a la 6.
const STANDARD_TUNING = [64, 59, 55, 50, 45, 40];
const OPEN_E = STANDARD_TUNING[5];
const ALL_STRINGS = [6, 5, 4, 3, 2, 1];
const BASS_STRINGS = [6, 5, 4, 3];
const BASS_OCTAVE = -12;

// Cuerda del juego de cada cuerda al aire de `tuning` (que va de aguda a grave). Una sola regla, por
// altura (petición del usuario, 2026-11-04): la 6 es SIEMPRE la del Mi grave. Hacia arriba 5, 4, 3, 2,
// 1; hacia abajo 7, 8... Guitarra de 7: 7..1. Bajo de 4: 6..3. Bajo de 5: 7..3 (con Si grave) o 6..2
// (con Do agudo). Bajo de 6: 7..2.
export function gameStrings(tuning: number[]): number[] {
  const count = tuning.length;
  const highC = count > 4 && Math.max(...tuning) >= 46 ? 1 : 0;
  const lowest = isBassTuning(tuning) ? 6 + Math.max(0, count - 4 - highC) : Math.max(6, count);
  return tuning.map((_, k) => lowest - (count - 1 - k));
}

// Los niveles (todos menos Experto) solo conocen las cuerdas 1-6 de la guitarra y las 3-6 del bajo. Una
// nota de una cuerda extra pasa a la vecina que sí existe: las graves, a su misma altura en la 6 (u
// octavas arriba, si no llega: `soundShift` la deja sonando donde estaba); la Do del bajo, en la 3.
function foldToStandard(notes: ChartNote[], bass: boolean) {
  for (const note of notes) {
    if (note.string > 6) {
      let shift = 0;
      while (note.midi + shift < OPEN_E) shift += 12;
      note.string = 6;
      note.midi += shift;
      note.fret = note.midi - OPEN_E;
      if (shift) note.soundShift = -shift;
    } else if (bass && note.string < 3) {
      note.string = 3;
      note.fret = note.midi - STANDARD_TUNING[2];
    }
  }
}

// Curva de bend de una nota y su cadena ligada, en segundos. Cada nota de la cadena dura su parte
// proporcional en ticks del total (`durTicks` -> `durSeconds`).
function chainBend(note: Note, durTicks: number, durSeconds: number): BendCurve | null {
  if (durTicks <= 0) return null;
  const secondsPerTick = durSeconds / durTicks;
  return buildBendCurve(note as unknown as BendNoteLike, (chainNote) => ((chainNote as unknown as Note).beat?.playbackDuration ?? 0) * secondsPerTick);
}

// `fold`: para traducirlo a un nivel (ver `foldToStandard`). Sin él, Experto: todas las cuerdas.
export function buildChart(at: AlphaTabModule, score: Score, trackIndex: number, maxFret = 24, { fold = false }: { fold?: boolean } = {}): Chart {
  const track = score.tracks[trackIndex];
  if (!track) throw new Error(`La pista ${trackIndex} no existe`);
  const staff = track.staves[0];

  const midiFile = new at.midi.MidiFile();
  const generator = new at.midi.MidiFileGenerator(score, new at.Settings(), new at.midi.AlphaSynthMidiFileHandler(midiFile));
  generator.generate();
  const lookups = generator.tickLookup.masterBars;

  // Mapa de tempo: tramos [tick, bpm] en orden. tickToSec acumula los segundos de cada tramo.
  const tempoPoints: { tick: number; bpm: number }[] = [];
  for (const lookup of lookups) {
    if (lookup.tempoChanges.length === 0) {
      tempoPoints.push({ tick: lookup.start, bpm: lookup.tempo });
    }
    for (const change of lookup.tempoChanges) {
      tempoPoints.push({ tick: change.tick, bpm: change.tempo });
    }
  }
  tempoPoints.sort((a, b) => a.tick - b.tick);
  // alphaTab usa 960 ticks por negra (MidiUtils.QuarterTime, no exportado en los tipos).
  const ppq = 960;
  const segStartSec: number[] = [];
  let acc = 0;
  for (let i = 0; i < tempoPoints.length; i++) {
    segStartSec.push(acc);
    const next = tempoPoints[i + 1];
    if (next) acc += ((next.tick - tempoPoints[i].tick) / ppq) * (60 / tempoPoints[i].bpm);
  }
  const tickToSec = (tick: number) => {
    let i = 0;
    while (i + 1 < tempoPoints.length && tempoPoints[i + 1].tick <= tick) i++;
    const point = tempoPoints[i] ?? { tick: 0, bpm: score.tempo };
    return (segStartSec[i] ?? 0) + ((tick - point.tick) / ppq) * (60 / point.bpm);
  };

  const notes: ChartNote[] = [];
  const bars: ChartBar[] = [];
  const beats: ChartBeat[] = [];
  const drums: ChartDrumHit[] = [];
  const drumTrack = score.tracks.find((candidate) => candidate.staves[0]?.isPercussion);
  // La banda: todas las pistas con altura menos la que se toca.
  const band: ChartBandNote[] = [];
  const bandTracks = score.tracks
    .filter((candidate, index) => index !== trackIndex && candidate.staves[0] && !candidate.staves[0].isPercussion)
    .map((candidate) => {
      return { track: candidate, kind: (isBassTuning(candidate.staves[0].tuning) ? 'bass' : 'guitar') as ChartBandNote['kind'] };
    });
  // Afinación uniformemente bajada/subida (Do#, Mi♭...): las notas se leen como en la estándar y la
  // diferencia se guarda en `soundOffset` (ver Chart). Afinaciones mixtas (Drop D...): alturas reales.
  // Se mide en las cuerdas que tiene la guitarra de 6 (en el bajo, las 6-3, una octava más abajo).
  const bass = isBassTuning(staff.tuning);
  const stringOf = gameStrings(staff.tuning);
  const openOf = new Map(stringOf.map((string, k) => [string, staff.tuning[k]]));
  const base = bass ? BASS_OCTAVE : 0;
  const offsets = (bass ? BASS_STRINGS : ALL_STRINGS).map((string) => (openOf.get(string) ?? NaN) - STANDARD_TUNING[string - 1] - base);
  const soundOffset = base + (offsets.every((offset) => offset === offsets[0]) ? offsets[0] : 0);
  const openMidi = (string: number) => (openOf.get(string) ?? NaN) - soundOffset;
  // Cuerda del juego de una nota (la cuerda 1 de alphaTab es la más grave).
  const gameString = (note: Note) => stringOf[staff.tuning.length - note.string];
  let nextId = 0;

  for (const lookup of lookups) {
    const masterBar = lookup.masterBar;
    const barStartSec = tickToSec(lookup.start);
    bars.push({ number: masterBar.index + 1, t: barStartSec, end: tickToSec(lookup.end), timeSig: [masterBar.timeSignatureNumerator, masterBar.timeSignatureDenominator] });

    for (let tick = lookup.start; tick < lookup.end - 1; tick += ppq) {
      beats.push({ t: tickToSec(tick), q: tick / ppq, isBarStart: tick === lookup.start });
    }

    const drumBar = drumTrack?.staves[0]?.bars[masterBar.index];
    if (drumTrack && drumBar) {
      for (const voice of drumBar.voices) {
        for (const beat of voice.beats) {
          if (beat.isRest) continue;
          const t = tickToSec(lookup.start + beat.playbackStart);
          const sounds = new Set<DrumSound>();
          for (const note of beat.notes) {
            const midi = percussionMidi(drumTrack, note);
            if (midi !== undefined) sounds.add(drumSound(midi));
          }
          for (const sound of sounds) drums.push({ t, sound });
        }
      }
    }

    for (const { track: bandTrack, kind } of bandTracks) {
      const bandBar = bandTrack.staves[0].bars[masterBar.index];
      if (!bandBar) continue;
      for (const voice of bandBar.voices) {
        for (const beat of voice.beats) {
          if (beat.isRest) continue;
          const startTick = lookup.start + beat.playbackStart;
          const t = tickToSec(startTick);
          for (const note of beat.notes) {
            if (note.isDead || note.isTieDestination) continue;
            let durTicks = beat.playbackDuration;
            for (let tied: Note | null = note.tieDestination; tied; tied = tied.tieDestination) durTicks += tied.beat.playbackDuration;
            const dur = tickToSec(startTick + durTicks) - t;
            const bend = chainBend(note, durTicks, dur);
            band.push({ t, dur, midi: note.realValue, kind, palmMute: beat.isPalmMute, track: bandTrack.index, voice: `${bandTrack.index}/${note.string}`, ...(bend ? { bend } : {}) });
          }
        }
      }
    }

    const bar = staff.bars[masterBar.index];
    if (!bar) continue;
    for (const voice of bar.voices) {
      for (const beat of voice.beats) {
        if (beat.isRest || beat.notes.length === 0) continue;
        const startTick = lookup.start + beat.playbackStart;
        const playable = beat.notes.filter((note) => !note.isDead && !note.isTieDestination && gameString(note) !== undefined);
        // Las notas que se salen del mástil (traste > maxFret) se recolocan después, por PASAJES
        // enteros (relocatePassages, relocate.ts).
        for (const note of playable) {
          const string = gameString(note);
          const fret = note.fret;
          let durTicks = beat.playbackDuration;
          let tied: Note | null = note.tieDestination;
          while (tied) {
            durTicks += tied.beat.playbackDuration;
            tied = tied.tieDestination;
          }
          const tech: ChartTech[] = [];
          if (note.isHammerPullDestination && note.hammerPullOrigin) {
            tech.push(note.fret >= note.hammerPullOrigin.fret ? 'hammer' : 'pull');
          }
          if (note.slideOutType !== at.model.SlideOutType.None) tech.push('slide');
          if (note.hasBend) tech.push('bend');
          const t = tickToSec(startTick);
          const dur = tickToSec(startTick + durTicks) - t;
          const bend = chainBend(note, durTicks, dur);
          notes.push({
            id: nextId++,
            t,
            dur,
            string,
            fret,
            midi: openMidi(string) + fret,
            palmMute: beat.isPalmMute,
            tech,
            ...(bend ? { bend } : {}),
          });
        }
      }
    }
  }

  notes.sort((a, b) => a.t - b.t || a.string - b.string);
  if (fold) foldToStandard(notes, bass);
  const instrument = fold ? (bass ? BASS_STRINGS : ALL_STRINGS) : [...stringOf].reverse();
  const placed = placeAboveMaxFret(notes, bars, beats, maxFret, openMidi, instrument);
  notes.splice(0, notes.length, ...placed.notes);
  drums.sort((a, b) => a.t - b.t);
  band.sort((a, b) => a.t - b.t);
  notes.forEach((note, index) => { note.id = index; });
  const lastBar = bars[bars.length - 1];
  return {
    trackName: track.name,
    bpm: score.tempo,
    duration: lastBar ? lastBar.end : 0,
    notes,
    bars,
    beats,
    drums,
    band,
    bandTracks: [
      ...bandTracks.map(({ track: bandTrack, kind }) => ({ index: bandTrack.index, name: bandTrack.name, kind })),
      ...(drumTrack ? [{ index: drumTrack.index, name: drumTrack.name, kind: 'drums' as const }] : []),
    ].sort((a, b) => a.index - b.index),
    ...(soundOffset ? { soundOffset } : {}),
    ...(bass ? { bass } : {}),
    ...(!fold && instrument.join() !== ALL_STRINGS.join() ? { strings: instrument } : {}),
    movedAboveMaxFret: placed.moved,
    skippedAboveMaxFret: placed.skipped,
  };
}

// Notas por encima de `maxFret` (Experto: el mástil del juego llega al 12): primero los PASAJES
// enteros (relocate.ts: subir de cuerda u octava abajo con la misma digitación); lo poco que quede,
// nota a nota con `relocate()`, como último recurso (en las canciones de la web, nada).
function placeAboveMaxFret(notes: ChartNote[], bars: ChartBar[], beats: ChartBeat[], maxFret: number, openMidi: (string: number) => number, strings: number[]) {
  const out = relocatePassages(notes, bars, beats, maxFret, openMidi, strings).notes;
  const kept: ChartNote[] = [];
  let skipped = 0;
  for (let start = 0; start < out.length;) {
    let end = start;
    while (end < out.length && Math.abs(out[end].t - out[start].t) < 0.005) end++;
    const onset = out.slice(start, end);
    // Cuerdas ya ocupadas en este golpe: un acorde recolocado nunca acaba con dos notas en la misma.
    const used = new Set(onset.filter((note) => note.fret <= maxFret).map((note) => note.string));
    for (const note of onset) {
      if (note.fret <= maxFret) {
        kept.push(note);
        continue;
      }
      const place = relocate(note.midi, note.string, used, openMidi, maxFret, strings);
      if (!place) {
        skipped++;
        continue;
      }
      used.add(place.string);
      kept.push({ ...note, string: place.string, fret: place.fret, midi: openMidi(place.string) + place.fret, moved: place.moved });
    }
    start = end;
  }
  kept.sort((a, b) => a.t - b.t || a.string - b.string);
  return { notes: kept, moved: kept.filter((note) => note.moved).length, skipped };
}

// Nueva posición para una nota que no cabe en el mástil (traste > maxFret), en este orden:
// 1) la MISMA nota en una cuerda más aguda (cuerda 5 -> 4 -> ... -> 1), empezando por la más
//    cercana, que es lo que haría un guitarrista;
// 2) si ni en la cuerda 1 cabe, una octava más grave, en la cuerda más cercana a la original.
// Nunca en una cuerda ya usada en el mismo golpe (`used`).
function relocate(
  midi: number,
  string: number,
  used: Set<number>,
  openMidi: (string: number) => number,
  maxFret: number,
  strings: number[],
): { string: number; fret: number; moved: 'string' | 'octave' } | null {
  const fits = (s: number, m: number) => {
    const fret = m - openMidi(s);
    return fret >= 0 && fret <= maxFret && !used.has(s) ? fret : null;
  };
  for (let s = string - 1; s >= Math.min(...strings); s--) {
    const fret = fits(s, midi);
    if (fret !== null) return { string: s, fret, moved: 'string' };
  }
  const byDistance = [...strings].sort((a, b) => Math.abs(a - string) - Math.abs(b - string) || a - b);
  for (const s of byDistance) {
    const fret = fits(s, midi - 12);
    if (fret !== null) return { string: s, fret, moved: 'octave' };
  }
  return null;
}

// Mapa GM de percusión -> los 3 sonidos que sintetiza playMetronomeClick. Copia deliberada del de
// AlphaTabPlayer.tsx (percussionClickType/resolvePercussionMidi), que no se toca por ser delicado:
// si uno cambia, cambiar el otro.
const KICK_MIDI = new Set([35, 36, 41, 43, 45]);
const SNARE_MIDI = new Set([31, 33, 34, 37, 38, 40, 47, 48, 50]);
const CYMBAL_MIDI = new Set([26, 27, 28, 29, 30, 39, 42, 44, 46, 49, 51, 52, 53, 54, 55, 56, 57, 58, 59]);

function drumSound(midi: number): DrumSound {
  if (KICK_MIDI.has(midi)) return 'kick';
  if (SNARE_MIDI.has(midi)) return 'snare';
  if (CYMBAL_MIDI.has(midi)) return 'cymbal';
  if (midi < 42) return 'kick';
  return midi < 60 ? 'snare' : 'cymbal';
}

function percussionMidi(track: AlphaTab.model.Track, note: Note): number | undefined {
  const index = note.percussionArticulation;
  if (index === undefined || index < 0) return undefined;
  const mapped = track.percussionArticulations?.[index]?.outputMidiNumber;
  return typeof mapped === 'number' ? mapped : index;
}

const scoreCache = new Map<string, Promise<{ at: AlphaTabModule; score: Score }>>();

// Olvida una canción ya leída (una canción del dispositivo, al cambiar a otra: localSongs.ts).
export function forgetScore(url: string) {
  scoreCache.delete(url);
}

// ¿Se puede jugar? Se carga y tiene al menos una guitarra de 6 cuerdas.
export async function isPlayableScore(url: string): Promise<boolean> {
  try {
    const { score } = await loadScore(url);
    return listPlayableTracks(score).length > 0;
  } catch {
    return false;
  }
}

export function loadScore(url: string) {
  let cached = scoreCache.get(url);
  if (!cached) {
    cached = (async () => {
      const at = await import('@coderline/alphatab');
      const response = await fetch(url);
      if (!response.ok) throw new Error(`No se pudo cargar ${url}`);
      const data = new Uint8Array(await response.arrayBuffer());
      return { at, score: at.importer.ScoreLoader.loadScoreFromBytes(data, new at.Settings()) };
    })();
    cached.catch(() => scoreCache.delete(url));
    scoreCache.set(url, cached);
  }
  return cached;
}
