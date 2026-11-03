import type { Chart, DrumSound } from './chart';

// Batería AUTOMÁTICA para canciones sin batería (petición del usuario, 2026-11-03): los 4 ritmos del
// metrónomo de los instrumentos MIDI (useMetronome.ts), TAL CUAL, elegidos por tramos de 2 compases
// según el tempo y el tipo de compás (reparto decidido por el usuario):
//   binario o ternario a más de 130 negras/min -> negras (solo caja);
//   ternario hasta 130 -> tresillos (bombo + 2 cajas suaves);
//   binario 90-130 -> corcheas (caja / bombo);  binario por debajo de 90 -> semicorcheas
//   (caja, plato, bombo, plato).
// Ternario = compás compuesto (6/8, 9/8, 12/8) o un tramo cuyas notas caen sobre todo en tresillos.
// Un tramo solo cambia de ritmo si el nuevo gana 2 tramos seguidos (sin parpadeos); el patrón empieza
// de nuevo en cada compás; los compases en los que no suena ninguna pista se quedan en silencio, y los
// irregulares (21/32...) solo llevan la caja en el 1. Pura: sin audio ni React.

export type AutoRhythm = 'quarter' | 'eighth' | 'triplet' | 'sixteenth';

export interface AutoDrumHit {
  t: number;
  sound: DrumSound;
  volume: number;
}

const SECTION_BARS = 2;
const FAST_BPM = 130;
const SLOW_BPM = 90;
// Volumen: el de la batería real (0,8) por 0,7, para que acompañe sin tapar.
const AUTO_DRUM_GAIN = 0.8 * 0.7;
// Dentro de una negra (960 ticks): tresillo 320/640, semicorchea 240/720, corchea 480.
const TICKS = 960;
const TICK_TOLERANCE = 12;

const STEP: Record<AutoRhythm, number> = { quarter: 1, eighth: 0.5, triplet: 1 / 3, sixteenth: 0.25 };

// Golpe `idx` (desde el inicio del compás) de cada patrón, igual que en useMetronome.ts.
function patternHit(rhythm: AutoRhythm, idx: number): { sound: DrumSound; accent: number } {
  if (rhythm === 'eighth') return { sound: idx % 2 === 0 ? 'snare' : 'kick', accent: 1 };
  if (rhythm === 'triplet') return idx % 3 === 0 ? { sound: 'kick', accent: 1 } : { sound: 'snare', accent: 0.6 };
  if (rhythm === 'sixteenth') {
    const pos = idx % 4;
    if (pos === 1 || pos === 3) return { sound: 'cymbal', accent: 0.3 };
    return { sound: pos === 2 ? 'kick' : 'snare', accent: 1 };
  }
  return { sound: 'snare', accent: 1 };
}

const isCompound = (timeSig?: [number, number]) => !!timeSig && timeSig[1] === 8 && [6, 9, 12].includes(timeSig[0]);

// Posición en negras <-> segundos, por las líneas de pulso (siguen los cambios de tempo).
function makeClock(chart: Pick<Chart, 'beats' | 'bpm'>) {
  const beats = chart.beats;
  const fallback = 60 / chart.bpm;
  const segment = (i: number) => {
    const a = beats[i + 1] ? i : i - 1;
    if (a < 0 || !beats[a + 1]) return fallback;
    return (beats[a + 1].t - beats[a].t) / Math.max(1e-6, beats[a + 1].q - beats[a].q);
  };
  const indexBy = (key: 't' | 'q', value: number) => {
    let lo = 0;
    let hi = beats.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (beats[mid][key] <= value + 1e-6) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  return {
    q(t: number) {
      if (beats.length === 0) return t / fallback;
      const i = indexBy('t', t);
      return beats[i].q + (t - beats[i].t) / segment(i);
    },
    t(q: number) {
      if (beats.length === 0) return q * fallback;
      const i = indexBy('q', q);
      return beats[i].t + (q - beats[i].q) * segment(i);
    },
  };
}

interface BarInfo {
  t: number;
  end: number;
  q0: number;
  lengthQ: number;
  bpm: number;
  compound: boolean;
  sounding: boolean;
  onsetsQ: number[];
}

function barInfos(chart: Chart): BarInfo[] {
  const clock = makeClock(chart);
  const infos: BarInfo[] = chart.bars.map((bar) => {
    const q0 = clock.q(bar.t);
    const lengthQ = clock.q(bar.end) - q0;
    return {
      t: bar.t,
      end: bar.end,
      q0,
      lengthQ,
      bpm: lengthQ > 0 ? (60 * lengthQ) / (bar.end - bar.t) : chart.bpm,
      compound: isCompound(bar.timeSig),
      sounding: false,
      onsetsQ: [],
    };
  });
  const barAt = (t: number) => {
    let lo = 0;
    let hi = infos.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (infos[mid].t <= t + 1e-6) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const notes = [...(chart.sourceNotes ?? chart.notes), ...(chart.band ?? [])];
  for (const note of notes) {
    if (infos.length === 0) break;
    const first = barAt(note.t);
    infos[first].onsetsQ.push(clock.q(note.t));
    // Suena en todos los compases que toca, de su inicio a su final.
    for (let i = first; i < infos.length && infos[i].t < note.t + note.dur - 1e-6; i++) infos[i].sounding = true;
  }
  return infos;
}

// Ritmo de un tramo (unos compases seguidos), con la tabla del usuario.
function sectionRhythm(bars: BarInfo[]): AutoRhythm {
  const bpm = bars.reduce((sum, bar) => sum + bar.bpm, 0) / Math.max(1, bars.length);
  let triplet = 0;
  let binary = 0;
  for (const bar of bars) {
    for (const q of bar.onsetsQ) {
      const ticks = Math.round((((q % 1) + 1) % 1) * TICKS);
      const near = (target: number) => Math.abs(ticks - target) <= TICK_TOLERANCE;
      if (near(320) || near(640)) triplet++;
      else if (near(240) || near(720) || near(480)) binary++;
    }
  }
  const ternary = bars.some((bar) => bar.compound) || (triplet >= 3 && triplet >= 2 * binary);
  if (bpm > FAST_BPM) return 'quarter';
  if (ternary) return 'triplet';
  return bpm >= SLOW_BPM ? 'eighth' : 'sixteenth';
}

// Ritmo de cada compás (null = en silencio). Exportado para los tests y para revisar canciones.
export function autoDrumPlan(chart: Chart): Array<AutoRhythm | null> {
  const bars = barInfos(chart);
  const sections: AutoRhythm[] = [];
  for (let i = 0; i < bars.length; i += SECTION_BARS) sections.push(sectionRhythm(bars.slice(i, i + SECTION_BARS)));
  // Sin parpadeos: se cambia solo si el ritmo nuevo gana dos tramos seguidos (y entonces desde el
  // primero de los dos, que es donde cambia la música).
  const chosen: AutoRhythm[] = [];
  let current = sections[0];
  for (let k = 0; k < sections.length; k++) {
    if (sections[k] !== current && sections[k + 1] === sections[k]) current = sections[k];
    chosen.push(current);
  }
  return bars.map((bar, i) => (bar.sounding ? chosen[Math.floor(i / SECTION_BARS)] ?? null : null));
}

export function autoDrums(chart: Chart): AutoDrumHit[] {
  const clock = makeClock(chart);
  const bars = barInfos(chart);
  const plan = autoDrumPlan(chart);
  const hits: AutoDrumHit[] = [];
  bars.forEach((bar, i) => {
    const rhythm = plan[i];
    if (!rhythm) return;
    const eighths = bar.lengthQ * 2;
    // Compás irregular (21/32...) o diminuto: solo la caja en el 1.
    if (Math.abs(eighths - Math.round(eighths)) > 0.02 || eighths < 2.98) {
      hits.push({ t: bar.t, sound: 'snare', volume: AUTO_DRUM_GAIN });
      return;
    }
    // En compás compuesto los tresillos van sobre sus corcheas reales (bombo en cada negra con puntillo).
    const step = rhythm === 'triplet' && bar.compound ? 0.5 : STEP[rhythm];
    const count = Math.round(bar.lengthQ / step);
    for (let idx = 0; idx < count; idx++) {
      const { sound, accent } = patternHit(rhythm, idx);
      hits.push({ t: clock.t(bar.q0 + idx * step), sound, volume: AUTO_DRUM_GAIN * accent });
    }
  });
  return hits;
}
