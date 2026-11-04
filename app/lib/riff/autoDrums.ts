import type { Chart, DrumSound } from './chart';

// Batería AUTOMÁTICA (petición del usuario, 2026-11-03; desde el 2026-11-04 también en canciones con
// batería, para cambiar la real por esta silenciándola en "Pistas"): ritmos elegidos por tramos de 2
// compases. Corcheas, semicorcheas y tresillos son los del metrónomo de los instrumentos MIDI
// (useMetronome.ts); blast y skank existen solo aquí. Sin negras de caja: para eso está el metrónomo.
// Regla (2026-11-04): d = ataques DISTINTOS por negra del tramo, de todas las pistas.
//   binario por encima de 140: blast si d >= 2,25 (semicorcheas bombo/caja, la caja en cada corchea);
//     si no, skank (corcheas con el bombo en el pulso y la caja a contratiempo, el ritmo thrash);
//   binario 100-140: corcheas;
//   binario por debajo de 100: semicorcheas si d >= 2,25; si no, corcheas;
//   ternario: tresillos, a cualquier tempo.
// Ternario = compás compuesto (6/8, 9/8, 12/8) o un tramo cuyas notas caen sobre todo en tresillos.
// Un tramo solo cambia de ritmo si el nuevo gana 2 tramos seguidos (sin parpadeos), salvo si el tempo
// salta a otra franja (menos de 100, 100-140, más de 140): entonces cambia ahí mismo. El patrón empieza
// de nuevo en cada compás; los compases en los que no suena ninguna pista se quedan en silencio, y los
// irregulares (21/32...) solo llevan la caja en el 1. Pura: sin audio ni React.

export type AutoRhythm = 'blast' | 'skank' | 'eighth' | 'triplet' | 'sixteenth';

export interface AutoDrumHit {
  t: number;
  sound: DrumSound;
  volume: number;
}

const SECTION_BARS = 2;
const FAST_BPM = 140;
const SLOW_BPM = 100;
// Ataques distintos por negra desde los que la música va más rápida que las corcheas.
const DENSE_DENSITY = 2.25;
// El blast suena el doble de golpes que las corcheas: -3 dB para que no tape la guitarra.
const BLAST_ACCENT = 0.7;
// Rejilla para juntar ataques simultáneos: 12 por negra (caben semicorcheas y tresillos).
const ONSET_GRID = 12;
// Volumen: el de la batería real (0,8) por 0,7, para que acompañe sin tapar.
const AUTO_DRUM_GAIN = 0.8 * 0.7;
// Dentro de una negra (960 ticks): tresillo 320/640, semicorchea 240/720, corchea 480.
const TICKS = 960;
const TICK_TOLERANCE = 12;

const STEP: Record<AutoRhythm, number> = { blast: 0.25, skank: 0.5, eighth: 0.5, triplet: 1 / 3, sixteenth: 0.25 };

// Golpe `idx` (desde el inicio del compás) de cada patrón.
function patternHit(rhythm: AutoRhythm, idx: number): { sound: DrumSound; accent: number } {
  // El blast tradicional lo lidera el bombo, y así no salta de sitio al pasar del skank al blast.
  if (rhythm === 'blast') return { sound: idx % 2 === 0 ? 'kick' : 'snare', accent: BLAST_ACCENT };
  if (rhythm === 'skank') return { sound: idx % 2 === 0 ? 'kick' : 'snare', accent: 1 };
  if (rhythm === 'eighth') return { sound: idx % 2 === 0 ? 'snare' : 'kick', accent: 1 };
  if (rhythm === 'triplet') return idx % 3 === 0 ? { sound: 'kick', accent: 1 } : { sound: 'snare', accent: 0.6 };
  const pos = idx % 4;
  if (pos === 1 || pos === 3) return { sound: 'cymbal', accent: 0.3 };
  return { sound: pos === 2 ? 'kick' : 'snare', accent: 1 };
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
  // Un compás de batería sola también suena: si la automática sustituye a la real, no se queda mudo.
  for (const hit of chart.drums) if (infos.length > 0) infos[barAt(hit.t)].sounding = true;
  return infos;
}

const sectionBpm = (bars: BarInfo[]) => Math.round(bars.reduce((sum, bar) => sum + bar.bpm, 0) / Math.max(1, bars.length));
const tempoBand = (bpm: number) => (bpm > FAST_BPM ? 2 : bpm >= SLOW_BPM ? 1 : 0);
const isFastRhythm = (rhythm?: AutoRhythm) => rhythm === 'blast' || rhythm === 'skank';

// Ritmo de un tramo (unos compases seguidos).
function sectionRhythm(bars: BarInfo[]): AutoRhythm {
  const bpm = sectionBpm(bars);
  // Un acorde, o dos pistas al unísono, son un solo ataque.
  const onsets = new Set(bars.flatMap((bar) => bar.onsetsQ.map((q) => Math.round(q * ONSET_GRID))));
  let triplet = 0;
  let binary = 0;
  for (const onset of onsets) {
    const ticks = ((((onset / ONSET_GRID) % 1) + 1) % 1) * TICKS;
    const near = (target: number) => Math.abs(ticks - target) <= TICK_TOLERANCE;
    if (near(320) || near(640)) triplet++;
    else if (near(240) || near(720) || near(480)) binary++;
  }
  if (bars.some((bar) => bar.compound) || (triplet >= 3 && triplet >= 2 * binary)) return 'triplet';
  const soundingQuarters = bars.reduce((sum, bar) => sum + (bar.sounding ? bar.lengthQ : 0), 0);
  const dense = soundingQuarters > 0 && onsets.size / soundingQuarters >= DENSE_DENSITY;
  if (bpm > FAST_BPM) return dense ? 'blast' : 'skank';
  if (bpm >= SLOW_BPM) return 'eighth';
  return dense ? 'sixteenth' : 'eighth';
}

// Ritmo de cada compás (null = en silencio). Exportado para los tests y para revisar canciones.
export function autoDrumPlan(chart: Chart): Array<AutoRhythm | null> {
  const bars = barInfos(chart);
  const sections: AutoRhythm[] = [];
  const bands: number[] = [];
  for (let i = 0; i < bars.length; i += SECTION_BARS) {
    const section = bars.slice(i, i + SECTION_BARS);
    sections.push(sectionRhythm(section));
    bands.push(tempoBand(sectionBpm(section)));
  }
  // Sin parpadeos: se cambia solo si el ritmo nuevo gana dos tramos seguidos (y entonces desde el
  // primero de los dos, que es donde cambia la música). Un salto de franja de tempo cambia enseguida;
  // si el tramo siguiente duda entre blast y skank, skank, que llena menos.
  const chosen: AutoRhythm[] = [];
  let current = sections[0];
  for (let k = 0; k < sections.length; k++) {
    const next = sections[k + 1];
    if (k > 0 && bands[k] !== bands[k - 1]) {
      current = isFastRhythm(sections[k]) && isFastRhythm(next) && next !== sections[k] ? 'skank' : sections[k];
    } else if (sections[k] !== current && next === sections[k]) {
      current = sections[k];
    }
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
