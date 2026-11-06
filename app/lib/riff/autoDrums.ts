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
//
// Progresión (2026-11-05, diseño con el agente de música): cada ritmo tiene una escalera de variaciones
// (`barHits`), y sube un escalón donde CAMBIA EL RIFF (`riffStarts`), para que dos riffs distintos
// seguidos no lleven la misma batería; un riff que vuelve recupera su escalón. Si un riff dura mucho,
// sube cada 16 compases. Los escalones solo añaden platos, salvo los que usan otro ritmo.

export type AutoRhythm = 'blast' | 'skank' | 'eighth' | 'triplet' | 'sixteenth';

// Lo que suena de verdad en un compás: el ritmo del tramo o una variación de su escalera.
type DrumPattern = AutoRhythm | 'doubleKick' | 'gallop';

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
// Doble bombo: el doble de bombos que el blast, así que más suaves; la caja de los tiempos 2 y 4 manda.
const DOUBLE_KICK_ACCENT = 0.5;
// Rejilla para juntar ataques simultáneos: 24 por negra (caben exactas fusas y tresillos; con 12, una
// fusa se redondeaba a posición de tresillo).
const ONSET_GRID = 24;
// Volumen: el de la batería real (0,8) por 0,7, para que acompañe sin tapar.
const AUTO_DRUM_GAIN = 0.8 * 0.7;
// Dentro de una negra (960 ticks): tresillo 320/640, semicorchea 240/720, corchea 480.
const TICKS = 960;
const TICK_TOLERANCE = 12;

// Plato suave de las variaciones, más fuerte en `sixteenth`, y el golpe que marca un cambio de escalón.
const CYMBAL_ACCENT = 0.3;
const STRONG_CYMBAL_ACCENT = 0.45;
const CHANGE_CYMBAL_ACCENT = 1;
// Por encima, las semicorcheas del último escalón del skank pasarían de 12 golpes por segundo.
const SKANK_SIXTEENTHS_MAX_BPM = 180;
// Detección de riffs: dos compases son del mismo riff si comparten el 60 % de su huella, mirando como
// mucho 8 compases atrás. Un escalón dura al menos 4 compases, y un riff sin cambios sube cada 16.
const RIFF_SIMILARITY = 0.6;
const RIFF_MEMORY_BARS = 8;
const MIN_STEP_BARS = 4;
const LONG_RIFF_BARS = 16;
// Compases en silencio seguidos que cierran un tramo.
const TRAMO_SILENCE_BARS = 2;

const STEP: Record<DrumPattern, number> = { blast: 0.25, skank: 0.5, eighth: 0.5, triplet: 1 / 3, sixteenth: 0.25, doubleKick: 0.25, gallop: 0.25 };
const LADDER_STEPS: Record<AutoRhythm, number> = { blast: 4, skank: 4, eighth: 3, sixteenth: 2, triplet: 2 };

// Golpe `idx` (desde el inicio del compás) de cada patrón.
function patternHit(rhythm: DrumPattern, idx: number): { sound: DrumSound; accent: number } | null {
  // Caja en los tiempos 2 y 4 (negras impares contando desde 0).
  const backbeat = idx % 8 === 4;
  // Doble bombo: semicorcheas de bombo seguidas.
  if (rhythm === 'doubleKick') return backbeat ? { sound: 'snare', accent: 1 } : { sound: 'kick', accent: DOUBLE_KICK_ACCENT };
  // Galope: por negra, corchea y dos semicorcheas de bombo.
  if (rhythm === 'gallop') {
    if (backbeat) return { sound: 'snare', accent: 1 };
    return idx % 4 === 1 ? null : { sound: 'kick', accent: DOUBLE_KICK_ACCENT };
  }
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

type PrintedBar = Set<string>;

// Huella de cada compás: qué notas suenan y dónde, con todas las pistas menos la batería.
function barPrints(chart: Chart): PrintedBar[] {
  const prints: PrintedBar[] = chart.bars.map(() => new Set());
  const notes = [...(chart.sourceNotes ?? chart.notes), ...(chart.band ?? [])].sort((a, b) => a.t - b.t);
  let index = 0;
  for (const note of notes) {
    while (index + 1 < chart.bars.length && chart.bars[index + 1].t <= note.t + 1e-6) index++;
    const bar = chart.bars[index];
    if (bar) prints[index].add(`${Math.round(((note.t - bar.t) / (bar.end - bar.t)) * 48)}:${note.midi}`);
  }
  return prints;
}

function sameRiff(a: PrintedBar, b: PrintedBar) {
  if (a.size === 0 && b.size === 0) return true;
  let shared = 0;
  for (const value of a) if (b.has(value)) shared++;
  return shared / (a.size + b.size - shared) >= RIFF_SIMILARITY;
}

// Dónde empieza cada riff (índices de compás) y qué riff es: la misma etiqueta si vuelve uno anterior.
// Empieza uno cuando el riff actual ya se ha repetido, dura 4 compases o más, y este compás y el
// siguiente no se parecen a él: un compás suelto distinto no cuenta, y un riff de varios compases
// diferentes entre sí sigue siendo el mismo al repetirse.
export function riffStarts(chart: Chart): { starts: number[]; labels: number[] } {
  const prints = barPrints(chart);
  const starts = [0];
  let repeated = false;
  for (let i = 1; i < prints.length; i++) {
    const current = starts[starts.length - 1];
    const from = Math.max(current, i - RIFF_MEMORY_BARS);
    const known = (print: PrintedBar) => prints.slice(from, i).some((other) => sameRiff(print, other));
    if (known(prints[i])) repeated = true;
    else if (repeated && i - current >= MIN_STEP_BARS && (i + 1 >= prints.length || !known(prints[i + 1]))) {
      starts.push(i);
      repeated = false;
    }
  }
  const labels: number[] = [];
  let distinct = 0;
  starts.forEach((start, k) => {
    let label = -1;
    for (let earlier = 0; earlier < k && label < 0; earlier++) {
      for (let bar = starts[earlier]; bar < starts[earlier + 1] && label < 0; bar++) {
        if (sameRiff(prints[start], prints[bar])) label = labels[earlier];
      }
    }
    labels.push(label < 0 ? distinct++ : label);
  });
  return { starts, labels };
}

// Escalón de cada compás y en qué compases cambia.
export function autoDrumSteps(chart: Chart): { steps: number[]; changes: Set<number> } {
  const plan = autoDrumPlan(chart);
  const { starts, labels } = riffStarts(chart);
  const steps = plan.map(() => 0);
  const changes = new Set<number>();
  const labelAt = (bar: number) => {
    let k = 0;
    while (k + 1 < starts.length && starts[k + 1] <= bar) k++;
    return labels[k];
  };
  const remembered = new Map<string, number>();
  const stepOf = (rhythm: AutoRhythm, bar: number) => `${rhythm}:${labelAt(bar)}`;

  let first = 0;
  while (first < plan.length) {
    const rhythm = plan[first];
    if (!rhythm) {
      first++;
      continue;
    }
    // Tramo: el mismo ritmo, sin contar un compás en silencio suelto.
    let last = first;
    for (let bar = first + 1, silent = 0; bar < plan.length && silent < TRAMO_SILENCE_BARS; bar++) {
      if (plan[bar] === rhythm) {
        last = bar;
        silent = 0;
      } else if (plan[bar]) break;
      else silent++;
    }
    // Se cambia donde empieza OTRO riff y, si no llega ninguno, cada 16 compases; siempre con 4
    // compases de margen desde el cambio anterior y hasta el siguiente o el final del tramo.
    const riffAt = new Map(starts.map((bar, k) => [bar, k]));
    const nextRiff = (bar: number) => starts.find((start) => start > bar && start <= last) ?? last + 1;
    const ladder = LADDER_STEPS[rhythm];
    let step = remembered.get(stepOf(rhythm, first)) ?? 0;
    remembered.set(stepOf(rhythm, first), step);
    let from = first;
    for (let bar = first + 1; bar <= last; bar++) {
      const k = riffAt.get(bar);
      const newRiff = k !== undefined && labels[k] !== labels[k - 1];
      if (!newRiff && bar - from < LONG_RIFF_BARS) continue;
      if (bar - from < MIN_STEP_BARS || nextRiff(bar) - bar < MIN_STEP_BARS) continue;
      const known = newRiff ? remembered.get(stepOf(rhythm, bar)) : undefined;
      const next = known !== undefined && known !== step ? known : (step + 1) % ladder;
      steps.fill(step, from, bar);
      from = bar;
      step = next;
      changes.add(bar);
      if (newRiff && known === undefined) remembered.set(stepOf(rhythm, bar), step);
    }
    steps.fill(step, from, last + 1);
    first = last + 1;
  }
  return { steps, changes };
}

interface BarHit {
  q: number;
  sound: DrumSound;
  accent: number;
}

// Golpes de un compás con su escalón, en negras desde su inicio.
function barHits(rhythm: AutoRhythm, step: number, bar: BarInfo): BarHit[] {
  // 7/8 y parecidos: no se sabe cómo se agrupan, así que solo el ritmo, y plato en el 1 si lo lleva.
  const wholeQuarters = Math.abs(bar.lengthQ - Math.round(bar.lengthQ)) < 0.02;
  const level = wholeQuarters ? step : 0;
  let base: DrumPattern = rhythm;
  let cymbals: 'none' | 'quarters' | 'kicks' | 'all' = 'none';
  let fill = false;
  if (rhythm === 'blast') {
    if (level === 1) base = 'doubleKick';
    if (level === 3) base = 'skank';
    cymbals = level === 2 ? 'kicks' : 'quarters';
  } else if (rhythm === 'skank') {
    if (level === 1) cymbals = 'quarters';
    if (level === 2) base = 'gallop';
    if (level === 3) {
      if (bar.bpm <= SKANK_SIXTEENTHS_MAX_BPM) fill = true;
      else cymbals = 'all';
    }
  } else if (rhythm === 'eighth') {
    if (level === 1) cymbals = 'quarters';
    if (level === 2) base = 'sixteenth';
  } else if (rhythm === 'triplet') {
    if (level === 1) cymbals = 'kicks';
  }

  // En compás compuesto los tresillos van sobre sus corcheas reales (bombo en cada negra con puntillo).
  const stepQ = base === 'triplet' && bar.compound ? 0.5 : STEP[base];
  const count = Math.round(bar.lengthQ / stepQ);
  const hits: BarHit[] = [];
  for (let idx = 0; idx < count; idx++) {
    const hit = patternHit(base, idx);
    if (!hit) continue;
    const accent = rhythm === 'sixteenth' && level === 1 && hit.sound === 'cymbal' ? STRONG_CYMBAL_ACCENT : hit.accent;
    hits.push({ q: idx * stepQ, sound: hit.sound, accent });
  }
  if (!wholeQuarters) {
    if (rhythm === 'blast' || step > 0) hits.push({ q: 0, sound: 'cymbal', accent: CYMBAL_ACCENT });
    return hits;
  }
  // Último escalón del skank: bombo, plato, caja, plato, con el bombo aún en el pulso.
  if (fill) {
    for (let q = 0.25; q < bar.lengthQ; q += 0.5) hits.push({ q, sound: 'cymbal', accent: CYMBAL_ACCENT });
  }
  const onQuarter = (q: number) => Math.abs(q - Math.round(q)) < 1e-6;
  for (const hit of [...hits]) {
    if (hit.sound === 'cymbal') continue;
    const wanted = cymbals === 'all' || (cymbals === 'kicks' && hit.sound === 'kick') || (cymbals === 'quarters' && onQuarter(hit.q));
    if (wanted) hits.push({ q: hit.q, sound: 'cymbal', accent: CYMBAL_ACCENT });
  }
  return hits;
}

export function autoDrums(chart: Chart): AutoDrumHit[] {
  const clock = makeClock(chart);
  const bars = barInfos(chart);
  const plan = autoDrumPlan(chart);
  const { steps, changes } = autoDrumSteps(chart);
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
    const barList = barHits(rhythm, steps[i], bar);
    // Cambio de escalón: un plato fuerte en el primer golpe marca la frase nueva.
    if (changes.has(i)) {
      const first = barList.find((hit) => hit.q === 0 && hit.sound === 'cymbal');
      if (first) first.accent = CHANGE_CYMBAL_ACCENT;
      else barList.push({ q: 0, sound: 'cymbal', accent: CHANGE_CYMBAL_ACCENT });
    }
    for (const { q, sound, accent } of barList) hits.push({ t: clock.t(bar.q0 + q), sound, volume: AUTO_DRUM_GAIN * accent });
  });
  return hits.sort((a, b) => a.t - b.t);
}
