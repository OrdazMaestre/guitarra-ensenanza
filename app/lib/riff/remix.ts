// "Remix": una canción NUEVA fabricada nota a nota con tramos de otros charts (ya traducidos a su
// nivel), uno detrás de otro, para que se juegue y se vea como una sola canción de principio a fin
// (la partida tutorial de mecánicas, ver riffTutorial.ts). Es pura (sin audio ni React).
//
// Cada tramo (compases `fromBar`..`toBar` de su chart) se copia `repeats` veces seguidas, con sus
// notas traducidas, sus notas reales de fondo (`sourceNotes`, con los `sourceIds` renumerados),
// sus pulsos y su batería, todo desplazado en el tiempo. Entre un tramo y el siguiente va un compás
// de SILENCIO (4 negras): ahí se para la partida (`breaks`) para explicar la parte siguiente, y al
// seguir sirve de cuenta de entrada. Los compases se renumeran 1, 2, 3...

import type { Chart, ChartBar, ChartBeat, ChartDrumHit, ChartNote } from './chart';

export interface RemixSection {
  chart: Chart;
  fromBar: number;
  toBar: number;
  repeats: number;
}

export interface Remix {
  chart: Chart;
  // Instante de canción en el que empieza cada compás de silencio (uno antes de cada tramo menos el
  // primero): `breaks[k]` va justo antes del tramo k + 1.
  breaks: number[];
}

export const REMIX_GAP_QUARTERS = 4;
const EPS = 1e-6;

// Primera tanda seguida de compases from..to tal como suena (con repeticiones en la partitura, un
// número puede salir varias veces: se toma la primera).
function barRun(chart: Chart, fromBar: number, toBar: number): ChartBar[] {
  const start = chart.bars.findIndex((bar) => bar.number === fromBar);
  if (start < 0) throw new Error(`El compás ${fromBar} no existe`);
  const run: ChartBar[] = [];
  for (let i = start; i < chart.bars.length; i++) {
    run.push(chart.bars[i]);
    if (chart.bars[i].number === toBar) return run;
  }
  throw new Error(`El compás ${toBar} no llega después del ${fromBar}`);
}

// Posición en negras de un instante (por las líneas de pulso del chart).
function quarterAt(chart: Chart, t: number): number {
  const beats = chart.beats;
  const exact = beats.find((beat) => Math.abs(beat.t - t) < 1e-4);
  if (exact) return exact.q;
  const before = [...beats].reverse().find((beat) => beat.t <= t);
  const quarter = 60 / chart.bpm;
  return before ? before.q + (t - before.t) / quarter : t / quarter;
}

export function buildRemix(sections: RemixSection[]): Remix {
  if (sections.length === 0) throw new Error('Un remix necesita al menos un tramo');
  const bpm = sections[0].chart.bpm;
  const quarter = 60 / bpm;
  const notes: ChartNote[] = [];
  const sourceNotes: ChartNote[] = [];
  const bars: ChartBar[] = [];
  const beats: ChartBeat[] = [];
  const drums: ChartDrumHit[] = [];
  const breaks: number[] = [];
  let cursorT = 0;
  let cursorQ = 0;
  let barNumber = 1;

  sections.forEach((section, index) => {
    if (index > 0) {
      // Compás de silencio entre tramos.
      breaks.push(cursorT);
      bars.push({ number: barNumber++, t: cursorT, end: cursorT + REMIX_GAP_QUARTERS * quarter });
      for (let i = 0; i < REMIX_GAP_QUARTERS; i++) beats.push({ t: cursorT + i * quarter, q: cursorQ + i, isBarStart: i === 0 });
      cursorT += REMIX_GAP_QUARTERS * quarter;
      cursorQ += REMIX_GAP_QUARTERS;
    }
    const { chart } = section;
    const run = barRun(chart, section.fromBar, section.toBar);
    const segStart = run[0].t;
    const segEnd = run[run.length - 1].end;
    const q0 = quarterAt(chart, segStart);
    const q1 = quarterAt(chart, segEnd);
    const inSeg = (t: number) => t >= segStart - EPS && t < segEnd - EPS;
    const segNotes = chart.notes.filter((note) => inSeg(note.t));
    const segSources = (chart.sourceNotes ?? []).filter((note) => inSeg(note.t));

    for (let r = 0; r < Math.max(1, section.repeats); r++) {
      const dt = cursorT - segStart;
      const dq = cursorQ - q0;
      for (const bar of run) bars.push({ number: barNumber++, t: bar.t + dt, end: bar.end + dt });
      for (const beat of chart.beats) if (inSeg(beat.t)) beats.push({ t: beat.t + dt, q: beat.q + dq, isBarStart: beat.isBarStart });
      for (const hit of chart.drums) if (inSeg(hit.t)) drums.push({ t: hit.t + dt, sound: hit.sound });
      const newSourceId = new Map<number, number>();
      for (const note of segSources) {
        newSourceId.set(note.id, sourceNotes.length);
        sourceNotes.push({ ...note, id: sourceNotes.length, t: note.t + dt, tech: [...note.tech] });
      }
      for (const note of segNotes) {
        notes.push({
          ...note,
          id: notes.length,
          t: note.t + dt,
          tech: [...note.tech],
          sourceIds: note.sourceIds?.map((id) => newSourceId.get(id)).filter((id): id is number => id !== undefined),
        });
      }
      cursorT += segEnd - segStart;
      cursorQ += q1 - q0;
    }
  });

  const translated = sections.every((section) => !!section.chart.sourceNotes);
  return {
    breaks,
    chart: {
      trackName: sections[0].chart.trackName,
      bpm,
      duration: cursorT,
      notes,
      bars,
      beats,
      sourceNotes: translated ? sourceNotes : undefined,
      drums,
      movedAboveMaxFret: 0,
      skippedAboveMaxFret: 0,
    },
  };
}
