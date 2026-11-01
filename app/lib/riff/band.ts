import type { Chart, ChartBandNote } from './chart';
import { makeBeatPosition } from './reduce';

// Bajo de la banda SIN la misma nota repetida en semicorcheas (regla del usuario, 2026-11-01): el
// bajo sintetizado no articula bien esas ráfagas y se vuelven un borrón que tapa la canción. Cuando
// el bajo repite la MISMA nota a menos de media negra y a menos de `BASS_REPEAT_MIN_SECONDS` reales
// (a la velocidad de juego: con tempos lentos o al 50 % no se quita nada), en esa racha solo quedan
// la primera nota y las que caen en la rejilla de corcheas; la nota que queda se alarga hasta la
// siguiente que queda (salvo palm mute, que sigue corta). Un cambio de nota nunca se toca: las
// melodías quedan enteras. Las guitarras y la batería no se tocan. Pura (no cambia el chart).
export const BASS_REPEAT_MIN_SECONDS = 0.2;
const EIGHTH_TOLERANCE_QUARTERS = 0.03;

export function thinRepeatedBass(notes: ChartBandNote[], chart: Pick<Chart, 'beats' | 'bpm'>, speed: number): ChartBandNote[] {
  const { pos } = makeBeatPosition(chart as Chart);
  const out: ChartBandNote[] = [];
  // Por pista de bajo (la voz es "pista/cuerda"): nota anterior y última que se quedó.
  const previous = new Map<string, ChartBandNote>();
  const lastKept = new Map<string, ChartBandNote>();
  for (const note of notes) {
    if (note.kind !== 'bass') {
      out.push(note);
      continue;
    }
    const track = note.voice?.split('/')[0] ?? 'bajo';
    const prev = previous.get(track);
    previous.set(track, note);
    const repeat = !!prev && prev.midi === note.midi
      && pos(note.t) - pos(prev.t) < 0.5 - EIGHTH_TOLERANCE_QUARTERS
      && (note.t - prev.t) / speed < BASS_REPEAT_MIN_SECONDS;
    const twice = pos(note.t) * 2;
    const onEighth = Math.abs(twice - Math.round(twice)) <= EIGHTH_TOLERANCE_QUARTERS * 2;
    if (repeat && !onEighth) {
      const kept = lastKept.get(track);
      if (kept && !kept.palmMute) kept.dur = Math.max(kept.dur, note.t + note.dur - kept.t);
      continue;
    }
    const copy = { ...note };
    out.push(copy);
    lastKept.set(track, copy);
  }
  return out;
}
